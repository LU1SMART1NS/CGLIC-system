-- ==============================================================================
-- MIGRATION 112: O CRON NÃO APAGA VÍNCULO COM TRABALHO DO GESTOR
-- Versão: 20261013000112_vinculo_automatico_protege_trabalho_do_gestor.sql
--
-- Problema (auditoria de 13/10/2026): quando a fonte desmente um vínculo automático (o item saiu do
-- contrato, outro fornecedor, preço fora do limite), executar_vinculos_automaticos apagava o vínculo.
-- A exclusão levava junto, em cascata, a divisão por unidade feita pelo gestor, e a quantidade ajustada
-- (com justificativa) fica na própria linha do vínculo. Ninguém era avisado.
--
-- O que muda
--   1) Vínculo automático SEM trabalho do gestor continua sendo retirado, como antes.
--   2) Vínculo automático COM trabalho do gestor (quantidade ajustada ou divisão do gestor) não é
--      apagado. Fica em vinculo_automatico_a_conferir, com o motivo, e a tela mostra o aviso ao gestor da
--      ata, ao gestor do contrato e ao coordenador.
--   3) A marca sai sozinha quando a fonte volta a confirmar o par. Falta de dado (itens não lidos) não
--      tira a marca, para o aviso não piscar a cada sincronização.
--   4) Só o coordenador decide, com justificativa (mínimo 10 caracteres), e a decisão fica registrada
--      em vinculo_automatico_decisoes:
--        manter_vinculo_a_conferir   o vínculo passa a MANUAL (a automação nunca mais toca nele);
--        retirar_vinculo_a_conferir  apaga o vínculo, guarda o que foi perdido e grava o par em
--                                    arp_item_contract_dismissals (como o Desvincular), para a automação
--                                    não refazê-lo.
--   5) O gestor "resolve" o aviso pelo mecanismo da migration 101 (resolver_aviso, tipo SALDO); isso só
--      esconde o aviso. Não mexe no vínculo.
--   6) v_vinculos_a_conferir: uma linha por marca, com os gestores e quem fez o trabalho.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Marcas e decisões
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vinculo_automatico_a_conferir (
  item_key     VARCHAR(100) NOT NULL,
  contract_key VARCHAR(100) NOT NULL,
  motivo       VARCHAR(40)  NOT NULL,
  detectado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  visto_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, contract_key),
  CONSTRAINT vinculo_automatico_a_conferir_vinculo FOREIGN KEY (item_key, contract_key)
    REFERENCES public.arp_item_contract_links (item_key, contract_key) ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON TABLE public.vinculo_automatico_a_conferir IS
  'Vínculo automático que a fonte desmentiu mas que tem trabalho do gestor (quantidade ajustada ou divisão entre unidades): não é apagado, o coordenador decide (migration 112). motivo: ITEM_SAIU_DO_CONTRATO, o motivo manual da previsão (OUTRO_FORNECEDOR, VALOR_FORA_DO_LIMITE, ITEM_FORA_DA_ATA...) ou NAO_CONFIRMA.';

CREATE TABLE IF NOT EXISTS public.vinculo_automatico_decisoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key          VARCHAR(100) NOT NULL,
  contract_key      VARCHAR(100) NOT NULL,
  decisao           VARCHAR(10)  NOT NULL CHECK (decisao IN ('MANTIDO', 'RETIRADO')),
  motivo            VARCHAR(40),
  justificativa     TEXT         NOT NULL CHECK (char_length(justificativa) BETWEEN 10 AND 500),
  perdido           JSONB,
  decidido_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_por_nome VARCHAR(150),
  decidido_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vinculo_automatico_decisoes_par_idx
  ON public.vinculo_automatico_decisoes (item_key, contract_key, decidido_em DESC);
CREATE INDEX IF NOT EXISTS vinculo_automatico_decisoes_autor_idx
  ON public.vinculo_automatico_decisoes (decidido_por) WHERE decidido_por IS NOT NULL;

COMMENT ON TABLE public.vinculo_automatico_decisoes IS
  'Decisões do coordenador sobre vínculo automático desmentido pela fonte (migration 112). perdido: o que a retirada apagou (quantidade ajustada, justificativa e divisão entre unidades).';

ALTER TABLE public.vinculo_automatico_a_conferir ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculo_automatico_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: vinculo_automatico_a_conferir" ON public.vinculo_automatico_a_conferir;
CREATE POLICY "Authenticated Read: vinculo_automatico_a_conferir"
  ON public.vinculo_automatico_a_conferir FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: vinculo_automatico_decisoes" ON public.vinculo_automatico_decisoes;
CREATE POLICY "Authenticated Read: vinculo_automatico_decisoes"
  ON public.vinculo_automatico_decisoes FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.vinculo_automatico_a_conferir, public.vinculo_automatico_decisoes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vinculo_automatico_a_conferir, public.vinculo_automatico_decisoes FROM authenticated;
GRANT SELECT ON public.vinculo_automatico_a_conferir, public.vinculo_automatico_decisoes TO authenticated;
GRANT ALL ON public.vinculo_automatico_a_conferir, public.vinculo_automatico_decisoes TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_vinculo_automatico_a_conferir ON public.vinculo_automatico_a_conferir;
    CREATE TRIGGER trg_audit_vinculo_automatico_a_conferir
      AFTER INSERT OR DELETE ON public.vinculo_automatico_a_conferir
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) O cron: retira o que não tem trabalho do gestor e marca o que tem
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.executar_vinculos_automaticos(p_contract_key text DEFAULT NULL::text, p_simular boolean DEFAULT false, p_origem text DEFAULT 'SERVIDOR'::text, p_executado_por_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_obs CONSTANT TEXT := 'Vínculo automático: mesma compra, mesmo fornecedor e o item do contrato está nesta ata.';
  v_k TEXT;
  v_n INTEGER;
  v_novos INTEGER := 0;
  v_contratos_novos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_removidos INTEGER := 0;
  v_a_conferir INTEGER := 0;
  v_erros JSONB := '[]'::JSONB;
  v_manuais JSONB;
  v_herdam JSONB;
  v_resumo JSONB;
BEGIN
  -- Uma execução por vez (cron e coordenador ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('executar_vinculos_automaticos'));

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.vinculo_auto_previsto (
    contract_key TEXT, situacao TEXT, motivo TEXT, item_key TEXT, ata_key TEXT, quantidade NUMERIC, valor_unitario NUMERIC
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.vinculo_auto_previsto;
  INSERT INTO pg_temp.vinculo_auto_previsto SELECT * FROM public.prever_vinculos_automaticos(p_contract_key);

  SELECT COALESCE(jsonb_object_agg(motivo, n), '{}'::JSONB) INTO v_manuais
  FROM (SELECT motivo, count(*) AS n FROM pg_temp.vinculo_auto_previsto WHERE situacao = 'MANUAL' GROUP BY motivo) x;

  -- Contratos sem gestor que, com o vínculo novo, passam a ser do gestor da ata (por gestor).
  SELECT COALESCE(jsonb_object_agg(g, n), '{}'::JSONB) INTO v_herdam
  FROM (
    SELECT am.gestor_nome AS g, count(DISTINCT p.contract_key) AS n
    FROM pg_temp.vinculo_auto_previsto p
    JOIN public.ata_managers am ON am.ata_key = public.chave_gestao_ata(p.ata_key)
    WHERE p.situacao = 'AUTOMATICO'
      AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key)
      AND NOT EXISTS (SELECT 1 FROM public.contract_managers cm WHERE cm.contract_key = p.contract_key)
    GROUP BY 1
  ) x;

  -- a) Vínculos novos, contrato por contrato (o erro de um não para os outros)
  FOR v_k IN
    SELECT DISTINCT p.contract_key FROM pg_temp.vinculo_auto_previsto p
    WHERE p.situacao = 'AUTOMATICO'
      AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key)
    ORDER BY 1
  LOOP
    IF p_simular THEN
      SELECT count(*) INTO v_n FROM pg_temp.vinculo_auto_previsto p
      WHERE p.contract_key = v_k AND p.situacao = 'AUTOMATICO'
        AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key);
      v_novos := v_novos + v_n;
      v_contratos_novos := v_contratos_novos + 1;
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.arp_item_contract_links (
        item_key, contract_key, observacoes, origem, criado_por,
        quantidade_contratada_api, valor_unitario_api, quantidade_lida_em, created_at, updated_at
      )
      SELECT p.item_key, p.contract_key, v_obs, 'AUTOMATICO', NULL, p.quantidade, p.valor_unitario, NOW(), NOW(), NOW()
      FROM pg_temp.vinculo_auto_previsto p
      WHERE p.contract_key = v_k AND p.situacao = 'AUTOMATICO'
      ORDER BY p.item_key
      ON CONFLICT (item_key, contract_key) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_novos := v_novos + v_n;
      IF v_n > 0 THEN v_contratos_novos := v_contratos_novos + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('contrato', v_k, 'erro', SQLERRM));
    END;
  END LOOP;

  -- b) Quantidade e preço dos automáticos acompanham a fonte
  IF p_simular THEN
    SELECT count(*) INTO v_atualizados
    FROM public.arp_item_contract_links l
    JOIN pg_temp.vinculo_auto_previsto p ON p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
    WHERE l.origem = 'AUTOMATICO'
      AND (l.quantidade_contratada_api IS DISTINCT FROM p.quantidade OR l.valor_unitario_api IS DISTINCT FROM p.valor_unitario);
  ELSE
    UPDATE public.arp_item_contract_links l
       SET quantidade_contratada_api = p.quantidade,
           valor_unitario_api = p.valor_unitario,
           quantidade_lida_em = NOW(),
           updated_at = NOW()
      FROM pg_temp.vinculo_auto_previsto p
     WHERE p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
       AND l.origem = 'AUTOMATICO'
       AND (l.quantidade_contratada_api IS DISTINCT FROM p.quantidade OR l.valor_unitario_api IS DISTINCT FROM p.valor_unitario);
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  END IF;

  -- c) Automático que a fonte desmentiu: o contrato tem itens numerados lidos e o par não se confirma mais.
  --    Falta de dado (itens não lidos ou sem número) nunca retira vínculo.
  --    Vínculo com trabalho do gestor (quantidade ajustada ou divisão entre unidades) NÃO é apagado: apagá-lo
  --    levaria o trabalho junto. Fica marcado em vinculo_automatico_a_conferir (migration 112) para o
  --    coordenador decidir, e o aviso aparece para o gestor da ata e do contrato.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.vinculo_auto_retirar (
    id UUID, item_key TEXT, contract_key TEXT, com_trabalho BOOLEAN, motivo TEXT
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.vinculo_auto_retirar;
  INSERT INTO pg_temp.vinculo_auto_retirar
  SELECT
    l.id,
    l.item_key,
    l.contract_key,
    (l.quantidade_ajustada IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.contrato_item_divisoes d
                  WHERE d.item_key = l.item_key AND d.contract_key = l.contract_key AND d.origem = 'USUARIO')),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.itens_contrato ic
                        WHERE ic.contract_key = l.contract_key
                          AND ic.numero_item = (substring(l.item_key FROM '-([0-9]+)$'))::INTEGER)
        THEN 'ITEM_SAIU_DO_CONTRATO'
      ELSE COALESCE((SELECT m.motivo FROM pg_temp.vinculo_auto_previsto m
                      WHERE m.contract_key = l.contract_key AND m.situacao = 'MANUAL' AND m.motivo IS NOT NULL
                      LIMIT 1), 'NAO_CONFIRMA')
    END
  FROM public.arp_item_contract_links l
  WHERE l.origem = 'AUTOMATICO'
    AND (p_contract_key IS NULL OR l.contract_key = p_contract_key)
    AND EXISTS (SELECT 1 FROM public.contratos_oficiais co WHERE co.contract_key = l.contract_key)
    AND EXISTS (SELECT 1 FROM public.itens_contrato ic WHERE ic.contract_key = l.contract_key AND ic.numero_item IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.itens_contrato ic WHERE ic.contract_key = l.contract_key AND ic.numero_item IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.vinculo_auto_previsto p
      WHERE p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
    );
  SELECT count(*) FILTER (WHERE NOT com_trabalho), count(*) FILTER (WHERE com_trabalho)
    INTO v_removidos, v_a_conferir
    FROM pg_temp.vinculo_auto_retirar;
  IF NOT p_simular THEN
    DELETE FROM public.arp_item_contract_links WHERE id IN (SELECT id FROM pg_temp.vinculo_auto_retirar WHERE NOT com_trabalho);

    INSERT INTO public.vinculo_automatico_a_conferir (item_key, contract_key, motivo, detectado_em, visto_em)
    SELECT r.item_key, r.contract_key, r.motivo, NOW(), NOW()
      FROM pg_temp.vinculo_auto_retirar r
     WHERE r.com_trabalho
    ON CONFLICT (item_key, contract_key) DO UPDATE
      SET motivo = EXCLUDED.motivo, visto_em = NOW();

    -- A marca sai quando a fonte volta a confirmar o par ou quando o vínculo deixa de ser automático.
    -- Falta de dado (itens não lidos) não tira a marca, para o aviso não piscar a cada sincronização.
    DELETE FROM public.vinculo_automatico_a_conferir f
     WHERE (p_contract_key IS NULL OR f.contract_key = p_contract_key)
       AND (
         NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l
                      WHERE l.item_key = f.item_key AND l.contract_key = f.contract_key AND l.origem = 'AUTOMATICO')
         OR EXISTS (SELECT 1 FROM pg_temp.vinculo_auto_previsto p
                     WHERE p.item_key = f.item_key AND p.contract_key = f.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO'))
       );
  END IF;

  v_resumo := jsonb_build_object(
    'simulacao', p_simular,
    'novos', v_novos,
    'contratos_novos', v_contratos_novos,
    'atualizados', v_atualizados,
    'retirados', v_removidos,
    'a_conferir', v_a_conferir,
    'automaticos_total', (SELECT count(*) FROM public.arp_item_contract_links WHERE origem = 'AUTOMATICO'),
    'manuais', v_manuais,
    'herdam_gestor', v_herdam,
    'erros', v_erros
  );

  IF p_contract_key IS NULL THEN
    INSERT INTO public.vinculo_automatico_execucoes (origem, executado_por_nome, simulacao, resumo)
    VALUES (CASE WHEN p_origem IN ('CRON', 'COORDENADOR', 'SERVIDOR') THEN p_origem ELSE 'SERVIDOR' END,
            LEFT(p_executado_por_nome, 150), p_simular, v_resumo);
    DELETE FROM public.vinculo_automatico_execucoes
     WHERE id NOT IN (SELECT id FROM public.vinculo_automatico_execucoes ORDER BY executado_em DESC LIMIT 500);
  END IF;

  RETURN v_resumo;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Leitura
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_vinculos_a_conferir
WITH (security_invoker = true)
AS
SELECT
  f.item_key,
  f.contract_key,
  l.id AS vinculo_id,
  public.ata_key_from_item_key(f.item_key) AS ata_key,
  f.motivo,
  f.detectado_em,
  f.visto_em,
  am.gestor_nome AS gestor_ata,
  cm.gestor_nome AS gestor_contrato,
  l.quantidade_contratada_api AS quantidade_fonte,
  l.quantidade_ajustada,
  l.ajuste_justificativa,
  l.ajustado_por_nome,
  l.ajustado_em,
  d.dividido_por_nome,
  d.dividido_em,
  COALESCE(dv.dividido, 0) AS quantidade_dividida
FROM public.vinculo_automatico_a_conferir f
JOIN public.arp_item_contract_links l ON l.item_key = f.item_key AND l.contract_key = f.contract_key
LEFT JOIN public.ata_managers am ON am.ata_key = public.ata_key_from_item_key(f.item_key)
LEFT JOIN public.contract_managers cm ON cm.contract_key = f.contract_key
LEFT JOIN public.contrato_item_divisoes d
       ON d.item_key = f.item_key AND d.contract_key = f.contract_key AND d.origem = 'USUARIO'
LEFT JOIN (
  SELECT item_key, contract_key, sum(quantidade) AS dividido
    FROM public.contrato_item_divisao_unidades
   GROUP BY item_key, contract_key
) dv ON dv.item_key = f.item_key AND dv.contract_key = f.contract_key;

COMMENT ON VIEW public.v_vinculos_a_conferir IS
  'Vínculos automáticos desmentidos pela fonte que têm trabalho do gestor: gestor da ata e do contrato, quem ajustou ou dividiu e o motivo (migration 112).';

GRANT SELECT ON public.v_vinculos_a_conferir TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Decisão do coordenador
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manter_vinculo_a_conferir(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(100) := btrim(COALESCE(p_contract_key, ''));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_motivo VARCHAR(40);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide sobre vínculo automático desmentido pela fonte.'
      USING ERRCODE = '42501';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key FOR UPDATE;
  SELECT motivo INTO v_motivo FROM public.vinculo_automatico_a_conferir
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Este vínculo não está marcado para conferência.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.arp_item_contract_links
     SET origem = 'MANUAL', updated_at = NOW()
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  DELETE FROM public.vinculo_automatico_a_conferir
   WHERE item_key = v_item_key AND contract_key = v_contract_key;

  INSERT INTO public.vinculo_automatico_decisoes (item_key, contract_key, decisao, motivo, justificativa, decidido_por, decidido_por_nome)
  VALUES (v_item_key, v_contract_key, 'MANTIDO', v_motivo, v_just, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'));

  RETURN jsonb_build_object('success', true, 'item_key', v_item_key, 'contract_key', v_contract_key, 'decisao', 'MANTIDO');
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_vinculo_a_conferir(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(100) := btrim(COALESCE(p_contract_key, ''));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_motivo VARCHAR(40);
  v_link RECORD;
  v_perdido JSONB;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide sobre vínculo automático desmentido pela fonte.'
      USING ERRCODE = '42501';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key FOR UPDATE;
  SELECT motivo INTO v_motivo FROM public.vinculo_automatico_a_conferir
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Este vínculo não está marcado para conferência.' USING ERRCODE = 'P0002';
  END IF;

  v_perdido := jsonb_build_object(
    'quantidade_fonte', v_link.quantidade_contratada_api,
    'quantidade_ajustada', v_link.quantidade_ajustada,
    'ajuste_justificativa', v_link.ajuste_justificativa,
    'ajustado_por_nome', v_link.ajustado_por_nome,
    'divisao', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('unidade', u.unit_name, 'quantidade', u.quantidade) ORDER BY u.unit_name), '[]'::JSONB)
        FROM public.contrato_item_divisao_unidades u
        JOIN public.contrato_item_divisoes d ON d.item_key = u.item_key AND d.contract_key = u.contract_key
       WHERE u.item_key = v_item_key AND u.contract_key = v_contract_key AND d.origem = 'USUARIO'
    ),
    'dividido_por_nome', (
      SELECT d.dividido_por_nome FROM public.contrato_item_divisoes d
       WHERE d.item_key = v_item_key AND d.contract_key = v_contract_key AND d.origem = 'USUARIO'
    )
  );

  INSERT INTO public.vinculo_automatico_decisoes (item_key, contract_key, decisao, motivo, justificativa, perdido, decidido_por, decidido_por_nome)
  VALUES (v_item_key, v_contract_key, 'RETIRADO', v_motivo, v_just, v_perdido, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'));

  -- A marca e a divisão saem junto, por cascata.
  DELETE FROM public.arp_item_contract_links
   WHERE item_key = v_item_key AND contract_key = v_contract_key;

  -- Como o Desvincular: a automação não refaz o par. "Restaurar" a sugestão no item o devolve à automação.
  INSERT INTO public.arp_item_contract_dismissals (item_key, contract_key)
  VALUES (v_item_key, v_contract_key)
  ON CONFLICT (item_key, contract_key) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'item_key', v_item_key, 'contract_key', v_contract_key, 'decisao', 'RETIRADO', 'perdido', v_perdido);
END;
$$;

REVOKE ALL ON FUNCTION public.manter_vinculo_a_conferir(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retirar_vinculo_a_conferir(VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manter_vinculo_a_conferir(VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retirar_vinculo_a_conferir(VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;

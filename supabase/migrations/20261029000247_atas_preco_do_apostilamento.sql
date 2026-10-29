-- ==============================================================================
-- MIGRATION 247: ATAS — PREÇO DO APOSTILAMENTO INFORMADO PELO GESTOR DA ATA
-- Versão: 20261029000247_atas_preco_do_apostilamento.sql
--
-- Protótipo aprovado em 29/10/2026. O apostilamento de reajuste sai no PNCP, mas o Compras.gov.br continua com o preço
-- homologado (situação PRECO_DESATUALIZADO, migration 158). Desde a migration 246 as Emendas usam o preço de hoje e o
-- item fica bloqueado sem ninguém conseguir destravar. Agora:
--
-- 1) itens_ata_preco_apostilado: o preço unitário de cada item como está no apostilamento, com o SEI (D1).
-- 2) informar_preco_apostilamento: gestor da ata (no alcance dele) ou coordenador grava os preços (D1, D2 na tela).
-- 3) O preço informado vale em todo o sistema (D3): o gatilho de itens_ata troca o preço que a fonte manda pelo
--    informado e guarda o da fonte em fonte_valor. Se a fonte trouxer um preço novo, diferente do antigo e do
--    informado, a ata fica com "fonte diferente" para o gestor conferir (D4).
-- 4) v_ata_reajuste_resumo ganha fonte_diferente e reservas_de_emenda (reservas e minutas de emenda com itens da ata):
--    o Início do gestor da ata deixa o aviso urgente quando há emenda esperando (D5).
-- ==============================================================================

-- 1) Tabela ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_ata_preco_apostilado (
  ata_id             UUID NOT NULL REFERENCES public.atas_registro_preco(id) ON DELETE CASCADE,
  numero_item        VARCHAR(10) NOT NULL,
  preco              NUMERIC(18, 2) NOT NULL CHECK (preco > 0),
  preco_antes        NUMERIC(18, 4),
  fonte_valor        NUMERIC(18, 4),
  ata_reajuste_id    UUID REFERENCES public.ata_reajustes(id) ON DELETE SET NULL,
  sei_apostilamento  TEXT NOT NULL CHECK (sei_apostilamento ~ '^\d{7,10}$'),
  informado_por      UUID,
  informado_por_nome TEXT,
  informado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ata_id, numero_item)
);
COMMENT ON TABLE public.itens_ata_preco_apostilado IS
  'Preço unitário do apostilamento informado pelo gestor da ata (migration 247). Vale no lugar do valor_unitario da fonte; fonte_valor guarda o último preço que a fonte mandou.';

ALTER TABLE public.itens_ata_preco_apostilado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: itens_ata_preco_apostilado" ON public.itens_ata_preco_apostilado;
CREATE POLICY "Authenticated Read: itens_ata_preco_apostilado" ON public.itens_ata_preco_apostilado FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.itens_ata_preco_apostilado;
CREATE POLICY "Somente usuario ativo" ON public.itens_ata_preco_apostilado AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.itens_ata_preco_apostilado FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.itens_ata_preco_apostilado TO authenticated;
GRANT ALL ON public.itens_ata_preco_apostilado TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_itens_ata_preco_apostilado ON public.itens_ata_preco_apostilado;
    CREATE TRIGGER trg_audit_itens_ata_preco_apostilado AFTER INSERT OR UPDATE OR DELETE ON public.itens_ata_preco_apostilado
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- 2) O preço informado vale no lugar do que a fonte manda ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_itens_ata_preco_apostilado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preco NUMERIC;
BEGIN
  SELECT preco INTO v_preco FROM public.itens_ata_preco_apostilado
   WHERE ata_id = NEW.ata_id AND numero_item = NEW.numero_item;
  IF v_preco IS NULL OR round(NEW.valor_unitario, 2) = v_preco THEN
    RETURN NEW;
  END IF;
  UPDATE public.itens_ata_preco_apostilado SET fonte_valor = NEW.valor_unitario
   WHERE ata_id = NEW.ata_id AND numero_item = NEW.numero_item AND fonte_valor IS DISTINCT FROM NEW.valor_unitario;
  NEW.valor_unitario := v_preco;
  NEW.valor_total := COALESCE(NEW.quantidade_homologada, 0) * v_preco;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_itens_ata_preco_apostilado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_itens_ata_preco_apostilado ON public.itens_ata;
CREATE TRIGGER trg_itens_ata_preco_apostilado
  BEFORE INSERT OR UPDATE OF valor_unitario ON public.itens_ata
  FOR EACH ROW EXECUTE FUNCTION public.trg_itens_ata_preco_apostilado();

-- 3) Gravação pelo gestor da ata ---------------------------------------------------------------------------
-- p_precos: {"00001": 371002.21, ...} (número do item → preço unitário do apostilamento).
CREATE OR REPLACE FUNCTION public.informar_preco_apostilamento(
  p_ata_id UUID,
  p_reajuste_id UUID,
  p_precos JSONB,
  p_sei TEXT,
  p_versao_vista INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_sei    TEXT := btrim(COALESCE(p_sei, ''));
  v_versao INTEGER;
  v_item   TEXT;
  v_valor  TEXT;
  v_preco  NUMERIC;
  v_atual  NUMERIC;
  v_nome   TEXT := public.nome_do_usuario_logado();
  v_n      INTEGER := 0;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa o preço do apostilamento.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));
  IF v_sei !~ '^\d{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_precos) <> 'object' OR p_precos = '{}'::JSONB THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o preço de pelo menos um item.' USING ERRCODE = '22023';
  END IF;
  IF p_reajuste_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ata_reajustes WHERE id = p_reajuste_id AND ata_id = p_ata_id) THEN
    RAISE EXCEPTION 'REAJUSTE_NAO_ENCONTRADO: Reajuste não encontrado nesta ata.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  FOR v_item, v_valor IN SELECT key, value #>> '{}' FROM jsonb_each(p_precos) LOOP
    BEGIN
      v_preco := round(v_valor::NUMERIC, 2);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Preço inválido no item %.', v_item USING ERRCODE = '22023';
    END;
    IF v_preco IS NULL OR v_preco <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o preço do item %.', v_item USING ERRCODE = '22023';
    END IF;
    SELECT valor_unitario INTO v_atual FROM public.itens_ata
     WHERE ata_id = p_ata_id AND lpad(numero_item, 5, '0') = lpad(v_item, 5, '0');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não está nesta ata.', v_item USING ERRCODE = 'P0002';
    END IF;
    -- O preço antes é o da fonte, não um apostilado anterior: guardado só na primeira vez.
    INSERT INTO public.itens_ata_preco_apostilado AS x (ata_id, numero_item, preco, preco_antes, fonte_valor, ata_reajuste_id, sei_apostilamento,
                                                       informado_por, informado_por_nome, informado_em)
    SELECT p_ata_id, i.numero_item, v_preco, v_atual, v_atual, p_reajuste_id, v_sei, auth.uid(), v_nome, NOW()
      FROM public.itens_ata i WHERE i.ata_id = p_ata_id AND lpad(i.numero_item, 5, '0') = lpad(v_item, 5, '0')
    ON CONFLICT (ata_id, numero_item) DO UPDATE
      SET preco = EXCLUDED.preco, ata_reajuste_id = EXCLUDED.ata_reajuste_id, sei_apostilamento = EXCLUDED.sei_apostilamento,
          informado_por = EXCLUDED.informado_por, informado_por_nome = EXCLUDED.informado_por_nome, informado_em = EXCLUDED.informado_em;
    UPDATE public.itens_ata SET valor_unitario = v_preco, valor_total = COALESCE(quantidade_homologada, 0) * v_preco
     WHERE ata_id = p_ata_id AND lpad(numero_item, 5, '0') = lpad(v_item, 5, '0');
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.atas_registro_preco a
     SET valor_total = COALESCE((SELECT sum(COALESCE(i.quantidade_senasp, 0) * i.valor_unitario) FROM public.itens_ata i WHERE i.ata_id = a.id), 0)
   WHERE a.id = p_ata_id;
  UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = p_ata_id;
  RETURN jsonb_build_object('success', true, 'itens', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.informar_preco_apostilamento(UUID, UUID, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_preco_apostilamento(UUID, UUID, JSONB, TEXT, INTEGER) TO authenticated, service_role;

-- 4) Resumo: fonte diferente e reservas de emenda esperando ---------------------------------------------------
-- Reservas e minutas de emenda com itens da ata. Conta no banco inteiro: o gestor da ata não lê os pedidos de emenda.
CREATE OR REPLACE FUNCTION public.reajuste_reservas_de_emenda(p_numero_ata TEXT, p_uasg TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(DISTINCT p.id)::INTEGER
    FROM public.emenda_pedidos p
    JOIN public.emenda_pedido_linhas l ON l.pedido_id = p.id AND NOT l.cancelada
    CROSS JOIN LATERAL public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) k
   WHERE p.cancelado_em IS NULL AND p.etapa IN ('RESERVADO', 'MINUTA')
     AND k LIKE p_numero_ata || '-' || p_uasg || '-%';
$$;
REVOKE ALL ON FUNCTION public.reajuste_reservas_de_emenda(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reajuste_reservas_de_emenda(TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_ata_reajuste_resumo
WITH (security_invoker = true) AS
SELECT a.id AS ata_id,
       a.numero_ata,
       a.codigo_uasg,
       public.chave_gestao_ata(a.numero_ata || '-' || a.codigo_uasg) AS ata_key,
       p.indice,
       p.clausula,
       CASE WHEN p.termo_data IS NOT NULL THEN 'INFORMADO'
            WHEN p.termo_mes_apostilamento IS NOT NULL THEN 'APOSTILAMENTO'
            WHEN p.data_orcamento_edital IS NOT NULL THEN 'EDITAL'
       END AS data_base_origem,
       COALESCE(p.termo_data, p.termo_mes_apostilamento, p.data_orcamento_edital) AS data_base,
       p.versao,
       s.itens,
       s.percentual_a_informar,
       s.indice_indisponivel,
       s.preco_desatualizado,
       s.devido,
       s.previsto,
       s.se_prorrogar,
       s.em_dia,
       s.proximo_efeito,
       s.proximo_situacao,
       s.proximo_percentual,
       CASE WHEN s.percentual_a_informar > 0 THEN 'PERCENTUAL_A_INFORMAR'
            WHEN s.indice_indisponivel > 0 THEN 'INDICE_INDISPONIVEL'
            WHEN s.devido > 0 THEN 'DEVIDO'
            WHEN s.preco_desatualizado > 0 THEN 'PRECO_DESATUALIZADO'
            WHEN p.termo_data IS NULL AND p.termo_mes_apostilamento IS NULL AND p.clausula <> 'SEM_REAJUSTE' THEN 'TERMO_A_INFORMAR'
            WHEN s.previsto > 0 THEN 'PREVISTO'
            WHEN s.se_prorrogar > 0 THEN 'SE_PRORROGAR'
            WHEN p.clausula = 'SEM_REAJUSTE' THEN 'SEM_REAJUSTE'
            ELSE 'EM_DIA'
       END AS situacao,
       (SELECT count(*)::INTEGER FROM public.itens_ata_preco_apostilado x
         WHERE x.ata_id = a.id AND x.fonte_valor IS NOT NULL
           AND round(x.fonte_valor, 2) <> x.preco AND round(x.fonte_valor, 2) <> round(COALESCE(x.preco_antes, x.fonte_valor), 2)) AS fonte_diferente,
       CASE WHEN s.preco_desatualizado > 0 OR s.devido > 0 THEN public.reajuste_reservas_de_emenda(a.numero_ata, a.codigo_uasg) ELSE 0 END AS reservas_de_emenda
  FROM public.atas_registro_preco a
  JOIN public.ata_reajuste_parametros p ON p.ata_id = a.id
  CROSS JOIN LATERAL (
    SELECT count(*)::INTEGER AS itens,
           count(*) FILTER (WHERE r.situacao_item = 'PERCENTUAL_A_INFORMAR')::INTEGER AS percentual_a_informar,
           count(*) FILTER (WHERE r.situacao_item = 'INDICE_INDISPONIVEL')::INTEGER AS indice_indisponivel,
           count(*) FILTER (WHERE r.situacao_item = 'PRECO_DESATUALIZADO')::INTEGER AS preco_desatualizado,
           count(*) FILTER (WHERE r.situacao_item = 'DEVIDO')::INTEGER AS devido,
           count(*) FILTER (WHERE r.situacao_item = 'PREVISTO')::INTEGER AS previsto,
           count(*) FILTER (WHERE r.situacao_item = 'SE_PRORROGAR')::INTEGER AS se_prorrogar,
           count(*) FILTER (WHERE r.situacao_item = 'EM_DIA')::INTEGER AS em_dia,
           min(r.proximo_efeito) AS proximo_efeito,
           (array_agg(r.proximo_situacao ORDER BY r.proximo_efeito) FILTER (WHERE r.proximo_efeito IS NOT NULL))[1] AS proximo_situacao,
           (array_agg(r.proximo_percentual ORDER BY r.proximo_efeito) FILTER (WHERE r.proximo_efeito IS NOT NULL))[1] AS proximo_percentual
      FROM public.reajuste_itens_ata(a.id) r
  ) s
 WHERE a.data_vigencia_final >= CURRENT_DATE;
COMMENT ON VIEW public.v_ata_reajuste_resumo IS 'Situação do reajuste por ata vigente com parâmetros. Contagens por situação dos itens, próximo marco, preço do apostilamento diferente da fonte e reservas de emenda com itens da ata (migration 247).';
REVOKE ALL ON public.v_ata_reajuste_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_ata_reajuste_resumo TO authenticated, service_role;

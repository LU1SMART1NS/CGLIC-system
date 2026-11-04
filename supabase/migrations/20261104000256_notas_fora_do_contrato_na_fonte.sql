-- ==============================================================================
-- Migration 256: notas que o Contratos.gov.br não lista em contrato nenhum (fila Vínculos › Notas fora do contrato)
-- ==============================================================================
-- Decisão do usuário (04/11/2026, protótipo versão 2): o sistema não vincula nota a contrato à mão. O Contratos.gov.br
-- aceita incluir nota da UG 200330 em contrato da UASG 200331 (a fonte já tem 153 notas de 2026 assim, em 105
-- contratos), então a correção é sempre lá, feita pelo gestor. O sistema só mostra a tarefa: a nota, o contrato onde
-- incluí-la e por quê. A linha sai sozinha quando a sincronização trouxer a nota num contrato (vínculo FONTE).
--
-- 1) v_notas_fora_do_contrato: cada nota sem vínculo FONTE nem MANUAL. Entram as sem vínculo nenhum e as que a
--    Carteira mostra só pelo contrato do pedido de emenda (origem EMENDA, migration 255). Traz os pedidos, o contrato
--    do pedido, o aviso de credor diferente do fornecedor do pedido e os contratos do fornecedor (credor da nota),
--    na ordem da sugestão: item do pedido, assinado depois da nota, sem notas da fonte, assinatura mais próxima.
--    Medido nas 138 notas EMENDA: a 1ª é o contrato certo em 82% e o certo está entre as 3 primeiras em 96%.
-- 2) notas_inclusao_na_fonte: a marca "Vou incluir no Contratos.gov.br" do gestor (contrato escolhido e observação).
--    Escrita só pelas funções. Sem a nota no contrato em 7 dias, a tela volta a cobrar ("a inclusão não chegou").
-- O vínculo à mão segue desligado (migration 117).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) A marca do gestor
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notas_inclusao_na_fonte (
  id                BIGSERIAL PRIMARY KEY,
  empenho_id        UUID         NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  numero_empenho    TEXT,
  contract_key      VARCHAR(150) NOT NULL,
  observacao        TEXT         CHECK (observacao IS NULL OR char_length(observacao) BETWEEN 1 AND 500),
  marcado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  marcado_por_nome  TEXT,
  marcado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  desfeito_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  desfeito_por_nome TEXT,
  desfeito_em       TIMESTAMPTZ,
  CONSTRAINT notas_inclusao_na_fonte_contract_key_formato CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$')
);

-- Uma marca ativa por nota.
CREATE UNIQUE INDEX IF NOT EXISTS notas_inclusao_na_fonte_ativa_uidx
  ON public.notas_inclusao_na_fonte (empenho_id) WHERE desfeito_em IS NULL;

ALTER TABLE public.notas_inclusao_na_fonte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura para logados: notas_inclusao_na_fonte" ON public.notas_inclusao_na_fonte;
CREATE POLICY "Leitura para logados: notas_inclusao_na_fonte"
  ON public.notas_inclusao_na_fonte FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.notas_inclusao_na_fonte FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notas_inclusao_na_fonte FROM authenticated;
GRANT SELECT ON public.notas_inclusao_na_fonte TO authenticated;
GRANT ALL ON public.notas_inclusao_na_fonte TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notas_inclusao_na_fonte_id_seq TO service_role;

COMMENT ON TABLE public.notas_inclusao_na_fonte IS
  'Marca "Vou incluir no Contratos.gov.br" da fila Notas fora do contrato (migration 256). Só as funções gravam.';

-- ------------------------------------------------------------------------------
-- 2) A fila
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_notas_fora_do_contrato
WITH (security_invoker = false) AS
WITH notas AS (
  SELECT e.*
    FROM public.empenhos e
   WHERE NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = e.id AND ce.origem <> 'EMENDA')
),
ped AS (
  SELECT l.empenho_id, p.numero AS pedido, p.siop_emenda AS emenda, pl.item_key, l.contract_key
    FROM public.emenda_linha_notas l
    JOIN public.emenda_pedido_linhas pl ON pl.id = l.linha_id AND NOT pl.cancelada
    JOIN public.emenda_pedidos p ON p.id = pl.pedido_id
   WHERE l.empenho_id IN (SELECT id FROM notas)
),
cand AS (
  SELECT n.id AS empenho_id, co.contract_key, co.numero,
         NULLIF(co.registro->'raw'->>'data_assinatura', '')::date AS assinatura,
         co.data_vigencia_fim AS vigencia_fim,
         EXISTS (SELECT 1 FROM public.arp_item_contract_links ic JOIN ped ON ped.item_key = ic.item_key AND ped.empenho_id = n.id
                  WHERE ic.contract_key = co.contract_key) AS tem_item_do_pedido,
         NOT EXISTS (SELECT 1 FROM public.contrato_empenhos x WHERE x.contract_key = co.contract_key AND x.origem = 'FONTE') AS sem_notas_da_fonte,
         n.data_emissao
    FROM notas n
    JOIN public.contratos_oficiais co
      ON (upper(btrim(COALESCE(n.credor_cnpj_cpf, ''))) = upper(btrim(COALESCE(co.fornecedor_cnpj_cpf, '-')))
          OR public.credor_e_fornecedor_da_ata(n.credor_cnpj_cpf, n.credor_nome, co.fornecedor_cnpj_cpf,
                                               co.registro->'raw'->'fornecedor'->>'nome'))
   WHERE co.ano::int >= n.ano_exercicio - 1
),
rank AS (
  SELECT c.*, row_number() OVER (
           PARTITION BY c.empenho_id
           ORDER BY c.tem_item_do_pedido DESC, (c.assinatura >= c.data_emissao) DESC NULLS LAST, c.sem_notas_da_fonte DESC,
                    abs(c.assinatura - c.data_emissao) NULLS LAST, c.contract_key) AS ordem
    FROM cand c
)
SELECT
  n.id AS empenho_id,
  n.numero_oficial,
  n.uasg_emitente,
  n.ano_exercicio,
  n.data_emissao,
  n.valor_empenhado,
  n.credor_nome,
  n.credor_cnpj_cpf,
  -- Contrato em que a Carteira mostra a nota pelo pedido de emenda (origem EMENDA), se houver.
  (SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.empenho_id = n.id AND ce.origem = 'EMENDA'
    ORDER BY ce.created_at LIMIT 1) AS contrato_pelo_pedido,
  COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('numero', ped.pedido, 'emenda', ped.emenda))
              FROM ped WHERE ped.empenho_id = n.id), '[]'::jsonb) AS pedidos,
  -- Contratos que o pedido aponta e cujo fornecedor não é o credor da nota (o pedido ou a nota estão errados).
  COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('contract_key', co.contract_key, 'numero', co.numero,
                                                         'fornecedor', co.registro->'raw'->'fornecedor'->>'nome'))
              FROM ped JOIN public.contratos_oficiais co ON co.contract_key = ped.contract_key
             WHERE ped.empenho_id = n.id
               AND NOT (upper(btrim(COALESCE(n.credor_cnpj_cpf, ''))) = upper(btrim(COALESCE(co.fornecedor_cnpj_cpf, '-')))
                        OR public.credor_e_fornecedor_da_ata(n.credor_cnpj_cpf, n.credor_nome, co.fornecedor_cnpj_cpf,
                                                             co.registro->'raw'->'fornecedor'->>'nome'))), '[]'::jsonb)
    AS pedido_de_outro_fornecedor,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'contract_key', r.contract_key, 'numero', r.numero, 'assinatura', r.assinatura,
                     'vigencia_fim', r.vigencia_fim, 'tem_item_do_pedido', r.tem_item_do_pedido,
                     'sem_notas_da_fonte', r.sem_notas_da_fonte) ORDER BY r.ordem)
              FROM rank r WHERE r.empenho_id = n.id), '[]'::jsonb) AS contratos_do_fornecedor,
  m.contract_key AS marca_contract_key,
  m.observacao AS marca_observacao,
  m.marcado_por_nome AS marca_por_nome,
  m.marcado_em AS marca_em
FROM notas n
LEFT JOIN public.notas_inclusao_na_fonte m ON m.empenho_id = n.id AND m.desfeito_em IS NULL;

COMMENT ON VIEW public.v_notas_fora_do_contrato IS
  'Notas que o Contratos.gov.br não lista em contrato nenhum, com o contrato do pedido, os contratos do fornecedor na ordem da sugestão e a marca do gestor (migration 256).';

REVOKE ALL ON public.v_notas_fora_do_contrato FROM PUBLIC, anon;
GRANT SELECT ON public.v_notas_fora_do_contrato TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Marcar e desfazer "Vou incluir no Contratos.gov.br"
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_inclusao_nota_na_fonte(
  p_empenho_id UUID,
  p_contract_key TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_numero TEXT;
  v_id BIGINT;
  v_nome TEXT;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador marca a inclusão no Contratos.gov.br.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_key, NULL);
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_OBSERVACAO: A observação tem no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira.', v_key USING ERRCODE = 'P0002';
  END IF;

  SELECT v.numero_oficial INTO v_numero FROM public.v_notas_fora_do_contrato v WHERE v.empenho_id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JA_RESOLVIDA: O Contratos.gov.br já lista esta nota num contrato. Atualize a lista.' USING ERRCODE = 'P0002';
  END IF;

  v_nome := public.nome_do_usuario_logado();

  -- Marcar de novo renova a marca (outro contrato, novo prazo de 7 dias).
  UPDATE public.notas_inclusao_na_fonte
     SET contract_key = v_key, observacao = v_obs, numero_empenho = v_numero,
         marcado_por = auth.uid(), marcado_por_nome = v_nome, marcado_em = NOW()
   WHERE empenho_id = p_empenho_id AND desfeito_em IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.notas_inclusao_na_fonte (empenho_id, numero_empenho, contract_key, observacao, marcado_por, marcado_por_nome)
    VALUES (p_empenho_id, v_numero, v_key, v_obs, auth.uid(), v_nome)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'marcado_por_nome', v_nome);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_inclusao_nota_na_fonte(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_inclusao_nota_na_fonte(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.desfazer_inclusao_nota_na_fonte(p_empenho_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marca public.notas_inclusao_na_fonte%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador desfaz a marca.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_marca FROM public.notas_inclusao_na_fonte WHERE empenho_id = p_empenho_id AND desfeito_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEM_MARCA: Esta nota não está marcada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(v_marca.contract_key, NULL);
  UPDATE public.notas_inclusao_na_fonte
     SET desfeito_em = NOW(), desfeito_por = auth.uid(), desfeito_por_nome = public.nome_do_usuario_logado()
   WHERE id = v_marca.id;
  RETURN jsonb_build_object('success', true, 'id', v_marca.id);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_inclusao_nota_na_fonte(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_inclusao_nota_na_fonte(UUID) TO authenticated;

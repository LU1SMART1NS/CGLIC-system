-- ==============================================================================
-- MIGRATION 190: CONFERÊNCIA PELA NOTA DE EMPENHO (M7 e M4 da revisão de 25/10/2026)
-- Versão: 20261025000190_emendas_conferencia_pela_nota.sql
--
-- Duas consultas só de leitura, olhando da nota para o pedido:
--
-- 1) v_emendas_credor_diferente (M7): linhas de pedido cuja nota ligada tem outro credor que o fornecedor da ata do
--    item (raiz do CNPJ; credor estrangeiro ou pessoa física também contam). Sinal de nota ligada à linha errada, de
--    item ou ata errados no pedido (termo aditivo com a ata errada, 24/10/2026) ou de nota em nome de outra empresa.
--    Medição de 25/10/2026: 10 notas em 86 linhas (Renault e pessoa física ligadas à moto 00058/2025, 3M estrangeira).
-- 2) v_emendas_notas_sem_pedido (M4): notas de emenda da UG 200330 (plano interno com ano + 8 dígitos), do ano
--    (até fevereiro, também do anterior), cuja emenda nenhum pedido tem. Sinal de emenda autorizada fora do sistema ou de número trocado no
--    pedido. Medição de 25/10/2026: 19 notas de 2026 de 9 emendas (R$ 6,95 mi); em 6 o autor tem outro pedido.
--
-- O aviso é marcado como resolvido com justificativa pelo gestor de emendas ou pelo coordenador, pelo mesmo
-- resolver_aviso do tipo EMPENHO (migration 187): chaves EMPENHO::CREDOR::… e EMPENHO::SEM-PEDIDO::….
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Nota de outro fornecedor
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_credor_diferente AS
WITH lin AS (
  SELECT l.id AS linha_id, l.pedido_id, p.numero AS pedido, p.siop_emenda AS emenda, l.item_key, n.empenho_id,
         i.fornecedor_razao_social AS fornecedor_nome,
         regexp_replace(COALESCE(i.fornecedor_cnpj_cpf, ''), '\D', '', 'g') AS fornecedor_doc
    FROM public.emenda_pedido_linhas l
    JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    JOIN public.emenda_linha_notas n ON n.linha_id = l.id AND n.empenho_id IS NOT NULL
    JOIN public.atas_registro_preco r ON r.numero_ata = split_part(l.item_key, '-', 1) AND r.codigo_uasg = split_part(l.item_key, '-', 2)
    JOIN public.itens_ata i ON i.ata_id = r.id AND lpad(i.numero_item, 5, '0') = split_part(l.item_key, '-', 3)
   WHERE NOT l.cancelada AND p.etapa <> 'CANCELADO' AND l.item_key IS NOT NULL)
SELECT lin.linha_id, lin.pedido_id, lin.pedido, lin.emenda, lin.item_key, e.numero_oficial AS nota, e.uasg_emitente AS ug,
       e.credor_nome, btrim(e.credor_cnpj_cpf) AS credor_doc, lin.fornecedor_nome, lin.fornecedor_doc
  FROM lin
  JOIN public.empenhos e ON e.id = lin.empenho_id
 WHERE lin.fornecedor_doc <> ''
   AND CASE WHEN length(regexp_replace(COALESCE(e.credor_cnpj_cpf, ''), '\D', '', 'g')) = 14 AND length(lin.fornecedor_doc) = 14
            THEN left(regexp_replace(e.credor_cnpj_cpf, '\D', '', 'g'), 8) <> left(lin.fornecedor_doc, 8)
            ELSE regexp_replace(COALESCE(e.credor_cnpj_cpf, ''), '\D', '', 'g') <> lin.fornecedor_doc END
   AND (SELECT public.has_permission('emendas.view'));

COMMENT ON VIEW public.v_emendas_credor_diferente IS
  'Emendas: linhas cuja nota ligada tem credor diferente do fornecedor da ata do item, pela raiz do CNPJ (migration 190).';

REVOKE ALL ON public.v_emendas_credor_diferente FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_credor_diferente TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Nota de emenda sem pedido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_notas_sem_pedido AS
WITH ne AS (
  SELECT e.id AS empenho_id, e.numero_oficial AS nota, e.uasg_emitente AS ug, e.ano_exercicio, e.data_emissao,
         e.valor_empenhado, e.credor_nome, e.plano_interno,
         substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') AS emenda,
         substring(e.plano_interno from '(20[0-9]{2})[0-9]{8}')::INTEGER AS emenda_ano
    FROM public.empenhos e
   WHERE e.uasg_emitente = '200330'
     -- Notas do ano (até fevereiro, também as do ano anterior): as emendas de anos fechados não estão no sistema.
     AND e.ano_exercicio >= EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '60 days')::INTEGER
     AND e.plano_interno ~ '20[0-9]{2}[0-9]{8}'
     AND COALESCE(e.valor_empenhado, 0) > 0),
ped AS (
  SELECT p.id, p.numero, p.siop_emenda, p.autor_id
    FROM public.emenda_pedidos p WHERE p.siop_emenda IS NOT NULL AND p.etapa <> 'CANCELADO')
SELECT ne.empenho_id, ne.nota, ne.ug, ne.ano_exercicio, ne.data_emissao, ne.valor_empenhado, ne.credor_nome, ne.plano_interno,
       ne.emenda, ne.emenda_ano,
       -- Pedidos de outras emendas do mesmo autor (os 4 primeiros dígitos): pode ser o número trocado no pedido.
       (SELECT array_agg(DISTINCT a.nome ORDER BY a.nome) FROM ped JOIN public.emenda_autores a ON a.id = ped.autor_id
         WHERE left(ped.siop_emenda, 4) = left(ne.emenda, 4)) AS autores_do_codigo,
       (SELECT array_agg(ped.id ORDER BY ped.numero) FROM ped WHERE left(ped.siop_emenda, 4) = left(ne.emenda, 4)) AS pedidos_do_codigo
  FROM ne
 WHERE NOT EXISTS (SELECT 1 FROM ped WHERE ped.siop_emenda = ne.emenda)
   AND (SELECT public.has_permission('emendas.view'));

COMMENT ON VIEW public.v_emendas_notas_sem_pedido IS
  'Emendas: notas de emenda da UG 200330 do ano cuja emenda nenhum pedido tem (migration 190).';

REVOKE ALL ON public.v_emendas_notas_sem_pedido FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_notas_sem_pedido TO authenticated, service_role;

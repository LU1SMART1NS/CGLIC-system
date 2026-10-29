-- ==============================================================================
-- Versão: 20261029000240_divisao_da_ata_montada.sql
-- Atas a montar, entrega 3 (D5, decidida em 29/10/2026): a divisão do gerenciador entre as unidades internas, feita
-- pelo gestor no Quadro 2 da montagem (atas_a_montar_rascunhos.dados, migration 238), vira SUGESTÃO de alocação
-- quando a ata é publicada e chega ao banco. Nada é alocado sozinho: o coordenador ou o gestor de saldo usa a
-- sugestão na janela "Alocação do item" e grava pelo save_allocations_atomic, com as travas de sempre.
--
-- v_divisao_da_ata_montada: uma linha por item de ata publicada que tem divisão planejada, com o item_key da
-- alocação ("00043/2026-200331-00003"), as unidades e quantidades (só as maiores que zero), quem montou e quando.
-- A ata publicada é ligada ao rascunho pela compra (número de controle do PNCP) e pelo fornecedor (CNPJ do item no
-- banco ou fornecedor indicado pelo coordenador em atas_fornecedor_pncp, migration 107); o item, pelo número.
--
-- Só leitura; nada que já existe muda.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_divisao_da_ata_montada
WITH (security_invoker = true) AS
WITH divisoes AS (
  -- Uma linha por item do rascunho com ao menos uma unidade com quantidade.
  SELECT r.numero_controle_compra,
         r.fornecedor_ni,
         r.atualizado_por_nome,
         r.atualizado_em,
         d.numero::INTEGER AS numero_item,
         (SELECT jsonb_agg(jsonb_build_object('unidade', u.sigla, 'quantidade', (d.qtds ->> u.sigla)::NUMERIC) ORDER BY u.ordem)
            FROM jsonb_array_elements_text(COALESCE(r.dados -> 'unidades', '[]'::JSONB)) WITH ORDINALITY AS u(sigla, ordem)
           WHERE COALESCE(NULLIF(d.qtds ->> u.sigla, ''), '0')::NUMERIC > 0) AS unidades
    FROM public.atas_a_montar_rascunhos r
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(r.dados -> 'divisao') = 'object' THEN r.dados -> 'divisao' ELSE '{}'::JSONB END) AS d(numero, qtds)
   WHERE d.numero ~ '^[0-9]+$'
     AND jsonb_typeof(d.qtds) = 'object'
),
itens_publicados AS (
  SELECT a.numero_ata,
         a.codigo_uasg,
         i.numero_item,
         i.fornecedor_cnpj_cpf,
         a.numero_controle_pncp,
         split_part(a.numero_controle_pncp, '-', 1) || '-1-' || split_part(a.numero_controle_pncp, '-', 3) AS compra
    FROM public.atas_registro_preco a
    JOIN public.itens_ata i ON i.ata_id = a.id
   WHERE a.numero_controle_pncp ~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}-[0-9]{6}$'
)
SELECT p.numero_ata || '-' || p.codigo_uasg || '-' || p.numero_item AS item_key,
       p.numero_ata,
       p.codigo_uasg,
       p.numero_item,
       d.numero_controle_compra,
       d.fornecedor_ni,
       d.unidades,
       d.atualizado_por_nome AS montada_por_nome,
       d.atualizado_em       AS montada_em
  FROM divisoes d
  JOIN itens_publicados p
    ON p.compra = d.numero_controle_compra
   AND p.numero_item ~ '^[0-9]+$'
   AND p.numero_item::INTEGER = d.numero_item
 WHERE d.unidades IS NOT NULL
   AND (upper(btrim(p.fornecedor_cnpj_cpf)) = upper(btrim(d.fornecedor_ni))
        OR (length(regexp_replace(d.fornecedor_ni, '\D', '', 'g')) >= 11
            AND regexp_replace(p.fornecedor_cnpj_cpf, '\D', '', 'g') = regexp_replace(d.fornecedor_ni, '\D', '', 'g'))
        OR EXISTS (SELECT 1 FROM public.atas_fornecedor_pncp f
                    WHERE f.numero_controle_pncp = p.numero_controle_pncp
                      AND upper(btrim(f.fornecedor_identificador)) = upper(btrim(d.fornecedor_ni))));
COMMENT ON VIEW public.v_divisao_da_ata_montada IS
  'Divisão do gerenciador entre as unidades internas planejada na montagem da ata (migration 240), por item da ata publicada. Só sugestão: a alocação continua pelo save_allocations_atomic.';
REVOKE ALL ON public.v_divisao_da_ata_montada FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_divisao_da_ata_montada TO authenticated, service_role;

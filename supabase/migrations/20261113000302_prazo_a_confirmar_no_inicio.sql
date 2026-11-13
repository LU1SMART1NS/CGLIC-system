-- ==============================================================================
-- Versão: 20261113000302_prazo_a_confirmar_no_inicio.sql
-- Início: prazo de entrega do TR a confirmar (migration 301), só nas atas com contrato acompanhado pela Fiscalização
-- (SFC/CGLIC ou mista), que é onde o prazo é usado (decisão do usuário em 13/11/2026). As outras atas mantêm o item
-- na aba Ações da Ata 360.
-- Ata nova (fora da leitura dos editais de 13/11/2026), com contrato acompanhado e sem linha: entra também, sem
-- sugestão, para o gestor informar o prazo.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.atas_prazo_a_confirmar()
RETURNS SETOF public.ata_prazo_entrega
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH acompanhadas AS (
    SELECT DISTINCT public.ata_key_from_item_key(l.item_key) AS ata_key
      FROM public.arp_item_contract_links l
      JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.fiscalizacao IN ('SFC', 'MISTA')
  )
  SELECT p.*
    FROM public.ata_prazo_entrega p
    JOIN acompanhadas a ON a.ata_key = p.ata_key
   WHERE p.confirmado_em IS NULL
  UNION ALL
  SELECT (jsonb_populate_record(NULL::public.ata_prazo_entrega,
            jsonb_build_object('ata_key', a.ata_key, 'numero_ata', split_part(a.ata_key, '-', 1), 'trechos', '{}'::TEXT[],
                               'por_item', '{}'::JSONB, 'contagem_dita', FALSE, 'sem_prazo', FALSE))).*
    FROM acompanhadas a
   WHERE a.ata_key IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ata_prazo_entrega p WHERE p.ata_key = a.ata_key);
$$;
REVOKE ALL ON FUNCTION public.atas_prazo_a_confirmar() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.atas_prazo_a_confirmar() TO authenticated;

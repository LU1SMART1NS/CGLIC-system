-- =============================================================================
-- Leitura dos programas na Alocação (continua a migration 297).
-- O cadastro fisc_programas só é lido por quem vê a Fiscalização; a janela de alocação do item precisa do nome e
-- da área dos programas para o coordenador e o gestor de saldo. Duas funções só de leitura:
--  - programas_para_alocacao(): programas ativos com a área responsável (para "Reservar para um programa");
--  - alocacao_extra_do_item(item): reservas dos programas no item (com o contratado ligado a cada um), a divisão
--    da ata assinada, os remanejamentos entre unidades (com o SEI) e a marcação da divisão na ata.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.programas_para_alocacao()
RETURNS TABLE (id UUID, nome TEXT, area TEXT, ativo BOOLEAN, emendas BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.has_permission('allocations.view') OR public.has_permission('allocations.manage') OR public.has_permission('fiscalizacao.view')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à Alocação.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.nome::TEXT, d.sigla::TEXT, p.ativo, p.id = public.programa_das_emendas()
      FROM public.fisc_programas p
      JOIN public.internal_departments d ON d.id = p.unidade_id
     ORDER BY (p.id = public.programa_das_emendas()) DESC, lower(p.nome);
END;
$$;
REVOKE ALL ON FUNCTION public.programas_para_alocacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programas_para_alocacao() TO authenticated;

CREATE OR REPLACE FUNCTION public.alocacao_extra_do_item(p_item_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_div TEXT;
BEGIN
  IF NOT (public.has_permission('allocations.view') OR public.has_permission('allocations.manage') OR public.has_permission('fiscalizacao.view')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à Alocação.' USING ERRCODE = '42501';
  END IF;
  SELECT d.situacao INTO v_div
    FROM public.ata_divisao_unidades d JOIN public.atas_registro_preco a ON a.id = d.ata_id
   WHERE a.numero_ata = split_part(p_item_key, '-', 1) AND a.codigo_uasg = split_part(p_item_key, '-', 2);
  RETURN jsonb_build_object(
    'divisao', COALESCE(v_div, 'A_CONFERIR'),
    'reservas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'programa_id', r.programa_id, 'nome', p.nome, 'area', d.sigla, 'quantidade', r.quantidade,
               'contratado', COALESCE((SELECT SUM(c.quantidade) FROM public.contrato_item_divisao_unidades c
                                        WHERE c.item_key = r.item_key AND c.programa_id = r.programa_id), 0),
               'atualizado_por_nome', r.atualizado_por_nome, 'atualizado_em', r.atualizado_em)
             ORDER BY lower(p.nome))
        FROM public.arp_item_reservas_programa r
        JOIN public.fisc_programas p ON p.id = r.programa_id
        JOIN public.internal_departments d ON d.id = p.unidade_id
       WHERE r.item_key = p_item_key), '[]'::jsonb),
    'divisao_assinada', COALESCE((
      SELECT jsonb_object_agg(unit_name, quantidade) FROM public.ata_item_divisao_assinada WHERE item_key = p_item_key), '{}'::jsonb),
    'remanejamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('de', de_unidade, 'para', para_unidade, 'quantidade', quantidade, 'sei', sei_numero,
               'observacao', observacao, 'feito_por_nome', feito_por_nome, 'feito_em', feito_em) ORDER BY feito_em DESC)
        FROM public.arp_item_remanejamentos_unidades WHERE item_key = p_item_key), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.alocacao_extra_do_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alocacao_extra_do_item(TEXT) TO authenticated;

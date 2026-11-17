-- ==============================================================================
-- MIGRATION 320: escopo cumprido confirmado sem SEI do gestor de contratos
-- ==============================================================================
-- Decisão de 17/11/2026: o recebimento definitivo (TRD) é responsabilidade da
-- Fiscalização, não do gestor de contratos. O gestor só confere o que já está
-- registrado (entregas finalizadas na Fiscalização, com o TRD que o fiscal gravou,
-- e as faturas pagas) e confirma. Contrato fora da Fiscalização: confirma só pelos
-- pagamentos.
--
-- 1) confirmar_execucao_contrato: documento SEI e data do recebimento passam a
--    ser opcionais (a tela deixa de mandar). Se vierem, continuam validados.
--    Mesma assinatura e mesmas permissões (CREATE OR REPLACE mantém o proacl).
-- 2) execucao_entregas_do_contrato: leitura das entregas da Fiscalização (SFC) do
--    contrato para a janela, com o SEI do TRD quando o fiscal registrou. Não exige
--    fiscalizacao.view (o gestor de contratos não tem): exige o mesmo alcance de
--    quem decide a execução.
-- 0) A tabela exigia SEI e data em toda confirmação (CHECK sem nome da 314): sai.
-- ==============================================================================

ALTER TABLE public.contrato_execucao_decisoes DROP CONSTRAINT IF EXISTS contrato_execucao_decisoes_check;

CREATE OR REPLACE FUNCTION public.confirmar_execucao_contrato(
  p_contract_key TEXT,
  p_documento_sei TEXT,
  p_data_recebimento DATE,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
  v_sei TEXT := NULLIF(regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g'), '');
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_fatos RECORD;
BEGIN
  PERFORM public.exigir_decisao_execucao(v_key);

  IF v_sei IS NOT NULL AND (char_length(v_sei) < 7 OR char_length(v_sei) > 12) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do documento SEI tem de 7 a 12 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF p_data_recebimento IS NOT NULL AND p_data_recebimento > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do recebimento não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A observação pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Confere de novo no servidor: a tela pode estar desatualizada.
  SELECT v.estado, v.marca_dos_fatos INTO v_fatos
    FROM public.v_contrato_execucao v
   WHERE v.contract_key = v_key;

  IF NOT FOUND OR v_fatos.estado IS DISTINCT FROM 'SUGERIDO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O contrato não está com as faturas pagas somando o valor, sem fatura em aberto e com a fiscalização finalizada. Atualize a tela.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.contrato_execucao_decisoes AS d
    (contract_key, decisao, documento_sei, data_recebimento, observacao, marca_dos_fatos, decidido_por, decidido_por_nome, decidido_em)
  VALUES (v_key, 'EXECUTADO', v_sei, p_data_recebimento, v_obs, v_fatos.marca_dos_fatos, auth.uid(), left(public.nome_do_usuario_logado(), 200), NOW())
  ON CONFLICT (contract_key) DO UPDATE
    SET decisao = EXCLUDED.decisao, documento_sei = EXCLUDED.documento_sei, data_recebimento = EXCLUDED.data_recebimento,
        observacao = EXCLUDED.observacao, marca_dos_fatos = EXCLUDED.marca_dos_fatos, decidido_por = EXCLUDED.decidido_por,
        decidido_por_nome = EXCLUDED.decidido_por_nome, decidido_em = EXCLUDED.decidido_em;

  RETURN jsonb_build_object('contract_key', v_key, 'decisao', 'EXECUTADO');
END;
$$;

-- Entregas da Fiscalização do contrato, para a conferência do gestor --------------
CREATE OR REPLACE FUNCTION public.execucao_entregas_do_contrato(p_contract_key TEXT)
RETURNS TABLE(
  id UUID,
  item TEXT,
  beneficiario TEXT,
  municipio TEXT,
  uf TEXT,
  quantidade INTEGER,
  etapa TEXT,
  etapa_em DATE,
  trd_sei TEXT,
  trd_em DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_contract_key, ''));
BEGIN
  PERFORM public.exigir_decisao_execucao(v_key);
  RETURN QUERY
  SELECT e.id,
         COALESCE(NULLIF(i.nome_curto, ''), NULLIF(e.item_texto, ''), e.item_key)::TEXT,
         COALESCE(NULLIF(b.sigla, ''), NULLIF(b.nome_curto, ''), b.nome, e.beneficiario_texto)::TEXT,
         COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT,
         COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade,
         e.etapa::TEXT,
         e.etapa_em,
         t.documento_sei::TEXT,
         t.data
    FROM public.fisc_entregas e
    LEFT JOIN LATERAL public.fisc_item_da_ata(e.item_key) i ON TRUE
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN LATERAL (
      SELECT m.documento_sei, m.data
        FROM public.fisc_entrega_movimentos m
       WHERE m.entrega_id = e.id AND m.etapa = 'TRD' AND NULLIF(btrim(m.documento_sei), '') IS NOT NULL
       ORDER BY m.criado_em DESC
       LIMIT 1
    ) t ON TRUE
   WHERE e.contract_key = v_key
     AND e.responsavel = 'SFC'
     AND e.encerrada_em IS NULL
   ORDER BY 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.execucao_entregas_do_contrato(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.execucao_entregas_do_contrato(TEXT) TO authenticated;

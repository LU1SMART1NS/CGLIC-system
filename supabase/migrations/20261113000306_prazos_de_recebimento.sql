-- ==============================================================================
-- Versão: 20261113000306_prazos_de_recebimento.sql
-- Prazos do recebimento (TRP e TRD), envio ao pagamento e comissão de recebimento (protótipo aprovado em 13/11/2026).
--
-- Os dias do TRP e do TRD vêm do Termo de Referência de cada ata: lidos (sugestão) e confirmados pelo gestor da ata na
-- mesma janela do prazo de entrega, com confirmação própria. O fiscal corrige no contrato, com motivo. Os números que
-- valem para todos (envio ao pagamento 5 dias úteis depois do TRD, cobrar a comissão a cada 10 dias) ficam em Ajustes ›
-- Regras e alertas (alert_settings).
--
-- 1) Colunas: ata_prazo_entrega (sugestão, trechos e o recebimento confirmado), fisc_contratos.prazo_recebimento e
--    fisc_entregas (envio à comissão, última cobrança, número de cobranças); movimentos COMISSAO e COBRANCA.
-- 2) Carga da sugestão: 95 compras lidas no PNCP em 13/11/2026 (TR/edital), para as atas já lidas pela migration 301.
-- 3) fisc_regra_de_recebimento(contrato): a do contrato ou a das atas confirmadas que concordam.
-- 4) Leituras: fisc_contratos_para_distribuicao (prazo_recebimento) e fisc_entregas_lista (TRP até, TRD até, envio até,
--    comissão).
-- 5) RPCs: definir_prazo_recebimento_contrato, registrar_comissao_recebimento e confirmar_prazo_entrega_ata com o
--    recebimento (p_recebimento; sem ele, nada muda no recebimento).
-- 6) Início: ata com o recebimento a confirmar entra na lista de prazos a confirmar.
-- 7) Leitura automática do TR das atas novas grava também a sugestão do recebimento.
-- ==============================================================================

-- 1) Colunas ------------------------------------------------------------------------------------------------
-- Regra normalizada (só as cinco chaves, valores válidos) ou NULL.
CREATE OR REPLACE FUNCTION public.fisc_recebimento_normalizado(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  -- CASE aninhado: o número só é convertido depois de conferido (o AND não garante a ordem).
  SELECT CASE WHEN jsonb_typeof(p) = 'object' AND COALESCE(p->>'trpDias', '') ~ '^\d{1,2}$' AND COALESCE(p->>'trdDias', '') ~ '^\d{1,2}$' THEN
           CASE WHEN (p->>'trpDias')::INTEGER BETWEEN 0 AND 90 AND (p->>'trdDias')::INTEGER BETWEEN 1 AND 90
                 AND p->>'trpContagem' IN ('CORRIDOS', 'UTEIS') AND p->>'trdContagem' IN ('CORRIDOS', 'UTEIS')
                 AND p->>'trdInicio' IN ('ENTREGA', 'TRP')
           THEN jsonb_build_object('trpDias', (p->>'trpDias')::INTEGER, 'trpContagem', p->>'trpContagem',
                                   'trdDias', (p->>'trdDias')::INTEGER, 'trdContagem', p->>'trdContagem', 'trdInicio', p->>'trdInicio')
           END
         END;
$$;
REVOKE ALL ON FUNCTION public.fisc_recebimento_normalizado(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_recebimento_normalizado(JSONB) TO authenticated, service_role;

ALTER TABLE public.ata_prazo_entrega
  ADD COLUMN IF NOT EXISTS recebimento_sugerido            JSONB,
  ADD COLUMN IF NOT EXISTS recebimento_trechos             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recebimento                     JSONB,
  ADD COLUMN IF NOT EXISTS recebimento_motivo              TEXT,
  ADD COLUMN IF NOT EXISTS recebimento_confirmado_por_nome VARCHAR(200),
  ADD COLUMN IF NOT EXISTS recebimento_confirmado_em       TIMESTAMPTZ;
ALTER TABLE public.ata_prazo_entrega DROP CONSTRAINT IF EXISTS ata_prazo_entrega_recebimento;
ALTER TABLE public.ata_prazo_entrega ADD CONSTRAINT ata_prazo_entrega_recebimento CHECK (
  (recebimento IS NULL OR recebimento = public.fisc_recebimento_normalizado(recebimento))
  AND (recebimento_sugerido IS NULL OR recebimento_sugerido = public.fisc_recebimento_normalizado(recebimento_sugerido))
  AND (recebimento IS NULL OR recebimento_confirmado_em IS NOT NULL));
COMMENT ON COLUMN public.ata_prazo_entrega.recebimento IS
  'Prazos do TRP e do TRD confirmados pelo gestor da ata (migration 306). Com recebimento_confirmado_em e recebimento NULL: o TR não traz o prazo.';

-- Prazo de recebimento informado no contrato: a regra (as cinco chaves) + origem CONTRATO, motivo, quem e quando.
ALTER TABLE public.fisc_contratos ADD COLUMN IF NOT EXISTS prazo_recebimento JSONB;
ALTER TABLE public.fisc_contratos DROP CONSTRAINT IF EXISTS fisc_contratos_prazo_recebimento;
ALTER TABLE public.fisc_contratos ADD CONSTRAINT fisc_contratos_prazo_recebimento CHECK (
  prazo_recebimento IS NULL OR public.fisc_recebimento_normalizado(prazo_recebimento) IS NOT NULL);

ALTER TABLE public.fisc_entregas
  ADD COLUMN IF NOT EXISTS comissao_enviada_em DATE,
  ADD COLUMN IF NOT EXISTS comissao_cobrada_em DATE,
  ADD COLUMN IF NOT EXISTS comissao_cobrancas  INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.fisc_entregas.comissao_enviada_em IS
  'Envio do item entregue à comissão de recebimento para o TRP (migration 306). Sem TRP, cobrar a cada N dias (alert_settings fiscalizacao.cobrarComissaoDias).';

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo CHECK (tipo IN (
  'CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM', 'BENEFICIARIO',
  'VOLTA', 'DESFEITO', 'CORRECAO', 'ENCERRADA', 'REABERTA', 'RECEBIMENTO', 'PRORROGACAO', 'SUSPENSAO', 'PRAZO',
  'COMISSAO', 'COBRANCA'));

-- 2) Carga da sugestão (chave C:ano/sequencial da compra, ou A:número da ata quando o texto foi lido pela ata) --------
WITH lido (chave, trp_dias, trp_cont, trd_dias, trd_cont, trd_inicio, trechos) AS (VALUES
  ('A:00001/2025', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00001/2026', 10, 'CORRIDOS', 5, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de dias, contados do recebimento provisório, por servidor ou05 (cinco) comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguint']::TEXT[]),
  ('A:00002/2026', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00003/2026', 10, 'CORRIDOS', 5, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de dias, contados do recebimento provisório, por servidor ou05 (cinco) comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguint']::TEXT[]),
  ('A:00005/2025', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 15 (quinze) dias úteis, a contar da conclusão do módulo básico de 40 horas do treinamento oferecido pela contratada com o equipamento instalado e recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, medi']::TEXT[]),
  ('A:00006/2025', 0, 'CORRIDOS', 30, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e UASG 200331 Termo de Referência 102/2024 19 de 27 fiscalização','Recebidos definitivamente no prazo de 30 (trinta) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os segui']::TEXT[]),
  ('A:00013/2025', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação da sua conformidade com as especificações constan','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado 7']::TEXT[]),
  ('A:00020/2026', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00024/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00024/2026', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00036/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00037/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00040/2025', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00047/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00048/2025', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento no endereço de destino indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente pela Administração, após verificação da compatibilidade do objeto entreg']::TEXT[]),
  ('A:00050/2025', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00051/2024', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, no endereçonacionais ou nacionalizados indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado com as espec']::TEXT[]),
  ('A:00052/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00058/2025', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00059/2024', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00073/2025', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00074/2025', 0, 'CORRIDOS', 30, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de a contar do recebimento da nota30 (trinta) dias úteis, fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00090/2024', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00102/2024', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00108/2024', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('A:00111/2024', 5, 'CORRIDOS', 10, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 05 (cinco) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de 10 (dez) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguinte']::TEXT[]),
  ('C:2023/108', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 15 (quinze) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2023/1023', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/291', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento no endereço de destino indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente pela Administração, após verificação da compatibilidade do objeto entreg']::TEXT[]),
  ('C:2024/347', 0, 'CORRIDOS', 30, 'CORRIDOS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 30 (trinta dias), a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/390', 0, 'CORRIDOS', 10, 'UTEIS', 'TRP', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento provisório, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/434', 5, 'CORRIDOS', 10, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 05 (cinco) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de 10 (dez) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguinte']::TEXT[]),
  ('C:2024/709', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/808', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material com as especificações constantes neste Termo de Referência,']::TEXT[]),
  ('C:2024/813', 10, 'CORRIDOS', 10, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente, no prazo de 10 (dez) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguint']::TEXT[]),
  ('C:2024/820', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/827', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/839', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/905', 0, 'CORRIDOS', 15, 'CORRIDOS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de , a contar do recebimento da nota fiscal ou15 (quinze) dias corridos instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/947', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1048', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1077', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1096', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1097', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, no endereçonacionais ou nacionalizados indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado com as espec']::TEXT[]),
  ('C:2024/1102', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1112', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1115', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento no endereço de destino indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente pela Administração, após verificação da compatibilidade do objeto entreg']::TEXT[]),
  ('C:2024/1130', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1132', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1157', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1169', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1197', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1233', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1264', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1265', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1385', 0, 'CORRIDOS', 30, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e UASG 200331 Termo de Referência 102/2024 19 de 27 fiscalização','Recebidos definitivamente no prazo de 30 (trinta) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os segui']::TEXT[]),
  ('C:2024/1398', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação da sua conformidade com as especificações constan','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado 7']::TEXT[]),
  ('C:2024/1400', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 15 (quinze) dias úteis, a contar da conclusão do módulo básico de 40 horas do treinamento oferecido pela contratada com o equipamento instalado e recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, medi']::TEXT[]),
  ('C:2024/1407', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1408', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de , a contar do recebimento da nota fiscal ou instrumento de8 (oito) dias úteis cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1410', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1413', 0, 'CORRIDOS', 25, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pela comissão de recebimento provisório do ente federativo, a fim da verificação de sua conformidade e adequação com as especificaçõ','Recebimento definitivo ocorrerá no prazo de 25 (vinte e cinco) dias úteis, a contar do recebimento provisório no endereço de destino indicado pelo contratante, juntamente com a nota fiscal ou instrumento de cobrança equivalente pela Administração']::TEXT[]),
  ('C:2024/1431', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1436', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2024/1544', 10, 'CORRIDOS', 30, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de 30 (trinta) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os segui']::TEXT[]),
  ('C:2025/219', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de quinze (15) dias úteis, a contar do cumprimento das etapas de entrega, instalação e capacitação, quando forem previstas para o item após a verificação da qualidade e quantidade do material e, consequente aceitação mediante termo detalha']::TEXT[]),
  ('C:2025/220', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/304', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/322', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/450', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/571', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/641', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/669', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/670', 10, 'CORRIDOS', 10, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente no prazo de 10 (dez) dias corridos após o término da execução dos ensaios, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as especificações constantes neste','Recebidos definitivamente no prazo de 10 (dez) dias corridos, contados do recebimento provisório, após UASG 200331 Termo de Referência 34/2024 Câmara Nacional de Modelos de Licitações e Contratos da Consultoria-Geral da União Modelo de Serviços sem dedicação — Atualização: maio/2']::TEXT[]),
  ('C:2025/704', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/724', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/835', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/996', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1102', 0, 'CORRIDOS', 5, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 5 (cinco) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1176', 30, 'UTEIS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, no prazo de 30 (trinta) dias úteis, pelos fiscais técnico e administrativo, mediante termo detalhado (anexo III), quando verificado o cumprimento das exigências de caráter técnico (Art','Recebidos definitivamente no prazo de , contados da efetiva15 (quinze) dias úteis prestação da parcela do(s) serviço(s) entregue(s), por servidor ou comissão designada pela autoridade competente, mediante termo detalhado que comprove o atendimento das exigências contratuais (Art']::TEXT[]),
  ('C:2025/1276', 0, 'CORRIDOS', 30, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de a contar do recebimento da nota30 (trinta) dias úteis, fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1313', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1331', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1384', 30, 'UTEIS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, no prazo de 30 (trinta) dias úteis, pelos fiscais técnico e administrativo, mediante termo detalhado, quando verificado o cumprimento das exigências de caráter técnico (Art','Recebidos definitivamente no prazo de 15 (quinze) dias úteis, contados da efetiva prestação da parcela do(s) serviço(s) entregue(s), por servidor ou comissão designada pela autoridade competente, mediante termo detalhado que comprove o atendimento das exigências contratuais (Art']::TEXT[]),
  ('C:2025/1431', 10, 'CORRIDOS', 5, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de dias, contados do recebimento provisório, por servidor ou05 (cinco) comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguint']::TEXT[]),
  ('C:2025/1447', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1524', 0, 'CORRIDOS', 8, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 8 (oito) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1576', 0, 'CORRIDOS', 5, 'CORRIDOS', 'TRP', ARRAY['Recebidos definitivamente no prazo de 05 (cinco) dias, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguin']::TEXT[]),
  ('C:2025/1637', 10, 'CORRIDOS', 5, 'CORRIDOS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de dias, contados do recebimento provisório, por servidor ou05 (cinco) comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os seguint']::TEXT[]),
  ('C:2025/1651', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1664', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2025/1665', 10, 'UTEIS', 10, 'UTEIS', 'TRP', ARRAY['Recebidos provisoriamente, no prazo de 10 (dez) dias úteis, pelos fiscais técnico e administrativo, mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo','Recebidos definitivamente no prazo de 10 (dez) dias úteis, contados do recebimento provisório, por servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e consequente aceitação mediante termo detalhado, obedecendo os se']::TEXT[]),
  ('C:2025/1667', 0, 'CORRIDOS', 10, 'UTEIS', 'ENTREGA', ARRAY['Recebimento definitivo ocorrerá no prazo de 10 (dez) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2026/275', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de 15 (quinze) dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[]),
  ('C:2026/366', 0, 'CORRIDOS', 15, 'UTEIS', 'ENTREGA', ARRAY['Recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal ou instrumento de cobrança equivalente, pelo(a) responsável pelo acompanhamento e fiscalização do contrato, para efeito de posterior verificação de sua conformidade com as','Recebimento definitivo ocorrerá no prazo de dias úteis, a contar do recebimento da nota fiscal ou instrumento de15 (quinze) cobrança equivalente pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado']::TEXT[])
),
alvo AS (
  -- Pela compra: o link do edital gravado na leitura de 13/11/2026 termina em /ano/sequencial.
  SELECT p.ata_key, l.* FROM lido l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'C:%'
     AND p.url ~ ('/editais/[0-9]+/' || split_part(substr(l.chave, 3), '/', 1) || '/' || split_part(substr(l.chave, 3), '/', 2) || '$')
  UNION ALL
  -- Pelo número da ata, só quando o número é de uma ata só e ela não veio pela compra.
  SELECT p.ata_key, l.* FROM lido l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'A:%' AND p.numero_ata = substr(l.chave, 3)
   WHERE (SELECT count(*) FROM public.ata_prazo_entrega x WHERE x.numero_ata = substr(l.chave, 3)) = 1
)
UPDATE public.ata_prazo_entrega p
   SET recebimento_sugerido = jsonb_build_object('trpDias', a.trp_dias, 'trpContagem', a.trp_cont, 'trdDias', a.trd_dias,
                                                 'trdContagem', a.trd_cont, 'trdInicio', a.trd_inicio),
       recebimento_trechos = a.trechos
  FROM (SELECT DISTINCT ON (ata_key) * FROM alvo ORDER BY ata_key, chave) a
 WHERE p.ata_key = a.ata_key AND p.recebimento_sugerido IS NULL;

-- 3) A regra do recebimento do contrato ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_regra_de_recebimento(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c      JSONB;
  v_atas   TEXT[];
  v_regras INTEGER;
  a        public.ata_prazo_entrega%ROWTYPE;
  n        INTEGER;
BEGIN
  SELECT f.prazo_recebimento INTO v_c FROM public.fisc_contratos f WHERE f.contract_key = p_contrato;
  IF v_c IS NOT NULL THEN RETURN v_c; END IF;
  SELECT array_agg(DISTINCT public.ata_key_from_item_key(l.item_key)) INTO v_atas
    FROM public.arp_item_contract_links l WHERE l.contract_key = p_contrato;
  IF v_atas IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT p.recebimento) INTO v_regras
    FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.recebimento IS NOT NULL;
  IF v_regras = 0 THEN RETURN NULL; END IF;
  IF v_regras > 1 THEN RETURN jsonb_build_object('conflito', TRUE); END IF;
  SELECT * INTO a FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.recebimento IS NOT NULL ORDER BY p.ata_key LIMIT 1;
  n := cardinality(a.recebimento_trechos);
  RETURN a.recebimento || jsonb_build_object('origem', 'TR', 'ata', a.numero_ata, 'confirmadoPor', a.recebimento_confirmado_por_nome,
                                             'trechoTrp', CASE WHEN n >= 2 THEN a.recebimento_trechos[1] END,
                                             'trechoTrd', CASE WHEN n >= 1 THEN a.recebimento_trechos[n] END);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_regra_de_recebimento(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_regra_de_recebimento(TEXT) TO authenticated, service_role;

-- Prazo interno do envio ao pagamento (dias úteis do TRD), de Ajustes › Regras e alertas.
CREATE OR REPLACE FUNCTION public.fisc_envio_pagamento_dias()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'fiscalizacao.envioPagamentoDiasUteis'), 5);
$$;
REVOKE ALL ON FUNCTION public.fisc_envio_pagamento_dias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_envio_pagamento_dias() TO authenticated, service_role;

-- 4) Leituras ------------------------------------------------------------------------------------------------
DROP FUNCTION public.fisc_contratos_para_distribuicao();
CREATE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[], unidade_area text, unidades_do_contrato text[], processo_nup text, processo_autuado_em date, prazo_entrega jsonb, prazo_recebimento jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emendas AS (
    SELECT n.contract_key AS chave, array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL) AS lista, TRUE AS de_emenda
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
     WHERE n.contract_key IS NOT NULL
     GROUP BY n.contract_key
  ),
  atas AS (
    -- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
    SELECT k.contract_key AS chave, array_agg(DISTINCT split_part(k.item_key, '-', 1) ORDER BY split_part(k.item_key, '-', 1)) AS lista
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
  ),
  -- Unidades internas do contrato: pela divisão do contratado (migration 103) ou, sem divisão, pela alocação dos
  -- itens da ata ligados ao contrato. Sugestão para a área requisitante.
  divisao AS (
    SELECT u.contract_key AS chave, array_agg(DISTINCT u.unit_name::TEXT ORDER BY u.unit_name::TEXT) AS lista
      FROM public.contrato_item_divisao_unidades u
     GROUP BY u.contract_key
  ),
  alocacao AS (
    SELECT k.contract_key AS chave, array_agg(DISTINCT a.unit_name::TEXT ORDER BY a.unit_name::TEXT) AS lista
      FROM public.arp_item_contract_links k
      JOIN public.arp_allocations a ON a.item_key = k.item_key AND a.allocated_qty > 0
     GROUP BY k.contract_key
  ),
  contratos AS (
    SELECT DISTINCT ON (c.contract_key) c.*
      FROM public.contratos_oficiais c
     ORDER BY c.contract_key, c.sincronizado_em DESC
  )
  SELECT c.contract_key::TEXT,
         c.uasg::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         (c.registro->>'objeto')::TEXT,
         NULLIF(c.registro->>'dataAssinatura', '')::DATE,
         c.data_vigencia_fim,
         COALESCE(e.lista, ARRAY[]::TEXT[]),
         CASE WHEN f.contract_key IS NOT NULL THEN f.fiscalizacao::TEXT
              WHEN e.de_emenda THEN 'A_DEFINIR'
              ELSE 'AREA_PADRAO' END,
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em,
         COALESCE(at.lista, ARRAY[]::TEXT[]),
         f.unidade_area::TEXT,
         COALESCE(dv.lista, al.lista, ARRAY[]::TEXT[]),
         f.processo_nup::TEXT, f.processo_autuado_em,
         public.fisc_regra_do_contrato(c.contract_key::TEXT),
         public.fisc_regra_de_recebimento(c.contract_key::TEXT)
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN divisao dv ON dv.chave = c.contract_key
    LEFT JOIN alocacao al ON al.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;

DROP FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN);
CREATE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text, p_encerradas boolean DEFAULT false)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text, aviso jsonb, encerrada_em date, encerrada_motivo text, prevista_origem text, ordem_recebida_em date, prazo_dias integer, prevista_anterior date, prevista_original date, dias_suspensos integer, prazo_inicio text, prazo_contagem text, trp_ate date, trd_ate date, envio_ate date, regra_recebimento boolean, comissao_enviada_em date, comissao_cobrada_em date, comissao_cobrancas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_envio INTEGER := public.fisc_envio_pagamento_dias();
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  -- Regra do recebimento por contrato (uma chamada por contrato, não por item), só nos contratos com item entregue ou
  -- no TRP: é onde as datas do TRP e do TRD são usadas (o envio conta do TRD, sem a regra).
  WITH regras AS MATERIALIZED (
    SELECT k.ck, rr.r, (rr.r IS NOT NULL AND NOT (rr.r ? 'conflito')) AS valida
      FROM (SELECT DISTINCT fe.contract_key::TEXT AS ck FROM public.fisc_entregas fe
             WHERE (p_contrato IS NULL OR fe.contract_key = p_contrato) AND fe.etapa IN ('ENTREGUE', 'TRP') AND fe.encerrada_em IS NULL) k
      CROSS JOIN LATERAL (SELECT public.fisc_regra_de_recebimento(k.ck) AS r) rr
  )
  SELECT e.id, e.contract_key::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero, e.contract_key)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         f.fiscal_user_id, f.fiscal_nome::TEXT, f.fiscalizacao::TEXT,
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT, e.item_texto,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, e.beneficiario_texto, COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT, COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade, e.origem::TEXT, COALESCE(p.siop_emenda::TEXT, e.emenda_texto), p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de,
         COALESCE(pr.nome, e.programa_texto)::TEXT, e.carga_linha,
         n.faturado_em::DATE, n.pago_em::DATE, e.atualizado_por_nome::TEXT, e.atualizado_em,
         e.programa_id, pr.ativo, a.nome::TEXT,
         b.entrega_logradouro::TEXT, b.entrega_numero::TEXT, b.entrega_complemento::TEXT, b.entrega_bairro::TEXT, b.entrega_cep::TEXT,
         CASE WHEN e.encerrada_em IS NULL AND e.emenda_linha_id IS NOT NULL THEN public.fisc_aviso_da_entrega(e.emenda_linha_id, e.contract_key::TEXT) END,
         e.encerrada_em, e.encerrada_motivo::TEXT,
         e.prevista_origem::TEXT, e.ordem_recebida_em, e.prazo_dias, e.prevista_anterior, e.prevista_original, e.dias_suspensos, COALESCE(f.prazo_inicio, ra.inicio)::TEXT, COALESCE(f.prazo_contagem, ra.contagem)::TEXT,
         -- Até quando: TRP (no ato da entrega = o próprio dia), TRD (da entrega ou do TRP) e envio ao pagamento (do TRD).
         CASE WHEN e.etapa = 'ENTREGUE' AND e.entregue_em IS NOT NULL AND rg.valida THEN
                CASE WHEN (rg.r->>'trpDias')::INTEGER = 0 THEN e.entregue_em
                     ELSE public.fisc_prevista_pela_regra(e.entregue_em, (rg.r->>'trpDias')::INTEGER, rg.r->>'trpContagem') END END,
         CASE WHEN e.etapa = 'TRP' AND rg.valida THEN
                public.fisc_prevista_pela_regra(CASE WHEN rg.r->>'trdInicio' = 'TRP' THEN COALESCE(e.etapa_em, e.entregue_em) ELSE e.entregue_em END,
                                                (rg.r->>'trdDias')::INTEGER, rg.r->>'trdContagem') END,
         CASE WHEN e.etapa = 'TRD' AND e.etapa_em IS NOT NULL THEN public.fisc_prevista_pela_regra(e.etapa_em, v_envio, 'UTEIS') END,
         COALESCE(rg.valida, FALSE),
         e.comissao_enviada_em, e.comissao_cobrada_em, e.comissao_cobrancas
    FROM public.fisc_entregas e
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
    LEFT JOIN regras rg ON rg.ck = e.contract_key::TEXT
    -- Regra herdada das atas (a mesma de fisc_regra_do_contrato, só o que a lista usa): as atas confirmadas concordam.
    LEFT JOIN (SELECT l.contract_key, min(pz.inicio) AS inicio, min(pz.contagem) AS contagem
                 FROM public.arp_item_contract_links l
                 JOIN public.ata_prazo_entrega pz ON pz.ata_key = public.ata_key_from_item_key(l.item_key)
                                                 AND pz.confirmado_em IS NOT NULL AND NOT pz.sem_prazo
                WHERE p_contrato IS NULL OR l.contract_key = p_contrato
                GROUP BY l.contract_key
               HAVING count(DISTINCT (pz.dias, pz.contagem, pz.inicio)) = 1) ra ON ra.contract_key = e.contract_key
    LEFT JOIN LATERAL (SELECT co.* FROM public.contratos_oficiais co WHERE co.contract_key = e.contract_key ORDER BY co.sincronizado_em DESC LIMIT 1) c ON TRUE
    LEFT JOIN LATERAL public.fisc_item_da_ata(e.item_key) i ON TRUE
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    LEFT JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
    LEFT JOIN public.fisc_programas pr ON pr.id = e.programa_id
   WHERE (p_contrato IS NULL OR e.contract_key = p_contrato)
     AND (p_encerradas OR e.encerrada_em IS NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN) TO authenticated;

-- 5) RPCs ----------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_prazo_recebimento_contrato(p_contract_key TEXT, p_trp_dias INTEGER, p_trp_contagem TEXT,
                                                                    p_trd_dias INTEGER, p_trd_contagem TEXT, p_trd_inicio TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f      public.fisc_contratos%ROWTYPE;
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nova JSONB;
  v_hoje JSONB;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Contrato sem fiscalização definida.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM f.fiscal_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador definem o prazo deste contrato.' USING ERRCODE = '42501';
  END IF;
  -- Sem TRD: o contrato volta a seguir o TR da ata.
  IF p_trd_dias IS NULL THEN
    UPDATE public.fisc_contratos SET prazo_recebimento = NULL, atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE contract_key = p_contract_key;
    RETURN jsonb_build_object('contrato', p_contract_key, 'regra', NULL);
  END IF;
  v_nova := public.fisc_recebimento_normalizado(jsonb_build_object('trpDias', p_trp_dias, 'trpContagem', p_trp_contagem,
                                                                   'trdDias', p_trd_dias, 'trdContagem', p_trd_contagem, 'trdInicio', p_trd_inicio));
  IF v_nova IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de recebimento inválido (TRP de 0 a 90 dias, TRD de 1 a 90).' USING ERRCODE = '22023';
  END IF;
  v_hoje := public.fisc_regra_de_recebimento(p_contract_key);
  IF v_hoje IS NOT NULL AND NOT (v_hoje ? 'conflito') AND public.fisc_recebimento_normalizado(v_hoje) IS DISTINCT FROM v_nova
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo de recebimento muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_contratos
     SET prazo_recebimento = v_nova || jsonb_build_object('origem', 'CONTRATO', 'motivo', v_mot, 'definidoPor', v_nome,
                                                          'definidoEm', to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')),
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  RETURN jsonb_build_object('contrato', p_contract_key, 'regra', v_nova);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_prazo_recebimento_contrato(TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_prazo_recebimento_contrato(TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Envio à comissão de recebimento (para o TRP) ou nova cobrança.
CREATE OR REPLACE FUNCTION public.registrar_comissao_recebimento(p_ids UUID[], p_tipo TEXT, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_sei  TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_n    INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF p_tipo NOT IN ('ENVIO', 'COBRANCA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data até hoje.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
              AND (responsavel <> 'SFC' OR etapa <> 'ENTREGUE' OR entregue_em IS NULL OR encerrada_em IS NOT NULL)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens entregues (com a data da entrega) e ainda sem o TRP.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND p_data < entregue_em) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data não pode ser antes da entrega.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'COBRANCA' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids)
                                       AND (comissao_enviada_em IS NULL OR p_data < comissao_enviada_em)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A cobrança vem depois do envio à comissão.' USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'ENVIO' THEN
    UPDATE public.fisc_entregas
       SET comissao_enviada_em = p_data, comissao_cobrada_em = NULL, comissao_cobrancas = 0, atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = ANY (p_ids);
  ELSE
    UPDATE public.fisc_entregas
       SET comissao_cobrada_em = p_data, comissao_cobrancas = comissao_cobrancas + 1, atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = ANY (p_ids);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT e.id, CASE WHEN p_tipo = 'ENVIO' THEN 'COMISSAO' ELSE 'COBRANCA' END, p_data, v_sei,
         CASE WHEN p_tipo = 'ENVIO' THEN 'enviado à comissão de recebimento para o TRP'
              ELSE format('%sª cobrança à comissão de recebimento', e.comissao_cobrancas) END,
         auth.uid(), v_nome
    FROM public.fisc_entregas e WHERE e.id = ANY (p_ids);
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_comissao_recebimento(UUID[], TEXT, DATE, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_comissao_recebimento(UUID[], TEXT, DATE, TEXT) TO authenticated;

-- Confirmação dos prazos da ata, agora com o recebimento.
DROP FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT);
CREATE FUNCTION public.confirmar_prazo_entrega_ata(p_ata_key TEXT, p_sem_prazo BOOLEAN, p_dias INTEGER, p_contagem TEXT,
                                                              p_inicio TEXT, p_por_item JSONB, p_motivo TEXT,
                                                     p_recebimento JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_mot   TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_key   TEXT := btrim(COALESCE(p_ata_key, ''));
  v_item  JSONB := COALESCE(p_por_item, '{}'::JSONB);
  p       public.ata_prazo_entrega%ROWTYPE;
  v_c     RECORD;
  v_ct    INTEGER := 0;
  v_it    INTEGER := 0;
  -- Recebimento (migration 306): NULL = não mexe; {"naoDiz": true} = o TR não traz o prazo; senão, a regra.
  v_rec_informado BOOLEAN := p_recebimento IS NOT NULL;
  v_rec   JSONB := CASE WHEN p_recebimento IS NULL OR COALESCE((p_recebimento->>'naoDiz')::BOOLEAN, FALSE) THEN NULL
                        ELSE public.fisc_recebimento_normalizado(p_recebimento) END;
  v_entrega_mudou BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Faça login.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role('admin')
     AND NOT EXISTS (SELECT 1 FROM public.ata_managers am WHERE am.ata_key = v_key AND am.gestor_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador confirmam o prazo de entrega.' USING ERRCODE = '42501';
  END IF;
  IF v_key !~ '^\d{5}/\d{4}(-\d{6})?$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ata inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_sem_prazo, FALSE) THEN
    IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de 1 a 730 dias.' USING ERRCODE = '22023';
    END IF;
    IF p_contagem NOT IN ('CORRIDOS', 'UTEIS') OR p_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contagem ou início do prazo inválido.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_item) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_each(v_item) x
                                                     WHERE x.key !~ '^\d{1,5}$' OR jsonb_typeof(x.value) <> 'number'
                                                        OR (x.value)::TEXT::NUMERIC NOT BETWEEN 1 AND 730) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo por item inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_rec_informado AND v_rec IS NULL AND NOT COALESCE((p_recebimento->>'naoDiz')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de recebimento inválido (TRP de 0 a 90 dias, TRD de 1 a 90).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO p FROM public.ata_prazo_entrega WHERE ata_key = v_key FOR UPDATE;
  v_entrega_mudou := NOT FOUND OR p.confirmado_em IS NULL
     OR (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
        (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
         CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END);
  IF FOUND AND v_rec_informado AND p.recebimento_confirmado_em IS NOT NULL AND p.recebimento IS DISTINCT FROM v_rec
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo de recebimento confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  IF FOUND AND p.confirmado_em IS NOT NULL
     AND (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
         (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END)
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_prazo_entrega AS t (ata_key, numero_ata, uasg, sem_prazo, dias, contagem, inicio, por_item, motivo,
                                             confirmado_por, confirmado_por_nome, confirmado_em)
  VALUES (v_key, split_part(v_key, '-', 1), NULLIF(split_part(v_key, '-', 2), ''), COALESCE(p_sem_prazo, FALSE),
          CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
          CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END, v_mot,
          auth.uid(), v_nome, NOW())
  ON CONFLICT (ata_key) DO UPDATE
     SET sem_prazo = EXCLUDED.sem_prazo, dias = EXCLUDED.dias, contagem = EXCLUDED.contagem, inicio = EXCLUDED.inicio,
         por_item = EXCLUDED.por_item, motivo = CASE WHEN v_entrega_mudou THEN COALESCE(EXCLUDED.motivo, t.motivo) ELSE t.motivo END,
         -- Só o recebimento confirmado: o prazo de entrega guarda quem e quando o confirmou.
         confirmado_por = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_por ELSE t.confirmado_por END,
         confirmado_por_nome = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_por_nome ELSE t.confirmado_por_nome END,
         confirmado_em = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_em ELSE t.confirmado_em END;

  IF v_rec_informado THEN
    UPDATE public.ata_prazo_entrega
       SET recebimento = v_rec,
           recebimento_motivo = CASE WHEN recebimento_confirmado_em IS NOT NULL AND recebimento IS DISTINCT FROM v_rec THEN v_mot ELSE recebimento_motivo END,
           recebimento_confirmado_por_nome = v_nome, recebimento_confirmado_em = NOW()
     WHERE ata_key = v_key;
  END IF;

  -- Contratos da ata que herdam: os itens que já podem ter a data recebem agora.
  FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
              JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
             WHERE public.ata_key_from_item_key(l.item_key) = v_key LOOP
    v_ct := v_ct + 1;
    v_it := v_it + public.fisc_aplicar_regra_aos_itens(v_c.contract_key, v_nome);
  END LOOP;
  RETURN jsonb_build_object('ata', v_key, 'contratos', v_ct, 'itens_com_data', v_it);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB) TO authenticated;

-- 6) Início: prazos a confirmar (entrega ou recebimento) ------------------------------------------------------
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
   WHERE p.confirmado_em IS NULL OR p.recebimento_confirmado_em IS NULL
  UNION ALL
  SELECT (jsonb_populate_record(NULL::public.ata_prazo_entrega,
            jsonb_build_object('ata_key', a.ata_key, 'numero_ata', split_part(a.ata_key, '-', 1), 'trechos', '{}'::TEXT[],
                               'por_item', '{}'::JSONB, 'contagem_dita', FALSE, 'sem_prazo', FALSE, 'recebimento_trechos', '{}'::TEXT[]))).*
    FROM acompanhadas a
   WHERE a.ata_key IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ata_prazo_entrega p WHERE p.ata_key = a.ata_key);
$$;
REVOKE ALL ON FUNCTION public.atas_prazo_a_confirmar() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.atas_prazo_a_confirmar() TO authenticated;

-- 7) Leitura automática do TR das atas novas com o recebimento --------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_leitura_prazo_tr(p_payload JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_compra  TEXT := p_payload->>'numero_controle_compra';
  v_leitura TEXT := p_payload->>'leitura';
  v_dias    INTEGER := NULLIF(p_payload->>'dias', '')::INTEGER;
  v_cont    TEXT := NULLIF(p_payload->>'contagem', '');
  v_inicio  TEXT := NULLIF(p_payload->>'inicio', '');
  v_trechos TEXT[];
  v_n       INTEGER;
  v_trechos_rec TEXT[];
BEGIN
  IF v_compra IS NULL OR v_compra !~ '^[0-9]{14}-1-[0-9]{6}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Compra inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_leitura NOT IN ('CLARO', 'CONFERIR', 'SEM_CLAUSULA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Leitura inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_dias IS NOT NULL AND v_dias NOT BETWEEN 1 AND 730 THEN v_dias := NULL; END IF;
  IF v_cont IS NOT NULL AND v_cont NOT IN ('CORRIDOS', 'UTEIS') THEN v_cont := NULL; END IF;
  IF v_inicio IS NOT NULL AND v_inicio NOT IN ('OF_RECEBIMENTO', 'OF_EMISSAO', 'ASSINATURA', 'EXERCITO') THEN v_inicio := NULL; END IF;
  SELECT COALESCE(array_agg(left(regexp_replace(x, '[\x01-\x1f]', ' ', 'g'), 300)) FILTER (WHERE btrim(x) <> ''), '{}')
    INTO v_trechos FROM jsonb_array_elements_text(COALESCE(p_payload->'trechos', '[]'::JSONB)) x;
  SELECT COALESCE(array_agg(left(regexp_replace(x, '[\x01-\x1f]', ' ', 'g'), 300)) FILTER (WHERE btrim(x) <> ''), '{}')
    INTO v_trechos_rec FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_payload->'recebimento_trechos') = 'array' THEN p_payload->'recebimento_trechos' ELSE '[]'::JSONB END) x;
  v_trechos_rec := v_trechos_rec[1:2];

  INSERT INTO public.ata_prazo_entrega (ata_key, numero_ata, uasg, leitura, leitura_motivo, sugerido_dias, sugerido_contagem, contagem_dita,
                                        sugerido_inicio, trechos, documento, url, lido_em, recebimento_sugerido, recebimento_trechos)
  SELECT DISTINCT ON (a.ata_key) a.ata_key, a.numero_ata, a.uasg, v_leitura, left(NULLIF(p_payload->>'motivo', ''), 300), v_dias, v_cont,
         COALESCE((p_payload->>'contagem_dita')::BOOLEAN, FALSE), v_inicio, v_trechos[1:3], left(NULLIF(p_payload->>'documento', ''), 300),
         left(NULLIF(p_payload->>'url', ''), 300), NOW(),
         public.fisc_recebimento_normalizado(p_payload->'recebimento'), v_trechos_rec
    FROM public.atas_da_compra_para_tr() a
   WHERE a.compra = v_compra
  ON CONFLICT (ata_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.ata_prazo_leituras_tr AS t (numero_controle_compra, tentativas, ultima_tentativa, lida_em)
  VALUES (v_compra, 1, NOW(), NOW())
  ON CONFLICT (numero_controle_compra) DO UPDATE SET lida_em = NOW();
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) TO service_role;

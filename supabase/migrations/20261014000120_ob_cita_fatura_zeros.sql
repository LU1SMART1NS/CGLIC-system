-- ==============================================================================
-- MIGRATION 120: CITAÇÃO DA FATURA NA OB ACEITA ZEROS À ESQUERDA
-- Versão: 20261014000120_ob_cita_fatura_zeros.sql
--
-- Contexto (conferência das faturas aguardando OB em 14/10/2026): a carta de crédito do contrato 00202/2025,
-- R$ 10.000.250,53, está no Contratos.gov.br como fatura "000003007". A OB 2026OB002064 da UG 200330 tem o mesmo
-- valor e a mesma data e a observação "INVOICE 3007, CONTRATO 202/2025", mas a regra da migration 119 exigia o
-- número exato e não ligou a OB à fatura.
--
-- O que muda: ob_cita_fatura aceita número só de dígitos com ou sem zeros à esquerda, dos dois lados ("000003007"
-- casa com "3007" e "3007" casa com "000003007"). O mínimo de 4 caracteres passa a contar sem esses zeros
-- ("0000123" não vale). Número com pontuação ("50.961-0") continua exato. Mesma regra de obCitaFatura em
-- src/services/faturasService.ts.
--
-- O que não muda: a assinatura da função, a view v_contrato_faturas (usa a função) e as demais regras.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ob_cita_fatura(p_observacao TEXT, p_numero TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH n AS (
    SELECT upper(btrim(p_numero)) AS bruto,
           upper(btrim(p_numero)) ~ '^[0-9]+$' AS so_digitos
  ), alvo AS (
    SELECT so_digitos,
           CASE WHEN so_digitos THEN regexp_replace(bruto, '^0+', '') ELSE bruto END AS numero
      FROM n
  )
  SELECT CASE
    WHEN p_observacao IS NULL OR p_numero IS NULL OR length(alvo.numero) < 4 THEN FALSE
    ELSE upper(p_observacao) ~ (
      '(^|[[:space:],;:])'
      || CASE WHEN alvo.so_digitos THEN '0*' ELSE '' END
      || regexp_replace(alvo.numero, '([^[:alnum:]])', '\\\1', 'g')
      || '($|[[:space:],;:]|\.([[:space:]]|$))'
    )
  END
  FROM alvo
$$;

COMMENT ON FUNCTION public.ob_cita_fatura(TEXT, TEXT) IS
  'A observação da OB cita o número da fatura como palavra inteira (mínimo 4 caracteres; número só de dígitos com ou sem zeros à esquerda). Liga a fatura à OB da outra UG da CGLIC.';

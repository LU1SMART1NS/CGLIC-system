-- ==============================================================================
-- Versão: 20261113000311_ocorrencias_da_fiscalizacao.sql
-- Ocorrências do item (entrega B, protótipo aprovado em 16/11/2026): cobrança ao fornecedor, notificação com prazo de
-- resposta, resposta, pedido de prorrogação, pedido negado, recusa no recebimento (abre o prazo de substituição) e
-- substituição. Cada ocorrência fica no histórico do item (movimento OCORRENCIA, com data, SEI e texto) e o item guarda
-- o que está em aberto, para a mesa do Contrato 360 e o aviso "atrasado sem cobrança".
--
-- 1) fisc_entregas: última cobrança, notificação, pedido de prorrogação e recusa em aberto.
-- 2) ata_prazo_entrega: prazo de substituição lido do TR (sugestão, trecho) e o que vale; leitura clara vale sozinha
--    (como os outros prazos, migration 309). Carga: 86 compras lidas em 13/11/2026, 82 claras.
-- 3) fisc_regra_de_substituicao(contrato), lida pelo Contrato 360 (fora da lista de contratos, que ficaria ~370 ms
--    mais lenta); a lista de itens traz as ocorrências em aberto.
-- 4) registrar_ocorrencia_entregas; prorrogar_prazo_entregas decide o pedido em aberto.
-- 5) confirmar_prazo_entrega_ata com o prazo de substituição; leitura das atas novas também o lê.
-- ==============================================================================

-- 1) Item --------------------------------------------------------------------------------------------------------
ALTER TABLE public.fisc_entregas
  ADD COLUMN IF NOT EXISTS ultima_cobranca_em   DATE,
  ADD COLUMN IF NOT EXISTS cobrancas            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notificacao_em       DATE,
  ADD COLUMN IF NOT EXISTS notificacao_ate      DATE,
  ADD COLUMN IF NOT EXISTS notificacao_sei      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pedido_em            DATE,
  ADD COLUMN IF NOT EXISTS pedido_sei           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pedido_nova_data     DATE,
  ADD COLUMN IF NOT EXISTS recusa_em            DATE,
  ADD COLUMN IF NOT EXISTS recusa_notificado_em DATE,
  ADD COLUMN IF NOT EXISTS substituir_ate       DATE,
  ADD COLUMN IF NOT EXISTS recusa_motivo        TEXT;
COMMENT ON COLUMN public.fisc_entregas.ultima_cobranca_em IS
  'Última cobrança ao fornecedor por atraso (migration 311). Sem ela, o item atrasado é do fiscal; cobrado, espera o fornecedor por N dias (alert_settings fiscalizacao.cobrarFornecedorDias).';

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo CHECK (tipo IN (
  'CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM', 'BENEFICIARIO',
  'VOLTA', 'DESFEITO', 'CORRECAO', 'ENCERRADA', 'REABERTA', 'RECEBIMENTO', 'PRORROGACAO', 'SUSPENSAO', 'PRAZO',
  'COMISSAO', 'COBRANCA', 'OCORRENCIA'));

-- 2) Prazo de substituição da ata ----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_substituicao_normalizada(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'object' AND COALESCE(p->>'dias', '') ~ '^\d{1,3}$' THEN
           CASE WHEN (p->>'dias')::INTEGER BETWEEN 1 AND 180 AND COALESCE(p->>'contagem', 'CORRIDOS') IN ('CORRIDOS', 'UTEIS')
           THEN jsonb_build_object('dias', (p->>'dias')::INTEGER, 'contagem', COALESCE(p->>'contagem', 'CORRIDOS')) END
         END;
$$;
REVOKE ALL ON FUNCTION public.fisc_substituicao_normalizada(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_substituicao_normalizada(JSONB) TO authenticated, service_role;

ALTER TABLE public.ata_prazo_entrega
  ADD COLUMN IF NOT EXISTS substituicao_sugerida      JSONB,
  ADD COLUMN IF NOT EXISTS substituicao_trecho        TEXT,
  ADD COLUMN IF NOT EXISTS substituicao               JSONB,
  ADD COLUMN IF NOT EXISTS substituicao_confirmada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS substituicao_automatico    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ata_prazo_entrega DROP CONSTRAINT IF EXISTS ata_prazo_entrega_substituicao;
ALTER TABLE public.ata_prazo_entrega ADD CONSTRAINT ata_prazo_entrega_substituicao CHECK (
  (substituicao IS NULL OR substituicao = public.fisc_substituicao_normalizada(substituicao))
  AND (substituicao_sugerida IS NULL OR substituicao_sugerida = public.fisc_substituicao_normalizada(substituicao_sugerida)));

-- Carga (chave C:ano/sequencial pelo link do edital; A:número da ata quando o número é de uma ata só).
WITH lido (chave, dias, contagem, trecho, clara) AS (VALUES
  ('A:00001/2025', 15, 'CORRIDOS', 'Substituídos no prazo de 15 (quinze) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00002/2026', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00005/2025', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00006/2025', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00013/2025', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00020/2026', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00024/2024', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00024/2026', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez), a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00036/2024', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00037/2024', 20, 'UTEIS', 'Substituídos no prazo de 20 (vinte) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00040/2025', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00047/2024', 20, 'UTEIS', 'Substituídos no prazo de 20 (vinte) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00048/2025', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00050/2025', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00051/2024', 30, 'UTEIS', 'Substituídos no prazo de 30 (trinta) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00052/2024', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00058/2025', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00059/2024', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00073/2025', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00074/2025', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias corridos, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00090/2024', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('A:00102/2024', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', FALSE),
  ('A:00108/2024', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2023/108', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2023/1023', 20, 'UTEIS', 'Substituídos no prazo de 20 (vinte) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/291', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/347', 120, 'CORRIDOS', 'Substituídos no prazo de até 120 (cento e vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', FALSE),
  ('C:2024/390', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/709', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/808', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/820', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/827', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/839', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/905', 30, 'CORRIDOS', 'Substituídos no prazo de a contar30 dias corridos, da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/947', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1048', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1077', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1096', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1097', 30, 'UTEIS', 'Substituídos no prazo de 30 (trinta) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1102', 5, 'CORRIDOS', 'Substituídos no prazo de 5 (cinco) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1112', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1115', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1130', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1132', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1157', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1169', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', FALSE),
  ('C:2024/1197', 15, 'CORRIDOS', 'Substituídos no prazo de 15 (quinze) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1233', 20, 'UTEIS', 'Substituídos no prazo de 20 (vinte) dias úteis, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1264', 15, 'CORRIDOS', 'Substituídos no prazo de 15 (quinze) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1265', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', FALSE),
  ('C:2024/1385', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1398', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1400', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1407', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1408', 30, 'CORRIDOS', 'Substituídos no prazo de dias, a contar da30 (trinta) notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1410', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1413', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1431', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2024/1436', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/219', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/220', 60, 'CORRIDOS', 'Substituídos no prazo de 60 (sessenta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/304', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/322', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/450', 15, 'CORRIDOS', 'Substituídos no prazo de 15 (quinze) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/571', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/641', 5, 'CORRIDOS', 'Substituídos no prazo de 5 (cinco) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/669', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/670', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias corridos, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/675', 10, 'UTEIS', 'Substituídos no prazo de 10 (dez) dias úteis, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/704', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/724', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/835', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/916', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/996', 90, 'CORRIDOS', 'Substituídos no prazo de 90 (noventa) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1176', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1276', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias corridos, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1313', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1331', 30, 'CORRIDOS', 'Substituídos no prazo de , a contar da30 (trinta) dias notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1384', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação do Contratado, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1447', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1524', 30, 'CORRIDOS', 'Substituídos no prazo de 30 (trinta) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1651', 10, 'CORRIDOS', 'Substituídos no prazo de 10 (dez), a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1664', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2025/1667', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2026/275', 20, 'CORRIDOS', 'Substituídos no prazo de 20 (vinte) dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE),
  ('C:2026/366', 20, 'CORRIDOS', 'Substituídos no prazo de dias, a contar da20 (vinte) notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades', TRUE)
),
alvo AS (
  SELECT p.ata_key, l.* FROM lido l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'C:%'
     AND p.url ~ ('/editais/[0-9]+/' || split_part(substr(l.chave, 3), '/', 1) || '/' || split_part(substr(l.chave, 3), '/', 2) || '$')
  UNION ALL
  SELECT p.ata_key, l.* FROM lido l
    JOIN public.ata_prazo_entrega p ON l.chave LIKE 'A:%' AND p.numero_ata = substr(l.chave, 3)
   WHERE (SELECT count(*) FROM public.ata_prazo_entrega x WHERE x.numero_ata = substr(l.chave, 3)) = 1
)
UPDATE public.ata_prazo_entrega p
   SET substituicao_sugerida = jsonb_build_object('dias', a.dias, 'contagem', a.contagem), substituicao_trecho = a.trecho,
       substituicao = CASE WHEN a.clara THEN jsonb_build_object('dias', a.dias, 'contagem', a.contagem) END,
       substituicao_confirmada_em = CASE WHEN a.clara THEN NOW() END, substituicao_automatico = a.clara
  FROM (SELECT DISTINCT ON (ata_key) * FROM alvo ORDER BY ata_key, chave) a
 WHERE p.ata_key = a.ata_key AND p.substituicao_sugerida IS NULL;

-- 3) Regra do contrato e leituras ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fisc_regra_de_substituicao(p_contrato TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atas TEXT[];
  v_n    INTEGER;
  a      public.ata_prazo_entrega%ROWTYPE;
BEGIN
  SELECT array_agg(DISTINCT public.ata_key_from_item_key(l.item_key)) INTO v_atas
    FROM public.arp_item_contract_links l WHERE l.contract_key = p_contrato;
  IF v_atas IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT p.substituicao) INTO v_n FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.substituicao IS NOT NULL;
  IF v_n = 0 THEN RETURN NULL; END IF;
  IF v_n > 1 THEN RETURN jsonb_build_object('conflito', TRUE); END IF;
  SELECT * INTO a FROM public.ata_prazo_entrega p WHERE p.ata_key = ANY (v_atas) AND p.substituicao IS NOT NULL ORDER BY p.ata_key LIMIT 1;
  RETURN a.substituicao || jsonb_build_object('origem', 'TR', 'ata', a.numero_ata, 'automatico', a.substituicao_automatico, 'trecho', a.substituicao_trecho);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_regra_de_substituicao(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fisc_regra_de_substituicao(TEXT) TO authenticated, service_role;


DROP FUNCTION public.fisc_entregas_lista(TEXT, BOOLEAN);
CREATE FUNCTION public.fisc_entregas_lista(p_contrato text DEFAULT NULL::text, p_encerradas boolean DEFAULT false)
 RETURNS TABLE(id uuid, contract_key text, contrato_numero text, fornecedor text, fiscal_user_id uuid, fiscal_nome text, fiscalizacao text, item_key text, item_nome text, item_descricao text, item_texto text, beneficiario_id uuid, beneficiario_nome text, beneficiario_sigla text, beneficiario_razao text, beneficiario_texto text, municipio text, uf text, quantidade integer, origem text, emenda text, pedido_id uuid, responsavel text, etapa text, etapa_em date, prevista date, entregue_em date, dividida_de uuid, programa_texto text, carga_linha integer, faturado_em date, pago_em date, atualizado_por_nome text, atualizado_em timestamp with time zone, programa_id uuid, programa_ativo boolean, parlamentar_nome text, entrega_logradouro text, entrega_numero text, entrega_complemento text, entrega_bairro text, entrega_cep text, aviso jsonb, encerrada_em date, encerrada_motivo text, prevista_origem text, ordem_recebida_em date, prazo_dias integer, prevista_anterior date, prevista_original date, dias_suspensos integer, prazo_inicio text, prazo_contagem text, trp_ate date, trd_ate date, envio_ate date, regra_recebimento boolean, comissao_enviada_em date, comissao_cobrada_em date, comissao_cobrancas integer, ocorrencias jsonb)
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
         e.comissao_enviada_em, e.comissao_cobrada_em, e.comissao_cobrancas,
         -- O que está em aberto nas ocorrências (migration 311).
         jsonb_build_object(
           'ultimaCobranca', e.ultima_cobranca_em, 'cobrancas', e.cobrancas,
           'notificacao', CASE WHEN e.notificacao_em IS NOT NULL THEN jsonb_build_object('em', e.notificacao_em, 'ate', e.notificacao_ate, 'sei', e.notificacao_sei) END,
           'pedido', CASE WHEN e.pedido_em IS NOT NULL THEN jsonb_build_object('em', e.pedido_em, 'sei', e.pedido_sei, 'novaData', e.pedido_nova_data) END,
           'substituicao', CASE WHEN e.recusa_em IS NOT NULL THEN jsonb_build_object('recusadoEm', e.recusa_em, 'notificadoEm', e.recusa_notificado_em, 'ate', e.substituir_ate, 'motivo', e.recusa_motivo) END)
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

-- 4) Ocorrências ----------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ocorrencia_entregas(p_ids UUID[], p_tipo TEXT, p_data DATE, p_documento_sei TEXT, p_texto TEXT,
                                                               p_prazo_dias INTEGER, p_nova_data DATE, p_notificado_em DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_sei   TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI');
  v_texto TEXT := left(NULLIF(btrim(COALESCE(p_texto, '')), ''), 500);
  v_nomeo TEXT;
  v_n     INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  v_nomeo := CASE p_tipo WHEN 'COBRANCA' THEN 'Cobrança ao fornecedor' WHEN 'NOTIFICACAO' THEN 'Notificação ao fornecedor'
                         WHEN 'RESPOSTA' THEN 'Resposta à notificação' WHEN 'PEDIDO_PRORROGACAO' THEN 'Pedido de prorrogação'
                         WHEN 'PEDIDO_NEGADO' THEN 'Pedido de prorrogação negado' WHEN 'RECUSA' THEN 'Recusa no recebimento'
                         WHEN 'SUBSTITUICAO' THEN 'Item substituído' END;
  IF v_nomeo IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo de ocorrência inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Data até hoje.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (responsavel <> 'SFC' OR encerrada_em IS NOT NULL)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens acompanhados pela SFC/CGLIC e não encerrados.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IN ('NOTIFICACAO', 'PEDIDO_NEGADO') AND v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o documento SEI.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IN ('NOTIFICACAO', 'RESPOSTA', 'PEDIDO_PRORROGACAO', 'PEDIDO_NEGADO', 'RECUSA') AND COALESCE(length(v_texto), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva o texto da ocorrência (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;

  IF p_tipo IN ('COBRANCA', 'PEDIDO_PRORROGACAO') AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND entregue_em IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Cobrança e pedido de prorrogação só em itens ainda não entregues.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'NOTIFICACAO' AND (p_prazo_dias IS NULL OR p_prazo_dias NOT BETWEEN 1 AND 90) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de resposta de 1 a 90 dias.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'RESPOSTA' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND notificacao_em IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Há item sem notificação em aberto.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'PEDIDO_NEGADO' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND pedido_em IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Há item sem pedido de prorrogação em aberto.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'RECUSA' THEN
    IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (entregue_em IS NULL OR etapa NOT IN ('ENTREGUE', 'TRP') OR recusa_em IS NOT NULL)) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Recusa só em itens entregues, antes do TRD, e sem outra recusa em aberto.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND p_data < entregue_em) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A recusa não pode ser antes da entrega.' USING ERRCODE = '22023';
    END IF;
    IF p_notificado_em IS NULL OR p_notificado_em < p_data OR p_notificado_em > v_hoje THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A notificação vem entre a recusa e hoje.' USING ERRCODE = '22023';
    END IF;
    IF p_prazo_dias IS NULL OR p_prazo_dias NOT BETWEEN 1 AND 180 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de substituição de 1 a 180 dias.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_tipo = 'SUBSTITUICAO' AND EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (recusa_em IS NULL OR p_data < recusa_em)) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A substituição vem depois de uma recusa em aberto.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fisc_entregas e
     SET ultima_cobranca_em = CASE WHEN p_tipo = 'COBRANCA' THEN GREATEST(p_data, COALESCE(e.ultima_cobranca_em, p_data)) ELSE e.ultima_cobranca_em END,
         cobrancas = e.cobrancas + CASE WHEN p_tipo = 'COBRANCA' THEN 1 ELSE 0 END,
         notificacao_em = CASE p_tipo WHEN 'NOTIFICACAO' THEN p_data WHEN 'RESPOSTA' THEN NULL ELSE e.notificacao_em END,
         notificacao_ate = CASE p_tipo WHEN 'NOTIFICACAO' THEN p_data + p_prazo_dias WHEN 'RESPOSTA' THEN NULL ELSE e.notificacao_ate END,
         notificacao_sei = CASE p_tipo WHEN 'NOTIFICACAO' THEN v_sei WHEN 'RESPOSTA' THEN NULL ELSE e.notificacao_sei END,
         pedido_em = CASE p_tipo WHEN 'PEDIDO_PRORROGACAO' THEN p_data WHEN 'PEDIDO_NEGADO' THEN NULL ELSE e.pedido_em END,
         pedido_sei = CASE p_tipo WHEN 'PEDIDO_PRORROGACAO' THEN v_sei WHEN 'PEDIDO_NEGADO' THEN NULL ELSE e.pedido_sei END,
         pedido_nova_data = CASE p_tipo WHEN 'PEDIDO_PRORROGACAO' THEN p_nova_data WHEN 'PEDIDO_NEGADO' THEN NULL ELSE e.pedido_nova_data END,
         recusa_em = CASE p_tipo WHEN 'RECUSA' THEN p_data WHEN 'SUBSTITUICAO' THEN NULL ELSE e.recusa_em END,
         recusa_notificado_em = CASE p_tipo WHEN 'RECUSA' THEN p_notificado_em WHEN 'SUBSTITUICAO' THEN NULL ELSE e.recusa_notificado_em END,
         substituir_ate = CASE p_tipo WHEN 'RECUSA' THEN p_notificado_em + p_prazo_dias WHEN 'SUBSTITUICAO' THEN NULL ELSE e.substituir_ate END,
         recusa_motivo = CASE p_tipo WHEN 'RECUSA' THEN v_texto WHEN 'SUBSTITUICAO' THEN NULL ELSE e.recusa_motivo END,
         atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE e.id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT e.id, 'OCORRENCIA', p_data, v_sei,
         v_nomeo || COALESCE(': ' || NULLIF(concat_ws(' · ', v_texto,
           CASE p_tipo WHEN 'NOTIFICACAO' THEN format('resposta até %s', to_char(e.notificacao_ate, 'DD/MM/YYYY'))
                       WHEN 'PEDIDO_PRORROGACAO' THEN CASE WHEN p_nova_data IS NOT NULL THEN format('pede até %s', to_char(p_nova_data, 'DD/MM/YYYY')) END
                       WHEN 'RECUSA' THEN format('notificado em %s, substituir até %s', to_char(p_notificado_em, 'DD/MM/YYYY'), to_char(e.substituir_ate, 'DD/MM/YYYY'))
                       WHEN 'COBRANCA' THEN format('%sª cobrança', e.cobrancas) END), ''), ''),
         auth.uid(), v_nome
    FROM public.fisc_entregas e WHERE e.id = ANY (p_ids);
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_ocorrencia_entregas(UUID[], TEXT, DATE, TEXT, TEXT, INTEGER, DATE, DATE) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ocorrencia_entregas(UUID[], TEXT, DATE, TEXT, TEXT, INTEGER, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.prorrogar_prazo_entregas(p_ids UUID[], p_nova_data DATE, p_motivo TEXT, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_sei  TEXT := public.fisc_sei(p_documento_sei, 'Documento SEI da decisão');
  v_mot  TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_n    INTEGER;
BEGIN
  PERFORM public.fisc_conferir_entregas(p_ids);
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o documento SEI da decisão.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga o motivo da prorrogação (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_nova_data IS NULL OR EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND prevista IS NOT NULL AND p_nova_data <= prevista) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A nova data tem que ser depois do prazo de hoje.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (entregue_em IS NOT NULL OR responsavel <> 'SFC')) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Só itens ainda não entregues e acompanhados pela SFC/CGLIC.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, data, documento_sei, observacao, criado_por, criado_por_nome)
  SELECT id, 'PRORROGACAO', p_nova_data, v_sei,
         v_mot || CASE WHEN prevista IS NOT NULL THEN format(' Era %s.', to_char(prevista, 'DD/MM/YYYY')) ELSE '' END,
         auth.uid(), v_nome
    FROM public.fisc_entregas WHERE id = ANY (p_ids);
  UPDATE public.fisc_entregas
     SET prevista_anterior = prevista, prevista_original = COALESCE(prevista_original, prevista), prevista = p_nova_data,
         prevista_origem = 'PRORROGACAO', ultima_suspensao = 0, atualizado_por_nome = v_nome, atualizado_em = NOW(),
         -- A prorrogação decide o pedido do fornecedor em aberto (migration 311).
         pedido_em = NULL, pedido_sei = NULL, pedido_nova_data = NULL
   WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('entregas', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.prorrogar_prazo_entregas(UUID[], DATE, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prorrogar_prazo_entregas(UUID[], DATE, TEXT, TEXT) TO authenticated;

-- 5) Prazos da ata com a substituição; leitura das atas novas ---------------------------------------------------------
DROP FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB);
CREATE FUNCTION public.confirmar_prazo_entrega_ata(p_ata_key TEXT, p_sem_prazo BOOLEAN, p_dias INTEGER, p_contagem TEXT,
                                                              p_inicio TEXT, p_por_item JSONB, p_motivo TEXT,
                                                     p_recebimento JSONB DEFAULT NULL, p_substituicao JSONB DEFAULT NULL)
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
  -- Recebimento (migration 305): NULL = não mexe; {"naoDiz": true} = o TR não traz o prazo; senão, a regra.
  v_rec_informado BOOLEAN := p_recebimento IS NOT NULL;
  v_rec   JSONB := CASE WHEN p_recebimento IS NULL OR COALESCE((p_recebimento->>'naoDiz')::BOOLEAN, FALSE) THEN NULL
                        ELSE public.fisc_recebimento_normalizado(p_recebimento) END;
  v_entrega_mudou BOOLEAN;
  -- Substituição do item recusado (migration 311): NULL = não mexe; {"naoDiz": true} = o TR não traz; senão {dias, contagem}.
  v_sub JSONB := CASE WHEN p_substituicao IS NULL OR COALESCE((p_substituicao->>'naoDiz')::BOOLEAN, FALSE) THEN NULL
                      ELSE public.fisc_substituicao_normalizada(p_substituicao) END;
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
  -- Leitura automática do TR (migration 309): a primeira confirmação do gestor vale como confirmação, mesmo sem mudar.
  v_entrega_mudou := NOT FOUND OR p.confirmado_em IS NULL OR p.confirmado_automatico
     OR (p.sem_prazo, p.dias, p.contagem, p.inicio, p.por_item) IS DISTINCT FROM
        (COALESCE(p_sem_prazo, FALSE), CASE WHEN p_sem_prazo THEN NULL ELSE p_dias END, CASE WHEN p_sem_prazo THEN NULL ELSE p_contagem END,
         CASE WHEN p_sem_prazo THEN NULL ELSE p_inicio END, CASE WHEN p_sem_prazo THEN '{}'::JSONB ELSE v_item END);
  IF FOUND AND v_rec_informado AND p.recebimento_confirmado_em IS NOT NULL AND NOT p.recebimento_automatico AND p.recebimento IS DISTINCT FROM v_rec
     AND COALESCE(length(v_mot), 0) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Diga por que o prazo de recebimento confirmado muda (mínimo de 10 letras).' USING ERRCODE = '22023';
  END IF;
  IF FOUND AND p.confirmado_em IS NOT NULL AND NOT p.confirmado_automatico
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
         confirmado_em = CASE WHEN v_entrega_mudou THEN EXCLUDED.confirmado_em ELSE t.confirmado_em END,
         confirmado_automatico = CASE WHEN v_entrega_mudou THEN FALSE ELSE t.confirmado_automatico END;

  IF p_substituicao IS NOT NULL THEN
    IF v_sub IS NULL AND NOT COALESCE((p_substituicao->>'naoDiz')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Prazo de substituição de 1 a 180 dias.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.ata_prazo_entrega
       SET substituicao = v_sub, substituicao_confirmada_em = NOW(), substituicao_automatico = FALSE
     WHERE ata_key = v_key;
  END IF;

  IF v_rec_informado THEN
    UPDATE public.ata_prazo_entrega
       SET recebimento = v_rec,
           recebimento_motivo = CASE WHEN recebimento_confirmado_em IS NOT NULL AND recebimento IS DISTINCT FROM v_rec THEN v_mot ELSE recebimento_motivo END,
           recebimento_confirmado_por_nome = v_nome, recebimento_confirmado_em = NOW(), recebimento_automatico = FALSE
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
REVOKE ALL ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_prazo_entrega_ata(TEXT, BOOLEAN, INTEGER, TEXT, TEXT, JSONB, TEXT, JSONB, JSONB) TO authenticated;

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
  v_claro     BOOLEAN;
  v_rec_claro BOOLEAN;
  v_sub_clara BOOLEAN;
  v_c         RECORD;
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
  v_claro := v_leitura = 'CLARO' AND v_dias IS NOT NULL AND v_cont IS NOT NULL AND v_inicio IS NOT NULL;
  v_rec_claro := COALESCE((p_payload->>'recebimento_claro')::BOOLEAN, FALSE) AND public.fisc_recebimento_normalizado(p_payload->'recebimento') IS NOT NULL;
  v_sub_clara := COALESCE((p_payload->>'substituicao_clara')::BOOLEAN, FALSE) AND public.fisc_substituicao_normalizada(p_payload->'substituicao') IS NOT NULL;

  INSERT INTO public.ata_prazo_entrega (ata_key, numero_ata, uasg, leitura, leitura_motivo, sugerido_dias, sugerido_contagem, contagem_dita,
                                        sugerido_inicio, trechos, documento, url, lido_em, recebimento_sugerido, recebimento_trechos,
                                        dias, contagem, inicio, confirmado_por_nome, confirmado_em, confirmado_automatico,
                                        recebimento, recebimento_confirmado_por_nome, recebimento_confirmado_em, recebimento_automatico,
                                        substituicao_sugerida, substituicao_trecho, substituicao, substituicao_confirmada_em, substituicao_automatico)
  SELECT DISTINCT ON (a.ata_key) a.ata_key, a.numero_ata, a.uasg, v_leitura, left(NULLIF(p_payload->>'motivo', ''), 300), v_dias, v_cont,
         COALESCE((p_payload->>'contagem_dita')::BOOLEAN, FALSE), v_inicio, v_trechos[1:3], left(NULLIF(p_payload->>'documento', ''), 300),
         left(NULLIF(p_payload->>'url', ''), 300), NOW(),
         public.fisc_recebimento_normalizado(p_payload->'recebimento'), v_trechos_rec,
         -- Leitura clara vale sozinha (migration 309); a duvidosa espera o gestor da ata.
         CASE WHEN v_claro THEN v_dias END, CASE WHEN v_claro THEN v_cont END, CASE WHEN v_claro THEN v_inicio END,
         CASE WHEN v_claro THEN 'Leitura do TR' END, CASE WHEN v_claro THEN NOW() END, v_claro,
         CASE WHEN v_rec_claro THEN public.fisc_recebimento_normalizado(p_payload->'recebimento') END,
         CASE WHEN v_rec_claro THEN 'Leitura do TR' END, CASE WHEN v_rec_claro THEN NOW() END, v_rec_claro,
         public.fisc_substituicao_normalizada(p_payload->'substituicao'), left(NULLIF(p_payload->>'substituicao_trecho', ''), 300),
         CASE WHEN v_sub_clara THEN public.fisc_substituicao_normalizada(p_payload->'substituicao') END, CASE WHEN v_sub_clara THEN NOW() END, v_sub_clara
    FROM public.atas_da_compra_para_tr() a
   WHERE a.compra = v_compra
  ON CONFLICT (ata_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Contratos acompanhados dessas atas que herdam o prazo: os itens que já podem ter a data recebem agora.
  IF v_claro AND v_n > 0 THEN
    FOR v_c IN SELECT DISTINCT l.contract_key FROM public.arp_item_contract_links l
                 JOIN public.fisc_contratos f ON f.contract_key = l.contract_key AND f.prazo_dias IS NULL
                 JOIN public.atas_da_compra_para_tr() a ON a.compra = v_compra AND a.ata_key = public.ata_key_from_item_key(l.item_key) LOOP
      PERFORM public.fisc_aplicar_regra_aos_itens(v_c.contract_key, 'Leitura do TR');
    END LOOP;
  END IF;

  INSERT INTO public.ata_prazo_leituras_tr AS t (numero_controle_compra, tentativas, ultima_tentativa, lida_em)
  VALUES (v_compra, 1, NOW(), NOW())
  ON CONFLICT (numero_controle_compra) DO UPDATE SET lida_em = NOW();
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_leitura_prazo_tr(JSONB) TO service_role;

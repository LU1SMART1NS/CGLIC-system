-- Estudo de 17/10/2026: quantas linhas tem hoje cada fonte que as telas leem SEM paginação
-- (docs/estudos/telas-leituras-auditoria.md). O PostgREST corta toda resposta em 1.000 linhas sem avisar.
-- Só leitura: um SELECT, nada é gravado. Roda como o dono do banco (vê tudo, como o coordenador).
-- Uso: supabase db query --linked -f scripts/estudo-telas-contagem.sql
-- Rodar fora do minuto dos jobs do cron (ver docs/migrations.md) e uma vez só: o banco é pequeno (Nano).
-- Cada linha da resposta: fonte, filtro que a tela usa, linhas hoje e quanto falta para 1.000.
WITH c AS (
  SELECT * FROM (VALUES
    -- Saldo dos itens: Carteiras, Alocação, Ata 360, Item 360 e o Início (fetchArpItemSaldosFromDb)
    ('v_arp_item_saldo_detalhado', 'uasg_carteira = 200331', (SELECT count(*) FROM v_arp_item_saldo_detalhado WHERE uasg_carteira = '200331')),
    ('v_arp_item_saldo_detalhado', 'uasg_carteira = 200330', (SELECT count(*) FROM v_arp_item_saldo_detalhado WHERE uasg_carteira = '200330')),
    -- Gestor da ata e escopo do gestor (fetchAllAtaManagers)
    ('ata_managers', 'tudo', (SELECT count(*) FROM ata_managers)),
    -- Fila de Vínculos › Empenhos aos itens (fetchDistribuicoesParaVincular)
    ('v_contrato_empenho_distribuicao', 'fila: A_DISTRIBUIR/REVISAR, VALOR, USUARIO 30 dias',
      (SELECT count(*) FROM v_contrato_empenho_distribuicao
        WHERE situacao IN ('A_DISTRIBUIR', 'REVISAR') OR origem = 'VALOR'
           OR (origem = 'USUARIO' AND distribuido_em >= now() - interval '30 days'))),
    -- Coluna Itens da carteira de Empenhos (fetchSituacaoDistribuicaoPorEmpenho)
    ('v_contrato_empenho_distribuicao', 'tudo', (SELECT count(*) FROM v_contrato_empenho_distribuicao)),
    -- Painel do Início (e de todas as telas que carregam o painel)
    ('v_vinculos_a_conferir', 'tudo', (SELECT count(*) FROM v_vinculos_a_conferir)),
    ('v_contrato_itens_empenhado_acima', 'tudo', (SELECT count(*) FROM v_contrato_itens_empenhado_acima)),
    ('atas_fornecedor_pncp', 'tudo', (SELECT count(*) FROM atas_fornecedor_pncp)),
    ('contract_payment_cycles', 'tudo (painel: IN de todos os contratos da UASG)', (SELECT count(*) FROM contract_payment_cycles)),
    ('contract_payment_cycles', 'em aberto (Pagamentos, Previsão)',
      (SELECT count(*) FROM contract_payment_cycles
        WHERE status IN ('RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI', 'LIQUIDADO'))),
    ('contract_payment_cycle_itens', 'tudo', (SELECT count(*) FROM contract_payment_cycle_itens)),
    ('contract_payment_cycle_checklist', 'maior contrato', (SELECT coalesce(max(n), 0) FROM (
      SELECT count(*) n FROM contract_payment_cycle_checklist k JOIN contract_payment_cycles p ON p.id = k.cycle_id GROUP BY p.contract_key) x)),
    -- Previsão e avisos de pagamento (fetchExpectativasPagamento)
    ('contrato_expectativa_pagamento', 'tudo', (SELECT count(*) FROM contrato_expectativa_pagamento)),
    ('contrato_entregas_previstas', 'tudo', (SELECT count(*) FROM contrato_entregas_previstas)),
    -- Motivos do vínculo manual (Vínculos › Contratos à ata)
    ('prever_vinculos_automaticos()', 'situacao = MANUAL', (SELECT count(*) FROM prever_vinculos_automaticos() WHERE situacao = 'MANUAL')),
    -- Planos de tarefas (painel)
    ('ata_task_plans', 'tudo', (SELECT count(*) FROM ata_task_plans)),
    ('ata_tasks', 'tudo', (SELECT count(*) FROM ata_tasks)),
    ('contract_tasks', 'tudo', (SELECT count(*) FROM contract_tasks)),
    -- Pequenas, para registro
    ('v_uasgs_participantes_gti', 'tudo', (SELECT count(*) FROM v_uasgs_participantes_gti)),
    ('internal_departments', 'tudo', (SELECT count(*) FROM internal_departments)),
    ('arp_item_contract_links', 'maior ata (Ata 360, LIKE ata-uasg-%)', (SELECT coalesce(max(n), 0) FROM (
      SELECT count(*) n FROM arp_item_contract_links GROUP BY ata_key_from_item_key(item_key)) x))
  ) AS t(fonte, filtro, linhas)
),
-- Páginas com ordem que não é única (podem repetir ou pular linhas entre páginas): quantas linhas repetem a chave.
ordem AS (
  SELECT * FROM (VALUES
    ('contrato_empenhos ordenada por empenho_id', (SELECT count(*) FROM contrato_empenhos),
      (SELECT count(*) - count(DISTINCT empenho_id) FROM contrato_empenhos)),
    ('fatura_empenhos ordenada por id_fatura', (SELECT count(*) FROM fatura_empenhos),
      (SELECT count(*) - count(DISTINCT id_fatura) FROM fatura_empenhos))
  ) AS t(fonte, linhas, repetidas)
),
-- Tamanho da URL do IN de ciclos do painel: todas as chaves de contrato da UASG numa só URL.
url AS (
  SELECT uasg, count(*) AS contratos, sum(length(contract_key) + 1) AS bytes_do_in
  FROM contratos_oficiais GROUP BY uasg
)
SELECT json_build_object(
  'sem_paginacao', (SELECT json_agg(json_build_object('fonte', fonte, 'filtro', filtro, 'linhas', linhas, 'falta_para_1000', 1000 - linhas) ORDER BY linhas DESC) FROM c),
  'ordem_nao_unica', (SELECT json_agg(row_to_json(ordem)) FROM ordem),
  'url_do_in_de_ciclos', (SELECT json_agg(row_to_json(url)) FROM url)
);

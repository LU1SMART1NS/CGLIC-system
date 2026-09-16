-- ==============================================================================
-- SQL QUERY OFICIAL (PÁGINA 3) — NOTAS DE EMPENHO VINCULADAS AO ITEM / ATA
-- AUDITADA VIA ARP-LOOP-VALIDATOR
-- Invariante: 1 Item -> N Empenhos | Saldo = QtdHomologada - SUM(Empenhos)
-- ==============================================================================

SELECT 
    e.id_empenho,
    e.item_key,
    e.id_arp,
    e.numero_item,
    
    -- Tag visual do Número do Empenho (Padrão SIAFI: AAAA-NE-XXXXXX)
    '<span class="gov-ne-tag"><i class="fa fa-file-text-o"></i> ' || e.numero_empenho || '</span>' AS numero_empenho_html,
    e.numero_empenho,
    
    -- Data de Emissão Formatada
    e.data_emissao,
    TO_CHAR(e.data_emissao, 'DD/MM/YYYY') AS data_emissao_fmt,
    
    -- UASG Emitente
    NVL(e.codigo_uasg, '200331') AS codigo_uasg,
    NVL(e.nome_uasg, 'SENASP/MJSP') AS nome_uasg,
    NVL(e.codigo_uasg, '200331') || ' - ' || NVL(e.nome_uasg, 'SENASP/MJSP') AS uasg_fmt,
    
    -- Fornecedor / Beneficiário
    e.fornecedor_nome,
    e.fornecedor_cnpj,
    CASE 
        WHEN e.fornecedor_cnpj IS NOT NULL THEN 
            e.fornecedor_nome || ' (' || e.fornecedor_cnpj || ')'
        ELSE 
            NVL(e.fornecedor_nome, 'Fornecedor Homologado')
    END AS fornecedor_fmt,
    
    -- Quantidade Empenhada (Consumo Físico do Saldo)
    e.quantidade_empenhada,
    TO_CHAR(e.quantidade_empenhada, 'FM999G999G990') AS quantidade_empenhada_fmt,
    
    -- Valor Unitário e Valor Total Empenhado
    e.valor_unitario,
    TO_CHAR(NVL(e.valor_unitario, 0), 'FML999G999G990D00') AS valor_unitario_fmt,
    
    e.valor_total_empenhado,
    TO_CHAR(NVL(e.valor_total_empenhado, 0), 'FML999G999G999G990D00') AS valor_total_empenhado_fmt,
    
    -- Origem do Registro (Matriz de Confiança SaldoARP)
    e.origem,
    CASE UPPER(NVL(e.origem, 'API'))
        WHEN 'API' THEN 
            '<span class="gov-badge-origem origem-api"><i class="fa fa-check-circle"></i> Oficial (API)</span>'
        WHEN 'MANUAL' THEN 
            '<span class="gov-badge-origem origem-manual"><i class="fa fa-pencil"></i> Manual</span>'
        WHEN 'SINCRONIZADO' THEN 
            '<span class="gov-badge-origem origem-sinc"><i class="fa fa-refresh"></i> Sincronizado</span>'
        ELSE 
            '<span class="gov-badge-origem origem-divergente"><i class="fa fa-exclamation-triangle"></i> ' || e.origem || '</span>'
    END AS origem_html,
    
    -- Status do Empenho
    e.status,
    CASE UPPER(NVL(e.status, 'CONFIRMADO'))
        WHEN 'CONFIRMADO' THEN 
            '<span class="gov-status-pill status-confirmado"><i class="fa fa-check"></i> Confirmado</span>'
        WHEN 'PENDENTE' THEN 
            '<span class="gov-status-pill status-pendente"><i class="fa fa-clock-o"></i> Pendente</span>'
        ELSE 
            '<span class="gov-status-pill status-divergente"><i class="fa fa-warning"></i> Divergente</span>'
    END AS status_html,
    
    -- Observações / Justificativas
    e.observacao

FROM tb_arp_empenhos e
WHERE 
    -- Filtro dinâmico: por item específico (quando selecionado) OU por todos os itens da Ata
    (:P3_ITEM_KEY IS NOT NULL AND e.item_key = :P3_ITEM_KEY)
    OR
    (:P3_ITEM_KEY IS NULL AND e.id_arp = :P3_ID_ARP)
ORDER BY e.data_emissao DESC, e.numero_empenho DESC;

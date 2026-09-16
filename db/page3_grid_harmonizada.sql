-- ==============================================================================
-- SQL QUERY CORRIGIDA (PÁGINA 3) — TABELA DE ITENS (P3_SALDO_ITENS)
-- Utiliza ITEM_KEY como identificador da tabela TB_ARP_ITENS
-- ==============================================================================

SELECT 
    i.item_key,
    i.numero_item,
    -- Tag estilizada do Item
    '<span class="gov-item-tag">Item ' || LPAD(TRIM(LEADING '0' FROM i.numero_item), 2, '0') || '</span>' AS item_tag_html,
    
    i.descricao_detalhada,
    NVL(i.unidade_medida, 'UNIDADE') AS unidade_medida,
    
    -- Quantidade Homologada
    i.quantidade_homologada,
    TO_CHAR(i.quantidade_homologada, 'FM999G999G990') AS qtd_homologada_fmt,
    
    -- Valor Unitário
    i.valor_unitario,
    TO_CHAR(NVL(i.valor_unitario, 0), 'FML999G999G990D00') AS valor_unitario_fmt,
    
    -- Valor Total Homologado
    i.valor_total_homologado,
    TO_CHAR(NVL(i.valor_total_homologado, 0), 'FML999G999G999G990D00') AS valor_total_fmt,
    
    -- Total Empenhado (Fórmula Oficial SaldoARP)
    NVL((SELECT SUM(e.quantidade_empenhada) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0) AS total_empenhado,
    TO_CHAR(NVL((SELECT SUM(e.quantidade_empenhada) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0), 'FM999G999G990') AS total_empenhado_fmt,
    
    -- Saldo Calculado: QuantidadeRegistrada - TotalEmpenhado
    (i.quantidade_homologada - NVL((SELECT SUM(e.quantidade_empenhada) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0)) AS saldo_calculado,
    TO_CHAR((i.quantidade_homologada - NVL((SELECT SUM(e.quantidade_empenhada) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0)), 'FM999G999G990') AS saldo_calculado_fmt,
    
    -- Saldo API SIASG
    i.saldo_api_siasg,
    
    -- Quantidade de Empenhos Vinculados
    NVL((SELECT COUNT(*) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0) AS qtd_empenhos,
    
    -- Botão / Link de Visualização de Empenhos
    CASE 
        WHEN (SELECT COUNT(*) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key) > 0 THEN 
            '<button type="button" class="gov-btn-ver-empenhos t-Button t-Button--simple t-Button--primary t-Button--tiny" onclick="apex.item(''P3_ITEM_KEY'').setValue(''' || i.item_key || '''); apex.event.trigger(''#reg_empenhos'', ''apexrefresh'');">' ||
            '<i class="fa fa-list-ol"></i> ' || (SELECT COUNT(*) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key) || ' NE(s)</button>'
        ELSE 
            '<span class="gov-sem-empenhos"><i class="fa fa-minus"></i> 0 NE</span>'
    END AS acao_empenhos_html,

    -- Badge de Reconciliação Contábil
    CASE 
        WHEN i.saldo_api_siasg IS NULL THEN 
            '<span class="gov-recon-badge recon-sem-api"><i class="fa fa-info-circle"></i> Sem Saldo API</span>'
        WHEN i.saldo_api_siasg = (i.quantidade_homologada - NVL((SELECT SUM(e.quantidade_empenhada) FROM tb_arp_empenhos e WHERE e.item_key = i.item_key), 0)) THEN 
            '<span class="gov-recon-badge recon-ok"><i class="fa fa-check-circle"></i> Sincronizado</span>'
        ELSE 
            '<span class="gov-recon-badge recon-divergente"><i class="fa fa-exclamation-triangle"></i> Divergente</span>'
    END AS status_reconciliacao_html
FROM tb_arp_itens i
WHERE i.id_arp = :P3_ID_ARP
ORDER BY TO_NUMBER(REGEXP_SUBSTR(i.numero_item, '^[0-9]+')) ASC, i.numero_item ASC;

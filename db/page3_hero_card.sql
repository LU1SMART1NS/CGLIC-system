-- ==============================================================================
-- SQL QUERY OFICIAL — PÁGINA 3 (HERO CARD E DETALHES DA ATA)
-- Tratamento seguro do OBJETO com fallback nos itens da Ata
-- ==============================================================================

SELECT 
    c.id_arp,
    c.numero_ata,
    NVL(SUBSTR(c.numero_ata, INSTR(c.numero_ata, '/') + 1), TO_CHAR(c.data_vigencia_inicio, 'YYYY')) AS ano,
    NVL(c.objeto, 'Objeto não informado no cadastro da Ata.') AS objeto,
    '200331 - SECRETARIA NACIONAL DE SEGURANÇA PÚBLICA - SENASP' AS orgao_fmt,
    TO_CHAR(c.data_vigencia_inicio, 'DD/MM/YYYY') AS data_vigencia_inicio_fmt,
    TO_CHAR(c.data_vigencia_fim, 'DD/MM/YYYY') AS data_vigencia_fim_fmt,
    TO_CHAR(c.valor_total_homologado, 'FML999G999G999G999G990D00') AS valor_total_fmt,
    c.permite_adesao_sn,
    CASE 
        WHEN c.data_vigencia_fim >= TRUNC(SYSDATE) THEN 'VIGENTE'
        ELSE 'EXPIRADA'
    END AS status_vigencia,
    GREATEST(0, TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) AS dias_restantes,
    CASE 
        WHEN c.data_vigencia_fim < TRUNC(SYSDATE) THEN 'kpi-dias-vermelho'
        WHEN (TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) > 90 THEN 'kpi-dias-verde'
        WHEN (TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) BETWEEN 61 AND 90 THEN 'kpi-dias-amarelo'
        ELSE 'kpi-dias-vermelho'
    END AS classe_kpi_dias,
    CASE 
        WHEN c.data_vigencia_fim < TRUNC(SYSDATE) THEN 'Expirada'
        WHEN (TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) = 1 THEN '1 dia restante'
        ELSE TO_CHAR(TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) || ' dias restantes'
    END AS label_kpi_dias,
    CASE 
        WHEN (TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) > 90 THEN 'fa-calendar-check-o'
        WHEN (TRUNC(c.data_vigencia_fim) - TRUNC(SYSDATE)) BETWEEN 61 AND 90 THEN 'fa-clock-o'
        ELSE 'fa-exclamation-triangle'
    END AS icone_kpi_dias,
    (SELECT COUNT(*) FROM tb_arp_itens i WHERE i.id_arp = c.id_arp) AS total_itens
FROM tb_arp_cabecalho c
WHERE c.id_arp = :P3_ID_ARP;

-- ==============================================================================
-- SQL QUERY OFICIAL (PÁGINA 2) — AUDITADA VIA ARP-LOOP-VALIDATOR
-- 100% Blindada contra valores de sessão antigos e LOVs
-- ==============================================================================

SELECT 
    c.id_arp,
    c.numero_ata,
    NVL(SUBSTR(c.numero_ata, INSTR(c.numero_ata, '/') + 1), TO_CHAR(c.data_vigencia_inicio, 'YYYY')) AS ano,
    c.objeto,
    c.data_vigencia_inicio,
    c.data_vigencia_fim,
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
WHERE 
  -- 1. Filtro: Ano da Ata (:P2_ANO)
  (
    :P2_ANO IS NULL 
    OR UPPER(TRIM(:P2_ANO)) IN ('TODOS', 'TODAS', 'ALL', 'T', '%', '', '-1', '0', '%NULL%', 'NULL', 'TODOS OS ANOS', 'TODAS AS ATAS')
    OR UPPER(TRIM(:P2_ANO)) LIKE '%TODO%'
    OR UPPER(TRIM(:P2_ANO)) LIKE '%TODA%'
    OR UPPER(TRIM(:P2_ANO)) LIKE '%NULL%'
    OR (REGEXP_LIKE(TRIM(:P2_ANO), '^[0-9]{4}$') AND c.numero_ata LIKE '%/' || TRIM(:P2_ANO))
  )
  
  -- 2. Filtro: Vigência (:P2_VIGENCIA)
  AND (
    :P2_VIGENCIA IS NULL 
    OR UPPER(TRIM(:P2_VIGENCIA)) IN ('TODAS', 'TODOS', 'ALL', 'T', '%', '', '-1', '0', '%NULL%', 'NULL', 'TODAS AS ATAS', 'TODOS OS REGISTROS')
    OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%TODO%'
    OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%TODA%'
    OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%NULL%'
    OR (
        (UPPER(TRIM(:P2_VIGENCIA)) LIKE '%VIG%' OR UPPER(TRIM(:P2_VIGENCIA)) = 'V' OR UPPER(TRIM(:P2_VIGENCIA)) = 'S' OR UPPER(TRIM(:P2_VIGENCIA)) = '1')
        AND c.data_vigencia_fim >= TRUNC(SYSDATE)
       )
    OR (
        (
         UPPER(TRIM(:P2_VIGENCIA)) LIKE '%ENC%' 
         OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%VENC%' 
         OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%EXP%' 
         OR UPPER(TRIM(:P2_VIGENCIA)) LIKE '%NAO%' 
         OR UPPER(TRIM(:P2_VIGENCIA)) IN ('N', 'E', '0')
        ) 
        AND c.data_vigencia_fim < TRUNC(SYSDATE)
       )
  )
  
  -- 3. Filtro: Número da Ata (:P2_BUSCA_ATA)
  AND (
    :P2_BUSCA_ATA IS NULL 
    OR UPPER(TRIM(:P2_BUSCA_ATA)) IN ('', '%', '%NULL%', 'NULL')
    OR UPPER(c.numero_ata) LIKE '%' || UPPER(TRIM(:P2_BUSCA_ATA)) || '%'
    OR (
        INSTR(:P2_BUSCA_ATA, '/') > 0
        AND LTRIM(SUBSTR(c.numero_ata, 1, INSTR(c.numero_ata, '/') - 1), '0') = LTRIM(SUBSTR(TRIM(:P2_BUSCA_ATA), 1, INSTR(TRIM(:P2_BUSCA_ATA), '/') - 1), '0')
        AND SUBSTR(c.numero_ata, INSTR(c.numero_ata, '/') + 1) = SUBSTR(TRIM(:P2_BUSCA_ATA), INSTR(TRIM(:P2_BUSCA_ATA), '/') + 1)
       )
    OR (
        INSTR(:P2_BUSCA_ATA, '/') = 0
        AND LTRIM(SUBSTR(c.numero_ata, 1, INSTR(c.numero_ata, '/') - 1), '0') = LTRIM(TRIM(:P2_BUSCA_ATA), '0')
       )
  )

  -- 4. Filtro: Objeto da Ata (:P2_OBJETO)
  AND (
    :P2_OBJETO IS NULL 
    OR UPPER(TRIM(:P2_OBJETO)) IN ('', '%', 'TODOS', 'TODAS', 'ALL', 'T', 'TODOS OS OBJETOS', 'TODAS AS ATAS', '%NULL%', 'NULL', '-1', '0')
    OR UPPER(TRIM(:P2_OBJETO)) LIKE '%TODO%'
    OR UPPER(TRIM(:P2_OBJETO)) LIKE '%TODA%'
    OR UPPER(TRIM(:P2_OBJETO)) LIKE '%NULL%'
    OR (c.objeto IS NOT NULL AND UPPER(c.objeto) LIKE '%' || UPPER(TRIM(:P2_OBJETO)) || '%')
  )

ORDER BY 
    CASE 
        WHEN INSTR(c.numero_ata, '/') > 0 THEN TO_NUMBER(REGEXP_SUBSTR(SUBSTR(c.numero_ata, INSTR(c.numero_ata, '/') + 1), '^[0-9]+'))
        ELSE TO_NUMBER(TO_CHAR(c.data_vigencia_inicio, 'YYYY'))
    END DESC NULLS LAST,
    CASE 
        WHEN INSTR(c.numero_ata, '/') > 0 THEN TO_NUMBER(REGEXP_SUBSTR(SUBSTR(c.numero_ata, 1, INSTR(c.numero_ata, '/') - 1), '^[0-9]+'))
        ELSE TO_NUMBER(REGEXP_SUBSTR(c.numero_ata, '^[0-9]+'))
    END DESC NULLS LAST,
    c.data_vigencia_fim DESC

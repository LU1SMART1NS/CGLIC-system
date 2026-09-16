-- ==============================================================================
-- SCRIPT DE SINCRONIZAÇÃO AUTÔNOMA DE ADESÃO (CARONA) VIA API OFICIAL COMPRAS.GOV
-- UASG: 200331 (SENASP/MJSP)
-- Endpoint Oficial: https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem
-- Campo de Regra de Negócio: $.maximoAdesao
-- ==============================================================================

DECLARE
  v_clob         CLOB;
  v_url          VARCHAR2(1000);
  v_http_status  NUMBER;
  v_total_itens  NUMBER := 0;
  v_total_atas   NUMBER := 0;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Iniciando sincronizacao autonoma de limites de adesao via API Compras.gov...');

  -- Iterar pelos anos da UASG 200331
  FOR y IN 2023..2028 LOOP
    FOR p IN 1..10 LOOP
      v_url := 'https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem'
            || '?codigoUnidadeGerenciadora=200331'
            || '&dataVigenciaInicialMin=' || y || '-01-01'
            || '&dataVigenciaInicialMax=' || y || '-12-31'
            || '&pagina=' || p
            || '&tamanhoPagina=200';
      
      BEGIN
        v_clob := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
                    p_url         => v_url,
                    p_http_method => 'GET'
                  );
        v_http_status := APEX_WEB_SERVICE.G_STATUS_CODE;
      EXCEPTION
        WHEN OTHERS THEN
          v_clob := NULL;
          v_http_status := 500;
      END;
      
      -- Processar se status for 200 e houver resultado JSON
      IF v_http_status = 200 AND v_clob IS NOT NULL AND INSTR(v_clob, '"resultado"') > 0 THEN
        
        -- Contar itens na página
        DECLARE
          v_count_pag NUMBER := 0;
        BEGIN
          FOR r IN (
            SELECT jt.numero_ata,
                   jt.numero_item,
                   jt.maximo_adesao,
                   jt.qtd_homologada,
                   jt.valor_unitario,
                   jt.valor_total
              FROM JSON_TABLE(v_clob, '$.resultado[*]'
                     COLUMNS (
                       numero_ata     VARCHAR2(50)  PATH '$.numeroAtaRegistroPreco',
                       numero_item    VARCHAR2(20)  PATH '$.numeroItem',
                       maximo_adesao  NUMBER        PATH '$.maximoAdesao',
                       qtd_homologada NUMBER        PATH '$.quantidadeHomologadaItem',
                       valor_unitario NUMBER        PATH '$.valorUnitario',
                       valor_total    NUMBER        PATH '$.valorTotal'
                     )
                   ) jt
          ) LOOP
            v_count_pag := v_count_pag + 1;
            v_total_itens := v_total_itens + 1;

            -- Atualiza o limite de adesão extraído da API no item da ATA
            UPDATE tb_arp_itens
               SET limite_adesao_maximo = NVL(r.maximo_adesao, 0)
             WHERE TRIM(LEADING '0' FROM numero_item) = TRIM(LEADING '0' FROM r.numero_item)
               AND id_arp IN (
                     SELECT id_arp 
                       FROM tb_arp_cabecalho 
                      WHERE REPLACE(numero_ata, ' ', '') = REPLACE(r.numero_ata, ' ', '')
                   );
          END LOOP;

          -- Se a página retornou vazia ou menos de 200 registros, passa para o próximo ano
          IF v_count_pag < 200 THEN
            EXIT;
          END IF;
        END;
        
      ELSE
        -- 400, 404 ou sem mais registros para este ano
        EXIT;
      END IF;
      
    END LOOP;
  END LOOP;

  -- Regra de Negócio Autônoma:
  -- Se o somatório de LIMITE_ADESAO_MAXIMO dos itens da ATA for > 0 -> PERMITE_ADESAO_SN = 'S'
  -- Caso contrário (total de adesão permitido = 0) -> PERMITE_ADESAO_SN = 'N'
  UPDATE tb_arp_cabecalho c
     SET c.permite_adesao_sn = CASE 
           WHEN (SELECT NVL(SUM(NVL(i.limite_adesao_maximo, 0)), 0) 
                   FROM tb_arp_itens i 
                  WHERE i.id_arp = c.id_arp) > 0 THEN 'S'
           ELSE 'N'
         END;

  COMMIT;

  -- Auditoria de resultado
  SELECT COUNT(DISTINCT id_arp) INTO v_total_atas FROM tb_arp_cabecalho;
  
  DBMS_OUTPUT.PUT_LINE('--- RESULTADO DA SINCRONIZACAO AUTONOMA ---');
  DBMS_OUTPUT.PUT_LINE('Total de itens processados da API: ' || v_total_itens);
  DBMS_OUTPUT.PUT_LINE('Total de Atas no Banco: ' || v_total_atas);
  
  FOR a IN (
    SELECT permite_adesao_sn, COUNT(*) AS qtd
      FROM tb_arp_cabecalho
     GROUP BY permite_adesao_sn
  ) LOOP
    DBMS_OUTPUT.PUT_LINE('Status ' || a.permite_adesao_sn || ': ' || a.qtd || ' Atas');
  END LOOP;

END;
/

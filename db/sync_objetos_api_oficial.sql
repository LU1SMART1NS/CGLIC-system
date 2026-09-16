-- ==============================================================================
-- SCRIPT DE SINCRONIZAÇÃO AUTÔNOMA DO OBJETO DAS ATAS VIA API OFICIAL COMPRAS.GOV
-- UASG: 200331 (SENASP/MJSP)
-- Endpoint Oficial: https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP
-- Campo Oficial: $.resultado[*].objeto
-- ==============================================================================

DECLARE
  v_clob              CLOB;
  v_url               VARCHAR2(1000);
  v_http_status       NUMBER;
  v_total_atas_api    NUMBER := 0;
  v_total_atualizadas NUMBER := 0;
BEGIN
  DBMS_OUTPUT.PUT_LINE('Iniciando sincronizacao autonoma de objetos de todas as atas via API Compras.gov...');

  -- Iterar pelos anos da UASG 200331 (2023 a 2028)
  FOR y IN 2023..2028 LOOP
    FOR p IN 1..10 LOOP
      v_url := 'https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP'
            || '?codigoUnidadeGerenciadora=200331'
            || '&dataVigenciaInicialMin=' || y || '-01-01'
            || '&dataVigenciaInicialMax=' || y || '-12-31'
            || '&pagina=' || p
            || '&tamanhoPagina=500';
      
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
        
        DECLARE
          v_count_pag NUMBER := 0;
        BEGIN
          FOR r IN (
            SELECT jt.numero_ata,
                   jt.objeto
              FROM JSON_TABLE(v_clob, '$.resultado[*]'
                     COLUMNS (
                       numero_ata     VARCHAR2(50)   PATH '$.numeroAtaRegistroPreco',
                       objeto         VARCHAR2(4000) PATH '$.objeto'
                     )
                   ) jt
             WHERE jt.objeto IS NOT NULL
          ) LOOP
            v_count_pag := v_count_pag + 1;
            v_total_atas_api := v_total_atas_api + 1;

            -- Atualiza o objeto da Ata na tabela tb_arp_cabecalho com casamento tolerante
            UPDATE tb_arp_cabecalho c
               SET c.objeto = r.objeto
             WHERE (
                    REPLACE(c.numero_ata, ' ', '') = REPLACE(r.numero_ata, ' ', '')
                    OR (
                        INSTR(c.numero_ata, '/') > 0 AND INSTR(r.numero_ata, '/') > 0
                        AND LTRIM(SUBSTR(c.numero_ata, 1, INSTR(c.numero_ata, '/') - 1), '0') = LTRIM(SUBSTR(r.numero_ata, 1, INSTR(r.numero_ata, '/') - 1), '0')
                        AND SUBSTR(c.numero_ata, INSTR(c.numero_ata, '/') + 1) = SUBSTR(r.numero_ata, INSTR(r.numero_ata, '/') + 1)
                       )
                   )
               AND (c.objeto IS NULL OR c.objeto <> r.objeto);

            IF SQL%ROWCOUNT > 0 THEN
              v_total_atualizadas := v_total_atualizadas + SQL%ROWCOUNT;
            END IF;
          END LOOP;

          -- Se a página retornou vazia ou menos de 500 registros, passa para o próximo ano
          IF v_count_pag < 500 THEN
            EXIT;
          END IF;
        END;
        
      ELSE
        -- 400, 404 ou sem mais registros para este ano
        EXIT;
      END IF;
      
    END LOOP;
  END LOOP;

  COMMIT;

  DBMS_OUTPUT.PUT_LINE('--- RESULTADO DA SINCRONIZACAO DE OBJETOS ---');
  DBMS_OUTPUT.PUT_LINE('Total de atas analisadas na API: ' || v_total_atas_api);
  DBMS_OUTPUT.PUT_LINE('Total de atas atualizadas no banco: ' || v_total_atualizadas);

END;
/

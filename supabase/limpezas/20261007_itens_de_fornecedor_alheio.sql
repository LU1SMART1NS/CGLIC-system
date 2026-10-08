-- Limpeza dos itens de fornecedor alheio gravados pelo fallback do PNCP (06/10/2026).
-- Fonte conferida em 07/10/2026 (Compras.gov.br 2_consultarARPItem, UASG 200331, 2024, e PNCP):
--   00021/2024 = itens 00020-00089 (CONVERGINT); 00022/2024 = 00019, 00057 (ECOVOLT); 00023/2024 = 00038, 00076 (ARCADE)
--   -> os itens 00001-00010 (ABSOLUT, raiz 02423819) são da ata 00020/2024.
--   00056/2024 = itens 00001, 00002 (LIFE 63067904000235); 00058/2024 = 00003-00007; 00089/2024 = 00008-00022 (LIFE 63067904000588)
--   -> os itens 00001 e 00002 nas atas 00058 e 00089 são da ata 00056/2024.
-- Como usar (supabase db query --linked -f <arquivo>):
--   Ensaio (padrão): roda tudo numa transação e termina em RAISE EXCEPTION com as contagens; nada fica gravado.
--   Aplicar: acrescentar `SET limpeza.aplicar = 'sim';` logo depois do BEGIN (ou rodar a cópia _aplicar) — só com autorização.
-- Ensaiado em 07/10/2026: itens=34 (00021:10 00022:10 00023:10 00058:2 00089:2), vínculos=0, cópias de órgãos=34.
BEGIN;
CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT i.id, a.numero_ata, i.numero_item, i.fornecedor_cnpj_cpf,
       a.numero_ata || '-' || a.codigo_uasg || '-' || i.numero_item AS item_key
  FROM public.itens_ata i
  JOIN public.atas_registro_preco a ON a.id = i.ata_id
 WHERE a.codigo_uasg = '200331'
   AND (
        (a.numero_ata IN ('00021/2024','00022/2024','00023/2024')
         AND i.numero_item IN ('00001','00002','00003','00004','00005','00006','00007','00008','00009','00010')
         AND i.fornecedor_cnpj_cpf LIKE '02423819%')
     OR (a.numero_ata IN ('00058/2024','00089/2024')
         AND i.numero_item IN ('00001','00002')
         AND i.fornecedor_cnpj_cpf = '63067904000235')
   );

DO $$
DECLARE v_alvo int; v_links int; v_copias int; v_itens int; v_resumo text;
BEGIN
  SELECT count(*) INTO v_alvo FROM _alvo;
  IF v_alvo <> 34 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 34 itens alvo, encontrou %', v_alvo;
  END IF;
  SELECT string_agg(numero_ata || ':' || count, ' ') INTO v_resumo
    FROM (SELECT numero_ata, count(*) FROM _alvo GROUP BY numero_ata ORDER BY numero_ata) t;

  DELETE FROM public.arp_item_contract_links  WHERE item_key IN (SELECT item_key FROM _alvo);
  GET DIAGNOSTICS v_links = ROW_COUNT;
  DELETE FROM public.itens_ata_unidades_copia WHERE item_key IN (SELECT item_key FROM _alvo)
     AND unidades IS NULL;  -- só as linhas de "leitura vazia"; uma cópia com órgãos seria sinal de item real
  GET DIAGNOSTICS v_copias = ROW_COUNT;
  DELETE FROM public.itens_ata WHERE id IN (SELECT id FROM _alvo);
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  -- Depois da limpeza, nenhuma das 8 atas pode ter mais de uma raiz de CNPJ
  IF EXISTS (
    SELECT 1 FROM public.itens_ata i JOIN public.atas_registro_preco a ON a.id = i.ata_id
     WHERE a.codigo_uasg = '200331'
       AND a.numero_ata IN ('00020/2024','00021/2024','00022/2024','00023/2024','00056/2024','00058/2024','00089/2024')
     GROUP BY a.numero_ata HAVING count(DISTINCT left(i.fornecedor_cnpj_cpf, 8)) > 1
  ) THEN
    RAISE EXCEPTION 'ABORTADO: ainda há ata com dois fornecedores depois da limpeza';
  END IF;

  IF current_setting('limpeza.aplicar', true) IS DISTINCT FROM 'sim' THEN
    RAISE EXCEPTION 'ENSAIO OK (nada gravado) — itens apagados=% (%), vínculos=%, cópias de órgãos=%', v_itens, v_resumo, v_links, v_copias;
  END IF;
  RAISE NOTICE 'APLICADO — itens apagados=% (%), vínculos=%, cópias de órgãos=%', v_itens, v_resumo, v_links, v_copias;
END $$;
COMMIT;

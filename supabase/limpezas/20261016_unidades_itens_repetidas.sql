-- Limpeza da cópia dos órgãos dos itens gravada com linhas repetidas ou cortada em 50 linhas (16/10/2026).
-- Causa: desde 09/10/2026 o Compras.gov.br às vezes repete cada órgão (3_consultarUnidadesItem) e o servidor lia
-- só a primeira página de 50 linhas. Correção do código: PR da branch fix/unidades-itens-paginas + migration 143.
--
-- Medição de 16/10/2026 (fonte relida com todas as páginas, sem as cópias):
--   Histórico (itens_ata_unidades_historico): 141 linhas; 101 falsas, 40 ficam.
--     63 "dobrou"  : o registrado novo é o dobro do da fonte (00071/2024-27, 00029/2025-26: 25 cada; 00069/2025-5: 13);
--     30 "saiu"    : órgão cortado pela página de 50 (00071/2024-27 e 00029/2025-26: 15 cada);
--      3 "saiu" de 13/10 + 3 "voltou" de 16/10 com a mesma quantidade e a mesma data da fonte
--        (00051/2024-9 órgão 925535; 00090/2024-19 e 00094/2024-48 órgão 200390);
--      2 "entrou"  : órgão que já estava na fonte e só apareceu porque a janela de 50 mudou
--        (00044/2026-1 órgão 927082; 00044/2026-2 órgão 927586).
--     Ficam, entre outras: a saída do 200344 em 00044/2026-1 e -2 (não está mais na fonte) e o remanejamento de
--     2.500 do 926474 para o 927747 em 00007/2026-7 e -8.
--   Cópias erradas (9): com órgãos faltando ou em dobro. Voltam a "sem cópia" e são relidas na próxima rodada,
--     que grava a lista certa como novo ponto de partida (sem histórico). Por isso esta limpeza roda DEPOIS de
--     publicar a função corrigida, fora dos minutos :40-:45 (jobs do recurso unidades_itens).
--   Quantitativo SENASP em dobro em itens_ata (4): 00071/2024-27 356→178, 00029/2025-26 178→89,
--     00014/2026-81 7.656→3.828, 00069/2025-5 700→350 (valores da fonte em 16/10/2026). Só muda se ainda estiver
--     no valor em dobro.
--
-- Como usar (supabase db query --linked -f <arquivo>):
--   Ensaio (padrão): tudo numa transação que termina em RAISE EXCEPTION com as contagens; nada fica gravado.
--   Aplicar: acrescentar `SET LOCAL limpeza.aplicar = 'sim';` logo depois do BEGIN — só com autorização do usuário.
BEGIN;

CREATE TEMP TABLE _falsas ON COMMIT DROP AS
SELECT unnest(ARRAY[1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 81, 83, 87, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129]::BIGINT[]) AS id;

CREATE TEMP TABLE _copias ON COMMIT DROP AS
SELECT unnest(ARRAY['00001/2024-201057-00001', '00002/2024-201057-00004', '00014/2026-200331-00081', '00029/2025-200331-00026', '00044/2026-200331-00001', '00044/2026-200331-00002', '00066/2025-200331-00002', '00069/2025-200331-00005', '00071/2024-200331-00027']::TEXT[]) AS item_key;

CREATE TEMP TABLE _senasp (item_key TEXT, em_dobro NUMERIC, fonte NUMERIC) ON COMMIT DROP;
INSERT INTO _senasp VALUES
  ('00071/2024-200331-00027', 356, 178),
  ('00029/2025-200331-00026', 178, 89),
  ('00014/2026-200331-00081', 7656, 3828),
  ('00069/2025-200331-00005', 700, 350);

DO $$
DECLARE
  v_achadas int; v_novas int; v_hist int; v_copias int; v_senasp int; v_resto int;
BEGIN
  SELECT count(*) INTO v_achadas FROM public.itens_ata_unidades_historico h JOIN _falsas f USING (id);
  IF v_achadas <> 101 THEN
    RAISE EXCEPTION 'ABORTADO: esperava 101 linhas falsas no histórico, achou %', v_achadas;
  END IF;
  -- Linha nova no histórico desses itens depois da medição (id > 141) = alguém leu antes da hora: medir de novo.
  SELECT count(*) INTO v_novas FROM public.itens_ata_unidades_historico h
   WHERE h.id > 141 AND (h.item_key IN (SELECT item_key FROM _copias) OR h.item_key IN (
         SELECT DISTINCT item_key FROM public.itens_ata_unidades_historico WHERE id IN (SELECT id FROM _falsas)));
  IF v_novas > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % linhas novas no histórico desses itens depois da medição; medir de novo', v_novas;
  END IF;

  DELETE FROM public.itens_ata_unidades_historico WHERE id IN (SELECT id FROM _falsas);
  GET DIAGNOSTICS v_hist = ROW_COUNT;

  UPDATE public.itens_ata_unidades_copia
     SET unidades = NULL, total_unidades = 0, copiado_em = NULL,
         lido_em = NOW() - INTERVAL '30 days', ultima_leitura_vazia = FALSE
   WHERE item_key IN (SELECT item_key FROM _copias) AND unidades IS NOT NULL;
  GET DIAGNOSTICS v_copias = ROW_COUNT;

  UPDATE public.itens_ata i
     SET quantidade_senasp = s.fonte, quantidade_senasp_lida_em = NOW()
    FROM public.atas_registro_preco a, _senasp s
   WHERE a.id = i.ata_id
     AND (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::text, 5, '0')) = s.item_key
     AND i.quantidade_senasp = s.em_dobro;
  GET DIAGNOSTICS v_senasp = ROW_COUNT;

  SELECT count(*) INTO v_resto FROM public.itens_ata_unidades_historico;

  IF coalesce(current_setting('limpeza.aplicar', true), '') <> 'sim' THEN
    RAISE EXCEPTION 'ENSAIO (nada gravado). histórico apagado=% (fica %), cópias zeradas=%, SENASP corrigido=%',
      v_hist, v_resto, v_copias, v_senasp;
  END IF;
  RAISE NOTICE 'APLICADO. histórico apagado=% (fica %), cópias zeradas=%, SENASP corrigido=%', v_hist, v_resto, v_copias, v_senasp;
END $$;

COMMIT;

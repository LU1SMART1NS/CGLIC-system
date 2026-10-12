-- Limpeza das atas de outros órgãos gravadas por engano em atas_registro_preco (09/10/2026).
--
-- Causa: o recurso 'atas_participacao' (PR #105) lia a vigência no PNCP com enrichArpsBatchWithPncpVigencia, que
-- grava a lista de atas em atas_registro_preco quando a vigência muda. O teste sem gravar das 14h04 UTC e as
-- execuções do cron das 14h10/14h12 gravaram todas as atas das compras lidas (com e sem a SENASP), sem itens.
-- Conferido às 14h54 UTC: 24 atas (200109: 15, 200342: 7, 200334: 2), nenhum item, nenhum vínculo.
-- Nenhuma tela mostrava essas atas (Carteira e Central leem só 200330/200331), e ata_managers não foi tocada.
-- A correção do código está no PR fix/atas-participacao-sem-gravar.
--
-- Alvo: atas de UASG fora da CGLIC, sem itens, gravadas a partir de 09/10/2026 14h. Só itens_ata aponta para
-- atas_registro_preco (ON DELETE CASCADE), e as atas-alvo não têm itens.
-- Como usar (supabase db query --linked -f <arquivo>):
--   Ensaio (padrão): roda numa transação e termina em RAISE EXCEPTION com a lista; nada fica gravado.
--   Aplicar: acrescentar `SET LOCAL limpeza.aplicar = 'sim';` logo depois do BEGIN — só com autorização.
BEGIN;
CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT a.id, a.numero_ata, a.codigo_uasg
  FROM public.atas_registro_preco a
 WHERE a.codigo_uasg NOT IN ('200330', '200331')
   AND a.ultimo_sync_em >= '2026-10-09 14:00:00+00'
   AND NOT EXISTS (SELECT 1 FROM public.itens_ata i WHERE i.ata_id = a.id);

DO $$
DECLARE v_alvo int; v_fora int; v_apagadas int; v_resumo text;
BEGIN
  SELECT count(*) INTO v_alvo FROM _alvo;
  IF v_alvo = 0 THEN
    RAISE EXCEPTION 'ABORTADO: nenhuma ata alvo';
  END IF;
  -- Toda ata de fora da CGLIC precisa estar no alvo: uma com itens ou anterior a 09/10 seria outra história.
  SELECT count(*) INTO v_fora FROM public.atas_registro_preco a
   WHERE a.codigo_uasg NOT IN ('200330', '200331') AND a.id NOT IN (SELECT id FROM _alvo);
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % ata(s) de outra UASG fora do alvo (com itens ou gravadas antes de 09/10)', v_fora;
  END IF;
  SELECT string_agg(codigo_uasg || ':' || n, ' ') INTO v_resumo
    FROM (SELECT codigo_uasg, count(*) n FROM _alvo GROUP BY codigo_uasg ORDER BY codigo_uasg) t;

  DELETE FROM public.atas_registro_preco WHERE id IN (SELECT id FROM _alvo);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  IF current_setting('limpeza.aplicar', true) IS DISTINCT FROM 'sim' THEN
    RAISE EXCEPTION 'ENSAIO OK (nada gravado) — atas apagadas=% (%)', v_apagadas, v_resumo;
  END IF;
  RAISE NOTICE 'APLICADO — atas apagadas=% (%)', v_apagadas, v_resumo;
END $$;
COMMIT;

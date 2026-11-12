-- ==============================================================================
-- MIGRATION 226: EMENDAS — ANO DA EMENDA NOS PEDIDOS QUE JÁ TÊM NOTA DE 2026
-- Versão: 20261028000226_emendas_ano_da_emenda_pelas_notas.sql
--
-- A tela Parlamentares (e a sobra das emendas, migration 204) só conta a emenda do pedido com o ano (siop_emenda_ano).
-- Em 28/10/2026, 27 pedidos importados das planilhas da CAEP tinham o número da emenda sem o ano; 20 deles já têm nota
-- de empenho da SENASP de 2026 ligada às linhas, e os parlamentares apareciam sem Emendas 2026, Empenhado e Sobra.
-- O ano vem das próprias notas (nada inventado):
--   - 18 pedidos: o plano interno da nota no SIAFI traz "2026" + o número da emenda (ex.: "202643670016").
--   - 423 (Luiz Philippe de Orleans e Bragança, 40360006): o plano interno vem cortado ("…202640360"), mas começa com
--     2026 + o início do número.
--   - 521 (Neto Carletto, 44380009): o plano interno diz "SP999S94438 - ATUALIZAR PI"; a prova é a nota 2026NE000015,
--     citada no SEI. Nota do orçamento de 2026 só empenha emenda de 2026.
-- Com o ano, o gatilho da migration 217 dá ao pedido o número no ano ("Pedido N/2026") e o da 206 procura a emenda
-- cadastrada (nenhuma hoje). Ficam sem ano, para conferir no SEI/SIOP, os 7 sem nota: 447, 469, 499, 504, 510, 532, 537.
-- A conta só mexe em pedido ainda sem ano, não cancelado e com nota 2026NE ligada; para se o total não for 20.
-- ==============================================================================

DO $$
DECLARE v_total INTEGER;
BEGIN
  UPDATE public.emenda_pedidos p
     SET siop_emenda_ano = 2026
   WHERE p.numero IN (416, 422, 423, 428, 444, 470, 477, 489, 490, 491, 495, 500, 503, 506, 507, 508, 521, 528, 534, 538)
     AND p.etapa <> 'CANCELADO'
     AND p.siop_emenda IS NOT NULL
     AND p.siop_emenda_ano IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.emenda_pedido_linhas l
         JOIN public.emenda_linha_notas n ON n.linha_id = l.id
        WHERE l.pedido_id = p.id AND n.empenho_id IS NOT NULL AND n.nota LIKE '2026NE%'
     );
  GET DIAGNOSTICS v_total = ROW_COUNT;
  IF v_total <> 20 THEN
    RAISE EXCEPTION 'Esperava 20 pedidos com o ano da emenda a preencher, achou %', v_total;
  END IF;
END;
$$;

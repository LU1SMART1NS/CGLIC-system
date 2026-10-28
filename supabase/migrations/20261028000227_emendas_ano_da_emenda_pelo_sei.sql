-- ==============================================================================
-- MIGRATION 227: EMENDAS — ANO DA EMENDA DOS 7 PEDIDOS SEM NOTA, PELO SEI
-- Versão: 20261028000227_emendas_ano_da_emenda_pelo_sei.sql
--
-- Continuação da 226: os 7 pedidos que ficaram com o número da emenda sem o ano não tinham nota ligada. O ano foi lido
-- no SEI do MJ em 28/10/2026 (pesquisa pelo número da emenda; ofícios do parlamentar e despachos da ASPAR):
--   - 447 Bancada RJ 71200006: "Emenda da Bancada do Rio de Janeiro nº 71200006/2026 … apresentada ao OGU 2026".
--   - 469 Bancada MG 71140003: "saldo residual da emenda da Bancada de Minas Gerais nº 71140003, que foi apresentada
--     ao OGU 2025" (ofícios da Bancada/MG; nenhum documento cita OGU 2026). É de 2025: fica fora de "Emendas 2026".
--   - 499 Giovani Cherini 28630004: "Emenda individual nº 28630004, apresentada ao OGU 2026" (notas 2026NE000418,
--     419, 420 e 443 no SEI, ainda não ligadas ao pedido).
--   - 504 e 532 Gutemberg Reis 40140004: "Emenda individual nº 40140004/2026 … no exercício de 2026".
--   - 510 Doutor Luizinho 39630003: "Emenda individual nº 39630003/2026 … apresentada ao OGU 2026".
--   - 537 Eliziane Gama 41390010: Ofício nº 190/2026/GSEGAMA, "apresentada ao OGU 2026" (NE 2026NE000369).
-- Só mexe em pedido ainda sem ano, com a mesma emenda; para se o total não for 7.
-- ==============================================================================

DO $$
DECLARE v_total INTEGER;
BEGIN
  UPDATE public.emenda_pedidos p
     SET siop_emenda_ano = v.ano
    FROM (VALUES
      (447, '71200006', 2026),
      (469, '71140003', 2025),
      (499, '28630004', 2026),
      (504, '40140004', 2026),
      (510, '39630003', 2026),
      (532, '40140004', 2026),
      (537, '41390010', 2026)
    ) AS v(numero, emenda, ano)
   WHERE p.numero = v.numero
     AND p.siop_emenda = v.emenda
     AND p.siop_emenda_ano IS NULL
     AND p.etapa <> 'CANCELADO';
  GET DIAGNOSTICS v_total = ROW_COUNT;
  IF v_total <> 7 THEN
    RAISE EXCEPTION 'Esperava 7 pedidos com o ano da emenda a preencher, achou %', v_total;
  END IF;
END;
$$;

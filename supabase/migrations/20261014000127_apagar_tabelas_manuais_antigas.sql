-- Apaga as tabelas antigas de empenhos e contratos manuais (início do projeto) e a cópia fechada
-- arp_item_empenhos_descartada (migration 99). Nenhuma tela lê ou grava nelas: o cadastro manual
-- de contratos e empenhos saiu das telas e o vínculo nota ↔ contrato vem da fonte (migrations 85 e 117).
-- Conferido em 14/10/2026: as 7 tabelas estão vazias e nenhuma tabela em uso aponta para elas
-- (a única chave estrangeira de fora, contrato_empenho_links → contratos_manuais, sai junto).
--
-- Também saem as 4 funções que só gravavam nelas. processos_sei FICA: ainda é usada por
-- create_payment_cycle_atomic e save_allocations_atomic.
--
-- Trava: se alguma tabela tiver linhas, a migration para sem apagar nada.

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empenhos_manuais', 'empenho_manual_quantidades', 'contratos_manuais', 'contrato_empenho_links',
    'item_manual_empenho_state', 'item_manual_quantity_state', 'arp_item_empenhos_descartada'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'TABELA_COM_DADOS: % tem % linhas; nada foi apagado', t, n;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Funções que só gravavam nas tabelas manuais (todas as assinaturas).
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'save_manual_contrato_atomic',
        'delete_manual_contrato_atomic',
        'save_manual_empenhos_atomic',
        'save_empenho_manual_quantities_atomic'
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s', f);
  END LOOP;
END $$;

-- Ordem: primeiro quem aponta (vínculos), depois quem é apontado.
DROP TABLE IF EXISTS public.contrato_empenho_links;
DROP TABLE IF EXISTS public.contratos_manuais;
DROP TABLE IF EXISTS public.empenho_manual_quantidades;
DROP TABLE IF EXISTS public.empenhos_manuais;
DROP TABLE IF EXISTS public.item_manual_empenho_state;
DROP TABLE IF EXISTS public.item_manual_quantity_state;
DROP TABLE IF EXISTS public.arp_item_empenhos_descartada;

-- ==============================================================================
-- MIGRATION 53: EMPENHOS QUE SÓ O CONTRATO CONHECE FICAM FORA DO SALDO OFICIAL
-- Versão: 20261002000053_empenhos_so_contrato_fora_saldo_oficial.sql
--
-- A coluna arp_item_empenhos.consta_saldo_oficial (migration 52) nasceu com padrão verdadeiro.
-- As linhas criadas antes da 52 pela sincronização por contrato (contract_key preenchido) ainda
-- não foram confirmadas pelo Compras.gov, então não fazem parte do saldo oficial. Marcadas como
-- verdadeiro, não receberiam a quantidade da minuta do contrato (regra "Compras.gov prevalece").
--
-- Só toca linhas de itens sem saldo oficial sincronizado e que o usuário não atribuiu; repetir é inofensivo.
-- ==============================================================================

UPDATE public.arp_item_empenhos ie
   SET consta_saldo_oficial = false,
       updated_at = NOW()
 WHERE ie.consta_saldo_oficial = true
   AND ie.contract_key IS NOT NULL
   AND ie.fonte_quantidade IS DISTINCT FROM 'USUARIO'
   AND NOT EXISTS (
     SELECT 1 FROM public.arp_item_saldo_oficial so WHERE so.item_key = ie.item_key
   );

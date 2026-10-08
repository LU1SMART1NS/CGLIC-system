-- MIGRATION 96: PROCESSO ADMINISTRATIVO DA COMPRA NAS ATAS
--
-- O número do processo pertence à compra (a licitação), não ao item nem ao contrato: a ata, os itens dela e os
-- contratos gerados dela compartilham o mesmo número. As APIs do Compras.gov.br não o trazem para atas e itens,
-- mas o cadastro da compra no PNCP traz (campo "processo", sem máscara). A sincronização passa a gravá-lo aqui.
--
--   NULL = ainda não consultado no PNCP (a sincronização tenta de novo)
--   ''   = o PNCP respondeu e não informa o processo (não se consulta de novo)
--
-- A coluna é de leitura pública no mesmo regime da tabela (migration 84): só o servidor grava.
ALTER TABLE public.atas_registro_preco
  ADD COLUMN IF NOT EXISTS processo_compra VARCHAR(40);

COMMENT ON COLUMN public.atas_registro_preco.processo_compra IS
  'Processo administrativo da compra, como o PNCP informa (só dígitos, ex.: 08020001450202479). NULL = não consultado; vazio = o PNCP não informa.';

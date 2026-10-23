-- ==============================================================================
-- MIGRATION 160: EMENDAS PARLAMENTARES — CAMPOS DA CARGA DAS PLANILHAS DA CAEP
-- Versão: 20261023000160_emendas_carga_planilhas.sql
--
-- A CAEP controlava as emendas em duas planilhas: a de saldo (quanto de cada item foi indicado a cada autor) e a de
-- execução (processo SEI, emenda, empenho, contrato e beneficiário de cada linha). A carga traz o que já existe para
-- os pedidos (origem 'PLANILHA'), com quatro decisões de 23/10/2026:
--
-- 1) Empenhado sem a nota: a planilha de execução traz o documento SEI do empenho, não o número da nota
--    (2026NE000000). A linha guarda o documento (empenho_documento_sei); a nota é achada depois pelo contrato
--    (contrato_empenhos) ou pelo Portal da Transparência, pelo número da emenda.
-- 2) Beneficiário pelo nome: a planilha não tem CNPJ. A linha guarda o nome como veio (beneficiario_nome) até a
--    CAEP cadastrar o beneficiário com CNPJ (beneficiario_id).
-- 3) Contrato: a linha guarda o número do contrato da planilha (contrato_numero, como '00138/2026'), para ligar ao
--    contrato que o sistema já tem. A previsão de entrega é a do contrato (contrato_entregas_previstas, informada
--    pelo gestor do contrato), não a data da planilha.
-- 4) A conferir: o que não bate entre as duas planilhas (cor x execução, quantidade) fica escrito na linha
--    (a_conferir) para a CAEP revisar; planilha_ref diz de onde a linha veio.
--
-- Só acrescenta colunas que aceitam vazio: nada que já existe muda. A regravação das linhas pela tela
-- (emendas_gravar_linhas) não mexe nessas colunas.
-- ==============================================================================

ALTER TABLE public.emenda_pedido_linhas
  ADD COLUMN IF NOT EXISTS beneficiario_nome     VARCHAR(300),
  ADD COLUMN IF NOT EXISTS empenho_documento_sei VARCHAR(40),
  ADD COLUMN IF NOT EXISTS contrato_numero       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS a_conferir            TEXT,
  ADD COLUMN IF NOT EXISTS planilha_ref          VARCHAR(160);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_pedido_linhas_contrato_numero') THEN
    ALTER TABLE public.emenda_pedido_linhas
      ADD CONSTRAINT emenda_pedido_linhas_contrato_numero CHECK (contrato_numero IS NULL OR contrato_numero ~ '^[0-9]{5}/[0-9]{4}$');
  END IF;
END $$;

COMMENT ON COLUMN public.emenda_pedido_linhas.beneficiario_nome IS
  'Nome do beneficiário como veio da planilha da CAEP, até o cadastro com CNPJ (beneficiario_id).';
COMMENT ON COLUMN public.emenda_pedido_linhas.empenho_documento_sei IS
  'Documento SEI do empenho (planilha de execução). A nota (nota_empenho) é achada pelo contrato ou pelo Portal.';
COMMENT ON COLUMN public.emenda_pedido_linhas.contrato_numero IS
  'Número do contrato citado na planilha (00138/2026), para ligar ao contrato do sistema.';
COMMENT ON COLUMN public.emenda_pedido_linhas.a_conferir IS
  'O que não bate entre as planilhas da CAEP nesta linha (cor, quantidade, etapa), para revisão.';
COMMENT ON COLUMN public.emenda_pedido_linhas.planilha_ref IS
  'De onde a linha veio na carga das planilhas (aba, linha e coluna).';

CREATE INDEX IF NOT EXISTS ix_emenda_pedido_linhas_contrato ON public.emenda_pedido_linhas (contrato_numero) WHERE contrato_numero IS NOT NULL;

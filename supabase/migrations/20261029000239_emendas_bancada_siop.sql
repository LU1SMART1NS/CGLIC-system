-- ==============================================================================
-- Migration 239: o que o SIOP diz da emenda além do valor (bancadas, decisão D6 de 29/10/2026)
--
-- Protótipo aprovado em 29/10/2026 (valor a indicar nas emendas): na emenda de bancada o valor da emenda é só a linha de
-- compra direta do SIOP (ação 21BM, modalidade 90). O resto que o SIOP mostra entra só como informação na Emenda 360:
--   - bloqueado_controle: "107 Bloqueado Controle SOF" da linha de compra direta;
--   - bloqueado_programacao: "108 Bloqueado Programação Orçamentária" da linha de compra direta;
--   - fora_compra_direta: as outras linhas da emenda no SIOP (outra modalidade ou outra ação), cada uma com ação,
--     modalidade, autorizado e empenhado. Não entram no valor da emenda nem no valor a indicar.
--   - siop_lido_em: dia da leitura no SIOP que deu esses números (vista_em continua sendo o dia em que a CAEP viu a
--     emenda, de onde conta o aviso de emenda sem pedido).
-- Grava a carga do SIOP (servidor); nenhuma tela edita. Sem mudança de função nem de permissão.
-- ==============================================================================

ALTER TABLE public.emendas_siop
  ADD COLUMN IF NOT EXISTS bloqueado_controle    NUMERIC(18, 2) CHECK (bloqueado_controle IS NULL OR bloqueado_controle >= 0),
  ADD COLUMN IF NOT EXISTS bloqueado_programacao NUMERIC(18, 2) CHECK (bloqueado_programacao IS NULL OR bloqueado_programacao >= 0),
  ADD COLUMN IF NOT EXISTS fora_compra_direta    JSONB CHECK (fora_compra_direta IS NULL OR jsonb_typeof(fora_compra_direta) = 'array'),
  ADD COLUMN IF NOT EXISTS siop_lido_em          DATE;

COMMENT ON COLUMN public.emendas_siop.bloqueado_controle IS
  'SIOP, linha de compra direta (21BM, modalidade 90): 107 Bloqueado Controle SOF. Só informação; não desconta do valor (migration 239).';
COMMENT ON COLUMN public.emendas_siop.bloqueado_programacao IS
  'SIOP, linha de compra direta: 108 Bloqueado Programação Orçamentária. Só informação; não desconta do valor (migration 239).';
COMMENT ON COLUMN public.emendas_siop.fora_compra_direta IS
  'Outras linhas da emenda no SIOP, fora da compra direta: [{acao, modalidade, autorizado, empenhado}]. Não entram no valor (migration 239).';
COMMENT ON COLUMN public.emendas_siop.siop_lido_em IS
  'Dia da leitura no SIOP que deu valor, bloqueios e linhas fora da compra direta (migration 239).';

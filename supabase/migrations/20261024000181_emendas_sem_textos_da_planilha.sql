-- ==============================================================================
-- MIGRATION 181: EMENDAS PARLAMENTARES — SAEM OS TEXTOS FIXOS DA CARGA DAS PLANILHAS
-- Versão: 20261024000181_emendas_sem_textos_da_planilha.sql
--
-- A carga das planilhas da CAEP (migration 160) gravou textos que comparavam a planilha de saldo com a de execução e
-- que ninguém resolve pela tela. Em 24/10/2026 os pedidos importados foram conferidos com as autorizações de empenho
-- do SEI, que passaram a ser a fonte da verdade (decisão do usuário), e as diferenças foram corrigidas nos pedidos.
-- Os textos perderam o sentido:
-- 1) emenda_pedido_linhas.a_conferir ("A conferir: Número em vermelho na planilha…", 586 linhas) e planilha_ref (a
--    referência da célula, 2.570 linhas) saem. Nenhuma função nem visão usa as duas colunas.
-- 2) A observação da carga sai dos 144 pedidos importados: "Carga das planilhas de saldo e de execução da CAEP
--    (23/10/2026)." (103), "Carga da planilha de saldo da CAEP (23/10/2026)." (40 reservas) e uma com "coluna CBMERJ,
--    reserva para o órgão com parlamentar a definir" (a tela já mostra a reserva sem parlamentar). A origem continua em
--    emenda_pedidos.origem = 'PLANILHA'.
-- Cópia dos textos: supabase/limpezas/copia-20261024-emendas-textos-planilha.json.
-- emenda_pedido_linhas.beneficiario_nome fica: salvar_pedido_emenda ainda o usa.
-- ==============================================================================

-- 1) Colunas da carga
ALTER TABLE public.emenda_pedido_linhas
  DROP COLUMN IF EXISTS a_conferir,
  DROP COLUMN IF EXISTS planilha_ref;

-- 2) Observação da carga (depois do ALTER TABLE: a trava de saldo da 157 é um gatilho adiado, e ALTER TABLE recusa
--    tabela com gatilho pendente)
UPDATE public.emenda_pedidos
   SET observacao = NULL
 WHERE origem = 'PLANILHA'
   AND observacao LIKE 'Carga da%planilha%da CAEP (23/10/2026)%';

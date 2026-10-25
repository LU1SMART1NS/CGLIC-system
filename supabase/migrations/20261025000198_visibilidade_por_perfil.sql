-- ==============================================================================
-- MIGRATION 198: VISIBILIDADE POR PERFIL (protótipo aprovado em 25/10/2026, decisões D7, D8 e D9)
-- Versão: 20261025000198_visibilidade_por_perfil.sql
--
-- 1) D7 — Trava de usuário desativado: quatro tabelas criadas depois da migration 124 ficaram sem a política
--    restritiva "Somente usuario ativo" (o usuário desativado lia até o login vencer): empenho_saldo_contabil e
--    saldo_contabil_cargas (128), rotinas_controle (134) e emenda_notas_tesouro_tentativas (184).
-- 2) D7 — emenda_notas_tesouro_tentativas era lida por qualquer usuário logado; passa à regra das outras tabelas de
--    Emendas (emendas.view).
-- 3) D8 — O gestor de atas e contratos passa a ler as emendas (emendas.view): a aba Emendas do Item 360 mostra, nos
--    itens das atas dele, o que a CAEP reservou a cada parlamentar. Alterar continua só com emendas.manage
--    (coordenador e gestor de emendas).
-- 4) D9 — Os níveis dos gestores (Central de Distribuição) passam a ser lidos só pelo coordenador; a consulta deixa a
--    Distribuição (fila de trabalho do coordenador e avaliação dos servidores).
--
-- Só mexe em políticas e em role_permissions; nenhuma linha de dado muda.
-- ==============================================================================

-- 1) Trava de usuário desativado ------------------------------------------------------------
DO $$
DECLARE
  v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['empenho_saldo_contabil', 'saldo_contabil_cargas', 'rotinas_controle', 'emenda_notas_tesouro_tentativas'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))',
      'Somente usuario ativo', v_tabela
    );
  END LOOP;
END
$$;

-- 2) Tentativas do Tesouro: leitura de quem lê as emendas --------------------------------------
DROP POLICY IF EXISTS "Leitura para logados: emenda_notas_tesouro_tentativas" ON public.emenda_notas_tesouro_tentativas;
DROP POLICY IF EXISTS "Emendas Read: emenda_notas_tesouro_tentativas" ON public.emenda_notas_tesouro_tentativas;
CREATE POLICY "Emendas Read: emenda_notas_tesouro_tentativas" ON public.emenda_notas_tesouro_tentativas
  FOR SELECT TO authenticated USING (public.has_permission('emendas.view'));

-- 3) Gestor de atas e contratos lê as emendas ---------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_key) VALUES ('gestor', 'emendas.view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 4) Níveis dos gestores: só o coordenador ------------------------------------------------------
DROP POLICY IF EXISTS "Central Read: gestor_niveis" ON public.gestor_niveis;
CREATE POLICY "Central Read: gestor_niveis"
  ON public.gestor_niveis FOR SELECT TO authenticated
  USING (public.has_role('admin'));

DROP POLICY IF EXISTS "Central Read: gestor_niveis_historico" ON public.gestor_niveis_historico;
CREATE POLICY "Central Read: gestor_niveis_historico"
  ON public.gestor_niveis_historico FOR SELECT TO authenticated
  USING (public.has_role('admin'));

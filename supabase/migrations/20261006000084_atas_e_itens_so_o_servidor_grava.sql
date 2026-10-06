-- ==============================================================================
-- MIGRATION 84: SÓ O SERVIDOR GRAVA ATAS E ITENS DAS ATAS
-- Versão: 20261006000084_atas_e_itens_so_o_servidor_grava.sql
--
-- Problema (achado em 04/10/2026, item "Sync Write" da auditoria de segurança): as políticas
-- "Sync Write: atas_registro_preco" e "Sync Write: itens_ata" davam FOR ALL a QUALQUER usuário logado
-- (USING e WITH CHECK = true), inclusive o perfil de consulta. Existiam porque o navegador gravava o cache
-- das atas. Isso permitia a qualquer pessoa autenticada alterar ou apagar atas e itens direto pela API,
-- o que muda saldos, vigências e quantidades de todos os painéis.
--
-- Agora a sincronização roda no servidor (Edge Function sincronizar-fontes, chave de service_role, que
-- ignora a RLS) e o navegador deixou de gravar (cacheArpsInDb e cacheArpItemsInDb só gravam no servidor).
--
-- O que muda
-- - Some a escrita do usuário logado nas duas tabelas. A leitura continua igual: a policy "Sync Write"
--   (FOR ALL) era a que dava o SELECT desde que a policy de leitura redundante saiu (migration 75), então
--   entra uma policy de SELECT no lugar, para todos os logados, como antes.
-- - Escrevem: o servidor (service_role) e as funções SECURITY DEFINER do dono das tabelas (por exemplo
--   sync_item_senasp_quantity_atomic), que não passam pela RLS. Conferido em pg_proc: nenhuma função
--   SECURITY INVOKER grava nessas tabelas.
-- - Os privilégios de escrita são revogados de anon e authenticated também no nível da tabela (defesa em
--   profundidade: mesmo que uma policy de escrita volte por engano, a tabela recusa).
--
-- Idempotente. Nada muda para quem só lê.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- atas_registro_preco
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sync Write: atas_registro_preco" ON public.atas_registro_preco;
DROP POLICY IF EXISTS "Authenticated Read: atas_registro_preco" ON public.atas_registro_preco;
CREATE POLICY "Authenticated Read: atas_registro_preco"
  ON public.atas_registro_preco FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.atas_registro_preco FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- itens_ata
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sync Write: itens_ata" ON public.itens_ata;
DROP POLICY IF EXISTS "Authenticated Read: itens_ata" ON public.itens_ata;
CREATE POLICY "Authenticated Read: itens_ata"
  ON public.itens_ata FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.itens_ata FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- Trava: depois disto o usuário logado não pode ter nenhuma policy de escrita nessas duas tabelas.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_abertas TEXT;
BEGIN
  SELECT string_agg(tablename || ': ' || policyname, '; ') INTO v_abertas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('atas_registro_preco', 'itens_ata')
     AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     AND (roles && ARRAY['public', 'anon', 'authenticated']::name[]);
  IF v_abertas IS NOT NULL THEN
    RAISE EXCEPTION 'Ainda há política de escrita para usuário logado em atas/itens (%); migration revertida.', v_abertas;
  END IF;
END;
$$;

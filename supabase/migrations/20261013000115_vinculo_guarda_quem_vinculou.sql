-- ==============================================================================
-- MIGRATION 115: O VÍNCULO ITEM ↔ CONTRATO GUARDA O NOME DE QUEM VINCULOU
--
-- Até aqui o vínculo guardava só o código do usuário (criado_por) e a tela mostrava, no lugar do nome, o texto fixo
-- "Vínculo atribuído pela Coordenação" (gravado pela tela mesmo quando quem vinculava era gestor). Passa a seguir o
-- padrão dos outros registros (descarte, "não pertence a ata", empenho vinculado): o nome vai junto, gravado na hora.
--
-- 1) coluna criado_por_nome;
-- 2) gatilho BEFORE INSERT que preenche o nome de quem está logado (vale para as duas RPCs de vínculo e para qualquer
--    gravação futura; o vínculo automático grava criado_por nulo e fica sem nome);
-- 3) preenche os vínculos manuais que já existem a partir do cadastro de usuários (hoje não há nenhum em produção);
-- 4) apaga o texto fixo das observações (observação digitada por alguém continua).
-- ==============================================================================

ALTER TABLE public.arp_item_contract_links
  ADD COLUMN IF NOT EXISTS criado_por_nome VARCHAR(150);

COMMENT ON COLUMN public.arp_item_contract_links.criado_por_nome IS
  'Nome de quem fez o vínculo, gravado na hora (migration 115). Nulo no vínculo automático e nos anteriores sem usuário registrado.';

CREATE OR REPLACE FUNCTION public.trg_vinculo_grava_quem_vinculou()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.criado_por_nome IS NULL AND NEW.criado_por IS NOT NULL THEN
    NEW.criado_por_nome := public.nome_do_usuario_logado();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_vinculo_grava_quem_vinculou() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vinculo_grava_quem_vinculou ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_grava_quem_vinculou
BEFORE INSERT ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_grava_quem_vinculou();

-- Vínculos manuais que já existem: o nome sai do cadastro de usuários (mesma regra de nome_do_usuario_logado).
-- Só os manuais: os automáticos antigos (migration 95 converteu testes de gente) não mostram nome.
UPDATE public.arp_item_contract_links l
   SET criado_por_nome = LEFT(COALESCE(
         NULLIF(u.raw_user_meta_data->>'nome', ''),
         NULLIF(u.raw_user_meta_data->>'full_name', ''),
         split_part(u.email, '@', 1)
       ), 150)
  FROM auth.users u
 WHERE u.id = l.criado_por
   AND l.origem = 'MANUAL'
   AND l.criado_por_nome IS NULL;

-- O texto fixo não diz nada que o nome e a data não digam melhor.
UPDATE public.arp_item_contract_links
   SET observacoes = NULL
 WHERE observacoes = 'Vínculo atribuído pela Coordenação';

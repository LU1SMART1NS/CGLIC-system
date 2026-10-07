import type { User } from '@supabase/supabase-js';

/**
 * O link do convite já cria a sessão do usuário, antes de ele escolher a
 * senha. A função invite-user grava `senha_pendente: true` nos metadados e
 * a tela de definição de senha troca o valor para `false`. Enquanto estiver
 * pendente, o sistema só deixa o usuário na tela /definir-senha.
 * Usuários antigos não têm a marca e não são afetados.
 */
export const temSenhaPendente = (user: User | null | undefined): boolean =>
  user?.user_metadata?.senha_pendente === true;

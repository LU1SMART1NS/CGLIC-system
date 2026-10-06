import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// As Edge Functions rodam em Deno no Supabase e não têm teste de execução aqui. Estas checagens leem o
// código-fonte para impedir duas regressões já corrigidas: o mapeamento de perfil duplicado e a gravação
// de role/escopo no convite com o erro ignorado.
const lerFuncao = (nome: string) => readFileSync(resolve(__dirname, '../../', nome, 'index.ts'), 'utf8');

describe('mapeamento de perfil nas funções de usuários', () => {
  it.each(['invite-user', 'manage-user'])('%s usa o mapeamento compartilhado e não declara o seu', (funcao) => {
    const fonte = lerFuncao(funcao);
    expect(fonte).toContain('from "../_shared/roleMapping.ts"');
    expect(fonte).not.toContain('PERFIL_TO_DB_ROLE');
    expect(fonte).not.toMatch(/function\s+mapPerfilToDbRole/);
  });
});

describe('invite-user: erros de gravação não são engolidos', () => {
  const fonte = lerFuncao('invite-user');

  it('responde com erro quando a gravação do perfil falha', () => {
    expect(fonte).toContain('const { error: roleUpsertError }');
    expect(fonte).toMatch(/if \(roleUpsertError\)\s*{\s*return jsonError/);
  });

  it('responde com erro quando a gravação do escopo falha e troca o escopo do domínio no reenvio', () => {
    expect(fonte).toContain('const { error: scopeInsertError }');
    expect(fonte).toMatch(/if \(scopeInsertError\)\s*{\s*return jsonError/);
    expect(fonte).toMatch(/\.delete\(\)\s*\.eq\("user_id", invitedUserId\)\s*\.eq\("domain"/);
  });
});

/**
 * Conflito de edição (migration 129): a tela manda a versão que leu junto com os dados (p_versao_vista) e o banco
 * recusa com CONFLITO_EDICAO (40001) quando outra pessoa alterou o mesmo registro nesse meio-tempo.
 */

export const MENSAGEM_CONFLITO_EDICAO =
  'Outra pessoa alterou isto enquanto você editava. A tela foi atualizada com a versão atual. Confira e salve de novo, se ainda for preciso.';

export class ConflitoEdicaoError extends Error {
  readonly code = 'CONFLITO_EDICAO';
  constructor() {
    super(MENSAGEM_CONFLITO_EDICAO);
    this.name = 'ConflitoEdicaoError';
  }
}

/** O erro do Supabase é a recusa por conflito de edição. */
export function erroDeConflito(error: any): boolean {
  return /CONFLITO_EDICAO/.test(String(error?.message ?? '')) || error?.code === 'CONFLITO_EDICAO';
}

/** O erro (já lançado por um service) é o conflito de edição. */
export function ehConflitoEdicao(err: unknown): boolean {
  return err instanceof ConflitoEdicaoError || erroDeConflito(err);
}

/** Parâmetro p_versao_vista só quando a tela tem a versão (sem ela, o banco grava como antes). */
export function comVersao(versao: string | null | undefined): { p_versao_vista?: string } {
  return versao ? { p_versao_vista: versao } : {};
}

/** A coluna calculada versao_edicao ainda não existe no banco (migration 129 não aplicada). */
export function semColunaDeVersao(error: any): boolean {
  return /versao_edicao/.test(String(error?.message ?? ''));
}

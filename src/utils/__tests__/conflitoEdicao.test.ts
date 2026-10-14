import { describe, expect, it } from 'vitest';
import { ConflitoEdicaoError, MENSAGEM_CONFLITO_EDICAO, comVersao, ehConflitoEdicao, erroDeConflito } from '../conflitoEdicao';

describe('conflito de edição (migration 129)', () => {
  it('reconhece a recusa do banco pelo código no texto', () => {
    expect(erroDeConflito({ code: '40001', message: 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' })).toBe(true);
    expect(erroDeConflito({ code: '40001', message: 'STALE: a quantidade do contrato mudou.' })).toBe(false);
    expect(erroDeConflito({ code: '42501', message: 'UNAUTHORIZED: só o gestor.' })).toBe(false);
  });

  it('o erro lançado pelos services leva o texto aprovado', () => {
    const err = new ConflitoEdicaoError();
    expect(err.message).toBe(MENSAGEM_CONFLITO_EDICAO);
    expect(ehConflitoEdicao(err)).toBe(true);
    expect(ehConflitoEdicao(new Error('outro erro'))).toBe(false);
  });

  it('só manda p_versao_vista quando a tela tem a versão', () => {
    expect(comVersao('abc')).toEqual({ p_versao_vista: 'abc' });
    expect(comVersao(null)).toEqual({});
    expect(comVersao(undefined)).toEqual({});
    expect(comVersao('')).toEqual({});
  });
});

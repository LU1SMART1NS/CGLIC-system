import { describe, it, expect } from 'vitest';
import { resumoDaRepartição } from '../fiscalizacaoRepartir';

const p = (beneficiarioId: string, qtd: string, atual = false) => ({ beneficiarioId, qtd, atual });

describe('Repartir entre beneficiários (migration 286)', () => {
  it('fecha quando a soma é a quantidade do item, com a parte de hoje primeiro', () => {
    const r = resumoDaRepartição([p('gavop', '5'), p('dfnsp', '6', true), p('pmdf', '4'), p('cbmdf', '6')], 21);
    expect(r.fecha).toBe(true);
    expect(r.texto).toBe('Soma 21 de 21');
    expect(r.comQtd).toBe(4);
    expect(r.paraGravar[0]).toEqual({ beneficiarioId: 'dfnsp', quantidade: 6 });
  });

  it('avisa quanto falta ou sobra', () => {
    expect(resumoDaRepartição([p('dfnsp', '21', true), p('gavop', '5')], 21).texto).toBe('Soma 26 de 21 · sobram 5');
    expect(resumoDaRepartição([p('dfnsp', '10', true), p('gavop', '')], 21).texto).toBe('Soma 10 de 21 · faltam 11');
    expect(resumoDaRepartição([p('a', '1000', true), p('b', '500')], 2000).texto).toBe('Soma 1.500 de 2.000 · faltam 500');
  });

  it('parte com 0 não vai ao banco: a de hoje zerada passa o item inteiro às outras', () => {
    const r = resumoDaRepartição([p('dfnsp', '0', true), p('gavop', '15'), p('pmdf', '6')], 21);
    expect(r.comQtd).toBe(2);
    expect(r.paraGravar).toEqual([{ beneficiarioId: 'gavop', quantidade: 15 }, { beneficiarioId: 'pmdf', quantidade: 6 }]);
  });

  it('beneficiário de hoje sem cadastro só pode ficar com 0', () => {
    expect(resumoDaRepartição([p('', '10', true), p('gavop', '11')], 21).semCadastro).toBe(true);
    expect(resumoDaRepartição([p('', '0', true), p('gavop', '11'), p('pmdf', '10')], 21).semCadastro).toBe(false);
  });
});

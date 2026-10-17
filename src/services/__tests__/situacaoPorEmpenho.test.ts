import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }));

import { situacaoPorEmpenho, type SituacaoDistribuicao } from '../distribuicaoEmpenhoService';

describe('situacaoPorEmpenho: nota em mais de um contrato (coluna Itens da tela Empenhos)', () => {
  const s = (contractKey: string, situacao: SituacaoDistribuicao, empenhoId = 'e1') => ({ empenhoId, contractKey, situacao, origem: null });

  it('mostra a que mais pede trabalho, em qualquer ordem de leitura', () => {
    expect(situacaoPorEmpenho([s('A', 'DISTRIBUIDA'), s('B', 'A_DISTRIBUIR')]).get('e1')?.contractKey).toBe('B');
    expect(situacaoPorEmpenho([s('B', 'A_DISTRIBUIR'), s('A', 'DISTRIBUIDA')]).get('e1')?.contractKey).toBe('B');
    expect(situacaoPorEmpenho([s('A', 'A_DISTRIBUIR'), s('B', 'REVISAR')]).get('e1')?.situacao).toBe('REVISAR');
    expect(situacaoPorEmpenho([s('A', 'SEM_ITENS'), s('B', 'DISTRIBUIDA')]).get('e1')?.situacao).toBe('DISTRIBUIDA');
    expect(situacaoPorEmpenho([s('A', 'SEM_VALOR'), s('B', 'SEM_ITENS')]).get('e1')?.situacao).toBe('SEM_ITENS');
  });

  it('empate: a do contrato de menor chave, em qualquer ordem de leitura', () => {
    expect(situacaoPorEmpenho([s('B', 'DISTRIBUIDA'), s('A', 'DISTRIBUIDA')]).get('e1')?.contractKey).toBe('A');
    expect(situacaoPorEmpenho([s('A', 'DISTRIBUIDA'), s('B', 'DISTRIBUIDA')]).get('e1')?.contractKey).toBe('A');
  });

  it('uma entrada por nota', () => {
    const mapa = situacaoPorEmpenho([s('A', 'DISTRIBUIDA', 'e1'), s('B', 'REVISAR', 'e1'), s('C', 'A_DISTRIBUIR', 'e2')]);
    expect(mapa.size).toBe(2);
    expect(mapa.get('e2')?.contractKey).toBe('C');
  });
});

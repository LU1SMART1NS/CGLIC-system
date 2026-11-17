import { describe, it, expect } from 'vitest';
import { faturasNaFilaPorContrato } from '../useFaturasNaFila';
import { textoDaFila } from '../OcupacaoBarra';
import type { PagamentoCarteiraRow } from '../../../../services/financeiroCarteiraService';

const linha = (contractKey: string, etapa: PagamentoCarteiraRow['etapa'], tipo: 'CICLO' | 'FATURA' = 'FATURA') =>
  ({ tipo, chave: `${contractKey}-${etapa}-${Math.random()}`, contractKey, etapa }) as unknown as PagamentoCarteiraRow;

describe('faturas na fila', () => {
  it('conta só "Precisa de ação" (ciclo na CGLIC, erro no SIAFI), um por linha', () => {
    const mapa = faturasNaFilaPorContrato([
      linha('A', 'NA_CGLIC', 'CICLO'),
      linha('A', 'ERRO_SIAFI'),
      linha('A', 'NA_CGOFI', 'CICLO'),
      linha('B', 'AGUARDANDO_OB'),
      linha('B', 'PAGA'),
      linha('C', 'SEM_CONFIRMACAO')
    ]);
    expect(mapa).toEqual({ A: 2 });
  });

  it('texto da fila junta tarefas e faturas', () => {
    expect(textoDaFila(40, 3)).toBe('40 tarefas e 3 faturas na fila');
    expect(textoDaFila(1, 0)).toBe('1 tarefa na fila');
    expect(textoDaFila(0, 1)).toBe('1 fatura na fila');
    expect(textoDaFila(0, 0)).toBe('');
  });
});

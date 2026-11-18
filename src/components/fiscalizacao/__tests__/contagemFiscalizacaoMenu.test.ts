import { describe, it, expect } from 'vitest';
import { contarFiscalizacaoDoMenu } from '../useContagemFiscalizacao';
import type { LinhaContrato } from '../../../utils/fiscalizacaoContratosLista';

const linha = (seg: LinhaContrato['seg'], fiscalUserId: string, dias: number | null): LinhaContrato =>
  ({ seg, dias, c: { fiscalUserId } } as unknown as LinhaContrato);

const linhas = [
  linha('VOCE', 'ana', -3),
  linha('VOCE', 'ana', 10),
  linha('VOCE', 'beto', null),
  linha('OUTROS', 'ana', -20),
  linha('FINALIZADO', 'beto', null)
];

describe('número do menu Fiscalização', () => {
  it('fiscal: só os contratos "Com você" dele, vermelho pelos passos vencidos', () => {
    expect(contarFiscalizacaoDoMenu(linhas, 'ana')).toEqual({ total: 2, vencidos: 1 });
    expect(contarFiscalizacaoDoMenu(linhas, 'beto')).toEqual({ total: 1, vencidos: 0 });
  });

  it('coordenador: "Com o fiscal" de todos os fiscais (a mesma aba da tela dele)', () => {
    expect(contarFiscalizacaoDoMenu(linhas, null)).toEqual({ total: 3, vencidos: 1 });
  });

  it('contratos com outros e finalizados não contam', () => {
    expect(contarFiscalizacaoDoMenu([linha('OUTROS', 'ana', -1), linha('FINALIZADO', 'ana', null)], null)).toEqual({ total: 0, vencidos: 0 });
  });
});

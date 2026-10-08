import { describe, it, expect } from 'vitest';
import { summarizeAllocationExecution, vinculosSemQuantidade } from '../allocationExecution';
import type { ParcelaDoItem } from '../empenhoDoItem';

const parcela = (numeroOficial: string, quantidade: number | null): ParcelaDoItem => ({
  contratoEmpenhoId: numeroOficial,
  contractKey: 'K',
  empenhoId: numeroOficial,
  numeroOficial,
  dataEmissao: null,
  uasgEmitente: '200331',
  valor: (quantidade ?? 1) * 10,
  quantidade,
  origem: 'USUARIO',
  vinculadaPorNome: null,
  vinculadaEm: null
});
const allocations = [{ id: 'a1' }, { id: 'a2' }];

describe('summarizeAllocationExecution (empenhado por unidade pelas parcelas do item)', () => {
  it('soma as parcelas das notas ligadas a cada unidade', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 200), parcela('2024NE000400', 50)]}, { '2024NE000337': 'a1', '2024NE000400': 'a1' });
    expect(r.porAlocacao.get('a1')).toEqual({ empenhado: 250, vinculados: 2 });
    expect(r.porAlocacao.get('a2')).toEqual({ empenhado: 0, vinculados: 0 });
  });

  it('parcela sem unidade vai para "sem unidade"', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 200)]}, {});
    expect(r.semUnidade).toEqual({ empenhado: 200, count: 1 });
  });

  it('nota sem quantidade neste item não segura a unidade nem soma empenhado', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000330', null)] }, { '2024NE000330': 'a2' });
    expect(r.porAlocacao.get('a2')).toEqual({ empenhado: 0, vinculados: 0 });
  });

  it('compara o número da nota sem zeros e separadores, e ignora ligação com unidade que não existe mais', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 10)]}, { '2024NE337': 'a1', '2024NE000999': 'apagada' });
    expect(r.porAlocacao.get('a1')!.empenhado).toBe(10);
  });
});

describe('vinculosSemQuantidade (nota só fica na unidade com quantidade definida)', () => {
  it('tira a ligação da nota que saiu do item ou ficou sem quantidade', () => {
    const r = vinculosSemQuantidade(
      { '2024NE337': 'a1', '2024NE000330': 'a2', '2024NE000500': 'a1' },
      [parcela('2024NE000337', 10), parcela('2024NE000330', null)]
    );
    expect(r).toEqual({
      restantes: { '2024NE337': 'a1' },
      removidos: [
        { numero: '2024NE000330', allocationId: 'a2' },
        { numero: '2024NE000500', allocationId: 'a1' }
      ]
    });
  });

  it('nada a tirar: nulo', () => {
    expect(vinculosSemQuantidade({ '2024NE000337': 'a1' }, [parcela('2024NE000337', 10)])).toBeNull();
    expect(vinculosSemQuantidade({}, [])).toBeNull();
  });
});

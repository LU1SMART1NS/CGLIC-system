import { describe, it, expect } from 'vitest';
import { summarizeAllocationExecution } from '../allocationExecution';
import { mapDistribuicao } from '../../services/distribuicaoEmpenhoService';
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
const aVincular = (ne: string) => mapDistribuicao({ contrato_empenho_id: ne, empenho_id: ne, numero_oficial: ne, situacao: 'A_DISTRIBUIR', valor_nota: 100, parcelas: [], sugestao: [] });
const allocations = [{ id: 'a1' }, { id: 'a2' }];

describe('summarizeAllocationExecution (empenhado por unidade pelas parcelas do item)', () => {
  it('soma as parcelas das notas ligadas a cada unidade', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 200), parcela('2024NE000400', 50)], aVincular: [] }, { '2024NE000337': 'a1', '2024NE000400': 'a1' });
    expect(r.porAlocacao.get('a1')).toEqual({ empenhado: 250, vinculados: 2 });
    expect(r.porAlocacao.get('a2')).toEqual({ empenhado: 0, vinculados: 0 });
  });

  it('parcela sem unidade vai para "sem unidade"', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 200)], aVincular: [] }, {});
    expect(r.semUnidade).toEqual({ empenhado: 200, count: 1 });
  });

  it('nota ainda a vincular aos itens, ligada à unidade, segura a unidade mas não soma empenhado', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [], aVincular: [aVincular('2024NE000330')] }, { '2024NE000330': 'a2' });
    expect(r.porAlocacao.get('a2')).toEqual({ empenhado: 0, vinculados: 1 });
  });

  it('compara o número da nota sem zeros e separadores, e ignora ligação com unidade que não existe mais', () => {
    const r = summarizeAllocationExecution(allocations, { parcelas: [parcela('2024NE000337', 10)], aVincular: [] }, { '2024NE337': 'a1', '2024NE000999': 'apagada' });
    expect(r.porAlocacao.get('a1')!.empenhado).toBe(10);
  });
});

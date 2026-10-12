import { describe, it, expect } from 'vitest';
import {
  summarizeContractExecution,
  summarizeItemExecution,
  comprasGovConsumido,
  compareWithComprasGov
} from '../itemExecutionSummary';
import { mapDistribuicao } from '../../services/distribuicaoEmpenhoService';
import { montarEmpenhoDoItem } from '../empenhoDoItem';

const nota = (o: any) =>
  mapDistribuicao({ contrato_empenho_id: o.ne, contract_key: o.ck ?? 'A', empenho_id: o.ne, numero_oficial: o.ne, valor_nota: 0, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...o });
// Item 1: R$ 100 no contrato A; R$ 10 no contrato B (sem itens na fonte).
const empenho = montarEmpenhoDoItem({
  numeroItem: 1,
  contratos: [
    {
      contractKey: 'A',
      valorUnitario: 100,
      distribuicoes: [
        nota({ ne: 'N1', valor_nota: 2900, situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 1, valor: 2900 }] }),
        nota({ ne: 'N2', valor_nota: 500, sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 1, quantidade: 5 }, { numero_item: 2, quantidade: 5 }] })
      ]
    },
    { contractKey: 'B', valorUnitario: 10, distribuicoes: [nota({ ne: 'N3', ck: 'B', valor_nota: 7500, situacao: 'SEM_ITENS' })] }
  ]
});

describe('summarizeContractExecution', () => {
  it('empenhado do contrato = parcelas deste item; conta as notas a vincular', () => {
    expect(summarizeContractExecution(60, empenho.porContrato.get('A'))).toEqual({ contratado: 60, empenhado: 29, aVincular: 1, semItens: false, aEmpenhar: 31 });
  });

  it('contrato sem itens na fonte: nada empenhado, marcado como sem divisão por item', () => {
    expect(summarizeContractExecution(10, empenho.porContrato.get('B'))).toEqual({ contratado: 10, empenhado: 0, aVincular: 0, semItens: true, aEmpenhar: 10 });
  });

  it('sem quantidade contratada lida, a empenhar fica nulo; acima do contratado fica negativo', () => {
    expect(summarizeContractExecution(null, empenho.porContrato.get('A')).aEmpenhar).toBeNull();
    expect(summarizeContractExecution(20, empenho.porContrato.get('A')).aEmpenhar).toBe(-9);
  });
});

describe('summarizeItemExecution', () => {
  it('o consumo da ata é o contratado; o empenho é a soma das parcelas do item', () => {
    const r = summarizeItemExecution({ homologado: 4863, contratados: [60, 10, null], empenho });
    expect(r).toEqual({
      homologado: 4863,
      contratado: 70,
      contratosSemQuantidade: 1,
      saldoAta: 4793,
      empenhado: 29,
      aEmpenhar: 41,
      notasAVincular: 1,
      contratosSemItens: 1,
      valorSemDivisao: 7500
    });
  });
});

describe('referência do Compras.gov', () => {
  it('consumo = registrada menos saldo para empenho, por unidade', () => {
    expect(comprasGovConsumido([
      { quantidadeRegistrada: 70, saldoRemanejamentoEmpenho: 70 },
      { quantidadeRegistrada: 801, saldoRemanejamentoEmpenho: 700 },
      { quantidadeRegistrada: 5, saldoRemanejamentoEmpenho: null }
    ])).toBe(101);
    expect(comprasGovConsumido([])).toBeUndefined();
    expect(comprasGovConsumido([{ quantidadeRegistrada: 1, saldoRemanejamentoEmpenho: undefined }])).toBeUndefined();
  });

  it('compara com o contratado sem alterar o saldo', () => {
    expect(compareWithComprasGov(undefined, 100)).toEqual({ status: 'SEM_DADO', delta: 0 });
    expect(compareWithComprasGov(100, 100)).toEqual({ status: 'CONSISTENTE', delta: 0 });
    expect(compareWithComprasGov(120, 100)).toEqual({ status: 'ACIMA', delta: 20 });
    expect(compareWithComprasGov(0, 690)).toEqual({ status: 'ABAIXO', delta: -690 });
  });
});

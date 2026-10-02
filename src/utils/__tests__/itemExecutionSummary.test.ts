import { describe, it, expect } from 'vitest';
import {
  summarizeContractExecution,
  summarizeItemExecution,
  comprasGovConsumido,
  compareWithComprasGov
} from '../itemExecutionSummary';
import type { ItemEmpenhoVinculo } from '../../types/itemEmpenhoVinculo';

const v = (over: Partial<ItemEmpenhoVinculo>): ItemEmpenhoVinculo => ({
  id: 'x', itemKey: '00059/2025-200331-00001', empenhoId: 'e', quantidade: null, fonte: null,
  quantidadeSugerida: null, contractKey: '200331-00126-2026',
  empenho: { canonicalKey: 'k', numero: '2026NE000039', ano: 2026, uasg: '200330', valorEmpenhado: 0 },
  ...over
});

describe('summarizeContractExecution', () => {
  const vinculos = [
    v({ quantidade: 8, fonte: 'API' }),
    v({ quantidade: 21, fonte: 'USUARIO' }),
    v({ quantidade: null, quantidadeSugerida: 7 }),
    v({ quantidade: null, quantidadeSugerida: 4 }),
    v({ contractKey: '200331-00160-2026', quantidade: 400, fonte: 'API' })
  ];

  it('soma só os empenhos do contrato e separa os pendentes', () => {
    expect(summarizeContractExecution('200331-00126-2026', 60, vinculos)).toEqual({
      contratado: 60, empenhado: 29, pendentes: 2, pendentesSugerido: 11, aEmpenhar: 31
    });
  });

  it('ignora maiúsculas na chave do contrato', () => {
    expect(summarizeContractExecution('200331-00160-2026'.toLowerCase(), 400, vinculos).empenhado).toBe(400);
  });

  it('sem quantidade contratada lida, a empenhar fica nulo', () => {
    expect(summarizeContractExecution('200331-00126-2026', null, vinculos).aEmpenhar).toBeNull();
  });

  it('empenhado acima do contratado dá a empenhar negativo', () => {
    expect(summarizeContractExecution('200331-00160-2026', 300, vinculos).aEmpenhar).toBe(-100);
  });
});

describe('summarizeItemExecution', () => {
  it('o consumo da ata é o contratado; o empenho é a execução', () => {
    const r = summarizeItemExecution({
      homologado: 4863,
      contratados: [400, 2, 60, 228],
      vinculos: [v({ quantidade: 34, fonte: 'API' }), v({ quantidade: null, quantidadeSugerida: 26 })]
    });
    expect(r).toMatchObject({
      homologado: 4863, contratado: 690, saldoAta: 4173, contratosSemQuantidade: 0,
      empenhado: 34, pendentes: 1, pendentesSugerido: 26, aEmpenhar: 656
    });
  });

  it('conta os vínculos sem quantidade lida e não os soma', () => {
    const r = summarizeItemExecution({ homologado: 100, contratados: [40, null, undefined], vinculos: [] });
    expect(r.contratado).toBe(40);
    expect(r.contratosSemQuantidade).toBe(2);
    expect(r.saldoAta).toBe(60);
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

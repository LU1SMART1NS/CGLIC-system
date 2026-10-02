import { describe, it, expect } from 'vitest';
import { prepareContractEmpenhosList } from '../../../hooks/useContractFinancialSummary';
import { aggregateContractFinancialExecution } from '../../../services/financialExecutionService';
import type { ContractDashboardRecord } from '../../../types';

const mockContract: Partial<ContractDashboardRecord> = {
  id: '200331-00015-2026',
  uasg: '200331',
  numero: '00015',
  ano: '2026',
  fornecedorNome: 'EMPRESA ALFA LTDA'
};

describe('ContractFinancialExecutionSection — Testes de Domínio e Integração', () => {
  it('deve retornar lista vazia quando não houver empenhos em nenhuma das fontes', () => {
    const list = prepareContractEmpenhosList(mockContract, [], []);
    expect(list).toHaveLength(0);

    const summary = aggregateContractFinancialExecution('200331-00015-2026', list);
    expect(summary.totalEmpenhosVinculados).toBe(0);
    expect(summary.totalValorEmpenhadoGlobal).toBe(0);
    expect(summary.totalValorLiquidadoGlobal).toBe(0);
    expect(summary.totalValorPagoGlobal).toBe(0);
    expect(summary.saldoNaoExecutadoGlobal).toBe(0);
  });

  it('deve normalizar empenhos vindos de useContractDetails e useManagementDashboard', () => {
    const detailsEmpenhos = [
      {
        canonical_key: '200331-2026-2026NE000100',
        numero_oficial: '2026NE000100',
        credor_nome: 'EMPRESA ALFA LTDA',
        data_emissao: '2026-02-15',
        valor_empenhado: 100000,
        valor_liquidado: 60000,
        valor_pago: 40000,
        situacao: 'EMITIDO'
      }
    ];

    const dashboardEmpenhos = [
      {
        canonical_key: '200331-2026-2026NE000101',
        numero_oficial: '2026NE000101',
        credor_nome: 'EMPRESA BETA LTDA',
        data_emissao: '2026-03-10',
        valor_empenhado: 50000,
        valor_liquidado: 20000,
        valor_pago: 20000,
        situacao: 'EMITIDO'
      }
    ];

    const list = prepareContractEmpenhosList(mockContract, detailsEmpenhos, dashboardEmpenhos);
    expect(list).toHaveLength(2);

    const summary = aggregateContractFinancialExecution('200331-00015-2026', list);
    // Empenhado: 100.000 + 50.000 = 150.000
    // Liquidado: 60.000 + 20.000 = 80.000
    // Pago: 40.000 + 20.000 = 60.000
    // Saldo Não Executado: 150.000 - 60.000 = 90.000
    // Saldo a Liquidar: 150.000 - 80.000 = 70.000
    // Saldo a Pagar: 80.000 - 60.000 = 20.000
    expect(summary.totalEmpenhosVinculados).toBe(2);
    expect(summary.totalValorEmpenhadoGlobal).toBe(150000);
    expect(summary.totalValorLiquidadoGlobal).toBe(80000);
    expect(summary.totalValorPagoGlobal).toBe(60000);
    expect(summary.saldoNaoExecutadoGlobal).toBe(90000);
    expect(summary.saldoALiquidarGlobal).toBe(70000);
    expect(summary.saldoAPagarGlobal).toBe(20000);
  });

  it('deve impedir double counting quando o mesmo empenho estiver presente em ambas as fontes', () => {
    const detailsEmpenhos = [
      {
        canonical_key: '200331-2026-2026NE000100',
        numero_oficial: '2026NE000100',
        credor_nome: 'EMPRESA ALFA LTDA',
        data_emissao: '2026-02-15',
        valor_empenhado: 100000,
        valor_liquidado: 60000,
        valor_pago: 40000,
        situacao: 'EMITIDO'
      }
    ];

    const dashboardEmpenhos = [
      {
        canonical_key: '200331-2026-2026NE000100',
        numero_oficial: '2026NE000100',
        credor_nome: 'EMPRESA ALFA LTDA',
        data_emissao: '2026-02-15',
        valor_empenhado: 100000,
        valor_liquidado: 60000,
        valor_pago: 40000,
        situacao: 'EMITIDO'
      }
    ];

    const list = prepareContractEmpenhosList(mockContract, detailsEmpenhos, dashboardEmpenhos);
    expect(list).toHaveLength(1);

    const summary = aggregateContractFinancialExecution('200331-00015-2026', list);
    expect(summary.totalEmpenhosVinculados).toBe(1);
    expect(summary.totalValorEmpenhadoGlobal).toBe(100000);
    expect(summary.totalValorLiquidadoGlobal).toBe(60000);
    expect(summary.totalValorPagoGlobal).toBe(40000);
    expect(summary.saldoNaoExecutadoGlobal).toBe(60000);
  });

  it('converte o registro cru do Contratos.gov (valores em texto) em números', () => {
    const cru = [{ id: 1, numero: '2026NE000262', data_emissao: '2026-06-26', empenhado: '2.788,00', liquidado: '0,00', pago: '1.000,50', rpinscrito: '0,00', credor: '27.975.551/0003-99 - VANGUARDA' }];
    const list = prepareContractEmpenhosList({ ...mockContract, uasg: '200330' }, cru, []);
    expect(list).toHaveLength(1);
    expect(list[0].valor_empenhado).toBe(2788);
    expect(list[0].valor_pago).toBe(1000.5);
    expect(list[0].canonical_key).toBe('200330-2026-2026NE262');
  });
});

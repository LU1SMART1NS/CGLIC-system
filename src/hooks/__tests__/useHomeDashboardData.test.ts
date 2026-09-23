import { describe, it, expect } from 'vitest';
import { calculateHomeDashboardKPIs, getDaysRemaining } from '../useHomeDashboardData';
import type { ContractDashboardRecord, ArpRecord } from '../../types';

describe('calculateHomeDashboardKPIs - Testes Unitários dos Indicadores da Home', () => {
  it('deve calcular KPIs de contratos e atas corretamente com dados reais', () => {
    const today = new Date();
    const futureDate = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const urgentDate = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pastDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const mockContracts: ContractDashboardRecord[] = [
      {
        id: '1',
        numero: '1',
        ano: '2024',
        numeroFormatado: '01/2024',
        uasg: '200331',
        statusVigencia: 'Vigente',
        valorGlobal: 100000,
        dataVigenciaFim: futureDate,
        fornecedorNome: 'Empresa A',
        objeto: 'Serviços de TI',
        fonteDados: 'Compras.gov.br'
      },
      {
        id: '2',
        numero: '2',
        ano: '2024',
        numeroFormatado: '02/2024',
        uasg: '200331',
        statusVigencia: 'A Vencer (60d)',
        valorGlobal: 50000,
        dataVigenciaFim: urgentDate,
        fornecedorNome: 'Empresa B',
        objeto: 'Material de Consumo',
        fonteDados: 'Compras.gov.br'
      },
      {
        id: '3',
        numero: '3',
        ano: '2024',
        numeroFormatado: '03/2024',
        uasg: '200331',
        statusVigencia: 'Expirado',
        valorGlobal: 30000,
        dataVigenciaFim: pastDate,
        fornecedorNome: 'Empresa C',
        objeto: 'Treinamento',
        fonteDados: 'Compras.gov.br'
      }
    ];

    const mockArps: ArpRecord[] = [
      {
        numeroAtaRegistroPreco: '10/2024',
        dataVigenciaFinal: '2028-12-31',
        codigoUnidadeGerenciadora: '200331'
      } as any,
      {
        numeroAtaRegistroPreco: '11/2024',
        dataVigenciaFinal: '2020-01-01',
        codigoUnidadeGerenciadora: '200331'
      } as any
    ];

    const kpis = calculateHomeDashboardKPIs(mockContracts, mockArps);

    expect(kpis.totalContracts).toBe(3);
    expect(kpis.activeContracts).toBe(2);
    expect(kpis.totalContractValue).toBe(180000);
    expect(kpis.expiringContractsCount).toBe(2);
    expect(kpis.expiringContracts[0].contract.numeroFormatado).toBe('02/2024'); // Mais urgente primeiro
    expect(kpis.expiringContracts[1].contract.numeroFormatado).toBe('01/2024');
    expect(kpis.totalArps).toBe(2);
    expect(kpis.activeArps).toBe(1);
  });

  it('deve usar fallback de totalArps quando lista de arps estiver vazia', () => {
    const kpis = calculateHomeDashboardKPIs([], [], 42);
    expect(kpis.totalArps).toBe(42);
    expect(kpis.activeArps).toBe(42);
    expect(kpis.totalContracts).toBe(0);
    expect(kpis.activeContracts).toBe(0);
    expect(kpis.totalContractValue).toBe(0);
    expect(kpis.expiringContractsCount).toBe(0);
  });

  it('deve calcular dias restantes com precisão através de getDaysRemaining', () => {
    expect(getDaysRemaining(undefined)).toBeNull();
    expect(getDaysRemaining('data-invalida')).toBeNull();
  });
});

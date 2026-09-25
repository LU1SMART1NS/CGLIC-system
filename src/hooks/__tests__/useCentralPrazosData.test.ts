import { describe, it, expect } from 'vitest';
import { DEFAULT_CENTRAL_PRAZOS_FILTERS } from '../useCentralPrazosData';
import {
  buildCentralPrazosItems,
  calculateCentralPrazosKPIs,
  filterCentralPrazosItems
} from '../../services/centralPrazosService';
import type { ContractDashboardRecord, ArpRecord, ContractManager, ContractTaskPlan } from '../../types';

describe('useCentralPrazosData logic - Testes Unitários de Agregação e Filtro', () => {
  const mockContracts: ContractDashboardRecord[] = [
    {
      id: '200331-00010-2025',
      numero: '10',
      ano: '2025',
      numeroFormatado: '10/2025',
      uasg: '200331',
      statusVigencia: 'Vigente',
      valorGlobal: 100000,
      dataVigenciaFim: '2026-08-30',
      fornecedorNome: 'Empresa Alfa Ltda',
      objeto: 'Serviços de Tecnologia e Nuvem',
      processo: '08000.123456/2025-01',
      fonteDados: 'Compras.gov.br'
    }
  ];

  const mockArps: ArpRecord[] = [
    {
      numeroAtaRegistroPreco: '50/2025',
      dataVigenciaFinal: '2026-06-15',
      codigoUnidadeGerenciadora: '200331',
      objeto: 'Aquisição de Viaturas Policiais',
      fornecedorNome: 'Montadora Nacional'
    } as any
  ];

  const mockManagers: Record<string, ContractManager> = {
    '200331-00010-2025': {
      contractKey: '200331-00010-2025',
      uasg: '200331',
      numero: '10',
      ano: 2025,
      gestorNome: 'Dr. Roberto Silveira',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  };

  const mockPlans: Record<string, ContractTaskPlan> = {
    '200331-00010-2025': {
      id: 'p1',
      contractKey: '200331-00010-2025',
      uasg: '200331',
      numero: '10',
      ano: 2025,
      templateNome: 'Template Serviços Contínuos',
      appliedAt: '2026-01-01T00:00:00Z',
      macrotarefas: [
        {
          id: 'm1',
          planId: 'p1',
          nome: 'Fase de Fiscalização Inicial',
          ordem: 1,
          tarefas: [
            {
              id: 't1',
              macrotaskId: 'm1',
              nome: 'Designar comissão de fiscalização',
              ordem: 1,
              status: 'PENDENTE',
              prazo: '2026-04-10',
              responsavelNome: 'Dr. Roberto Silveira',
              criadoEm: '2026-01-01T00:00:00Z',
              atualizadoEm: '2026-01-01T00:00:00Z'
            }
          ]
        }
      ],
      progresso: {
        total: 1,
        concluidas: 0,
        pendentes: 1,
        emAndamento: 0,
        naoAplicaveis: 0,
        atrasadas: 0,
        percentual: 0
      }
    }
  };

  it('deve agregar contratos, ARPs, gestores e tarefas mantendo idempotência e proveniência', () => {
    const rawItems = buildCentralPrazosItems({
      contracts: mockContracts,
      arps: mockArps,
      managers: mockManagers,
      plans: mockPlans,
      currentDate: new Date('2026-04-01T00:00:00')
    });

    // 1 tarefa humana + 2 gatilhos de contrato (180d, 60d) + 2 gatilhos de ARP (180d de prorrogação e 90d de exaustão) = 5
    expect(rawItems.length).toBe(5);

    const kpis = calculateCentralPrazosKPIs(rawItems);
    expect(kpis.total).toBe(5);

    // Testar filtro por busca textual
    const filteredSearch = filterCentralPrazosItems(rawItems, {
      ...DEFAULT_CENTRAL_PRAZOS_FILTERS,
      busca: 'Viaturas'
    });
    expect(filteredSearch.length).toBe(2);
    expect(filteredSearch.every(i => i.entidadeOrigem === 'ARP')).toBe(true);

    // Testar filtro por entidadeTipo
    const filteredArps = filterCentralPrazosItems(rawItems, {
      ...DEFAULT_CENTRAL_PRAZOS_FILTERS,
      entidadeTipo: 'ARP'
    });
    expect(filteredArps.length).toBe(2);
    expect(filteredArps.every(i => i.entidadeOrigem === 'ARP')).toBe(true);
  });
});

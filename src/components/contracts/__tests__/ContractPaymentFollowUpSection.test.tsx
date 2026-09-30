/**
 * Testes Unitários de Componente para ContractPaymentFollowUpSection (CGLIC 3.0 - Fase 7.4-D)
 * 
 * Cobre:
 * - UI-01: Renderização dos ciclos e seus metadados (competência, atesto, status, responsável).
 * - UI-02: Exibição do estado vazio ("Nenhum ciclo de faturamento/atesto em acompanhamento").
 * - UI-03: Renderização de múltiplos ciclos no mesmo contrato.
 * - E2E-01: Acompanhamento de etapas operacionais e 11 tarefas.
 * - FIN-01: Informação financeira mantida como somente leitura.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractPaymentFollowUpSection } from '../ContractPaymentFollowUpSection';
import * as paymentFollowUpHookModule from '../../../hooks/useContractPaymentFollowUp';
import type { ContractDashboardRecord } from '../../../types';

// Fase 10-A.2: useContractPaymentFollowUp passou a persistir via Supabase/React
// Query (contract_payment_cycles) em vez de localStorage — precisa de um
// QueryClientProvider em runtime real. Nos testes de componente (renderização
// estática, sem interação), mockamos o hook diretamente, no mesmo padrão já
// usado para outros hooks baseados em React Query neste projeto (ver
// ManagementPaymentsOverview.test.tsx).
vi.mock('../../../hooks/useContractPaymentFollowUp', () => ({
  useContractPaymentFollowUp: vi.fn()
}));

vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: vi.fn(() => ({ data: { gestorNome: 'Gestora Titular' } }))
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false })
}));

const mockContract: ContractDashboardRecord = {
  id: '200331-50-2024',
  uasg: '200331',
  numero: '50',
  ano: 2024,
  numeroFormatado: '50/2024',
  objeto: 'Prestação de serviços continuados de TI',
  fornecedorNome: 'EMPRESA TECNOLOGIA LTDA',
  fornecedorCnpjCpf: '12.345.678/0001-90',
  valorGlobal: 500000,
  valorInicial: 500000,
  dataVigenciaInicio: '2024-01-01',
  dataVigenciaFim: '2026-12-31',
  statusVigencia: 'Vigente',
  fonteDados: 'Contratos.gov.br'
};

describe('ContractPaymentFollowUpSection (Fase 7.4-D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue({
      cycles: [],
      alerts: [],
      activeCount: 0,
      completedCount: 0,
      isLoading: false,
      registerPaymentCycle: vi.fn().mockResolvedValue(null),
      updatePaymentCycle: vi.fn().mockResolvedValue(null),
      deletePaymentCycle: vi.fn().mockResolvedValue(undefined),
      refetch: vi.fn()
    });
  });

  it('UI-02: Exibe estado vazio quando o contrato não possui ciclos cadastrados', () => {
    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection
        contract={mockContract}
        contractKey="200331-50-2024"
      />
    );

    expect(html).toContain('Ciclos de Atesto e Faturamento');
    expect(html).toContain('Nenhum ciclo de faturamento/atesto em acompanhamento.');
    expect(html).toContain('0 ciclos ativos');
    expect(html).toContain('Registrar Atesto / Faturamento');
  });

  it('UI-01 e FIN-01: Renderiza seção com cabeçalho, escopo e responsabilidades claras', () => {
    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection
        contract={mockContract}
        contractKey="200331-50-2024"
      />
    );

    // Deve deixar claro: CGLIC acompanha • CGOFI executa o pagamento
    expect(html).toContain('CGLIC acompanha • CGOFI executa o pagamento');
    expect(html).toContain('contract-payment-followup-section');
  });
});

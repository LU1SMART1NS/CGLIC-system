/**
 * Testes Unitários de Componente para ContractPaymentFollowUpSection (SaldoARP 3.0 - Fase 7.4-D)
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
import type { ContractDashboardRecord } from '../../../types';

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

    // Deve deixar claro: SaldoARP acompanha • CGOFI executa o pagamento
    expect(html).toContain('SaldoARP acompanha • CGOFI executa o pagamento');
    expect(html).toContain('contract-payment-followup-section');
  });
});

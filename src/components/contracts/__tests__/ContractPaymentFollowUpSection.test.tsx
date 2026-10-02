/**
 * Testes Unitários de Componente para ContractPaymentFollowUpSection (CGLIC 3.0 - Fase 7.4-D)
 * 
 * Cobre:
 * - UI-01: Renderização dos ciclos e seus metadados (documentos, atesto, status, responsável).
 * - UI-02: Exibição do estado vazio ("Nenhum ciclo de faturamento/atesto em acompanhamento").
 * - UI-03: Renderização de múltiplos ciclos no mesmo contrato.
 * - E2E-01: Acompanhamento pelos quatro marcos (recebido, conferido, enviado, pago) e prazo da etapa, sem checklist.
 * - FIN-01: Informação financeira mantida como somente leitura.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ContractPaymentFollowUpSection,
  formatCurrencyInputBR,
  maskDateInputBR,
  parseDateInputBR
} from '../ContractPaymentFollowUpSection';
import * as paymentFollowUpHookModule from '../../../hooks/useContractPaymentFollowUp';
import * as authContextModule from '../../../context/AuthContext';
import type { ContractDashboardRecord } from '../../../types';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';

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

function hookResult(cycles: PaymentFollowUpCycle[] = []): ReturnType<typeof paymentFollowUpHookModule.useContractPaymentFollowUp> {
  return {
    cycles,
    alerts: [],
    activeCount: cycles.length,
    completedCount: 0,
    isLoading: false,
    registerPaymentCycle: vi.fn().mockResolvedValue(undefined),
    registerMarco: vi.fn().mockResolvedValue(undefined),
    addDocument: vi.fn().mockResolvedValue(undefined),
    removeDocument: vi.fn().mockResolvedValue(undefined),
    updateCycleInfo: vi.fn().mockResolvedValue(undefined),
    deleteCycle: vi.fn().mockResolvedValue(undefined),
    refetch: vi.fn()
  };
}

function mockRole(role: 'admin' | 'gestor' | 'leitor') {
  vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
    user: { id: 'u1', email: 'maria@exemplo.gov.br' } as any,
    session: null,
    loading: false,
    role,
    roleStatus: 'ready',
    signOut: vi.fn()
  });
}

const baseCycle: PaymentFollowUpCycle = {
  cycleKey: '200331-50-2024-PGTO-202609-12345678',
  contractKey: '200331-50-2024',
  competencia: '2026-09',
  status: 'RECEBIDO',
  input: {
    contractKey: '200331-50-2024',
    competencia: '2026-09',
    dataRecebimento: '2026-09-10',
    dataAssinaturaAtesto: '2026-09-10',
    dataVencimentoFatura: '2026-09-30',
    documentoAtestoSei: '12345678',
    prazoConferenciaAte: '2026-09-17',
    valorAtesto: 45000,
    responsavelNome: 'Daniel Espíndola'
  },
  prazos: {
    diasUteisAteVencimento: 14,
    janelaTotalDiasUteis: 14,
    diasSemRespostaCgofi: 0,
    margemEnvioDiasUteis: 0,
    isVencida: false,
    statusPrazo: 'NORMAL'
  },
  etapaAtual: { etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-09-17', diasUteisRestantes: 4, atrasado: false },
  documentos: [
    { id: 'd1', tipo: 'Termo de Atesto', sei: '12345678' },
    { id: 'd2', tipo: 'Nota Fiscal Eletrônica', numero: '1234', sei: '87654321' }
  ],
  eventos: [],
  alerts: [],
  criadoEm: '2026-09-10T09:00:00Z',
  atualizadoEm: '2026-09-10T09:00:00Z'
};

describe('ContractPaymentFollowUpSection (Fase 7.4-D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole('admin');
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult());
  });

  it('UI-02: Exibe estado vazio quando o contrato não possui ciclos cadastrados', () => {
    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection
        contract={mockContract}
        contractKey="200331-50-2024"
      />
    );

    expect(html).not.toContain('Ciclos de Atesto e Faturamento');
    expect(html).toContain('Nenhum ciclo de faturamento/atesto em acompanhamento.');
    // Sem ciclos, o selo de contagem some: a mensagem abaixo já diz isso
    expect(html).not.toContain('ciclos ativos');
    expect(html).not.toContain('payment-active-count');
    // Um único botão de registro (o do topo); o estado vazio só explica
    expect(html.split('Registrar Atesto / Faturamento').length - 1).toBe(1);
    expect(html).not.toContain('Registrar Primeiro Ciclo');
  });

  it('UI-01 e FIN-01: Renderiza a seção; o escopo (CGLIC acompanha, CGOFI executa) fica no subtítulo da página', () => {
    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection
        contract={mockContract}
        contractKey="200331-50-2024"
      />
    );

    // O título e o subtítulo são da InstrumentSection da página; aqui não se repetem
    expect(html).not.toContain('CGLIC acompanha • CGOFI executa o pagamento');
    expect(html).toContain('contract-payment-followup-section');
  });

  it('com ciclos, mostra o selo com a quantidade de ciclos ativos', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));
    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );
    expect(html).toContain('1 ciclo ativo');
  });

  it('mostra os documentos recebidos (tipo e número) no lugar da competência, com o Id. SEI do atesto', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    expect(html).toContain('Termo de Atesto · Nota Fiscal Eletrônica nº 1234');
    expect(html).toContain('Id. SEI:');
    expect(html).toContain('12345678');
    expect(html).toContain('Recebido em');
    expect(html).not.toContain('Competência');
  });

  it('o acompanhamento é só pelos marcos: não há checklist de tarefas dentro do ciclo', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    expect(html).not.toContain('Checklist do ciclo');
    expect(html).not.toContain('Adicionar tarefa');
    expect(html).not.toContain('payment-tasks-');
  });

  it('mostra os quatro marcos e o prazo da etapa em curso, com o dono (CGLIC) da conferência', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    for (const marco of ['Recebido', 'Conferido', 'Enviado à CGOFI', 'Pago']) {
      expect(html).toContain(marco);
    }
    expect(html).toContain('Em conferência');
    expect(html).toContain('Conferir a documentação até 17/09/2026');
    expect(html).toContain('faltam 4 dias úteis');
    expect(html).toContain('title="Registrar conferência"');
  });

  it('depois do envio, a CGOFI é a dona do prazo: a CGLIC só acompanha e cobra', () => {
    const enviado: PaymentFollowUpCycle = {
      ...baseCycle,
      status: 'ENVIADO_CGOFI',
      input: { ...baseCycle.input, dataConferencia: '2026-09-14', dataEnvioCgofi: '2026-09-15', documentoDespachoSei: '555', cobrarCgofiAte: '2026-09-22' },
      etapaAtual: { etapa: 'COBRANCA_CGOFI', dono: 'CGOFI', dataAlvo: '2026-09-22', diasUteisRestantes: 3, atrasado: false }
    };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([enviado]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    expect(html).toContain('Na CGOFI');
    expect(html).toContain('Acompanhando a CGOFI: cobrar a partir de 22/09/2026');
    expect(html).toContain('O prazo de pagamento é da CGOFI');
    expect(html).toContain('title="Registrar resultado da CGOFI"');
  });

  it('prazo da CGLIC vencido aparece como alerta; ciclo pago não oferece nova ação', () => {
    const atrasado: PaymentFollowUpCycle = {
      ...baseCycle,
      etapaAtual: { etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-09-17', diasUteisRestantes: -2, atrasado: true }
    };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([atrasado]));
    let html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );
    expect(html).toContain('prazo 17/09/2026 vencido há 2 dias úteis');

    const pago: PaymentFollowUpCycle = { ...baseCycle, status: 'PAGO', etapaAtual: undefined };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([pago]));
    html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );
    expect(html).toContain('Pago (OB emitida)');
    expect(html).not.toContain('title="Registrar conferência"');
    expect(html).not.toContain('title="Enviar à CGOFI"');
  });

  it('perfil sem permissão de edição só acompanha: não vê o registro nem as ações de marco', () => {
    mockRole('leitor');
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    expect(html).not.toContain('Registrar Atesto / Faturamento');
    expect(html).not.toContain('title="Registrar conferência"');
    expect(html).toContain('Termo de Atesto');
  });

  it('admin pode cancelar e excluir definitivamente; gestor só cancela; leitor não vê nenhum dos dois', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));
    const render = () =>
      renderToStaticMarkup(<ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />);

    mockRole('admin');
    let html = render();
    expect(html).toContain('title="Cancelar ciclo"');
    expect(html).toContain('title="Excluir ciclo definitivamente"');

    mockRole('gestor');
    html = render();
    expect(html).toContain('title="Cancelar ciclo"');
    expect(html).not.toContain('title="Excluir ciclo definitivamente"');

    mockRole('leitor');
    html = render();
    expect(html).not.toContain('title="Cancelar ciclo"');
    expect(html).not.toContain('title="Excluir ciclo definitivamente"');
  });

  it('ciclo já encerrado não oferece cancelar, mas o admin ainda pode excluí-lo', () => {
    const cancelado: PaymentFollowUpCycle = { ...baseCycle, status: 'CANCELADO', etapaAtual: undefined };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([cancelado]));

    const html = renderToStaticMarkup(
      <ContractPaymentFollowUpSection contract={mockContract} contractKey="200331-50-2024" />
    );

    expect(html).toContain('Cancelado');
    expect(html).not.toContain('title="Cancelar ciclo"');
    expect(html).toContain('title="Excluir ciclo definitivamente"');
  });

  describe('formatCurrencyInputBR (máscara de moeda BR)', () => {
    it('acumula dígitos como centavos, no padrão BR (milhar com ponto, decimal com vírgula)', () => {
      expect(formatCurrencyInputBR('1')).toBe('0,01');
      expect(formatCurrencyInputBR('150')).toBe('1,50');
      expect(formatCurrencyInputBR('150000')).toBe('1.500,00');
      expect(formatCurrencyInputBR('12321654')).toBe('123.216,54');
    });

    it('ignora caracteres não numéricos já presentes no valor mascarado', () => {
      expect(formatCurrencyInputBR('1.500,00')).toBe('1.500,00');
    });

    it('retorna string vazia quando não há dígitos', () => {
      expect(formatCurrencyInputBR('')).toBe('');
      expect(formatCurrencyInputBR('R$ ')).toBe('');
    });
  });

  describe('maskDateInputBR / parseDateInputBR (data digitada como texto, sem depender do seletor nativo)', () => {
    it('insere as barras conforme os dígitos são digitados', () => {
      expect(maskDateInputBR('0')).toBe('0');
      expect(maskDateInputBR('01')).toBe('01');
      expect(maskDateInputBR('0110')).toBe('01/10');
      expect(maskDateInputBR('01102026')).toBe('01/10/2026');
    });

    it('ignora dígitos além dos 8 esperados (dd mm aaaa)', () => {
      expect(maskDateInputBR('011020269999')).toBe('01/10/2026');
    });

    it('converte dd/mm/aaaa completa para yyyy-mm-dd', () => {
      expect(parseDateInputBR('01/10/2026')).toBe('2026-10-01');
      expect(parseDateInputBR('01102026')).toBe('2026-10-01');
    });

    it('retorna string vazia para datas incompletas', () => {
      expect(parseDateInputBR('01/10')).toBe('');
      expect(parseDateInputBR('')).toBe('');
    });
  });
});

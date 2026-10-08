/**
 * Aba Pagamentos do Contrato 360 (ContractPagamentosSection) e o painel do ciclo (PaymentCyclePanel):
 * - resumo único com faturas e ciclos, atestos sem fatura e faturas com o ciclo da CGLIC;
 * - ciclo pelos cinco marcos (recebido, conferido, enviado, liquidado e pago) e prazo da etapa;
 * - ações conforme o perfil.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractPagamentosSection } from '../ContractPagamentosSection';
import { PaymentCyclePanel } from '../payment/PaymentCyclePanel';
import { formatCurrencyInputBR, maskDateInputBR, parseDateInputBR } from '../payment/paymentFormUtils';
import { useFaturasDoContrato } from '../../../hooks/useFaturasDoContrato';
import { useSincronizacaoEmpenhosContrato } from '../../../hooks/useSincronizacaoEmpenhosContrato';
import * as paymentFollowUpHookModule from '../../../hooks/useContractPaymentFollowUp';
import * as authContextModule from '../../../context/AuthContext';
import type { ContractDashboardRecord } from '../../../types';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';

// Fase 10-A.2: useContractPaymentFollowUp passou a persistir via Supabase/React
// Query (contract_payment_cycles) em vez de localStorage — precisa de um
// QueryClientProvider em runtime real. Nos testes de componente (renderização
// estática, sem interação), mockamos o hook diretamente, no mesmo padrão já
// usado para outros hooks baseados em React Query neste projeto.
// Os formulários do ciclo leem empenhos e faturas pelo React Query: aqui sem dados.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, refetch: vi.fn() })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() }))
}));

vi.mock('../../../hooks/useContractPaymentFollowUp', () => ({
  useContractPaymentFollowUp: vi.fn()
}));

vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: vi.fn(() => ({ data: { gestorNome: 'Gestora Titular' } }))
}));

vi.mock('../../../hooks/useFaturasDoContrato', async (orig) => ({
  ...(await orig<typeof import('../../../hooks/useFaturasDoContrato')>()),
  useFaturasDoContrato: vi.fn()
}));
vi.mock('../../../hooks/useSincronizacaoEmpenhosContrato', () => ({ useSincronizacaoEmpenhosContrato: vi.fn() }));

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
    ligarFaturas: vi.fn().mockResolvedValue(undefined),
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

const fatura = (over: any = {}) => ({
  idFatura: 1, numero: '131503', referencia: '12/2019', emissao: '2019-12-30', valor: 663.38, glosa: 0,
  dataLiquidacao: '2025-10-10', situacao: 'Siafi Apropriado', cancelada: false, np: '2025NP000545',
  ordensBancarias: '2025OB088173', obEmissao: '2025-10-14', paga: true, npContratos: 1,
  empenhos: '2022NE000245', empenhosSemVinculo: 0, empenhosSemVinculoNumeros: null, ...over
});
const resumo = { faturas: 2, valorFaturado: 1663.38, valorLiquidado: 1663.38, valorPago: 663.38, liquidadasSemPagamento: 1, faturasComNeSemVinculo: 0, ultimaLiquidacao: '2025-10-10', ultimoPagamento: '2025-10-14' };
const faturas = (data: any, extra: any = {}) =>
  vi.mocked(useFaturasDoContrato).mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn(), ...extra } as any);
const empenhos = (sync: any, isLoading = false) =>
  vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: sync, isLoading } as any);
const consultados = { situacao: 'OK', ultimoSucessoEm: '2026-10-06T19:50:00Z', tentativaEm: '2026-10-06T19:50:00Z' };

const renderSection = (props: Partial<React.ComponentProps<typeof ContractPagamentosSection>> = {}) =>
  renderToStaticMarkup(<ContractPagamentosSection contract={mockContract} contractKey="200331-50-2024" {...props} />);

const renderPanel = (cycle: PaymentFollowUpCycle, opts: { canEdit?: boolean; isAdmin?: boolean } = {}) =>
  renderToStaticMarkup(
    <PaymentCyclePanel
      cycle={cycle}
      gestorNome="Gestora Titular"
      canEdit={opts.canEdit ?? true}
      isAdmin={opts.isAdmin ?? false}
      temBem={false}
      valorContrato={500000}
      onAcao={vi.fn()}
      onCancelar={vi.fn()}
      onExcluir={vi.fn()}
      addDocument={vi.fn()}
      removeDocument={vi.fn()}
    />
  );

describe('ContractPagamentosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole('admin');
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult());
    faturas({ faturas: [], resumo: null, sincronizadoEm: null });
    empenhos(consultados);
  });

  it('sem ciclo e sem fatura: estado vazio com um único botão de abrir ciclo', () => {
    const html = renderSection();
    expect(html).toContain('payment-empty-state');
    expect(html).toContain('Nenhum atesto em acompanhamento');
    expect(html).toContain('ainda não foram consultadas');
    expect(html.split('Abrir ciclo de pagamento').length - 1).toBe(1);
  });

  it('faturas consultadas e nenhuma fatura: diz que a fonte não tem', () => {
    faturas({ faturas: [], resumo: null, sincronizadoEm: '2026-10-06T20:22:00Z' });
    expect(renderSection()).toContain('nenhuma fatura no Contratos.gov.br');
  });

  it('resumo único com faturas e ciclos ativos; atesto sem fatura aparece em "Em atesto na CGLIC"', () => {
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));
    faturas({ faturas: [fatura()], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = renderSection();
    expect(html).toContain('contract-pagamentos-resumo');
    expect(html).toContain('Ciclos ativos');
    expect(html).toContain('Em atesto na CGLIC');
    expect(html).toContain('payment-atesto-table-row-200331-50-2024-PGTO-202609-12345678');
    // Próximo passo direto na linha.
    expect(html).toContain('Conferir');
    expect(html).toContain('faltam 4 d.u.');
    // A fatura sem ciclo ligado diz isso na coluna.
    expect(html).toContain('Sem ciclo');
  });

  it('a fatura mostra o ciclo da CGLIC ligado a ela, e não o repete em "Em atesto"', () => {
    const ligado: PaymentFollowUpCycle = { ...baseCycle, status: 'ENVIADO_CGOFI', faturas: [{ idFatura: 1, vinculadoPor: 'SISTEMA' }] };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([ligado]));
    faturas({ faturas: [fatura()], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = renderSection();
    expect(html).toContain('Na CGOFI');
    expect(html).not.toContain('payment-atesto-table-row-');
    expect(html).toContain('Nenhum atesto aguardando a CGLIC.');
  });

  it('fatura aberta pelo endereço mostra o painel do ciclo dela', () => {
    const ligado: PaymentFollowUpCycle = { ...baseCycle, status: 'ENVIADO_CGOFI', faturas: [{ idFatura: 1, vinculadoPor: 'SISTEMA' }] };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([ligado]));
    faturas({ faturas: [fatura()], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    // Sem efeitos no render estático: a linha só abre depois de montada; aqui conferimos a linha e o botão de abrir.
    const html = renderSection({ abrirFatura: '1' });
    expect(html).toContain('contract-faturas-table-row-1');
    expect(html).toContain('contract-faturas-table-expand-1');
  });

  it('mostra etapa, NP e OB; fatura liquidada sem OB aparece aguardando', () => {
    faturas({ faturas: [fatura(), fatura({ idFatura: 2, numero: '131600', valor: 1000, paga: false, ordensBancarias: null, obEmissao: null, np: '2025NP000600' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = renderSection();
    expect(html).toContain('Liquidadas aguardando OB');
    expect(html).toContain('Paga');
    expect(html).toContain('Liquidada');
    expect(html).toContain('2025OB088173');
    expect(html).toContain('NP 2025NP000600');
    expect(html).toContain('aguardando');
    expect(html).toContain('não o valor da OB');
  });

  it('NP que paga outros contratos e NE citada sem vínculo são avisadas', () => {
    faturas({ faturas: [fatura({ npContratos: 3, empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2023NE000280', empenhos: '2023NE000280' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = renderSection();
    expect(html).toContain('paga também outros 2 contrato(s)');
    expect(html).toContain('contract-faturas-ne-sem-vinculo');
    expect(html).toContain('2023NE000280');
    expect(html).toContain('fora do contrato');
    expect(html).toContain('1 fatura(s) deste contrato estão nesse caso');
  });

  const comNeSemVinculo = () =>
    faturas({ faturas: [fatura({ empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2023NE000280' })], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });

  it('empenhos do contrato nunca consultados: não acusa NE sem vínculo, diz que a conferência espera a consulta', () => {
    comNeSemVinculo();
    empenhos(null);
    const html = renderSection();
    expect(html).not.toContain('contract-faturas-ne-sem-vinculo');
    expect(html).toContain('contract-faturas-empenhos-nao-consultados');
  });

  it('enquanto a situação dos empenhos carrega, não mostra nenhum dos dois avisos', () => {
    comNeSemVinculo();
    empenhos(undefined, true);
    const html = renderSection();
    expect(html).not.toContain('contract-faturas-ne-sem-vinculo');
    expect(html).not.toContain('contract-faturas-empenhos-nao-consultados');
  });

  it('a NE citada pela fatura leva à aba Empenhos', () => {
    faturas({ faturas: [fatura()], resumo, sincronizadoEm: '2026-10-06T20:22:00Z' });
    const html = renderSection({ onAbrirEmpenho: vi.fn() });
    expect(html).toContain('title="Abrir a nota na aba Empenhos"');
    expect(html).toContain('2022NE000245');
  });

  it('prazo da CGLIC vencido aparece no resumo', () => {
    const atrasado: PaymentFollowUpCycle = {
      ...baseCycle,
      etapaAtual: { etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-09-17', diasUteisRestantes: -2, atrasado: true }
    };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([atrasado]));
    const html = renderSection();
    expect(html).toContain('payment-prazo-cglic-vencido');
    expect(html).toContain('vencido há 2 d.u.');
  });

  it('ciclos encerrados sem fatura ficam escondidos atrás de um link', () => {
    const pago: PaymentFollowUpCycle = { ...baseCycle, status: 'PAGO', etapaAtual: undefined };
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([pago]));
    const html = renderSection();
    expect(html).toContain('Mostrar 1 ciclo encerrado sem fatura');
    expect(html).not.toContain('payment-atesto-table-row-');
  });

  it('perfil sem permissão de edição só acompanha: não vê o registro nem o próximo passo', () => {
    mockRole('leitor');
    vi.mocked(paymentFollowUpHookModule.useContractPaymentFollowUp).mockReturnValue(hookResult([baseCycle]));
    const html = renderSection();
    expect(html).not.toContain('Abrir ciclo de pagamento');
    expect(html).not.toContain('>Conferir<');
    expect(html).toContain('Termo de Atesto');
  });
});

describe('PaymentCyclePanel', () => {
  it('mostra os documentos recebidos e o Id. SEI do atesto', () => {
    const html = renderPanel(baseCycle);
    expect(html).toContain('Termo de Atesto · Nota Fiscal Eletrônica nº 1234');
    expect(html).toContain('Id. SEI:');
    expect(html).toContain('12345678');
    expect(html).toContain('chegou em');
    expect(html).not.toContain('Competência');
  });

  it('mostra os cinco marcos e o prazo da etapa em curso, com o dono (CGLIC) da conferência', () => {
    const html = renderPanel(baseCycle);
    for (const marco of ['Recebido', 'Conferido', 'Enviado à CGOFI', 'Liquidado', 'Pago']) {
      expect(html).toContain(marco);
    }
    expect(html).toContain('Em conferência');
    expect(html).toContain('Conferir a documentação até 17/09/2026');
    expect(html).toContain('faltam 4 dias úteis');
    expect(html).toContain('title="Conferir"');
  });

  it('depois do envio, a CGOFI é a dona do prazo: a CGLIC só acompanha e cobra', () => {
    const enviado: PaymentFollowUpCycle = {
      ...baseCycle,
      status: 'ENVIADO_CGOFI',
      input: { ...baseCycle.input, dataConferencia: '2026-09-14', dataEnvioCgofi: '2026-09-15', documentoDespachoSei: '555', cobrarCgofiAte: '2026-09-22' },
      etapaAtual: { etapa: 'COBRANCA_CGOFI', dono: 'CGOFI', dataAlvo: '2026-09-22', diasUteisRestantes: 3, atrasado: false }
    };
    const html = renderPanel(enviado);
    expect(html).toContain('Na CGOFI');
    expect(html).toContain('Acompanhando a CGOFI: cobrar a partir de 22/09/2026');
    expect(html).toContain('O prazo de pagamento é da CGOFI');
    expect(html).toContain('title="Registrar resultado da CGOFI"');
    expect(html).toContain('Nenhuma fatura ligada a este ciclo');
    expect(html).toContain('title="Escolher a fatura do ciclo"');
  });

  it('ciclo enviado com fatura ligada oferece trocar a fatura, sem o aviso', () => {
    const comFatura: PaymentFollowUpCycle = {
      ...baseCycle,
      status: 'ENVIADO_CGOFI',
      faturas: [{ idFatura: 605039, vinculadoPor: 'USUARIO' }],
      input: { ...baseCycle.input, dataConferencia: '2026-09-14', dataEnvioCgofi: '2026-09-15', documentoDespachoSei: '555' }
    };
    const html = renderPanel(comFatura);
    expect(html).toContain('title="Trocar a fatura do ciclo"');
    expect(html).not.toContain('Nenhuma fatura ligada a este ciclo');
  });

  it('prazo da CGLIC vencido aparece como alerta; ciclo pago não oferece nova ação', () => {
    const atrasado: PaymentFollowUpCycle = {
      ...baseCycle,
      etapaAtual: { etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-09-17', diasUteisRestantes: -2, atrasado: true }
    };
    expect(renderPanel(atrasado)).toContain('prazo 17/09/2026 vencido há 2 dias úteis');

    const html = renderPanel({ ...baseCycle, status: 'PAGO', etapaAtual: undefined });
    expect(html).toContain('Pago (OB emitida)');
    expect(html).not.toContain('title="Conferir"');
    expect(html).not.toContain('title="Enviar à CGOFI"');
  });

  it('o acompanhamento é só pelos marcos: não há checklist de tarefas aberto no ciclo', () => {
    const html = renderPanel(baseCycle);
    expect(html).not.toContain('Adicionar tarefa');
    expect(html).not.toContain('payment-tasks-');
  });

  it('admin pode cancelar e excluir definitivamente; gestor só cancela; leitor não vê nenhum dos dois', () => {
    let html = renderPanel(baseCycle, { canEdit: true, isAdmin: true });
    expect(html).toContain('title="Cancelar ciclo"');
    expect(html).toContain('title="Excluir ciclo definitivamente"');

    html = renderPanel(baseCycle, { canEdit: true, isAdmin: false });
    expect(html).toContain('title="Cancelar ciclo"');
    expect(html).not.toContain('title="Excluir ciclo definitivamente"');

    html = renderPanel(baseCycle, { canEdit: false, isAdmin: false });
    expect(html).not.toContain('title="Cancelar ciclo"');
    expect(html).not.toContain('title="Excluir ciclo definitivamente"');
    expect(html).not.toContain('title="Conferir"');
  });

  it('ciclo já encerrado não oferece cancelar, mas o admin ainda pode excluí-lo', () => {
    const html = renderPanel({ ...baseCycle, status: 'CANCELADO', etapaAtual: undefined }, { isAdmin: true });
    expect(html).toContain('Cancelado');
    expect(html).not.toContain('title="Cancelar ciclo"');
    expect(html).toContain('title="Excluir ciclo definitivamente"');
  });
});

describe('máscaras dos formulários do ciclo', () => {
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

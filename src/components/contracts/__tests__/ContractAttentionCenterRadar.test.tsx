import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractAttentionCenter } from '../ContractAttentionCenter';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../../types';
import type { ReajusteRadarAlert } from '../../../types/contractReajusteRadar';
import type { PaymentAlert } from '../../../types/paymentFollowUp';
import { addDays, formatDateISO } from '../../../services/temporalEngineService';

// Mocks de hooks
vi.mock('../../../hooks/useUpdateContractTask', () => ({
  useUpdateContractTask: () => ({
    mutate: vi.fn(),
    isPending: false
  })
}));

vi.mock('../../../hooks/useContractPaymentFollowUp', () => ({
  useContractPaymentFollowUp: () => ({
    alerts: [],
    isLoading: false
  })
}));

vi.mock('../../../hooks/useContractEvents', () => ({
  useContractEvents: () => ({
    data: [],
    isLoading: false
  })
}));

describe('ContractAttentionCenter — Radar Preditivo de Reajuste/Repactuação (Fase 7.5-C3)', () => {
  const mockContract: ContractDashboardRecord = {
    id: 'CONTRATO::200331::00010::2026',
    numero: '10/2026',
    ano: 2026,
    numeroFormatado: '10/2026',
    uasg: '200331',
    objeto: 'Serviços de TI',
    fornecedorNome: 'TECH CORP',
    fornecedorCnpjCpf: '11.222.333/0001-44',
    valorInicial: 100000.0,
    valorGlobal: 100000.0,
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'PNCP'
  };

  const mockRadarAlert: ReajusteRadarAlert = {
    id: 'ALERT::ANIVERSARIO_REAJUSTE::CONTRATO::200331::00010::2026::ANO_1',
    contractKey: 'CONTRATO::200331::00010::2026',
    uasg: '200331',
    numeroContrato: '10/2026',
    anoContrato: 2026,
    ciclo: 1,
    dataBase: '2026-01-15',
    origemDataBase: 'ASSINATURA',
    dataAniversario: '2027-01-15',
    diasRestantes: 20,
    nivel: 'URGENTE',
    titulo: 'Marco Anual de Reajuste / Repactuação (Ano 1)',
    descricao: 'O contrato completa 1 ano(s) da data-base em 15/01/2027 (faltam 20 dia(s)).',
    recomendacao: 'Recomenda-se verificar a publicação de índices oficiais ou homologação de nova CCT/DEMO.'
  };

  it('1. Renderiza o card de alerta de radar quando o alerta estiver ativo', () => {
    const html = renderToStaticMarkup(
      <ContractAttentionCenter
        contract={mockContract}
        plan={null}
        reajusteAlert={mockRadarAlert}
      />
    );

    expect(html).toContain('Radar de Reajuste / Repactuação');
    expect(html).toContain('Marco Anual de Reajuste / Repactuação (Ano 1)');
    expect(html).toContain('Urgente (20d)');
    expect(html).toContain('faltam 20 dia(s)');
    expect(html).toContain('Recomenda-se verificar');
    expect(html).toContain('Ver Histórico');
    // Fase 10-A.2.1: severidade canônica (URGENTE) via SeverityBadge/severityTokens.
    expect(html).toContain('data-testid="severity-badge-urgente"');
  });

  it('2. Não renderiza alerta de radar e exibe estado "Tudo em dia" quando não houver pendências', () => {
    const html = renderToStaticMarkup(
      <ContractAttentionCenter
        contract={mockContract}
        plan={null}
        reajusteAlert={null}
      />
    );

    expect(html).toContain('Tudo em dia com este contrato');
    expect(html).not.toContain('Radar de Reajuste / Repactuação');
  });

  it('3. Renderiza alerta com nível PROXIMA (60 a 31 dias)', () => {
    const proximaAlert: ReajusteRadarAlert = {
      ...mockRadarAlert,
      diasRestantes: 50,
      nivel: 'PROXIMA',
      descricao: 'O contrato completa 1 ano(s) da data-base em 15/01/2027 (faltam 50 dia(s)).'
    };

    const html = renderToStaticMarkup(
      <ContractAttentionCenter
        contract={mockContract}
        plan={null}
        reajusteAlert={proximaAlert}
      />
    );

    expect(html).toContain('Próximo (50d)');
    expect(html).toContain('faltam 50 dia(s)');
    // Fase 10-A.2.1: PROXIMA -> severidade canônica ATENCAO.
    expect(html).toContain('data-testid="severity-badge-atencao"');
  });

  it('4. Renderiza alerta com nível VENCIDA quando marco já tiver transcorrido', () => {
    const vencidaAlert: ReajusteRadarAlert = {
      ...mockRadarAlert,
      diasRestantes: -5,
      nivel: 'VENCIDA',
      descricao: 'O contrato completa 1 ano(s) da data-base em 15/01/2027 (atingido há 5 dia(s)).'
    };

    const html = renderToStaticMarkup(
      <ContractAttentionCenter
        contract={mockContract}
        plan={null}
        reajusteAlert={vencidaAlert}
      />
    );

    expect(html).toContain('Marco Transcorrido');
    expect(html).toContain('atingido há 5 dia(s)');
    // Fase 10-A.2.1: VENCIDA -> severidade canônica CRITICA.
    expect(html).toContain('data-testid="severity-badge-critica"');
  });

  describe('Fase 10-A.2.1 — Severidade Canônica dos Alertas de Pagamento', () => {
    it('5. Alerta de pagamento CRITICO usa SeverityBadge com severidade CRITICA e rótulo de domínio preservado', () => {
      const criticalAlert: PaymentAlert = {
        id: 'PGTO-ALERT-1',
        cycleKey: 'cycle-1',
        contractKey: mockContract.id,
        nivel: 'CRITICO',
        tipo: 'PAGAMENTO_FATURA_VENCIDA',
        mensagem: 'Fatura vencida há 3 dias'
      };

      const html = renderToStaticMarkup(
        <ContractAttentionCenter
          contract={mockContract}
          plan={null}
          paymentAlerts={[criticalAlert]}
          reajusteAlert={null}
        />
      );

      expect(html).toContain('data-testid="severity-badge-critica"');
      expect(html).toContain('Crítico / Vencido');
      expect(html).toContain('Fatura vencida há 3 dias');
    });

    it('6. Alerta de pagamento ATENCAO usa SeverityBadge com severidade ATENCAO', () => {
      const attentionAlert: PaymentAlert = {
        id: 'PGTO-ALERT-2',
        cycleKey: 'cycle-2',
        contractKey: mockContract.id,
        nivel: 'ATENCAO',
        tipo: 'CGOFI_SEM_RESPOSTA',
        mensagem: 'CGOFI sem resposta há 6 dias úteis'
      };

      const html = renderToStaticMarkup(
        <ContractAttentionCenter
          contract={mockContract}
          plan={null}
          paymentAlerts={[attentionAlert]}
          reajusteAlert={null}
        />
      );

      expect(html).toContain('data-testid="severity-badge-atencao"');
      expect(html).toContain('Atenção Operacional');
    });
  });

  describe('Fase 10-A.2.1 — Severidade Canônica das Tarefas do Plano de Gestão', () => {
    it('7. Tarefa VENCIDA usa SeverityBadge com severidade CRITICA e rótulo "Xd atrasada"', () => {
      const pastDate = formatDateISO(addDays(new Date(), -3));
      const plan: ContractTaskPlan = {
        id: 'plan-1',
        contractKey: mockContract.id,
        uasg: '200331',
        numero: '10',
        ano: 2026,
        templateNome: 'Template Teste',
        appliedAt: '2026-01-01T00:00:00Z',
        macrotarefas: [
          {
            id: 'macro-1',
            planId: 'plan-1',
            nome: 'Macrotarefa Teste',
            ordem: 1,
            tarefas: [
              {
                id: 'task-1',
                macrotaskId: 'macro-1',
                nome: 'Tarefa vencida de teste',
                ordem: 1,
                status: 'PENDENTE',
                prazo: pastDate,
                criadoEm: '2026-01-01T00:00:00Z',
                atualizadoEm: '2026-01-01T00:00:00Z'
              }
            ]
          }
        ],
        progresso: { total: 1, concluidas: 0, pendentes: 1, emAndamento: 0, naoAplicaveis: 0, atrasadas: 1, percentual: 0 }
      };

      const html = renderToStaticMarkup(
        <ContractAttentionCenter contract={mockContract} plan={plan} reajusteAlert={null} />
      );

      expect(html).toContain('data-testid="severity-badge-critica"');
      expect(html).toContain('3d atrasada');
      expect(html).toContain('Tarefa vencida de teste');
    });
  });
});

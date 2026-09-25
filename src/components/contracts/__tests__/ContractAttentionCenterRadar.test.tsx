import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractAttentionCenter } from '../ContractAttentionCenter';
import type { ContractDashboardRecord } from '../../../types';
import type { ReajusteRadarAlert } from '../../../types/contractReajusteRadar';

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
  });
});

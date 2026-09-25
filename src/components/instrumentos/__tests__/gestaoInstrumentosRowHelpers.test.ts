import { describe, it, expect } from 'vitest';
import { getInstrumentoInfo, getAcaoInfo, getLookupKey } from '../gestaoInstrumentosRowHelpers';
import type { DashboardAttentionItem } from '../../../types/managementDashboard';
import type { AttentionItemWithUasg } from '../gestaoInstrumentosRowHelpers';

describe('gestaoInstrumentosRowHelpers — classificação de tipo ARP × Contrato', () => {
  it('classifica como ARP um item de vigência de Ata mesmo quando numeroContrato traz o texto "ARP ..." (bug real observado na Gestão de Instrumentos)', () => {
    // Reproduz exatamente o shape gerado por dashboardService.calculateAttentionSummary
    // para a categoria PRORROGACAO_PROXIMA de uma ARP: contractKey fica undefined,
    // mas numeroContrato herda o identificadorFormatado ("ARP 00011/2026") do centralPrazosService.
    const item: DashboardAttentionItem = {
      id: 'ATT-PRORROG-ARP-1',
      category: 'PRORROGACAO_PROXIMA',
      severity: 'ATENCAO',
      title: 'Marco de Planejamento de Prorrogação',
      description: 'ARP 00011/2026 — Janela preventiva de análise (45 dias restantes)',
      arpKey: '00011/2026-200331',
      numeroContrato: 'ARP 00011/2026'
    };

    const info = getInstrumentoInfo(item);

    expect(info.tipo).toBe('ARP');
    expect(info.label).toBe('ARP 00011/2026');
  });

  it('classifica como ARP um item de saldo crítico (arpKey + numeroAta, sem numeroContrato)', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-ARP-ITEM-1',
      category: 'ATA_CRITICA',
      severity: 'URGENTE',
      title: 'Consumo Crítico em Ata (92.0%)',
      numeroAta: '12/2026',
      arpKey: '12/2026-200331-3'
    };

    const info = getInstrumentoInfo(item);

    expect(info.tipo).toBe('ARP');
    expect(info.label).toBe('Ata 12/2026');
  });

  it('classifica como Contrato um item genuíno de contrato (contractKey + numeroContrato, sem arpKey)', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-PRORROG-CTR-1',
      category: 'PRORROGACAO_PROXIMA',
      severity: 'ATENCAO',
      title: 'Marco de Planejamento de Prorrogação',
      contractKey: '200331-00098-2026',
      numeroContrato: 'Contrato 98/2026'
    };

    const info = getInstrumentoInfo(item);

    expect(info.tipo).toBe('Contrato');
    expect(info.label).toBe('Contrato 98/2026');
  });

  it('não confunde tarefa de contrato (sem arpKey) com ARP', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-TASK-1',
      category: 'TAREFA_ATRASADA',
      severity: 'CRITICA',
      title: 'Tarefa Contratual Vencida',
      contractKey: '200331-00098-2026',
      numeroContrato: '98/2026'
    };

    expect(getInstrumentoInfo(item).tipo).toBe('Contrato');
  });
});

describe('gestaoInstrumentosRowHelpers — ação contextual de Vigência Próxima', () => {
  it('direciona para /atas quando o instrumento é uma ARP (sem contrato vinculado)', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-PRORROG-ARP-1',
      category: 'PRORROGACAO_PROXIMA',
      severity: 'ATENCAO',
      title: 'Marco de Planejamento de Prorrogação',
      arpKey: '00011/2026-200331',
      numeroContrato: 'ARP 00011/2026'
    };

    expect(getAcaoInfo(item)).toEqual({ label: 'Prorrogar Vigência', targetUrl: '/atas' });
  });

  it('direciona para /contratos/:key quando o instrumento é um contrato', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-PRORROG-CTR-1',
      category: 'PRORROGACAO_PROXIMA',
      severity: 'ATENCAO',
      title: 'Marco de Planejamento de Prorrogação',
      contractKey: '200331-00098-2026',
      numeroContrato: 'Contrato 98/2026'
    };

    expect(getAcaoInfo(item)).toEqual({ label: 'Prorrogar Vigência', targetUrl: '/contratos/200331-00098-2026' });
  });
});

describe('gestaoInstrumentosRowHelpers — chave de correlação (getLookupKey)', () => {
  it('usa contractKey quando disponível', () => {
    const item = { id: '1', category: 'PAGAMENTO_CRITICO', severity: 'CRITICA', title: 't', contractKey: '200331-1-2026', uasg: '200331' } as AttentionItemWithUasg;
    expect(getLookupKey(item)).toBe('200331-1-2026');
  });

  it('usa `${uasg}-${numeroAta}` quando não há contractKey (evita colisão entre UASGs)', () => {
    const item = { id: '1', category: 'ATA_CRITICA', severity: 'CRITICA', title: 't', numeroAta: '12/2026', uasg: '200330' } as AttentionItemWithUasg;
    expect(getLookupKey(item)).toBe('200330-12/2026');
  });
});

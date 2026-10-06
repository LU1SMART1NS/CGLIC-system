import { describe, it, expect } from 'vitest';
import { getInstrumentoInfo, getAcaoInfo, getLookupKey } from '../gestaoInstrumentosRowHelpers';
import type { DashboardAttentionItem } from '../../../types/managementDashboard';
import type { AttentionItemWithUasg } from '../gestaoInstrumentosRowHelpers';

describe('gestaoInstrumentosRowHelpers — classificação de tipo ARP × Contrato', () => {
  it('classifica como ARP um item cujo numeroContrato traz o texto "ARP ..." (bug real observado na Gestão de Instrumentos)', () => {
    // getInstrumentoInfo classifica exclusivamente por arpKey/numeroAta/contractKey,
    // nunca por category — este item reproduz um shape de Ata em que numeroContrato
    // herda o identificadorFormatado ("ARP 00011/2026") do centralPrazosService.
    const item: DashboardAttentionItem = {
      id: 'ATT-ARP-1',
      category: 'ATA_CRITICA',
      severity: 'ATENCAO',
      title: 'Consumo em Atenção',
      description: 'ARP 00011/2026 — Consumo físico em atenção',
      arpKey: '00011/2026-200331',
      numeroContrato: 'ARP 00011/2026'
    };

    const info = getInstrumentoInfo(item);

    expect(info.tipo).toBe('ARP');
    expect(info.label).toBe('Ata 00011/2026');
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
      id: 'ATT-REAJUSTE-CTR-1',
      category: 'REAJUSTE_RADAR',
      severity: 'ATENCAO',
      title: 'Radar de Reajuste / Repactuação',
      contractKey: '200331-00098-2026',
      numeroContrato: 'Contrato 98/2026'
    };

    const info = getInstrumentoInfo(item);

    expect(info.tipo).toBe('Contrato');
    expect(info.label).toBe('98/2026');
  });

  it('unifica o rótulo de contrato (chave interna e prefixo) em número/ano', () => {
    const base = { id: 'x', category: 'PAGAMENTO_CRITICO', severity: 'ATENCAO', title: 't' } as const;
    expect(getInstrumentoInfo({ ...base, contractKey: '200330-00067-2021' }).label).toBe('00067/2021');
    expect(getInstrumentoInfo({ ...base, contractKey: 'k', numeroContrato: 'Contrato 00065/2021' }).label).toBe('00065/2021');
    expect(getInstrumentoInfo({ ...base, contractKey: 'k', numeroContrato: '00065/2021' }).label).toBe('00065/2021');
  });

  it('unifica o rótulo de ata, sem o sufixo de item', () => {
    const base = { id: 'x', category: 'ATA_CRITICA', severity: 'ATENCAO', title: 't', arpKey: 'a' } as const;
    expect(getInstrumentoInfo({ ...base, numeroContrato: 'Ata 00011/2026 — Item 3' }).label).toBe('Ata 00011/2026');
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

describe('gestaoInstrumentosRowHelpers — ação contextual de Atas com saldo crítico', () => {
  it('direciona para /atas quando o instrumento é uma ARP com saldo crítico', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-ARP-ITEM-1',
      category: 'ATA_CRITICA',
      severity: 'URGENTE',
      title: 'Consumo Crítico em Ata (92.0%)',
      arpKey: '00011/2026-200331',
      numeroAta: '00011/2026'
    };

    expect(getAcaoInfo(item)).toEqual({ label: 'Verificar Saldo', targetUrl: '/atas' });
  });

  it('direciona para /contratos/:key com o item destacado quando o instrumento é um radar de reajuste de contrato', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-REAJUSTE-CTR-1',
      category: 'REAJUSTE_RADAR',
      severity: 'ATENCAO',
      title: 'Radar de Reajuste / Repactuação',
      contractKey: '200331-00098-2026',
      numeroContrato: 'Contrato 98/2026'
    };

    expect(getAcaoInfo(item)).toEqual({
      label: 'Analisar Reajuste',
      targetUrl: '/contratos/200331-00098-2026?item=ATT-REAJUSTE-CTR-1'
    });
  });

  it('abre a tarefa no contrato com o id do item no link, para a fila do Contrato 360 destacá-la', () => {
    const item: DashboardAttentionItem = {
      id: 'ATT-TASK-OVERDUE-CONTRATO::X::TAREFA',
      category: 'TAREFA_ATRASADA',
      severity: 'CRITICA',
      title: 'Tarefa vencida',
      contractKey: '200331-00098-2026'
    };

    expect(getAcaoInfo(item)).toEqual({
      label: 'Abrir Tarefa',
      targetUrl: '/contratos/200331-00098-2026?item=ATT-TASK-OVERDUE-CONTRATO%3A%3AX%3A%3ATAREFA'
    });
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

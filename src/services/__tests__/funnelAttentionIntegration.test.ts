import { describe, it, expect } from 'vitest';
import {
  calculateAttentionSummary,
  calculateArpSummary,
  buildManagementDashboardReadModel
} from '../dashboardService';
import {
  buildCentralPrazosItems
} from '../centralPrazosService';
import type { ArpRecord } from '../../types';

describe('FASE 9-D1 — Integração do Funil Único de Atenção (SaldoARP)', () => {
  const referenceDate = new Date('2026-09-24T12:00:00Z');

  const mockArp = {
    numeroAtaRegistroPreco: '00049/2025',
    codigoUnidadeGerenciadora: '200331',
    objeto: 'Aquisição de equipamentos de TI',
    dataVigenciaInicial: '2025-01-01',
    dataVigenciaFinal: '2026-01-01'
  } as unknown as ArpRecord;

  it('1. item abaixo de 70% de consumo não deve gerar alerta no funil de atenção crítica', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Servidor Rack',
        quantidade_homologada: 100,
        quantidade_consumida: 60, // 60%
        saldo_disponivel: 40,
        percentual_consumido: 60
      }
    ];

    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    const arpSummary = calculateArpSummary([mockArp], items);

    expect(arpSummary.itensCriticosCount).toBe(0);
    expect(arpSummary.itensProximosLimiteCount).toBe(0);
    expect(attention.atasCriticasCount).toBe(0);
    expect(attention.items.filter(i => i.category === 'ATA_CRITICA')).toHaveLength(0);
  });

  it('2. item entre 70% e <85% deve ser classificado como próximo ao limite e não como crítico', () => {
    const items = [
      {
        item_key: '00049/2025-200331-2',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 2,
        descricao_item: 'Switch 24p',
        quantidade_homologada: 100,
        quantidade_consumida: 75, // 75%
        saldo_disponivel: 25,
        percentual_consumido: 75
      }
    ];

    const arpSummary = calculateArpSummary([mockArp], items);
    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    expect(arpSummary.itensCriticosCount).toBe(0);
    expect(arpSummary.itensProximosLimiteCount).toBe(1);
    expect(arpSummary.topItensConsumidos[0].isProximoLimite).toBe(true);
    expect(arpSummary.topItensConsumidos[0].isCritico).toBe(false);
    expect(attention.atasCriticasCount).toBe(0);
  });

  it('3. item exatamente 85% de consumo deve gerar alerta crítico no funil', () => {
    const items = [
      {
        item_key: '00049/2025-200331-3',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 3,
        descricao_item: 'No-Break 3kVA',
        quantidade_homologada: 100,
        quantidade_consumida: 85, // exatamente 85%
        saldo_disponivel: 15,
        percentual_consumido: 85
      }
    ];

    const arpSummary = calculateArpSummary([mockArp], items);
    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    expect(arpSummary.itensCriticosCount).toBe(1);
    expect(arpSummary.itensProximosLimiteCount).toBe(0);
    expect(arpSummary.topItensConsumidos[0].isCritico).toBe(true);

    expect(attention.atasCriticasCount).toBe(1);
    const ataAlerts = attention.items.filter(i => i.category === 'ATA_CRITICA');
    expect(ataAlerts).toHaveLength(1);
    expect(ataAlerts[0].severity).toBe('URGENTE');
    expect(ataAlerts[0].title).toContain('Consumo Crítico em Ata (85.0%)');
    expect(ataAlerts[0].description).toContain('Ata 00049/2025 — Item 3: No-Break 3kVA');
  });

  it('4. item acima de 85% (ex: 95% e 100%) deve gerar alerta crítico no funil', () => {
    const items = [
      {
        item_key: '00049/2025-200331-4',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 4,
        descricao_item: 'Cabo de Rede Cat6',
        quantidade_homologada: 1000,
        quantidade_consumida: 950, // 95%
        saldo_disponivel: 50,
        percentual_consumido: 95
      },
      {
        item_key: '00049/2025-200331-5',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 5,
        descricao_item: 'Conector RJ45',
        quantidade_homologada: 2000,
        quantidade_consumida: 2000, // 100%
        saldo_disponivel: 0,
        percentual_consumido: 100
      }
    ];

    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    expect(attention.atasCriticasCount).toBe(2);
    const ataAlerts = attention.items.filter(i => i.category === 'ATA_CRITICA');
    expect(ataAlerts).toHaveLength(2);

    const item100 = ataAlerts.find(a => a.id.endsWith('-5'));
    const item95 = ataAlerts.find(a => a.id.endsWith('-4'));

    expect(item100?.severity).toBe('CRITICA');
    expect(item95?.severity).toBe('URGENTE');
  });

  it('5. múltiplos itens críticos geram alertas discriminados sem conflito', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Item Alfa',
        quantidade_homologada: 100,
        quantidade_consumida: 90,
        saldo_disponivel: 10,
        percentual_consumido: 90
      },
      {
        item_key: '00050/2025-200331-2',
        numero_ata: '00050/2025',
        codigo_uasg: '200331',
        numero_item: 2,
        descricao_item: 'Item Beta',
        quantidade_homologada: 200,
        quantidade_consumida: 180,
        saldo_disponivel: 20,
        percentual_consumido: 90
      }
    ];

    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    expect(attention.atasCriticasCount).toBe(2);
    const ataAlerts = attention.items.filter(i => i.category === 'ATA_CRITICA');
    expect(ataAlerts).toHaveLength(2);
    expect(ataAlerts[0].id).not.toBe(ataAlerts[1].id);
  });

  it('6. ausência de itens de ARP mantém funil limpo e resiliente', () => {
    const attention = calculateAttentionSummary({
      arpItems: [],
      currentDate: referenceDate
    });

    expect(attention.atasCriticasCount).toBe(0);
    expect(attention.items.filter(i => i.category === 'ATA_CRITICA')).toHaveLength(0);
  });

  it('7. deduplicação determinística garante que o mesmo item nunca apareça duplicado', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Item Duplicado',
        quantidade_homologada: 100,
        quantidade_consumida: 90,
        saldo_disponivel: 10,
        percentual_consumido: 90
      },
      // Duplicado acidental no array de entrada
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Item Duplicado',
        quantidade_homologada: 100,
        quantidade_consumida: 90,
        saldo_disponivel: 10,
        percentual_consumido: 90
      }
    ];

    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    const ataAlerts = attention.items.filter(i => i.id === 'ATT-ARP-ITEM-00049/2025-200331-1');
    expect(ataAlerts).toHaveLength(1);
  });

  it('8. drill-down aponta corretamente para a Ata e identificadores canônicos', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Servidor Blade',
        quantidade_homologada: 10,
        quantidade_consumida: 9,
        saldo_disponivel: 1,
        percentual_consumido: 90,
        contract_key: '200331-00015-2026'
      }
    ];

    const attention = calculateAttentionSummary({
      arpItems: items,
      currentDate: referenceDate
    });

    const ataAlert = attention.items.find(i => i.id === 'ATT-ARP-ITEM-00049/2025-200331-1');
    expect(ataAlert).toBeDefined();
    expect(ataAlert?.numeroAta).toBe('00049/2025');
    expect(ataAlert?.arpKey).toBe('00049/2025-200331-1');
    expect(ataAlert?.contractKey).toBe('200331-00015-2026');
    expect(ataAlert?.targetUrl).toBe('/atas/00049/2025');
  });

  it('9. preservação do Dashboard Gerencial: read model consolida e preserva contratos, prazos e atas', () => {
    const readModel = buildManagementDashboardReadModel({
      uasg: '200331',
      contracts: [],
      arps: [mockArp],
      itemsSaldo: [
        {
          item_key: '00049/2025-200331-1',
          numero_ata: '00049/2025',
          codigo_uasg: '200331',
          numero_item: 1,
          descricao_item: 'Desktop i7',
          quantidade_homologada: 100,
          quantidade_consumida: 88,
          saldo_disponivel: 12,
          percentual_consumido: 88
        }
      ],
      currentDate: referenceDate
    });

    expect(readModel.arp.totalAtas).toBe(1);
    expect(readModel.arp.totalItens).toBe(1);
    expect(readModel.arp.itensCriticosCount).toBe(1);
    expect(readModel.arp.saldoFisicoTotal).toBe(12);
    expect(readModel.attention.atasCriticasCount).toBe(1);
    expect(readModel.attention.items.some(i => i.category === 'ATA_CRITICA')).toBe(true);
  });

  it('10. isolamento físico × financeiro: itens de ARP são estritamente quantitativos', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Licença de Software',
        quantidade_homologada: 500,
        quantidade_consumida: 450,
        saldo_disponivel: 50,
        percentual_consumido: 90
      }
    ];

    const arpSummary = calculateArpSummary([mockArp], items);
    expect(arpSummary.quantidadeHomologadaTotal).toBe(500);
    expect(arpSummary.quantidadeEmpenhadaTotal).toBe(450);
    expect(arpSummary.saldoFisicoTotal).toBe(50);
    expect((arpSummary as any).valorTotalFinanceiro).toBeUndefined();
    expect((arpSummary as any).saldoFinanceiro).toBeUndefined();
  });

  it('11. integração com centralPrazosService: buildCentralPrazosItems gera gatilhos operacionais para itens de saldo crítico', () => {
    const items = [
      {
        item_key: '00049/2025-200331-1',
        numero_ata: '00049/2025',
        codigo_uasg: '200331',
        numero_item: 1,
        descricao_item: 'Switch Core',
        quantidade_homologada: 10,
        quantidade_consumida: 9,
        saldo_disponivel: 1,
        percentual_consumido: 90,
        fornecedor_razao_social: 'Tech Solutions LTDA'
      }
    ];

    const prazosItems = buildCentralPrazosItems({
      arps: [mockArp],
      arpItems: items,
      currentDate: referenceDate
    });

    const arpCriticalItem = prazosItems.find(i => i.id.includes('SALDO_CRITICO'));
    expect(arpCriticalItem).toBeDefined();
    expect(arpCriticalItem?.tipoItem).toBe('GATILHO_OPERACIONAL');
    expect(arpCriticalItem?.entidadeOrigem).toBe('ARP');
    expect(arpCriticalItem?.nivelAtencao).toBe('CRITICO');
    expect(arpCriticalItem?.identificadorFormatado).toBe('Ata 00049/2025 — Item 1');
    expect(arpCriticalItem?.fornecedorNome).toBe('Tech Solutions LTDA');
    expect(arpCriticalItem?.explicabilidade.descricaoRegra).toContain('≥85% do saldo homologado');
  });
});

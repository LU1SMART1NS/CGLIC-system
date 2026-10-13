import { describe, it, expect } from 'vitest';
import { calculateAttentionSummary, motivosDosQuantitativos } from '../dashboardService';

// Linha de v_arp_item_saldo_detalhado do tablet 00059/2025 item 1 com a ata assinada informada (migration 109).
const linha = (over: Record<string, unknown> = {}) => ({
  item_key: '00059/2025-200331-00001', numero_ata: '00059/2025', numero_item: '00001', codigo_uasg: '200331',
  descricao_item: 'Tablet', quantidade_homologada: 4863, quantidade_base_senasp: 735, quantidade_consumida: 690,
  percentual_consumido: 93.88, ata_assinada_informada: true, total_assinada: 4863, total_registrado: 4863,
  orgaos_fora_da_ata: 0, orgaos_contratado_acima: 0, ...over
});

describe('motivosDosQuantitativos', () => {
  it('tudo certo: nenhum motivo', () => {
    expect(motivosDosQuantitativos(linha())).toEqual([]);
  });
  it('cada problema vira um motivo; cota negativa é crítica', () => {
    const m = motivosDosQuantitativos(linha({ quantidade_base_senasp: -15, orgaos_fora_da_ata: 1, total_assinada: 4800, total_registrado: 4900, orgaos_contratado_acima: 2 }));
    expect(m.map((x) => x.selo)).toEqual(['cota negativa', 'fora da ata', 'soma não fecha', 'soma não fecha', 'contratado acima']);
    expect(m[0].critico).toBe(true);
    expect(m.slice(1).every((x) => !x.critico)).toBe(true);
  });
});

describe('Visão Geral — quantitativos a conferir', () => {
  const avisos = (arpItems: any[]) =>
    calculateAttentionSummary({ arpItems, currentDate: new Date('2026-10-13T12:00:00') } as any).items.filter((i) => i.category === 'QUANTITATIVOS');

  it('item sem a ata assinada informada não gera aviso', () => {
    expect(avisos([linha({ ata_assinada_informada: false, orgaos_fora_da_ata: 3 })])).toEqual([]);
  });

  it('órgão fora da ata: atenção, com o destino no Item e chave de Resolvido que muda com o motivo', () => {
    const [a] = avisos([linha({ orgaos_fora_da_ata: 1 })]);
    expect(a).toMatchObject({
      id: 'ATT-QUANTITATIVOS-00059/2025-200331-00001',
      severity: 'ATENCAO',
      title: 'Quantitativos do item a conferir',
      badgeLabel: 'fora da ata',
      targetUrl: '/atas/detalhe/00059%2F2025-200331/itens/00001'
    });
    expect(a.description).toContain('1 órgão registrado sem quantidade na ata assinada');
    const [b] = avisos([linha({ orgaos_fora_da_ata: 2 })]);
    expect(b.avisoChave).not.toBe(a.avisoChave);
  });

  it('cota própria negativa: crítico', () => {
    const [a] = avisos([linha({ quantidade_base_senasp: -15 })]);
    expect(a).toMatchObject({ severity: 'CRITICA', title: 'Cota própria da SENASP negativa', badgeLabel: 'cota negativa' });
  });

  it('vários motivos juntos: um aviso só, com a contagem', () => {
    const lista = avisos([linha({ orgaos_fora_da_ata: 1, orgaos_contratado_acima: 1 })]);
    expect(lista).toHaveLength(1);
    expect(lista[0].badgeLabel).toBe('2 pontos a conferir');
  });
});

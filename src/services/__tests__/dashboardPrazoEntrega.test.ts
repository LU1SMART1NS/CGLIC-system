import { describe, expect, it } from 'vitest';
import { calculateAttentionSummary } from '../dashboardService';
import type { PrazoDaAta } from '../ataPrazoEntregaService';

const ata = { numeroAtaRegistroPreco: '00071/2025', codigoUnidadeGerenciadora: '200331', objeto: 'Munições', dataVigenciaFinal: '2027-06-30' } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const prazo = (extra: Partial<PrazoDaAta>): PrazoDaAta => ({
  ataKey: '00071/2025', numeroAta: '00071/2025', leitura: 'CLARO', leituraMotivo: null, sugeridoDias: 90, sugeridoContagem: 'CORRIDOS', contagemDita: false,
  sugeridoInicio: 'EXERCITO', trechos: [], documento: null, url: null, semPrazo: false, dias: null, contagem: null, inicio: null, porItem: {}, motivo: null,
  confirmadoPorNome: null, confirmadoEm: null, ...extra
});

describe('Início: prazo de entrega a confirmar (migrations 301 e 302)', () => {
  it('ata da carteira com prazo do TR a confirmar vira aviso que leva às Ações da ata', () => {
    const r = calculateAttentionSummary({ arps: [ata], prazosAta: [prazo({})], currentDate: new Date('2026-11-13T12:00:00Z') });
    const item = r.items.find((i) => i.category === 'PRAZO_ENTREGA');
    expect(item).toMatchObject({ severity: 'INFO', title: 'Confirmar o prazo de entrega lido do TR', badgeLabel: 'a confirmar', targetUrl: '/atas/detalhe/00071%2F2025-200331?aba=acoes' });
    expect(item?.description).toContain('90 dias corridos da autorização do Exército');
  });
  it('ata nova (sem leitura) pede para informar; confirmada não aparece', () => {
    const nova = calculateAttentionSummary({ arps: [ata], prazosAta: [prazo({ leitura: null, sugeridoDias: null, sugeridoInicio: null })] });
    expect(nova.items.find((i) => i.category === 'PRAZO_ENTREGA')).toMatchObject({ severity: 'ATENCAO', title: 'Informar o prazo de entrega', badgeLabel: 'a informar' });
    const feita = calculateAttentionSummary({ arps: [ata], prazosAta: [prazo({ confirmadoEm: '2026-11-13T12:00:00Z' })] });
    expect(feita.items.some((i) => i.category === 'PRAZO_ENTREGA')).toBe(false);
  });
});

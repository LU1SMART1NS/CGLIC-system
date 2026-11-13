import { describe, expect, it } from 'vitest';
import { itemDoPrazoDaAta } from '../prazoDaAtaPartes';
import type { PrazoDaAta } from '../../../services/ataPrazoEntregaService';

const base: PrazoDaAta = {
  ataKey: '00071/2025', numeroAta: '00071/2025', leitura: 'CLARO', leituraMotivo: null, sugeridoDias: 90, sugeridoContagem: 'CORRIDOS', contagemDita: false,
  sugeridoInicio: 'EXERCITO', trechos: ['O prazo de 90 dias...'], documento: 'Edital e anexos', url: null, semPrazo: false, dias: null, contagem: null, inicio: null,
  porItem: {}, motivo: null, confirmadoPorNome: null, confirmadoEm: null
};

describe('prazo de entrega da ata na aba Ações (migration 301)', () => {
  it('leitura clara: confirmar, com a regra sugerida', () => {
    expect(itemDoPrazoDaAta(base)).toMatchObject({ kind: 'PRAZO', severity: 'INFO', title: 'Confirmar o prazo de entrega lido do TR', description: '90 dias corridos da autorização do Exército' });
  });
  it('a conferir e sem cláusula pedem atenção', () => {
    expect(itemDoPrazoDaAta({ ...base, leitura: 'CONFERIR', leituraMotivo: 'trechos contam de pontos diferentes' })).toMatchObject({ severity: 'ATENCAO', title: 'Conferir o prazo de entrega no TR', description: 'trechos contam de pontos diferentes' });
    expect(itemDoPrazoDaAta({ ...base, leitura: 'SEM_CLAUSULA', sugeridoDias: null, sugeridoInicio: null })).toMatchObject({ title: 'Informar o prazo de entrega', badgeLabel: 'informar' });
  });
  it('confirmado ou sem linha: nada a fazer', () => {
    expect(itemDoPrazoDaAta({ ...base, confirmadoEm: '2026-11-13T12:00:00Z', dias: 90, contagem: 'CORRIDOS', inicio: 'EXERCITO' })).toBeNull();
    expect(itemDoPrazoDaAta(null)).toBeNull();
  });
});

describe('ata nova, fora da leitura dos editais (migration 302)', () => {
  it('com contrato, pede para informar; sem contrato, nada', () => {
    expect(itemDoPrazoDaAta(null, true, '00090/2026')).toMatchObject({ kind: 'PRAZO', title: 'Informar o prazo de entrega', badgeLabel: 'informar' });
    expect(itemDoPrazoDaAta(null, false, '00090/2026')).toBeNull();
  });
});

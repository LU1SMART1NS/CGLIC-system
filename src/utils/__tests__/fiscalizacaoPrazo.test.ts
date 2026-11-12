import { describe, expect, it } from 'vitest';
import { devolverSuspensao, origemDaPrevista, previstaPelaRegra, semRecebimentoDaOrdem, textoDaRegra } from '../fiscalizacaoPrazo';

describe('prazo de entrega pela regra do contrato (migration 294)', () => {
  it('dias corridos: não conta o dia do começo; fim de semana e feriado passam ao dia útil seguinte', () => {
    expect(previstaPelaRegra('2026-11-12', 60, 'CORRIDOS')).toBe('2027-01-11');
    // 01/09 + 60 = 31/10 (sábado) → 02/11 é Finados → 03/11.
    expect(previstaPelaRegra('2026-09-01', 60, 'CORRIDOS')).toBe('2026-11-03');
  });
  it('dias úteis pulam fins de semana e feriados nacionais fixos', () => {
    // 07/09 e 12/10 são feriados.
    expect(previstaPelaRegra('2026-09-01', 30, 'UTEIS')).toBe('2026-10-15');
    expect(previstaPelaRegra('2026-11-13', 1, 'UTEIS')).toBe('2026-11-16');
  });
  it('a espera no Exército volta ao fornecedor', () => {
    expect(devolverSuspensao('2026-10-15', '2026-10-01', '2026-11-12')).toEqual({ dias: 42, nova: '2026-11-26' });
    expect(devolverSuspensao('2026-10-15', '2026-11-12', '2026-11-12').dias).toBe(0);
  });
  it('texto da regra e de onde veio a data', () => {
    expect(textoDaRegra({ dias: 30, contagem: 'UTEIS', inicio: 'OF_RECEBIMENTO' })).toBe('30 dias úteis do recebimento da Ordem');
    expect(textoDaRegra({ dias: 90, contagem: 'CORRIDOS', inicio: 'EXERCITO' })).toBe('90 dias corridos da autorização do Exército');
    expect(origemDaPrevista({ prevista: '2026-12-15', previstaOrigem: 'PRORROGACAO', previstaAnterior: '2026-11-02', ordemRecebidaEm: null, prazoDias: null, diasSuspensos: 0 })).toBe('prorrogada; era 02/11/2026');
    expect(origemDaPrevista({ prevista: '2026-11-30', previstaOrigem: 'PLANILHA', previstaAnterior: null, ordemRecebidaEm: null, prazoDias: null, diasSuspensos: 0 })).toBe('da planilha da SFC/CGLIC; confirme pela Ordem');
    expect(origemDaPrevista({ prevista: '2026-11-26', previstaOrigem: 'ORDEM', previstaAnterior: null, ordemRecebidaEm: '2026-09-01', prazoDias: 30, diasSuspensos: 42 })).toBe('30 dias corridos do recebimento da Ordem em 01/09/2026 · +42 dias no Exército');
  });
  it('recebimento da Ordem só falta quando a data não está pela regra', () => {
    expect(semRecebimentoDaOrdem({ ordemRecebidaEm: null, previstaOrigem: 'PLANILHA' })).toBe(true);
    expect(semRecebimentoDaOrdem({ ordemRecebidaEm: null, previstaOrigem: 'ASSINATURA' })).toBe(false);
    expect(semRecebimentoDaOrdem({ ordemRecebidaEm: '2026-09-01', previstaOrigem: 'ORDEM' })).toBe(false);
  });
});

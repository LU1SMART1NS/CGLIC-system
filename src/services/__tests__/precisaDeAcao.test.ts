import { describe, it, expect } from 'vitest';
import { resumirPrecisaDeAcao, type PagamentoCarteiraRow } from '../financeiroCarteiraService';

const ciclo = (etapa: any, etapaAtual?: any) => ({ tipo: 'CICLO', chave: Math.random().toString(), contractKey: 'K', etapa, ciclo: { etapaAtual } as any, faturas: [] }) as PagamentoCarteiraRow;
const fatura = (etapa: any) => ({ tipo: 'FATURA', chave: Math.random().toString(), contractKey: 'K', etapa, fatura: {} as any }) as PagamentoCarteiraRow;

describe('resumirPrecisaDeAcao (número do Financeiro no menu)', () => {
  it('conta só ciclos na CGLIC e faturas com erro no SIAFI', () => {
    const r = resumirPrecisaDeAcao([ciclo('NA_CGLIC'), fatura('ERRO_SIAFI'), ciclo('NA_CGOFI'), fatura('AGUARDANDO_OB'), fatura('PAGA')]);
    expect(r.total).toBe(2);
  });

  it('é urgente com erro no SIAFI ou prazo da CGLIC vencido; prazo da CGOFI não conta', () => {
    expect(resumirPrecisaDeAcao([ciclo('NA_CGLIC', { dono: 'CGLIC', atrasado: false })]).urgente).toBe(false);
    expect(resumirPrecisaDeAcao([ciclo('NA_CGLIC', { dono: 'CGLIC', atrasado: true })]).urgente).toBe(true);
    expect(resumirPrecisaDeAcao([fatura('ERRO_SIAFI')]).urgente).toBe(true);
    expect(resumirPrecisaDeAcao([ciclo('NA_CGOFI', { dono: 'CGOFI', atrasado: true })]).urgente).toBe(false);
  });
});

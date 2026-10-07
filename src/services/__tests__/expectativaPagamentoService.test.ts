import { describe, it, expect } from 'vitest';
import { historicoDePagamentos, sugerirExpectativa, ultimosMesesFechados } from '../expectativaPagamentoService';
import { classeDaLinha } from '../../components/financeiro/previsaoLinha';

const fatura = (contractKey: string, obEmissao: string | null, valorLiquido: number, extra: { paga?: boolean; cancelada?: boolean } = {}) => ({
  contractKey,
  obEmissao,
  valorLiquido,
  paga: extra.paga ?? true,
  cancelada: extra.cancelada ?? false
});

describe('expectativa de pagamento', () => {
  it('os 3 últimos meses fechados, do mais antigo ao mais recente (inclusive na virada do ano)', () => {
    expect(ultimosMesesFechados(new Date(2026, 9, 7))).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(ultimosMesesFechados(new Date(2026, 0, 15))).toEqual(['2025-10', '2025-11', '2025-12']);
  });

  it('soma por mês da OB, só faturas pagas e não canceladas, dentro dos meses', () => {
    const meses = ['2026-07', '2026-08', '2026-09'];
    const h = historicoDePagamentos(
      [
        fatura('A', '2026-07-10', 100),
        fatura('A', '2026-07-20', 50),
        fatura('A', '2026-08-05', 200),
        fatura('A', '2026-09-30', 300),
        fatura('A', '2026-10-01', 999),
        fatura('A', '2026-09-02', 999, { cancelada: true }),
        fatura('A', null, 999, { paga: false }),
        fatura('B', '2026-08-01', 80),
        fatura('B', '2026-09-01', 120)
      ],
      meses
    );
    expect(h.get('A')).toMatchObject({ mesesComPagamento: 3, media: 216.67, menor: 150, maior: 300 });
    expect(h.get('A')!.porMes.map((p) => p.valor)).toEqual([150, 200, 300]);
    expect(h.get('B')).toMatchObject({ mesesComPagamento: 2, media: 100 });
    expect(sugerirExpectativa(h.get('A'))).toBe('MENSAL');
    expect(sugerirExpectativa(h.get('B'))).toBe('TALVEZ_MENSAL');
    expect(sugerirExpectativa(undefined)).toBeNull();
  });

  it('a marca do usuário vale mais que a sugestão', () => {
    const marca = { contractKey: 'A', tipo: 'EVENTUAL' as const, valorMensal: null, observacao: null, atualizadoPorNome: null, atualizadoEm: '' };
    expect(classeDaLinha({ marca, sugestao: 'MENSAL' })).toBe('EVENTUAL');
    expect(classeDaLinha({ marca: undefined, sugestao: 'MENSAL' })).toBe('SUGERIDO_MENSAL');
    expect(classeDaLinha({ marca: undefined, sugestao: 'TALVEZ_MENSAL' })).toBe('TALVEZ_MENSAL');
    expect(classeDaLinha({ marca: undefined, sugestao: null })).toBe('SEM_CLASSE');
  });
});

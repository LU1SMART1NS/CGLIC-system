import { describe, it, expect } from 'vitest';
import { contarItensAAlocar } from '../contagemExtras';

describe('número do menu Alocação × ata sem divisão (migration 297)', () => {
  const linha = (over: Record<string, unknown>) => ({ quantitativoSenasp: 100, faixa: 'REGULAR', nivelAlocacao: 'SEM', ...over }) as any;
  it('item de ata que não divide entre as unidades não conta como pendência', () => {
    expect(contarItensAAlocar([linha({}), linha({ semDivisaoNaAta: true }), linha({ nivelAlocacao: 'PARCIAL', semDivisaoNaAta: true })])).toBe(1);
  });
  it('ata que divide ou a conferir continua cobrada como antes', () => {
    expect(contarItensAAlocar([linha({ semDivisaoNaAta: false }), linha({ nivelAlocacao: 'PARCIAL' }), linha({ nivelAlocacao: 'TOTAL' })])).toBe(2);
  });
});

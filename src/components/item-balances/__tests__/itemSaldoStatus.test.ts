import { describe, it, expect } from 'vitest';
import { itemSaldoStatus } from '../ItemHero';
import { classifyArpItemSaldo } from '../../../services/balanceService';

describe('itemSaldoStatus usa a régua única do saldo SENASP', () => {
  it('resta 20% ou mais e até 50% consumido: disponível; consumo acima de 50%: atenção; acima de 80%: crítico; zerado: esgotado', () => {
    expect(itemSaldoStatus(50, 50).faixa).toBe('REGULAR');
    expect(itemSaldoStatus(40, 40).faixa).toBe('ATENCAO');
    expect(itemSaldoStatus(20, 20).faixa).toBe('ATENCAO');
    expect(itemSaldoStatus(19, 19).faixa).toBe('CRITICO');
    expect(itemSaldoStatus(0, 0).faixa).toBe('EXPIRADO');
  });

  it('concorda com classifyArpItemSaldo para qualquer consumo', () => {
    for (const consumido of [0, 30, 50, 50.5, 79, 80, 80.5, 99]) {
      const { isCritico, isProximoLimite } = classifyArpItemSaldo(consumido);
      const faixa = itemSaldoStatus(100 - consumido, 100 - consumido).faixa;
      expect(faixa).toBe(isCritico ? 'CRITICO' : isProximoLimite ? 'ATENCAO' : 'REGULAR');
    }
  });
});

import { describe, it, expect } from 'vitest';
import { getPaymentStatusDisplay } from '../paymentStatusDisplay';

describe('getPaymentStatusDisplay', () => {
  it('mapeia status conhecidos com rótulo único', () => {
    expect(getPaymentStatusDisplay('EM_INSTRUCAO')).toMatchObject({ label: 'Em Instrução', variant: 'info' });
    expect(getPaymentStatusDisplay('PAGAMENTO_CONFIRMADO').variant).toBe('success');
  });
  it('cai em neutro para status desconhecido', () => {
    expect(getPaymentStatusDisplay('XYZ')).toMatchObject({ label: 'XYZ', variant: 'neutral' });
  });
});

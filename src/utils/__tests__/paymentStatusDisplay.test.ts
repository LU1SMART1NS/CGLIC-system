import { describe, it, expect } from 'vitest';
import { getPaymentStatusDisplay } from '../paymentStatusDisplay';

describe('getPaymentStatusDisplay', () => {
  it('mapeia status conhecidos com rótulo único', () => {
    expect(getPaymentStatusDisplay('RECEBIDO')).toMatchObject({ label: 'Em conferência', variant: 'info' });
    expect(getPaymentStatusDisplay('COM_PENDENCIA')).toMatchObject({ label: 'Com pendência', variant: 'warning' });
    expect(getPaymentStatusDisplay('ENVIADO_CGOFI')).toMatchObject({ label: 'Na CGOFI', variant: 'info' });
    expect(getPaymentStatusDisplay('PAGO').variant).toBe('success');
  });
  it('cai em neutro para status desconhecido', () => {
    expect(getPaymentStatusDisplay('XYZ')).toMatchObject({ label: 'XYZ', variant: 'neutral' });
  });
});

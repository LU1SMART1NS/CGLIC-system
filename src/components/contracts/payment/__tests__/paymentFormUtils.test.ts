import { describe, expect, it } from 'vitest';
import { isoToBR, parseCurrencyInputBR, prazoExigeJustificativa, prazoPadraoISO } from '../paymentFormUtils';

describe('prazoExigeJustificativa', () => {
  it('só exige justificativa quando o prazo passa do padrão', () => {
    expect(prazoExigeJustificativa({ prazoISO: '2026-10-09', padraoISO: '2026-10-06' })).toBe(true);
  });

  it('não exige no prazo padrão nem quando o gestor termina antes', () => {
    expect(prazoExigeJustificativa({ prazoISO: '2026-10-06', padraoISO: '2026-10-06' })).toBe(false);
    expect(prazoExigeJustificativa({ prazoISO: '2026-10-03', padraoISO: '2026-10-06' })).toBe(false);
  });

  it('sem prazo ou sem padrão informado não há o que justificar', () => {
    expect(prazoExigeJustificativa({ prazoISO: '', padraoISO: '2026-10-06' })).toBe(false);
    expect(prazoExigeJustificativa({ prazoISO: '2026-10-06', padraoISO: '' })).toBe(false);
  });
});

describe('formatação do formulário de pagamentos', () => {
  it('converte data ISO em dd/mm/aaaa e valor em número', () => {
    expect(isoToBR('2026-10-02')).toBe('02/10/2026');
    expect(isoToBR(undefined)).toBe('');
    expect(parseCurrencyInputBR('1.500,50')).toBe(1500.5);
    expect(parseCurrencyInputBR('')).toBeUndefined();
  });

  it('o prazo padrão de conferência conta dias úteis a partir da data', () => {
    // 02/10/2026 é sexta-feira: 5 dias úteis depois cai na sexta seguinte
    expect(prazoPadraoISO('CONFERENCIA', '2026-10-02')).toBe('2026-10-09');
  });
});

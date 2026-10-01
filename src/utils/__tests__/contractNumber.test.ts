import { describe, it, expect } from 'vitest';
import { formatContractNumber } from '../contractNumber';

describe('formatContractNumber', () => {
  it('monta número/ano quando vêm separados', () => {
    expect(formatContractNumber({ numero: '00135', ano: 2025 })).toBe('00135/2025');
  });
  it('não repete o ano quando o número já o contém', () => {
    expect(formatContractNumber({ numero: '00065/2021', ano: 2021 })).toBe('00065/2021');
  });
  it('remove ano duplicado do número formatado', () => {
    expect(formatContractNumber({ numero: '', ano: '', numeroFormatado: '00065/2021/2021' })).toBe('00065/2021');
  });
});

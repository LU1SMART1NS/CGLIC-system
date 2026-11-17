import { describe, expect, it } from 'vitest';
import { avisoTesouroAtrasado, diasUteisDesdeTesouro } from '../tesouroAtrasado';


describe('leitura do Tesouro atrasada', () => {
  // 13/11/2026 é sexta-feira.
  const lido = '2026-11-13T17:03:26';

  it('conta só dias úteis desde a leitura', () => {
    expect(diasUteisDesdeTesouro(lido, new Date(2026, 10, 15))).toBe(0); // domingo
    expect(diasUteisDesdeTesouro(lido, new Date(2026, 10, 17))).toBe(2); // terça
  });

  it('não avisa até 3 dias úteis', () => {
    expect(avisoTesouroAtrasado(lido, new Date(2026, 10, 18))).toBeNull(); // quarta: 3 dias úteis
  });

  it('avisa a partir do 4º dia útil, com a data da leitura', () => {
    const aviso = avisoTesouroAtrasado(lido, new Date(2026, 10, 19)); // quinta: 4 dias úteis
    expect(aviso).toContain('4 dias úteis');
    expect(aviso).toContain('13/11/2026');
  });

  it('sem data não avisa', () => {
    expect(avisoTesouroAtrasado(null)).toBeNull();
    expect(diasUteisDesdeTesouro(undefined)).toBeNull();
  });
});

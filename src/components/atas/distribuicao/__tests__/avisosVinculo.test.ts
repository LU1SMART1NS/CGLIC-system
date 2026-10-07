import { describe, expect, it } from 'vitest';
import { conflitoPendente, textoAviso } from '../AvisosVinculoBanner';

const base = { id: '1', ataKey: '00010/2025', gestorNovo: 'Ana', criadoEm: '2026-10-05T10:00:00Z' };

describe('textoAviso', () => {
  it('contrato que passou ao gestor da ata', () => {
    const t = textoAviso({ ...base, tipo: 'CONTRATO_REALINHADO', contractKey: '200331-00005-2025', gestorAnterior: 'Bruno', feitoPorNome: 'Carlos' });
    expect(t).toBe('Carlos vinculou o contrato 00005/2025 à ata 00010/2025: o contrato passou de Bruno para Ana, gestor da ata.');
  });

  it('ata sem gestor que assumiu o gestor do contrato', () => {
    const t = textoAviso({ ...base, tipo: 'ATA_ASSUMIU_GESTOR', contractKey: '200331-00005-2025' });
    expect(t).toContain('a ata passou a ser de Ana, gestor do contrato');
    expect(t).toContain('Foi vinculado o contrato 00005/2025');
  });

  it('contrato em atas de gestores diferentes', () => {
    const t = textoAviso({ ...base, tipo: 'GESTORES_DIFERENTES', ataKey: '00025/2025', contractKey: '200331-00033-2026', gestorAnterior: 'Daniel', feitoPorNome: 'Ana' });
    expect(t).toBe('O contrato 00033/2026 está em atas de gestores diferentes: a ata 00025/2025 é de Ana e o contrato está com Daniel (vínculo ou troca feita por Ana).');
  });
});

describe('conflitoPendente', () => {
  const aviso = { ...base, tipo: 'GESTORES_DIFERENTES' as const, ataKey: '00025/2025', contractKey: 'C33', gestorAnterior: 'Daniel' };
  it('fica enquanto o contrato e a ata têm gestores diferentes; sai quando alguém igualou', () => {
    expect(conflitoPendente(aviso, () => 'Daniel', () => 'Ana')).toBe(true);
    expect(conflitoPendente(aviso, () => 'Ana', () => 'Ana')).toBe(false);
    expect(conflitoPendente(aviso, () => 'Daniel', () => 'Daniel')).toBe(false);
    // Sem o dado atual, vale o que o aviso guardou.
    expect(conflitoPendente(aviso, () => undefined, () => undefined)).toBe(true);
    expect(conflitoPendente({ ...aviso, tipo: 'CONTRATO_REALINHADO' }, () => 'Daniel', () => 'Ana')).toBe(false);
  });
});

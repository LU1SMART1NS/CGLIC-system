import { describe, expect, it } from 'vitest';
import { textoAviso } from '../AvisosVinculoBanner';

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
});

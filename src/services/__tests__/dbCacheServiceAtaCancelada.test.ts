import { describe, it, expect, vi } from 'vitest';

// Banco falso: duas atas, uma cancelada com vigência futura (caso da 00005/2026) e uma vigente.
const linhas = vi.hoisted(() => [
  { numero_ata: '00005/2026', codigo_uasg: '200331', status_ata: 'Cancelada', data_vigencia_final: '2027-03-02', itens_ata: [] },
  { numero_ata: '00023/2026', codigo_uasg: '200331', status_ata: 'Ata de Registro de Preços', data_vigencia_final: '2027-03-16', itens_ata: [] }
]);

vi.mock('../supabaseClient', () => {
  const consulta = { eq: () => consulta, ilike: () => consulta, then: (ok: (r: unknown) => unknown) => ok({ data: linhas, error: null }) };
  return {
    isSupabaseConfigured: true,
    ehServidor: false,
    supabase: { from: () => ({ select: () => consulta }) }
  };
});

import { ataCanceladaNoBanco, fetchArpsFromDb, fetchArpsWithItemsFromDb } from '../dbCacheService';

describe('ata cancelada lida do banco', () => {
  it('status_ata "Cancelada" vira isCanceladaPncp; os demais, não', () => {
    expect(ataCanceladaNoBanco('Cancelada')).toBe(true);
    expect(ataCanceladaNoBanco('Ata de Registro de Preços')).toBe(false);
    expect(ataCanceladaNoBanco(null)).toBe(false);
  });

  it('as duas leituras das telas marcam a ata cancelada', async () => {
    const simples = await fetchArpsFromDb('200331');
    const comItens = await fetchArpsWithItemsFromDb('200331');
    for (const arps of [simples.arps, comItens.arps]) {
      expect(arps.find((a) => a.numeroAtaRegistroPreco === '00005/2026')?.isCanceladaPncp).toBe(true);
      expect(arps.find((a) => a.numeroAtaRegistroPreco === '00023/2026')?.isCanceladaPncp).toBe(false);
    }
  });
});

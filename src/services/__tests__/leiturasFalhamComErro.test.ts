import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Passo 2 da auditoria das telas (docs/estudos/telas-leituras-auditoria.md, conserto 3): as leituras que serviam a
 * quase todas as telas trocavam a falha do banco por "nenhum" ({} ou []). Agora a falha vira erro, para a tela
 * avisar, e "o banco não tem" continua sendo a lista vazia.
 */
const banco = vi.hoisted(() => ({ erro: null as null | { message: string; code?: string } }));

vi.mock('../supabaseClient', () => {
  const consulta: any = {};
  for (const m of ['select', 'eq', 'ilike', 'like', 'order', 'range', 'in', 'not']) consulta[m] = () => consulta;
  consulta.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve({ data: banco.erro ? null : [], error: banco.erro }).then(ok, falha);
  return { isSupabaseConfigured: true, ehServidor: false, supabase: { from: () => consulta } };
});

import { fetchArpsFromDb, fetchArpsWithItemsFromDb } from '../dbCacheService';
import { fetchAllAtaManagers } from '../ataManagerService';
import { fetchAllContractManagers, fetchAllContractTaskPlans } from '../contractManagementService';
import { fetchAllAtaTaskPlans } from '../ataManagementService';
import { fetchAllArpItemContractLinks, fetchArpItemContractLinksByAta } from '../arpContractLinkService';
import { fetchAvisosResolvidos } from '../avisosResolvidosService';
import { fetchContratosSemAta } from '../contratoSemAtaService';
import { fetchDescartesAtaContrato } from '../contratoAtaDescarteService';
import { fetchComplexidadeAjustes } from '../complexidadeAjusteService';

const leituras: Array<[string, () => Promise<unknown>, unknown]> = [
  ['atas (fetchArpsFromDb)', () => fetchArpsFromDb('200331'), { arps: [], syncInfo: { isCachedInDb: false } }],
  ['atas com itens (fetchArpsWithItemsFromDb)', () => fetchArpsWithItemsFromDb('200331'), { arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: false } }],
  ['gestores das atas', () => fetchAllAtaManagers(), {}],
  ['gestores dos contratos', () => fetchAllContractManagers('200331'), {}],
  ['planos dos contratos', () => fetchAllContractTaskPlans('200331'), {}],
  ['planos das atas', () => fetchAllAtaTaskPlans(), {}],
  ['vínculos item↔contrato', () => fetchAllArpItemContractLinks(), []],
  ['vínculos de uma ata', () => fetchArpItemContractLinksByAta('00059/2025', '200331'), []],
  ['avisos resolvidos', () => fetchAvisosResolvidos(), []],
  ['contratos sem ata', () => fetchContratosSemAta(), {}],
  ['atas descartadas', () => fetchDescartesAtaContrato(), {}],
  ['ajustes de complexidade', () => fetchComplexidadeAjustes(), {}]
];

describe('leituras que as telas dividem: falha vira erro, vazio continua vazio', () => {
  beforeEach(() => {
    banco.erro = null;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it.each(leituras)('%s: o banco não respondeu → erro', async (_nome, ler) => {
    banco.erro = { message: 'canceling statement due to statement timeout', code: '57014' };
    await expect(ler()).rejects.toMatchObject({ message: 'canceling statement due to statement timeout' });
  });

  it.each(leituras)('%s: o banco não tem nada → vazio, sem erro', async (_nome, ler, vazio) => {
    await expect(ler()).resolves.toEqual(vazio);
  });
});

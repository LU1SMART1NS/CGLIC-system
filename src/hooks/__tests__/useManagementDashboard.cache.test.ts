/**
 * Painel do Início pelo cache (estudo docs/estudos/inicio-fila-do-banco.md, corte 4): contratos, gestores e atas que a
 * página e o menu já leram não são lidos de novo; "Atualizar" e o fim da sincronização fazem o painel reler os três.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../../services/contratosOficiaisService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contratosOficiaisService')>()),
  fetchContratosParaTela: vi.fn()
}));
vi.mock('../../services/contractManagementService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contractManagementService')>()),
  fetchAllContractManagers: vi.fn(),
  fetchAllContractTaskPlans: vi.fn(async () => ({}))
}));
vi.mock('../../services/dbCacheService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/dbCacheService')>()),
  fetchArpsFromDb: vi.fn(),
  fetchArpsWithItemsFromDb: vi.fn()
}));

import { fetchContratosParaTela } from '../../services/contratosOficiaisService';
import { fetchAllContractManagers } from '../../services/contractManagementService';
import { fetchArpsFromDb, fetchArpsWithItemsFromDb } from '../../services/dbCacheService';
import { getManagementDashboardQueryOptions } from '../useManagementDashboard';
import { getContractsDashboardQueryOptions } from '../useContractsDashboard';
import { getAllContractManagersQueryOptions } from '../useAllContractManagers';
import { getAtaSourceQueryOptions } from '../useAta';
import { invalidarDadosDeContratos } from '../useSincronizacaoContratos';
import type { ContractDashboardRecord } from '../../types';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

const UASGS = ['200330', '200331'];
const contrato = (id: string, uasg: string) =>
  ({ id, numero: id, ano: 2026, numeroFormatado: `${id}/2026`, objeto: 'X', fornecedorNome: 'F', statusVigencia: 'Vigente', dataVigenciaFim: '2027-12-31', uasg, fonteDados: 'Compras.gov.br' }) as ContractDashboardRecord;
const ata = (numero: string, uasg: string) =>
  ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: uasg, objeto: 'Ata', dataVigenciaFinal: '2027-06-30' }) as any;

let contratosPorUasg: Record<string, ContractDashboardRecord[]>;

/** O painel das duas UASGs como o React Query o roda (o queryFn recebe o client). */
function abrirPainel(client: QueryClient): Promise<ManagementDashboardReadModel[]> {
  return Promise.all(UASGS.map((uasg) => getManagementDashboardQueryOptions({ uasg }).queryFn({ client })));
}

describe('painel do Início lê contratos, gestores e atas pelo cache', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    contratosPorUasg = { '200330': [contrato('C330', '200330')], '200331': [contrato('C331', '200331')] };
    vi.mocked(fetchContratosParaTela).mockImplementation(async (uasg: string) => contratosPorUasg[uasg]);
    vi.mocked(fetchAllContractManagers).mockResolvedValue({});
    vi.mocked(fetchArpsWithItemsFromDb).mockImplementation(async (uasg?: string) => ({
      arps: [ata(`0000${uasg?.slice(-1)}/2026`, uasg!)],
      itemsByAta: {},
      syncInfo: { isCachedInDb: true }
    }));
  });

  it('o que a página e o menu já leram não é lido de novo', async () => {
    // A página (useContractsDashboard, useAllContractManagers) e o menu (atas da carteira) leem primeiro.
    await Promise.all(
      UASGS.flatMap((uasg) => [
        client.fetchQuery(getContractsDashboardQueryOptions(uasg)),
        client.fetchQuery(getAllContractManagersQueryOptions(uasg)),
        client.fetchQuery(getAtaSourceQueryOptions(uasg))
      ])
    );

    const [r330, r331] = await abrirPainel(client);

    expect(fetchContratosParaTela).toHaveBeenCalledTimes(2);
    expect(fetchAllContractManagers).toHaveBeenCalledTimes(2);
    expect(fetchArpsWithItemsFromDb).toHaveBeenCalledTimes(2);
    // A leitura própria das atas do painel não sai mais.
    expect(fetchArpsFromDb).not.toHaveBeenCalled();
    expect(r330.executive.totalContratos).toBe(1);
    expect(r331.arp.totalAtas).toBe(1);
    expect(r331.fontesComFalha).toBeUndefined();
  });

  it('abrindo antes da página, o painel lê e deixa no cache para a página e o menu', async () => {
    await abrirPainel(client);
    expect(fetchContratosParaTela).toHaveBeenCalledTimes(2);

    await client.fetchQuery(getContractsDashboardQueryOptions('200331'));
    await client.fetchQuery(getAtaSourceQueryOptions('200331'));
    expect(fetchContratosParaTela).toHaveBeenCalledTimes(2);
    expect(fetchArpsWithItemsFromDb).toHaveBeenCalledTimes(2);
  });

  it('"Atualizar" e o fim da sincronização: o painel relê contratos, gestores e atas e mostra o dado novo', async () => {
    await abrirPainel(client);
    contratosPorUasg['200331'] = [contrato('C331', '200331'), contrato('C332', '200331')];

    await invalidarDadosDeContratos(client);
    const [, r331] = await abrirPainel(client);

    expect(fetchContratosParaTela).toHaveBeenCalledTimes(4);
    expect(fetchAllContractManagers).toHaveBeenCalledTimes(4);
    expect(fetchArpsWithItemsFromDb).toHaveBeenCalledTimes(4);
    expect(r331.executive.totalContratos).toBe(2);
  });

  it('a falha de uma fonte lida pelo cache continua virando o aviso de fonte que não carregou', async () => {
    vi.mocked(fetchContratosParaTela).mockRejectedValue(new Error('canceling statement due to statement timeout'));
    const [r330] = await abrirPainel(client);
    expect(r330.fontesComFalha?.map((f) => f.rotulo)).toContain('contratos');
  });
});

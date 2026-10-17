import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { acharContrato, getContratoQueryOptions, useContract } from '../useContract';
import * as contratoGovModule from '../useContractContratosGov';
import type { ContractDashboardRecord } from '../../types';

/**
 * Contrato 360 lendo um contrato só (passo 3 da auditoria das telas, 6c): com a lista da carteira no navegador o
 * contrato sai dela (sem pedido); sem a lista, a tela lê só ele, pela chave. Nos dois casos, o mesmo contrato.
 */
const { lerContrato } = vi.hoisted(() => ({ lerContrato: vi.fn() }));
vi.mock('../../services/contratosOficiaisService', async (orig) => ({
  ...(await orig<typeof import('../../services/contratosOficiaisService')>()),
  fetchContratoParaTela: lerContrato
}));
vi.mock('../useContractContratosGov', () => ({
  useContratoGov: vi.fn()
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ role: 'leitor' })
}));

const mockContracts: ContractDashboardRecord[] = [
  {
    id: '200331-00015-2026',
    numero: '15/2026',
    ano: 2026,
    numeroFormatado: '15/2026',
    uasg: '200331',
    objeto: 'Prestação de serviços contínuos de TI',
    fornecedorNome: 'EMPRESA TECH BRASIL LTDA',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1200000,
    valorInicial: 1000000,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2026-12-31',
    statusVigencia: 'Vigente',
    numeroControlePncp: '200331-2-000015/2026',
    fonteDados: 'PNCP',
    processo: '23000.001234/2026-11'
  },
  {
    id: '200331-00020-2025',
    numero: '20/2025',
    ano: 2025,
    numeroFormatado: '20/2025',
    uasg: '200331',
    objeto: 'Serviços de limpeza e conservação predial',
    fornecedorNome: 'SERVICOS GERAIS S/A',
    fornecedorCnpjCpf: '98.765.432/0001-10',
    valorGlobal: 450000,
    statusVigencia: 'A Vencer',
    fonteDados: 'Compras.gov.br'
  }
];

/** Render no servidor: o React Query não busca nada; só vale o que já está no cache (a semente da lista). */
function rodar(client: QueryClient, contractKey: string) {
  return renderizar(client, () => useContract(contractKey, '200331'));
}

function renderizar<T>(client: QueryClient, hook: () => T): T {
  let r: T | undefined;
  const Sonda = () => {
    r = hook();
    return null;
  };
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Sonda)));
  return r!;
}

function comLista() {
  const client = new QueryClient();
  client.setQueryData(['contracts-dashboard', '200331'], mockContracts);
  return client;
}

describe('useContract — um contrato só, com a lista da carteira quando ela já está no navegador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({ data: undefined, isLoading: false } as any);
  });

  it('completa o registro do Compras.gov.br com o contrato do Contratos.gov.br, sem mudar o id da tela', () => {
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({
      data: { ...mockContracts[1], id: 'OUTRO-ID', contratoId: 670960, dataAssinatura: '2025-10-06', valorInicial: 3800, fonteDados: 'Contratos.gov.br', raw: { categoria: 'Compras' } },
      isLoading: false
    } as any);

    const result = rodar(comLista(), '200331-00020-2025');

    expect(result.contract?.id).toBe('200331-00020-2025');
    expect(result.contract?.contratoId).toBe(670960);
    expect(result.contract?.dataAssinatura).toBe('2025-10-06');
    expect(result.contract?.fonteDados).toBe('Contratos.gov.br');
    expect(result.contract?.raw?.categoria).toBe('Compras');
    expect(result.enriching).toBe(false);
  });

  it('enquanto completa, repassa o registro de base e avisa que está completando', () => {
    vi.mocked(contratoGovModule.useContratoGov).mockReturnValue({ data: undefined, isLoading: true } as any);
    const result = rodar(comLista(), '200331-00020-2025');
    expect(result.contract?.fonteDados).toBe('Compras.gov.br');
    expect(result.enriching).toBe(true);
  });

  it('com a lista no navegador: acha pela chave, sem ler o banco', () => {
    const result = rodar(comLista(), '200331-00015-2026');
    expect(result.contract?.id).toBe('200331-00015-2026');
    expect(result.contract?.fornecedorNome).toBe('EMPRESA TECH BRASIL LTDA');
    expect(result.isLoading).toBe(false);
    expect(lerContrato).not.toHaveBeenCalled();
  });

  it('com a lista no navegador: acha pelo número de controle do PNCP', () => {
    expect(rodar(comLista(), '200331-2-000015/2026').contract?.id).toBe('200331-00015-2026');
  });

  it('a lista invalidada (depois de sincronizar) não serve de semente: a tela relê o contrato', async () => {
    const client = comLista();
    await client.invalidateQueries({ queryKey: ['contracts-dashboard', '200331'], refetchType: 'none' });
    expect(rodar(client, '200331-00015-2026').contract).toBeNull();
  });

  it('sem a lista: lê só o contrato, pela UASG e pela chave em maiúsculas, sob o prefixo da lista', async () => {
    lerContrato.mockResolvedValue([mockContracts[0]]);
    const opcoes = getContratoQueryOptions(' 200331 ', '200331-00015-2026');
    expect(opcoes.queryKey).toEqual(['contracts-dashboard', '200331', 'contrato', '200331-00015-2026']);
    await expect(opcoes.queryFn()).resolves.toEqual([mockContracts[0]]);
    expect(lerContrato).toHaveBeenCalledWith('200331', '200331-00015-2026');
  });

  it('o contrato achado na lista e o lido pela chave são o mesmo', () => {
    for (const chave of ['200331-00015-2026', '200331-2-000015/2026', '200331-00020-2025']) {
      const daLista = acharContrato(mockContracts, chave);
      const lido = acharContrato(daLista ? [daLista] : [], chave);
      expect(lido).toBe(daLista);
    }
    expect(acharContrato(mockContracts, 'CHAVE-INEXISTENTE-999')).toBeNull();
  });
});

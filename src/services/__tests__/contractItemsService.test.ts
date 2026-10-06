import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api', () => ({
  fetchContratosGovData: vi.fn(),
  fetchContratoItensComprasGov: vi.fn()
}));

import { fetchContratosGovData, fetchContratoItensComprasGov } from '../api';
import { fetchContractItemDetails, lerItensDoContrato } from '../contractItemsService';

const itemGov = {
  tipo_id: 'Material',
  catmatseritem_id: 'CARRETA REBOQUE',
  descricao_complementar: 'CARRETA REBOQUE CAPACIDADE 500 KG',
  quantidade: '27',
  valorunitario: '21.357,95',
  valortotal: '576.664,65',
  numero_item_compra: '00004'
};

describe('lerItensDoContrato', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.mocked(fetchContratosGovData).mockReset().mockResolvedValue({ items: [] });
    vi.mocked(fetchContratoItensComprasGov).mockReset().mockResolvedValue([]);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('com o id do Contratos.gov.br, lê os itens direto, sem a consulta que descobre o id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [itemGov] });
    const r = await lerItensDoContrato({ uasg: '200331', numero: '00173', ano: '2026', contratoId: 924668 } as any);
    expect(fetchMock).toHaveBeenCalledWith('/api-contratos-gov/api/contrato/924668/itens');
    expect(fetchContratosGovData).not.toHaveBeenCalled();
    expect(r).toEqual({
      fonte: 'CONTRATOS_GOV',
      itens: [{ numeroItem: 4, descricao: 'CARRETA REBOQUE CAPACIDADE 500 KG', tipo: 'Material', quantidade: 27, valorUnitario: 21357.95, valorTotal: 576664.65 }]
    });
  });

  it('sem o id, descobre o contrato pelo número e ano; sem descrição complementar usa o nome do catálogo', async () => {
    vi.mocked(fetchContratosGovData).mockResolvedValue({ items: [{ ...itemGov, descricao_complementar: '' }] });
    const r = await lerItensDoContrato({ uasg: '200331', numero: '00173', ano: '2026' } as any);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.itens[0].descricao).toBe('CARRETA REBOQUE');
  });

  it('sem itens no Contratos.gov.br, lê do Compras.gov.br pelo número de controle do PNCP', async () => {
    vi.mocked(fetchContratoItensComprasGov).mockResolvedValue([
      { numeroItem: '00002', descricaoIitem: 'Serviço de manutenção', tipoItem: 'Serviço', quantidadeItem: 12, valorUnitarioItem: 100, valorTotalItem: 1200 }
    ] as any);
    const r = await lerItensDoContrato({ uasg: '200330', numero: '00010', ano: '2025', numeroControlePncp: 'X-1' } as any);
    expect(fetchContratoItensComprasGov).toHaveBeenCalledWith('X-1');
    expect(r).toEqual({
      fonte: 'COMPRAS_GOV',
      itens: [{ numeroItem: 2, descricao: 'Serviço de manutenção', tipo: 'Serviço', quantidade: 12, valorUnitario: 100, valorTotal: 1200 }]
    });
  });

  it('nenhuma fonte com itens: fonte nula e lista vazia', async () => {
    expect(await lerItensDoContrato({ uasg: '200330', numero: '1', ano: '2025' } as any)).toEqual({ fonte: null, itens: [] });
  });

  it('a leitura resumida dos vínculos sai da mesma leitura (número do item -> quantidade e preço)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [itemGov, { ...itemGov, numero_item_compra: null }] });
    const detalhes = await fetchContractItemDetails({ uasg: '200331', numero: '00173', ano: '2026', contratoId: '924668' } as any);
    expect(Array.from(detalhes)).toEqual([[4, { quantidade: 27, valorUnitario: 21357.95 }]]);
  });
});

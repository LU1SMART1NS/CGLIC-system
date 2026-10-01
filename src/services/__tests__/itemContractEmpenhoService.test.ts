import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContratosGovEmpenhoRecord } from '../../types';

vi.mock('../api', () => ({
  fetchContratosGovData: vi.fn(),
  fetchContratosGovEmpenhos: vi.fn(),
  fetchContratoEmpenhoDetalhe: vi.fn()
}));
vi.mock('../empenhoSyncService', () => ({ saveEmpenhoSoberanoM17: vi.fn() }));
vi.mock('../../adapters/empenhoItemRpcAdapter', () => ({ syncItemContractEmpenhosRpc: vi.fn() }));

import * as api from '../api';
import * as sync from '../empenhoSyncService';
import * as rpcAdapter from '../../adapters/empenhoItemRpcAdapter';
import {
  classifyContractEmpenhosForItem,
  syncItemContractEmpenhos,
  removeItemContractEmpenhos
} from '../itemContractEmpenhoService';

const emp = (over: Partial<ContratosGovEmpenhoRecord>): ContratosGovEmpenhoRecord =>
  ({ id: 1, numero: '2026NE000262', data_emissao: '2026-06-26', empenhado: '1000,00', unidade_gestora: '200331', ...over }) as any;

const base = { targetItemNum: 1, fallbackUasg: '200331', contractKey: '200331-230-2026' };

describe('classifyContractEmpenhosForItem', () => {
  it('usa a quantidade da minuta quando ela cita o item', () => {
    const [d] = classifyContractEmpenhosForItem(
      [emp({ itens_minuta: [{ numero_item_compra: '1', quantidade: 2 } as any] })],
      base
    );
    expect(d.quantidade).toBe(2);
    expect(d.quantidadeSugerida).toBeNull();
    expect(d.numeroItemMinuta).toBe('1');
  });

  it('ignora o empenho cuja minuta cita só outros itens do contrato', () => {
    const out = classifyContractEmpenhosForItem(
      [emp({ itens_minuta: [{ numero_item_compra: '2', quantidade: 9 } as any] })],
      base
    );
    expect(out).toEqual([]);
  });

  it('sem minuta o empenho fica pendente, com a estimativa por valor só como sugestão', () => {
    const [d] = classifyContractEmpenhosForItem([emp({ empenhado: '1000,00' })], { ...base, unitPrice: 100 });
    expect(d.quantidade).toBeNull();
    expect(d.quantidadeSugerida).toBe(10);
  });

  it('sem minuta e sem preço unitário fica pendente e sem sugestão', () => {
    const [d] = classifyContractEmpenhosForItem([emp({})], base);
    expect(d.quantidade).toBeNull();
    expect(d.quantidadeSugerida).toBeNull();
  });

  it('minuta com a linha do item mas sem quantidade numérica fica pendente', () => {
    const [d] = classifyContractEmpenhosForItem(
      [emp({ itens_minuta: [{ numero_item_compra: '1' } as any] })],
      { ...base, unitPrice: 100 }
    );
    expect(d.quantidade).toBeNull();
    expect(d.quantidadeSugerida).toBe(10);
  });

  it('sem unidade gestora no empenho usa a UASG do contrato na chave canônica', () => {
    const [d] = classifyContractEmpenhosForItem([emp({ unidade_gestora: undefined })], { ...base, fallbackUasg: '160001' });
    expect(d.empenho.uasg).toBe('160001');
    expect(d.empenho.canonical_key).toBe('160001-2026-2026NE262');
  });
});

describe('syncItemContractEmpenhos', () => {
  beforeEach(() => vi.clearAllMocks());

  const params = {
    numeroAta: '00037/2026',
    uasg: '200331',
    numeroItem: '1',
    contract: { contractKey: '200331-230-2026', uasg: '200331', numero: '230', ano: 2026, contratoId: 777 }
  };

  it('lê os empenhos do contrato, grava cada um e envia o conjunto do par item + contrato', async () => {
    vi.mocked(api.fetchContratosGovEmpenhos).mockResolvedValueOnce([emp({ id: 10 }), emp({ id: 11, numero: '2026NE000300' })]);
    vi.mocked(api.fetchContratoEmpenhoDetalhe)
      .mockResolvedValueOnce({ itens_minuta: [{ numero_item_compra: '1', quantidade: 2 }] } as any)
      .mockResolvedValueOnce({ itens_minuta: [{ numero_item_compra: '5', quantidade: 4 }] } as any);
    vi.mocked(sync.saveEmpenhoSoberanoM17).mockResolvedValueOnce({ empenhoId: 'uuid-a', isNew: true });
    vi.mocked(rpcAdapter.syncItemContractEmpenhosRpc).mockResolvedValueOnce({
      success: true, item_key: 'x', contract_key: 'y', sincronizados: 1, removidos: 0, pendentes: 0, timestamp: 't'
    });

    const summary = await syncItemContractEmpenhos(params);

    expect(sync.saveEmpenhoSoberanoM17).toHaveBeenCalledTimes(1);
    expect(rpcAdapter.syncItemContractEmpenhosRpc).toHaveBeenCalledWith({
      itemKey: '00037/2026-200331-00001',
      contractKey: '200331-230-2026',
      empenhos: [{ empenhoId: 'uuid-a', quantidade: 2, quantidadeSugerida: null, numeroItemMinuta: '1' }]
    });
    expect(summary).toMatchObject({ lidos: 2, sincronizados: 1, ignorados: 1 });
  });

  it('descobre o id do contrato no Contratos.gov quando não é informado', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({ contratoId: 555, items: [] });
    vi.mocked(api.fetchContratosGovEmpenhos).mockResolvedValueOnce([]);
    vi.mocked(rpcAdapter.syncItemContractEmpenhosRpc).mockResolvedValueOnce({
      success: true, item_key: 'x', contract_key: 'y', sincronizados: 0, removidos: 2, pendentes: 0, timestamp: 't'
    });

    const summary = await syncItemContractEmpenhos({ ...params, contract: { ...params.contract, contratoId: undefined } });

    expect(api.fetchContratosGovData).toHaveBeenCalledWith('200331', '230', 2026);
    expect(api.fetchContratosGovEmpenhos).toHaveBeenCalledWith(555);
    expect(summary.removidos).toBe(2);
  });

  it('falha de forma clara quando o contrato não existe no Contratos.gov', async () => {
    vi.mocked(api.fetchContratosGovData).mockResolvedValueOnce({ items: [] });
    await expect(
      syncItemContractEmpenhos({ ...params, contract: { ...params.contract, contratoId: undefined } })
    ).rejects.toThrow(/Contratos\.gov\.br/);
    expect(rpcAdapter.syncItemContractEmpenhosRpc).not.toHaveBeenCalled();
  });

  it('se um empenho falha ao gravar, não envia lista parcial (a RPC removeria os já gravados)', async () => {
    vi.mocked(api.fetchContratosGovEmpenhos).mockResolvedValueOnce([emp({ id: 10 }), emp({ id: 11, numero: '2026NE000300' })]);
    vi.mocked(api.fetchContratoEmpenhoDetalhe).mockResolvedValue(null);
    vi.mocked(sync.saveEmpenhoSoberanoM17)
      .mockResolvedValueOnce({ empenhoId: 'uuid-a', isNew: true })
      .mockRejectedValueOnce(new Error('boom'));

    await expect(syncItemContractEmpenhos(params)).rejects.toThrow(/2026NE000300.*1 de 2/);
    expect(rpcAdapter.syncItemContractEmpenhosRpc).not.toHaveBeenCalled();
  });

  it('não envia ao banco o empenho sem data de emissão', async () => {
    vi.mocked(api.fetchContratosGovEmpenhos).mockResolvedValueOnce([emp({ data_emissao: '' as any })]);
    vi.mocked(api.fetchContratoEmpenhoDetalhe).mockResolvedValueOnce({ itens_minuta: [] } as any);
    vi.mocked(rpcAdapter.syncItemContractEmpenhosRpc).mockResolvedValueOnce({
      success: true, item_key: 'x', contract_key: 'y', sincronizados: 0, removidos: 0, pendentes: 0, timestamp: 't'
    });
    await syncItemContractEmpenhos(params);
    expect(sync.saveEmpenhoSoberanoM17).not.toHaveBeenCalled();
  });
});

describe('removeItemContractEmpenhos', () => {
  it('remove enviando a lista vazia do par', async () => {
    vi.mocked(rpcAdapter.syncItemContractEmpenhosRpc).mockResolvedValueOnce({
      success: true, item_key: 'x', contract_key: 'y', sincronizados: 0, removidos: 4, pendentes: 0, timestamp: 't'
    });
    expect(await removeItemContractEmpenhos('00037/2026-200331-00001', '200331-230-2026')).toBe(4);
    expect(rpcAdapter.syncItemContractEmpenhosRpc).toHaveBeenCalledWith({
      itemKey: '00037/2026-200331-00001',
      contractKey: '200331-230-2026',
      empenhos: []
    });
  });
});

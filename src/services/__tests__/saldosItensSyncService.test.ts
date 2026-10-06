import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({ rpc: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>> }));

vi.mock('../supabaseClient', () => {
  banco.rpc = vi.fn<(...args: any[]) => Promise<any>>();
  return { isSupabaseConfigured: true, supabase: { rpc: (...args: unknown[]) => banco.rpc(...args) } };
});
vi.mock('../itemSaldoRefreshService', () => ({ refreshAllLinkedItemQuantities: vi.fn() }));
vi.mock('../itemSenaspBatchService', () => ({ syncAllPendingItemSenasp: vi.fn() }));

import * as refresh from '../itemSaldoRefreshService';
import * as senasp from '../itemSenaspBatchService';
import { sincronizarSaldosItens } from '../saldosItensSyncService';

function rpcsPadrao(reservou = true) {
  banco.rpc.mockImplementation(async (nome: string) => {
    if (nome === 'reservar_sincronizacao') return { data: reservou, error: null };
    if (nome === 'concluir_sincronizacao') return { data: true, error: null };
    return { data: null, error: { message: `rpc inesperada ${nome}` } };
  });
}
const chamadas = (nome: string) => banco.rpc.mock.calls.filter(([n]) => n === nome).map(([, args]) => args);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(refresh.refreshAllLinkedItemQuantities).mockResolvedValue({ contratos: 2, itensAtualizados: 3, falhas: [] });
  vi.mocked(senasp.syncAllPendingItemSenasp).mockResolvedValue({ pendentes: 4, gravados: 4, semUnidadeSenasp: 0, falhas: 0 });
});

describe('sincronizarSaldosItens — atualização global dos saldos, sob a trava do banco', () => {
  it('sem a reserva (outro navegador sincronizando ou dados na validade), não consulta nenhuma fonte', async () => {
    rpcsPadrao(false);
    const r = await sincronizarSaldosItens();
    expect(r.status).toBe('NAO_RESERVADO');
    expect(refresh.refreshAllLinkedItemQuantities).not.toHaveBeenCalled();
    expect(senasp.syncAllPendingItemSenasp).not.toHaveBeenCalled();
  });

  it('reserva o recurso de todas as carteiras, sem forçar por padrão', async () => {
    rpcsPadrao(true);
    await sincronizarSaldosItens();
    expect(chamadas('reservar_sincronizacao')[0]).toMatchObject({ p_recurso: 'saldos_itens', p_uasg: '000000', p_forcar: false });
    expect(vi.mocked(refresh.refreshAllLinkedItemQuantities).mock.calls[0][0]).toEqual({ force: false });
  });

  it('o coordenador força: pede a reserva forçada e a releitura de todos os vínculos', async () => {
    rpcsPadrao(true);
    await sincronizarSaldosItens({ forcar: true });
    expect(chamadas('reservar_sincronizacao')[0]).toMatchObject({ p_forcar: true });
    expect(vi.mocked(refresh.refreshAllLinkedItemQuantities).mock.calls[0][0]).toEqual({ force: true });
  });

  it('tudo certo: SUCESSO com o total de itens atualizados e gravados', async () => {
    rpcsPadrao(true);
    const r = await sincronizarSaldosItens();
    expect(r).toEqual({ status: 'SUCESSO', total: 7, fontesComFalha: [] });
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_recurso: 'saldos_itens', p_status: 'SUCESSO', p_total: 7 });
  });

  it('contratos que não puderam ser lidos: PARCIAL com a mensagem, e o SENASP ainda é gravado', async () => {
    rpcsPadrao(true);
    vi.mocked(refresh.refreshAllLinkedItemQuantities).mockResolvedValueOnce({
      contratos: 3, itensAtualizados: 1, falhas: [{ contractKey: 'a', motivo: 'x' }, { contractKey: 'b', motivo: 'y' }]
    });
    const r = await sincronizarSaldosItens();
    expect(r).toMatchObject({ status: 'PARCIAL', total: 5, fontesComFalha: ['Quantidade contratada dos contratos'], mensagem: '2 contratos não tiveram a quantidade atualizada.' });
    expect(senasp.syncAllPendingItemSenasp).toHaveBeenCalledTimes(1);
  });

  it('falha ao consultar o SENASP não derruba a quantidade contratada: PARCIAL', async () => {
    rpcsPadrao(true);
    vi.mocked(senasp.syncAllPendingItemSenasp).mockRejectedValueOnce(new Error('503'));
    const r = await sincronizarSaldosItens();
    expect(r).toMatchObject({ status: 'PARCIAL', total: 3, fontesComFalha: ['Quantitativo SENASP dos itens'], mensagem: 'o quantitativo SENASP não pôde ser consultado.' });
  });

  it('erro ao ler os vínculos no banco: ERRO, com a trava liberada', async () => {
    rpcsPadrao(true);
    vi.mocked(refresh.refreshAllLinkedItemQuantities).mockRejectedValueOnce(new Error('falha de leitura'));
    const r = await sincronizarSaldosItens();
    expect(r).toEqual({ status: 'ERRO', erro: 'falha de leitura' });
    expect(chamadas('concluir_sincronizacao')[0]).toMatchObject({ p_status: 'ERRO', p_mensagem: 'falha de leitura' });
  });
});

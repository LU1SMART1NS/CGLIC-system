import { describe, it, expect, vi } from 'vitest';
import { executarPedido, validarPedido, type DependenciasDeExecucao } from '../executar';
import type { ResultadoSincronizacao } from '../../../src/services/sincronizacaoFontesService';

const sucesso = (total: number): ResultadoSincronizacao => ({ status: 'SUCESSO', total, fontesComFalha: [] });

function deps(extra: Partial<DependenciasDeExecucao> = {}): DependenciasDeExecucao {
  let t = 0;
  return {
    sincronizarContratos: vi.fn(async () => sucesso(3)),
    sincronizarAtas: vi.fn(async () => sucesso(5)),
    sincronizarSaldosItens: vi.fn(async () => sucesso(7)),
    buscarContratosNasFontes: vi.fn(async () => ({ contracts: [{}, {}] as any, fontesComFalha: ['Compras.gov.br'] })),
    fetchArpsDasFontes: vi.fn(async () => [{}, {}, {}] as any),
    agora: () => (t += 1000),
    ...extra
  };
}

describe('validarPedido', () => {
  it('aceita contratos e atas das UASGs da CGLIC e normaliza os campos', () => {
    expect(validarPedido({ recurso: 'contratos', uasg: ' 200331 ', forcar: true })).toEqual({
      ok: true, pedido: { recurso: 'contratos', uasg: '200331', forcar: true, dry: false }
    });
    expect(validarPedido({ recurso: 'atas', uasg: '200330', dry: true })).toMatchObject({ ok: true, pedido: { dry: true, forcar: false } });
  });

  it('forcar e dry só valem como booleano verdadeiro (texto "true" não vale)', () => {
    expect(validarPedido({ recurso: 'saldos_itens', forcar: 'true', dry: 1 })).toMatchObject({ ok: true, pedido: { forcar: false, dry: false } });
  });

  it.each([
    [{ recurso: 'x' }, /Recurso inválido/],
    [{ recurso: 'contratos' }, /UASG inválida/],
    [{ recurso: 'atas', uasg: '090014' }, /UASG inválida/],
    ['texto', /Corpo/],
    [undefined, /Corpo/]
  ])('recusa %j', (corpo, erro) => {
    const r = validarPedido(corpo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(erro);
  });
});

describe('executarPedido', () => {
  it('contratos: chama a sincronização da UASG com a opção de forçar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'contratos', uasg: '200331', forcar: true }, d);
    expect(d.sincronizarContratos).toHaveBeenCalledWith('200331', { forcar: true });
    expect(r).toMatchObject({ dry: false, recurso: 'contratos', uasg: '200331', duracaoMs: 1000, resultado: { status: 'SUCESSO', total: 3 } });
  });

  it('atas: chama a sincronização das atas da UASG', async () => {
    const d = deps();
    await executarPedido({ recurso: 'atas', uasg: '200331' }, d);
    expect(d.sincronizarAtas).toHaveBeenCalledWith('200331', { forcar: undefined, orcamentoMs: 100_000 });
  });

  it('saldos dos itens: sem UASG', async () => {
    const d = deps();
    await executarPedido({ recurso: 'saldos_itens', forcar: false }, d);
    expect(d.sincronizarSaldosItens).toHaveBeenCalledWith({ forcar: false });
  });

  it('dry de contratos: só consulta as fontes e conta; não grava nem usa a trava', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'contratos', uasg: '200331', dry: true }, d);
    expect(r).toMatchObject({ dry: true, consulta: { contratos: 2, fontesComFalha: ['Compras.gov.br'] } });
    expect(d.sincronizarContratos).not.toHaveBeenCalled();
  });

  it('dry de atas: conta as atas da janela de vigência', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'atas', uasg: '200331', dry: true }, d);
    expect(r).toMatchObject({ dry: true, consulta: { atas: 3 } });
    expect(vi.mocked(d.fetchArpsDasFontes).mock.calls[0][0]).toMatchObject({ codigoUnidadeGerenciadora: '200331', numeroAtaRegistroPreco: '' });
    expect(d.sincronizarAtas).not.toHaveBeenCalled();
  });

  it('dry de saldos: não consulta nada', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'saldos_itens', dry: true }, d);
    expect(r.dry).toBe(true);
    expect(d.sincronizarSaldosItens).not.toHaveBeenCalled();
  });
});

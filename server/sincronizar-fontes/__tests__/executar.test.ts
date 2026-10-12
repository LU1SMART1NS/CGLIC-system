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
    sincronizarItensContratos: vi.fn(async () => sucesso(11)),
    contarItensContratosPendentes: vi.fn(async () => ({ contratos: 40, pendentes: 12 })),
    sincronizarUnidadesItens: vi.fn(async () => sucesso(17)),
    contarUnidadesItensPendentes: vi.fn(async () => ({ itens: 657, pendentes: 200 })),
    sincronizarAtasParticipacao: vi.fn(async () => sucesso(19)),
    testarAtasParticipacao: vi.fn(async () => ({ compras: 18, antigas: 0, pendentes: 18, lidas: 18, adiadas: 0, atasDaCompra: 26, participante: 14, adesao: 5, semSenasp: 7, itensSemResposta: 0, falhas: 0, atas: [] })),
    sincronizarEmpenhosDaCarteira: vi.fn(async () => sucesso(9)),
    consultarEmpenhosDeTeste: vi.fn(async () => ({ carteira: 10, elegiveis: 6, amostra: '200331-00296-2026', empenhosDaAmostra: 1 })),
    sincronizarFaturasDaCarteira: vi.fn(async () => sucesso(13)),
    sincronizarOrdensBancariasDaCarteira: vi.fn(async () => sucesso(15)),
    consultarFaturasDeTeste: vi.fn(async () => ({ elegiveis: 6, faturas: 14, np: '2025NP000545', ordensBancarias: 1 })),
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
    [{ recurso: 'itens_contratos' }, /UASG inválida/],
    [{ recurso: 'unidades_itens', uasg: '123456' }, /UASG inválida/],
    ['texto', /Corpo/],
    [undefined, /Corpo/]
  ])('recusa %j', (corpo, erro) => {
    const r = validarPedido(corpo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(erro);
  });
});

describe('recursos faturas e ordens_bancarias', () => {
  it('exigem UASG da CGLIC', () => {
    expect(validarPedido({ recurso: 'faturas', uasg: '200331' })).toMatchObject({ ok: true });
    expect(validarPedido({ recurso: 'ordens_bancarias' })).toMatchObject({ ok: false });
  });

  it('chamam a sincronização da carteira com o orçamento de tempo', async () => {
    const d = deps();
    await executarPedido({ recurso: 'faturas', uasg: '200331' }, d);
    await executarPedido({ recurso: 'ordens_bancarias', uasg: '200330', forcar: true }, d);
    expect(d.sincronizarFaturasDaCarteira).toHaveBeenCalledWith('200331', { forcar: undefined, orcamentoMs: 100_000 });
    expect(d.sincronizarOrdensBancariasDaCarteira).toHaveBeenCalledWith('200330', { forcar: true, orcamentoMs: 100_000 });
  });

  it('dry: só consulta, sem gravar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'ordens_bancarias', uasg: '200331', dry: true }, d);
    expect(d.sincronizarOrdensBancariasDaCarteira).not.toHaveBeenCalled();
    expect(r).toMatchObject({ dry: true, consulta: { np: '2025NP000545', ordensBancarias: 1 } });
  });
});

describe('recurso empenhos', () => {
  it('exige UASG da CGLIC', () => {
    expect(validarPedido({ recurso: 'empenhos', uasg: '200330' })).toMatchObject({ ok: true, pedido: { recurso: 'empenhos', uasg: '200330' } });
    expect(validarPedido({ recurso: 'empenhos' })).toMatchObject({ ok: false });
  });

  it('sincroniza a carteira da UASG com o orçamento de tempo do servidor', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'empenhos', uasg: '200330', forcar: true }, d);
    expect(d.sincronizarEmpenhosDaCarteira).toHaveBeenCalledWith('200330', { forcar: true, orcamentoMs: 100_000 });
    expect(r).toMatchObject({ dry: false, recurso: 'empenhos', resultado: { status: 'SUCESSO', total: 9 } });
  });

  it('dry: só consulta, sem gravar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'empenhos', uasg: '200331', dry: true }, d);
    expect(d.sincronizarEmpenhosDaCarteira).not.toHaveBeenCalled();
    expect(r).toMatchObject({ dry: true, consulta: { elegiveis: 6, empenhosDaAmostra: 1 } });
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

  it('itens dos contratos: chama a sincronização da UASG com orçamento de tempo', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'itens_contratos', uasg: '200330', forcar: true }, d);
    expect(d.sincronizarItensContratos).toHaveBeenCalledWith('200330', { forcar: true, orcamentoMs: 100_000 });
    expect(r).toMatchObject({ dry: false, recurso: 'itens_contratos', resultado: { status: 'SUCESSO', total: 11 } });
  });

  it('dry dos itens dos contratos: só conta a fila de leitura; não sincroniza', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'itens_contratos', uasg: '200331', dry: true }, d);
    expect(d.contarItensContratosPendentes).toHaveBeenCalledWith('200331');
    expect(r).toMatchObject({ dry: true, consulta: { contratos: 40, pendentes: 12 } });
    expect(d.sincronizarItensContratos).not.toHaveBeenCalled();
  });

  it('órgãos dos itens: chama a sincronização da UASG com orçamento de tempo', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'unidades_itens', uasg: '200331' }, d);
    expect(d.sincronizarUnidadesItens).toHaveBeenCalledWith('200331', { forcar: undefined, orcamentoMs: 100_000 });
    expect(r).toMatchObject({ dry: false, recurso: 'unidades_itens', resultado: { status: 'SUCESSO', total: 17 } });
  });

  it('dry dos órgãos dos itens: só conta a fila de leitura; não sincroniza', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'unidades_itens', uasg: '200331', dry: true }, d);
    expect(d.contarUnidadesItensPendentes).toHaveBeenCalledWith('200331');
    expect(r).toMatchObject({ dry: true, consulta: { itens: 657, pendentes: 200 } });
    expect(d.sincronizarUnidadesItens).not.toHaveBeenCalled();
  });

  it('atas em que a SENASP participa: chama a sincronização da UASG com orçamento de tempo', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'atas_participacao', uasg: '200331' }, d);
    expect(d.sincronizarAtasParticipacao).toHaveBeenCalledWith('200331', { forcar: undefined, orcamentoMs: 75_000 });
    expect(r).toMatchObject({ dry: false, recurso: 'atas_participacao', resultado: { status: 'SUCESSO', total: 19 } });
  });

  it('dry das atas em que a SENASP participa: faz a descoberta sem gravar; não sincroniza', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'atas_participacao', uasg: '200331', dry: true }, d);
    expect(d.testarAtasParticipacao).toHaveBeenCalledWith('200331', { orcamentoMs: 75_000 });
    expect(r).toMatchObject({ dry: true, consulta: { participante: 14, adesao: 5 } });
    expect(d.sincronizarAtasParticipacao).not.toHaveBeenCalled();
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

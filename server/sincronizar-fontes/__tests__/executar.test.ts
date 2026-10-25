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
    sincronizarContratosParticipantes: vi.fn(async () => sucesso(21)),
    contarContratosParticipantesPendentes: vi.fn(async () => ({ orgaos: 184, pendentes: 184 })),
    sincronizarCadastroUasgs: vi.fn(async () => sucesso(23)),
    contarCadastroUasgsPendentes: vi.fn(async () => ({ pendentes: 260, amostra: null })),
    sincronizarItensNotasSiafi: vi.fn(async () => sucesso(25)),
    contarItensNotasSiafiPendentes: vi.fn(async () => ({ pendentes: 416, amostra: null })),
    sincronizarSaldoContabil: vi.fn(async (): Promise<ResultadoSincronizacao> => ({ status: 'SUCESSO', total: 10, fontesComFalha: [], mensagem: '10 de 10 conta(s) lida(s)' })),
    contarSaldoContabilPendentes: vi.fn(async () => ({ leituras: 10, anosFechados: 0, amostraPagoNoAno: 22 })),
    sincronizarAutoresEmendas: vi.fn(async () => sucesso(27)),
    contarAutoresEmendas: vi.fn(async () => ({ legislatura: 57, deputados: 648, deputadosNoCargo: 513, senadores: 126, senadoresNoCargo: 81 })),
    sincronizarReajusteAtas: vi.fn(async () => sucesso(29)),
    contarReajusteAtasPendentes: vi.fn(async () => ({ pendentes: 149, semEdital: 64, mesesProjetados: 25 })),
    sincronizarNotasDasEmendasDoTesouro: vi.fn(async () => sucesso(181)),
    contarNotasEmendasTesouroPendentes: vi.fn(async () => ({ pendentes: 198, amostra: '2026NE000043', amostraUgs: [] })),
    medirEmendasDoPortal: vi.fn(async () => ({ ano2026: { emendas: 12 } })),
    chaveDoPortal: () => 'chave-de-teste',
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

  it('contratos dos participantes: chama a sincronização da UASG com orçamento de tempo', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'contratos_participantes', uasg: '200331' }, d);
    expect(d.sincronizarContratosParticipantes).toHaveBeenCalledWith('200331', { forcar: undefined, orcamentoMs: 100_000 });
    expect(r).toMatchObject({ dry: false, recurso: 'contratos_participantes', resultado: { status: 'SUCESSO', total: 21 } });
  });

  it('dry dos contratos dos participantes: só conta a fila; não sincroniza', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'contratos_participantes', uasg: '200330', dry: true }, d);
    expect(d.contarContratosParticipantesPendentes).toHaveBeenCalledWith('200330');
    expect(r).toMatchObject({ dry: true, consulta: { orgaos: 184, pendentes: 184 } });
    expect(d.sincronizarContratosParticipantes).not.toHaveBeenCalled();
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

  it('itens_notas_siafi: por UG emitente, com a chave do servidor', async () => {
    expect(validarPedido({ recurso: 'itens_notas_siafi' })).toMatchObject({ ok: false });
    expect(validarPedido({ recurso: 'itens_notas_siafi', uasg: '200330' })).toMatchObject({ ok: true });
    const d = deps();
    const r = await executarPedido({ recurso: 'itens_notas_siafi', uasg: '200330' }, d);
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 25 } });
    expect(vi.mocked(d.sincronizarItensNotasSiafi).mock.calls[0]).toEqual(['200330', expect.objectContaining({ chave: 'chave-de-teste' })]);
    const dry = await executarPedido({ recurso: 'itens_notas_siafi', uasg: '200331', dry: true }, d);
    expect(dry).toMatchObject({ dry: true, consulta: { pendentes: 416 } });
    expect(vi.mocked(d.contarItensNotasSiafiPendentes).mock.calls[0]).toEqual(['200331', 'chave-de-teste']);
  });

  it('saldo_contabil: por UG, com orçamento de tempo; teste sem gravar conta as leituras', async () => {
    expect(validarPedido({ recurso: 'saldo_contabil' })).toMatchObject({ ok: false });
    expect(validarPedido({ recurso: 'saldo_contabil', uasg: '200331' })).toMatchObject({ ok: true });
    const d = deps();
    const r = await executarPedido({ recurso: 'saldo_contabil', uasg: '200331', forcar: true }, d);
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 10 } });
    expect(vi.mocked(d.sincronizarSaldoContabil).mock.calls[0]).toEqual(['200331', expect.objectContaining({ forcar: true, orcamentoMs: expect.any(Number) })]);
    const dry = await executarPedido({ recurso: 'saldo_contabil', uasg: '200330', dry: true }, d);
    expect(dry).toMatchObject({ dry: true, consulta: { leituras: 10, amostraPagoNoAno: 22 } });
    expect(d.sincronizarSaldoContabil).toHaveBeenCalledTimes(1);
  });

  it('cadastro_uasgs: vale para todas as carteiras, sem UASG', async () => {
    expect(validarPedido({ recurso: 'cadastro_uasgs' })).toMatchObject({ ok: true, pedido: { recurso: 'cadastro_uasgs' } });
    const d = deps();
    const r = await executarPedido({ recurso: 'cadastro_uasgs', forcar: true }, d);
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 23 } });
    expect(vi.mocked(d.sincronizarCadastroUasgs).mock.calls[0][0]).toMatchObject({ forcar: true });
    const dry = await executarPedido({ recurso: 'cadastro_uasgs', dry: true }, d);
    expect(dry).toMatchObject({ dry: true, consulta: { pendentes: 260 } });
    expect(d.sincronizarCadastroUasgs).toHaveBeenCalledTimes(1);
  });
});

describe('autores das emendas', () => {
  it('vale para todas as carteiras (sem UASG) e executa a leitura de Câmara e Senado', async () => {
    const v = validarPedido({ recurso: 'autores_emendas' });
    expect(v).toMatchObject({ ok: true, pedido: { recurso: 'autores_emendas' } });
    const d = deps();
    const r = await executarPedido({ recurso: 'autores_emendas', forcar: true, dry: false }, d);
    expect(d.sincronizarAutoresEmendas).toHaveBeenCalledWith({ forcar: true });
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 27 } });
  });

  it('no teste (dry) só conta, sem gravar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'autores_emendas', forcar: false, dry: true }, d);
    expect(d.sincronizarAutoresEmendas).not.toHaveBeenCalled();
    expect(r).toMatchObject({ dry: true, consulta: { deputados: 648, senadores: 126 } });
  });
});

describe('reajuste das atas', () => {
  it('vale para as duas carteiras (sem UASG) e lê com o leitor de PDF do servidor', async () => {
    expect(validarPedido({ recurso: 'reajuste_atas' })).toMatchObject({ ok: true, pedido: { recurso: 'reajuste_atas' } });
    const d = deps();
    const r = await executarPedido({ recurso: 'reajuste_atas', forcar: true, dry: false }, d);
    expect(d.sincronizarReajusteAtas).toHaveBeenCalledWith(expect.objectContaining({ forcar: true, orcamentoMs: expect.any(Number), leitor: expect.objectContaining({ textoDoPdf: expect.any(Function), arquivosDoZip: expect.any(Function) }) }));
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 29 } });
  });

  it('no teste (dry) só conta a fila e lê os índices, sem gravar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'reajuste_atas', forcar: false, dry: true }, d);
    expect(d.sincronizarReajusteAtas).not.toHaveBeenCalled();
    expect(r).toMatchObject({ dry: true, consulta: { pendentes: 149 } });
  });
});

describe('notas das emendas pelo Tesouro', () => {
  it('vale para as duas UGs (sem UASG) e grava com o orçamento de tempo', async () => {
    expect(validarPedido({ recurso: 'notas_emendas_tesouro' })).toMatchObject({ ok: true, pedido: { recurso: 'notas_emendas_tesouro' } });
    const d = deps();
    const r = await executarPedido({ recurso: 'notas_emendas_tesouro', forcar: true, dry: false }, d);
    // A chave do Portal vai junto: as notas que o Tesouro não descreve são procuradas lá (migration 192).
    expect(d.sincronizarNotasDasEmendasDoTesouro).toHaveBeenCalledWith({ forcar: true, orcamentoMs: expect.any(Number), chave: 'chave-de-teste' });
    expect(r).toMatchObject({ dry: false, resultado: { status: 'SUCESSO', total: 181 } });
  });

  it('no teste (dry) só conta a fila e consulta uma nota, sem gravar', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'notas_emendas_tesouro', forcar: false, dry: true }, d);
    expect(d.sincronizarNotasDasEmendasDoTesouro).not.toHaveBeenCalled();
    expect(d.contarNotasEmendasTesouroPendentes).toHaveBeenCalledWith('chave-de-teste');
    expect(r).toMatchObject({ dry: true, consulta: { pendentes: 198 } });
  });
});

describe('medição das emendas do Portal', () => {
  it('só em modo de teste: mede com a chave do servidor e não grava', async () => {
    const d = deps();
    const r = await executarPedido({ recurso: 'emendas_portal', forcar: false, dry: true }, d);
    expect(d.medirEmendasDoPortal).toHaveBeenCalledWith(expect.objectContaining({ chave: 'chave-de-teste' }));
    expect(r).toMatchObject({ dry: true, consulta: { ano2026: { emendas: 12 } } });
  });

  it('fora do modo de teste recusa', async () => {
    const r = await executarPedido({ recurso: 'emendas_portal', forcar: false, dry: false }, deps());
    expect(r).toMatchObject({ dry: false, resultado: { status: 'ERRO' } });
  });
});

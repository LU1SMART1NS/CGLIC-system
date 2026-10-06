import { describe, it, expect, vi } from 'vitest';
import { atualizarNoServidor, mensagemDoErroDaFuncao, ESPERA_PARA_COMECAR_MS, ESPERA_MAXIMA_MS, INTERVALO_DA_ESPERA_MS } from '../sincronizacaoNoServidorService';
import { mensagemDaEspera } from '../../hooks/useAtualizacaoNoServidor';
import type { SincronizacaoFonteStatus } from '../sincronizacaoFontesService';

vi.mock('../supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false, ehServidor: false }));

const linha = (uasg: string, ultimaTentativaEm: string | null, emAndamento = false): SincronizacaoFonteStatus => ({
  recurso: 'contratos', uasg, emAndamentoDesde: emAndamento ? '2026-10-06T20:00:00Z' : null, ultimaTentativaEm,
  ultimoSucessoEm: null, ultimoStatus: null, fontesComFalha: [], totalRegistros: null, mensagem: null
});

/** Dependências falsas: o relógio só anda quando o código "espera"; cada leitura da situação vem da fila. */
function montar(leituras: SincronizacaoFonteStatus[][], pedir = vi.fn(async () => undefined)) {
  let t = 0;
  const fila = [...leituras];
  const lerSituacao = vi.fn(async () => (fila.length > 1 ? fila.shift()! : fila[0]));
  return {
    pedir,
    lerSituacao,
    deps: { esperar: async (ms: number) => { t += ms; }, lerSituacao, pedir, agora: () => t }
  };
}

describe('atualizarNoServidor', () => {
  it('pede a atualização de cada UASG e conclui quando a tentativa mudou e não há execução em andamento', async () => {
    const { deps, pedir } = montar([
      [linha('200330', 'T1'), linha('200331', 'T1')],                       // antes do pedido
      [linha('200330', 'T2', true), linha('200331', 'T1')],                 // uma começou
      [linha('200330', 'T2'), linha('200331', 'T2', true)],                 // a primeira terminou, a outra rodando
      [linha('200330', 'T2'), linha('200331', 'T2')]                        // as duas terminaram
    ]);
    const r = await atualizarNoServidor('contratos', ['200330', '200331'], deps);
    expect(r).toEqual({ concluiu: true });
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(pedir).toHaveBeenCalledWith('contratos', '200330');
    expect(pedir).toHaveBeenCalledWith('contratos', '200331');
  });

  it('execução que começa e termina entre duas leituras também conclui', async () => {
    const { deps } = montar([[linha('200331', 'T1')], [linha('200331', 'T2')]]);
    expect(await atualizarNoServidor('contratos', ['200331'], deps)).toEqual({ concluiu: true });
  });

  it('primeira vez (sem linha antes): conclui quando a linha aparece pronta', async () => {
    const { deps } = montar([[], [linha('000000', 'T1')]]);
    expect(await atualizarNoServidor('saldos_itens', ['000000'], deps)).toEqual({ concluiu: true });
  });

  it('nada começou (trava com outra execução ou pedido não reservado): para de esperar em 30 s, sem concluir', async () => {
    const { deps, lerSituacao } = montar([[linha('200331', 'T1')]]);
    const r = await atualizarNoServidor('contratos', ['200331'], deps);
    expect(r).toEqual({ concluiu: false, motivo: 'nao-iniciou' });
    // 1 leitura antes do pedido + uma a cada 3 s até 30 s
    expect(lerSituacao.mock.calls.length).toBe(1 + Math.ceil(ESPERA_PARA_COMECAR_MS / INTERVALO_DA_ESPERA_MS));
  });

  it('execução que não termina: para no limite total, sem concluir', async () => {
    const { deps } = montar([[linha('200331', 'T1')], [linha('200331', 'T2', true)]]);
    const r = await atualizarNoServidor('contratos', ['200331'], deps);
    expect(r).toEqual({ concluiu: false, motivo: 'tempo' });
    expect(ESPERA_MAXIMA_MS).toBeGreaterThan(ESPERA_PARA_COMECAR_MS);
  });

  it('pedido recusado pela função: o erro sobe e não fica esperando', async () => {
    const pedir = vi.fn(async () => { throw new Error('Só o coordenador pode atualizar os dados com as fontes oficiais.'); });
    const { deps, lerSituacao } = montar([[linha('200331', 'T1')]], pedir);
    await expect(atualizarNoServidor('contratos', ['200331'], deps)).rejects.toThrow('Só o coordenador');
    expect(lerSituacao).toHaveBeenCalledTimes(1);
  });
});

describe('mensagemDoErroDaFuncao', () => {
  it('403: só o coordenador; 401: sessão expirada', async () => {
    expect(await mensagemDoErroDaFuncao({ context: new Response('{}', { status: 403 }) })).toMatch(/Só o coordenador/);
    expect(await mensagemDoErroDaFuncao({ context: new Response('{}', { status: 401 }) })).toMatch(/Sessão expirada/);
  });
  it('outro erro com corpo JSON: usa a mensagem da função', async () => {
    const r = new Response(JSON.stringify({ erro: 'UASG inválida. Use: 200330, 200331.' }), { status: 400 });
    expect(await mensagemDoErroDaFuncao({ context: r })).toBe('UASG inválida. Use: 200330, 200331.');
  });
  it('corpo que não é JSON: mensagem genérica com o status', async () => {
    expect(await mensagemDoErroDaFuncao({ context: new Response('<html>', { status: 502 }) })).toMatch(/respondeu 502/);
  });
  it('falha de rede: mensagem legível', async () => {
    expect(await mensagemDoErroDaFuncao(new TypeError('Failed to fetch'))).toMatch(/Sem conexão com o servidor/);
  });
});

describe('mensagemDaEspera', () => {
  it('concluiu: sem aviso', () => expect(mensagemDaEspera({ concluiu: true })).toBeNull());
  it('não iniciou: explica que já havia atualização ou os dados eram recentes', () =>
    expect(mensagemDaEspera({ concluiu: false, motivo: 'nao-iniciou' })).toMatch(/em andamento|acabaram de ser atualizados/));
  it('tempo: diz que continua no servidor', () =>
    expect(mensagemDaEspera({ concluiu: false, motivo: 'tempo' })).toMatch(/continua no servidor/));
});

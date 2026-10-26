/**
 * Execução de cada emenda dos pedidos pelo Portal da Transparência (migration 204): o empenhado, o liquidado e o pago
 * da emenda inteira, de qualquer UG, para a conta da sobra (valor no SIOP − empenhado − em andamento).
 *
 * O servidor pergunta /emendas?codigoEmenda=<ano + nº> de cada emenda com número e ano nos pedidos (do ano corrente e
 * do anterior; emendas_a_ler_no_portal) e grava por gravar_execucao_emendas_portal. O Portal só lista a emenda depois
 * que ela tem execução: sem resposta, a emenda fica como não encontrada e a tela usa as notas ligadas no sistema.
 * Uma vez por dia (cron 'sincronizar-execucao-emendas'); a chave do Portal fica só no servidor.
 */
import { supabase } from './supabaseClient';
import { criarConsultorDoPortal, type ConsultorDoPortal } from './itensNotasSiafiSyncService';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, mensagemDeErro, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';

export const RECURSO_EXECUCAO_EMENDAS = 'execucao_emendas' as const;
export const FONTE_EXECUCAO_EMENDAS = 'Execução das emendas (Portal da Transparência)';
/** O cron chama uma vez por dia; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_EXECUCAO_EMENDAS = '20 hours';
export const ORCAMENTO_EXECUCAO_EMENDAS_MS = 100_000;
const BASE_EMENDAS = '/api-transparencia/api-de-dados';

/** O que vai para gravar_execucao_emendas_portal. */
export interface ExecucaoDaEmenda {
  codigo: string;
  encontrada: boolean;
  valor_empenhado: number | null;
  valor_liquidado: number | null;
  valor_pago: number | null;
  autor: string | null;
}

/** "1.234.567,89" (Portal) ou número → número; vazio → null. */
export function valorDoPortal(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Pergunta a emenda ao Portal. Lança se o Portal falhar: a emenda fica para a próxima execução. */
export async function consultarExecucaoDaEmenda(codigo: string, consultar: ConsultorDoPortal): Promise<ExecucaoDaEmenda> {
  const lista = await consultar(`/emendas?codigoEmenda=${codigo}&pagina=1`);
  const e = (Array.isArray(lista) ? (lista as Array<Record<string, unknown>>) : []).find((x) => String(x.codigoEmenda ?? '').trim() === codigo);
  if (!e) return { codigo, encontrada: false, valor_empenhado: null, valor_liquidado: null, valor_pago: null, autor: null };
  const autor = String(e.nomeAutor ?? e.autor ?? '').trim();
  return {
    codigo,
    encontrada: true,
    valor_empenhado: valorDoPortal(e.valorEmpenhado),
    valor_liquidado: valorDoPortal(e.valorLiquidado),
    valor_pago: valorDoPortal(e.valorPago),
    autor: autor || null
  };
}

async function emendasALer(): Promise<string[]> {
  const { data, error } = await supabase!.rpc('emendas_a_ler_no_portal');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as Array<{ codigo: string }>).map((l) => String(l.codigo));
}

async function gravar(emendas: ExecucaoDaEmenda[]): Promise<number> {
  if (!emendas.length) return 0;
  const { data, error } = await supabase!.rpc('gravar_execucao_emendas_portal', { p_emendas: emendas });
  if (error) throw mapPostgresErrorToAppError(error);
  return Number(data ?? 0);
}

/** Teste sem gravar: quantas emendas estão na fila e a resposta do Portal para a primeira. */
export async function contarExecucaoEmendasPendentes(chave?: string): Promise<Record<string, unknown>> {
  const fila = await emendasALer();
  const amostra = chave && fila[0] ? await consultarExecucaoDaEmenda(fila[0], criarConsultorDoPortal({ chave, base: BASE_EMENDAS })) : null;
  return { emendas: fila.length, amostra, semChave: !chave };
}

export async function sincronizarExecucaoDasEmendas(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; chave?: string; fetcher?: typeof fetch; esperar?: (ms: number) => Promise<void> } = {}
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_EXECUCAO_EMENDAS_MS;
  return executarComReserva(RECURSO_EXECUCAO_EMENDAS, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_EXECUCAO_EMENDAS }, async () => {
    if (!opts.chave) {
      return { status: 'ERRO', erro: 'Falta a chave do Portal da Transparência no servidor (PORTAL_TRANSPARENCIA_CHAVE).' };
    }
    const inicio = agora();
    const fila = await emendasALer();
    if (!fila.length) return { status: 'SUCESSO', total: 0, fontesComFalha: [], mensagem: 'Nenhuma emenda com número e ano nos pedidos.' };
    const consultar = criarConsultorDoPortal({ chave: opts.chave, fetcher: opts.fetcher, esperar: opts.esperar, base: BASE_EMENDAS });
    const erros: string[] = [];
    let lote: ExecucaoDaEmenda[] = [];
    let gravadas = 0;
    let feitas = 0;
    let naoEncontradas = 0;
    // Grava de 20 em 20: o que já foi lido fica se o tempo da função acabar.
    const descarregar = async () => {
      const agoraVai = lote;
      lote = [];
      try {
        gravadas += await gravar(agoraVai);
      } catch (err) {
        erros.push(`gravação: ${mensagemDeErro(err)}`);
      }
    };
    for (const codigo of fila) {
      if (agora() - inicio > orcamento) break;
      feitas++;
      try {
        const e = await consultarExecucaoDaEmenda(codigo, consultar);
        if (!e.encontrada) naoEncontradas++;
        lote.push(e);
        if (lote.length >= 20) await descarregar();
      } catch (err) {
        erros.push(`${codigo}: ${mensagemDeErro(err)}`);
      }
    }
    await descarregar();
    const pendentes = fila.length - feitas;
    const partes = [`${feitas} de ${fila.length} emenda(s) consultada(s) no Portal da Transparência, ${gravadas} gravada(s)`];
    if (naoEncontradas) partes.push(`${naoEncontradas} ainda sem execução no Portal`);
    if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
    if (pendentes) partes.push(`o tempo da execução acabou e ${pendentes} ficam para a próxima`);
    const mensagem = `${partes.join(', ')}.`;
    return erros.length || pendentes
      ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [FONTE_EXECUCAO_EMENDAS], mensagem }
      : { status: 'SUCESSO', total: gravadas, fontesComFalha: [], mensagem };
  });
}

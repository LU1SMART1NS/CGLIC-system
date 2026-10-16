/**
 * Saldo contábil do SIAFI por empenho, lido da API aberta do Tesouro (STA) e gravado em empenho_saldo_contabil
 * (migration 128). Roda no servidor, sob a trava do banco (recurso 'saldo_contabil', uma execução por UG).
 *
 * O ano corrente é lido em toda execução (o Tesouro atualiza uma vez por dia). Os anos fechados são lidos uma vez:
 * de novo só se a última leitura foi antes de fevereiro do ano seguinte, quando o ano fecha de vez no SIAFI.
 * Estudo: docs/estudos/saldo-contabil-tesouro.md.
 */
import { supabase } from './supabaseClient';
import { fetchSaldoContabil } from './api';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, mensagemDeErro, type ResultadoSincronizacao } from './sincronizacaoFontesService';

export const RECURSO_SALDO_CONTABIL = 'saldo_contabil' as const;
export const FONTE_SALDO_CONTABIL = 'Saldo contábil (Tesouro, STA)';
/** O cron chama de 6 em 6 horas; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_SALDO_CONTABIL = '5 hours';
/** Primeiro ano lido: o empenho mais antigo do sistema é de 2016. */
export const ANO_INICIAL_SALDO_CONTABIL = 2016;
export const ORCAMENTO_SALDO_CONTABIL_MS = 100_000;
/**
 * Contas lidas ao mesmo tempo. Do servidor, cada consulta ao Tesouro levou de 2 a 60 s na primeira execução
 * (14/10/2026), e uma por vez só cabiam 3 a 5 contas no orçamento; a carga inicial tem 110 por UG.
 */
export const CONCORRENCIA_SALDO_CONTABIL = 4;

/** Contas de controle da execução da despesa (exercício e restos a pagar). */
export const CONTAS_SALDO_CONTABIL = [
  '622920101', // exercício: a liquidar
  '622920102', // exercício: em liquidação
  '622920103', // exercício: liquidado a pagar
  '622920104', // exercício: pago
  '631100000', // RP não processados: a liquidar
  '631200000', // RP não processados: em liquidação
  '631300000', // RP não processados: liquidado a pagar
  '631400000', // RP não processados: pago
  '632100000', // RP processados: a pagar
  '632200000' // RP processados: pago
] as const;

export interface LinhaSaldoContabil {
  conta_corrente: string;
  saldo: number;
  debito_mensal: number;
  credito_mensal: number;
  atualizado_tesouro: string | null;
}

const numero = (v: unknown): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

/** Linha do Tesouro no formato da gravação. Null quando a conta corrente não é empenho + subitem. */
export function normalizarLinhaSaldo(raw: any): LinhaSaldoContabil | null {
  const cc = String(raw?.conta_corrente ?? '').trim().toUpperCase();
  if (!/^\d{4}NE\d{8}$/.test(cc)) return null;
  const quando = String(raw?.created_at ?? '').trim();
  return {
    conta_corrente: cc,
    saldo: numero(raw?.saldo),
    debito_mensal: numero(raw?.debito_mensal),
    credito_mensal: numero(raw?.credito_mensal),
    atualizado_tesouro: /^\d{4}-\d{2}-\d{2}/.test(quando) ? quando : null
  };
}

export interface LeituraPlanejada {
  ano: number;
  conta: string;
}

/**
 * O que ler nesta execução: o ano corrente inteiro e, dos anos fechados, cada conta ainda não lida ou lida antes
 * de fevereiro do ano seguinte (o SIAFI ainda acerta o ano nos primeiros dias de janeiro).
 */
export function planejarLeituras(cargas: Array<{ ano: number; conta: string; carregado_em: string }>, anoAtual: number): LeituraPlanejada[] {
  const lido = new Map(cargas.map((c) => [`${c.ano}|${c.conta}`, c.carregado_em]));
  const plano: LeituraPlanejada[] = CONTAS_SALDO_CONTABIL.map((conta) => ({ ano: anoAtual, conta }));
  for (let ano = anoAtual - 1; ano >= ANO_INICIAL_SALDO_CONTABIL; ano--) {
    const fechadoEm = `${ano + 1}-02-01`;
    for (const conta of CONTAS_SALDO_CONTABIL) {
      const quando = lido.get(`${ano}|${conta}`);
      if (!quando || quando.slice(0, 10) < fechadoEm) plano.push({ ano, conta });
    }
  }
  return plano;
}

async function lerCargas(ug: string): Promise<Array<{ ano: number; conta: string; carregado_em: string }>> {
  const { data, error } = await supabase!.from('saldo_contabil_cargas').select('ano, conta, carregado_em').eq('ug', ug);
  if (error) throw mapPostgresErrorToAppError(error);
  return (data ?? []) as any;
}

/** Espera entre a gravação que estourou o limite de tempo do banco e a nova tentativa. */
export const ESPERA_NOVA_TENTATIVA_MS = 3_000;

async function gravar(
  ug: string,
  ano: number,
  conta: string,
  linhas: LinhaSaldoContabil[],
  esperar: (ms: number) => Promise<void>
): Promise<{ gravadas: number; bloqueada: boolean }> {
  for (let tentativa = 1; ; tentativa++) {
    const { data, error } = await supabase!.rpc('gravar_saldo_contabil', { p_ug: ug, p_ano: ano, p_conta: conta, p_linhas: linhas });
    if (!error) return { gravadas: Number((data as any)?.gravadas ?? 0), bloqueada: Boolean((data as any)?.bloqueada) };
    // O limite da API do banco é de 8 s; com o banco carregado, uma conta grande pode passar dele (14/10/2026).
    if (tentativa === 1 && /statement timeout/i.test(String(error.message ?? ''))) {
      await esperar(ESPERA_NOVA_TENTATIVA_MS);
      continue;
    }
    throw mapPostgresErrorToAppError(error);
  }
}

/** Teste sem gravar: o que seria lido e uma consulta de amostra (conta de pago do ano corrente). */
export async function contarSaldoContabilPendentes(ug: string, agora: () => number = () => Date.now()): Promise<Record<string, unknown>> {
  const anoAtual = new Date(agora()).getUTCFullYear();
  const plano = planejarLeituras(await lerCargas(ug), anoAtual);
  const amostra = (await fetchSaldoContabil(anoAtual, ug, '622920104')).map(normalizarLinhaSaldo).filter(Boolean);
  return { leituras: plano.length, anosFechados: plano.filter((p) => p.ano < anoAtual).length, amostraPagoNoAno: amostra.length };
}

export async function sincronizarSaldoContabil(
  ug: string,
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; concorrencia?: number; esperar?: (ms: number) => Promise<void> } = {}
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_SALDO_CONTABIL_MS;
  const esperar = opts.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return executarComReserva(RECURSO_SALDO_CONTABIL, ug, { forcar: opts.forcar, validade: VALIDADE_SALDO_CONTABIL }, async () => {
    const inicio = agora();
    const anoAtual = new Date(inicio).getUTCFullYear();
    const plano = planejarLeituras(await lerCargas(ug), anoAtual);

    let lidas = 0;
    let linhas = 0;
    let bloqueadas = 0;
    let proxima = 0;
    const erros: string[] = [];
    // As consultas ao Tesouro correm em paralelo; as gravações, uma por vez, para não sobrecarregar o banco.
    let filaDeGravacao: Promise<unknown> = Promise.resolve();
    const gravarNaVez = (ano: number, conta: string, lista: LinhaSaldoContabil[]) => {
      const vez = filaDeGravacao.then(() => gravar(ug, ano, conta, lista, esperar));
      filaDeGravacao = vez.catch(() => undefined);
      return vez;
    };
    // Vários trabalhadores pegam a próxima conta da fila; cada um para quando o orçamento de tempo acaba.
    // Não somar na mesma linha do await (`x += await f()`): com trabalhadores em paralelo, perde somas.
    const trabalhador = async () => {
      while (proxima < plano.length) {
        if (agora() - inicio > orcamento) return;
        const { ano, conta } = plano[proxima++];
        try {
          const lista = (await fetchSaldoContabil(ano, ug, conta)).map(normalizarLinhaSaldo).filter((l): l is LinhaSaldoContabil => l !== null);
          const r = await gravarNaVez(ano, conta, lista);
          lidas++;
          linhas += r.gravadas;
          if (r.bloqueada) bloqueadas++;
        } catch (err) {
          erros.push(`${conta}/${ano}: ${mensagemDeErro(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concorrencia ?? CONCORRENCIA_SALDO_CONTABIL) }, trabalhador));
    const pendentes = plano.length - proxima;

    const partes = [`${lidas} de ${plano.length} conta(s) lida(s)`, `${linhas} linha(s) gravada(s)`];
    if (bloqueadas) partes.push(`${bloqueadas} conta(s) vieram vazias ou incompletas e o saldo anterior foi mantido`);
    if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
    if (pendentes) partes.push(`o tempo da execução acabou e ${pendentes} conta(s) ficam para a próxima`);
    const mensagem = `${partes.join(', ')}.`;
    return erros.length || pendentes || bloqueadas
      ? { status: 'PARCIAL', total: lidas, fontesComFalha: [FONTE_SALDO_CONTABIL], mensagem }
      : { status: 'SUCESSO', total: lidas, fontesComFalha: [], mensagem };
  });
}

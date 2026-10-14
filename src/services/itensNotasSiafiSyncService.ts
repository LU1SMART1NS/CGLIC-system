/**
 * Itens de cada nota de empenho no SIAFI, lidos no Portal da Transparência (migration 120), em segundo plano
 * e sob a trava do banco (recurso 'itens_notas_siafi', uma execução por UG emitente).
 *
 * O portal exige chave (cabeçalho chave-api-dados), que fica só no servidor (PORTAL_TRANSPARENCIA_CHAVE).
 * Para cada nota: /despesas/itens-de-empenho (uma linha por item, "Item compra: 00032 - …") e o histórico
 * de cada linha (inclusão, reforço, anulação, inscrição em RP) com quantidade e preço. O resultado líquido
 * de cada linha vai ao banco, que decide o vínculo da nota aos itens do contrato (gravar_leituras_siafi).
 *
 * Fatos medidos em 14/10/2026 (735 notas):
 * - o código do documento usa a gestão 00001; com a gestão 30911 do Contratos.gov.br a resposta vem vazia;
 * - nas notas inscritas em restos a pagar, o histórico repete operações idênticas (a soma dos itens prova
 *   que é repetição): operação igual a outra já vista (data, tipo, quantidade, preço e total) é descartada;
 * - "INSCRICAO EM RP" não muda a quantidade nem o valor.
 * Falha de rede ou da fonte não grava nada: a nota volta na próxima execução.
 */
import { supabase } from './supabaseClient';
import {
  executarComReserva,
  mensagemDeErro,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';

export const RECURSO_ITENS_NOTAS_SIAFI = 'itens_notas_siafi' as const;
export const FONTE_PORTAL_TRANSPARENCIA = 'Portal da Transparência (SIAFI)';

/** Tempo máximo consultando o portal numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_ITENS_NOTAS_SIAFI_MS = 100_000;

const BASE = '/api-transparencia/api-de-dados/despesas';
/** O portal limita a 90 consultas por minuto de dia: uma a cada 0,7 s dá cerca de 85. */
const PAUSA_ENTRE_CONSULTAS_MS = 700;
const TAMANHO_DA_PAGINA = 15;
const MAX_PAGINAS = 20;
const TENTATIVAS = 3;
const LOTE_GRAVACAO = 10;
const FALHAS_SEGUIDAS_PARA_PARAR = 5;

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A chave foi recusada pelo portal (401 ou 403): não adianta seguir. */
export class ChaveRecusadaError extends Error {
  constructor(status: number) {
    super(`O Portal da Transparência recusou a chave (HTTP ${status}). Confira PORTAL_TRANSPARENCIA_CHAVE.`);
    this.name = 'ChaveRecusadaError';
  }
}

/** "1.145,21" → 1145.21; vazio ou ilegível → null. */
export function numeroBR(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const n = Number(valor.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "Item compra: 00032 - HALTERE …" → { numero: 32, descricao: 'HALTERE …' }. */
export function itemDaDescricao(descricao: unknown): { numero: number | null; descricao: string } {
  const texto = typeof descricao === 'string' ? descricao.trim() : '';
  const m = /^Item compra:\s*0*(\d+)\s*-?\s*(.*)$/is.exec(texto);
  if (!m) return { numero: null, descricao: texto };
  return { numero: Number(m[1]), descricao: m[2].trim() };
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Efeito de cada operação do histórico na quantidade e no valor da linha. */
const SINAL: Record<string, number> = {
  INCLUSAO: 1,
  REFORCO: 1,
  ANULACAO: -1,
  CANCELAMENTO: -1,
  'INSCRICAO EM RP': 0
};

export interface OperacaoDoHistorico {
  data?: string;
  operacao?: string;
  quantidade?: string;
  valorUnitario?: string;
  valorTotal?: string;
}

export interface LinhaConsolidada {
  quantidade: number;
  valorTotal: number;
  valorUnitario: number | null;
  /** Operações idênticas a outra já vista, descartadas. */
  repetidas: number;
  /** Operações com nome desconhecido (não contam). */
  desconhecidas: string[];
}

/** Soma líquida do histórico de uma linha, sem as operações repetidas. */
export function consolidarHistorico(operacoes: OperacaoDoHistorico[]): LinhaConsolidada {
  const vistas = new Set<string>();
  let quantidade = 0;
  let valorTotal = 0;
  let valorUnitario: number | null = null;
  let repetidas = 0;
  const desconhecidas: string[] = [];
  for (const op of operacoes) {
    const chave = [op.data, op.operacao, op.quantidade, op.valorUnitario, op.valorTotal].join('|');
    if (vistas.has(chave)) {
      repetidas++;
      continue;
    }
    vistas.add(chave);
    const nome = semAcento(String(op.operacao ?? ''));
    const sinal = SINAL[nome];
    if (sinal === undefined) {
      desconhecidas.push(String(op.operacao ?? ''));
      continue;
    }
    if (sinal === 0) continue;
    quantidade += sinal * Math.abs(numeroBR(op.quantidade) ?? 0);
    valorTotal += sinal * Math.abs(numeroBR(op.valorTotal) ?? 0);
    const pu = numeroBR(op.valorUnitario);
    if (valorUnitario === null && pu !== null && pu > 0) valorUnitario = pu;
  }
  const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
  return { quantidade: arred(quantidade, 4), valorTotal: arred(valorTotal, 2), valorUnitario, repetidas, desconhecidas };
}

/** UG + gestão 00001 + número da nota (ex.: 200330000012026NE000410). */
export const codigoDoDocumento = (uasg: string, numero: string) => `${uasg}00001${numero.trim().toUpperCase()}`;

export interface LinhaDaNota {
  sequencial: number;
  numero_item: number | null;
  descricao: string;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number;
}

export interface LeituraDaNota {
  empenho_id?: string;
  codigo_documento: string;
  situacao: 'LIDA' | 'SEM_LINHAS';
  total_siafi: number;
  linhas: LinhaDaNota[];
}

export interface ContextoDoPortal {
  chave: string;
  fetcher?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Pausa antes de cada consulta (ritmo do portal). */
  pausaMs?: number;
}

export type ConsultorDoPortal = (caminho: string) => Promise<unknown>;

/**
 * Cria o consultor do portal: ritmo (uma pausa antes de cada consulta, menos a primeira), novas tentativas
 * e chave recusada. Use um só por execução, para o ritmo valer entre uma nota e outra.
 */
export function criarConsultorDoPortal(ctx: ContextoDoPortal): ConsultorDoPortal {
  const fetcher = ctx.fetcher ?? fetch;
  const esperar = ctx.esperar ?? dormir;
  const pausa = ctx.pausaMs ?? PAUSA_ENTRE_CONSULTAS_MS;
  let primeira = true;
  return async function consultar(caminho: string): Promise<unknown> {
    let ultimoErro: unknown = null;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      if (!primeira) await esperar(pausa);
      primeira = false;
      let resposta: Response;
      try {
        resposta = await fetcher(`${BASE}${caminho}`, { headers: { 'chave-api-dados': ctx.chave, accept: 'application/json' } });
      } catch (err) {
        ultimoErro = err;
        await esperar(5_000 * tentativa);
        continue;
      }
      if (resposta.status === 401 || resposta.status === 403) throw new ChaveRecusadaError(resposta.status);
      if (resposta.ok) return resposta.json();
      ultimoErro = new Error(`Portal da Transparência respondeu ${resposta.status}.`);
      if (resposta.status === 429) {
        await esperar(20_000 * tentativa);
        continue;
      }
      if (resposta.status >= 500) {
        await esperar(5_000 * tentativa);
        continue;
      }
      break;
    }
    throw ultimoErro;
  };
}

async function paginas(consultar: ConsultorDoPortal, caminho: string): Promise<Array<Record<string, unknown>>> {
  const todas: Array<Record<string, unknown>> = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const dados = await consultar(`${caminho}&pagina=${pagina}`);
    if (!Array.isArray(dados)) throw new Error('Portal da Transparência devolveu um formato inesperado.');
    todas.push(...(dados as Array<Record<string, unknown>>));
    if (dados.length < TAMANHO_DA_PAGINA) break;
  }
  return todas;
}

/** Lê uma nota no portal: as linhas e o histórico de cada uma, já consolidados. Lança em falha da fonte. */
export async function lerNotaNoSiafi(codigo: string, ctx: ContextoDoPortal | ConsultorDoPortal): Promise<LeituraDaNota> {
  const consultar = typeof ctx === 'function' ? ctx : criarConsultorDoPortal(ctx);
  const linhas = await paginas(consultar, `/itens-de-empenho?codigoDocumento=${encodeURIComponent(codigo)}`);
  const resultado: LinhaDaNota[] = [];
  for (const linha of linhas) {
    const sequencial = Number(linha.sequencial);
    if (!Number.isInteger(sequencial)) continue;
    const historico = await paginas(
      consultar,
      `/itens-de-empenho/historico?codigoDocumento=${encodeURIComponent(codigo)}&sequencial=${sequencial}`
    );
    const c = consolidarHistorico(historico as OperacaoDoHistorico[]);
    const item = itemDaDescricao(linha.descricao);
    resultado.push({
      sequencial,
      numero_item: item.numero,
      descricao: item.descricao.slice(0, 500),
      quantidade: c.quantidade,
      valor_unitario: c.valorUnitario,
      valor_total: c.valorTotal
    });
  }
  const total = Math.round(resultado.reduce((s, l) => s + l.valor_total, 0) * 100) / 100;
  return { codigo_documento: codigo, situacao: resultado.length > 0 ? 'LIDA' : 'SEM_LINHAS', total_siafi: total, linhas: resultado };
}

interface NotaParaLer {
  empenho_id: string;
  numero_oficial: string;
  uasg_emitente: string;
}

async function notasParaLer(uasg: string): Promise<NotaParaLer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('notas_para_ler_no_siafi', { p_uasg: uasg, p_limite: 500 });
  if (error) throw error;
  return (data ?? []) as NotaParaLer[];
}

async function gravar(lote: LeituraDaNota[]): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_leituras_siafi', { p_leituras: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

const SEM_CHAVE = 'A chave da API do Portal da Transparência não está configurada no servidor (PORTAL_TRANSPARENCIA_CHAVE).';

/** Quantas notas da UG estão na fila e a leitura da primeira (modo de teste do servidor; não grava nada). */
export async function contarItensNotasSiafiPendentes(
  uasg: string,
  chave: string | undefined
): Promise<{ pendentes: number; amostra: { numero: string; situacao: string; linhas: number; total: number } | null; erro?: string }> {
  const fila = await notasParaLer(uasg);
  if (!chave) return { pendentes: fila.length, amostra: null, erro: SEM_CHAVE };
  if (!fila[0]) return { pendentes: 0, amostra: null };
  const leitura = await lerNotaNoSiafi(codigoDoDocumento(fila[0].uasg_emitente, fila[0].numero_oficial), { chave });
  return { pendentes: fila.length, amostra: { numero: fila[0].numero_oficial, situacao: leitura.situacao, linhas: leitura.linhas.length, total: leitura.total_siafi } };
}

export async function sincronizarItensNotasSiafi(
  uasg: string,
  opts: {
    chave: string | undefined;
    forcar?: boolean;
    orcamentoMs?: number;
    agora?: () => number;
    esperar?: (ms: number) => Promise<void>;
    fetcher?: typeof fetch;
  }
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_ITENS_NOTAS_SIAFI_MS;

  return executarComReserva(RECURSO_ITENS_NOTAS_SIAFI, uasg, { forcar: opts.forcar, validade: VALIDADE_PADRAO }, async () => {
    if (!opts.chave) return { status: 'ERRO', erro: SEM_CHAVE };
    const inicio = agora();
    const fila = await notasParaLer(uasg);
    const consultar = criarConsultorDoPortal({ chave: opts.chave, fetcher: opts.fetcher, esperar: opts.esperar });

    let gravadas = 0;
    let falhas = 0;
    let seguidas = 0;
    let pendentes = 0;
    let primeiroErro: string | null = null;
    let lote: LeituraDaNota[] = [];

    for (let i = 0; i < fila.length; i++) {
      if (agora() - inicio > orcamento) {
        pendentes = fila.length - i;
        break;
      }
      const nota = fila[i];
      try {
        const leitura = await lerNotaNoSiafi(codigoDoDocumento(nota.uasg_emitente, nota.numero_oficial), consultar);
        lote.push({ ...leitura, empenho_id: nota.empenho_id });
        seguidas = 0;
      } catch (err) {
        if (err instanceof ChaveRecusadaError) {
          gravadas += await gravar(lote);
          return { status: 'ERRO', erro: err.message };
        }
        falhas++;
        seguidas++;
        primeiroErro ??= mensagemDeErro(err);
        console.warn(`[itensNotasSiafi] nota ${nota.numero_oficial} não pôde ser lida:`, mensagemDeErro(err));
        if (seguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
          pendentes = fila.length - i - 1;
          break;
        }
      }
      if (lote.length >= LOTE_GRAVACAO) {
        gravadas += await gravar(lote);
        lote = [];
      }
    }
    gravadas += await gravar(lote);

    const problemas: string[] = [];
    if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'nota não pôde ser lida' : 'notas não puderam ser lidas'} (${primeiroErro})`);
    if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'nota ficou' : 'notas ficaram'} para a próxima execução`);
    return problemas.length > 0
      ? { status: 'PARCIAL', total: gravadas, fontesComFalha: falhas > 0 ? [FONTE_PORTAL_TRANSPARENCIA] : [], mensagem: `${problemas.join(' e ')}.` }
      : { status: 'SUCESSO', total: gravadas, fontesComFalha: [] };
  });
}

/**
 * Contratos dos órgãos participantes das atas da SENASP (participantes_contratos_itens, migration 109), em
 * segundo plano e sob a trava do banco (recurso 'contratos_participantes', por UASG gerenciadora).
 *
 * Para cada UASG participante (fila em v_participantes_contratos_fila), lê no Contratos.gov.br a lista de
 * contratos ativos (`/contrato/ug/{uasg}`) e a de encerrados (`/contrato/inativo/ug/{uasg}`): uma nota de
 * empenho usada como contrato encerra em dezembro e continua tendo consumido a ata. O contrato entra no item
 * quando a compra (unidade + número/ano da licitação), o fornecedor e o número do item batem com a ata; aí
 * os itens do contrato (`/contrato/{id}/itens`) dão a quantidade. A gravação nunca apaga um contrato.
 *
 * Incremental: lê o órgão nunca lido e o lido há mais de 24 horas, um por vez e dentro de um orçamento de
 * tempo; o que não couber fica para a próxima execução (PARCIAL). Se uma das listas falhar, o órgão não é
 * gravado e volta na próxima.
 */
import { supabase } from './supabaseClient';
import { executarComReserva, mensagemDeErro, VALIDADE_PADRAO, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { parseMoneyValue } from './balanceService';

export const RECURSO_CONTRATOS_PARTICIPANTES = 'contratos_participantes' as const;
export const FONTE_CONTRATOS_PARTICIPANTES = 'Contratos dos órgãos participantes';

/** Tempo máximo consultando as fontes numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_CONTRATOS_PARTICIPANTES_MS = 100_000;
/** Cada chamada ao Contratos.gov.br (o proxy do servidor corta em 30 s). */
const TEMPO_LIMITE_MS = 28_000;
const RELEITURA_MS = 24 * 60 * 60 * 1000;
const LOTE_GRAVACAO = 10;
const UASGS_SENASP = new Set(['200330', '200331']);

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// ------------------------------------------------------------------------------
// Regras puras (testáveis sem rede)
// ------------------------------------------------------------------------------

/** "90025/2025", "90025", ano "2025" → "90025/2025"; nula quando não dá para montar. */
export function chaveDaCompra(numero: unknown, ano?: unknown): string | null {
  const bruto = String(numero ?? '').trim();
  const comBarra = bruto.match(/^0*(\d{1,5})\s*\/\s*(\d{4})$/);
  if (comBarra) return `${comBarra[1].padStart(5, '0')}/${comBarra[2]}`;
  const anoTxt = digitos(ano);
  let num = digitos(bruto);
  if (!num || anoTxt.length !== 4) return null;
  if (num.length > 5 && num.endsWith(anoTxt)) num = num.slice(0, -4);
  if (num.length > 5) return null;
  return `${num.padStart(5, '0')}/${anoTxt}`;
}

export interface AtaDaUasg {
  numeroAta: string;
  uasg: string;
  numeroCompra: string | null;
  anoCompra: string | null;
  itens: Array<{ numeroItem: string | number; fornecedorCnpj: string | null }>;
}

interface AtaIndexada {
  fornecedores: Set<string>;
  /** número do item (inteiro) → item_key */
  itens: Map<number, string>;
}

/** Índice "uasg|nnnnn/aaaa" → atas da compra, com fornecedores e itens. */
export function indexarCompras(atas: AtaDaUasg[]): Map<string, AtaIndexada[]> {
  const indice = new Map<string, AtaIndexada[]>();
  for (const a of atas) {
    const compra = chaveDaCompra(a.numeroCompra, a.anoCompra);
    if (!compra) continue;
    const chave = `${digitos(a.uasg)}|${compra}`;
    const itens = new Map<number, string>();
    const fornecedores = new Set<string>();
    for (const i of a.itens) {
      const n = parseInt(String(i.numeroItem), 10);
      if (!Number.isFinite(n)) continue;
      itens.set(n, `${a.numeroAta}-${a.uasg}-${String(n).padStart(5, '0')}`);
      const cnpj = digitos(i.fornecedorCnpj);
      if (cnpj) fornecedores.add(cnpj);
    }
    if (itens.size === 0) continue;
    indice.set(chave, [...(indice.get(chave) ?? []), { fornecedores, itens }]);
  }
  return indice;
}

/** Atas da mesma compra e do mesmo fornecedor do contrato; vazio quando o contrato não é de compra da SENASP. */
export function atasDoContrato(contrato: any, indice: Map<string, AtaIndexada[]>): AtaIndexada[] {
  const compra = chaveDaCompra(contrato?.licitacao_numero);
  if (!compra) return [];
  const atas = indice.get(`${digitos(contrato?.unidade_compra)}|${compra}`) ?? [];
  const cnpj = digitos(contrato?.fornecedor?.cnpj_cpf_idgener ?? contrato?.fornecedor?.cnpj_cpf);
  if (!cnpj) return [];
  return atas.filter((a) => a.fornecedores.has(cnpj));
}

export interface LinhaContratoParticipante {
  item_key: string;
  contrato_id: string;
  numero: string | null;
  tipo: string | null;
  situacao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_global: number | null;
  vigencia_fim: string | null;
}

const numeroOuNulo = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseMoneyValue(v as any);
  return Number.isFinite(n) ? n : null;
};
const textoOuNulo = (v: unknown, max = 40): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t.slice(0, max) : null;
};

/** Linhas do contrato nos itens das atas: uma por item do contrato que existe numa das atas. */
export function linhasDoContrato(contrato: any, itensLidos: any[], atas: AtaIndexada[]): LinhaContratoParticipante[] {
  const porItem = new Map<string, LinhaContratoParticipante>();
  for (const it of itensLidos) {
    const n = parseInt(String(it?.numero_item_compra ?? ''), 10);
    if (!Number.isFinite(n)) continue;
    const itemKey = atas.map((a) => a.itens.get(n)).find(Boolean);
    if (!itemKey) continue;
    const quantidade = numeroOuNulo(it?.quantidade);
    const anterior = porItem.get(itemKey);
    if (anterior) {
      // O mesmo item em duas linhas do contrato: soma as quantidades.
      anterior.quantidade = (anterior.quantidade ?? 0) + (quantidade ?? 0);
      continue;
    }
    porItem.set(itemKey, {
      item_key: itemKey,
      contrato_id: String(contrato.id),
      numero: textoOuNulo(contrato.numero),
      tipo: textoOuNulo(contrato.tipo),
      situacao: textoOuNulo(contrato.situacao),
      quantidade,
      valor_unitario: numeroOuNulo(it?.valorunitario),
      valor_global: numeroOuNulo(contrato.valor_global),
      vigencia_fim: typeof contrato.vigencia_fim === 'string' && /^\d{4}-\d{2}-\d{2}/.test(contrato.vigencia_fim) ? contrato.vigencia_fim.slice(0, 10) : null
    });
  }
  return [...porItem.values()];
}

export interface OrgaoNaFila {
  uasg: string;
  lidoEm: string | null;
}

/** Órgãos a ler: nunca lidos primeiro, depois os mais antigos; só os lidos há mais de 24 h (salvo forçar). */
export function orgaosParaLer(fila: OrgaoNaFila[], opts: { agora: number; forcar?: boolean }): string[] {
  return fila
    .filter((o) => !UASGS_SENASP.has(o.uasg))
    .filter((o) => opts.forcar || !o.lidoEm || opts.agora - Date.parse(o.lidoEm) > RELEITURA_MS)
    .sort((a, b) => (a.lidoEm ? Date.parse(a.lidoEm) : 0) - (b.lidoEm ? Date.parse(b.lidoEm) : 0))
    .map((o) => o.uasg);
}

// ------------------------------------------------------------------------------
// Fontes e banco
// ------------------------------------------------------------------------------

async function getJson(url: string): Promise<any> {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(url, { signal: controle.signal });
    if (!res.ok) throw new Error(`Contratos.gov.br respondeu ${res.status} em ${url}.`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export interface FontesContratosParticipantes {
  lista: (uasg: string) => Promise<any[]>;
  encerrados: (uasg: string) => Promise<any[]>;
  itens: (contratoId: string) => Promise<any[]>;
}

const comoLista = (v: unknown): any[] => {
  if (Array.isArray(v)) return v;
  throw new Error('O Contratos.gov.br devolveu um formato inesperado.');
};

export const FONTES_PADRAO: FontesContratosParticipantes = {
  lista: async (uasg) => comoLista(await getJson(`/api-contratos-gov/api/contrato/ug/${uasg}`)),
  encerrados: async (uasg) => comoLista(await getJson(`/api-contratos-gov/api/contrato/inativo/ug/${uasg}`)),
  itens: async (id) => comoLista(await getJson(`/api-contratos-gov/api/contrato/${id}/itens`))
};

async function fetchAtasDaUasg(uasg: string): Promise<AtaDaUasg[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('atas_registro_preco')
    .select('numero_ata, codigo_uasg, numero_compra, ano_compra, itens_ata(numero_item, fornecedor_cnpj_cpf)')
    .eq('codigo_uasg', uasg);
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    numeroAta: a.numero_ata,
    uasg: a.codigo_uasg,
    numeroCompra: a.numero_compra ?? null,
    anoCompra: a.ano_compra ?? null,
    itens: (a.itens_ata ?? []).map((i: any) => ({ numeroItem: i.numero_item, fornecedorCnpj: i.fornecedor_cnpj_cpf ?? null }))
  }));
}

async function fetchFila(uasg: string): Promise<OrgaoNaFila[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('v_participantes_contratos_fila')
    .select('uasg, lido_em')
    .eq('uasg_gerenciadora', uasg);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ uasg: String(r.uasg), lidoEm: r.lido_em ?? null }));
}

export interface LeituraDoOrgao {
  uasg: string;
  contratos_na_ug: number;
  linhas: LinhaContratoParticipante[];
}

/** Lê um órgão: as duas listas, os contratos de compras da SENASP e os itens deles. Lança se uma lista falhar. */
export async function lerOrgao(
  participante: string,
  indice: Map<string, AtaIndexada[]>,
  fontes: FontesContratosParticipantes = FONTES_PADRAO
): Promise<LeituraDoOrgao> {
  const [ativos, encerrados] = await Promise.all([fontes.lista(participante), fontes.encerrados(participante)]);
  const vistos = new Set<string>();
  const linhas: LinhaContratoParticipante[] = [];
  for (const c of [...ativos, ...encerrados]) {
    const id = String(c?.id ?? '');
    if (!/^\d+$/.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    const atas = atasDoContrato(c, indice);
    if (atas.length === 0) continue;
    linhas.push(...linhasDoContrato(c, await fontes.itens(id), atas));
  }
  return { uasg: participante, contratos_na_ug: vistos.size, linhas };
}

async function gravar(uasg: string, lote: LeituraDoOrgao[]): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_contratos_participantes', { p_uasg: uasg, p_leituras: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Quantos órgãos estão na fila de leitura (modo de teste do servidor; não grava nada). */
export async function contarContratosParticipantesPendentes(uasg: string, agora: number = Date.now()): Promise<{ orgaos: number; pendentes: number }> {
  const fila = await fetchFila((uasg || '').trim());
  return { orgaos: fila.length, pendentes: orgaosParaLer(fila, { agora }).length };
}

export async function sincronizarContratosParticipantes(
  uasg: string,
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; fontes?: FontesContratosParticipantes } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_CONTRATOS_PARTICIPANTES_MS;

  return executarComReserva(
    RECURSO_CONTRATOS_PARTICIPANTES,
    cleanUasg,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      const inicio = agora();
      const indice = indexarCompras(await fetchAtasDaUasg(cleanUasg));
      const fila = orgaosParaLer(await fetchFila(cleanUasg), { agora: inicio, forcar: opts.forcar });

      let gravados = 0;
      let falhas = 0;
      let pendentes = 0;
      let lote: LeituraDoOrgao[] = [];
      for (let i = 0; i < fila.length; i++) {
        if (agora() - inicio > orcamento) {
          pendentes = fila.length - i;
          break;
        }
        try {
          lote.push(await lerOrgao(fila[i], indice, opts.fontes));
        } catch (err) {
          falhas++;
          console.warn(`[contratosParticipantes] contratos da UASG ${fila[i]} não puderam ser lidos:`, mensagemDeErro(err));
        }
        if (lote.length >= LOTE_GRAVACAO) {
          gravados += await gravar(cleanUasg, lote);
          lote = [];
        }
      }
      gravados += await gravar(cleanUasg, lote);

      const problemas: string[] = [];
      if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'órgão não teve os contratos lidos' : 'órgãos não tiveram os contratos lidos'}`);
      if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'órgão ficou' : 'órgãos ficaram'} para a próxima execução`);
      return problemas.length > 0
        ? { status: 'PARCIAL', total: gravados, fontesComFalha: falhas > 0 ? [FONTE_CONTRATOS_PARTICIPANTES] : [], mensagem: `${problemas.join(' e ')}.` }
        : { status: 'SUCESSO', total: gravados, fontesComFalha: [] };
    }
  );
}

/**
 * Faturas dos contratos (Contratos.gov.br) e ordens bancárias das NPs (Tesouro, STA): normalização,
 * gravação (migration 83) e sincronização por carteira, sob a trava do banco (recursos 'faturas' e
 * 'ordens_bancarias' em sincronizacao_fontes). Roda no servidor (Edge Function sincronizar-fontes).
 *
 * Regras que saem dos dados (06/10/2026):
 * - 27% das NPs juntam faturas de mais de um contrato: o valor da OB não é atribuível a um contrato; o
 *   "pago" do contrato é a soma das faturas dele cuja NP tem OB válida (v_contrato_faturas_resumo).
 * - OB cancelada vem com cancelamentoob = '1' e é reemitida com outro número.
 * - A fatura liga ao empenho pelo id do Contratos.gov.br (dados_empenho[].id_empenho =
 *   empenhos.identificador_fonte), que já traz a UASG emitente certa.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { fetchContratosGovFaturas, fetchOrdensBancariasDaNp } from './api';
import { parseMoneyValue } from './balanceService';
import { fetchContratosOficiaisDoBanco } from './contratosOficiaisService';
import { contratosComEmpenhoAPagar, selecionarContratos, RECONSULTA_HORAS } from './empenhosCarteiraService';
import { executarComReserva, mensagemDeErro, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { chaveDoContrato } from '../utils/contractKeyUtils';
import type { ContractDashboardRecord } from '../types';

export const RECURSO_FATURAS = 'faturas' as const;
export const RECURSO_ORDENS_BANCARIAS = 'ordens_bancarias' as const;
export const FONTE_FATURAS = 'Faturas dos contratos (Contratos.gov.br)';
export const FONTE_ORDENS_BANCARIAS = 'Ordens bancárias (Tesouro, STA)';
export const VALIDADE_FATURAS = '6 hours';
const PAGINA = 1000;
const NP_FORMATO = /^\d{4}NP\d{6}$/;

/**
 * NP real: formato ano+NP+6 dígitos e número diferente de zero. A fatura com "Siafi Erro" vem do Contratos.gov.br
 * com a NP zerada (ex.: 2026NP000000), que não é documento do SIAFI: se entrasse como NP, contratos diferentes
 * pareceriam pagos pela mesma nota e o Tesouro seria consultado à toa.
 */
export function npValida(np: string | null | undefined): boolean {
  return Boolean(np) && NP_FORMATO.test(np as string) && !/NP0{6}$/.test(np as string);
}

// -----------------------------------------------------------------------------------------------------
// Normalização
// -----------------------------------------------------------------------------------------------------

export interface FaturaParaGravar {
  id_fatura: number;
  contrato_id_gov: string | null;
  numero: string | null;
  tipo: string | null;
  emissao: string | null;
  vencimento: string | null;
  valor: number;
  glosa: number;
  valor_liquido: number;
  data_liquidacao: string | null;
  situacao: string | null;
  cancelada: boolean;
  np: string | null;
  ug_np: string | null;
  referencia: string | null;
  processo: string | null;
  empenhos: Array<{ id_empenho_gov: string; numero_empenho: string | null; valor: number }>;
}

const texto = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return t ? t : null;
};
const data = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};

/** Fatura do Contratos.gov.br no formato da RPC sync_contrato_faturas_atomic. Null se não tem id. */
export function normalizarFatura(raw: any, contratoIdGov?: string | number | null): FaturaParaGravar | null {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const np = String(raw?.sfadrao_id ?? '').trim().toUpperCase();
  const ug = String(raw?.contratante ?? '').match(/^\s*(\d{6})/)?.[1] ?? null;
  const situacao = texto(raw?.situacao);
  const referencias = Array.isArray(raw?.dados_referencia)
    ? raw.dados_referencia
        .map((r: any) => (r?.mesref && r?.anoref ? `${String(r.mesref).padStart(2, '0')}/${r.anoref}` : null))
        .filter(Boolean)
    : [];
  return {
    id_fatura: id,
    contrato_id_gov: contratoIdGov != null ? String(contratoIdGov) : texto(raw?.contrato_id),
    numero: texto(raw?.numero),
    tipo: texto(raw?.tipo_instrumento_cobranca),
    emissao: data(raw?.emissao),
    vencimento: data(raw?.vencimento),
    valor: parseMoneyValue(raw?.valor),
    glosa: parseMoneyValue(raw?.glosa),
    valor_liquido: parseMoneyValue(raw?.valorliquido),
    data_liquidacao: data(raw?.data_liquidacao),
    situacao,
    cancelada: String(raw?.nota_cancelada ?? '').trim().toLowerCase() === 'sim' || situacao === 'Siafi Cancelado',
    np: npValida(np) ? np : null,
    ug_np: ug,
    referencia: referencias.length > 0 ? [...new Set(referencias)].join(', ') : null,
    processo: texto(raw?.processo),
    empenhos: (Array.isArray(raw?.dados_empenho) ? raw.dados_empenho : [])
      .filter((d: any) => d?.id_empenho != null && String(d.id_empenho).trim() !== '')
      .map((d: any) => ({
        id_empenho_gov: String(d.id_empenho).trim(),
        numero_empenho: texto(d.numero_empenho),
        valor: parseMoneyValue(d.valor_empenho)
      }))
  };
}

/**
 * As duas UGs da CGLIC. A fatura só informa a UG contratante, mas a NP pode ter sido emitida (e paga) pela outra:
 * em 14/10/2026, 82 faturas (R$ 14,4 mi) tinham OB na outra UG citando o número delas.
 */
const UG_PAR: Record<string, string> = { '200330': '200331', '200331': '200330' };

/**
 * A observação da OB cita o número da fatura como palavra inteira ("NUM.(S): 72834, 73469, CONTRATO..."), separada
 * por espaço, vírgula, ponto e vírgula, dois-pontos ou ponto final. Entre parênteses costuma vir outro documento
 * ("CONTRATO Nº 99/2024 (32554104)"), por isso não conta. Número só de dígitos vale com ou sem zeros à esquerda,
 * dos dois lados: a fatura "000003007" é a "INVOICE 3007" da OB. Números com menos de 4 caracteres (sem contar
 * esses zeros) não contam: confundiriam com o número do contrato ou do ano. Mesma regra da função ob_cita_fatura
 * do banco (migrations 119 e 120), usada pela view para ligar a OB da outra UG à fatura.
 */
export function obCitaFatura(observacao: string | null | undefined, numero: string | null | undefined): boolean {
  const bruto = String(numero ?? '').trim().toUpperCase();
  const obs = String(observacao ?? '').toUpperCase();
  const soDigitos = /^\d+$/.test(bruto);
  const n = soDigitos ? bruto.replace(/^0+/, '') : bruto;
  if (n.length < 4 || !obs) return false;
  const escapado = (soDigitos ? '0*' : '') + n.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  return new RegExp(`(^|[\\s,;:])${escapado}($|[\\s,;:]|\\.(\\s|$))`).test(obs);
}

/**
 * NPs da UG que já têm pagamento gravado: OB válida na própria UG ou, na outra UG da CGLIC, OB válida da mesma NP
 * que cita o número de todas as faturas dela. O mesmo número de NP nas duas UGs pode ser documento distinto, por
 * isso a OB da outra UG só vale quando cita a fatura.
 */
export function npsComPagamento(
  faturas: Array<{ np: string | null; numero: string | null; cancelada: boolean }>,
  obsValidas: Array<{ ug: string; np: string; observacao: string | null }>,
  uasg: string
): Set<string> {
  const resultado = new Set(obsValidas.filter((o) => o.ug === uasg).map((o) => o.np));
  const par = UG_PAR[uasg];
  if (!par) return resultado;
  const textosDaOutra = new Map<string, string[]>();
  for (const o of obsValidas) {
    if (o.ug === par) textosDaOutra.set(o.np, [...(textosDaOutra.get(o.np) ?? []), o.observacao ?? '']);
  }
  const numerosPorNp = new Map<string, Array<string | null>>();
  for (const f of faturas) {
    if (f.np && !f.cancelada) numerosPorNp.set(f.np, [...(numerosPorNp.get(f.np) ?? []), f.numero]);
  }
  for (const [np, numeros] of numerosPorNp) {
    const textos = textosDaOutra.get(np);
    if (textos && numeros.every((n) => textos.some((t) => obCitaFatura(t, n)))) resultado.add(np);
  }
  return resultado;
}

export interface OrdemBancariaParaGravar {
  numero: string;
  gestao: string;
  emissao: string | null;
  valor: number;
  cancelada: boolean;
  ob_cancelamento: string | null;
  tipo_ob: string | null;
  favorecido_documento: string | null;
  favorecido_nome: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  processo: string | null;
  observacao: string | null;
  empenhos: string[];
}

/** OB do STA no formato da RPC gravar_ordens_bancarias. Null se o número não é de OB. */
export function normalizarOrdemBancaria(raw: any): OrdemBancariaParaGravar | null {
  const numero = String(raw?.numero ?? '').trim().toUpperCase();
  if (!/^\d{4}OB\d{6}$/.test(numero)) return null;
  return {
    numero,
    gestao: texto(raw?.gestao) ?? '00001',
    emissao: data(raw?.emissao),
    valor: parseMoneyValue(raw?.valor),
    cancelada: String(raw?.cancelamentoob ?? '0').trim() === '1',
    ob_cancelamento: texto(raw?.numeroobcancelamento),
    tipo_ob: texto(raw?.tipoob),
    favorecido_documento: texto(raw?.favorecidocodigo),
    favorecido_nome: texto(raw?.favorecidonome),
    banco: texto(raw?.banco),
    agencia: texto(raw?.agencia),
    conta: texto(raw?.conta),
    processo: texto(raw?.processo),
    observacao: texto(raw?.observacao),
    // "200331000012023NE000280" → "2023NE000280" (UG e gestão ficam na própria OB)
    empenhos: (Array.isArray(raw?.empenhos) ? raw.empenhos : [])
      .map((e: unknown) => String(e ?? '').trim().toUpperCase().match(/(\d{4}NE\d+)$/)?.[1])
      .filter((e: string | undefined): e is string => Boolean(e))
  };
}

// -----------------------------------------------------------------------------------------------------
// Gravação (RPCs da migration 83)
// -----------------------------------------------------------------------------------------------------

export interface ResultadoFaturasContrato {
  gravadas: number;
  removidas: number;
  remocao_bloqueada: number;
  /** Faturas que a fonte deixou de listar mas estão num ciclo de pagamento: ficam a conferir (migration 113). */
  a_conferir: number;
}

export async function gravarFaturasDoContrato(contractKey: string, faturas: FaturaParaGravar[]): Promise<ResultadoFaturasContrato | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: r, error } = await supabase.rpc('sync_contrato_faturas_atomic', {
    p_contract_key: contractKey,
    p_faturas: faturas,
    p_remover_ausentes: true
  });
  if (error) throw mapPostgresErrorToAppError(error);
  return { gravadas: Number(r?.gravadas ?? 0), removidas: Number(r?.removidas ?? 0), remocao_bloqueada: Number(r?.remocao_bloqueada ?? 0), a_conferir: Number(r?.a_conferir ?? 0) };
}

/**
 * Grava as OBs de uma NP. `registrarConsulta: false` (OBs achadas na outra UG) não marca a NP daquela UG como
 * consultada: o mesmo número lá pode ser outra NP, que precisa entrar na fila dela.
 */
export async function gravarOrdensBancarias(
  ug: string,
  np: string,
  ordens: OrdemBancariaParaGravar[],
  opts: { registrarConsulta?: boolean } = {}
): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const args: Record<string, unknown> = { p_ug: ug, p_np: np, p_ordens: ordens };
  if (opts.registrarConsulta === false) args.p_registrar_consulta = false;
  const { data: n, error } = await supabase.rpc('gravar_ordens_bancarias', args);
  if (error) throw mapPostgresErrorToAppError(error);
  return Number(n ?? 0);
}

// -----------------------------------------------------------------------------------------------------
// Sincronização por carteira
// -----------------------------------------------------------------------------------------------------

async function lerPaginado<T>(tabela: string, colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  const linhas: T[] = [];
  for (let from = 0; ; from += PAGINA) {
    let q = supabase!.from(tabela).select(colunas);
    if (filtro) q = filtro(q);
    const { data: d, error } = await q.range(from, from + PAGINA - 1);
    if (error) throw error;
    linhas.push(...((d ?? []) as T[]));
    if (!d || d.length < PAGINA) break;
  }
  return linhas;
}

export interface OpcoesSincronizacao {
  forcar?: boolean;
  orcamentoMs?: number;
  concorrencia?: number;
  agora?: () => number;
}

/** Executa `tarefa` para cada elemento da fila com concorrência, sem começar novos depois do orçamento. */
export async function processarComOrcamento<T>(
  fila: T[],
  tarefa: (item: T) => Promise<void>,
  opts: OpcoesSincronizacao = {}
): Promise<{ processados: number; adiados: number }> {
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  let proximo = 0;
  let processados = 0;
  const trabalhador = async () => {
    while (proximo < fila.length) {
      if (opts.orcamentoMs !== undefined && agora() - inicio > opts.orcamentoMs) return;
      const item = fila[proximo++];
      await tarefa(item);
      processados++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concorrencia ?? 4) }, trabalhador));
  return { processados, adiados: fila.length - processados };
}

/**
 * Ordem da fila de contratos: nunca sincronizados primeiro, depois do mais antigo; sem forçar, tira os
 * sincronizados há menos de RECONSULTA_HORAS.
 */
export function filaDeContratos(
  contratos: ContractDashboardRecord[],
  sincronizados: Map<string, string>,
  ctx: { agora: number; forcar?: boolean }
): ContractDashboardRecord[] {
  const limite = ctx.agora - RECONSULTA_HORAS * 3600_000;
  const quando = (c: ContractDashboardRecord) => {
    const t = sincronizados.get(chaveDoContrato(c));
    return t ? new Date(t).getTime() : -Infinity;
  };
  return contratos.filter((c) => ctx.forcar || quando(c) < limite).sort((a, b) => quando(a) - quando(b));
}

/** Sincroniza as faturas dos contratos da carteira da UASG (mesmo critério de inclusão dos empenhos). */
export async function sincronizarFaturasDaCarteira(uasg: string, opts: OpcoesSincronizacao = {}): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  return executarComReserva(RECURSO_FATURAS, uasg, { forcar: opts.forcar, validade: VALIDADE_FATURAS }, async () => {
    const [carteira, comEmpenhoAPagar, sinc] = await Promise.all([
      fetchContratosOficiaisDoBanco(uasg),
      contratosComEmpenhoAPagar(),
      lerPaginado<{ contract_key: string; sincronizado_em: string }>('contrato_faturas_sincronizacao', 'contract_key, sincronizado_em')
    ]);
    if (carteira.length === 0) {
      return { status: 'ERRO', erro: 'A carteira de contratos da UASG está vazia no banco: sincronize os contratos antes.' };
    }
    const elegiveis = selecionarContratos([carteira], {
      hoje: new Date(agora()).toISOString().slice(0, 10),
      comEmpenhoAPagar
    }).filter((c) => /^\d+$/.test(String(c.contratoId ?? '')));
    const fila = filaDeContratos(elegiveis, new Map(sinc.map((s) => [s.contract_key, s.sincronizado_em])), {
      agora: agora(),
      forcar: opts.forcar
    });

    let faturas = 0;
    let bloqueados = 0;
    const erros: string[] = [];
    const { processados, adiados } = await processarComOrcamento(
      fila,
      async (c) => {
        try {
          const brutas = await fetchContratosGovFaturas(c.contratoId as string | number);
          const lista = brutas.map((f) => normalizarFatura(f, c.contratoId)).filter((f): f is FaturaParaGravar => f !== null);
          const r = await gravarFaturasDoContrato(chaveDoContrato(c), lista);
          faturas += r?.gravadas ?? 0;
          if ((r?.remocao_bloqueada ?? 0) > 0) bloqueados++;
        } catch (err) {
          erros.push(`${c.numeroFormatado || c.id}: ${mensagemDeErro(err)}`);
        }
      },
      opts
    );

    const partes = [`${processados} de ${fila.length} contrato(s) consultado(s)`, `${faturas} fatura(s) gravada(s)`];
    if (bloqueados) partes.push(`${bloqueados} contrato(s) com lista vazia na fonte e faturas no banco (nada removido)`);
    if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
    if (adiados) partes.push(`o tempo da execução acabou e ${adiados} contrato(s) ficam para a próxima`);
    const mensagem = `${partes.join(', ')}.`;
    return erros.length || adiados || bloqueados
      ? { status: 'PARCIAL', total: processados, fontesComFalha: [FONTE_FATURAS], mensagem }
      : { status: 'SUCESSO', total: processados, fontesComFalha: [], mensagem };
  });
}

/**
 * NPs da UG que ainda não têm OB válida gravada, das nunca consultadas para as consultadas há mais
 * tempo; sem forçar, tira as consultadas há menos de RECONSULTA_HORAS.
 */
export function filaDeNps(
  faturas: Array<{ np: string | null; data_liquidacao: string | null; cancelada: boolean }>,
  comObValida: Set<string>,
  consultas: Map<string, string>,
  ctx: { agora: number; forcar?: boolean }
): string[] {
  const limite = ctx.agora - RECONSULTA_HORAS * 3600_000;
  const nps = new Set<string>();
  for (const f of faturas) {
    if (f.np && !f.cancelada && npValida(f.np) && !comObValida.has(f.np)) nps.add(f.np);
  }
  const quando = (np: string) => {
    const t = consultas.get(np);
    return t ? new Date(t).getTime() : -Infinity;
  };
  return [...nps].filter((np) => ctx.forcar || quando(np) < limite).sort((a, b) => quando(a) - quando(b) || b.localeCompare(a));
}

/**
 * Busca no Tesouro as OBs das NPs da UG que ainda não têm pagamento gravado. Quando a própria UG não tem OB
 * válida da NP, consulta a outra UG da CGLIC e grava só as OBs cuja observação cita uma fatura da NP.
 */
export async function sincronizarOrdensBancariasDaCarteira(uasg: string, opts: OpcoesSincronizacao = {}): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  return executarComReserva(RECURSO_ORDENS_BANCARIAS, uasg, { forcar: opts.forcar, validade: VALIDADE_FATURAS }, async () => {
    const [faturas, obs, consultas] = await Promise.all([
      lerPaginado<{ np: string | null; numero: string | null; data_liquidacao: string | null; cancelada: boolean }>(
        'contrato_faturas',
        'np, numero, data_liquidacao, cancelada',
        (q) => q.eq('ug_np', uasg).not('np', 'is', null)
      ),
      // As duas UGs: a OB da outra UG que cita as faturas da NP também conta como pagamento.
      lerPaginado<{ ug: string; np: string; observacao: string | null }>('ordens_bancarias', 'ug, np, observacao', (q) => q.eq('cancelada', false)),
      lerPaginado<{ np: string; consultado_em: string }>('np_consultas', 'np, consultado_em', (q) => q.eq('ug', uasg))
    ]);
    const fila = filaDeNps(faturas, npsComPagamento(faturas, obs, uasg), new Map(consultas.map((c) => [c.np, c.consultado_em])), {
      agora: agora(),
      forcar: opts.forcar
    });
    const numerosPorNp = new Map<string, string[]>();
    for (const f of faturas) {
      if (f.np && f.numero && !f.cancelada) numerosPorNp.set(f.np, [...(numerosPorNp.get(f.np) ?? []), f.numero]);
    }
    const par = UG_PAR[uasg];

    let comOb = 0;
    let naOutraUg = 0;
    let gravadas = 0;
    const erros: string[] = [];
    const { processados, adiados } = await processarComOrcamento(
      fila,
      async (np) => {
        try {
          const brutas = await fetchOrdensBancariasDaNp(uasg, np);
          const lista = brutas.map(normalizarOrdemBancaria).filter((o): o is OrdemBancariaParaGravar => o !== null);
          // Não somar na mesma linha do await: `x += await f()` lê x antes de esperar e, com várias NPs em
          // paralelo, sobrescreve as somas dos outros (06/10/2026: 309 contadas contra 386 gravadas).
          const gravadasDaNp = (await gravarOrdensBancarias(uasg, np, lista)) ?? 0;
          gravadas += gravadasDaNp;
          if (lista.some((o) => !o.cancelada)) {
            comOb++;
            return;
          }
          const numeros = numerosPorNp.get(np) ?? [];
          if (!par || numeros.length === 0) return;
          const daOutra = (await fetchOrdensBancariasDaNp(par, np))
            .map(normalizarOrdemBancaria)
            .filter((o): o is OrdemBancariaParaGravar => o !== null && !o.cancelada && numeros.some((n) => obCitaFatura(o.observacao, n)));
          if (daOutra.length === 0) return;
          const gravadasDaOutra = (await gravarOrdensBancarias(par, np, daOutra, { registrarConsulta: false })) ?? 0;
          gravadas += gravadasDaOutra;
          comOb++;
          naOutraUg++;
        } catch (err) {
          erros.push(`${np}: ${mensagemDeErro(err)}`);
        }
      },
      { concorrencia: 6, ...opts }
    );

    const partes = [`${processados} de ${fila.length} NP(s) consultada(s)`, `${comOb} com ordem bancária`, `${gravadas} OB(s) gravada(s)`];
    if (naOutraUg) partes.push(`${naOutraUg} paga(s) pela UG ${par}`);
    if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
    if (adiados) partes.push(`o tempo da execução acabou e ${adiados} NP(s) ficam para a próxima`);
    const mensagem = `${partes.join(', ')}.`;
    return erros.length || adiados
      ? { status: 'PARCIAL', total: processados, fontesComFalha: [FONTE_ORDENS_BANCARIAS], mensagem }
      : { status: 'SUCESSO', total: processados, fontesComFalha: [], mensagem };
  });
}

// -----------------------------------------------------------------------------------------------------
// Leitura para a tela
// -----------------------------------------------------------------------------------------------------

export interface FaturaDoContrato {
  idFatura: number;
  numero: string | null;
  referencia: string | null;
  emissao: string | null;
  valor: number;
  glosa: number;
  dataLiquidacao: string | null;
  situacao: string | null;
  cancelada: boolean;
  np: string | null;
  ordensBancarias: string | null;
  obEmissao: string | null;
  paga: boolean;
  npContratos: number;
  empenhos: string | null;
  empenhosSemVinculo: number;
  empenhosSemVinculoNumeros: string | null;
}

export interface ResumoFaturasContrato {
  faturas: number;
  valorFaturado: number;
  valorLiquidado: number;
  valorPago: number;
  liquidadasSemPagamento: number;
  faturasComNeSemVinculo: number;
  ultimaLiquidacao: string | null;
  ultimoPagamento: string | null;
}

export interface FaturasDoContrato {
  faturas: FaturaDoContrato[];
  resumo: ResumoFaturasContrato | null;
  /** Quando as faturas do contrato foram consultadas pela última vez; null se nunca. */
  sincronizadoEm: string | null;
}

/** Faturas, resumo e data da última consulta do contrato (views da migration 83). */
export async function fetchFaturasDoContrato(contractKey: string): Promise<FaturasDoContrato> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return { faturas: [], resumo: null, sincronizadoEm: null };
  const [lista, resumo, sinc] = await Promise.all([
    supabase.from('v_contrato_faturas').select('*').eq('contract_key', contractKey).order('data_liquidacao', { ascending: false, nullsFirst: true }),
    supabase.from('v_contrato_faturas_resumo').select('*').eq('contract_key', contractKey).maybeSingle(),
    supabase.from('contrato_faturas_sincronizacao').select('sincronizado_em').eq('contract_key', contractKey).maybeSingle()
  ]);
  if (lista.error) throw lista.error;
  if (resumo.error) throw resumo.error;
  const r = resumo.data as any;
  return {
    faturas: (lista.data ?? []).map((f: any) => ({
      idFatura: Number(f.id_fatura),
      numero: f.numero ?? null,
      referencia: f.referencia ?? null,
      emissao: f.emissao ?? null,
      valor: Number(f.valor ?? 0),
      glosa: Number(f.glosa ?? 0),
      dataLiquidacao: f.data_liquidacao ?? null,
      situacao: f.situacao ?? null,
      cancelada: Boolean(f.cancelada),
      np: f.np ?? null,
      ordensBancarias: f.ordens_bancarias ?? null,
      obEmissao: f.ob_emissao ?? null,
      paga: Boolean(f.paga),
      npContratos: Number(f.np_contratos ?? 0),
      empenhos: f.empenhos ?? null,
      empenhosSemVinculo: Number(f.empenhos_sem_vinculo ?? 0),
      empenhosSemVinculoNumeros: f.empenhos_sem_vinculo_numeros ?? null
    })),
    resumo: r
      ? {
          faturas: Number(r.faturas ?? 0),
          valorFaturado: Number(r.valor_faturado ?? 0),
          valorLiquidado: Number(r.valor_liquidado ?? 0),
          valorPago: Number(r.valor_pago ?? 0),
          liquidadasSemPagamento: Number(r.liquidadas_sem_pagamento ?? 0),
          faturasComNeSemVinculo: Number(r.faturas_com_ne_sem_vinculo ?? 0),
          ultimaLiquidacao: r.ultima_liquidacao ?? null,
          ultimoPagamento: r.ultimo_pagamento ?? null
        }
      : null,
    sincronizadoEm: (sinc.data as any)?.sincronizado_em ?? null
  };
}

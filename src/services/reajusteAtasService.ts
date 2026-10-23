/**
 * Reajuste dos preços registrados nas atas (migrations 158 e 159): leitura para a Ata 360 e o Início, e as
 * gravações do gestor da ata (Termo de Conformidade e percentual de um reajuste).
 *
 * A conta fica no banco (reajuste_ciclos_ata, reajuste_itens_ata, v_ata_reajuste_resumo); a tela só soma o impacto
 * em R$ com o saldo que já tem. Sem as migrations aplicadas, as leituras voltam vazias e a tela segue sem a aba.
 *
 * Regras aprovadas pelo usuário (23/10/2026): data-base no Termo de Conformidade da pesquisa de preços; IPCA do mês
 * do termo até o mês anterior ao aniversário; o reajuste vale na assinatura da ata, se o aniversário já passou, ou na
 * prorrogação; os seguintes contam um ano dos efeitos do anterior.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ConflitoEdicaoError, erroDeConflito } from '../utils/conflitoEdicao';

export type SituacaoCiclo = 'APLICADO' | 'PUBLICADO_SEM_PERCENTUAL' | 'DEVIDO' | 'PREVISTO' | 'SE_PRORROGAR';
export type SituacaoItemReajuste =
  | 'SEM_REAJUSTE'
  | 'SEM_BASE'
  | 'PERCENTUAL_A_INFORMAR'
  | 'INDICE_INDISPONIVEL'
  | 'PRECO_DESATUALIZADO'
  | 'DEVIDO'
  | 'PREVISTO'
  | 'SE_PRORROGAR'
  | 'EM_DIA';
export type SituacaoAtaReajuste = SituacaoItemReajuste | 'TERMO_A_INFORMAR';
export type OrigemDataBase = 'INFORMADO' | 'APOSTILAMENTO' | 'EDITAL';

export interface ParametrosReajuste {
  ataId: string;
  indice: string | null;
  clausula: 'COM_REAJUSTE' | 'SEM_REAJUSTE' | 'A_CONFERIR';
  dataOrcamentoEdital: string | null;
  termoMesApostilamento: string | null;
  termoSeiApostilamento: string | null;
  termoData: string | null;
  termoSei: string | null;
  termoInformadoEm: string | null;
  versao: number;
}

export interface CicloReajuste {
  ciclo: number;
  dataBase: string;
  aniversario: string;
  efeitoInicio: string;
  situacao: SituacaoCiclo;
  percentual: number | null;
  percentualCalculado: number | null;
  mesesEstimados: number;
  periodoInicio: string | null;
  periodoFim: string | null;
  reajusteId: string | null;
}

export interface ItemReajuste {
  numeroItem: string;
  precoHomologado: number;
  homologadoLido: boolean;
  precoAtual: number;
  percentualNoPreco: number | null;
  precoDevido: number;
  precoAplicado: number;
  situacao: SituacaoItemReajuste;
  proximoEfeito: string | null;
  proximoSituacao: SituacaoCiclo | null;
  proximoPercentual: number | null;
  proximoMesesEstimados: number | null;
  precoProjetado: number | null;
}

export interface ReajustePublicado {
  id: string;
  origem: 'PNCP' | 'INFORMADO';
  efeitoInicio: string;
  percentual: number | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  documentoSequencial: number | null;
  documentoTitulo: string | null;
  documentoPublicadoEm: string | null;
  seiCitado: string | null;
  seiApostilamento: string | null;
  informadoEm: string | null;
}

export interface IndiceDoMes {
  mes: string;
  variacao: number;
  oficial: boolean;
}

export interface ReajusteDaAta {
  ataId: string | null;
  parametros: ParametrosReajuste | null;
  ciclos: CicloReajuste[];
  itens: ItemReajuste[];
  publicados: ReajustePublicado[];
  /** Variação mensal do índice, do primeiro ao último mês dos ciclos (para "Ver os 12 meses"). */
  indices: IndiceDoMes[];
}

export interface ResumoReajusteAta {
  ataId: string;
  numeroAta: string;
  codigoUasg: string;
  ataKey: string;
  indice: string | null;
  clausula: ParametrosReajuste['clausula'];
  dataBaseOrigem: OrigemDataBase | null;
  dataBase: string | null;
  itens: number;
  percentualAInformar: number;
  indiceIndisponivel: number;
  precoDesatualizado: number;
  devido: number;
  previsto: number;
  seProrrogar: number;
  emDia: number;
  proximoEfeito: string | null;
  proximoSituacao: SituacaoCiclo | null;
  proximoPercentual: number | null;
  situacao: SituacaoAtaReajuste;
}

export const REAJUSTE_VAZIO: ReajusteDaAta = { ataId: null, parametros: null, ciclos: [], itens: [], publicados: [], indices: [] };

const tabelaAusente = (error: any) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202' || error?.code === '42883' ||
  /does not exist|Could not find the (table|function)/i.test(String(error?.message ?? ''));

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const data = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

function paraParametros(r: any): ParametrosReajuste {
  return {
    ataId: r.ata_id,
    indice: r.indice ?? null,
    clausula: r.clausula ?? 'A_CONFERIR',
    dataOrcamentoEdital: data(r.data_orcamento_edital),
    termoMesApostilamento: data(r.termo_mes_apostilamento),
    termoSeiApostilamento: r.termo_sei_apostilamento ?? null,
    termoData: data(r.termo_data),
    termoSei: r.termo_sei ?? null,
    termoInformadoEm: r.termo_informado_em ?? null,
    versao: Number(r.versao) || 1
  };
}

function paraCiclo(r: any): CicloReajuste {
  return {
    ciclo: Number(r.ciclo),
    dataBase: data(r.data_base) as string,
    aniversario: data(r.aniversario) as string,
    efeitoInicio: data(r.efeito_inicio) as string,
    situacao: r.situacao,
    percentual: num(r.percentual),
    percentualCalculado: num(r.percentual_calculado),
    mesesEstimados: Number(r.meses_estimados) || 0,
    periodoInicio: data(r.periodo_inicio),
    periodoFim: data(r.periodo_fim),
    reajusteId: r.reajuste_id ?? null
  };
}

function paraItem(r: any): ItemReajuste {
  return {
    numeroItem: String(r.numero_item),
    precoHomologado: Number(r.preco_homologado) || 0,
    homologadoLido: Boolean(r.homologado_lido),
    precoAtual: Number(r.preco_atual) || 0,
    percentualNoPreco: num(r.percentual_no_preco),
    precoDevido: Number(r.preco_devido) || 0,
    precoAplicado: Number(r.preco_aplicado) || 0,
    situacao: r.situacao_item,
    proximoEfeito: data(r.proximo_efeito),
    proximoSituacao: r.proximo_situacao ?? null,
    proximoPercentual: num(r.proximo_percentual),
    proximoMesesEstimados: r.proximo_meses_estimados == null ? null : Number(r.proximo_meses_estimados),
    precoProjetado: num(r.preco_projetado)
  };
}

function paraPublicado(r: any): ReajustePublicado {
  return {
    id: r.id,
    origem: r.origem,
    efeitoInicio: data(r.efeito_inicio) as string,
    percentual: num(r.percentual),
    periodoInicio: data(r.periodo_inicio),
    periodoFim: data(r.periodo_fim),
    documentoSequencial: r.documento_pncp_sequencial ?? null,
    documentoTitulo: r.documento_titulo ?? null,
    documentoPublicadoEm: data(r.documento_publicado_em),
    seiCitado: r.sei_citado ?? null,
    seiApostilamento: r.sei_apostilamento ?? null,
    informadoEm: r.informado_em ?? null
  };
}

export function paraResumo(r: any): ResumoReajusteAta {
  return {
    ataId: r.ata_id,
    numeroAta: r.numero_ata,
    codigoUasg: r.codigo_uasg,
    ataKey: r.ata_key,
    indice: r.indice ?? null,
    clausula: r.clausula ?? 'A_CONFERIR',
    dataBaseOrigem: r.data_base_origem ?? null,
    dataBase: data(r.data_base),
    itens: Number(r.itens) || 0,
    percentualAInformar: Number(r.percentual_a_informar) || 0,
    indiceIndisponivel: Number(r.indice_indisponivel) || 0,
    precoDesatualizado: Number(r.preco_desatualizado) || 0,
    devido: Number(r.devido) || 0,
    previsto: Number(r.previsto) || 0,
    seProrrogar: Number(r.se_prorrogar) || 0,
    emDia: Number(r.em_dia) || 0,
    proximoEfeito: data(r.proximo_efeito),
    proximoSituacao: r.proximo_situacao ?? null,
    proximoPercentual: num(r.proximo_percentual),
    situacao: r.situacao
  };
}

/** Uma ata gerenciada pela SENASP: o reajuste é da gerenciadora (atas de outros órgãos ficam de fora). */
async function idDaAta(numeroAta: string, uasg: string): Promise<string | null> {
  const db = requireSupabase();
  const { data: linhas, error } = await db
    .from('atas_registro_preco')
    .select('id')
    .eq('numero_ata', numeroAta)
    .eq('codigo_uasg', uasg)
    .eq('papel_senasp', 'GERENCIADORA')
    .limit(1);
  if (error) throw new Error(error.message);
  return (linhas?.[0]?.id as string | undefined) ?? null;
}

const mesMais = (iso: string, meses: number) => {
  const [y, m] = iso.split('-').map(Number);
  const t = y * 12 + (m - 1) + meses;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
};

export async function fetchReajusteDaAta(numeroAta: string, uasg: string): Promise<ReajusteDaAta> {
  if (!isSupabaseConfigured || !supabase || !numeroAta || !uasg) return REAJUSTE_VAZIO;
  const db = supabase;
  const ataId = await idDaAta(numeroAta, uasg);
  if (!ataId) return REAJUSTE_VAZIO;

  // Versão antes dos dados (migration 129): se alguém gravar entre as leituras, o banco recusa a gravação velha.
  const par = await db.from('ata_reajuste_parametros').select('*').eq('ata_id', ataId).maybeSingle();
  if (par.error) {
    if (tabelaAusente(par.error)) return REAJUSTE_VAZIO;
    throw new Error(par.error.message);
  }
  const [ciclos, itens, publicados] = await Promise.all([
    db.rpc('reajuste_ciclos_ata', { p_ata_id: ataId }),
    db.rpc('reajuste_itens_ata', { p_ata_id: ataId }),
    db.from('ata_reajustes').select('*').eq('ata_id', ataId).order('efeito_inicio')
  ]);
  for (const r of [ciclos, itens, publicados]) {
    if (r.error) {
      if (tabelaAusente(r.error)) return REAJUSTE_VAZIO;
      throw new Error(r.error.message);
    }
  }
  const listaCiclos = ((ciclos.data ?? []) as any[]).map(paraCiclo);

  let indices: IndiceDoMes[] = [];
  const inicios = listaCiclos.map((c) => c.periodoInicio ?? c.dataBase.slice(0, 7) + '-01');
  if (inicios.length > 0) {
    const de = inicios.reduce((a, b) => (a < b ? a : b)).slice(0, 7) + '-01';
    const ate = mesMais(inicios.reduce((a, b) => (a > b ? a : b)).slice(0, 7) + '-01', 12);
    const ind = await db
      .from('indices_precos_mensais')
      .select('mes, tipo, variacao')
      .eq('indice', parametrosIndice(par.data))
      .gte('mes', de)
      .lte('mes', ate)
      .order('mes');
    if (ind.error && !tabelaAusente(ind.error)) throw new Error(ind.error.message);
    const porMes = new Map<string, IndiceDoMes>();
    for (const r of (ind.data ?? []) as any[]) {
      const mes = data(r.mes) as string;
      const oficial = r.tipo === 'OFICIAL';
      // O oficial vence o projetado do mesmo mês.
      if (!porMes.has(mes) || oficial) porMes.set(mes, { mes, variacao: Number(r.variacao), oficial });
    }
    indices = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  return {
    ataId,
    parametros: par.data ? paraParametros(par.data) : null,
    ciclos: listaCiclos,
    itens: ((itens.data ?? []) as any[]).map(paraItem),
    publicados: ((publicados.data ?? []) as any[]).map(paraPublicado),
    indices
  };
}

function parametrosIndice(p: any): string {
  return (p?.indice as string | undefined) || 'IPCA';
}

/** Resumo de todas as atas vigentes com parâmetros de reajuste (Início e cartão da Ata 360). */
export async function fetchResumoReajusteAtas(): Promise<ResumoReajusteAta[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data: linhas, error } = await supabase.from('v_ata_reajuste_resumo').select('*');
  if (error) {
    if (tabelaAusente(error)) return [];
    throw new Error(error.message);
  }
  return ((linhas ?? []) as any[]).map(paraResumo);
}

/** p_versao_vista é inteiro nestas RPCs (ata_reajuste_parametros.versao); sem versão, o banco grava como antes. */
function versaoVista(versao: number | null | undefined): { p_versao_vista?: number } {
  return typeof versao === 'number' && Number.isFinite(versao) ? { p_versao_vista: versao } : {};
}

function erroDaGravacao(error: any): Error {
  if (erroDeConflito(error)) return new ConflitoEdicaoError();
  const msg = String(error?.message ?? 'Não foi possível gravar.');
  // As RPCs mandam "CÓDIGO: texto para a pessoa"; a tela mostra só o texto.
  return new Error(msg.replace(/^[A-Z_]+:\s*/, ''));
}

export async function informarTermoConformidade(p: { ataId: string; data: string; sei: string; versao?: number | null }): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_termo_conformidade', {
    p_ata_id: p.ataId,
    p_data: p.data,
    p_sei: p.sei.trim(),
    ...versaoVista(p.versao)
  });
  if (error) throw erroDaGravacao(error);
}

export async function informarReajusteAta(p: {
  ataId: string;
  reajusteId: string | null;
  percentual: number;
  periodoInicio: string;
  periodoFim: string;
  efeitoInicio: string;
  sei: string;
  versao?: number | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_reajuste_ata', {
    p_ata_id: p.ataId,
    p_reajuste_id: p.reajusteId,
    p_percentual: p.percentual,
    p_periodo_inicio: p.periodoInicio,
    p_periodo_fim: p.periodoFim,
    p_efeito_inicio: p.efeitoInicio,
    p_sei: p.sei.trim(),
    ...versaoVista(p.versao)
  });
  if (error) throw erroDaGravacao(error);
}

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Quantitativos do item (migration 109): ata assinada × registrado no Compras.gov.br, remanejamentos,
 * "continua do órgão", cota própria da SENASP e contratos dos órgãos participantes.
 * Leitura das views v_item_quantitativos (item) e v_item_quantitativos_orgaos (órgão), das tabelas de
 * remanejamentos, "continua do órgão", registros da ata assinada e contratos dos participantes.
 */

export type SituacaoOrgao =
  | 'SENASP'
  | 'IGUAL'
  | 'GERENCIADO'
  | 'REMANEJADO_A_MENOS'
  | 'REMANEJADO_A_MAIS'
  | 'ACIMA_DA_ATA'
  | 'REMANEJAMENTO_CONFIRMADO'
  | 'FORA_DA_ATA';

export interface OrgaoQuantitativo {
  uasg: string;
  nomeOrgao: string | null;
  tipoUnidade: string | null;
  ehSenasp: boolean;
  quantidadeAssinada: number;
  /** Nula = o órgão não está na lista do Compras.gov.br. */
  quantidadeRegistrada: number | null;
  semRegistro: boolean;
  situacao: SituacaoOrgao;
  falta: number;
  acima: number;
  remanejadoConfirmado: number;
  resto: number;
  continuaDoOrgao: number | null;
  /** Quanto a SENASP gerencia para o órgão (fora da cota própria). */
  gerenciado: number;
  mudou: boolean;
  /** Data/hora da mudança do registrado (Compras.gov.br ou histórico). */
  mudouEm: string | null;
  /** Última atualização do órgão no Compras.gov.br (a mesma em dois órgãos = mesma operação). */
  atualizadoEm: string | null;
  /** Item de ata da SENASP (gerenciadora). Falso na ata de outro órgão, em que só a linha da SENASP aparece (migration 114). */
  ataDaSenasp: boolean;
}

/**
 * Quantidade aprovada de uma adesão da SENASP que veio sem quantidade do Compras.gov.br, informada pelo gestor da
 * ata ou pelo coordenador (migration 114). A adesão é a da UASG e da data de aprovação.
 */
export interface AdesaoInformada {
  uasg: string;
  /** dataAprovacaoAnalise da adesão, sem fuso (ex.: 2026-10-02T09:57:35). */
  aprovadaEm: string;
  quantidade: number;
  documentoSei: string;
  justificativa: string | null;
  informadoPorNome: string;
  informadoEm: string;
}

export interface Remanejamento {
  id: string;
  uasgOrigem: string;
  quantidade: number;
  /** Nula = destino não informado (conta como devolvido à SENASP). */
  uasgDestino: string | null;
  justificativa: string;
  confirmadoPorNome: string;
  confirmadoEm: string;
}

export interface ContinuaDoOrgao {
  uasg: string;
  quantidade: number;
  justificativa: string;
  marcadoPorNome: string;
  marcadoEm: string;
}

export interface RegistroAtaAssinada {
  id: string;
  documentoSei: string;
  justificativa: string | null;
  informadoPorNome: string;
  informadoEm: string;
  total: number;
}

export interface ContratoDoParticipante {
  uasg: string;
  contratoId: string;
  numero: string | null;
  tipo: string | null;
  situacao: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorGlobal: number | null;
  vigenciaFim: string | null;
  vistoEm: string;
}

export interface LeituraDoParticipante {
  lidoEm: string;
  /** 0 = o órgão não publica contratos no Contratos.gov.br. */
  contratosNaUg: number;
}

export interface QuantitativosDoItem {
  /** A ata assinada foi informada para o item. */
  informado: boolean;
  documentoSei: string | null;
  informadoPorNome: string | null;
  informadoEm: string | null;
  homologado: number;
  totalAssinada: number;
  totalRegistrado: number;
  assinadaSenasp: number;
  registradoSenasp: number;
  gerenciadoParticipantes: number;
  cotaPropria: number;
  alocado: number;
  orgaos: OrgaoQuantitativo[];
  remanejamentos: Remanejamento[];
  continua: ContinuaDoOrgao[];
  registros: RegistroAtaAssinada[];
  contratos: ContratoDoParticipante[];
  leituras: Map<string, LeituraDoParticipante>;
  adesoesInformadas: AdesaoInformada[];
}

export const MIGRATION_109_AUSENTE = 'Os quantitativos da ata assinada ainda não estão disponíveis no banco (migration 109).';

const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const num = (v: unknown): number => numOuNulo(v) ?? 0;
const tabelaAusente = (error: any) => error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|Could not find the table/i.test(String(error?.message ?? ''));

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  return supabase;
}

/** Mensagem legível de um erro das funções da migration 109 (tira o código do começo). */
export function mensagemDoErroQuantitativos(error: any): string {
  if (rpcInexistente(error)) return MIGRATION_109_AUSENTE;
  const bruta = String(error?.message ?? error ?? '');
  return bruta.replace(/^[A-Z_0-9]+:\s*/, '') || 'O banco recusou a operação.';
}

export function vazioDoItem(): QuantitativosDoItem {
  return {
    informado: false,
    documentoSei: null,
    informadoPorNome: null,
    informadoEm: null,
    homologado: 0,
    totalAssinada: 0,
    totalRegistrado: 0,
    assinadaSenasp: 0,
    registradoSenasp: 0,
    gerenciadoParticipantes: 0,
    cotaPropria: 0,
    alocado: 0,
    orgaos: [],
    remanejamentos: [],
    continua: [],
    registros: [],
    contratos: [],
    leituras: new Map(),
    adesoesInformadas: []
  };
}

export function mapOrgao(r: any): OrgaoQuantitativo {
  return {
    uasg: String(r.uasg),
    nomeOrgao: r.nome_orgao ?? null,
    tipoUnidade: r.tipo_unidade ?? null,
    ehSenasp: r.eh_senasp === true,
    quantidadeAssinada: num(r.quantidade_assinada),
    quantidadeRegistrada: numOuNulo(r.quantidade_registrada),
    semRegistro: r.sem_registro === true,
    situacao: r.situacao as SituacaoOrgao,
    falta: num(r.falta),
    acima: num(r.acima),
    remanejadoConfirmado: num(r.remanejado_confirmado),
    resto: num(r.resto),
    continuaDoOrgao: numOuNulo(r.continua_do_orgao),
    gerenciado: num(r.gerenciado),
    mudou: r.mudou === true,
    mudouEm: r.mudou_em ?? null,
    atualizadoEm: r.atualizado_em ?? null,
    ataDaSenasp: r.ata_da_senasp !== false
  };
}

/** Quantitativos do item; com a migration 109 ausente, devolve o item como "não informado". */
export async function fetchQuantitativosDoItem(itemKey: string): Promise<QuantitativosDoItem> {
  const key = (itemKey || '').trim();
  const vazio = vazioDoItem();
  if (!key || !isSupabaseConfigured || !supabase) return vazio;
  const uasgGerenciadora = key.split('-')[1] ?? '';

  const [item, orgaos, remanejamentos, continua, registros, contratos, leituras, adesoesInformadas] = await Promise.all([
    supabase.from('v_item_quantitativos').select('*').eq('item_key', key).maybeSingle(),
    supabase.from('v_item_quantitativos_orgaos').select('*').eq('item_key', key),
    supabase.from('ata_item_remanejamentos').select('*').eq('item_key', key).is('desfeito_em', null).order('confirmado_em'),
    supabase.from('ata_item_continua_orgao').select('*').eq('item_key', key),
    supabase.from('ata_item_assinada_registros').select('id, documento_sei, justificativa, informado_por_nome, informado_em, total').eq('item_key', key).order('informado_em', { ascending: false }),
    supabase.from('participantes_contratos_itens').select('*').eq('item_key', key),
    supabase.from('participantes_contratos_leituras').select('uasg, lido_em, contratos_na_ug').eq('uasg_gerenciadora', uasgGerenciadora),
    supabase.from('adesao_quantidade_informada').select('*').eq('item_key', key)
  ]);
  if (item.error) {
    if (tabelaAusente(item.error)) return vazio;
    throw new Error(item.error.message);
  }
  for (const r of [orgaos, remanejamentos, continua, registros, contratos, leituras, adesoesInformadas]) {
    if (r.error && !tabelaAusente(r.error)) throw new Error(r.error.message);
  }

  const i = item.data as any;
  // A view por item só tem as atas da SENASP; na ata de outro órgão (migration 114), a ata assinada informada
  // aparece pelos registros, já ordenados do mais novo para o mais antigo.
  const ultimo = (registros.data ?? [])[0] as any;
  return {
    informado: Boolean(i) || Boolean(ultimo),
    documentoSei: i?.documento_sei ?? ultimo?.documento_sei ?? null,
    informadoPorNome: i?.informado_por_nome ?? ultimo?.informado_por_nome ?? null,
    informadoEm: i?.informado_em ?? ultimo?.informado_em ?? null,
    homologado: num(i?.homologado),
    totalAssinada: num(i?.total_assinada),
    totalRegistrado: num(i?.total_registrado),
    assinadaSenasp: num(i?.assinada_senasp),
    registradoSenasp: num(i?.registrado_senasp),
    gerenciadoParticipantes: num(i?.gerenciado_participantes),
    cotaPropria: num(i?.cota_propria),
    alocado: num(i?.alocado),
    orgaos: (orgaos.data ?? []).map(mapOrgao),
    remanejamentos: (remanejamentos.data ?? []).map((r: any) => ({
      id: String(r.id),
      uasgOrigem: String(r.uasg_origem),
      quantidade: num(r.quantidade),
      uasgDestino: r.uasg_destino ?? null,
      justificativa: r.justificativa ?? '',
      confirmadoPorNome: r.confirmado_por_nome ?? '',
      confirmadoEm: r.confirmado_em
    })),
    continua: (continua.data ?? []).map((r: any) => ({
      uasg: String(r.uasg),
      quantidade: num(r.quantidade),
      justificativa: r.justificativa ?? '',
      marcadoPorNome: r.marcado_por_nome ?? '',
      marcadoEm: r.marcado_em
    })),
    registros: (registros.data ?? []).map((r: any) => ({
      id: String(r.id),
      documentoSei: r.documento_sei,
      justificativa: r.justificativa ?? null,
      informadoPorNome: r.informado_por_nome ?? '',
      informadoEm: r.informado_em,
      total: num(r.total)
    })),
    contratos: (contratos.data ?? []).map((r: any) => ({
      uasg: String(r.uasg),
      contratoId: String(r.contrato_id),
      numero: r.numero ?? null,
      tipo: r.tipo ?? null,
      situacao: r.situacao ?? null,
      quantidade: numOuNulo(r.quantidade),
      valorUnitario: numOuNulo(r.valor_unitario),
      valorGlobal: numOuNulo(r.valor_global),
      vigenciaFim: r.vigencia_fim ?? null,
      vistoEm: r.visto_em
    })),
    leituras: new Map((leituras.data ?? []).map((r: any) => [String(r.uasg), { lidoEm: r.lido_em, contratosNaUg: num(r.contratos_na_ug) }])),
    adesoesInformadas: (adesoesInformadas.data ?? []).map((r: any) => ({
      uasg: String(r.uasg),
      aprovadaEm: String(r.aprovada_em ?? '').slice(0, 19),
      quantidade: num(r.quantidade),
      documentoSei: r.documento_sei,
      justificativa: r.justificativa ?? null,
      informadoPorNome: r.informado_por_nome ?? '',
      informadoEm: r.informado_em
    }))
  };
}

export interface QuantidadeInformada {
  uasg: string;
  quantidade: number;
  /** Obrigatório para órgão que não está na lista do Compras.gov.br. */
  nome?: string | null;
}

export async function informarQuantidadesAtaAssinada(p: {
  itemKey: string;
  quantidades: QuantidadeInformada[];
  documentoSei: string;
  justificativa?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_quantidades_ata_assinada', {
    p_item_key: p.itemKey,
    p_quantidades: p.quantidades.map((q) => ({ uasg: q.uasg, quantidade: q.quantidade, nome: q.nome?.trim() || null })),
    p_documento_sei: p.documentoSei.trim(),
    p_justificativa: p.justificativa?.trim() || null
  });
  if (error) throw new Error(mensagemDoErroQuantitativos(error));
}

export async function confirmarRemanejamento(p: {
  itemKey: string;
  uasgOrigem: string;
  quantidade: number;
  uasgDestino: string | null;
  justificativa: string;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('confirmar_remanejamento', {
    p_item_key: p.itemKey,
    p_uasg_origem: p.uasgOrigem,
    p_quantidade: p.quantidade,
    p_uasg_destino: p.uasgDestino,
    p_justificativa: p.justificativa.trim()
  });
  if (error) throw new Error(mensagemDoErroQuantitativos(error));
}

export async function desfazerRemanejamentos(p: { itemKey: string; uasgOrigem: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_remanejamentos', { p_item_key: p.itemKey, p_uasg_origem: p.uasgOrigem });
  if (error) throw new Error(mensagemDoErroQuantitativos(error));
}

export async function marcarContinuaDoOrgao(p: { itemKey: string; uasg: string; quantidade: number; justificativa: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('marcar_continua_do_orgao', {
    p_item_key: p.itemKey,
    p_uasg: p.uasg,
    p_quantidade: p.quantidade,
    p_justificativa: p.justificativa.trim()
  });
  if (error) throw new Error(mensagemDoErroQuantitativos(error));
}

export async function desfazerContinuaDoOrgao(p: { itemKey: string; uasg: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_continua_do_orgao', { p_item_key: p.itemKey, p_uasg: p.uasg });
  if (error) throw new Error(mensagemDoErroQuantitativos(error));
}

/** Quantidade aprovada de uma adesão da SENASP que veio sem quantidade do Compras.gov.br (migration 114). */
export async function informarQuantidadeAdesao(p: {
  itemKey: string;
  uasg: string;
  /** dataAprovacaoAnalise da adesão, como veio do Compras.gov.br. */
  aprovadaEm: string;
  quantidade: number;
  documentoSei: string;
  justificativa?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_quantidade_adesao', {
    p_item_key: p.itemKey,
    p_uasg: p.uasg,
    p_aprovada_em: p.aprovadaEm,
    p_quantidade: p.quantidade,
    p_documento_sei: p.documentoSei.trim(),
    p_justificativa: p.justificativa?.trim() || null
  });
  if (error) throw new Error(rpcInexistente(error) ? 'A quantidade da adesão ainda não pode ser informada no banco (migration 114).' : mensagemDoErroQuantitativos(error));
}

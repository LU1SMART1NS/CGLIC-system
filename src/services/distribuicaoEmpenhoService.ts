import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Vínculo da nota de empenho aos itens do contrato (migrations 94 e 104). Nenhuma fonte aberta diz o item da NE:
 * contrato de um item recebe a nota inteira sozinho (AUTO); nos demais o gestor diz a quantidade de cada item. A
 * quantidade da nota em um item é a informada pelo gestor, senão a parcela em R$ ÷ preço unitário do item.
 */

export type SituacaoDistribuicao = 'A_DISTRIBUIR' | 'DISTRIBUIDA' | 'REVISAR' | 'SEM_ITENS' | 'SEM_VALOR';
export type MotivoRevisao = 'ITEM_FORA_DO_CONTRATO' | 'VALOR_MUDOU';
export type TipoSugestao = 'TOTAL_DO_ITEM' | 'MULTIPLO_DO_PRECO' | 'VARIAS_POSSIBILIDADES' | 'SEM_SUGESTAO';

export interface ParcelaDoItem {
  numeroItem: number;
  /** Parte da nota em R$ neste item; nula quando a nota foi vinculada só por quantidade a vários itens. */
  valor: number | null;
  /** Quantidade informada pelo gestor (inteira); nula = calculada pelo valor. */
  quantidadeInformada: number | null;
}

/** Quantidade de uma nota em um item, para vincular aos itens. */
export interface QuantidadeNoItem {
  numeroItem: number;
  quantidade: number;
}

export interface SugestaoDeItem {
  numeroItem: number;
  quantidade: number;
}

export interface DistribuicaoDoEmpenho {
  contratoEmpenhoId: string;
  contractKey: string;
  empenhoId: string;
  numeroOficial: string;
  dataEmissao: string | null;
  uasgEmitente: string | null;
  valorNota: number;
  itensNoContrato: number;
  situacao: SituacaoDistribuicao;
  motivoRevisao: MotivoRevisao | null;
  /** AUTO (contrato de um item) ou USUARIO; nulo enquanto não distribuída. */
  origem: 'AUTO' | 'USUARIO' | null;
  /** Valor da NE quando foi vinculada ou conferida (difere do atual se a nota mudou depois: aviso, a nota continua contando). */
  valorNaDistribuicao: number | null;
  valorDistribuido: number;
  parcelas: ParcelaDoItem[];
  distribuidoPorNome: string | null;
  distribuidoEm: string | null;
  observacao: string | null;
  sugestaoTipo: TipoSugestao | null;
  sugestao: SugestaoDeItem[];
}

const MIGRATION_AUSENTE = 'A quantidade da nota por item ainda não está disponível: falta aplicar no banco a migration 104.';

/** Mensagem legível de um erro das RPCs das migrations 94 e 104 (tira o código do começo). */
export function mensagemDoErroDeDistribuicao(error: any): string {
  if (rpcInexistente(error)) return MIGRATION_AUSENTE;
  const bruta = String(error?.message ?? error ?? '');
  if (/UNAUTHORIZED/.test(bruta) || error?.code === '42501') return 'Só gestor ou coordenador vincula empenhos aos itens do contrato.';
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'O banco recusou a operação.';
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function mapDistribuicao(r: any): DistribuicaoDoEmpenho {
  const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  return {
    contratoEmpenhoId: String(r.contrato_empenho_id),
    contractKey: String(r.contract_key ?? ''),
    empenhoId: String(r.empenho_id),
    numeroOficial: String(r.numero_oficial ?? ''),
    dataEmissao: r.data_emissao ?? null,
    uasgEmitente: r.uasg_emitente ?? null,
    valorNota: numero(r.valor_nota),
    itensNoContrato: numero(r.itens_no_contrato),
    situacao: r.situacao as SituacaoDistribuicao,
    motivoRevisao: (r.motivo_revisao ?? null) as MotivoRevisao | null,
    origem: (r.origem ?? null) as DistribuicaoDoEmpenho['origem'],
    valorNaDistribuicao: r.valor_na_distribuicao == null ? null : numero(r.valor_na_distribuicao),
    valorDistribuido: numero(r.valor_distribuido),
    parcelas: lista(r.parcelas).map((p) => ({
      numeroItem: numero(p.numero_item),
      valor: p.valor == null ? null : numero(p.valor),
      quantidadeInformada: p.quantidade_informada == null ? null : numero(p.quantidade_informada)
    })),
    distribuidoPorNome: r.distribuido_por_nome ?? null,
    distribuidoEm: r.distribuido_em ?? null,
    observacao: r.observacao ?? null,
    sugestaoTipo: (r.sugestao_tipo ?? null) as TipoSugestao | null,
    sugestao: lista(r.sugestao).map((s) => ({ numeroItem: numero(s.numero_item), quantidade: numero(s.quantidade) }))
  };
}

/** Uma linha por NE do contrato, com a situação da distribuição, as parcelas e a sugestão. */
export async function fetchDistribuicoesDoContrato(contractKey: string): Promise<DistribuicaoDoEmpenho[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const { data, error } = await supabase.from('v_contrato_empenho_distribuicao').select('*').eq('contract_key', contractKey);
  if (error) {
    // Banco sem a migration 94: a tela segue sem a coluna de itens.
    if (rpcInexistente(error) || error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapDistribuicao);
}

/** Para o cache: dias que uma nota vinculada pela equipe fica em "Vinculadas pela equipe". */
export const DIAS_VINCULADAS_RECENTES = 30;

/**
 * Fila do menu Vinculação: notas a vincular aos itens (A_DISTRIBUIR e REVISAR) de todos os contratos e as que a
 * equipe vinculou nos últimos dias. Contratos de um item só (AUTO) ficam de fora.
 */
export async function fetchDistribuicoesParaVincular(): Promise<DistribuicaoDoEmpenho[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const desde = new Date(Date.now() - DIAS_VINCULADAS_RECENTES * 86400000).toISOString();
  const { data, error } = await supabase
    .from('v_contrato_empenho_distribuicao')
    .select('*')
    .or(`situacao.in.(A_DISTRIBUIR,REVISAR),and(origem.eq.USUARIO,distribuido_em.gte.${desde})`);
  if (error) {
    if (rpcInexistente(error) || error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapDistribuicao);
}

export interface SituacaoDistribuicaoEmpenho {
  empenhoId: string;
  contractKey: string;
  situacao: SituacaoDistribuicao;
  origem: 'AUTO' | 'USUARIO' | null;
}

/** Situação da divisão por item de cada NE (coluna "Itens" da carteira de Empenhos). */
export async function fetchSituacaoDistribuicaoPorEmpenho(): Promise<SituacaoDistribuicaoEmpenho[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('v_contrato_empenho_distribuicao').select('empenho_id, contract_key, situacao, origem');
  if (error) {
    if (rpcInexistente(error) || error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r: any) => ({
    empenhoId: String(r.empenho_id),
    contractKey: String(r.contract_key),
    situacao: r.situacao as SituacaoDistribuicao,
    origem: (r.origem ?? null) as SituacaoDistribuicaoEmpenho['origem']
  }));
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não está configurado.');
  return supabase;
}

/** Vincula a nota aos itens pela quantidade de cada um (substitui o vínculo anterior). */
export async function vincularEmpenhoAosItens(p: { contratoEmpenhoId: string; itens: QuantidadeNoItem[]; observacao?: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('vincular_empenho_aos_itens', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_itens: p.itens.map((x) => ({ numero_item: x.numeroItem, quantidade: x.quantidade })),
    p_observacao: p.observacao?.trim() || null
  });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}

/** Grava a quantidade da nota em um item; nula volta à calculada pelo valor. */
export async function informarQuantidadeEmpenhoItem(p: { contratoEmpenhoId: string; numeroItem: number; quantidade: number | null }): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_quantidade_empenho_item', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_numero_item: p.numeroItem,
    p_quantidade: p.quantidade
  });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}

/** O gestor confirma as quantidades depois que o valor da nota mudou. */
export async function conferirQuantidadesEmpenho(contratoEmpenhoId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('conferir_quantidades_empenho', { p_contrato_empenho_id: contratoEmpenhoId });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}

/** Desfaz a distribuição feita pelo gestor; a nota volta para "a distribuir". */
export async function desfazerDistribuicaoEmpenho(contratoEmpenhoId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_distribuicao_empenho', { p_contrato_empenho_id: contratoEmpenhoId });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}


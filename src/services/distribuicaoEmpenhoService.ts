import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Distribuição da nota de empenho entre os itens do contrato (migration 94). Nenhuma fonte aberta diz o item
 * da NE: contrato de um item recebe a nota inteira sozinho (AUTO); nos demais o gestor reparte o valor.
 */

export type SituacaoDistribuicao = 'A_DISTRIBUIR' | 'DISTRIBUIDA' | 'REVISAR' | 'SEM_ITENS' | 'SEM_VALOR';
export type MotivoRevisao = 'ITEM_FORA_DO_CONTRATO' | 'VALOR_MUDOU';
export type TipoSugestao = 'TOTAL_DO_ITEM' | 'MULTIPLO_DO_PRECO' | 'VARIAS_POSSIBILIDADES' | 'SEM_SUGESTAO';

export interface ParcelaDoItem {
  numeroItem: number;
  valor: number;
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
  valorNota: number;
  itensNoContrato: number;
  situacao: SituacaoDistribuicao;
  motivoRevisao: MotivoRevisao | null;
  /** AUTO (contrato de um item) ou USUARIO; nulo enquanto não distribuída. */
  origem: 'AUTO' | 'USUARIO' | null;
  /** Valor da NE quando foi distribuída (difere do atual se a nota mudou depois). */
  valorNaDistribuicao: number | null;
  valorDistribuido: number;
  parcelas: ParcelaDoItem[];
  distribuidoPorNome: string | null;
  distribuidoEm: string | null;
  observacao: string | null;
  sugestaoTipo: TipoSugestao | null;
  sugestao: SugestaoDeItem[];
}

const MIGRATION_AUSENTE = 'O vínculo do empenho aos itens ainda não está disponível: falta aplicar no banco a migration 94.';

/** Mensagem legível de um erro das RPCs da migration 94 (tira o código do começo). */
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
    valorNota: numero(r.valor_nota),
    itensNoContrato: numero(r.itens_no_contrato),
    situacao: r.situacao as SituacaoDistribuicao,
    motivoRevisao: (r.motivo_revisao ?? null) as MotivoRevisao | null,
    origem: (r.origem ?? null) as DistribuicaoDoEmpenho['origem'],
    valorNaDistribuicao: r.valor_na_distribuicao == null ? null : numero(r.valor_na_distribuicao),
    valorDistribuido: numero(r.valor_distribuido),
    parcelas: lista(r.parcelas).map((p) => ({ numeroItem: numero(p.numero_item), valor: numero(p.valor) })),
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

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não está configurado.');
  return supabase;
}

/** Grava a distribuição (substitui a anterior). A soma tem de ser igual ao valor da NE que a tela mostrou. */
export async function distribuirEmpenhoNosItens(p: {
  contratoEmpenhoId: string;
  parcelas: ParcelaDoItem[];
  valorNota: number;
  observacao?: string;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('distribuir_empenho_nos_itens', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_parcelas: p.parcelas.map((x) => ({ numero_item: x.numeroItem, valor: x.valor })),
    p_valor_nota: p.valorNota,
    p_observacao: p.observacao?.trim() || null
  });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}

/** Desfaz a distribuição feita pelo gestor; a nota volta para "a distribuir". */
export async function desfazerDistribuicaoEmpenho(contratoEmpenhoId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_distribuicao_empenho', { p_contrato_empenho_id: contratoEmpenhoId });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}


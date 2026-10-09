import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Contratado por unidade interna e quantidade contratada ajustada (migration 103).
 * - v_arp_item_contrato_quantidade: por contrato vinculado ao item, a quantidade da fonte (e de onde veio), o ajuste do
 *   gestor, a quantidade usada no saldo e a divisão entre as unidades internas;
 * - v_arp_item_unidade_contratado: por unidade do item, alocado, contratado e livre;
 * - RPCs para ajustar/desfazer a quantidade e dividir/desfazer a divisão.
 */

/** De onde veio a leitura dos itens do contrato. NULL = a leitura não trouxe itens. */
export type FonteItensContrato = 'CONTRATOS_GOV' | 'COMPRAS_GOV' | null;

export type SituacaoDivisao = 'SEM_QUANTIDADE' | 'SEM_DIVISAO' | 'PARCIAL' | 'DIVIDIDA' | 'CONFERIR';

export interface ParteDaUnidade {
  unidade: string;
  quantidade: number;
  /** A unidade ainda tem alocação no item. */
  alocada: boolean;
}

/** Quantidade de UM contrato no item e a divisão dele entre as unidades. */
export interface QuantidadeDoContrato {
  itemKey: string;
  contractKey: string;
  /** Cópia da fonte (nunca digitada); nula = a fonte não listou o item. */
  quantidadeFonte: number | null;
  fonte: FonteItensContrato;
  fonteLidaEm: string | null;
  quantidadeAjustada: number | null;
  /** Quantidade usada no saldo: a ajustada, senão a da fonte. */
  quantidadeContratada: number | null;
  ajustada: boolean;
  ajusteJustificativa: string | null;
  /** Quantidade da fonte quando o gestor ajustou. */
  ajusteQuantidadeFonte: number | null;
  ajustadoPorNome: string | null;
  ajustadoEm: string | null;
  fonteMudouAposAjuste: boolean;
  divisaoOrigem: 'AUTO' | 'USUARIO' | null;
  /** Quantidade do contrato quando o gestor dividiu (diferente da atual = conferir). */
  divisaoQuantidadeBase: number | null;
  divididoPorNome: string | null;
  divididoEm: string | null;
  quantidadeDividida: number;
  quantidadeSemUnidade: number;
  unidades: ParteDaUnidade[];
  situacao: SituacaoDivisao;
}

/** Unidade do item: alocado, contratado (divisões dos contratos) e livre para contratar. */
export interface ContratadoDaUnidade {
  itemKey: string;
  unitName: string;
  allocationId: string | null;
  /** Nula quando a unidade não tem mais alocação no item, mas ainda aparece numa divisão. */
  quantidadeAlocada: number | null;
  quantidadeContratada: number;
  totalContratos: number;
  quantidadeLivre: number | null;
  acimaDoAlocado: boolean;
}

export interface ContratadoDoItem {
  contratos: QuantidadeDoContrato[];
  unidades: ContratadoDaUnidade[];
}

export interface AjusteDaQuantidade {
  id: string;
  contractKey: string;
  acao: 'AJUSTE' | 'DESFAZER';
  quantidadeAnterior: number | null;
  quantidadeAjustada: number | null;
  quantidadeFonte: number | null;
  justificativa: string;
  feitoPorNome: string;
  feitoEm: string;
}

const MIGRATION_AUSENTE = 'O contratado por unidade ainda não está disponível: falta aplicar no banco a migration 103.';

const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const num = (v: unknown): number => numOuNulo(v) ?? 0;

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  return supabase;
}

/** Mensagem legível de um erro das RPCs da migration 103 (tira o código do começo). */
export function mensagemDoErroContratado(error: any): string {
  if (rpcInexistente(error)) return MIGRATION_AUSENTE;
  const bruta = String(error?.message ?? error ?? '');
  if (/UNAUTHORIZED/.test(bruta) || error?.code === '42501') {
    return bruta.replace(/^[A-Z_]+:\s*/, '') || 'Só o gestor e o coordenador podem fazer isto.';
  }
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'O banco recusou a operação.';
}

const tabelaAusente = (error: any) => error?.code === '42P01' || /does not exist/i.test(String(error?.message ?? ''));

export function mapQuantidadeDoContrato(r: any): QuantidadeDoContrato {
  const unidades: ParteDaUnidade[] = Array.isArray(r.unidades)
    ? r.unidades.map((u: any) => ({ unidade: String(u.unidade), quantidade: num(u.quantidade), alocada: u.alocada !== false }))
    : [];
  return {
    itemKey: r.item_key,
    contractKey: r.contract_key,
    quantidadeFonte: numOuNulo(r.quantidade_fonte),
    fonte: r.fonte === 'CONTRATOS_GOV' || r.fonte === 'COMPRAS_GOV' ? r.fonte : null,
    fonteLidaEm: r.fonte_lida_em ?? r.quantidade_lida_em ?? null,
    quantidadeAjustada: numOuNulo(r.quantidade_ajustada),
    quantidadeContratada: numOuNulo(r.quantidade_contratada),
    ajustada: Boolean(r.ajustada),
    ajusteJustificativa: r.ajuste_justificativa ?? null,
    ajusteQuantidadeFonte: numOuNulo(r.ajuste_quantidade_fonte),
    ajustadoPorNome: r.ajustado_por_nome ?? null,
    ajustadoEm: r.ajustado_em ?? null,
    fonteMudouAposAjuste: Boolean(r.fonte_mudou_apos_ajuste),
    divisaoOrigem: r.divisao_origem === 'AUTO' || r.divisao_origem === 'USUARIO' ? r.divisao_origem : null,
    divisaoQuantidadeBase: numOuNulo(r.divisao_quantidade_base),
    divididoPorNome: r.dividido_por_nome ?? null,
    divididoEm: r.dividido_em ?? null,
    quantidadeDividida: num(r.quantidade_dividida),
    quantidadeSemUnidade: num(r.quantidade_sem_unidade),
    unidades,
    situacao: (r.situacao_divisao as SituacaoDivisao) ?? 'SEM_DIVISAO'
  };
}

export function mapContratadoDaUnidade(r: any): ContratadoDaUnidade {
  return {
    itemKey: r.item_key,
    unitName: String(r.unit_name),
    allocationId: r.allocation_id ?? null,
    quantidadeAlocada: numOuNulo(r.quantidade_alocada),
    quantidadeContratada: num(r.quantidade_contratada),
    totalContratos: num(r.total_contratos),
    quantidadeLivre: numOuNulo(r.quantidade_livre),
    acimaDoAlocado: Boolean(r.acima_do_alocado)
  };
}

/** Contratos do item (quantidade e divisão) e o contratado de cada unidade. Sem a migration 103, volta vazio. */
export async function fetchContratadoDoItem(itemKey: string): Promise<ContratadoDoItem> {
  const key = (itemKey || '').trim();
  if (!key || !isSupabaseConfigured || !supabase) return { contratos: [], unidades: [] };
  const [contratos, unidades] = await Promise.all([
    supabase.from('v_arp_item_contrato_quantidade').select('*').eq('item_key', key),
    supabase.from('v_arp_item_unidade_contratado').select('*').eq('item_key', key)
  ]);
  if (contratos.error) {
    if (tabelaAusente(contratos.error)) return { contratos: [], unidades: [] };
    throw new Error(contratos.error.message);
  }
  if (unidades.error && !tabelaAusente(unidades.error)) throw new Error(unidades.error.message);
  return {
    contratos: (contratos.data ?? []).map(mapQuantidadeDoContrato),
    unidades: (unidades.data ?? []).map(mapContratadoDaUnidade)
  };
}

/** Histórico dos ajustes da quantidade de um contrato no item, mais recente primeiro. */
export async function fetchAjustesDaQuantidade(itemKey: string, contractKey: string): Promise<AjusteDaQuantidade[]> {
  if (!itemKey || !contractKey || !isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('contrato_item_quantidade_ajustes')
    .select('*')
    .eq('item_key', itemKey)
    .eq('contract_key', contractKey)
    .order('feito_em', { ascending: false });
  if (error) {
    if (tabelaAusente(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    contractKey: r.contract_key,
    acao: r.acao === 'DESFAZER' ? 'DESFAZER' : 'AJUSTE',
    quantidadeAnterior: numOuNulo(r.quantidade_anterior),
    quantidadeAjustada: numOuNulo(r.quantidade_ajustada),
    quantidadeFonte: numOuNulo(r.quantidade_fonte),
    justificativa: r.justificativa,
    feitoPorNome: r.feito_por_nome,
    feitoEm: r.feito_em
  }));
}

export async function ajustarQuantidadeContratada(p: {
  itemKey: string;
  contractKey: string;
  quantidade: number;
  justificativa: string;
  /** Quantidade que a tela mostrou (trava contra mudança no meio). */
  quantidadeVista: number | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('ajustar_quantidade_contratada', {
    p_item_key: p.itemKey,
    p_contract_key: p.contractKey,
    p_quantidade: p.quantidade,
    p_justificativa: p.justificativa.trim(),
    p_quantidade_vista: p.quantidadeVista
  });
  if (error) throw new Error(mensagemDoErroContratado(error));
}

export async function desfazerAjusteQuantidade(p: { itemKey: string; contractKey: string; justificativa: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_ajuste_quantidade_contratada', {
    p_item_key: p.itemKey,
    p_contract_key: p.contractKey,
    p_justificativa: p.justificativa.trim()
  });
  if (error) throw new Error(mensagemDoErroContratado(error));
}

export async function dividirContratoNasUnidades(p: {
  itemKey: string;
  contractKey: string;
  unidades: Array<{ unidade: string; quantidade: number }>;
  quantidadeVista: number;
  observacao?: string;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('dividir_contrato_nas_unidades', {
    p_item_key: p.itemKey,
    p_contract_key: p.contractKey,
    p_unidades: p.unidades,
    p_quantidade_vista: p.quantidadeVista,
    p_observacao: p.observacao?.trim() || null
  });
  if (error) throw new Error(mensagemDoErroContratado(error));
}

export async function desfazerDivisaoContrato(p: { itemKey: string; contractKey: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_divisao_contrato_unidades', {
    p_item_key: p.itemKey,
    p_contract_key: p.contractKey
  });
  if (error) throw new Error(mensagemDoErroContratado(error));
}

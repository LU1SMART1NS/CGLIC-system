import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';
import { ConflitoEdicaoError, comVersao, erroDeConflito, semColunaDeVersao } from '../utils/conflitoEdicao';

/**
 * Vínculo da nota de empenho aos itens do contrato (migrations 94, 104, 118 e 121). Contrato de um item recebe a nota
 * inteira sozinho (AUTO); em contrato de vários itens o servidor lê a nota no SIAFI (Portal da Transparência) e a
 * vincula aos itens que ela diz (SIAFI); sem leitura que feche, vincula pelo valor quando só um item explica o valor
 * (VALOR); nos demais o gestor diz a quantidade de cada item. A quantidade da nota em um item é a informada pelo
 * gestor, senão a da nota no SIAFI, senão a parcela em R$ ÷ preço unitário do item.
 */

export type SituacaoDistribuicao = 'A_DISTRIBUIR' | 'DISTRIBUIDA' | 'REVISAR' | 'SEM_ITENS' | 'SEM_VALOR';
export type MotivoRevisao = 'ITEM_FORA_DO_CONTRATO' | 'VALOR_MUDOU';
export type TipoSugestao = 'TOTAL_DO_ITEM' | 'MULTIPLO_DO_PRECO' | 'VARIAS_POSSIBILIDADES' | 'SEM_SUGESTAO';
/** Quem vinculou a nota aos itens: o servidor (contrato de um item, pela nota no SIAFI ou pelo valor) ou o gestor. */
export type OrigemDoVinculo = 'AUTO' | 'SIAFI' | 'VALOR' | 'USUARIO';

/** Por que a leitura da nota no SIAFI não serve para vincular (migration 121). */
export type MotivoDaNota = 'NOTA_SEM_ITENS' | 'LINHA_SEM_ITEM' | 'QUANTIDADE_QUEBRADA' | 'SOMA_NAO_FECHA';

/** Um item da nota no SIAFI: quantidade, preço e valor líquidos. */
export interface ItemDaNota {
  numeroItem: number;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number;
  descricao: string | null;
  /** O contrato tem este item. */
  noContrato: boolean;
}

/** O que a nota diz no SIAFI, comparado com os itens do contrato (v_empenho_nota_siafi). */
export interface NotaNoSiafi {
  motivo: MotivoDaNota | null;
  itens: ItemDaNota[];
  itensFora: number[];
  /** Item da nota com o preço de outro item do contrato (número de item trocado). */
  outroPreco: Array<{ numeroItem: number; precoNota: number | null; precoContrato: number | null; itemComEssePreco: number }>;
  precoDiferente: boolean;
  /** O valor no Contratos.gov.br é o dobro do valor no SIAFI. */
  valorEmDobro: boolean;
  totalSiafi: number | null;
  lidoEm: string;
}

export interface ParcelaDoItem {
  numeroItem: number;
  /** Parte da nota em R$ neste item; nula quando a nota foi vinculada só por quantidade a vários itens. */
  valor: number | null;
  /** Quantidade informada pelo gestor (inteira); nula = calculada pelo valor. */
  quantidadeInformada: number | null;
  /** Quantidade da nota no SIAFI (vínculo pela nota); vale quando o gestor não informou outra. */
  quantidadeNota?: number | null;
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
  /** AUTO (contrato de um item), SIAFI (itens da nota), VALOR (só um item explica o valor da nota) ou USUARIO. */
  origem: OrigemDoVinculo | null;
  /** Valor da NE quando foi vinculada ou conferida (difere do atual se a nota mudou depois: aviso, a nota continua contando). */
  valorNaDistribuicao: number | null;
  valorDistribuido: number;
  parcelas: ParcelaDoItem[];
  distribuidoPorNome: string | null;
  distribuidoEm: string | null;
  observacao: string | null;
  sugestaoTipo: TipoSugestao | null;
  sugestao: SugestaoDeItem[];
  /** O que a nota diz no SIAFI; nulo enquanto não foi lida (ou quando a tela não buscou). */
  notaSiafi?: NotaNoSiafi | null;
  /** Versão do vínculo aos itens quando a tela leu (migration 129); volta ao salvar para o banco recusar se mudou. */
  versao?: string | null;
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
      quantidadeInformada: p.quantidade_informada == null ? null : numero(p.quantidade_informada),
      quantidadeNota: p.quantidade_nota == null ? null : numero(p.quantidade_nota)
    })),
    distribuidoPorNome: r.distribuido_por_nome ?? null,
    distribuidoEm: r.distribuido_em ?? null,
    observacao: r.observacao ?? null,
    sugestaoTipo: (r.sugestao_tipo ?? null) as TipoSugestao | null,
    sugestao: lista(r.sugestao).map((s) => ({ numeroItem: numero(s.numero_item), quantidade: numero(s.quantidade) })),
    versao: r.versao_edicao ?? null
  };
}

export function mapNotaSiafi(r: any): NotaNoSiafi {
  const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const opcional = (v: unknown) => (v == null ? null : numero(v));
  return {
    motivo: (r.motivo ?? null) as MotivoDaNota | null,
    itens: lista(r.itens).map((i) => ({
      numeroItem: numero(i.numero_item),
      quantidade: numero(i.quantidade),
      valorUnitario: opcional(i.valor_unitario),
      valorTotal: numero(i.valor_total),
      descricao: i.descricao ?? null,
      noContrato: i.no_contrato === true
    })),
    itensFora: lista(r.itens_fora).map(numero),
    outroPreco: lista(r.outro_preco).map((o) => ({
      numeroItem: numero(o.numero_item),
      precoNota: opcional(o.preco_nota),
      precoContrato: opcional(o.preco_contrato),
      itemComEssePreco: numero(o.item_com_esse_preco)
    })),
    precoDiferente: r.preco_diferente === true,
    valorEmDobro: r.valor_em_dobro === true,
    totalSiafi: opcional(r.total_siafi),
    lidoEm: String(r.lido_em ?? '')
  };
}

const viewAusente = (error: any) => rpcInexistente(error) || error?.code === '42P01' || error?.code === 'PGRST205';

/**
 * Junta a cada nota o que ela diz no SIAFI (v_empenho_nota_siafi, migration 121). Sem a migration, ou se a leitura
 * falhar, a tela segue sem essa parte: as notas ficam com notaSiafi nulo.
 */
async function anexarNotasSiafi(lista: DistribuicaoDoEmpenho[], contractKey?: string): Promise<DistribuicaoDoEmpenho[]> {
  if (!supabase || lista.length === 0) return lista;
  const porId = new Map<string, NotaNoSiafi>();
  try {
    if (contractKey) {
      const { data, error } = await supabase.from('v_empenho_nota_siafi').select('*').eq('contract_key', contractKey);
      if (error) throw error;
      for (const r of data ?? []) porId.set(String(r.contrato_empenho_id), mapNotaSiafi(r));
    } else {
      const ids = lista.map((d) => d.contratoEmpenhoId);
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase.from('v_empenho_nota_siafi').select('*').in('contrato_empenho_id', ids.slice(i, i + 150));
        if (error) throw error;
        for (const r of data ?? []) porId.set(String(r.contrato_empenho_id), mapNotaSiafi(r));
      }
    }
  } catch (error: any) {
    if (!viewAusente(error)) console.warn('[distribuicaoEmpenho] leitura da nota no SIAFI falhou:', error?.message ?? error);
    return lista;
  }
  return lista.map((d) => ({ ...d, notaSiafi: porId.get(d.contratoEmpenhoId) ?? null }));
}

/** Uma linha por NE do contrato, com a situação da distribuição, as parcelas, a sugestão e o que a nota diz no SIAFI. */
export async function fetchDistribuicoesDoContrato(contractKey: string): Promise<DistribuicaoDoEmpenho[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const ler = (colunas: string) => supabase!.from('v_contrato_empenho_distribuicao').select(colunas).eq('contract_key', contractKey);
  let { data, error } = await ler('*, versao_edicao');
  // Banco sem a migration 129: lê sem a versão (grava como antes).
  if (error && semColunaDeVersao(error)) ({ data, error } = await ler('*'));
  if (error) {
    // Banco sem a migration 94: a tela segue sem a coluna de itens.
    if (rpcInexistente(error) || error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return anexarNotasSiafi((data ?? []).map(mapDistribuicao), contractKey);
}

/** Para o cache: dias que uma nota vinculada pela equipe fica em "Vinculadas pela equipe". */
export const DIAS_VINCULADAS_RECENTES = 30;

/**
 * Fila do menu Vinculação: notas a vincular aos itens (A_DISTRIBUIR e REVISAR) de todos os contratos, as vinculadas
 * pelo valor (para conferir) e as que a equipe vinculou nos últimos dias, com o que cada uma diz no SIAFI. Contratos de
 * um item só (AUTO) e as vinculadas pela nota ficam de fora.
 */
export async function fetchDistribuicoesParaVincular(): Promise<DistribuicaoDoEmpenho[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const desde = new Date(Date.now() - DIAS_VINCULADAS_RECENTES * 86400000).toISOString();
  const ler = (colunas: string) =>
    supabase!
      .from('v_contrato_empenho_distribuicao')
      .select(colunas)
      .or(`situacao.in.(A_DISTRIBUIR,REVISAR),origem.eq.VALOR,and(origem.eq.USUARIO,distribuido_em.gte.${desde})`);
  let { data, error } = await ler('*, versao_edicao');
  if (error && semColunaDeVersao(error)) ({ data, error } = await ler('*'));
  if (error) {
    if (rpcInexistente(error) || error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return anexarNotasSiafi((data ?? []).map(mapDistribuicao));
}

export interface SituacaoDistribuicaoEmpenho {
  empenhoId: string;
  contractKey: string;
  situacao: SituacaoDistribuicao;
  origem: OrigemDoVinculo | null;
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

/** Erro das RPCs de vínculo: o conflito de edição vira ConflitoEdicaoError; o resto, mensagem legível. */
function erroDaDistribuicao(error: any): Error {
  return erroDeConflito(error) ? new ConflitoEdicaoError() : new Error(mensagemDoErroDeDistribuicao(error));
}

/** Vincula a nota aos itens pela quantidade de cada um (substitui o vínculo anterior). */
export async function vincularEmpenhoAosItens(p: {
  contratoEmpenhoId: string;
  itens: QuantidadeNoItem[];
  observacao?: string;
  /** Versão que a tela leu; o banco recusa se outra pessoa mexeu na nota. */
  versao?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('vincular_empenho_aos_itens', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_itens: p.itens.map((x) => ({ numero_item: x.numeroItem, quantidade: x.quantidade })),
    p_observacao: p.observacao?.trim() || null,
    ...comVersao(p.versao)
  });
  if (error) throw erroDaDistribuicao(error);
}

/** Grava a quantidade da nota em um item; nula volta à calculada pelo valor. */
export async function informarQuantidadeEmpenhoItem(p: {
  contratoEmpenhoId: string;
  numeroItem: number;
  quantidade: number | null;
  versao?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('informar_quantidade_empenho_item', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_numero_item: p.numeroItem,
    p_quantidade: p.quantidade,
    ...comVersao(p.versao)
  });
  if (error) throw erroDaDistribuicao(error);
}

/** O gestor confirma as quantidades depois que o valor da nota mudou. */
export async function conferirQuantidadesEmpenho(contratoEmpenhoId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('conferir_quantidades_empenho', { p_contrato_empenho_id: contratoEmpenhoId });
  if (error) throw new Error(mensagemDoErroDeDistribuicao(error));
}

/** Desfaz o vínculo aos itens (do gestor ou pelo valor); a nota volta para a fila e o servidor não a vincula de novo pelo valor. O vínculo pela nota no SIAFI não se desfaz: edita-se. */
export async function desfazerDistribuicaoEmpenho(contratoEmpenhoId: string, versao?: string | null): Promise<void> {
  const { error } = await requireSupabase().rpc('desfazer_distribuicao_empenho', {
    p_contrato_empenho_id: contratoEmpenhoId,
    ...comVersao(versao)
  });
  if (error) throw erroDaDistribuicao(error);
}


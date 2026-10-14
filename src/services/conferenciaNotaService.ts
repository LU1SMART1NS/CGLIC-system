import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';
import { mapNotaSiafi, type ItemDaNota } from './distribuicaoEmpenhoService';

/**
 * Notas em que a nota no SIAFI e o contrato no Contratos.gov.br não batem (migration 121,
 * v_empenho_conferencia_nota). A correção é do próprio gestor, quase sempre no Contratos.gov.br; o sistema mostra
 * o que aconteceu, guarda a marca "Vou corrigir" e tira a linha da fila quando a sincronização trouxer a correção.
 */

export type TipoDeConferenciaDaNota = 'ITEM_FORA_DO_CONTRATO' | 'ITEM_COM_OUTRO_PRECO' | 'CONTRATO_SEM_ITENS' | 'VINCULO_DIFERENTE_DA_NOTA';
export type SituacaoDaConferencia = 'A_CONFERIR' | 'CORRIGINDO' | 'CORRECAO_NAO_CHEGOU';
export type CorrecaoDaNota =
  | 'INCLUIR_ITEM_NO_CONTRATO'
  | 'CORRIGIR_ITENS_DO_CONTRATO'
  | 'CADASTRAR_ITENS_DO_CONTRATO'
  | 'INCLUIR_NOTA_EM_OUTRO_CONTRATO'
  | 'AVISAR_QUEM_EMITIU_A_NOTA'
  | 'REVER_MEU_VINCULO'
  | 'OUTRO';

export const ROTULO_DA_CONFERENCIA: Record<TipoDeConferenciaDaNota, string> = {
  ITEM_FORA_DO_CONTRATO: 'Item fora do contrato',
  ITEM_COM_OUTRO_PRECO: 'Item com outro preço no contrato',
  CONTRATO_SEM_ITENS: 'Contrato sem itens',
  VINCULO_DIFERENTE_DA_NOTA: 'Vínculo diferente da nota'
};

export const ROTULO_DA_CORRECAO: Record<CorrecaoDaNota, string> = {
  INCLUIR_ITEM_NO_CONTRATO: 'Incluir o item no contrato',
  CORRIGIR_ITENS_DO_CONTRATO: 'Corrigir o número ou o preço dos itens do contrato',
  CADASTRAR_ITENS_DO_CONTRATO: 'Cadastrar os itens do contrato',
  INCLUIR_NOTA_EM_OUTRO_CONTRATO: 'Incluir a nota em outro contrato',
  AVISAR_QUEM_EMITIU_A_NOTA: 'Avisar quem emitiu a nota',
  REVER_MEU_VINCULO: 'Rever o meu vínculo aos itens',
  OUTRO: 'Outra correção'
};

export const CORRECAO_SUGERIDA: Record<TipoDeConferenciaDaNota, CorrecaoDaNota> = {
  ITEM_FORA_DO_CONTRATO: 'INCLUIR_ITEM_NO_CONTRATO',
  ITEM_COM_OUTRO_PRECO: 'CORRIGIR_ITENS_DO_CONTRATO',
  CONTRATO_SEM_ITENS: 'CADASTRAR_ITENS_DO_CONTRATO',
  VINCULO_DIFERENTE_DA_NOTA: 'REVER_MEU_VINCULO'
};

export interface ConferenciaDaNota {
  contratoEmpenhoId: string;
  contractKey: string;
  numeroOficial: string;
  uasgEmitente: string | null;
  dataEmissao: string | null;
  valorNota: number;
  tipo: TipoDeConferenciaDaNota;
  itensNota: ItemDaNota[];
  itensFora: number[];
  outroPreco: Array<{ numeroItem: number; precoNota: number | null; precoContrato: number | null; itemComEssePreco: number }>;
  /** Itens em que o gestor vinculou a nota (vínculo diferente da nota). */
  itensDoVinculo: number[];
  notaLidaEm: string | null;
  totalSiafi: number | null;
  valorEmDobro: boolean;
  itensContrato: Array<{ numeroItem: number; quantidade: number | null; valorUnitario: number | null }>;
  situacao: SituacaoDaConferencia;
  correcao: { tipo: CorrecaoDaNota; observacao: string | null; porNome: string | null; em: string } | null;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function mapConferencia(r: any): ConferenciaDaNota {
  const nota = mapNotaSiafi({ itens: r.itens_nota, itens_fora: r.itens_fora, outro_preco: r.outro_preco, lido_em: r.nota_lida_em });
  return {
    contratoEmpenhoId: String(r.contrato_empenho_id),
    contractKey: String(r.contract_key ?? ''),
    numeroOficial: String(r.numero_oficial ?? ''),
    uasgEmitente: r.uasg_emitente ?? null,
    dataEmissao: r.data_emissao ?? null,
    valorNota: numero(r.valor_nota),
    tipo: r.tipo as TipoDeConferenciaDaNota,
    itensNota: nota.itens,
    itensFora: nota.itensFora,
    outroPreco: nota.outroPreco,
    itensDoVinculo: [...new Set(lista(r.parcelas).map((p) => numero(p.numero_item)))].sort((a, b) => a - b),
    notaLidaEm: r.nota_lida_em ?? null,
    totalSiafi: r.total_siafi == null ? null : numero(r.total_siafi),
    valorEmDobro: r.valor_em_dobro === true,
    itensContrato: lista(r.itens_contrato).map((i) => ({
      numeroItem: numero(i.numero_item),
      quantidade: i.quantidade == null ? null : numero(i.quantidade),
      valorUnitario: i.valor_unitario == null ? null : numero(i.valor_unitario)
    })),
    situacao: (r.situacao ?? 'A_CONFERIR') as SituacaoDaConferencia,
    correcao: r.correcao_id
      ? { tipo: r.correcao_tipo as CorrecaoDaNota, observacao: r.correcao_observacao ?? null, porNome: r.correcao_por_nome ?? null, em: String(r.correcao_em) }
      : null
  };
}

/** Todas as notas que pedem conferência (o filtro por carteira é feito na tela). */
export async function fetchConferenciasDaNota(): Promise<ConferenciaDaNota[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    // Ordem fixa por nota: sem ela as páginas podem repetir ou pular linhas.
    const { data, error } = await supabase.from('v_empenho_conferencia_nota').select('*').order('contrato_empenho_id').range(de, de + 999);
    if (error) {
      // Banco sem a migration 121: a fila segue sem a conferência.
      if (rpcInexistente(error) || error.code === '42P01' || error.code === 'PGRST205') return [];
      throw new Error(error.message);
    }
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas.map(mapConferencia);
}

function mensagem(error: any): string {
  const bruta = String(error?.message ?? error ?? '');
  if (/UNAUTHORIZED/.test(bruta) || error?.code === '42501') return 'Só gestor ou coordenador marca a correção.';
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'O banco recusou a operação.';
}

export async function marcarCorrecaoDaNota(p: { contratoEmpenhoId: string; tipo: CorrecaoDaNota; observacao: string }): Promise<void> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.rpc('marcar_correcao_nota_no_contrato', {
    p_contrato_empenho_id: p.contratoEmpenhoId,
    p_tipo: p.tipo,
    p_observacao: p.observacao.trim() || null
  });
  if (error) throw new Error(mensagem(error));
}

export async function desfazerCorrecaoDaNota(contratoEmpenhoId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.rpc('desfazer_correcao_nota_no_contrato', { p_contrato_empenho_id: contratoEmpenhoId });
  if (error) throw new Error(mensagem(error));
}

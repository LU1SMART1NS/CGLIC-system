import { supabase } from './supabaseClient';
import { mensagemDeErro } from './sincronizacaoFontesService';

/**
 * Se a ata assinada divide o quantitativo SENASP entre as unidades internas (migration 297):
 * - DIVIDE: a alocação é a da ata;
 * - NAO_DIVIDE: alocar às unidades é opcional e o item sem unidade não é pendência;
 * - A_CONFERIR: ninguém conferiu (ata nova); a alocação é cobrada como antes.
 */
export type SituacaoDivisao = 'DIVIDE' | 'NAO_DIVIDE' | 'A_CONFERIR';
export interface DivisaoNaAta {
  situacao: SituacaoDivisao;
  /** PDF = carga da leitura das atas assinadas (12/11/2026); PESSOA = marcado na tela. */
  fonte?: 'PDF' | 'PESSOA';
  marcadoPorNome?: string | null;
  marcadoEm?: string | null;
}
export const A_CONFERIR: DivisaoNaAta = { situacao: 'A_CONFERIR' };

const banco = () => {
  if (!supabase) throw new Error('Banco indisponível.');
  return supabase;
};

/** Marcação por ata, na chave das linhas da carteira ("{numeroAta}-{uasg}"). Sem linha = a conferir. */
export async function fetchDivisoesNaAta(): Promise<Map<string, DivisaoNaAta>> {
  if (!supabase) return new Map();
  const { data, error } = await supabase
    .from('ata_divisao_unidades')
    .select('situacao, fonte, marcado_por_nome, marcado_em, atas_registro_preco!inner(numero_ata, codigo_uasg)');
  if (error) {
    // Migration 297 ainda não aplicada: todas a conferir.
    if (error.code === '42P01' || error.code === 'PGRST205') return new Map();
    throw new Error(mensagemDeErro(error));
  }
  const mapa = new Map<string, DivisaoNaAta>();
  for (const r of (data ?? []) as Array<Record<string, any>>) {
    const ata = Array.isArray(r.atas_registro_preco) ? r.atas_registro_preco[0] : r.atas_registro_preco;
    if (!ata) continue;
    mapa.set(`${ata.numero_ata}-${ata.codigo_uasg}`, {
      situacao: r.situacao,
      fonte: r.fonte,
      marcadoPorNome: r.marcado_por_nome ?? null,
      marcadoEm: r.marcado_em ?? null
    });
  }
  return mapa;
}

/** Marca a ata como DIVIDE / NAO_DIVIDE, ou volta a "a conferir" (null). Coordenador e gestor de saldo. */
export async function marcarDivisaoDaAta(numeroAta: string, uasg: string, situacao: Exclude<SituacaoDivisao, 'A_CONFERIR'> | null): Promise<void> {
  const { error } = await banco().rpc('marcar_divisao_da_ata', { p_numero_ata: numeroAta, p_codigo_uasg: uasg, p_situacao: situacao });
  if (error) throw new Error(mensagemDeErro(error).replace(/^[A-Z_]+:\s*/, ''));
}

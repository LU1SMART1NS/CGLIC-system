import { supabase } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
import { ehGrupoBeneficiario, type GrupoBeneficiario, type GrupoConfirmadoBeneficiario } from '../config/captacaoEmendas';

/** Tabela ou função da migration 218 ainda não aplicada. */
const semMigration = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202';

/**
 * Grupo confirmado de cada beneficiário das emendas (migration 218). Null: a migration ainda não foi aplicada (a tela
 * Grupos dos beneficiários avisa; as colunas de captação ficam "a confirmar").
 */
export async function fetchGruposBeneficiarios(): Promise<GrupoConfirmadoBeneficiario[] | null> {
  if (!supabase) return [];
  const db = supabase;
  try {
    const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
      db.from('emenda_beneficiario_grupo').select('beneficiario_id, grupo, confirmado_por_nome, confirmado_em').order('beneficiario_id').range(de, ate)
    );
    return linhas
      .filter((r) => ehGrupoBeneficiario(r.grupo))
      .map((r) => ({
        beneficiarioId: String(r.beneficiario_id),
        grupo: r.grupo as GrupoBeneficiario,
        confirmadoPorNome: r.confirmado_por_nome ?? null,
        confirmadoEm: r.confirmado_em ?? null
      }));
  } catch (error: any) {
    if (semMigration(error?.code)) return null;
    throw new Error(error?.message ?? 'Não foi possível ler os grupos dos beneficiários.');
  }
}

/** Confirma (ou, com grupo null, tira) o grupo dos beneficiários. Devolve quantos mudaram. */
export async function definirGruposBeneficiarios(itens: Array<{ beneficiarioId: string; grupo: GrupoBeneficiario | null }>): Promise<number> {
  if (!supabase) throw new Error('Banco de dados indisponível.');
  let total = 0;
  for (let i = 0; i < itens.length; i += 500) {
    const { data, error } = await supabase.rpc('definir_grupos_beneficiarios_emenda', {
      p_itens: itens.slice(i, i + 500).map((x) => ({ beneficiario_id: x.beneficiarioId, grupo: x.grupo }))
    });
    if (error) {
      if (error.code === '42501') throw new Error('Só o gestor de emendas e o coordenador definem o grupo dos beneficiários.');
      if (semMigration(error.code)) throw new Error('O banco ainda não tem os grupos dos beneficiários (migration 218).');
      throw new Error(error.message);
    }
    total += typeof data === 'number' ? data : 0;
  }
  return total;
}

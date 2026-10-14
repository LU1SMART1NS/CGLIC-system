import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Contrato × item em que a soma da quantidade REAL das notas (informada pelo gestor ou lida da nota no SIAFI) passa da
 * quantidade contratada (v_contrato_itens_empenhado_acima, migration 133). Só aviso: a gravação nunca é bloqueada. A
 * quantidade calculada pelo valor não entra (reajuste e aditivo sobem o valor sem mudar a quantidade).
 */
export interface EmpenhadoAcima {
  contractKey: string;
  numeroItem: number;
  descricao: string | null;
  quantidadeContratada: number;
  quantidadeEmpenhada: number;
  quantidadeAcima: number;
  notas: number;
  ultimaNota: string | null;
  /** GESTOR (quantidade informada) ou a origem do vínculo da última nota (SIAFI, VALOR, AUTO, USUARIO). */
  ultimaOrigem: string | null;
}

const COLUNAS =
  'contract_key, numero_item, descricao, quantidade_contratada, quantidade_empenhada, quantidade_acima, notas, ultima_nota, ultima_origem';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function empenhadoAcimaDaLinha(r: any): EmpenhadoAcima {
  return {
    contractKey: String(r.contract_key),
    numeroItem: num(r.numero_item),
    descricao: r.descricao ?? null,
    quantidadeContratada: num(r.quantidade_contratada),
    quantidadeEmpenhada: num(r.quantidade_empenhada),
    quantidadeAcima: num(r.quantidade_acima),
    notas: num(r.notas),
    ultimaNota: r.ultima_nota ?? null,
    ultimaOrigem: r.ultima_origem ?? null
  };
}

/** Quem pôs a quantidade da última nota, em palavras ("informada pelo gestor", "pela nota no SIAFI"). */
export function textoDaOrigem(origem: string | null): string | null {
  switch (origem) {
    case 'GESTOR':
      return 'informada pelo gestor';
    case 'SIAFI':
      return 'vinculada pela nota no SIAFI';
    case 'VALOR':
      return 'vinculada pelo valor';
    case 'AUTO':
      return 'vinculada automaticamente';
    case 'USUARIO':
      return 'vinculada pela equipe';
    default:
      return null;
  }
}

export async function fetchEmpenhadoAcima(): Promise<EmpenhadoAcima[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('v_contrato_itens_empenhado_acima').select(COLUNAS);
  if (error) {
    // Banco sem a migration 133: sem a pendência.
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  return (data ?? []).map(empenhadoAcimaDaLinha);
}

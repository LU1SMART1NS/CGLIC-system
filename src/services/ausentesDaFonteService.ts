/**
 * Notas de empenho e faturas que o Contratos.gov.br deixou de listar no contrato mas que têm trabalho da equipe
 * (migration 113). A sincronização não as apaga: ficam a conferir até o coordenador decidir manter ou retirar.
 *   NOTA   distribuição entre os itens feita pelo gestor, quantidade informada por item ou unidade interna escolhida;
 *   FATURA ligada a um ciclo de pagamento.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

export type TipoAusenteDaFonte = 'NOTA' | 'FATURA';

export interface AusenteDaFonte {
  tipo: TipoAusenteDaFonte;
  /** contrato_empenhos.id (NOTA) ou id_fatura (FATURA), como texto. */
  chave: string;
  contractKey: string;
  numero?: string;
  valor?: number;
  detectadoEm: string;
  gestorContrato?: string;
  distribuidoPorNome?: string;
  quantidadesInformadas: number;
  unidades?: string;
  ciclos?: string;
}

interface LinhaAusente {
  tipo: string;
  chave: string;
  contract_key: string;
  numero: string | null;
  valor: number | string | null;
  detectado_em: string;
  gestor_contrato: string | null;
  distribuido_por_nome: string | null;
  quantidades_informadas: number | string | null;
  unidades: string | null;
  ciclos: string | null;
}

const COLUNAS = 'tipo, chave, contract_key, numero, valor, detectado_em, gestor_contrato, distribuido_por_nome, quantidades_informadas, unidades, ciclos';

export function ausenteDaLinha(r: LinhaAusente): AusenteDaFonte {
  const valor = r.valor === null || r.valor === '' ? undefined : Number(r.valor);
  return {
    tipo: r.tipo === 'FATURA' ? 'FATURA' : 'NOTA',
    chave: String(r.chave),
    contractKey: r.contract_key,
    numero: r.numero ?? undefined,
    valor: Number.isFinite(valor) ? valor : undefined,
    detectadoEm: r.detectado_em,
    gestorContrato: r.gestor_contrato ?? undefined,
    distribuidoPorNome: r.distribuido_por_nome ?? undefined,
    quantidadesInformadas: Number(r.quantidades_informadas) || 0,
    unidades: r.unidades ?? undefined,
    ciclos: r.ciclos ?? undefined
  };
}

/** O que a equipe fez nesta nota ou fatura e se perderia com a retirada, em uma frase. */
export function trabalhoNaFonte(a: AusenteDaFonte): string {
  if (a.tipo === 'FATURA') return a.ciclos ? `está no ciclo de pagamento ${a.ciclos}` : 'está num ciclo de pagamento';
  const partes: string[] = [];
  if (a.distribuidoPorNome) partes.push(`distribuição entre os itens feita por ${a.distribuidoPorNome}`);
  if (a.quantidadesInformadas > 0) partes.push(a.quantidadesInformadas === 1 ? 'quantidade informada em 1 item' : `quantidade informada em ${a.quantidadesInformadas} itens`);
  if (a.unidades) partes.push(`unidade interna escolhida (${a.unidades})`);
  return partes.join(', ') || 'trabalho da equipe';
}

/** Rótulo curto: "nota 2025NE000123" ou "fatura 456". */
export function rotuloAusente(a: Pick<AusenteDaFonte, 'tipo' | 'numero' | 'chave'>): string {
  return `${a.tipo === 'NOTA' ? 'nota' : 'fatura'} ${a.numero || a.chave}`;
}

export async function fetchAusentesDaFonte(): Promise<AusenteDaFonte[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const db = supabase;
  const data = await lerTodasAsPaginas<LinhaAusente>((de, ate) =>
    db.from('v_ausentes_da_fonte').select(COLUNAS).order('tipo').order('chave').range(de, ate)
  );
  return data.map(ausenteDaLinha);
}

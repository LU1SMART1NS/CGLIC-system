/**
 * Dados de apoio das telas do ciclo de pagamento (migration 87):
 * - empenhos do contrato com saldo (empenhado − pago pelas faturas com OB) e natureza de despesa;
 * - faturas do Contratos.gov.br que o ciclo pode pagar (do contrato, não canceladas, não pagas);
 * - "Buscar faturas agora": lê as faturas do contrato no Contratos.gov.br e grava (mesma RPC do servidor).
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { fetchContratosGovFaturas } from './api';
import { gravarFaturasDoContrato, normalizarFatura, type FaturaParaGravar } from './faturasService';

/** Natureza de despesa dos bens a incorporar: equipamentos e material permanente (vão à COLOG). */
export const ND_BENS_A_INCORPORAR = '449052';

export function ehBemAIncorporar(naturezaDespesa?: string | null): boolean {
  return (naturezaDespesa ?? '').trim().startsWith(ND_BENS_A_INCORPORAR);
}

export interface EmpenhoParaPagamento {
  canonicalKey: string;
  numero: string;
  valorEmpenhado: number;
  valorPago: number;
  saldo: number;
  naturezaDespesa: string | null;
  naturezaDescricao: string | null;
}

export async function fetchEmpenhosDoContratoParaPagamento(contractKey: string): Promise<EmpenhoParaPagamento[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const vinculos = await supabase.from('contrato_empenhos').select('empenho_id').eq('contract_key', contractKey);
  if (vinculos.error) throw mapPostgresErrorToAppError(vinculos.error);
  const ids = [...new Set((vinculos.data ?? []).map((v: any) => String(v.empenho_id)))];
  if (ids.length === 0) return [];

  const emp = await supabase
    .from('empenhos')
    .select('id, canonical_key, numero_oficial, valor_empenhado, natureza_despesa, natureza_despesa_descricao, identificador_fonte, data_emissao')
    .in('id', ids);
  if (emp.error) throw mapPostgresErrorToAppError(emp.error);
  const empenhos = (emp.data ?? []) as any[];

  const idsGov = empenhos.map((e) => e.identificador_fonte).filter(Boolean) as string[];
  const pagoPorIdGov = new Map<string, number>();
  if (idsGov.length > 0) {
    const fe = await supabase.from('fatura_empenhos').select('id_fatura, id_empenho_gov, valor').in('id_empenho_gov', idsGov);
    if (fe.error) throw mapPostgresErrorToAppError(fe.error);
    const idsFatura = [...new Set((fe.data ?? []).map((f: any) => Number(f.id_fatura)))];
    const pagas = new Set<number>();
    if (idsFatura.length > 0) {
      const vf = await supabase.from('v_contrato_faturas').select('id_fatura, paga, cancelada').in('id_fatura', idsFatura);
      if (vf.error) throw mapPostgresErrorToAppError(vf.error);
      for (const f of (vf.data ?? []) as any[]) if (f.paga && !f.cancelada) pagas.add(Number(f.id_fatura));
    }
    for (const f of (fe.data ?? []) as any[]) {
      if (pagas.has(Number(f.id_fatura))) pagoPorIdGov.set(f.id_empenho_gov, (pagoPorIdGov.get(f.id_empenho_gov) ?? 0) + Number(f.valor ?? 0));
    }
  }

  return empenhos
    .map((e) => {
      const valorEmpenhado = Number(e.valor_empenhado ?? 0);
      const valorPago = Math.round((pagoPorIdGov.get(String(e.identificador_fonte ?? '')) ?? 0) * 100) / 100;
      return {
        canonicalKey: String(e.canonical_key),
        numero: String(e.numero_oficial ?? e.canonical_key),
        valorEmpenhado,
        valorPago,
        saldo: Math.max(0, Math.round((valorEmpenhado - valorPago) * 100) / 100),
        naturezaDespesa: e.natureza_despesa ?? null,
        naturezaDescricao: e.natureza_despesa_descricao ?? null,
        dataEmissao: e.data_emissao ?? ''
      };
    })
    .sort((a, b) => b.saldo - a.saldo || b.dataEmissao.localeCompare(a.dataEmissao))
    .map(({ dataEmissao: _d, ...e }) => e);
}

export interface FaturaParaCiclo {
  idFatura: number;
  numero: string | null;
  referencia: string | null;
  emissao: string | null;
  valorLiquido: number;
  situacao: string | null;
  empenhos: string | null;
  liquidada: boolean;
  /** Ciclo que já paga esta fatura (null = livre). */
  cicloId: string | null;
}

/** Faturas não canceladas e não pagas do contrato, com o ciclo que já as tem (se algum). */
export async function fetchFaturasParaCiclo(contractKey: string): Promise<FaturaParaCiclo[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const vf = await supabase
    .from('v_contrato_faturas')
    .select('id_fatura, numero, referencia, emissao, valor_liquido, situacao, empenhos, data_liquidacao, cancelada, paga')
    .eq('contract_key', contractKey)
    .eq('cancelada', false)
    .eq('paga', false)
    .order('emissao', { ascending: false });
  if (vf.error) throw mapPostgresErrorToAppError(vf.error);
  const faturas = (vf.data ?? []) as any[];
  const ids = faturas.map((f) => Number(f.id_fatura));
  const ligadas = new Map<number, string>();
  if (ids.length > 0) {
    const cf = await supabase.from('contract_payment_cycle_faturas').select('id_fatura, cycle_id').in('id_fatura', ids);
    if (cf.error) throw mapPostgresErrorToAppError(cf.error);
    for (const l of (cf.data ?? []) as any[]) ligadas.set(Number(l.id_fatura), String(l.cycle_id));
  }
  return faturas.map((f) => ({
    idFatura: Number(f.id_fatura),
    numero: f.numero ?? null,
    referencia: f.referencia ?? null,
    emissao: f.emissao ?? null,
    valorLiquido: Number(f.valor_liquido ?? 0),
    situacao: f.situacao ?? null,
    empenhos: f.empenhos ?? null,
    liquidada: Boolean(f.data_liquidacao),
    cicloId: ligadas.get(Number(f.id_fatura)) ?? null
  }));
}

/** Lê agora as faturas do contrato no Contratos.gov.br e grava (substitui o conjunto, como o servidor). */
export async function buscarFaturasDoContratoAgora(contractKey: string, contratoIdGov: string | number): Promise<number> {
  const brutas = await fetchContratosGovFaturas(contratoIdGov);
  const lista = brutas.map((f) => normalizarFatura(f, contratoIdGov)).filter((f): f is FaturaParaGravar => f !== null);
  const r = await gravarFaturasDoContrato(contractKey, lista);
  return r?.gravadas ?? lista.length;
}

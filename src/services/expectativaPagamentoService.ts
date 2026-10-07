/**
 * Expectativa de pagamento do contrato (migration 89): MENSAL, ENTREGA (entregas previstas) ou EVENTUAL; sem marca =
 * automático, com a sugestão do sistema pelo histórico (pago nos 3 últimos meses fechados = mensal).
 * Base da previsão mensal da Portaria DGFNSP 50/2025 (art. 5º, § 2º, III) e dos avisos de nota que não chegou.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import type { FaturaCarteira } from './financeiroCarteiraService';

export type TipoExpectativa = 'MENSAL' | 'ENTREGA' | 'EVENTUAL';

export interface ExpectativaPagamento {
  contractKey: string;
  tipo: TipoExpectativa;
  valorMensal: number | null;
  observacao: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string;
}

export interface EntregaPrevista {
  id: string;
  contractKey: string;
  dataPrevista: string;
  valor: number;
  empenhoCanonicalKey: string | null;
  descricao: string;
  situacao: 'PREVISTA' | 'CANCELADA';
  motivoCancelamento: string | null;
  criadoPorNome: string | null;
}

export interface ExpectativasDados {
  marcas: Map<string, ExpectativaPagamento>;
  entregas: EntregaPrevista[];
}

export async function fetchExpectativasPagamento(): Promise<ExpectativasDados> {
  if (!isSupabaseConfigured || !supabase) return { marcas: new Map(), entregas: [] };
  const [m, e] = await Promise.all([
    supabase.from('contrato_expectativa_pagamento').select('*'),
    supabase.from('contrato_entregas_previstas').select('*').order('data_prevista', { ascending: true })
  ]);
  if (m.error) throw mapPostgresErrorToAppError(m.error);
  if (e.error) throw mapPostgresErrorToAppError(e.error);
  const marcas = new Map<string, ExpectativaPagamento>();
  for (const r of (m.data ?? []) as any[]) {
    marcas.set(String(r.contract_key), {
      contractKey: String(r.contract_key),
      tipo: r.tipo,
      valorMensal: r.valor_mensal == null ? null : Number(r.valor_mensal),
      observacao: r.observacao ?? null,
      atualizadoPorNome: r.atualizado_por_nome ?? null,
      atualizadoEm: r.atualizado_em
    });
  }
  const entregas = ((e.data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    contractKey: String(r.contract_key),
    dataPrevista: String(r.data_prevista),
    valor: Number(r.valor),
    empenhoCanonicalKey: r.empenho_canonical_key ?? null,
    descricao: r.descricao,
    situacao: r.situacao,
    motivoCancelamento: r.motivo_cancelamento ?? null,
    criadoPorNome: r.criado_por_nome ?? null
  }));
  return { marcas, entregas };
}

async function rpc(nome: string, args: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  const { error } = await supabase.rpc(nome, args);
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Marca o tipo do contrato; `tipo` null volta ao automático. */
export function definirExpectativaPagamento(input: {
  contractKey: string;
  tipo: TipoExpectativa | null;
  valorMensal?: number | null;
  observacao?: string | null;
  registradoPorNome?: string;
}): Promise<void> {
  return rpc('definir_expectativa_pagamento', {
    p_contract_key: input.contractKey,
    p_tipo: input.tipo,
    p_valor_mensal: input.tipo === 'MENSAL' ? (input.valorMensal ?? null) : null,
    p_observacao: input.observacao ?? null,
    p_registrado_por_nome: input.registradoPorNome ?? null
  });
}

export function salvarEntregaPrevista(input: {
  id?: string | null;
  contractKey: string;
  dataPrevista: string;
  valor: number;
  descricao: string;
  empenhoCanonicalKey?: string | null;
  registradoPorNome?: string;
}): Promise<void> {
  return rpc('salvar_entrega_prevista', {
    p_id: input.id ?? null,
    p_contract_key: input.contractKey,
    p_data_prevista: input.dataPrevista,
    p_valor: input.valor,
    p_descricao: input.descricao,
    p_empenho_canonical_key: input.empenhoCanonicalKey ?? null,
    p_registrado_por_nome: input.registradoPorNome ?? null
  });
}

export function cancelarEntregaPrevista(id: string, motivo: string): Promise<void> {
  return rpc('cancelar_entrega_prevista', { p_id: id, p_motivo: motivo });
}

// -----------------------------------------------------------------------------------------------------
// Sugestão pelo histórico de pagamentos
// -----------------------------------------------------------------------------------------------------

/** Os 3 últimos meses fechados antes de `hoje` (AAAA-MM), do mais antigo ao mais recente. */
export function ultimosMesesFechados(hoje: Date = new Date(), quantos = 3): string[] {
  const meses: string[] = [];
  for (let i = quantos; i >= 1; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

export interface HistoricoPagamentos {
  /** Valor pago em cada um dos 3 últimos meses fechados (0 = sem pagamento). */
  porMes: Array<{ mes: string; valor: number }>;
  mesesComPagamento: number;
  media: number | null;
  menor: number | null;
  maior: number | null;
}

/** Sugestão do sistema para contrato sem marca: 3 de 3 meses pagos = mensal; 2 de 3 = talvez mensal. */
export type SugestaoExpectativa = 'MENSAL' | 'TALVEZ_MENSAL' | null;

/** Pagamentos (faturas com OB válida, pela data da OB) de cada contrato nos meses informados. */
export function historicoDePagamentos(faturas: Array<Pick<FaturaCarteira, 'contractKey' | 'paga' | 'cancelada' | 'obEmissao' | 'valorLiquido'>>, meses: string[]): Map<string, HistoricoPagamentos> {
  const somas = new Map<string, Map<string, number>>();
  for (const f of faturas) {
    if (!f.paga || f.cancelada || !f.obEmissao) continue;
    const mes = f.obEmissao.slice(0, 7);
    if (!meses.includes(mes)) continue;
    const doContrato = somas.get(f.contractKey) ?? new Map<string, number>();
    doContrato.set(mes, (doContrato.get(mes) ?? 0) + f.valorLiquido);
    somas.set(f.contractKey, doContrato);
  }
  const resultado = new Map<string, HistoricoPagamentos>();
  for (const [contractKey, porMesMap] of somas) {
    const porMes = meses.map((mes) => ({ mes, valor: Math.round((porMesMap.get(mes) ?? 0) * 100) / 100 }));
    const pagos = porMes.filter((p) => p.valor > 0).map((p) => p.valor);
    resultado.set(contractKey, {
      porMes,
      mesesComPagamento: pagos.length,
      media: pagos.length ? Math.round((pagos.reduce((s, v) => s + v, 0) / pagos.length) * 100) / 100 : null,
      menor: pagos.length ? Math.min(...pagos) : null,
      maior: pagos.length ? Math.max(...pagos) : null
    });
  }
  return resultado;
}

export function sugerirExpectativa(historico: HistoricoPagamentos | undefined, totalDeMeses = 3): SugestaoExpectativa {
  const n = historico?.mesesComPagamento ?? 0;
  if (n >= totalDeMeses) return 'MENSAL';
  if (n === totalDeMeses - 1) return 'TALVEZ_MENSAL';
  return null;
}

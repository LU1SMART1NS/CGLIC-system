import { supabase, isSupabaseConfigured } from './supabaseClient';
import { normalizeEmpenhoNumero } from './empenhoNormalizationService';

/**
 * Como a fatura foi paga, lido do que o sistema já guarda: as OBs que confirmam o pagamento (fatura_pagamento,
 * migration 123) e as notas que cada OB cita (ordens_bancarias.empenhos). Serve à conferência de Empenhos ao contrato:
 * a OB mostra qual nota foi paga de fato, que nem sempre é a que a fatura cita.
 */

export interface ObDaFatura {
  numero: string;
  emissao: string | null;
  valor: number;
  /** Notas que a OB cita, como vêm do Tesouro sem UG ("2024NE000566"). */
  notas: string[];
}

export interface PagamentoDaFatura {
  obs: ObDaFatura[];
  /** Notas vinculadas ao contrato da fatura (numero_oficial), para dizer qual das pagas é deste contrato. */
  notasDoContrato: string[];
}

const FORMATO_OB = /\d{4}OB\d{6}/g;

/** Lê o pagamento da fatura. Null quando o banco não está configurado ou a fatura não tem OB confirmada. */
export async function fetchPagamentoDaFatura(idFatura: number, contractKey: string): Promise<PagamentoDaFatura | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const [pagamento, fatura] = await Promise.all([
    supabase.from('fatura_pagamento').select('ordens_bancarias').eq('id_fatura', idFatura).maybeSingle(),
    supabase.from('contrato_faturas').select('np').eq('id_fatura', idFatura).maybeSingle()
  ]);
  if (pagamento.error) throw pagamento.error;
  if (fatura.error) throw fatura.error;
  const numeros = String((pagamento.data as any)?.ordens_bancarias ?? '').toUpperCase().match(FORMATO_OB) ?? [];
  const np = (fatura.data as any)?.np;
  if (numeros.length === 0 || !np) return null;

  const [ordens, vinculos] = await Promise.all([
    supabase.from('ordens_bancarias').select('numero, emissao, valor, empenhos').eq('np', np).eq('cancelada', false).in('numero', numeros),
    supabase.from('contrato_empenhos').select('empenho_id').eq('contract_key', contractKey)
  ]);
  if (ordens.error) throw ordens.error;
  if (vinculos.error) throw vinculos.error;

  const ids = (vinculos.data ?? []).map((v: any) => String(v.empenho_id));
  let notasDoContrato: string[] = [];
  if (ids.length > 0) {
    const notas = await supabase.from('empenhos').select('numero_oficial').in('id', ids);
    if (notas.error) throw notas.error;
    notasDoContrato = (notas.data ?? []).map((n: any) => String(n.numero_oficial));
  }

  const vistas = new Set<string>();
  const obs: ObDaFatura[] = [];
  for (const o of (ordens.data ?? []) as any[]) {
    if (vistas.has(o.numero)) continue;
    vistas.add(o.numero);
    obs.push({
      numero: String(o.numero),
      emissao: o.emissao ?? null,
      valor: Number(o.valor ?? 0),
      notas: (Array.isArray(o.empenhos) ? o.empenhos : []).map(String).filter((n: string) => /NE\d+$/i.test(n))
    });
  }
  obs.sort((a, b) => (a.emissao ?? '').localeCompare(b.emissao ?? '') || a.numero.localeCompare(b.numero));
  return obs.length > 0 ? { obs, notasDoContrato } : null;
}

/** Mesma chave nos dois lados: "2024NE000566" e "2024ne566" são a mesma nota. */
export const chaveDaNota = (numero: string | null | undefined) => normalizeEmpenhoNumero(numero);

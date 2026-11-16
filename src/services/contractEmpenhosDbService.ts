import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Coluna ou tabela ainda inexistente (migration 85 não aplicada). */
const colunaAusente = (error: any) =>
  ['42703', 'PGRST204', 'PGRST200'].includes(String(error?.code ?? '')) || /does not exist|Could not find/i.test(String(error?.message ?? ''));

interface VinculoGravado {
  empenho_id: string;
  origem?: 'FONTE' | 'MANUAL' | 'EMENDA';
  vinculado_por_nome?: string | null;
  motivo_manual?: string | null;
  created_at?: string | null;
}

/** Vínculos do contrato; sem as colunas da migration 85, lê só o empenho (todos contam como FONTE). */
async function lerVinculos(contractKey: string): Promise<VinculoGravado[]> {
  const completo = await supabase!
    .from('contrato_empenhos')
    .select('empenho_id, origem, vinculado_por_nome, motivo_manual, created_at')
    .eq('contract_key', contractKey);
  if (!completo.error) return (completo.data ?? []) as VinculoGravado[];
  if (!colunaAusente(completo.error)) throw completo.error;
  const simples = await supabase!.from('contrato_empenhos').select('empenho_id').eq('contract_key', contractKey);
  if (simples.error) throw simples.error;
  return (simples.data ?? []) as VinculoGravado[];
}

/** Execução da nota no Tesouro (saldo contábil do STA, v_empenho_saldo_contabil, migrations 128 e 135). */
export interface ExecucaoTesouroDaNota {
  /** Pago em todos os anos (exercício e restos a pagar). */
  pago: number;
  /** Pago mais o que já foi liquidado e espera pagamento. */
  liquidado: number;
  /** A liquidar mais liquidado a pagar, no ano mais recente lido. */
  saldo: number;
  atualizadoEm: string | null;
}

/**
 * Liquidado e pago das notas pelo Tesouro, por id do empenho. O Contratos.gov.br quase nunca atualiza esses campos
 * (16/11/2026: pago zerado em 1.191 de 2.391 notas que o Tesouro mostra pagas). Falha na leitura não derruba a tabela:
 * as notas ficam com os números da fonte.
 */
async function lerExecucaoTesouro(ids: string[]): Promise<Map<string, ExecucaoTesouroDaNota>> {
  const mapa = new Map<string, ExecucaoTesouroDaNota>();
  const { data, error } = await supabase!
    .from('v_empenho_saldo_contabil')
    .select('empenho_id, pago_total, exercicio_a_liquidar, exercicio_liquidado_a_pagar, rp_a_liquidar, rp_liquidado_a_pagar, atualizado_tesouro')
    .in('empenho_id', ids);
  if (error) {
    console.warn('[contractEmpenhosDb] saldo do Tesouro não lido:', error);
    return mapa;
  }
  const centavos = (v: number) => Math.round(v * 100) / 100;
  for (const r of (data ?? []) as any[]) {
    const pago = Number(r.pago_total ?? 0);
    const liquidadoAPagar = Number(r.exercicio_liquidado_a_pagar ?? 0) + Number(r.rp_liquidado_a_pagar ?? 0);
    const aLiquidar = Number(r.exercicio_a_liquidar ?? 0) + Number(r.rp_a_liquidar ?? 0);
    mapa.set(String(r.empenho_id), {
      pago: centavos(pago),
      liquidado: centavos(pago + liquidadoAPagar),
      saldo: centavos(aLiquidar + liquidadoAPagar),
      atualizadoEm: r.atualizado_tesouro ?? null
    });
  }
  return mapa;
}

/**
 * Empenhos gravados no sistema para um contrato: os vínculos de `contrato_empenhos` ligados à
 * `v_empenhos_resumo`. É a mesma fonte que o Item usa; nada é lido da API aqui.
 * Cada linha traz `outros_contratos`: as chaves dos demais contratos a que a mesma NE está ligada
 * (o Contratos.gov.br lista a NE em mais de um contrato; o valor dela entra inteiro em cada um),
 * e a origem do vínculo (FONTE ou MANUAL, migration 85), com quem vinculou à mão e por quê.
 * `tesouro` traz liquidado, pago e saldo da nota pelo Tesouro, quando ela está no saldo contábil.
 */
export async function fetchContractEmpenhosFromDb(contractKey: string): Promise<any[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];

  const links = await lerVinculos(contractKey);
  const vinculoPorEmpenho = new Map(links.map((l) => [String(l.empenho_id), l]));
  const ids = Array.from(vinculoPorEmpenho.keys());
  if (ids.length === 0) return [];

  const [{ data: rows, error }, { data: outros, error: outrosError }, tesouro] = await Promise.all([
    supabase.from('v_empenhos_resumo').select('*').in('empenho_id', ids),
    supabase.from('contrato_empenhos').select('empenho_id, contract_key').in('empenho_id', ids).neq('contract_key', contractKey),
    lerExecucaoTesouro(ids)
  ]);
  if (error) throw error;
  // Sem a lista dos outros contratos a tabela ainda funciona: só não marca as NEs compartilhadas.
  if (outrosError) console.warn('[contractEmpenhosDb] outros contratos das NEs não lidos:', outrosError);

  const outrosPorEmpenho = new Map<string, string[]>();
  for (const o of outros ?? []) {
    const id = String(o.empenho_id);
    outrosPorEmpenho.set(id, [...(outrosPorEmpenho.get(id) ?? []), String(o.contract_key)]);
  }
  return (rows ?? []).map((r: any) => {
    const v = vinculoPorEmpenho.get(String(r.empenho_id));
    return {
      ...r,
      outros_contratos: (outrosPorEmpenho.get(String(r.empenho_id)) ?? []).sort(),
      origem_vinculo: v?.origem === 'MANUAL' || v?.origem === 'EMENDA' ? v.origem : 'FONTE',
      vinculado_por_nome: v?.vinculado_por_nome ?? undefined,
      motivo_manual: v?.motivo_manual ?? undefined,
      vinculado_em: v?.created_at ?? undefined,
      tesouro: tesouro.get(String(r.empenho_id))
    };
  });
}

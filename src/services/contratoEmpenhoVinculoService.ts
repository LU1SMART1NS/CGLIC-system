import { supabase, isSupabaseConfigured } from './supabaseClient';
import { normalizeAnoExercicio, normalizeEmpenhoNumero } from './empenhoNormalizationService';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Vínculo híbrido empenho ↔ contrato (migration 85). A sincronização com o Contratos.gov.br continua
 * sendo a regra; a equipe pode:
 *  - descartar um empenho que a fonte lista no contrato errado (a sincronização não o recoloca);
 *  - restaurar um descarte;
 *  - vincular à mão um empenho que a fonte não lista (já gravado no sistema ou informado pela equipe);
 *  - desvincular um vínculo feito à mão.
 */

export interface DescarteEmpenhoContrato {
  contractKey: string;
  empenhoId: string;
  motivo: string;
  descartadoPorNome?: string;
  descartadoEm?: string;
  numeroOficial?: string;
  uasgEmitente?: string;
  credorNome?: string;
  valorEmpenhado?: number;
}

/** Empenho gravado no sistema, candidato a vínculo manual. */
export interface EmpenhoEncontrado {
  empenhoId: string;
  numeroOficial: string;
  uasgEmitente: string;
  dataEmissao?: string;
  valorEmpenhado: number;
  credorNome?: string;
  credorCnpjCpf?: string;
  fonteOrigem?: string;
}

/** Dados de uma NE que o sistema ainda não tem, informados pela equipe. */
export interface NovaNotaEmpenho {
  numero: string;
  uasgEmitente: string;
  dataEmissao: string;
  valorEmpenhado: number;
  credorNome?: string;
  credorCnpjCpf?: string;
}

const MIGRATION_AUSENTE = 'Esta ação ainda não está disponível: falta aplicar no banco a migration 85 (vínculo híbrido de empenhos).';

/** Mensagem legível de um erro das RPCs da migration 85 (tira o código do começo). */
export function mensagemDoErroDeVinculo(error: any): string {
  if (rpcInexistente(error)) return MIGRATION_AUSENTE;
  const bruta = String(error?.message ?? error ?? '');
  if (/UNAUTHORIZED/.test(bruta) || error?.code === '42501') return 'Só gestor ou coordenador pode alterar os empenhos do contrato.';
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'O banco recusou a operação.';
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

async function chamar(rpc: string, params: Record<string, unknown>): Promise<any> {
  const { data, error } = await requireSupabase().rpc(rpc, params);
  if (error) throw new Error(mensagemDoErroDeVinculo(error));
  return data;
}

/** Tabela ou coluna ausente (migration 85 não aplicada): a tela segue sem os recursos novos. */
export function recursoAusente(error: any): boolean {
  const code = String(error?.code ?? '');
  return code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST200' ||
    /does not exist|Could not find/i.test(String(error?.message ?? ''));
}

/** Empenhos descartados de um contrato, com os dados da NE. Sem a tabela, devolve vazio. */
export async function fetchDescartesEmpenhoContrato(contractKey: string): Promise<DescarteEmpenhoContrato[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const { data, error } = await supabase
    .from('contrato_empenho_descartes')
    .select('contract_key, empenho_id, motivo, descartado_por_nome, created_at, empenhos(numero_oficial, uasg_emitente, credor_nome, valor_empenhado)')
    .eq('contract_key', contractKey)
    .order('created_at', { ascending: false });
  if (error) {
    if (recursoAusente(error)) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => {
    const e = Array.isArray(row.empenhos) ? row.empenhos[0] : row.empenhos;
    return {
      contractKey: String(row.contract_key),
      empenhoId: String(row.empenho_id),
      motivo: String(row.motivo ?? ''),
      descartadoPorNome: row.descartado_por_nome || undefined,
      descartadoEm: row.created_at || undefined,
      numeroOficial: e?.numero_oficial || undefined,
      uasgEmitente: e?.uasg_emitente || undefined,
      credorNome: e?.credor_nome || undefined,
      valorEmpenhado: e?.valor_empenhado != null ? Number(e.valor_empenhado) : undefined
    };
  });
}

/** Número da NE no formato aceito: AAAANE seguido de 1 a 6 dígitos (ex.: 2025NE000123). */
export function numeroDeEmpenhoValido(numero: string): boolean {
  return /^\d{4}\s*NE\s*\d{1,6}$/i.test(numero.trim());
}

/** Número oficial com 6 dígitos (ex.: "2025ne123" → "2025NE000123"). */
export function numeroOficialDoEmpenho(numero: string): string {
  const m = numero.trim().toUpperCase().match(/^(\d{4})\s*NE\s*(\d{1,6})$/);
  return m ? `${m[1]}NE${m[2].padStart(6, '0')}` : numero.trim().toUpperCase();
}

/**
 * Procura a NE pelo número entre as já gravadas no sistema, em qualquer UG emitente (o mesmo número
 * existe nas UGs 200330 e 200331 como documentos diferentes).
 */
export async function buscarEmpenhosPorNumero(numero: string): Promise<EmpenhoEncontrado[]> {
  if (!isSupabaseConfigured || !supabase || !numeroDeEmpenhoValido(numero)) return [];
  const normalizado = normalizeEmpenhoNumero(numero);
  const { data, error } = await supabase
    .from('empenhos')
    .select('id, numero_oficial, uasg_emitente, data_emissao, valor_empenhado, credor_nome, credor_cnpj_cpf, fonte_origem')
    .eq('numero_normalizado', normalizado)
    .order('uasg_emitente');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    empenhoId: String(r.id),
    numeroOficial: String(r.numero_oficial),
    uasgEmitente: String(r.uasg_emitente),
    dataEmissao: r.data_emissao || undefined,
    valorEmpenhado: Number(r.valor_empenhado ?? 0),
    credorNome: r.credor_nome || undefined,
    credorCnpjCpf: r.credor_cnpj_cpf || undefined,
    fonteOrigem: r.fonte_origem || undefined
  }));
}

/** Payload de save_empenho_soberano_atomic para uma NE informada pela equipe. */
export function payloadDaNovaNota(n: NovaNotaEmpenho): Record<string, unknown> {
  const numeroOficial = numeroOficialDoEmpenho(n.numero);
  const normalizado = normalizeEmpenhoNumero(numeroOficial);
  const ano = normalizeAnoExercicio(null, n.dataEmissao, numeroOficial);
  return {
    uasg_emitente: n.uasgEmitente,
    ano_exercicio: ano,
    numero_oficial: numeroOficial,
    numero_normalizado: normalizado,
    data_emissao: n.dataEmissao,
    valor_empenhado: n.valorEmpenhado,
    credor_nome: n.credorNome?.trim() || undefined,
    credor_cnpj_cpf: n.credorCnpjCpf?.trim() || undefined
  };
}

export async function restaurarEmpenhoDoContrato(input: { contractKey: string; empenhoId: string }) {
  return chamar('restaurar_empenho_do_contrato', { p_contract_key: input.contractKey, p_empenho_id: input.empenhoId });
}

/** Vincula uma NE já gravada (`empenhoId`) ou grava e vincula a NE informada (`novaNota`). */
export async function vincularEmpenhoManual(input: {
  contractKey: string;
  motivo: string;
  empenhoId?: string;
  novaNota?: NovaNotaEmpenho;
}): Promise<{ numeroOficial?: string; empenhoCriado: boolean }> {
  if (!input.empenhoId && !input.novaNota) throw new Error('Escolha um empenho ou informe os dados da nota.');
  const p_empenho = input.empenhoId ? { empenho_id: input.empenhoId } : payloadDaNovaNota(input.novaNota!);
  const data = await chamar('vincular_empenho_manual_ao_contrato', { p_contract_key: input.contractKey, p_empenho, p_motivo: input.motivo });
  return { numeroOficial: data?.numero_oficial || undefined, empenhoCriado: Boolean(data?.empenho_criado) };
}

export async function desvincularEmpenhoManual(input: { contractKey: string; empenhoId: string }) {
  return chamar('desvincular_empenho_manual_do_contrato', { p_contract_key: input.contractKey, p_empenho_id: input.empenhoId });
}

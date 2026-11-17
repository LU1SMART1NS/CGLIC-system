import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
import type { ExecucaoDoContrato } from '../utils/contratoExecutado';

/**
 * Escopo cumprido dos contratos (migration 314): leitura de v_contrato_execucao (só os contratos vigentes que
 * cumprem a regra ou têm decisão gravada) e as decisões do gestor (confirmar, "ainda não terminou", desfazer).
 */

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export function mapExecucao(r: any): ExecucaoDoContrato {
  const estado = r.estado === 'EXECUTADO' || r.estado === 'SUGERIDO' ? r.estado : null;
  return {
    contractKey: String(r.contract_key),
    valorGlobal: num(r.valor_global),
    faturado: num(r.faturado),
    faturasAbertas: num(r.faturas_abertas),
    saldoEmpenho: num(r.saldo_empenho),
    fiscalizacao: r.fiscalizacao === 'FINALIZADA' || r.fiscalizacao === 'EM_CURSO' ? r.fiscalizacao : 'SEM',
    estado,
    decisaoSuperada: Boolean(r.decisao_superada),
    confirmado:
      estado === 'EXECUTADO'
        ? { em: r.decidido_em, por: r.decidido_por_nome || 'Gestor', sei: r.documento_sei || '', dataRecebimento: r.data_recebimento || '' }
        : undefined
  };
}

/** Execução dos contratos vigentes que importam (sugeridos, executados ou com decisão gravada), por contrato. */
export async function fetchExecucaoDosContratos(): Promise<Map<string, ExecucaoDoContrato>> {
  if (!isSupabaseConfigured || !supabase) return new Map();
  const db = supabase;
  const linhas = await lerTodasAsPaginas<any>((de, ate) =>
    db
      .from('v_contrato_execucao')
      .select('contract_key, valor_global, faturado, faturas_abertas, saldo_empenho, fiscalizacao, estado, decisao_superada, documento_sei, data_recebimento, decidido_por_nome, decidido_em')
      .order('contract_key')
      .range(de, ate)
  );
  return new Map((linhas || []).map((r) => [String(r.contract_key), mapExecucao(r)]));
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) throw new Error('O banco não está configurado.');
  return supabase;
}

/** Mensagem legível de um erro das RPCs (tira o código do começo). */
export function mensagemDoErroDaExecucao(error: any): string {
  const bruta = String(error?.message ?? error ?? '');
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(bruta)) {
    return 'O banco ainda não tem esta função. Avise o coordenador.';
  }
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'O banco recusou a operação.';
}

async function chamar(nome: string, args: Record<string, unknown>) {
  const { error } = await requireSupabase().rpc(nome, args);
  if (error) throw new Error(mensagemDoErroDaExecucao(error));
}

/**
 * O gestor confirma sem SEI nem data (migration 320): o recebimento definitivo é da Fiscalização, e a janela só mostra o
 * que o fiscal registrou. Os dois campos ficam no banco para as confirmações antigas.
 */
export const confirmarExecucaoContrato = (input: { contractKey: string; observacao?: string }) =>
  chamar('confirmar_execucao_contrato', {
    p_contract_key: input.contractKey,
    p_documento_sei: null,
    p_data_recebimento: null,
    p_observacao: input.observacao?.trim() || null
  });

/** Entrega da Fiscalização do contrato, para a conferência do gestor (migration 320). */
export interface EntregaDaExecucao {
  id: string;
  item: string;
  beneficiario: string | null;
  municipio: string | null;
  uf: string | null;
  quantidade: number;
  etapa: string;
  etapaEm: string | null;
  /** SEI do recebimento definitivo, quando o fiscal registrou. */
  trdSei: string | null;
  trdEm: string | null;
}

export function mapEntregaDaExecucao(r: any): EntregaDaExecucao {
  return {
    id: String(r.id),
    item: r.item || 'Item sem nome',
    beneficiario: r.beneficiario || null,
    municipio: r.municipio || null,
    uf: r.uf || null,
    quantidade: num(r.quantidade),
    etapa: String(r.etapa || ''),
    etapaEm: r.etapa_em || null,
    trdSei: r.trd_sei || null,
    trdEm: r.trd_em || null
  };
}

/** Entregas da Fiscalização (SFC) do contrato, com o TRD que o fiscal registrou. */
export async function fetchEntregasDaExecucao(contractKey: string): Promise<EntregaDaExecucao[]> {
  const { data, error } = await requireSupabase().rpc('execucao_entregas_do_contrato', { p_contract_key: contractKey });
  if (error) throw new Error(mensagemDoErroDaExecucao(error));
  return ((data || []) as any[]).map(mapEntregaDaExecucao);
}

export const marcarContratoNaoTerminou = (contractKey: string) => chamar('marcar_contrato_nao_terminou', { p_contract_key: contractKey });

export const desfazerDecisaoExecucao = (contractKey: string) => chamar('desfazer_decisao_execucao', { p_contract_key: contractKey });

/** Só as chaves dos contratos executados (o Início tira deles os lembretes de prorrogação e as contas de vencimento). */
export async function fetchContratosExecutados(): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set();
  const db = supabase;
  const linhas = await lerTodasAsPaginas<{ contract_key: string }>((de, ate) =>
    db.from('v_contrato_execucao').select('contract_key').eq('estado', 'EXECUTADO').order('contract_key').range(de, ate)
  );
  return new Set((linhas || []).map((r) => String(r.contract_key)));
}

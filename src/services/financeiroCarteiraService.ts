/**
 * Leitura das abas do Financeiro (Empenhos e Pagamentos) no padrão das carteiras.
 *
 * Regras que saem dos dados (07/10/2026):
 * - O "liquidado" do empenho no SIAFI é o liquidado ainda não pago e o "pago" é só o do exercício; o pago de
 *   restos a pagar não é gravado. Por isso o pago de cada empenho vem das faturas: soma de fatura_empenhos.valor
 *   (o valor da fatura atribuído àquela NE) das faturas não canceladas cuja NP tem OB válida.
 * - A fatura liga ao empenho pelo id do Contratos.gov.br (fatura_empenhos.id_empenho_gov = empenhos.identificador_fonte).
 * - Ciclos de pagamento ainda não se ligam à fatura: na lista de Pagamentos entram os ciclos em aberto (etapas da
 *   CGLIC e da CGOFI) e as faturas, cada um na sua linha.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { rowToPaymentFollowUpCycle } from './paymentFollowUpService';
import type { RpcContractPaymentCycleRow } from '../types/rpc';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';

const PAGINA = 1000;

/** Lê a tabela ou view inteira, de mil em mil linhas (o PostgREST corta em mil). */
async function lerTudo<T>(tabela: string, colunas: string, ordem: string): Promise<T[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .order(ordem, { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw mapPostgresErrorToAppError(error);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

// -----------------------------------------------------------------------------------------------------
// Faturas (base das duas abas)
// -----------------------------------------------------------------------------------------------------

export interface FaturaCarteira {
  idFatura: number;
  contractKey: string;
  numero: string | null;
  tipo: string | null;
  emissao: string | null;
  vencimento: string | null;
  valorLiquido: number;
  dataLiquidacao: string | null;
  situacao: string | null;
  cancelada: boolean;
  np: string | null;
  referencia: string | null;
  ordensBancarias: string | null;
  obEmissao: string | null;
  paga: boolean;
  npContratos: number;
  empenhos: string | null;
}

export async function fetchFaturasCarteira(): Promise<FaturaCarteira[]> {
  const linhas = await lerTudo<any>(
    'v_contrato_faturas',
    'id_fatura, contract_key, numero, tipo, emissao, vencimento, valor_liquido, data_liquidacao, situacao, cancelada, np, referencia, ordens_bancarias, ob_emissao, paga, np_contratos, empenhos',
    'id_fatura'
  );
  return linhas.map((f) => ({
    idFatura: Number(f.id_fatura),
    contractKey: String(f.contract_key),
    numero: f.numero ?? null,
    tipo: f.tipo ?? null,
    emissao: f.emissao ?? null,
    vencimento: f.vencimento ?? null,
    valorLiquido: Number(f.valor_liquido ?? 0),
    dataLiquidacao: f.data_liquidacao ?? null,
    situacao: f.situacao ?? null,
    cancelada: Boolean(f.cancelada),
    np: f.np ?? null,
    referencia: f.referencia ?? null,
    ordensBancarias: f.ordens_bancarias ?? null,
    obEmissao: f.ob_emissao ?? null,
    paga: Boolean(f.paga),
    npContratos: Number(f.np_contratos ?? 0),
    empenhos: f.empenhos ?? null
  }));
}

// -----------------------------------------------------------------------------------------------------
// Empenhos
// -----------------------------------------------------------------------------------------------------

export interface EmpenhoCarteiraRow {
  empenhoId: string;
  numero: string;
  ano: number | null;
  uasgEmitente: string | null;
  dataEmissao: string | null;
  credorNome: string | null;
  credorDocumento: string | null;
  valorEmpenhado: number;
  /** Soma das faturas pagas que citam o empenho; null quando nenhum contrato dele teve as faturas consultadas. */
  valorPago: number | null;
  saldo: number | null;
  /** Contratos a que o empenho está vinculado (quase sempre um). */
  contractKeys: string[];
}

export type EmpenhoSaldoSituacao = 'COM_SALDO' | 'SEM_SALDO' | 'SEM_CONSULTA';

export function situacaoDoSaldo(row: Pick<EmpenhoCarteiraRow, 'saldo'>): EmpenhoSaldoSituacao {
  if (row.saldo === null) return 'SEM_CONSULTA';
  return row.saldo > 0.005 ? 'COM_SALDO' : 'SEM_SALDO';
}

export interface EmpenhoResumoDb {
  empenho_id: string;
  numero_oficial: string | null;
  ano_exercicio: number | null;
  uasg_emitente: string | null;
  data_emissao: string | null;
  valor_empenhado: number | null;
  credor_nome: string | null;
  credor_cnpj_cpf: string | null;
  identificador_fonte: string | null;
}

export interface FaturaEmpenhoDb {
  id_fatura: number;
  id_empenho_gov: string;
  valor: number | null;
}

/**
 * Junta empenho, vínculos de contrato e faturas pagas. Sem vínculo de contrato o empenho fica de fora: a aba lista
 * os empenhos dos contratos (o vínculo é o que dá gestor, escopo do perfil e destino do clique).
 */
export function montarEmpenhosCarteira(
  empenhos: EmpenhoResumoDb[],
  vinculos: Array<{ empenho_id: string; contract_key: string }>,
  faturaEmpenhos: FaturaEmpenhoDb[],
  faturas: Array<Pick<FaturaCarteira, 'idFatura' | 'paga' | 'cancelada'>>,
  contratosConsultados: Set<string>
): EmpenhoCarteiraRow[] {
  const contratosDoEmpenho = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = contratosDoEmpenho.get(v.empenho_id) ?? [];
    if (!lista.includes(v.contract_key)) lista.push(v.contract_key);
    contratosDoEmpenho.set(v.empenho_id, lista);
  }

  const faturasPagas = new Set(faturas.filter((f) => f.paga && !f.cancelada).map((f) => f.idFatura));
  const pagoPorIdGov = new Map<string, number>();
  for (const fe of faturaEmpenhos) {
    if (!faturasPagas.has(Number(fe.id_fatura))) continue;
    pagoPorIdGov.set(fe.id_empenho_gov, (pagoPorIdGov.get(fe.id_empenho_gov) ?? 0) + Number(fe.valor ?? 0));
  }

  const rows: EmpenhoCarteiraRow[] = [];
  for (const e of empenhos) {
    const contractKeys = contratosDoEmpenho.get(e.empenho_id);
    if (!contractKeys || contractKeys.length === 0) continue;
    const valorEmpenhado = Number(e.valor_empenhado ?? 0);
    const consultado = contractKeys.some((k) => contratosConsultados.has(k));
    const valorPago = consultado ? Math.round((pagoPorIdGov.get(String(e.identificador_fonte ?? '')) ?? 0) * 100) / 100 : null;
    rows.push({
      empenhoId: e.empenho_id,
      numero: e.numero_oficial || '—',
      ano: e.ano_exercicio ?? null,
      uasgEmitente: e.uasg_emitente ?? null,
      dataEmissao: e.data_emissao ?? null,
      credorNome: e.credor_nome ?? null,
      credorDocumento: e.credor_cnpj_cpf ?? null,
      valorEmpenhado,
      valorPago,
      saldo: valorPago === null ? null : Math.max(0, Math.round((valorEmpenhado - valorPago) * 100) / 100),
      contractKeys: [...contractKeys].sort()
    });
  }
  return rows;
}

export async function fetchEmpenhosCarteira(faturas: FaturaCarteira[]): Promise<EmpenhoCarteiraRow[]> {
  const [empenhos, vinculos, faturaEmpenhos, consultados] = await Promise.all([
    lerTudo<EmpenhoResumoDb>(
      'v_empenhos_resumo',
      'empenho_id, numero_oficial, ano_exercicio, uasg_emitente, data_emissao, valor_empenhado, credor_nome, credor_cnpj_cpf, identificador_fonte',
      'empenho_id'
    ),
    lerTudo<{ empenho_id: string; contract_key: string }>('contrato_empenhos', 'empenho_id, contract_key', 'empenho_id'),
    lerTudo<FaturaEmpenhoDb>('fatura_empenhos', 'id_fatura, id_empenho_gov, valor', 'id_fatura'),
    lerTudo<{ contract_key: string }>('contrato_faturas_sincronizacao', 'contract_key', 'contract_key')
  ]);
  return montarEmpenhosCarteira(empenhos, vinculos, faturaEmpenhos, faturas, new Set(consultados.map((c) => c.contract_key)));
}

// -----------------------------------------------------------------------------------------------------
// Pagamentos
// -----------------------------------------------------------------------------------------------------

/** Etapa do pagamento: as duas primeiras vêm do ciclo da CGLIC; as demais, da fatura no SIAFI e no Tesouro. */
export type EtapaPagamento = 'NA_CGLIC' | 'NA_CGOFI' | 'EM_ANDAMENTO' | 'AGUARDANDO_OB' | 'ERRO_SIAFI' | 'PAGA' | 'CANCELADA';

export type PagamentoCarteiraRow =
  | { tipo: 'CICLO'; chave: string; contractKey: string; etapa: EtapaPagamento; ciclo: PaymentFollowUpCycle }
  | { tipo: 'FATURA'; chave: string; contractKey: string; etapa: EtapaPagamento; fatura: FaturaCarteira };

export function etapaDaFatura(f: Pick<FaturaCarteira, 'cancelada' | 'paga' | 'dataLiquidacao' | 'situacao'>): EtapaPagamento {
  if (f.cancelada) return 'CANCELADA';
  if (f.paga) return 'PAGA';
  if (f.dataLiquidacao) return 'AGUARDANDO_OB';
  if (f.situacao === 'Siafi Erro') return 'ERRO_SIAFI';
  return 'EM_ANDAMENTO';
}

/** Etapa do ciclo em aberto; ciclo pago ou cancelado não entra na lista (a fatura dele já aparece). */
export function etapaDoCiclo(ciclo: Pick<PaymentFollowUpCycle, 'status'>): EtapaPagamento | null {
  switch (ciclo.status) {
    case 'RECEBIDO':
    case 'COM_PENDENCIA':
    case 'CONFERIDO':
    case 'DEVOLVIDO':
      return 'NA_CGLIC';
    case 'ENVIADO_CGOFI':
      return 'NA_CGOFI';
    default:
      return null;
  }
}

export function montarPagamentosCarteira(ciclos: PaymentFollowUpCycle[], faturas: FaturaCarteira[]): PagamentoCarteiraRow[] {
  const rows: PagamentoCarteiraRow[] = [];
  for (const ciclo of ciclos) {
    const etapa = etapaDoCiclo(ciclo);
    if (etapa) rows.push({ tipo: 'CICLO', chave: `ciclo-${ciclo.cycleKey}`, contractKey: ciclo.contractKey, etapa, ciclo });
  }
  for (const fatura of faturas) {
    rows.push({ tipo: 'FATURA', chave: `fatura-${fatura.idFatura}`, contractKey: fatura.contractKey, etapa: etapaDaFatura(fatura), fatura });
  }
  return rows;
}

export async function fetchCiclosEmAberto(): Promise<PaymentFollowUpCycle[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('contract_payment_cycles')
    .select('*')
    .in('status', ['RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI'])
    .order('criado_em', { ascending: false });
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as RpcContractPaymentCycleRow[]).map((row) => rowToPaymentFollowUpCycle(row));
}

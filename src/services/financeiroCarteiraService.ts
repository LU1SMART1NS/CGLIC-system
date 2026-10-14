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
import type { RpcContractPaymentCycleRow, RpcPaymentCycleItemRow } from '../types/rpc';
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
  /** NEs citadas pela fatura que não estão vinculadas ao contrato no sistema (quantidade e números). */
  empenhosSemVinculo: number;
  empenhosSemVinculoNumeros: string | null;
  /**
   * Há OB da NP na UG da fatura, mas ela não confirma o pagamento (favorecido de outra despesa, migration 123): a
   * fatura não está paga e fica "a conferir". obsAConferir traz as OBs e os favorecidos.
   */
  pagamentoAConferir?: boolean;
  obsAConferir?: string | null;
  /**
   * Para fatura a conferir: o que o saldo contábil do Tesouro diz dos empenhos dela (migration 132). PAGO = o pago
   * no Tesouro cobre as faturas do empenho; PARCIAL = cobre em parte; NAO_PAGO = não passa do já confirmado.
   */
  situacaoTesouro?: SituacaoTesouroFatura | null;
}

export type SituacaoTesouroFatura = 'PAGO' | 'PARCIAL' | 'NAO_PAGO';

/** O que o Tesouro diz das faturas a conferir, por id da fatura (v_fatura_conferencia_tesouro). */
async function lerConferenciaTesouro(): Promise<Map<number, SituacaoTesouroFatura>> {
  const linhas = await lerTudo<{ id_fatura: number; situacao_tesouro: SituacaoTesouroFatura }>(
    'v_fatura_conferencia_tesouro',
    'id_fatura, situacao_tesouro',
    'id_fatura'
  );
  return new Map(linhas.map((l) => [Number(l.id_fatura), l.situacao_tesouro]));
}

export async function fetchFaturasCarteira(): Promise<FaturaCarteira[]> {
  const [linhas, tesouro] = await Promise.all([
    lerTudo<any>(
      'v_contrato_faturas',
      'id_fatura, contract_key, numero, tipo, emissao, vencimento, valor_liquido, data_liquidacao, situacao, cancelada, np, referencia, ordens_bancarias, ob_emissao, paga, np_contratos, empenhos, empenhos_sem_vinculo, empenhos_sem_vinculo_numeros, pagamento_a_conferir, obs_a_conferir',
      'id_fatura'
    ),
    // O aviso do Tesouro é um extra: se a leitura falhar, a lista de pagamentos sai sem ele.
    lerConferenciaTesouro().catch(() => new Map<number, SituacaoTesouroFatura>())
  ]);
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
    empenhos: f.empenhos ?? null,
    empenhosSemVinculo: Number(f.empenhos_sem_vinculo ?? 0),
    empenhosSemVinculoNumeros: f.empenhos_sem_vinculo_numeros ?? null,
    pagamentoAConferir: Boolean(f.pagamento_a_conferir),
    obsAConferir: f.obs_a_conferir ?? null,
    situacaoTesouro: tesouro.get(Number(f.id_fatura)) ?? null
  }));
}

// -----------------------------------------------------------------------------------------------------
// Empenhos
// -----------------------------------------------------------------------------------------------------

export interface EmpenhoCarteiraRow {
  empenhoId: string;
  /** Chave canônica do empenho ({uasg}-{ano}-{número normalizado}), a mesma dos ciclos e das entregas. */
  canonicalKey?: string | null;
  numero: string;
  ano: number | null;
  uasgEmitente: string | null;
  dataEmissao: string | null;
  credorNome: string | null;
  credorDocumento: string | null;
  valorEmpenhado: number;
  /**
   * Pago do empenho. Pelo Tesouro (saldo contábil do SIAFI, migration 128) quando o empenho está lá; senão, a soma
   * das faturas pagas. Null quando não há nenhuma das duas fontes.
   */
  valorPago: number | null;
  /** De onde veio o pago e o saldo. */
  fontePago?: 'TESOURO' | 'FATURAS' | null;
  /** Soma das faturas pagas que citam o empenho (para comparar com o Tesouro); null sem faturas consultadas. */
  valorPagoFaturas?: number | null;
  /** Saldo a pagar. Pelo Tesouro: a liquidar + liquidado a pagar (no ano e em restos a pagar). Pelas faturas: empenhado − pago. */
  saldo: number | null;
  /** Parte do saldo já liquidada, esperando pagamento (só pelo Tesouro). */
  liquidadoAPagar?: number | null;
  /** Quando o Tesouro publicou o saldo usado (horário de Brasília). */
  tesouroAtualizadoEm?: string | null;
  /** Contratos a que o empenho está vinculado (quase sempre um). */
  contractKeys: string[];
  /** Plano interno e natureza de despesa (migration 87; vazios até a sincronização reler o contrato). */
  planoInterno?: string | null;
  naturezaDespesa?: string | null;
}

export type EmpenhoSaldoSituacao = 'COM_SALDO' | 'SEM_SALDO' | 'SEM_CONSULTA';

export function situacaoDoSaldo(row: Pick<EmpenhoCarteiraRow, 'saldo'>): EmpenhoSaldoSituacao {
  if (row.saldo === null) return 'SEM_CONSULTA';
  return row.saldo > 0.005 ? 'COM_SALDO' : 'SEM_SALDO';
}

export interface EmpenhoResumoDb {
  empenho_id: string;
  canonical_key?: string | null;
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

/** Saldo contábil do Tesouro de um empenho do sistema (v_empenho_saldo_contabil, migration 128). */
export interface SaldoTesouroEmpenho {
  pagoTotal: number;
  aLiquidar: number;
  liquidadoAPagar: number;
  atualizadoEm: string | null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Junta empenho, vínculos de contrato, faturas pagas e o saldo do Tesouro. Sem vínculo de contrato o empenho fica de
 * fora: a aba lista os empenhos dos contratos (o vínculo é o que dá gestor, escopo do perfil e destino do clique).
 *
 * Pago e saldo vêm do Tesouro quando o empenho está no saldo contábil; a soma das faturas fica ao lado, para comparar.
 * Na soma das faturas, a parte de cada empenho vem da fatura; quando as partes passam do valor da fatura (a fonte às
 * vezes manda o valor do empenho inteiro), elas são reduzidas na proporção (estudo do saldo contábil, 14/10/2026).
 */
export function montarEmpenhosCarteira(
  empenhos: EmpenhoResumoDb[],
  vinculos: Array<{ empenho_id: string; contract_key: string }>,
  faturaEmpenhos: FaturaEmpenhoDb[],
  faturas: Array<Pick<FaturaCarteira, 'idFatura' | 'paga' | 'cancelada'> & { valorLiquido?: number }>,
  contratosConsultados: Set<string>,
  saldosTesouro: Map<string, SaldoTesouroEmpenho> = new Map()
): EmpenhoCarteiraRow[] {
  const contratosDoEmpenho = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = contratosDoEmpenho.get(v.empenho_id) ?? [];
    if (!lista.includes(v.contract_key)) lista.push(v.contract_key);
    contratosDoEmpenho.set(v.empenho_id, lista);
  }

  const faturasPagas = new Map(faturas.filter((f) => f.paga && !f.cancelada).map((f) => [f.idFatura, f]));
  const somaDasPartes = new Map<number, number>();
  for (const fe of faturaEmpenhos) {
    const id = Number(fe.id_fatura);
    if (faturasPagas.has(id)) somaDasPartes.set(id, (somaDasPartes.get(id) ?? 0) + Number(fe.valor ?? 0));
  }
  const pagoPorIdGov = new Map<string, number>();
  for (const fe of faturaEmpenhos) {
    const id = Number(fe.id_fatura);
    const fatura = faturasPagas.get(id);
    if (!fatura) continue;
    const soma = somaDasPartes.get(id) ?? 0;
    const teto = fatura.valorLiquido;
    const fator = teto !== undefined && soma > teto && soma > 0 ? teto / soma : 1;
    pagoPorIdGov.set(fe.id_empenho_gov, (pagoPorIdGov.get(fe.id_empenho_gov) ?? 0) + Number(fe.valor ?? 0) * fator);
  }

  const rows: EmpenhoCarteiraRow[] = [];
  for (const e of empenhos) {
    const contractKeys = contratosDoEmpenho.get(e.empenho_id);
    if (!contractKeys || contractKeys.length === 0) continue;
    const valorEmpenhado = Number(e.valor_empenhado ?? 0);
    const consultado = contractKeys.some((k) => contratosConsultados.has(k));
    const valorPagoFaturas = consultado ? centavos(pagoPorIdGov.get(String(e.identificador_fonte ?? '')) ?? 0) : null;
    const tesouro = saldosTesouro.get(e.empenho_id);
    const valorPago = tesouro ? centavos(tesouro.pagoTotal) : valorPagoFaturas;
    const saldo = tesouro
      ? centavos(tesouro.aLiquidar + tesouro.liquidadoAPagar)
      : valorPagoFaturas === null
        ? null
        : Math.max(0, centavos(valorEmpenhado - valorPagoFaturas));
    rows.push({
      empenhoId: e.empenho_id,
      canonicalKey: e.canonical_key ?? null,
      numero: e.numero_oficial || '—',
      ano: e.ano_exercicio ?? null,
      uasgEmitente: e.uasg_emitente ?? null,
      dataEmissao: e.data_emissao ?? null,
      credorNome: e.credor_nome ?? null,
      credorDocumento: e.credor_cnpj_cpf ?? null,
      valorEmpenhado,
      valorPago,
      fontePago: tesouro ? 'TESOURO' : valorPagoFaturas === null ? null : 'FATURAS',
      valorPagoFaturas,
      saldo,
      liquidadoAPagar: tesouro ? centavos(tesouro.liquidadoAPagar) : null,
      tesouroAtualizadoEm: tesouro?.atualizadoEm ?? null,
      contractKeys: [...contractKeys].sort()
    });
  }
  return rows;
}

/** Saldo do Tesouro dos empenhos do sistema, por id do empenho. */
async function lerSaldosTesouro(): Promise<Map<string, SaldoTesouroEmpenho>> {
  const mapa = new Map<string, SaldoTesouroEmpenho>();
  if (!isSupabaseConfigured || !supabase) return mapa;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('v_empenho_saldo_contabil')
      .select('empenho_id, pago_total, exercicio_a_liquidar, exercicio_liquidado_a_pagar, rp_a_liquidar, rp_liquidado_a_pagar, atualizado_tesouro')
      .not('empenho_id', 'is', null)
      .order('empenho_id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw mapPostgresErrorToAppError(error);
    for (const r of (data ?? []) as any[]) {
      mapa.set(String(r.empenho_id), {
        pagoTotal: Number(r.pago_total ?? 0),
        aLiquidar: Number(r.exercicio_a_liquidar ?? 0) + Number(r.rp_a_liquidar ?? 0),
        liquidadoAPagar: Number(r.exercicio_liquidado_a_pagar ?? 0) + Number(r.rp_liquidado_a_pagar ?? 0),
        atualizadoEm: r.atualizado_tesouro ?? null
      });
    }
    if (!data || data.length < PAGINA) break;
  }
  return mapa;
}

export async function fetchEmpenhosCarteira(faturas: FaturaCarteira[]): Promise<EmpenhoCarteiraRow[]> {
  const [empenhos, vinculos, faturaEmpenhos, consultados, classificacao, tesouro] = await Promise.all([
    lerTudo<EmpenhoResumoDb>(
      'v_empenhos_resumo',
      'empenho_id, canonical_key, numero_oficial, ano_exercicio, uasg_emitente, data_emissao, valor_empenhado, credor_nome, credor_cnpj_cpf, identificador_fonte',
      'empenho_id'
    ),
    lerTudo<{ empenho_id: string; contract_key: string }>('contrato_empenhos', 'empenho_id, contract_key', 'empenho_id'),
    lerTudo<FaturaEmpenhoDb>('fatura_empenhos', 'id_fatura, id_empenho_gov, valor', 'id_fatura'),
    lerTudo<{ contract_key: string }>('contrato_faturas_sincronizacao', 'contract_key', 'contract_key'),
    lerTudo<{ id: string; plano_interno: string | null; natureza_despesa: string | null }>('empenhos', 'id, plano_interno, natureza_despesa', 'id'),
    lerSaldosTesouro()
  ]);
  const porId = new Map(classificacao.map((c) => [String(c.id), c]));
  return montarEmpenhosCarteira(empenhos, vinculos, faturaEmpenhos, faturas, new Set(consultados.map((c) => c.contract_key)), tesouro).map((r) => ({
    ...r,
    planoInterno: porId.get(r.empenhoId)?.plano_interno ?? null,
    naturezaDespesa: porId.get(r.empenhoId)?.natureza_despesa ?? null
  }));
}

// -----------------------------------------------------------------------------------------------------
// Pagamentos
// -----------------------------------------------------------------------------------------------------

/**
 * Etapa do pagamento: as duas primeiras vêm do ciclo da CGLIC; as demais, da fatura no SIAFI e no Tesouro.
 * SEM_CONFIRMACAO: não há como confirmar o pagamento pelas fontes abertas, e ele se confere no SIAFI. Ou a fatura
 * está liquidada sem NP na fonte (antigas ou pagas por outro documento, como DD), ou a OB da NP é de outra despesa
 * (pagamento a conferir, migration 123). Não é "aguardando OB" nem "paga".
 */
export type EtapaPagamento =
  | 'NA_CGLIC' | 'DEVOLVIDO_CORRECAO' | 'NA_CGOFI' | 'EM_ANDAMENTO' | 'AGUARDANDO_OB' | 'SEM_CONFIRMACAO' | 'ERRO_SIAFI' | 'PAGA' | 'CANCELADA';

export type PagamentoCarteiraRow =
  | { tipo: 'CICLO'; chave: string; contractKey: string; etapa: EtapaPagamento; ciclo: PaymentFollowUpCycle; faturas: FaturaCarteira[] }
  | { tipo: 'FATURA'; chave: string; contractKey: string; etapa: EtapaPagamento; fatura: FaturaCarteira };

export function etapaDaFatura(
  f: Pick<FaturaCarteira, 'cancelada' | 'paga' | 'dataLiquidacao' | 'situacao' | 'np' | 'pagamentoAConferir'>
): EtapaPagamento {
  if (f.cancelada) return 'CANCELADA';
  if (f.paga) return 'PAGA';
  if (f.pagamentoAConferir) return 'SEM_CONFIRMACAO';
  if (f.dataLiquidacao) return f.np ? 'AGUARDANDO_OB' : 'SEM_CONFIRMACAO';
  if (f.situacao === 'Siafi Erro') return 'ERRO_SIAFI';
  return 'EM_ANDAMENTO';
}

/** Etapa do ciclo em aberto; ciclo pago ou cancelado não entra na lista (a fatura dele já aparece). */
/**
 * Segmentos de Pagamentos: o que precisa de ação da equipe (ciclo na CGLIC, erro no SIAFI), o que anda sem a CGLIC (na
 * CGOFI, fatura ainda não liquidada, liquidada esperando OB), o que não dá para confirmar pelas fontes abertas (sem NP
 * ou com a OB da NP de outra despesa) e o que já foi pago. Cancelada só aparece em Todas.
 */
export type GrupoPagamento = 'ACAO' | 'TRAMITACAO' | 'CONFERIR' | 'PAGA';
export const GRUPO_DA_ETAPA: Record<EtapaPagamento, GrupoPagamento | null> = {
  NA_CGLIC: 'ACAO',
  ERRO_SIAFI: 'ACAO',
  DEVOLVIDO_CORRECAO: 'TRAMITACAO',
  NA_CGOFI: 'TRAMITACAO',
  EM_ANDAMENTO: 'TRAMITACAO',
  AGUARDANDO_OB: 'TRAMITACAO',
  // Segmento próprio "A conferir": não está confirmada como paga nem anda sozinha; fora do valor "aguardando OB".
  SEM_CONFIRMACAO: 'CONFERIR',
  PAGA: 'PAGA',
  CANCELADA: null
};

/**
 * "Precisa de ação" de Pagamentos, para o número do menu: quantas linhas e se alguma é urgente (fatura com erro no
 * SIAFI ou ciclo com o prazo da CGLIC vencido).
 */
export function resumirPrecisaDeAcao(rows: PagamentoCarteiraRow[]): { total: number; urgente: boolean } {
  const acao = rows.filter((r) => GRUPO_DA_ETAPA[r.etapa] === 'ACAO');
  const urgente = acao.some(
    (r) => r.etapa === 'ERRO_SIAFI' || (r.tipo === 'CICLO' && r.ciclo.etapaAtual?.dono === 'CGLIC' && Boolean(r.ciclo.etapaAtual?.atrasado))
  );
  return { total: acao.length, urgente };
}

export function etapaDoCiclo(ciclo: Pick<PaymentFollowUpCycle, 'status'>): EtapaPagamento | null {
  switch (ciclo.status) {
    case 'RECEBIDO':
    case 'CONFERIDO':
    case 'DEVOLVIDO':
      return 'NA_CGLIC';
    case 'COM_PENDENCIA':
      return 'DEVOLVIDO_CORRECAO';
    case 'ENVIADO_CGOFI':
      return 'NA_CGOFI';
    case 'LIQUIDADO':
      return 'AGUARDANDO_OB';
    default:
      return null;
  }
}

/**
 * Ciclos em aberto e faturas, cada um na sua linha. A fatura ligada a um ciclo em aberto sai da lista: ela aparece
 * dentro da linha do ciclo (o ciclo mostra a etapa da CGLIC; a liquidação e a OB vêm da fatura).
 */
export function montarPagamentosCarteira(
  ciclos: PaymentFollowUpCycle[],
  faturas: FaturaCarteira[],
  ligacoes: Array<{ cycle_id: string; id_fatura: number }> = []
): PagamentoCarteiraRow[] {
  const rows: PagamentoCarteiraRow[] = [];
  const faturaPorId = new Map(faturas.map((f) => [f.idFatura, f]));
  const emCicloAberto = new Set<number>();
  for (const ciclo of ciclos) {
    const etapa = etapaDoCiclo(ciclo);
    if (!etapa) continue;
    const doCiclo = ligacoes
      .filter((l) => l.cycle_id === ciclo.id)
      .map((l) => faturaPorId.get(Number(l.id_fatura)))
      .filter((f): f is FaturaCarteira => Boolean(f));
    doCiclo.forEach((f) => emCicloAberto.add(f.idFatura));
    rows.push({ tipo: 'CICLO', chave: `ciclo-${ciclo.cycleKey}`, contractKey: ciclo.contractKey, etapa, ciclo, faturas: doCiclo });
  }
  for (const fatura of faturas) {
    if (emCicloAberto.has(fatura.idFatura)) continue;
    rows.push({ tipo: 'FATURA', chave: `fatura-${fatura.idFatura}`, contractKey: fatura.contractKey, etapa: etapaDaFatura(fatura), fatura });
  }
  return rows;
}

/** Faturas ligadas a ciclos (migration 87). */
export async function fetchLigacoesCicloFatura(): Promise<Array<{ cycle_id: string; id_fatura: number }>> {
  return lerTudo<{ cycle_id: string; id_fatura: number }>('contract_payment_cycle_faturas', 'cycle_id, id_fatura', 'id_fatura');
}

export async function fetchCiclosEmAberto(): Promise<PaymentFollowUpCycle[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('contract_payment_cycles')
    .select('*')
    .in('status', ['RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI', 'LIQUIDADO'])
    .order('criado_em', { ascending: false });
  if (error) throw mapPostgresErrorToAppError(error);
  const rows = (data ?? []) as RpcContractPaymentCycleRow[];
  // Itens "DO PAGAMENTO": a linha do ciclo mostra as notas fiscais.
  const ids = rows.map((r) => r.id);
  const itens = ids.length > 0 ? await supabase.from('contract_payment_cycle_itens').select('*').in('cycle_id', ids) : { data: [], error: null };
  if (itens.error) throw mapPostgresErrorToAppError(itens.error);
  const doCiclo = (id: string) => ((itens.data ?? []) as RpcPaymentCycleItemRow[]).filter((i) => i.cycle_id === id);
  return rows.map((row) => rowToPaymentFollowUpCycle(row, { itens: doCiclo(row.id) }));
}

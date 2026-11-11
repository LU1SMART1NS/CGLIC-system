import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/**
 * Fiscalização de contratos pela SFC/CGLIC (migration 259). O coordenador decide, por contrato, quem fiscaliza:
 * toda a SFC/CGLIC, mista (parte das entregas com a área requisitante) ou toda a área requisitante.
 * Sem decisão: contrato de emenda fica "a definir"; sem emenda, com a área requisitante (padrão).
 */
export type DecisaoFiscalizacao = 'SFC' | 'MISTA' | 'AREA';
export type SituacaoFiscalizacao = DecisaoFiscalizacao | 'A_DEFINIR' | 'AREA_PADRAO';

export interface ContratoFiscalizacao {
  contractKey: string;
  uasg: string;
  numero: string;
  fornecedor: string | null;
  objeto: string | null;
  /** AAAA-MM-DD. */
  assinatura: string | null;
  vigenciaFim: string | null;
  emendas: string[];
  situacao: SituacaoFiscalizacao;
  motivo: string | null;
  fiscalUserId: string | null;
  fiscalNome: string | null;
  substitutoUserId: string | null;
  substitutoNome: string | null;
  portariaSei: string | null;
  processoSei: string | null;
  autuadoEm: string | null;
  definidoPorNome: string | null;
  definidoEm: string | null;
}

function cliente() {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaContrato(r: any): ContratoFiscalizacao {
  return {
    contractKey: r.contract_key,
    uasg: r.uasg,
    numero: r.numero || '',
    fornecedor: r.fornecedor || null,
    objeto: r.objeto || null,
    assinatura: r.assinatura || null,
    vigenciaFim: r.vigencia_fim || null,
    emendas: Array.isArray(r.emendas) ? r.emendas.filter(Boolean) : [],
    situacao: r.situacao,
    motivo: r.motivo || null,
    fiscalUserId: r.fiscal_user_id || null,
    fiscalNome: r.fiscal_nome || null,
    substitutoUserId: r.substituto_user_id || null,
    substitutoNome: r.substituto_nome || null,
    portariaSei: r.portaria_sei || null,
    processoSei: r.processo_sei || null,
    autuadoEm: r.autuado_em || null,
    definidoPorNome: r.definido_por_nome || null,
    definidoEm: r.definido_em || null
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Contratos vigentes e os que já têm decisão, com a situação da fiscalização (RPC fisc_contratos_para_distribuicao). */
export async function fetchContratosFiscalizacao(): Promise<ContratoFiscalizacao[]> {
  const { data, error } = await cliente().rpc('fisc_contratos_para_distribuicao');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data || []) as unknown[]).map(linhaParaContrato);
}

export interface DefinirFiscalizacaoInput {
  contractKey: string;
  fiscalizacao: DecisaoFiscalizacao;
  fiscalUserId: string | null;
  substitutoUserId: string | null;
  portariaSei: string | null;
  motivo: string | null;
}

/** Decisão do coordenador: quem fiscaliza, fiscal e substituto da SFC/CGLIC e a portaria. */
export async function definirFiscalizacaoContrato(input: DefinirFiscalizacaoInput): Promise<void> {
  const { error } = await cliente().rpc('definir_fiscalizacao_contrato', {
    p_contract_key: input.contractKey,
    p_fiscalizacao: input.fiscalizacao,
    p_fiscal_user_id: input.fiscalizacao === 'AREA' ? null : input.fiscalUserId,
    p_substituto_user_id: input.fiscalizacao === 'AREA' ? null : input.substitutoUserId,
    p_portaria_sei: (input.portariaSei || '').replace(/\D/g, '') || null,
    p_motivo: (input.motivo || '').trim() || null
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Autuação do processo de fiscalização (fiscal, substituto ou coordenador). */
export async function registrarProcessoFiscalizacao(input: { contractKey: string; processoSei: string; autuadoEm: string }): Promise<void> {
  const { error } = await cliente().rpc('registrar_processo_fiscalizacao', {
    p_contract_key: input.contractKey,
    p_processo_sei: input.processoSei.replace(/\D/g, ''),
    // a RPC formata o número do processo (NUP): 08020.017653/2026-49
    p_autuado_em: input.autuadoEm
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

// ── Entregas (migration 260) ─────────────────────────────────────────────────────────────────────

export type EtapaEntrega =
  | 'INFO_PEDIDA' | 'INFO_ENVIADA' | 'ORDEM'
  | 'PRODUCAO' | 'CONTROLADO' | 'TRANSITO' | 'RETIRADA'
  | 'ENTREGUE' | 'TRP' | 'TRD'
  | 'PAGAMENTO' | 'SAL' | 'FINALIZADO';
export type ResponsavelEntrega = 'SFC' | 'AREA';

/** Entrega acompanhada pela fiscalização: item do contrato × beneficiário × quantidade. */
export interface EntregaFiscalizacao {
  id: string;
  contractKey: string;
  contratoNumero: string;
  fornecedor: string | null;
  fiscalUserId: string | null;
  fiscalNome: string | null;
  substitutoUserId: string | null;
  fiscalizacao: DecisaoFiscalizacao;
  itemKey: string | null;
  itemNome: string | null;
  itemDescricao: string | null;
  /** Carga da planilha: o item como está na planilha (não há linha de pedido). */
  itemTexto: string | null;
  beneficiarioId: string | null;
  beneficiarioNome: string | null;
  beneficiarioSigla: string | null;
  beneficiarioRazao: string | null;
  /** Carga da planilha: o destinatário como está na planilha (sem cadastro do beneficiário). */
  beneficiarioTexto: string | null;
  municipio: string | null;
  uf: string | null;
  quantidade: number;
  origem: 'EMENDA' | 'CARGA' | 'MANUAL';
  emenda: string | null;
  pedidoId: string | null;
  responsavel: ResponsavelEntrega;
  etapa: EtapaEntrega;
  etapaEm: string | null;
  prevista: string | null;
  entregueEm: string | null;
  divididaDe: string | null;
  /** Programa da carga (Projeto Pegasus, BNDES · Fogo Zero), até o cadastro de programas. */
  programaTexto: string | null;
  /** Linha da planilha da SFC/CGLIC que originou ou atualizou a entrega. */
  cargaLinha: number | null;
  faturadoEm: string | null;
  pagoEm: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaEntrega(r: any): EntregaFiscalizacao {
  return {
    id: r.id,
    contractKey: r.contract_key,
    contratoNumero: r.contrato_numero || r.contract_key,
    fornecedor: r.fornecedor || null,
    fiscalUserId: r.fiscal_user_id || null,
    fiscalNome: r.fiscal_nome || null,
    substitutoUserId: r.substituto_user_id || null,
    fiscalizacao: r.fiscalizacao,
    itemKey: r.item_key || null,
    itemNome: r.item_nome || null,
    itemDescricao: r.item_descricao || null,
    itemTexto: r.item_texto || null,
    beneficiarioId: r.beneficiario_id || null,
    beneficiarioNome: r.beneficiario_nome || null,
    beneficiarioSigla: r.beneficiario_sigla || null,
    beneficiarioRazao: r.beneficiario_razao || null,
    beneficiarioTexto: r.beneficiario_texto || null,
    municipio: r.municipio || null,
    uf: r.uf || null,
    quantidade: Number(r.quantidade) || 0,
    origem: r.origem,
    emenda: r.emenda || null,
    pedidoId: r.pedido_id || null,
    responsavel: r.responsavel,
    etapa: r.etapa,
    etapaEm: r.etapa_em || null,
    prevista: r.prevista || null,
    entregueEm: r.entregue_em || null,
    divididaDe: r.dividida_de || null,
    programaTexto: r.programa_texto || null,
    cargaLinha: r.carga_linha == null ? null : Number(r.carga_linha),
    faturadoEm: r.faturado_em || null,
    pagoEm: r.pago_em || null,
    atualizadoPorNome: r.atualizado_por_nome || null,
    atualizadoEm: r.atualizado_em || null
  };
}

export interface MovimentoEntrega {
  id: string;
  tipo: 'CRIADA' | 'ETAPA' | 'DIVISAO' | 'PREVISTA' | 'RESPONSAVEL' | 'AUTOMATICA';
  etapa: EtapaEntrega | null;
  data: string | null;
  documentoSei: string | null;
  observacao: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Entregas de um contrato ou de todos (RPC fisc_entregas_lista). */
export async function fetchEntregasFiscalizacao(contractKey?: string | null): Promise<EntregaFiscalizacao[]> {
  const { data, error } = await cliente().rpc('fisc_entregas_lista', { p_contrato: contractKey ?? null });
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data || []) as unknown[]).map(linhaParaEntrega);
}

export async function fetchMovimentosDaEntrega(entregaId: string): Promise<MovimentoEntrega[]> {
  const { data, error } = await cliente().rpc('fisc_movimentos_da_entrega', { p_entrega: entregaId });
  if (error) throw mapPostgresErrorToAppError(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    etapa: m.etapa || null,
    data: m.data || null,
    documentoSei: m.documento_sei || null,
    observacao: m.observacao || null,
    criadoPorNome: m.criado_por_nome || null,
    criadoEm: m.criado_em
  }));
}

export async function mudarEtapaEntregas(input: { ids: string[]; etapa: EtapaEntrega; data: string; documentoSei: string | null; observacao: string | null }): Promise<void> {
  const { error } = await cliente().rpc('mudar_etapa_entregas', {
    p_ids: input.ids,
    p_etapa: input.etapa,
    p_data: input.data,
    p_documento_sei: (input.documentoSei || '').replace(/\D/g, '') || null,
    p_observacao: (input.observacao || '').trim() || null
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function dividirEntrega(input: { id: string; quantidade: number }): Promise<void> {
  const { error } = await cliente().rpc('dividir_entrega', { p_id: input.id, p_quantidade: input.quantidade });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function definirPrevistaEntregas(input: { ids: string[]; prevista: string | null }): Promise<void> {
  const { error } = await cliente().rpc('definir_prevista_entregas', { p_ids: input.ids, p_prevista: input.prevista });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function definirResponsavelEntregas(input: { ids: string[]; responsavel: ResponsavelEntrega; motivo: string }): Promise<void> {
  const { error } = await cliente().rpc('definir_responsavel_entregas', { p_ids: input.ids, p_responsavel: input.responsavel, p_motivo: input.motivo.trim() });
  if (error) throw mapPostgresErrorToAppError(error);
}

// ---- Transferência dos contratos de um fiscal (migration 261) -------------------------------------------------------

/** Ausência de fiscal (férias, licença…): contratos com quem assumiu até o retorno. */
export interface TransferenciaFiscal {
  id: string;
  ausenteUserId: string;
  ausenteNome: string;
  destinoUserId: string;
  destinoNome: string;
  motivo: 'FERIAS' | 'LICENCA' | 'AFASTAMENTO' | 'OUTRO';
  /** AAAA-MM-DD. */
  inicio: string;
  retornoPrevisto: string;
  seiNumero: string | null;
  desfeitaEm: string | null;
  /** Contratos que foram com quem assumiu. */
  contratos: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaTransferenciaFiscal(r: any): TransferenciaFiscal {
  return {
    id: r.id,
    ausenteUserId: r.ausente_user_id,
    ausenteNome: r.ausente_nome,
    destinoUserId: r.destino_user_id,
    destinoNome: r.destino_nome,
    motivo: r.motivo,
    inicio: r.inicio,
    retornoPrevisto: r.retorno_previsto,
    seiNumero: r.sei_numero || null,
    desfeitaEm: r.desfeita_em || null,
    contratos: Array.isArray(r.fisc_transferencias_temporarias_itens) ? r.fisc_transferencias_temporarias_itens[0]?.count ?? 0 : 0
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Ausências em curso (as desfeitas não pesam na tela). Sem a tabela (migration 261 ainda não aplicada), vazio. */
export async function fetchTransferenciasFiscal(): Promise<TransferenciaFiscal[]> {
  const { data, error } = await cliente()
    .from('fisc_transferencias_temporarias')
    .select('id, ausente_user_id, ausente_nome, destino_user_id, destino_nome, motivo, inicio, retorno_previsto, sei_numero, desfeita_em, fisc_transferencias_temporarias_itens(count)')
    .is('desfeita_em', null)
    .order('retorno_previsto', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw mapPostgresErrorToAppError(error);
  }
  return ((data || []) as unknown[]).map(linhaParaTransferenciaFiscal);
}

export async function transferirContratosFiscal(input: { origemUserId: string; destinoUserId: string }): Promise<{ fiscal: number; substituto: number }> {
  const { data, error } = await cliente().rpc('transferir_contratos_fiscal', { p_origem_user_id: input.origemUserId, p_destino_user_id: input.destinoUserId });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as { fiscal?: number; substituto?: number };
  return { fiscal: r.fiscal ?? 0, substituto: r.substituto ?? 0 };
}

export interface TransferirFiscalTemporariaInput {
  ausenteUserId: string;
  destinoUserId: string;
  motivo: TransferenciaFiscal['motivo'];
  inicio: string;
  retornoPrevisto: string;
  seiNumero: string | null;
}

export async function transferirContratosFiscalTemporaria(input: TransferirFiscalTemporariaInput): Promise<{ contratos: number }> {
  const { data, error } = await cliente().rpc('transferir_contratos_fiscal_temporaria', {
    p_ausente_user_id: input.ausenteUserId,
    p_destino_user_id: input.destinoUserId,
    p_motivo: input.motivo,
    p_inicio: input.inicio,
    p_retorno_previsto: input.retornoPrevisto,
    p_sei_numero: input.seiNumero
  });
  if (error) throw mapPostgresErrorToAppError(error);
  return { contratos: ((data ?? {}) as { contratos?: number }).contratos ?? 0 };
}

export async function desfazerTransferenciaFiscal(id: string): Promise<{ devolvidos: number; ficaram: number }> {
  const { data, error } = await cliente().rpc('desfazer_transferencia_fiscal', { p_id: id });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as { devolvidos?: number; ficaram?: number };
  return { devolvidos: r.devolvidos ?? 0, ficaram: r.ficaram ?? 0 };
}

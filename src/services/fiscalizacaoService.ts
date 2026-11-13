import type { ContagemPrazo, InicioPrazo, RegraDoPrazo } from '../utils/fiscalizacaoPrazo';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

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
  /** Atas dos itens do contrato (vínculo contrato → itens da ata). */
  atas?: string[];
  situacao: SituacaoFiscalizacao;
  motivo: string | null;
  fiscalUserId: string | null;
  fiscalNome: string | null;
  portariaSei: string | null;
  /** Número SEI do contrato (documento), da planilha da SFC/CGLIC (migration 266). */
  processoSei: string | null;
  /** Data do contrato registrada com o número SEI do contrato. */
  autuadoEm: string | null;
  /** NUP do processo de acompanhamento contratual: é a autuação (migration 294). Sem ele, o contrato está "a autuar". */
  processoNup?: string | null;
  /** AAAA-MM-DD: data da autuação do processo de acompanhamento. */
  processoAutuadoEm?: string | null;
  definidoPorNome: string | null;
  definidoEm: string | null;
  /** Unidade interna (sigla) que fiscaliza pela área requisitante: toda (AREA) ou a parte dela (MISTA). */
  unidadeArea?: string | null;
  /** Unidades internas do contrato pela divisão do contratado (ou pela alocação dos itens): sugestão na janela. */
  unidadesDoContrato?: string[];
  /** Regra completa do prazo (migration 294): dias, contagem, a partir de quando, e de onde veio (TR da ata). */
  prazoEntrega?: RegraDoPrazo | null;
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
    portariaSei: r.portaria_sei || null,
    processoSei: r.processo_sei || null,
    autuadoEm: r.autuado_em || null,
    processoNup: r.processo_nup || null,
    processoAutuadoEm: r.processo_autuado_em || null,
    definidoPorNome: r.definido_por_nome || null,
    definidoEm: r.definido_em || null,
    prazoEntrega: r.prazo_entrega ?? null,
    atas: Array.isArray(r.atas) ? r.atas.filter(Boolean) : [],
    unidadeArea: r.unidade_area || null,
    unidadesDoContrato: Array.isArray(r.unidades_do_contrato) ? r.unidades_do_contrato.filter(Boolean) : []
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
  portariaSei: string | null;
  motivo: string | null;
  /** Unidade interna (sigla) da área requisitante; obrigatória em AREA e MISTA. */
  unidadeArea?: string | null;
}

/** Decisão do coordenador: quem fiscaliza e o fiscal da SFC/CGLIC (a portaria saiu das telas em 12/11/2026). */
export async function definirFiscalizacaoContrato(input: DefinirFiscalizacaoInput): Promise<void> {
  const { error } = await cliente().rpc('definir_fiscalizacao_contrato', {
    p_contract_key: input.contractKey,
    p_fiscalizacao: input.fiscalizacao,
    p_fiscal_user_id: input.fiscalizacao === 'AREA' ? null : input.fiscalUserId,
    p_portaria_sei: (input.portariaSei || '').replace(/\D/g, '') || null,
    p_motivo: (input.motivo || '').trim() || null,
    p_unidade_area: input.fiscalizacao === 'SFC' ? null : input.unidadeArea || null
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Número SEI do contrato (documento) e a data do contrato (fiscal ou coordenador; migration 266). */
export async function registrarProcessoFiscalizacao(input: { contractKey: string; processoSei: string; autuadoEm: string }): Promise<void> {
  const { error } = await cliente().rpc('registrar_processo_fiscalizacao', {
    p_contract_key: input.contractKey,
    p_processo_sei: input.processoSei.replace(/\D/g, ''),
    p_autuado_em: input.autuadoEm
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Autuação: NUP do processo de acompanhamento e a data da autuação (fiscal ou coordenador; migration 294). */
export async function registrarAutuacaoFiscalizacao(input: { contractKey: string; processoNup: string; autuadoEm: string }): Promise<void> {
  const { error } = await cliente().rpc('registrar_autuacao_fiscalizacao', {
    p_contract_key: input.contractKey,
    p_processo_nup: input.processoNup.trim(),
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
  /** Parlamentar que destinou a emenda (do pedido de emenda). */
  parlamentarNome?: string | null;
  pedidoId: string | null;
  responsavel: ResponsavelEntrega;
  etapa: EtapaEntrega;
  etapaEm: string | null;
  prevista: string | null;
  /**
   * De onde veio a data prevista (migration 294): ORDEM = recebimento da Ordem + prazo em dias; PRORROGACAO =
   * prorrogação registrada (a data anterior fica em previstaAnterior); PLANILHA = carga da SFC/CGLIC; MANUAL = antes da regra.
   */
  previstaOrigem?: 'ORDEM' | 'ASSINATURA' | 'EXERCITO' | 'PRORROGACAO' | 'PLANILHA' | 'MANUAL' | null;
  /** A partir de quando o prazo do contrato conta (da regra do contrato). */
  prazoInicio?: InicioPrazo | null;
  /** Dias corridos ou úteis (da regra do contrato). */
  prazoContagem?: ContagemPrazo | null;
  /** Dias devolvidos ao fornecedor pela espera no Exército. */
  diasSuspensos?: number | null;
  /** Data em que o fornecedor recebeu (assinou ou deu ciência da) Ordem de Fornecimento. */
  ordemRecebidaEm?: string | null;
  /** Prazo de entrega em dias corridos usado na conta. */
  prazoDias?: number | null;
  /** Data prevista antes da última prorrogação. */
  previstaAnterior?: string | null;
  /** Data prevista pela Ordem, antes de qualquer prorrogação. */
  previstaOriginal?: string | null;
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
  /** Programa do cadastro (migration 265); programaTexto traz o nome dele (ou o texto da planilha). */
  programaId?: string | null;
  programaAtivo?: boolean | null;
  /** Endereço de entrega do cadastro do beneficiário (migration 265). */
  entregaLogradouro?: string | null;
  entregaNumero?: string | null;
  entregaComplemento?: string | null;
  entregaBairro?: string | null;
  entregaCep?: string | null;
  /**
   * A linha do pedido de emenda mudou depois da entrega (migration 274): item cancelado (anulação do empenho, com a
   * data e o SEI quando há registro) ou nota em outro contrato. O Gestor de Fiscalização decide se encerra.
   */
  aviso?: AvisoDaEntrega | null;
  /** Entrega encerrada (só vem quando a leitura pede as encerradas). */
  encerradaEm?: string | null;
}

export type AvisoDaEntrega =
  | { tipo: 'ITEM_CANCELADO'; data: string | null; sei: string | null }
  | { tipo: 'OUTRO_CONTRATO'; contrato: string };
export type MotivoDoEncerramento = 'ITEM_CANCELADO' | 'OUTRO_CONTRATO' | 'OUTRO';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaEntrega(r: any): EntregaFiscalizacao {
  return {
    id: r.id,
    contractKey: r.contract_key,
    contratoNumero: r.contrato_numero || r.contract_key,
    fornecedor: r.fornecedor || null,
    fiscalUserId: r.fiscal_user_id || null,
    fiscalNome: r.fiscal_nome || null,
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
    previstaOrigem: r.prevista_origem || null,
    prazoInicio: r.prazo_inicio || null,
    prazoContagem: r.prazo_contagem || null,
    diasSuspensos: r.dias_suspensos == null ? null : Number(r.dias_suspensos),
    ordemRecebidaEm: r.ordem_recebida_em || null,
    prazoDias: r.prazo_dias == null ? null : Number(r.prazo_dias),
    previstaAnterior: r.prevista_anterior || null,
    previstaOriginal: r.prevista_original || null,
    entregueEm: r.entregue_em || null,
    divididaDe: r.dividida_de || null,
    programaTexto: r.programa_texto || null,
    cargaLinha: r.carga_linha == null ? null : Number(r.carga_linha),
    faturadoEm: r.faturado_em || null,
    pagoEm: r.pago_em || null,
    atualizadoPorNome: r.atualizado_por_nome || null,
    atualizadoEm: r.atualizado_em || null,
    programaId: r.programa_id || null,
    programaAtivo: r.programa_ativo ?? null,
    parlamentarNome: r.parlamentar_nome || null,
    entregaLogradouro: r.entrega_logradouro || null,
    entregaNumero: r.entrega_numero || null,
    entregaComplemento: r.entrega_complemento || null,
    entregaBairro: r.entrega_bairro || null,
    entregaCep: r.entrega_cep || null,
    aviso: r.aviso?.tipo ? (r.aviso as AvisoDaEntrega) : null,
    encerradaEm: r.encerrada_em || null
  };
}

export interface MovimentoEntrega {
  id: string;
  tipo: 'CRIADA' | 'ETAPA' | 'VOLTA' | 'DESFEITO' | 'CORRECAO' | 'DIVISAO' | 'PREVISTA' | 'RESPONSAVEL' | 'AUTOMATICA' | 'CARGA' | 'PROGRAMA' | 'ITEM' | 'BENEFICIARIO' | 'RECEBIMENTO' | 'PRORROGACAO' | 'SUSPENSAO';
  etapa: EtapaEntrega | null;
  data: string | null;
  documentoSei: string | null;
  observacao: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Entregas de um contrato ou de todos (RPC fisc_entregas_lista). Lidas de mil em mil, ordenadas pelo id: sem isso o
 * PostgREST cortava em 1.000 das 4.005 linhas e os itens dos programas (e de vários contratos) sumiam das telas.
 */
export async function fetchEntregasFiscalizacao(contractKey?: string | null): Promise<EntregaFiscalizacao[]> {
  try {
    const linhas = await lerTodasAsPaginas<unknown>((de, ate) =>
      cliente().rpc('fisc_entregas_lista', { p_contrato: contractKey ?? null }).order('id').range(de, ate),
    );
    return linhas.map(linhaParaEntrega);
  } catch (error) {
    throw mapPostgresErrorToAppError(error);
  }
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

/** Corrigir a etapa (só o coordenador, migration 273): pula ou volta várias etapas, com motivo. */
export async function corrigirEtapaEntregas(input: { ids: string[]; etapa: EtapaEntrega; data: string; documentoSei: string | null; motivo: string }): Promise<void> {
  const { error } = await cliente().rpc('corrigir_etapa_entregas', {
    p_ids: input.ids,
    p_etapa: input.etapa,
    p_data: input.data,
    p_documento_sei: (input.documentoSei || '').replace(/\D/g, '') || null,
    p_motivo: input.motivo.trim()
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Voltar etapa (migration 273): desfaz o último passo do item, com motivo. */
export async function voltarEtapaEntrega(input: { id: string; motivo: string }): Promise<void> {
  const { error } = await cliente().rpc('voltar_etapa_entrega', { p_id: input.id, p_motivo: input.motivo.trim() });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Trocar o beneficiário de um item que não veio de emenda (migration 284): motivo e SEI ficam no histórico. */
export async function trocarBeneficiarioEntrega(input: { id: string; beneficiarioId: string; motivo: string; documentoSei: string }): Promise<void> {
  const { error } = await cliente().rpc('trocar_beneficiario_entrega', {
    p_id: input.id,
    p_beneficiario_id: input.beneficiarioId,
    p_motivo: input.motivo.trim(),
    p_documento_sei: input.documentoSei.replace(/\D/g, '')
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/**
 * Repartir um item entre beneficiários: a 1ª parte fica no item de hoje, as outras viram itens novos (mesma etapa,
 * prevista e programa). A soma tem que fechar com a quantidade do item; motivo e SEI no histórico de cada parte.
 */
export async function repartirEntregaEntreBeneficiarios(input: { id: string; partes: { beneficiarioId: string; quantidade: number }[]; motivo: string; documentoSei: string }): Promise<void> {
  const { error } = await cliente().rpc('dividir_entrega_entre_beneficiarios', {
    p_id: input.id,
    p_partes: input.partes.map((p) => ({ beneficiario_id: p.beneficiarioId, quantidade: p.quantidade })),
    p_motivo: input.motivo.trim(),
    p_documento_sei: input.documentoSei.replace(/\D/g, '')
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function dividirEntrega(input: { id: string; quantidade: number }): Promise<void> {
  const { error } = await cliente().rpc('dividir_entrega', { p_id: input.id, p_quantidade: input.quantidade });
  if (error) throw mapPostgresErrorToAppError(error);
}

/**
 * Recebimento da Ordem de Fornecimento (migration 294): a data em que o fornecedor recebeu a Ordem e o prazo
 * em dias corridos; o servidor calcula a data prevista de cada item (recebimento + prazo, fim de semana passa à segunda).
 */
export async function registrarRecebimentoOrdem(input: { ids: string[]; recebidaEm: string; prazoDias: number }): Promise<void> {
  const { error } = await cliente().rpc('registrar_recebimento_ordem', { p_ids: input.ids, p_recebida_em: input.recebidaEm, p_prazo_dias: input.prazoDias });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Prorrogação do prazo de entrega (migration 294): nova data, motivo e SEI da decisão; a data anterior fica guardada. */
export async function prorrogarPrazoEntregas(input: { ids: string[]; novaData: string; motivo: string; documentoSei: string }): Promise<void> {
  const { error } = await cliente().rpc('prorrogar_prazo_entregas', {
    p_ids: input.ids,
    p_nova_data: input.novaData,
    p_motivo: input.motivo.trim(),
    p_documento_sei: input.documentoSei.replace(/\D/g, '')
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Prazo de entrega do contrato (migration 294), em dias corridos do recebimento da Ordem. */
export async function definirPrazoDoContrato(input: { contractKey: string; dias: number | null; contagem?: ContagemPrazo; inicio?: InicioPrazo; motivo?: string }): Promise<void> {
  const { error } = await cliente().rpc('definir_prazo_entrega_contrato', { p_contract_key: input.contractKey, p_dias: input.dias, p_contagem: input.contagem ?? 'CORRIDOS', p_inicio: input.inicio ?? 'OF_RECEBIMENTO', p_motivo: input.motivo ?? null });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Encerra entregas (migration 274): saem das listas de trabalho e o motivo fica no histórico. */
export async function encerrarEntregas(input: { ids: string[]; motivo: MotivoDoEncerramento; documentoSei: string | null; observacao: string | null }): Promise<void> {
  const { error } = await cliente().rpc('encerrar_entregas', {
    p_ids: input.ids,
    p_motivo: input.motivo,
    p_documento_sei: input.documentoSei,
    p_observacao: input.observacao
  });
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

/** Sem `contractKeys`, passa todos os contratos do fiscal; com a lista, só os marcados (migration 264). */
export async function transferirContratosFiscal(input: { origemUserId: string; destinoUserId: string; contractKeys?: string[] }): Promise<{ fiscal: number }> {
  const { data, error } = await cliente().rpc('transferir_contratos_fiscal', {
    p_origem_user_id: input.origemUserId,
    p_destino_user_id: input.destinoUserId,
    ...(input.contractKeys ? { p_contract_keys: input.contractKeys } : {})
  });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as { fiscal?: number };
  return { fiscal: r.fiscal ?? 0 };
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

/** Entrega de uma linha de pedido de emenda, para a régua do Pedido 360 (migration 263). */
export interface EntregaDaLinha {
  id: string;
  linhaId: string;
  contractKey: string;
  quantidade: number;
  responsavel: ResponsavelEntrega;
  etapa: EtapaEntrega;
  etapaEm: string | null;
  prevista: string | null;
  entregueEm: string | null;
  divididaDe: string | null;
  fiscalNome: string | null;
}

export async function fetchEntregasDoPedido(pedidoId: string): Promise<EntregaDaLinha[]> {
  const { data, error } = await cliente().rpc('fisc_entregas_do_pedido', { p_pedido: pedidoId });
  if (error) throw mapPostgresErrorToAppError(error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    linhaId: r.linha_id,
    contractKey: r.contract_key,
    quantidade: Number(r.quantidade) || 0,
    responsavel: r.responsavel,
    etapa: r.etapa,
    etapaEm: r.etapa_em || null,
    prevista: r.prevista || null,
    entregueEm: r.entregue_em || null,
    divididaDe: r.dividida_de || null,
    fiscalNome: r.fiscal_nome || null
  }));
}

// ── Programas (migration 265) ─────────────────────────────────────────────────────────────────────

export type OrigemDoRecurso = 'EMENDA' | 'FNSP' | 'FUNDO' | 'OUTRO';
export interface ProgramaFiscalizacao {
  id: string;
  nome: string;
  unidadeId: string | null;
  unidadeSigla: string | null;
  origemRecurso: OrigemDoRecurso | null;
  ativo: boolean;
  itens: number;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaPrograma(r: any): ProgramaFiscalizacao {
  return {
    id: r.id,
    nome: r.nome,
    unidadeId: r.unidade_id || null,
    unidadeSigla: r.unidade_sigla || null,
    origemRecurso: r.origem_recurso || null,
    ativo: r.ativo !== false,
    itens: Number(r.itens) || 0,
    atualizadoPorNome: r.atualizado_por_nome || null,
    atualizadoEm: r.atualizado_em || null
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchProgramasFiscalizacao(): Promise<ProgramaFiscalizacao[]> {
  const { data, error } = await cliente().rpc('fisc_programas_lista');
  if (error) throw mapPostgresErrorToAppError(error);
  return (data || []).map(linhaParaPrograma);
}

/** Cria ou edita o programa. A origem do recurso saiu da tela (migration 297): sem ela, o banco mantém a gravada. */
export async function salvarProgramaFiscalizacao(input: { id: string | null; nome: string; unidadeId: string; origem?: OrigemDoRecurso | null; ativo: boolean }): Promise<string> {
  const { data, error } = await cliente().rpc('salvar_fisc_programa', { p_id: input.id, p_nome: input.nome.trim(), p_unidade: input.unidadeId, p_origem: input.origem ?? null, p_ativo: input.ativo });
  if (error) throw mapPostgresErrorToAppError(error);
  return data as string;
}

export async function excluirProgramaFiscalizacao(id: string): Promise<void> {
  const { error } = await cliente().rpc('excluir_fisc_programa', { p_id: id });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Inclui e retira itens (contrato × item × beneficiário) do programa. */
export async function definirProgramaDasEntregas(input: { programaId: string; incluir: string[]; retirar: string[] }): Promise<{ incluidos: number; retirados: number }> {
  const { data, error } = await cliente().rpc('definir_programa_das_entregas', { p_programa: input.programaId, p_incluir: input.incluir, p_retirar: input.retirar });
  if (error) throw mapPostgresErrorToAppError(error);
  return { incluidos: Number(data?.incluidos) || 0, retirados: Number(data?.retirados) || 0 };
}

// ── Item da ata dos itens da planilha (migration 268) ─────────────────────────────────────────────

/** Item da ata ligado ao contrato (arp_item_contract_links), para escolher a qual item pertence um item da planilha. */
export interface ItemDaAtaDoContrato {
  itemKey: string;
  ata: string;
  numero: string;
  /** Nome curto da CAEP; sem ele, null (a tela usa a descrição). */
  nome: string | null;
  descricao: string | null;
  contratado: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaItemDaAta(r: any): ItemDaAtaDoContrato {
  return {
    itemKey: r.item_key,
    ata: String(r.item_key).split('-')[0],
    numero: String(r.item_key).split('-')[2],
    nome: r.nome_curto || null,
    descricao: r.descricao_item || null,
    contratado: r.contratado == null ? null : Number(r.contratado)
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchItensDaAtaDoContrato(contractKey: string): Promise<ItemDaAtaDoContrato[]> {
  const { data, error } = await cliente().rpc('fisc_itens_da_ata_do_contrato', { p_contract_key: contractKey });
  if (error) throw mapPostgresErrorToAppError(error);
  return (data || []).map(linhaParaItemDaAta);
}

/** Liga itens da planilha (mesmo contrato) a um item da ata; o histórico registra quem conferiu. */
export async function ligarItensAoItemDaAta(input: { ids: string[]; itemKey: string }): Promise<number> {
  const { data, error } = await cliente().rpc('ligar_entregas_ao_item_da_ata', { p_ids: input.ids, p_item_key: input.itemKey });
  if (error) throw mapPostgresErrorToAppError(error);
  return Number(data) || 0;
}

// ── Beneficiário do cadastro nos itens da planilha (migration 272) ─────────────────────────────────

/**
 * Liga itens da planilha (beneficiário escrito à mão) a um beneficiário do cadastro. O nome escrito entra nas outras
 * grafias do cadastro (o mesmo nome se liga sozinho depois); o histórico registra quem ligou.
 */
export async function ligarItensAoBeneficiario(input: { ids: string[]; beneficiarioId: string }): Promise<number> {
  const { data, error } = await cliente().rpc('ligar_entregas_ao_beneficiario', { p_ids: input.ids, p_beneficiario_id: input.beneficiarioId });
  if (error) throw mapPostgresErrorToAppError(error);
  return Number(data) || 0;
}

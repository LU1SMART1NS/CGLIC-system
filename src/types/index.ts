export interface ArpResponse {
  resultado: ArpRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface ArpRecord {
  numeroAtaRegistroPreco: string;
  codigoUnidadeGerenciadora: string;
  nomeUnidadeGerenciadora: string;
  codigoOrgao: number;
  nomeOrgao: string;
  linkAtaPNCP?: string;
  linkCompraPNCP?: string;
  numeroCompra: string;
  anoCompra: string;
  codigoModalidadeCompra: string;
  nomeModalidadeCompra: string;
  dataAssinatura: string;
  dataVigenciaInicial: string;
  dataVigenciaFinal: string;
  valorTotal: number;
  statusAta: string;
  objeto: string;
  quantidadeItens: number;
  dataHoraAtualizacao: string;
  dataHoraInclusao: string;
  dataHoraExclusao: string | null;
  ataExcluido: boolean;
  numeroControlePncpAta: string;
  numeroControlePncpCompra: string;
  idCompra: string;
  dataVigenciaFinalPncp?: string;
  isCanceladaPncp?: boolean;
  prorrogadaPncp?: boolean;
  dataAtualizacaoPncp?: string;
}

export interface ArpItemsResponse {
  resultado: ArpItemRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface ArpItemRecord {
  numeroAtaRegistroPreco: string;
  codigoUnidadeGerenciadora: string;
  numeroCompra: string;
  anoCompra: string;
  codigoModalidadeCompra: string;
  dataAssinatura: string;
  dataVigenciaInicial: string;
  dataVigenciaFinal: string;
  numeroItem: string;
  codigoItem: number;
  descricaoItem: string;
  tipoItem: string;
  quantidadeHomologadaItem: number;
  classificacaoFornecedor: string;
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
  quantidadeHomologadaVencedor: number;
  valorUnitario: number;
  valorTotal: number;
  maximoAdesao: number;
  nomeUnidadeGerenciadora: string;
  nomeModalidadeCompra: string;
  idCompra: string;
  numeroControlePncpCompra: string;
  dataHoraInclusao: string;
  dataHoraAtualizacao: string;
  dataHoraExclusao: string | null;
  itemExcluido: boolean;
  numeroControlePncpAta: string;
  codigoPdm: number;
  nomePdm: string;
  quantidadeEstimadaEdital?: number;
}

export interface UnidadesItemResponse {
  resultado: UnidadeItemRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface UnidadeItemRecord {
  numeroAta: string;
  unidadeGerenciadora: string;
  numeroItem: string;
  codigoPdm: string;
  descricaoItem: string;
  fornecedor: string;
  quantidadeRegistrada: number;
  saldoAdesoes: number;
  saldoRemanejamentoEmpenho: number;
  qtdLimiteAdesao: number;
  qtdLimiteInformadoCompra: number;
  aceitaAdesao: boolean;
  dataHoraInclusao: string;
  dataHoraAtualizacao: string;
  dataHoraExclusao: string | null;
  codigoUnidade: string;
  nomeUnidade: string;
  tipoUnidade: string;
}

export interface FilterParams {
  dataVigenciaInicialMin: string;
  dataVigenciaInicialMax: string;
  codigoUnidadeGerenciadora?: string;
  numeroAtaRegistroPreco?: string;
}

export interface EmpenhosSaldoItemResponse {
  resultado: EmpenhoSaldoItemRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface EmpenhoSaldoItemRecord {
  numeroItem: string;
  unidade: string;
  tipo: string;
  quantidadeRegistrada: number;
  quantidadeEmpenhada: number;
  saldoEmpenho: number;
  dataHoraInclusao: string | null;
  dataHoraAtualizacao: string;
  // Campos detalhados da Nota de Empenho (NE) individual
  numeroEmpenho?: string;
  dataEmpenho?: string;
  quantidadeIncluida?: number;
  reforco?: number;
  anulacao?: number;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  valorEmpenhado?: number;
}

export interface AdesaoItemRecord {
  numeroItem: string;
  unidade: string;
  tipo?: string;
  quantidadeRegistrada: number;
  quantidadeEmpenhada: number;
  saldoEmpenho: number;
  dataHoraInclusao: string | null;
  dataHoraAtualizacao: string;
  numeroAta?: string;
  unidadeGerenciadora?: string;
  orgaoAdesao?: string;
  statusAdesao?: string;
}

export interface AdesoesItemResponse {
  resultado: AdesaoItemRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface InternalAllocation {
  id: string;
  unitName: string;
  allocatedQty: number;
  empenhadaQty: number;
}

export interface PncpContract {
  numeroContrato: string;
  cnpj?: string;
  anoContrato?: number;
  sequencialContrato?: number;
  objeto?: string;
  valorInicial?: number;
  nomeRazaoSocialFornecedor?: string;
  niFornecedor?: string;
  dataAssinatura?: string;
  dataVigenciaInicial?: string;
  dataVigenciaFinal?: string;
  numeroControlePncp?: string;
  valorTotalHomologado?: number;
  receitaDespesa?: string;
  tipoContrato?: string;
  unidadeNome?: string;
  orgaoNome?: string;
  uasg?: string;
  tipoUnidade?: 'GERENCIADORA' | 'PARTICIPANTE';
  contratoId?: number;
  /** Quantidade contratada do item obtida via Contratos.gov.br e Compras.gov.br */
  quantidadeContratada?: number | null;
  valorUnitarioItem?: number | null;
  valorTotalItem?: number | null;
  numeroItemContratado?: string;
  linkVisualizacao?: string;
  historicoPrecos?: HistoricoItemPrice[];
}

export interface HistoricoItemPrice {
  dataTermo: string;
  valorUnitario: number;
  quantidade?: number;
  tipoHistorico?: string;
}

export interface EmpenhoItemMinuta {
  sequencial_siafi?: number;
  numero_item_compra?: string;
  codigo_item?: number;
  subelemento?: string;
  descricao?: string;
  descricao_detalhada?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
}

export interface ContratosGovEmpenhoRecord {
  id: number;
  unidade_gestora?: string;
  gestao?: string;
  numero: string;
  data_emissao: string;
  credor?: string;
  fonte_recurso?: string;
  programa_trabalho?: string;
  planointerno?: string;
  naturezadespesa?: string;
  empenhado: string | number;
  aliquidar?: string | number;
  liquidado?: string | number;
  pago?: string | number;
  rpinscrito?: string | number;
  rpaliquidar?: string | number;
  rpliquidado?: string | number;
  rppago?: string | number;
  informacao_complementar?: string;
  sistema_origem?: string;
  credor_obj?: {
    tipo?: string;
    cnpj_cpf_idgener?: string;
    nome?: string;
  };
  links?: {
    documento_pagamento?: string;
  };
  itens_minuta?: EmpenhoItemMinuta[];
  quantidadeFisicaOriginal?: number;
  quantidadeManual?: number;
  quantidadeDeduzida?: number;
  isDeduzido?: boolean;
  isReforco?: boolean;
}

export interface ComprasGovContratoItemRecord {
  codigoOrgao?: string;
  codigoUnidadeGestora?: string;
  codigoUnidadeGestoraOrigemContrato?: string;
  codigoUnidadeRealizadoraCompra?: string;
  codigoModalidadeCompra?: string;
  numeroContrato?: string;
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  processo?: string;
  dataVigenciaInicial?: string;
  dataVigenciaFinal?: string;
  valorGlobal?: number;
  tipoItem?: string;
  codigoItem?: number;
  descricaoIitem?: string;
  quantidadeItem?: number;
  valorUnitarioItem?: number;
  valorTotalItem?: number;
  dataHoraInclusao?: string;
  numeroControlePncpContrato?: string;
  idCompra?: string;
  numeroItem?: string;
  nomeOrgao?: string;
  nomeUnidadeGestora?: string;
}

export interface ComprasGovContratosItemResponse {
  resultado: ComprasGovContratoItemRecord[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface PncpContractEmpenho {
  numeroEmpenho: string;
  valorTotal: number;
  dataEmissaoEmpenho: string;
  sequencialEmpenho: number;
}

export interface ProcessoSei {
  id: string;
  numeroProcessoSei: string;
  descricaoObjeto?: string;
  unidadeRequisitante?: string;
  responsavelNome?: string;
  statusProcesso?: 'Em Instrução' | 'Aprovado' | 'Empenhado' | 'Concluído';
  createdAt?: string;
  updatedAt?: string;
}

export interface SyncMetadata {
  isCachedInDb: boolean;
  ultimoSyncEm?: string;
  dataHoraAtualizacaoApi?: string;
  divergenciaDetectada?: boolean;
  totalAtas?: number;
  totalItens?: number;
  status?: 'SUCCESS' | 'SYNCING' | 'ERROR' | 'IDLE';
  mensagem?: string;
}

export interface ExtendedInternalAllocation extends InternalAllocation {
  processoSeiId?: string;
  numeroProcessoSei?: string;
  numeroEmpenho?: string;
  dataEmpenho?: string;
  observacoes?: string;
}

export type AdesaoStatusType = 'ACEITA' | 'NAO_ACEITA' | 'VARIAVEL' | 'NAO_INFORMADA';

export interface AtaGroupedCard {
  key: string;
  arp: ArpRecord;
  fornecedorNome: string;
  fornecedorCnpj: string;
  itens: ArpItemRecord[];
  adesaoStatus: AdesaoStatusType;
  totalItens: number;
}

// -------------------------------------------------------------
// Domínio Canônico: Empenho, Contrato e Relacionamento
// -------------------------------------------------------------
export type OrigemRegistro = 'API' | 'MANUAL' | 'SINCRONIZADO';
export type StatusEmpenho = 'CONFIRMADO' | 'PENDENTE' | 'DIVERGENTE';
export type StatusReconciliacao = 'CONSISTENTE' | 'DIVERGENTE' | 'NAO_INFORMADO';

export interface Empenho {
  id: string;
  numero: string;
  ano: number;
  arpId: string;
  itemId: string;
  uasg: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
  data?: string;
  fornecedor?: string;
  cnpjFornecedor?: string;
  unidadeInternaId?: string;
  observacao?: string;
  origem: OrigemRegistro;
  status: StatusEmpenho;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Contrato {
  id: string;
  numero: string;
  ano: number;
  arpId: string;
  itemId?: string;
  uasg: string;
  numeroControlePncp?: string;
  linkPncp?: string;
  fornecedor?: string;
  cnpjFornecedor?: string;
  objeto?: string;
  quantidadeContratada?: number;
  valorTotal?: number;
  origem: OrigemRegistro;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ContratoEmpenho {
  id: string;
  contratoId: string;
  empenhoId: string;
  quantidadeVinculada?: number;
  dataVinculo: string;
  origem: OrigemRegistro;
}

export interface ReconciliationReport {
  quantidadeRegistrada: number;
  totalEmpenhadoApi: number;
  totalEmpenhadoManual: number;
  totalEmpenhado: number;
  saldoCalculado: number;
  saldoApi?: number;
  divergencia: number;
  status: StatusReconciliacao;
  mensagem: string;
}

export type StatusVigenciaContrato = 'Vigente' | 'Expirado' | 'A Vencer (60d)' | 'Não Informado';

export interface ContractDashboardRecord {
  id: string;
  numero: string;
  ano: number | string;
  numeroFormatado: string;
  uasg: string;
  nomeUnidadeGestora?: string;
  codigoOrgao?: string;
  nomeOrgao?: string;
  objeto?: string;
  processo?: string;
  fornecedorNome?: string;
  fornecedorCnpjCpf?: string;
  valorGlobal?: number;
  valorInicial?: number;
  dataAssinatura?: string;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  statusVigencia: StatusVigenciaContrato;
  numeroControlePncp?: string;
  idCompra?: string;
  modalidadeCompra?: string;
  contratoId?: number | string;
  fonteDados: 'Compras.gov.br' | 'Contratos.gov.br' | 'PNCP' | 'Sistema SaldoARP (Manual)' | string;
  // Metadados de Origem e Rastreabilidade de Sincronização (Fase 1)
  sourceSystem?: 'Compras.gov.br' | 'Contratos.gov.br' | 'PNCP' | 'SaldoARP' | string;
  sourceRecordId?: string | number;
  sourceUpdatedAt?: string;
  lastSyncedAt?: string;
  origem?: OrigemRegistro;
  itensCount?: number;
  empenhosCount?: number;
  linkPncp?: string;
  raw?: any;
}

/** Campos de autoridade da API governamental (não editáveis diretamente pelo usuário) */
export const OFFICIAL_CONTRACT_FIELDS = [
  'numero',
  'ano',
  'uasg',
  'nomeUnidadeGestora',
  'codigoOrgao',
  'nomeOrgao',
  'objeto',
  'processo',
  'fornecedorNome',
  'fornecedorCnpjCpf',
  'valorGlobal',
  'valorInicial',
  'dataAssinatura',
  'dataVigenciaInicio',
  'dataVigenciaFim',
  'numeroControlePncp',
  'idCompra',
  'modalidadeCompra',
  'contratoId',
  'fonteDados',
  'linkPncp'
] as const;

/** Campos de gestão operacional interna do SaldoARP (preservados em sincronizações oficiais) */
export const INTERNAL_CONTRACT_FIELDS = [
  'gestorNome',
  'planoTarefas',
  'observacoes',
  'prioridade',
  'processoSeiId'
] as const;

export interface ContractFilterParams {
  uasg: string;
  numeroAno: string;
  fornecedor: string;
  statusVigencia: 'todos' | 'vigente' | 'expirado' | 'a_vencer';
  dataVigenciaMin: string;
  dataVigenciaMax: string;
  anoContrato: string;
}

export interface ContractDashboardKPIs {
  totalContratos: number;
  contratosVigentes: number;
  contratosExpirados: number;
  contratosAVencer: number;
  totalFornecedores: number;
  valorTotalGlobal: number;
}

export interface ContractDetailItem {
  numero_item?: string | number;
  numeroItem?: string | number;
  codigoItem?: number;
  descricao?: string;
  descricaoIitem?: string;
  material_ou_servico_nome?: string;
  quantidade?: number;
  quantidadeItem?: number;
  valor_unitario?: number;
  valorUnitarioItem?: number;
  valor_total?: number;
  valorTotalItem?: number;
  [key: string]: any;
}

export interface ContractDetailEmpenho {
  numero_empenho?: string;
  numeroEmpenho?: string;
  data_emissao?: string;
  dataEmissao?: string;
  valor_empenhado?: number;
  valorEmpenhado?: number;
  credor?: string;
  [key: string]: any;
}

// -------------------------------------------------------------
// Gestão de Contratos: Gestor, Templates e Plano de Tarefas
// -------------------------------------------------------------
export type ContractTaskStatusValue = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NAO_APLICAVEL';

/**
 * Semântica de Execução de Tarefas (SaldoARP — Fase 4.3C)
 * Princípio: "DIGITE UMA VEZ, USE EM TODO LUGAR"
 */
export type TaskExecutionMode =
  | 'INTERNA'       // Trabalho intelectual/administrativo executado pela equipe no SaldoARP ou no SEI
  | 'EXTERNA'       // Ação necessária em sistema governamental terceiro (Contratos.gov.br, SICAF, Mediador MTE, SEI)
  | 'AUTOMATICA'    // Processamento computado diretamente pelo SaldoARP (limites 25%/50%, índices, prazos)
  | 'CONFIRMACAO';  // Conciliação e captura de fato oficial retornado pelas APIs governamentais soberanas

export interface ContractManager {
  contractKey: string;
  uasg: string;
  numero: string;
  ano: number;
  gestorNome: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractTaskTemplateTask {
  id: string;
  macrotaskId: string;
  nome: string;
  ordem: number;
  executionMode?: TaskExecutionMode;
  sistemaDestino?: string;
  externalLinkUrl?: string;
}

export interface ContractTaskTemplateMacrotask {
  id: string;
  templateId: string;
  nome: string;
  ordem: number;
  tarefas: ContractTaskTemplateTask[];
}

export interface ContractTaskTemplate {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
  macrotarefas: ContractTaskTemplateMacrotask[];
}

export interface ContractTask {
  id: string;
  macrotaskId: string;
  nome: string;
  ordem: number;
  status: ContractTaskStatusValue;
  executionMode?: TaskExecutionMode;
  sistemaDestino?: string;
  externalLinkUrl?: string;
  responsavelNome?: string;
  prazo?: string;
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
  concluidoEm?: string;
  concluidoPor?: string;
}

export interface ContractTaskMacrotask {
  id: string;
  planId: string;
  nome: string;
  ordem: number;
  tarefas: ContractTask[];
}

export interface ContractTaskPlanProgress {
  total: number;
  concluidas: number;
  pendentes: number;
  emAndamento: number;
  naoAplicaveis: number;
  atrasadas: number;
  percentual: number;
}

export interface ContractTaskPlan {
  id: string;
  contractKey: string;
  uasg: string;
  numero: string;
  ano: number;
  templateId?: string;
  templateNome: string;
  appliedAt: string;
  macrotarefas: ContractTaskMacrotask[];
  progresso: ContractTaskPlanProgress;
}

// -------------------------------------------------------------
// Gestão de Eventos e Ciclos Contratuais (Fase 4)
// -------------------------------------------------------------
export * from './contractEvents';
export * from './contractProrrogation';
export * from './contractAmendments';
export * from './contractAmendmentWorkflows';
export * from './contractExtinctions';
export * from './contractClosureWorkflows';
export * from './contractRescissionWorkflows';







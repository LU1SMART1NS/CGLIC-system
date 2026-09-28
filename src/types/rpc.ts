/**
 * Contratos de Tipos para RPCs Transacionais do PostgreSQL (SaldoARP 3.0)
 */

export type MutationErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_ITEM_KEY'
  | 'INVALID_PAYLOAD'
  | 'INVALID_DEPARTMENT'
  | 'INVALID_ALLOCATION'
  | 'DUPLICATE_LINK'
  | 'INVALID_PROCESS_SEI'
  | 'CONCURRENT_MODIFICATION_ERROR'
  | 'EXPECTED_VERSION_REQUIRED'
  | 'INVALID_CONTRACT_LINK'
  | 'INVALID_EMPENHO_ID_FORMAT'
  | 'DUPLICATE_DEPARTMENT'
  | 'DEPARTMENT_NOT_FOUND'
  | 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS'
  | 'TARGET_DEPARTMENT_NOT_FOUND'
  | 'TARGET_DEPARTMENT_INACTIVE'
  | 'DUPLICATE_PROCESS_SEI'
  | 'PROCESS_SEI_NOT_FOUND'
  | 'INVALID_PROCESS_SEI_STATUS'
  | 'CONTRACT_NOT_FOUND'
  | 'DUPLICATE_TEMPLATE'
  | 'TEMPLATE_NOT_FOUND'
  | 'MACROTASK_NOT_FOUND'
  | 'TEMPLATE_TASK_NOT_FOUND'
  | 'CONTRACT_PLAN_ALREADY_EXISTS'
  | 'CONTRACT_TASK_NOT_FOUND'
  | 'ATA_PLAN_ALREADY_EXISTS'
  | 'ATA_TASK_NOT_FOUND'
  | 'INVALID_TASK_STATUS'
  | 'PAYMENT_CYCLE_ALREADY_EXISTS'
  | 'PAYMENT_CYCLE_NOT_FOUND'
  | 'INVALID_CYCLE_STATUS'
  | 'NETWORK_OR_CONFIG_ERROR'
  | 'UNKNOWN';

export interface AppMutationError {
  code: MutationErrorCode;
  message: string;
  sqlState?: string;
  details?: unknown;
}

export interface RpcAllocationItem {
  id?: string;
  unit_name?: string;
  unitName?: string;
  allocated_qty?: number;
  allocatedQty?: number;
  empenhada_qty?: number;
  empenhadaQty?: number;
  processo_sei_id?: string;
  processoSeiId?: string;
}

export interface RpcAllocationPayload {
  itemKey: string;
  allocations: RpcAllocationItem[];
  expectedVersion?: number | null;
}

export interface RpcAllocationResult {
  success: boolean;
  item_key: string;
  previous_version: number;
  new_version: number;
  count: number;
  timestamp: string;
}

export interface RpcEmpenhoLinkItem {
  empenho_numero?: string;
  empenhoNumero?: string;
  allocation_id?: string;
  allocationId?: string;
}

export interface RpcEmpenhoLinkPayload {
  itemKey: string;
  links: RpcEmpenhoLinkItem[];
  expectedVersion: number;
}

export interface RpcEmpenhoLinkResult {
  success: boolean;
  item_key: string;
  previous_version: number;
  new_version: number;
  count: number;
  timestamp: string;
}

export interface RpcContratoPayload {
  contrato: {
    id?: string;
    item_key?: string;
    itemKey?: string;
    numero: string;
    ano: number;
    arp_id?: string;
    arpId?: string;
    item_id?: string;
    itemId?: string;
    uasg: string;
    numero_controle_pncp?: string;
    numeroControlePncp?: string;
    link_pncp?: string;
    linkPncp?: string;
    fornecedor?: string;
    cnpj_fornecedor?: string;
    cnpjFornecedor?: string;
    objeto?: string;
    quantidade_contratada?: number;
    quantidadeContratada?: number;
    valor_total?: number;
    valorTotal?: number;
    origem?: 'API' | 'MANUAL' | 'SINCRONIZADO' | string;
  };
  empenhoIds: string[];
}

export interface RpcContratoResult {
  success: boolean;
  contrato_id: string;
  item_key: string;
  links_count: number;
  timestamp: string;
}

export interface RpcDeleteContratoResult {
  success: boolean;
  id: string;
  item_key: string;
  numero: string;
  ano: number;
  message: string;
}

export interface RpcManualEmpenhoItem {
  id?: string;
  numero: string;
  ano: number;
  arp_id?: string;
  arpId?: string;
  item_id?: string;
  itemId?: string;
  uasg: string;
  quantidade: number;
  valor_unitario?: number | null;
  valorUnitario?: number | null;
  valor_total?: number | null;
  valorTotal?: number | null;
  data?: string | null;
  fornecedor?: string | null;
  cnpj_fornecedor?: string | null;
  cnpjFornecedor?: string | null;
  unidade_interna_id?: string | null;
  unidadeInternaId?: string | null;
  observacao?: string | null;
  origem?: 'API' | 'MANUAL' | 'SINCRONIZADO' | string;
  status?: 'CONFIRMADO' | 'PENDENTE' | 'DIVERGENTE' | string;
}

export interface RpcManualEmpenhoPayload {
  itemKey: string;
  empenhos: RpcManualEmpenhoItem[];
  expectedVersion: number;
}

export interface RpcManualEmpenhoResult {
  success: boolean;
  item_key: string;
  previous_version: number;
  new_version: number;
  count: number;
  timestamp: string;
}

export interface RpcManualQuantityItem {
  emp_key: string;
  quantidade: number;
}

export interface RpcManualQuantityPayload {
  itemKey: string;
  quantities: Record<string, number> | RpcManualQuantityItem[];
  expectedVersion: number;
}

export interface RpcManualQuantityResult {
  success: boolean;
  item_key: string;
  previous_version: number;
  new_version: number;
  count: number;
  timestamp: string;
}

export interface RpcDepartmentItem {
  id: string;
  sigla: string;
  nome_completo: string;
  descricao?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RpcDepartmentResult {
  success: boolean;
  department: RpcDepartmentItem;
}

export interface RpcDeleteDepartmentResult {
  success: boolean;
  deleted: boolean;
  deactivated: boolean;
  id: string;
  sigla: string;
  allocations_count: number;
  message: string;
}

export interface RpcMergeDepartmentResult {
  success: boolean;
  old_name: string;
  target_sigla: string;
  rows_updated: number;
  timestamp?: string;
  message?: string;
}

export interface RpcProcessoSeiItem {
  id: string;
  numero_processo_sei: string;
  descricao_objeto?: string | null;
  unidade_requisitante?: string | null;
  responsavel_nome?: string | null;
  status_processo: 'Em Instrução' | 'Aprovado' | 'Empenhado' | 'Concluído' | string;
  created_at: string;
  updated_at: string;
}

export interface RpcProcessoSeiResult {
  success: boolean;
  processo: RpcProcessoSeiItem;
}

export interface RpcDeleteProcessoSeiResult {
  success: boolean;
  id: string;
  numero_processo_sei: string;
  message: string;
}

// -------------------------------------------------------------
// Gestão de Contratos: Gestor, Templates e Plano de Tarefas
// -------------------------------------------------------------
export type ContractTaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NAO_APLICAVEL';

export interface RpcContractManagerItem {
  contract_key: string;
  uasg: string;
  numero: string;
  ano: number;
  gestor_nome: string;
  gestor_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RpcContractManagerResult {
  success: boolean;
  manager: RpcContractManagerItem;
}

export interface RpcAtaManagerItem {
  ata_key: string;
  gestor_nome: string;
  gestor_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RpcAtaManagerResult {
  success: boolean;
  manager: RpcAtaManagerItem;
}

export interface RpcContractTaskTemplateItem {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RpcContractTaskTemplateResult {
  success: boolean;
  template: RpcContractTaskTemplateItem;
}

export interface RpcDeleteContractTaskTemplateResult {
  success: boolean;
  id: string;
  nome: string;
  message: string;
}

export interface RpcContractTaskTemplateMacrotaskItem {
  id: string;
  template_id: string;
  nome: string;
  ordem: number;
}

export interface RpcContractTaskTemplateMacrotaskResult {
  success: boolean;
  macrotask: RpcContractTaskTemplateMacrotaskItem;
}

export interface RpcContractTaskTemplateTaskItem {
  id: string;
  macrotask_id: string;
  nome: string;
  ordem: number;
  /** Semântica de execução canônica (Fase 10-A.2), definida no template e copiada às instâncias na aplicação. */
  execution_mode?: string | null;
}

export interface RpcContractTaskTemplateTaskResult {
  success: boolean;
  task: RpcContractTaskTemplateTaskItem;
}

export interface RpcGenericDeleteResult {
  success: boolean;
  id: string;
  message: string;
}

export interface RpcApplyContractTaskTemplateResult {
  success: boolean;
  plan_id: string;
  contract_key: string;
  template_id: string;
  template_nome: string;
  macrotasks_count: number;
  tasks_count: number;
  timestamp: string;
}

export interface RpcContractTaskItem {
  id: string;
  macrotask_id: string;
  nome: string;
  ordem: number;
  status: ContractTaskStatus;
  execution_mode?: string | null;
  responsavel_nome?: string | null;
  /** Identidade canônica do responsável (Fase 10-A.2), ponte para auth.users. */
  responsavel_user_id?: string | null;
  prazo?: string | null;
  observacao?: string | null;
  criado_em: string;
  atualizado_em: string;
  concluido_em?: string | null;
  concluido_por?: string | null;
}

export interface RpcUpdateContractTaskResult {
  success: boolean;
  task: RpcContractTaskItem;
}

// -------------------------------------------------------------
// Modelos de Gestão de Atas — espelha os tipos de Gestão de Contratos acima
// (RpcGenericDeleteResult e ContractTaskStatus são reaproveitados tal e qual).
// -------------------------------------------------------------
export interface RpcAtaTaskTemplateItem {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RpcAtaTaskTemplateResult {
  success: boolean;
  template: RpcAtaTaskTemplateItem;
}

export interface RpcDeleteAtaTaskTemplateResult {
  success: boolean;
  id: string;
  nome: string;
  message: string;
}

export interface RpcAtaTaskTemplateMacrotaskItem {
  id: string;
  template_id: string;
  nome: string;
  ordem: number;
}

export interface RpcAtaTaskTemplateMacrotaskResult {
  success: boolean;
  macrotask: RpcAtaTaskTemplateMacrotaskItem;
}

export interface RpcAtaTaskTemplateTaskItem {
  id: string;
  macrotask_id: string;
  nome: string;
  ordem: number;
  execution_mode?: string | null;
}

export interface RpcAtaTaskTemplateTaskResult {
  success: boolean;
  task: RpcAtaTaskTemplateTaskItem;
}

export interface RpcApplyAtaTaskTemplateResult {
  success: boolean;
  plan_id: string;
  ata_key: string;
  template_id: string;
  template_nome: string;
  macrotasks_count: number;
  tasks_count: number;
  timestamp: string;
}

export interface RpcAtaTaskItem {
  id: string;
  macrotask_id: string;
  nome: string;
  ordem: number;
  status: ContractTaskStatus;
  execution_mode?: string | null;
  responsavel_nome?: string | null;
  responsavel_user_id?: string | null;
  prazo?: string | null;
  observacao?: string | null;
  criado_em: string;
  atualizado_em: string;
  concluido_em?: string | null;
  concluido_por?: string | null;
}

export interface RpcUpdateAtaTaskResult {
  success: boolean;
  task: RpcAtaTaskItem;
}

// ==============================================================================
// Fase 10-A.2 — Ciclo Operacional de Pagamentos/CGOFI (contract_payment_cycles)
// ==============================================================================

export type PaymentCycleStatusValue =
  | 'RECEBIDO' | 'ATRIBUIDO' | 'EM_INSTRUCAO' | 'PENDENTE_DOCUMENTACAO'
  | 'DESPACHO_ELABORADO' | 'ENVIADO_CGOFI' | 'AGUARDANDO_CGOFI'
  | 'DEVOLVIDO_FISCAL' | 'PAGAMENTO_CONFIRMADO' | 'CONCLUIDO' | 'CANCELADO';

export interface RpcContractPaymentCycleRow {
  id: string;
  cycle_key: string;
  contract_key: string;
  competencia: string;
  empenho_canonical_key?: string | null;
  numero_processo_pagamento_sei?: string | null;
  numero_processo_contrato_sei?: string | null;
  documento_atesto_sei: string;
  documento_despacho_sei?: string | null;
  numero_ordem_bancaria?: string | null;
  numero_notas_fiscais?: number | null;
  valor_atesto: number;
  data_assinatura_atesto: string;
  data_vencimento_fatura: string;
  data_envio_cgofi?: string | null;
  data_ordem_bancaria?: string | null;
  status: PaymentCycleStatusValue;
  titular_nome?: string | null;
  responsavel_nome?: string | null;
  responsavel_user_id?: string | null;
  observacoes?: string | null;
  origem_dado: 'MANUAL' | 'OFICIAL';
  criado_em: string;
  atualizado_em: string;
  concluido_em?: string | null;
  concluido_por?: string | null;
}

export interface RpcCreatePaymentCycleResult {
  success: boolean;
  cycle: {
    id: string;
    cycle_key: string;
    contract_key: string;
    competencia: string;
    status: PaymentCycleStatusValue;
    criado_em: string;
  };
  task_plan: Record<string, unknown> | null;
}

export interface RpcUpdatePaymentCycleResult {
  success: boolean;
  cycle: {
    id: string;
    cycle_key: string;
    contract_key: string;
    competencia: string;
    status: PaymentCycleStatusValue;
    documento_despacho_sei?: string | null;
    data_envio_cgofi?: string | null;
    numero_ordem_bancaria?: string | null;
    data_ordem_bancaria?: string | null;
    responsavel_nome?: string | null;
    responsavel_user_id?: string | null;
    observacoes?: string | null;
    atualizado_em: string;
    concluido_em?: string | null;
    concluido_por?: string | null;
  };
}



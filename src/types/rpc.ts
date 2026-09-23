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
  | 'INVALID_TASK_STATUS'
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
  created_at: string;
  updated_at: string;
}

export interface RpcContractManagerResult {
  success: boolean;
  manager: RpcContractManagerItem;
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
  responsavel_nome?: string | null;
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



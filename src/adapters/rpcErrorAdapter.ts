import type { AppMutationError } from '../types/rpc';

/**
 * Adapter para traduzir erros técnicos do Supabase / PostgreSQL em erros tipados de aplicação.
 */
export function mapPostgresErrorToAppError(error: any): AppMutationError {
  if (!error) {
    return {
      code: 'UNKNOWN',
      message: 'Erro desconhecido durante a mutação.'
    };
  }

  const message: string = error.message || String(error);
  const sqlState: string = error.code || error.sqlState || '';

  // 1. Mapeamento por Código Explícito no texto da exceção
  if (message.includes('UNAUTHORIZED') || sqlState === '42501') {
    return {
      code: 'UNAUTHORIZED',
      message: 'Acesso negado: operação restrita a gestores e administradores do SaldoARP.',
      sqlState: '42501',
      details: error
    };
  }

  if (message.includes('INVALID_ITEM_KEY')) {
    return {
      code: 'INVALID_ITEM_KEY',
      message: 'A chave do item informada é inválida ou fora do padrão canônico.',
      sqlState: '22023',
      details: error
    };
  }

  if (message.includes('EXPECTED_VERSION_REQUIRED')) {
    return {
      code: 'EXPECTED_VERSION_REQUIRED',
      message: 'O parâmetro de versão esperada é obrigatório para este item para evitar conflitos de concorrência.',
      sqlState: '40001',
      details: error
    };
  }

  if (message.includes('CONCURRENT_MODIFICATION_ERROR') || sqlState === '40001') {
    return {
      code: 'CONCURRENT_MODIFICATION_ERROR',
      message: 'Conflito de concorrência: os dados foram modificados por outro usuário. Recarregue e tente novamente.',
      sqlState: '40001',
      details: error
    };
  }

  if (message.includes('INVALID_DEPARTMENT') || (sqlState === '23503' && message.includes('department'))) {
    return {
      code: 'INVALID_DEPARTMENT',
      message: 'Departamento inválido ou inativo no catálogo oficial.',
      sqlState: '23503',
      details: error
    };
  }

  if (message.includes('INVALID_ALLOCATION') || (sqlState === '23503' && message.includes('alocação'))) {
    return {
      code: 'INVALID_ALLOCATION',
      message: 'Alocação interna inválida, inexistente ou não pertencente a este item.',
      sqlState: '23503',
      details: error
    };
  }

  if (message.includes('DUPLICATE_DEPARTMENT') || (sqlState === '23505' && message.includes('internal_departments'))) {
    return {
      code: 'DUPLICATE_DEPARTMENT',
      message: 'Já existe uma unidade cadastrada com esta sigla.',
      sqlState: '23505',
      details: error
    };
  }

  if (message.includes('DEPARTMENT_NOT_FOUND')) {
    return {
      code: 'DEPARTMENT_NOT_FOUND',
      message: 'Unidade não encontrada no catálogo oficial.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS')) {
    return {
      code: 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS',
      message: 'Esta unidade possui alocações vinculadas e não pode ser excluída. Desative-a para impedir novas alocações.',
      sqlState: '23503',
      details: error
    };
  }

  if (message.includes('TARGET_DEPARTMENT_NOT_FOUND')) {
    return {
      code: 'TARGET_DEPARTMENT_NOT_FOUND',
      message: 'A unidade de destino selecionada para mesclagem não foi encontrada.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('TARGET_DEPARTMENT_INACTIVE')) {
    return {
      code: 'TARGET_DEPARTMENT_INACTIVE',
      message: 'A unidade de destino para mesclagem está inativa no sistema.',
      sqlState: '22023',
      details: error
    };
  }

  if (message.includes('DUPLICATE_LINK') || (sqlState === '23505' && message.includes('empenho_links'))) {
    return {
      code: 'DUPLICATE_LINK',
      message: 'Vínculo de empenho duplicado para este item.',
      sqlState: '23505',
      details: error
    };
  }


  if (message.includes('DUPLICATE_PROCESS_SEI') || (sqlState === '23505' && message.includes('processos_sei'))) {
    return {
      code: 'DUPLICATE_PROCESS_SEI',
      message: 'Já existe um processo SEI cadastrado com este número.',
      sqlState: '23505',
      details: error
    };
  }

  if (message.includes('PROCESS_SEI_NOT_FOUND')) {
    return {
      code: 'PROCESS_SEI_NOT_FOUND',
      message: 'Processo SEI não encontrado no sistema.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('INVALID_PROCESS_SEI_STATUS')) {
    return {
      code: 'INVALID_PROCESS_SEI_STATUS',
      message: 'Status do processo SEI inválido. Valores permitidos: Em Instrução, Aprovado, Empenhado, Concluído.',
      sqlState: '22023',
      details: error
    };
  }

  if (message.includes('INVALID_PROCESS_SEI')) {
    return {
      code: 'INVALID_PROCESS_SEI',
      message: 'Processo SEI informado não foi encontrado.',
      sqlState: '23503',
      details: error
    };
  }

  if (message.includes('CONTRACT_NOT_FOUND')) {
    return {
      code: 'CONTRACT_NOT_FOUND',
      message: 'Contrato manual não encontrado no sistema.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('INVALID_CONTRACT_LINK') || (sqlState === '23514' && message.includes('RN-07'))) {
    return {
      code: 'INVALID_CONTRACT_LINK',
      message: 'Regra RN-07: Todo contrato exige vinculação a pelo menos um empenho.',
      sqlState: '23514',
      details: error
    };
  }

  if (message.includes('DUPLICATE_TEMPLATE')) {
    return {
      code: 'DUPLICATE_TEMPLATE',
      message: 'Já existe um template de gestão contratual cadastrado com este nome.',
      sqlState: '23505',
      details: error
    };
  }

  if (message.includes('TEMPLATE_NOT_FOUND')) {
    return {
      code: 'TEMPLATE_NOT_FOUND',
      message: 'Template de gestão contratual não encontrado.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('MACROTASK_NOT_FOUND')) {
    return {
      code: 'MACROTASK_NOT_FOUND',
      message: 'Macrotarefa não encontrada.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('TEMPLATE_TASK_NOT_FOUND')) {
    return {
      code: 'TEMPLATE_TASK_NOT_FOUND',
      message: 'Tarefa do template não encontrada.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('CONTRACT_PLAN_ALREADY_EXISTS')) {
    return {
      code: 'CONTRACT_PLAN_ALREADY_EXISTS',
      message: 'Este contrato já possui um plano de gestão aplicado.',
      sqlState: '23505',
      details: error
    };
  }

  if (message.includes('CONTRACT_TASK_NOT_FOUND')) {
    return {
      code: 'CONTRACT_TASK_NOT_FOUND',
      message: 'Tarefa do plano de gestão do contrato não encontrada.',
      sqlState: 'P0002',
      details: error
    };
  }

  if (message.includes('INVALID_TASK_STATUS')) {
    return {
      code: 'INVALID_TASK_STATUS',
      message: 'Status de tarefa inválido. Valores permitidos: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.',
      sqlState: '22023',
      details: error
    };
  }

  if (message.includes('INVALID_EMPENHO_ID_FORMAT')) {
    return {
      code: 'INVALID_EMPENHO_ID_FORMAT',
      message: 'Formato de identificador de empenho inválido para vinculação.',
      sqlState: '22023',
      details: error
    };
  }

  if (message.includes('INVALID_PAYLOAD') || sqlState === '22023') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Dados inválidos fornecidos para a operação.',
      sqlState: '22023',
      details: error
    };
  }

  // 2. Erros genéricos de conexão
  if (message.includes('Failed to fetch') || message.toLowerCase().includes('network') || message.includes('JWT') || message.includes('NETWORK_OR_CONFIG_ERROR')) {
    return {
      code: 'NETWORK_OR_CONFIG_ERROR',
      message: 'Falha de comunicação com o servidor de dados.',
      details: error
    };
  }

  return {
    code: 'UNKNOWN',
    message: message || 'Ocorreu um erro inesperado na operação.',
    sqlState: sqlState || undefined,
    details: error
  };
}

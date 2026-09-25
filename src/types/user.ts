export type StandardUserRole = 'coordenador' | 'gestor' | 'consulta';
export type UserRole = StandardUserRole | string;

/**
 * Escopo de visibilidade e atuação sobre contratos administrativos.
 * - GLOBAL: Visualiza e atua sobre todo o acervo da organização / UASG.
 * - ASSIGNED: Visualiza e atua estritamente sobre contratos atribuídos formalmente ao operador.
 * - UNIT: Visualiza e atua sobre contratos vinculados à sua unidade setorial / departamento.
 */
export type ContractScope = 'GLOBAL' | 'ASSIGNED' | 'UNIT';

/**
 * Macroprocessos operacionais da gestão de compras públicas e contratos (ComprasSUSP).
 */
export type PermissionMacroprocess =
  | 'ACESSO_ESCOPO'
  | 'GESTAO_FISCALIZACAO'
  | 'EXECUCAO_FINANCEIRA'
  | 'PRAZOS_VIGENCIAS'
  | 'GOVERNANCA_SISTEMA';

/**
 * Matriz canônica de permissões operacionais do SaldoARP.
 * Preserva retrocompatibilidade total com as 7 propriedades originais,
 * separando explicitamente a dimensão de escopo (contractScope).
 */
export interface RolePermissions {
  // --- Dimensão Canônica de Escopo ---
  contractScope: ContractScope;

  // --- 1. Acesso & Escopo ---
  visualizarContratos: boolean;
  visualizarAtas: boolean;
  visualizarItens: boolean;
  /** @deprecated Utilize contractScope === 'GLOBAL'. Mantido temporariamente para retrocompatibilidade. */
  visualizarTodosContratos: boolean;

  // --- 2. Gestão & Fiscalização Contratual ---
  distribuirContratos: boolean;
  editarTarefasContratuais: boolean;
  aplicarTemplates: boolean;

  // --- 3. Execução Financeira ---
  visualizarEmpenhos: boolean;
  sincronizarEmpenhos: boolean;
  visualizarPagamentos: boolean;
  registrarPagamentos: boolean;

  // --- 4. Prazos & Vigências ---
  visualizarPrazos: boolean;
  gerenciarEventosContratuais: boolean;

  // --- 5. Governança & Sistema ---
  gerenciarDepartamentos: boolean;
  exportarRelatorios: boolean;
  gerenciarUsuarios: boolean;
  gerenciarPerfis: boolean;
}

export interface PermissionDefinition {
  key: keyof Omit<RolePermissions, 'contractScope'>;
  label: string;
  description: string;
  macroprocesso: PermissionMacroprocess;
  readOnly?: boolean;
}

/**
 * Catálogo canônico e centralizado de permissões do ComprasSUSP.
 * Fonte única de verdade consumida por serviços, hooks e telas de permissões.
 */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // 1. ACESSO & ESCOPO
  {
    key: 'visualizarContratos',
    label: 'Visualizar Contratos',
    description: 'Acessar a carteira de contratos conforme o escopo delimitado (Global ou Atribuídos).',
    macroprocesso: 'ACESSO_ESCOPO'
  },
  {
    key: 'visualizarAtas',
    label: 'Consultar Atas de Registro de Preços',
    description: 'Consultar o acervo de atas de registro de preços, vigências e anexos.',
    macroprocesso: 'ACESSO_ESCOPO',
    readOnly: true
  },
  {
    key: 'visualizarItens',
    label: 'Consultar Itens e Saldos de Atas',
    description: 'Consultar especificações, quantidades homologadas e saldos de itens de atas.',
    macroprocesso: 'ACESSO_ESCOPO',
    readOnly: true
  },
  {
    key: 'visualizarTodosContratos',
    label: 'Visualizar Todos os Contratos e Atas (Legado)',
    description: 'Permissão ampla para consultar todo o acervo da UASG 200331. [Legado: utilize contractScope].',
    macroprocesso: 'ACESSO_ESCOPO',
    readOnly: true
  },

  // 2. GESTÃO & FISCALIZAÇÃO CONTRATUAL
  {
    key: 'distribuirContratos',
    label: 'Distribuir e Atribuir Gestão de Contratos',
    description: 'Designar servidores responsáveis pela fiscalização e gestão de contratos.',
    macroprocesso: 'GESTAO_FISCALIZACAO'
  },
  {
    key: 'editarTarefasContratuais',
    label: 'Editar Checklist e Tarefas de Fiscalização',
    description: 'Preencher prazos, marcar tarefas concluídas e registrar observações operacionais.',
    macroprocesso: 'GESTAO_FISCALIZACAO'
  },
  {
    key: 'aplicarTemplates',
    label: 'Aplicar Planos de Gestão / Templates',
    description: 'Vincular e aplicar planos de acompanhamento padronizados aos contratos.',
    macroprocesso: 'GESTAO_FISCALIZACAO'
  },

  // 3. EXECUÇÃO FINANCEIRA
  {
    key: 'visualizarEmpenhos',
    label: 'Consultar Empenhos e Execução Orçamentária',
    description: 'Visualizar notas de empenho vinculadas a contratos e itens de atas.',
    macroprocesso: 'EXECUCAO_FINANCEIRA',
    readOnly: true
  },
  {
    key: 'sincronizarEmpenhos',
    label: 'Sincronizar Empenhos com SIASG / Compras.gov',
    description: 'Disparar reconciliação e sincronização de empenhos oficiais das APIs federais.',
    macroprocesso: 'EXECUCAO_FINANCEIRA'
  },
  {
    key: 'visualizarPagamentos',
    label: 'Consultar Acompanhamento de Pagamentos',
    description: 'Visualizar cronograma físico-financeiro, liquidações e notas fiscais.',
    macroprocesso: 'EXECUCAO_FINANCEIRA',
    readOnly: true
  },
  {
    key: 'registrarPagamentos',
    label: 'Registrar Liquidações e Pagamentos',
    description: 'Inserir dados de medições, atestes de notas fiscais, retenções e ordens bancárias.',
    macroprocesso: 'EXECUCAO_FINANCEIRA'
  },

  // 4. PRAZOS & VIGÊNCIAS
  {
    key: 'visualizarPrazos',
    label: 'Consultar Central de Atenção e Prazos',
    description: 'Acompanhar alertas temporais e prazos impeditivos da Lei 14.133/2021.',
    macroprocesso: 'PRAZOS_VIGENCIAS',
    readOnly: true
  },
  {
    key: 'gerenciarEventosContratuais',
    label: 'Gerenciar Reajustes, Aditivos e Apostilas',
    description: 'Operar radar de reajuste por índices oficiais, apostilamentos e prorrogações.',
    macroprocesso: 'PRAZOS_VIGENCIAS'
  },

  // 5. GOVERNANÇA & SISTEMA
  {
    key: 'gerenciarDepartamentos',
    label: 'Gerenciar e Unificar Departamentos',
    description: 'Cadastrar, renomear e mesclar unidades requisitantes e cotas internas.',
    macroprocesso: 'GOVERNANCA_SISTEMA'
  },
  {
    key: 'exportarRelatorios',
    label: 'Exportar Relatórios Parametrizados Excel',
    description: 'Gerar planilhas consolidadas de saldos, atas, adesões e contratos.',
    macroprocesso: 'GOVERNANCA_SISTEMA'
  },
  {
    key: 'gerenciarUsuarios',
    label: 'Administrar Usuários e Servidores',
    description: 'Cadastrar novos operadores, atribuir perfis e gerenciar convites ao sistema.',
    macroprocesso: 'GOVERNANCA_SISTEMA'
  },
  {
    key: 'gerenciarPerfis',
    label: 'Administrar Perfis e Matriz de Permissões',
    description: 'Customizar catálogo de perfis e matriz de autorizações do ComprasSUSP.',
    macroprocesso: 'GOVERNANCA_SISTEMA'
  }
];

export interface MacroprocessMetadata {
  id: PermissionMacroprocess;
  title: string;
  description: string;
}

export const MACROPROCESS_LIST: MacroprocessMetadata[] = [
  {
    id: 'ACESSO_ESCOPO',
    title: '1. Acesso & Escopo',
    description: 'Níveis de visibilidade, consulta de atas, itens e delimitação da carteira de contratos.'
  },
  {
    id: 'GESTAO_FISCALIZACAO',
    title: '2. Gestão & Fiscalização',
    description: 'Distribuição de fiscais, preenchimento de checklists e aplicação de modelos de fiscalização.'
  },
  {
    id: 'EXECUCAO_FINANCEIRA',
    title: '3. Execução Financeira',
    description: 'Sincronização com SIASG / Compras.gov, consulta de empenhos e liquidações/pagamentos.'
  },
  {
    id: 'PRAZOS_VIGENCIAS',
    title: '4. Prazos & Vigências',
    description: 'Alertas da Central de Atenção (Lei 14.133/2021), radar de reajuste, apostilamentos e aditivos.'
  },
  {
    id: 'GOVERNANCA_SISTEMA',
    title: '5. Governança & Sistema',
    description: 'Administração de departamentos, relatórios gerenciais, usuários e controle de permissões.'
  }
];

export function getContractScopeDisplay(scope?: ContractScope, isReadOnly = false): {
  label: string;
  description: string;
  badgeBg: string;
  badgeColor: string;
} {
  switch (scope) {
    case 'GLOBAL':
      return isReadOnly
        ? {
            label: 'Global · Somente Leitura',
            description: 'Acesso amplo a todo o acervo para auditoria e controle, sem poderes de alteração.',
            badgeBg: '#f1f5f9',
            badgeColor: '#475569'
          }
        : {
            label: 'Global',
            description: 'Acesso total à carteira de contratos da UASG 200331.',
            badgeBg: '#eff6ff',
            badgeColor: '#0c326f'
          };
    case 'ASSIGNED':
      return {
        label: 'Apenas Contratos Atribuídos',
        description: 'Atuação operacional estritamente delimitada aos contratos vinculados ao operador.',
        badgeBg: '#e0f2fe',
        badgeColor: '#0284c7'
      };
    case 'UNIT':
      return {
        label: 'Unidade / Setorial',
        description: 'Acesso limitado aos contratos da unidade setorial / departamento do servidor.',
        badgeBg: '#fef3c7',
        badgeColor: '#b45309'
      };
    default:
      return {
        label: 'Apenas Contratos Atribuídos',
        description: 'Atuação operacional delimitada aos contratos atribuídos.',
        badgeBg: '#e0f2fe',
        badgeColor: '#0284c7'
      };
  }
}

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  contractScope: 'ASSIGNED',
  visualizarTodosContratos: false,
  visualizarContratos: true,
  visualizarAtas: true,
  visualizarItens: true,
  distribuirContratos: false,
  editarTarefasContratuais: false,
  aplicarTemplates: false,
  visualizarEmpenhos: true,
  sincronizarEmpenhos: false,
  visualizarPagamentos: true,
  registrarPagamentos: false,
  visualizarPrazos: true,
  gerenciarEventosContratuais: false,
  gerenciarDepartamentos: false,
  exportarRelatorios: true,
  gerenciarUsuarios: false,
  gerenciarPerfis: false
};

export interface RoleDefinition {
  id: string;
  nome: string;
  badgeColor: string;
  descricao: string;
  isCustom?: boolean;
  permissoes: RolePermissions;
}

/**
 * Sentinel de exibição (Fase 0.2): representa um usuário autenticado sem
 * nenhuma linha em public.user_roles (fail-closed da Fase 0.1). Nunca é um
 * perfil atribuível via formulário — não aparece no catálogo de roles.
 */
export const UNASSIGNED_ROLE_ID = 'sem_perfil';
export const UNASSIGNED_ROLE_LABEL = 'Não atribuído';

/** Resolve o rótulo de exibição de um perfil, tratando o sentinel de "sem role" explicitamente. */
export function getPerfilDisplayLabel(perfil: UserRole, roles: RoleDefinition[]): string {
  const roleObj = roles.find(r => r.id === perfil);
  if (roleObj) return roleObj.nome;
  if (perfil === UNASSIGNED_ROLE_ID) return UNASSIGNED_ROLE_LABEL;
  return perfil;
}

export type UserStatus = 'pendente' | 'ativo' | 'inativo';

export interface SystemUser {
  id: string;
  nome: string;
  email: string;
  matricula?: string;
  cargo?: string;
  departamento?: string;
  perfil: UserRole;
  status?: UserStatus;
  ativo: boolean;
  contratosCount?: number;
  createdAt?: string;
  lastSignInAt?: string;
}

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    id: 'coordenador',
    nome: 'Coordenador / Diretor',
    badgeColor: '#0c326f',
    descricao: 'Acesso total à pasta, distribuição de contratos para a equipe e gestão de configurações globais.',
    isCustom: false,
    permissoes: {
      contractScope: 'GLOBAL',
      visualizarTodosContratos: true,
      visualizarContratos: true,
      visualizarAtas: true,
      visualizarItens: true,
      distribuirContratos: true,
      editarTarefasContratuais: true,
      aplicarTemplates: true,
      visualizarEmpenhos: true,
      sincronizarEmpenhos: true,
      visualizarPagamentos: true,
      registrarPagamentos: true,
      visualizarPrazos: true,
      gerenciarEventosContratuais: true,
      gerenciarDepartamentos: true,
      exportarRelatorios: true,
      gerenciarUsuarios: true,
      gerenciarPerfis: true
    }
  },
  {
    id: 'gestor',
    nome: 'Gestor / Fiscal de Contrato',
    badgeColor: '#0284c7',
    descricao: 'Gestão operacional dos contratos atribuídos, preenchimento de checklists e acompanhamento de vigências.',
    isCustom: false,
    permissoes: {
      contractScope: 'ASSIGNED',
      visualizarTodosContratos: false,
      visualizarContratos: true,
      visualizarAtas: true,
      visualizarItens: true,
      distribuirContratos: false,
      editarTarefasContratuais: true,
      aplicarTemplates: true,
      visualizarEmpenhos: true,
      sincronizarEmpenhos: true,
      visualizarPagamentos: true,
      registrarPagamentos: true,
      visualizarPrazos: true,
      gerenciarEventosContratuais: false,
      gerenciarDepartamentos: false,
      exportarRelatorios: true,
      gerenciarUsuarios: false,
      gerenciarPerfis: false
    }
  },
  {
    id: 'consulta',
    nome: 'Consulta / Auditoria',
    badgeColor: '#64748b',
    descricao: 'Acesso somente leitura para auditoria, transparência e extração de relatórios.',
    isCustom: false,
    permissoes: {
      contractScope: 'GLOBAL',
      visualizarTodosContratos: true,
      visualizarContratos: true,
      visualizarAtas: true,
      visualizarItens: true,
      distribuirContratos: false,
      editarTarefasContratuais: false,
      aplicarTemplates: false,
      visualizarEmpenhos: true,
      sincronizarEmpenhos: false,
      visualizarPagamentos: true,
      registrarPagamentos: false,
      visualizarPrazos: true,
      gerenciarEventosContratuais: false,
      gerenciarDepartamentos: false,
      exportarRelatorios: true,
      gerenciarUsuarios: false,
      gerenciarPerfis: false
    }
  }
];

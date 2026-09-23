export type StandardUserRole = 'coordenador' | 'gestor' | 'consulta';
export type UserRole = StandardUserRole | string;

export interface RolePermissions {
  distribuirContratos: boolean;
  editarTarefasContratuais: boolean;
  aplicarTemplates: boolean;
  gerenciarDepartamentos: boolean;
  exportarRelatorios: boolean;
  visualizarTodosContratos: boolean;
  gerenciarUsuarios: boolean;
}

export interface RoleDefinition {
  id: string;
  nome: string;
  badgeColor: string;
  descricao: string;
  isCustom?: boolean;
  permissoes: RolePermissions;
}

export interface SystemUser {
  id: string;
  nome: string;
  email: string;
  matricula?: string;
  cargo?: string;
  departamento?: string;
  perfil: UserRole;
  ativo: boolean;
  contratosCount?: number;
  createdAt?: string;
}

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    id: 'coordenador',
    nome: 'Coordenador / Diretor',
    badgeColor: '#0c326f',
    descricao: 'Acesso total à pasta, distribuição de contratos para a equipe e gestão de configurações globais.',
    isCustom: false,
    permissoes: {
      distribuirContratos: true,
      editarTarefasContratuais: true,
      aplicarTemplates: true,
      gerenciarDepartamentos: true,
      exportarRelatorios: true,
      visualizarTodosContratos: true,
      gerenciarUsuarios: true
    }
  },
  {
    id: 'gestor',
    nome: 'Gestor / Fiscal de Contrato',
    badgeColor: '#0284c7',
    descricao: 'Gestão operacional dos contratos atribuídos, preenchimento de checklists e acompanhamento de vigências.',
    isCustom: false,
    permissoes: {
      distribuirContratos: false,
      editarTarefasContratuais: true,
      aplicarTemplates: true,
      gerenciarDepartamentos: false,
      exportarRelatorios: true,
      visualizarTodosContratos: true,
      gerenciarUsuarios: false
    }
  },
  {
    id: 'consulta',
    nome: 'Consulta / Auditoria',
    badgeColor: '#64748b',
    descricao: 'Acesso somente leitura para auditoria, transparência e extração de relatórios.',
    isCustom: false,
    permissoes: {
      distribuirContratos: false,
      editarTarefasContratuais: false,
      aplicarTemplates: false,
      gerenciarDepartamentos: false,
      exportarRelatorios: true,
      visualizarTodosContratos: true,
      gerenciarUsuarios: false
    }
  }
];

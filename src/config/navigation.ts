import {
  LayoutDashboard,
  Package,
  FileText,
  Settings,
  Clock,
  Coins,
  Sliders,
  Users,
  KeyRound,
  Search,
  FileSpreadsheet,
  Receipt,
  Landmark
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppRole } from '../types/rbac';

export interface NavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  route?: string;
  children?: NavItem[];
  /** 'active' = funcionalidade real, navegável. 'planned' = item de roadmap, desabilitado ("Em breve"). */
  status: 'active' | 'planned';
  badge?: {
    text: string;
    variant?: 'success' | 'warning' | 'info' | 'neutral';
  };
  /** Rotas que devem manter este item destacado no sidebar mesmo sem match exato (ex.: telas de detalhe). */
  matchPrefixes?: string[];
  /** Subrotas específicas que NÃO devem ativar este item (para evitar conflito com itens irmãos). */
  excludePrefixes?: string[];
  /** Identificador de ação customizada (ex.: abrir modal global) */
  actionId?: string;
  /**
   * Roles (public.roles.id) autorizadas a ver este item. `undefined` = público
   * para qualquer usuário autenticado (comportamento anterior, preservado).
   * Um item com `children` só some do menu se NENHUM filho sobrar após o
   * filtro — ver `filterNavigationByRole`.
   */
  allowedRoles?: AppRole[];
}

/**
 * Configuração definitiva de navegação do CGLIC:
 * - Visão Geral (/instrumentos) — painel unificado de gestão e
 *   monitoramento (consolida a antiga Visão Geral e a antiga Central de Atenção)
 * - Atas de Registro de Preços (recolhível)
 *     - Carteira de Atas (/atas)
 *     - Alocações por Unidade (/atas/saldos-unidade)
 *     - Modelos de Gestão de Atas (/atas/modelos)
 * - Contratos (recolhível)
 *     - Carteira de Contratos (/contratos)
 *     - Modelos de Gestão de Contratos (/contratos/modelos)
 * - Execução Financeira (recolhível)
 *     - Pagamentos (/pagamentos)
 *     - Empenhos & Execução (/empenhos)
 * - Administração (recolhível)
 *     - Usuários e Servidores (/admin/usuarios)
 *     - Perfis e Permissões (/admin/perfis)
 */
export const navigationConfig: NavItem[] = [
  {
    id: 'gestao-instrumentos',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    route: '/instrumentos',
    status: 'active',
    matchPrefixes: ['/instrumentos', '/prazos'],
    allowedRoles: ['admin', 'gestor', 'leitor']
  },
  {
    id: 'atas',
    label: 'Atas de Registro de Preços',
    icon: Package,
    status: 'active',
    children: [
      {
        id: 'atas-consulta',
        label: 'Carteira de Atas',
        icon: Search,
        route: '/atas',
        status: 'active',
        matchPrefixes: ['/atas', '/atas/detalhe'],
        excludePrefixes: ['/atas/saldos-unidade', '/atas/modelos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'atas-alocacoes',
        label: 'Alocações por Unidade',
        icon: Coins,
        route: '/atas/saldos-unidade',
        status: 'active',
        matchPrefixes: ['/atas/saldos-unidade', '/admin/departamentos'],
        allowedRoles: ['admin', 'gestor_saldos', 'leitor']
      },
      {
        id: 'atas-modelos',
        label: 'Modelos de Gestão de Atas',
        icon: Sliders,
        route: '/atas/modelos',
        status: 'active',
        matchPrefixes: ['/atas/modelos'],
        allowedRoles: ['admin', 'gestor']
      }
    ]
  },
  {
    id: 'contratos',
    label: 'Contratos',
    icon: FileText,
    status: 'active',
    children: [
      {
        id: 'contratos-acompanhamento',
        label: 'Carteira de Contratos',
        icon: Clock,
        route: '/contratos',
        status: 'active',
        matchPrefixes: ['/contratos'],
        excludePrefixes: ['/contratos/modelos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'contratos-modelos',
        label: 'Modelos de Gestão de Contratos',
        icon: Sliders,
        route: '/contratos/modelos',
        status: 'active',
        matchPrefixes: ['/contratos/modelos'],
        allowedRoles: ['admin', 'gestor']
      }
    ]
  },
  {
    id: 'execucao-financeira',
    label: 'Execução Financeira',
    icon: Landmark,
    status: 'active',
    children: [
      {
        id: 'execucao-pagamentos',
        label: 'Pagamentos',
        icon: Receipt,
        status: 'active',
        route: '/pagamentos',
        matchPrefixes: ['/pagamentos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'execucao-empenhos',
        label: 'Empenhos e Execução',
        icon: FileSpreadsheet,
        route: '/empenhos',
        status: 'active',
        matchPrefixes: ['/empenhos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      }
    ]
  },
  {
    id: 'administracao',
    label: 'Administração',
    icon: Settings,
    status: 'active',
    children: [
      {
        id: 'admin-usuarios',
        label: 'Usuários e Servidores',
        icon: Users,
        route: '/admin/usuarios',
        status: 'active',
        matchPrefixes: ['/admin/usuarios'],
        allowedRoles: ['admin']
      },
      {
        id: 'admin-perfis',
        label: 'Perfis e Permissões',
        icon: KeyRound,
        route: '/admin/perfis',
        status: 'active',
        matchPrefixes: ['/admin/perfis'],
        allowedRoles: ['admin']
      }
    ]
  }
];

/**
 * Filtra a árvore de navegação pela role real do usuário (fonte: AuthContext,
 * resolvida do backend). Regras (Fase Frontend RBAC):
 *   - item sem `allowedRoles` -> público para qualquer usuário autenticado;
 *   - item com `allowedRoles` -> só aparece se `role` estiver na lista;
 *   - `role === null` (não resolvida ou ausente) -> só itens públicos aparecem
 *     (mesmo princípio fail-closed do backend: ausência de role = ausência
 *     de autoridade);
 *   - grupo com `children` desaparece inteiramente se, após o filtro, nenhum
 *     filho sobrar — nunca é exibido um grupo vazio.
 */
export function filterNavigationByRole(items: NavItem[], role: AppRole | null): NavItem[] {
  const isAllowed = (allowedRoles?: AppRole[]): boolean => {
    if (!allowedRoles) return true;
    return role !== null && allowedRoles.includes(role);
  };

  return items.reduce<NavItem[]>((acc, item) => {
    if (item.children && item.children.length > 0) {
      const filteredChildren = filterNavigationByRole(item.children, role);
      if (filteredChildren.length > 0) {
        acc.push({ ...item, children: filteredChildren });
      }
      return acc;
    }

    if (isAllowed(item.allowedRoles)) {
      acc.push(item);
    }
    return acc;
  }, []);
}

export interface BreadcrumbEntry {
  label: string;
  route?: string;
}

const staticRouteLabels: Record<string, string> = {
  '/instrumentos': 'Visão Geral',
  '/atas': 'Carteira de Atas',
  '/atas/saldos-unidade': 'Alocações por Unidade',
  '/atas/modelos': 'Modelos de Gestão de Atas',
  '/contratos': 'Carteira de Contratos',
  '/contratos/modelos': 'Modelos de Gestão de Contratos',
  '/pagamentos': 'Pagamentos',
  '/empenhos': 'Empenhos e Execução',
  '/admin/departamentos': 'Unidades Internas',
  '/admin/usuarios': 'Usuários e Servidores',
  '/admin/perfis': 'Perfis e Permissões'
};

export function getBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  if (pathname === '/' || pathname === '/instrumentos') {
    return [{ label: 'Visão Geral' }];
  }

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbEntry[] = [{ label: 'Visão Geral', route: '/instrumentos' }];
  let accPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    accPath += `/${segment}`;
    const label = staticRouteLabels[accPath];
    if (label) {
      crumbs.push({ label, route: accPath });
    } else if (segments[i - 1] === 'contratos') {
      crumbs.push({ label: `Contrato ${decodeURIComponent(segment)}`, route: accPath });
    } else if (segments[i - 1] === 'detalhe' && segments[i - 2] === 'atas') {
      // Chave "00059/2025-200331": o rótulo mostra só o número da Ata.
      crumbs.push({ label: `Ata ${decodeURIComponent(segment).replace(/-\d{6}$/, '')}`, route: accPath });
    } else if (segments[i - 1] === 'itens' && segments[i - 3] === 'detalhe' && segments[i - 4] === 'atas') {
      crumbs.push({ label: `Item ${decodeURIComponent(segment)}`, route: accPath });
    }
  }

  return crumbs;
}

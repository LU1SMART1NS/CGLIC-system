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
}

/**
 * Configuração definitiva de navegação do SaldoARP:
 * - Gestão de Instrumentos (/instrumentos) — painel unificado de gestão e
 *   monitoramento (consolida a antiga Visão Geral e a antiga Central de Atenção)
 * - Atas de Registro de Preços (recolhível)
 *     - Consulta e Vigência (/atas)
 *     - Alocações por Unidade (/atas/saldos-unidade)
 * - Contratos (recolhível)
 *     - Acompanhamento e Prazos (/contratos)
 *     - Modelos de Gestão (open-contract-templates)
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
    label: 'Gestão de Instrumentos',
    icon: LayoutDashboard,
    route: '/instrumentos',
    status: 'active',
    matchPrefixes: ['/instrumentos', '/prazos']
  },
  {
    id: 'atas',
    label: 'Atas de Registro de Preços',
    icon: Package,
    status: 'active',
    children: [
      {
        id: 'atas-consulta',
        label: 'Consulta e Vigência',
        icon: Search,
        route: '/atas',
        status: 'active',
        matchPrefixes: ['/atas', '/atas/itens', '/atas/itens/saldo'],
        excludePrefixes: ['/atas/saldos-unidade']
      },
      {
        id: 'atas-alocacoes',
        label: 'Alocações por Unidade',
        icon: Coins,
        route: '/atas/saldos-unidade',
        status: 'active',
        matchPrefixes: ['/atas/saldos-unidade']
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
        label: 'Acompanhamento e Prazos',
        icon: Clock,
        route: '/contratos',
        status: 'active',
        matchPrefixes: ['/contratos'],
        excludePrefixes: ['/contratos/modelos']
      },
      {
        id: 'contratos-modelos',
        label: 'Modelos de Gestão',
        icon: Sliders,
        route: '/contratos/modelos',
        status: 'active',
        matchPrefixes: ['/contratos/modelos']
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
        route: '/pagamentos',
        status: 'active',
        matchPrefixes: ['/pagamentos']
      },
      {
        id: 'execucao-empenhos',
        label: 'Empenhos e Execução',
        icon: FileSpreadsheet,
        route: '/empenhos',
        status: 'active',
        matchPrefixes: ['/empenhos']
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
        matchPrefixes: ['/admin/usuarios']
      },
      {
        id: 'admin-perfis',
        label: 'Perfis e Permissões',
        icon: KeyRound,
        route: '/admin/perfis',
        status: 'active',
        matchPrefixes: ['/admin/perfis']
      }
    ]
  }
];

export interface BreadcrumbEntry {
  label: string;
  route?: string;
}

const staticRouteLabels: Record<string, string> = {
  '/instrumentos': 'Gestão de Instrumentos',
  '/atas': 'Consulta e Vigência',
  '/atas/itens': 'Itens da Ata',
  '/atas/itens/saldo': 'Saldo do Item',
  '/atas/saldos-unidade': 'Alocações por Unidade',
  '/contratos': 'Acompanhamento e Prazos',
  '/contratos/modelos': 'Modelos de Gestão',
  '/pagamentos': 'Pagamentos',
  '/empenhos': 'Empenhos e Execução',
  '/admin/departamentos': 'Unidades Internas',
  '/admin/usuarios': 'Usuários e Servidores',
  '/admin/perfis': 'Perfis e Permissões'
};

export function getBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  if (pathname === '/' || pathname === '/instrumentos') {
    return [{ label: 'Gestão de Instrumentos' }];
  }

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbEntry[] = [{ label: 'Gestão de Instrumentos', route: '/instrumentos' }];
  let accPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    accPath += `/${segment}`;
    const label = staticRouteLabels[accPath];
    if (label) {
      crumbs.push({ label, route: accPath });
    } else if (segments[i - 1] === 'contratos') {
      crumbs.push({ label: `Contrato ${decodeURIComponent(segment)}`, route: accPath });
    }
  }

  return crumbs;
}

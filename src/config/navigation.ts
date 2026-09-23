import {
  Home,
  Package,
  FileText,
  Settings,
  Clock,
  Coins,
  ShieldCheck,
  Sliders,
  Users,
  KeyRound,
  FileCheck,
  Search,
  Building2,
  FileSpreadsheet,
  Activity
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
  /** Identificador de ação customizada (ex.: abrir modal global) */
  actionId?: string;
}

/**
 * Configuração central de navegação do SaldoARP (Fase 3.5 — 6 Pilares):
 * - 🏠 Início
 * - ⏰ Central de Prazos
 * - 📦 Atas de Registro de Preços
 *     - Consulta e Vigência
 *     - Alocações por Unidade
 * - 📑 Contratos
 *     - Acompanhamento e Prazos
 *     - Modelos de Gestão Contratual (Templates)
 *     - Prorrogações & Reajustes (Em breve)
 * - ⚙️ Execução & Processos
 *     - Processos Administrativos (SEI)
 *     - Exportação Gerencial Excel
 *     - Empenhos e Conciliação (Em breve)
 * - 👥 Administração
 *     - Departamentos e Unidades
 *     - Usuários e Servidores
 *     - Perfis e Permissões
 *     - Auditoria (Em breve)
 */
export const navigationConfig: NavItem[] = [
  {
    id: 'inicio',
    label: 'Início',
    icon: Home,
    route: '/',
    status: 'active'
  },
  {
    id: 'prazos',
    label: 'Central de Prazos',
    icon: Clock,
    route: '/prazos',
    status: 'active'
  },
  {
    id: 'atas',
    label: 'Atas de Registro de Preços',
    icon: Package,
    status: 'active',
    children: [
      {
        id: 'atas-dashboard',
        label: 'Consulta e Vigência',
        icon: Search,
        route: '/atas',
        status: 'active',
        matchPrefixes: ['/atas/itens']
      },
      {
        id: 'atas-saldos',
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
        id: 'contratos-dashboard',
        label: 'Acompanhamento e Prazos',
        icon: Clock,
        route: '/contratos',
        status: 'active',
        matchPrefixes: ['/contratos']
      },
      {
        id: 'contratos-templates',
        label: 'Modelos de Gestão',
        icon: Sliders,
        status: 'active',
        actionId: 'open-contract-templates'
      },
      {
        id: 'contratos-aditivos',
        label: 'Prorrogações & Reajustes',
        icon: FileCheck,
        status: 'planned'
      }
    ]
  },
  {
    id: 'execucao-processos',
    label: 'Execução & Processos',
    icon: Activity,
    status: 'active',
    children: [
      {
        id: 'processos-sei',
        label: 'Processos Administrativos (SEI)',
        icon: FileText,
        status: 'active',
        actionId: 'open-sei-modal'
      },
      {
        id: 'execucao-exportar',
        label: 'Exportação Gerencial Excel',
        icon: FileSpreadsheet,
        status: 'active',
        actionId: 'open-export-modal'
      },
      {
        id: 'execucao-empenhos',
        label: 'Empenhos e Conciliação',
        icon: Coins,
        status: 'planned'
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
        id: 'admin-departamentos',
        label: 'Departamentos e Unidades',
        icon: Building2,
        status: 'active',
        actionId: 'open-departments-modal'
      },
      {
        id: 'admin-usuarios',
        label: 'Usuários e Servidores',
        icon: Users,
        route: '/admin/usuarios',
        status: 'active'
      },
      {
        id: 'admin-perfis',
        label: 'Perfis e Permissões',
        icon: KeyRound,
        route: '/admin/perfis',
        status: 'active'
      },
      {
        id: 'admin-auditoria',
        label: 'Auditoria',
        icon: ShieldCheck,
        status: 'planned'
      }
    ]
  }
];

export interface BreadcrumbEntry {
  label: string;
  route?: string;
}

const staticRouteLabels: Record<string, string> = {
  '/': 'Início',
  '/prazos': 'Central de Prazos',
  '/atas': 'Atas de Registro de Preços',
  '/atas/itens': 'Itens da Ata',
  '/atas/itens/saldo': 'Saldo do Item',
  '/atas/saldos-unidade': 'Alocações por Unidade',
  '/contratos': 'Acompanhamento e Prazos de Contratos',
  '/admin/usuarios': 'Usuários e Servidores',
  '/admin/perfis': 'Perfis e Permissões'
};

export function getBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  if (pathname === '/') {
    return [{ label: 'Início' }];
  }

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbEntry[] = [{ label: 'Início', route: '/' }];
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


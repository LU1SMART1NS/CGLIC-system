import {
  LayoutDashboard,
  Package,
  FileText,
  Settings,
  Sliders,
  Users,
  KeyRound,
  FileSpreadsheet,
  Receipt,
  Landmark,
  BellRing,
  CalendarOff,
  UsersRound,
  Briefcase,
  ListChecks,
  Building2,
  Link2,
  FileSignature,
  Boxes
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
  /** Rótulo do grupo em que a aba aparece na barra de abas da área (ex.: Configurações → Gestão · Acesso). */
  group?: string;
  /** 'bottom' = área fica no pé do menu chave (ex.: Configurações). */
  placement?: 'bottom';
}

/**
 * Navegação do CGLIC em dois níveis: o menu chave (trilha de ícones no desktop,
 * barra inferior no celular) lista as áreas, e as páginas de cada área aparecem
 * como abas no topo da página (`AreaTabs`). As rotas são as mesmas de antes.
 * - Visão Geral: Painel (/instrumentos) · Distribuição (/atas/distribuicao)
 * - Carteira: Atas (/atas) · Contratos (/contratos) · Itens (/itens). Unidade interna e órgão partícipe
 *   são filtros dessas abas, não páginas.
 * - Alocação: Itens às unidades (quanto de cada item vai para cada unidade interna)
 * - Vinculação: Contratos à ata · Empenhos ao contrato · Empenhos aos itens (na ordem do caminho: ata → contrato → empenho → item)
 * - Financeiro: Empenhos (/empenhos) · Pagamentos (/pagamentos; a previsão do mês fica em /pagamentos/previsao)
 * - Configurações (no pé do menu), em dois grupos: Gestão (Modelos de Gestão · Regras de Alertas ·
 *   Feriados · Unidades Internas) e Acesso (Usuários e Servidores · Perfis e Permissões)
 */
export const navigationConfig: NavItem[] = [
  {
    id: 'visao-geral',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    status: 'active',
    children: [
      {
        id: 'gestao-instrumentos',
        label: 'Painel',
        icon: LayoutDashboard,
        route: '/instrumentos',
        status: 'active',
        matchPrefixes: ['/instrumentos', '/prazos'],
        allowedRoles: ['admin', 'gestor', 'gestor_saldos', 'leitor']
      },
      {
        // Atas e contratos por gestor: visão de coordenação (contratos vinculados herdam o gestor da ata).
        id: 'central-distribuicao',
        label: 'Distribuição',
        icon: UsersRound,
        route: '/atas/distribuicao',
        status: 'active',
        matchPrefixes: ['/atas/distribuicao'],
        allowedRoles: ['admin', 'leitor']
      }
    ]
  },
  {
    id: 'carteira',
    label: 'Carteira',
    icon: Briefcase,
    status: 'active',
    children: [
      {
        id: 'atas-consulta',
        label: 'Atas',
        icon: Package,
        route: '/atas',
        status: 'active',
        matchPrefixes: ['/atas', '/atas/detalhe'],
        excludePrefixes: ['/atas/distribuicao'],
        allowedRoles: ['admin', 'gestor', 'gestor_saldos', 'leitor']
      },
      {
        id: 'contratos-acompanhamento',
        label: 'Contratos',
        icon: FileText,
        route: '/contratos',
        status: 'active',
        matchPrefixes: ['/contratos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'itens-carteira',
        label: 'Itens',
        icon: ListChecks,
        route: '/itens',
        status: 'active',
        matchPrefixes: ['/itens'],
        allowedRoles: ['admin', 'gestor', 'gestor_saldos', 'leitor']
      }
    ]
  },
  {
    // Quanto de cada item da ata vai para cada unidade interna (trabalho do gestor de saldos).
    id: 'alocacao',
    label: 'Alocação',
    icon: Boxes,
    status: 'active',
    children: [
      {
        id: 'alocacao-itens',
        label: 'Itens às unidades',
        icon: Boxes,
        route: '/alocacao',
        status: 'active',
        matchPrefixes: ['/alocacao'],
        allowedRoles: ['admin', 'gestor', 'gestor_saldos', 'leitor']
      }
    ]
  },
  {
    // Filas de vínculo: ligar uma coisa à outra. "Distribuição" (Visão Geral) fica só com atas e contratos para gestores.
    id: 'vinculacao',
    label: 'Vinculação',
    icon: Link2,
    status: 'active',
    children: [
      {
        id: 'vinculacao-contratos',
        label: 'Contratos à ata',
        icon: FileText,
        route: '/vinculacao/contratos',
        status: 'active',
        matchPrefixes: ['/vinculacao/contratos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'vinculacao-empenhos-contrato',
        label: 'Empenhos ao contrato',
        icon: FileSignature,
        route: '/vinculacao/empenhos-contrato',
        status: 'active',
        matchPrefixes: ['/vinculacao/empenhos-contrato'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'vinculacao-empenhos-itens',
        label: 'Empenhos aos itens',
        icon: FileSpreadsheet,
        route: '/vinculacao/empenhos-itens',
        status: 'active',
        matchPrefixes: ['/vinculacao/empenhos-itens'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      }
    ]
  },
  {
    id: 'execucao-financeira',
    label: 'Financeiro',
    icon: Landmark,
    status: 'active',
    children: [
      {
        id: 'execucao-empenhos',
        label: 'Empenhos',
        icon: FileSpreadsheet,
        route: '/empenhos',
        status: 'active',
        matchPrefixes: ['/empenhos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      },
      {
        id: 'execucao-pagamentos',
        label: 'Pagamentos',
        icon: Receipt,
        status: 'active',
        route: '/pagamentos',
        matchPrefixes: ['/pagamentos'],
        allowedRoles: ['admin', 'gestor', 'leitor']
      }
    ]
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    icon: Settings,
    status: 'active',
    placement: 'bottom',
    children: [
      {
        id: 'config-modelos',
        label: 'Modelos de Gestão',
        icon: Sliders,
        route: '/configuracoes/modelos',
        status: 'active',
        group: 'Gestão',
        matchPrefixes: ['/configuracoes/modelos'],
        allowedRoles: ['admin', 'gestor']
      },
      {
        id: 'admin-regras-alertas',
        label: 'Regras de Alertas',
        icon: BellRing,
        route: '/admin/regras-alertas',
        status: 'active',
        group: 'Gestão',
        matchPrefixes: ['/admin/regras-alertas'],
        allowedRoles: ['admin']
      },
      {
        id: 'admin-feriados',
        label: 'Feriados',
        icon: CalendarOff,
        route: '/admin/feriados',
        status: 'active',
        group: 'Gestão',
        matchPrefixes: ['/admin/feriados'],
        allowedRoles: ['admin']
      },
      {
        // Cadastro das unidades internas usadas na alocação de itens. Edição: admin e gestor_saldos.
        id: 'admin-unidades-internas',
        label: 'Unidades Internas',
        icon: Building2,
        route: '/admin/departamentos',
        status: 'active',
        group: 'Gestão',
        matchPrefixes: ['/admin/departamentos'],
        allowedRoles: ['admin', 'gestor', 'gestor_saldos', 'leitor']
      },
      {
        id: 'admin-usuarios',
        label: 'Usuários e Servidores',
        icon: Users,
        route: '/admin/usuarios',
        status: 'active',
        group: 'Acesso',
        matchPrefixes: ['/admin/usuarios'],
        allowedRoles: ['admin']
      },
      {
        id: 'admin-perfis',
        label: 'Perfis e Permissões',
        icon: KeyRound,
        route: '/admin/perfis',
        status: 'active',
        group: 'Acesso',
        matchPrefixes: ['/admin/perfis'],
        allowedRoles: ['admin']
      }
    ]
  }
];

/**
 * Área cujas abas aparecem no topo da página: só nas páginas de lista (rota igual
 * à de uma aba). Telas de detalhe (Ata 360, Contrato 360, Item) têm as próprias abas
 * e não recebem as da área. Recebe a árvore já filtrada pelo perfil.
 */
export function findAreaForTabs(items: NavItem[], pathname: string): NavItem | null {
  return items.find((area) => area.children?.some((child) => child.route === pathname)) ?? null;
}

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
  '/itens': 'Carteira de Itens',
  '/atas/distribuicao': 'Central de Distribuição',
  '/contratos': 'Carteira de Contratos',
  '/configuracoes/modelos': 'Modelos de Gestão',
  '/pagamentos': 'Pagamentos',
  '/empenhos': 'Empenhos',
  '/vinculacao/contratos': 'Contratos à ata',
  '/vinculacao/empenhos-itens': 'Empenhos aos itens',
  '/vinculacao/empenhos-contrato': 'Empenhos ao contrato',
  '/alocacao': 'Alocação',
  '/admin/departamentos': 'Unidades Internas',
  '/admin/usuarios': 'Usuários e Servidores',
  '/admin/perfis': 'Perfis e Permissões'
};

export function getBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  if (pathname === '/' || pathname === '/instrumentos') {
    return [{ label: 'Visão Geral' }];
  }

  // Item de topo do menu: não herda o "Carteira de Atas" do prefixo /atas da rota.
  if (pathname === '/atas/distribuicao') {
    return [
      { label: 'Visão Geral', route: '/instrumentos' },
      { label: 'Central de Distribuição', route: '/atas/distribuicao' }
    ];
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

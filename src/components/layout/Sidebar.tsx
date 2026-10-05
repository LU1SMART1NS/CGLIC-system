import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { navigationConfig, filterNavigationByRole, type NavItem } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  /** 'rail' = trilha de ícones à esquerda (desktop); 'bottom' = barra inferior (celular). */
  mode?: 'rail' | 'bottom';
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.excludePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  if (item.route && item.route === pathname) return true;
  if (item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
}

export function isExactChildActive(item: NavItem, pathname: string): boolean {
  if (item.excludePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  if (item.route && item.route === pathname) return true;
  if (item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return false;
}

/**
 * Última página aberta em cada área (endereço com filtros da URL). Clicar na área no
 * menu volta para ela; vale enquanto a aba do navegador estiver aberta.
 */
const lastVisitByArea = new Map<string, string>();

/** Destino ao clicar na área: a última aba usada, se o perfil ainda a vê; senão a primeira. */
export function areaTarget(area: NavItem): string | undefined {
  const last = lastVisitByArea.get(area.id);
  if (last && area.children?.some((child) => child.route === last.split('?')[0])) return last;
  return area.children?.[0]?.route ?? area.route;
}

export function rememberAreaVisit(areas: NavItem[], pathname: string, search: string): void {
  for (const area of areas) {
    const child = area.children?.find((c) => c.route === pathname);
    if (child) {
      lastVisitByArea.set(area.id, `${pathname}${search}`);
      return;
    }
  }
}

const AreaItem: React.FC<{ area: NavItem; pathname: string }> = ({ area, pathname }) => {
  const active = isItemActive(area, pathname);
  const Icon = area.icon;
  const target = areaTarget(area) ?? '/';

  return (
    <div className="app-rail-item">
      <Link
        to={target}
        className="app-rail-link"
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'page' : undefined}
      >
        {Icon && (
          <span className="app-rail-icon">
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
          </span>
        )}
        <span className="app-rail-label">{area.label}</span>
      </Link>

    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ mode = 'rail' }) => {
  const { role } = useAuth();
  const { pathname, search } = useLocation();
  // roleStatus 'loading' é tratado como role=null (só itens públicos aparecem
  // até a role real resolver) — mesmo princípio fail-closed do backend.
  const areas = useMemo(() => filterNavigationByRole(navigationConfig, role), [role]);

  // Registra antes de montar os links, para o da área atual já apontar para a página aberta (idempotente).
  rememberAreaVisit(areas, pathname, search);

  const top = areas.filter((area) => area.placement !== 'bottom');
  const bottom = areas.filter((area) => area.placement === 'bottom');

  return (
    <nav aria-label="Navegação Principal" className={mode === 'rail' ? 'app-rail' : 'app-bottom-nav'}>
      {mode === 'rail' && (
        <Link to="/" className="app-rail-brand" aria-label="ComprasSUSP, página inicial">
          <span>Compras</span>SUSP
        </Link>
      )}
      {top.map((area) => <AreaItem key={area.id} area={area} pathname={pathname} />)}
      {mode === 'rail' && <div className="app-rail-spacer" />}
      {bottom.map((area) => <AreaItem key={area.id} area={area} pathname={pathname} />)}
    </nav>
  );
};

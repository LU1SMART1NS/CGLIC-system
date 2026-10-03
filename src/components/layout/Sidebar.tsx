import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Lock, X } from 'lucide-react';
import { navigationConfig, filterNavigationByRole, type NavItem } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  mode?: 'desktop' | 'drawer';
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Chamado ao clicar num grupo com filhos enquanto a barra está recolhida. */
  onRequestExpand?: () => void;
  onOpenExportModal?: () => void;
  onOpenDepartmentsModal?: () => void;
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

const SidebarLink: React.FC<{
  item: NavItem;
  depth: number;
  collapsed: boolean;
  onAction?: (actionId: string) => void;
  onRequestExpand?: () => void;
}> = ({ item, depth, collapsed, onAction, onRequestExpand }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = isItemActive(item, location.pathname);
  const exactActive = isExactChildActive(item, location.pathname);
  const [expanded, setExpanded] = useState<boolean>(active || false);
  const hasChildren = !!item.children?.length;
  const Icon = item.icon;
  const planned = item.status === 'planned';

  const handleClick = () => {
    if (planned) return;
    if (item.actionId && onAction) {
      onAction(item.actionId);
      return;
    }
    if (hasChildren) {
      // Recolhida, os filhos ficam ocultos: expande a barra para torná-los acessíveis.
      if (collapsed && onRequestExpand) {
        setExpanded(true);
        onRequestExpand();
        return;
      }
      setExpanded((prev) => !prev);
      return;
    }
    if (item.route) {
      navigate(item.route);
    }
  };

  const badgeVariantColors = {
    success: { bg: '#dcfce7', text: '#15803d' },
    warning: { bg: '#fef3c7', text: '#b45309' },
    info: { bg: '#e0f2fe', text: '#0369a1' },
    neutral: { bg: '#f1f5f9', text: '#475569' }
  };

  const badgeStyle = item.badge
    ? badgeVariantColors[item.badge.variant || 'neutral']
    : null;

  const isSelectedLeaf = !hasChildren && exactActive;
  const isSelectedParent = hasChildren && active;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={planned && !hasChildren}
        aria-current={isSelectedLeaf ? 'page' : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
        title={collapsed ? item.label : planned ? `${item.label} — em breve` : item.label}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          minHeight: '44px',
          padding: depth === 0 ? '0.62rem 0.85rem' : '0.48rem 0.85rem 0.48rem 2.1rem',
          background: isSelectedLeaf
            ? 'rgba(12, 50, 111, 0.08)'
            : isSelectedParent && depth === 0
            ? 'rgba(12, 50, 111, 0.03)'
            : 'transparent',
          color: planned
            ? '#94a3b8'
            : isSelectedLeaf
            ? '#0c326f'
            : isSelectedParent && depth === 0
            ? '#0c326f'
            : '#334155',
          borderLeft: depth === 0 && (isSelectedLeaf || isSelectedParent)
            ? '3px solid #0c326f'
            : depth > 0 && isSelectedLeaf
            ? '3px solid #0c326f'
            : '3px solid transparent',
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          borderRadius: depth === 0 ? '0 6px 6px 0' : '0 4px 4px 0',
          fontSize: depth === 0 ? '0.86rem' : '0.82rem',
          fontWeight: isSelectedLeaf ? 800 : depth === 0 ? 700 : 500,
          textAlign: 'left',
          cursor: planned ? 'default' : 'pointer',
          opacity: planned ? 0.65 : 1,
          transition: 'all 0.15s ease-in-out'
        }}
      >
        {Icon && (
          <Icon
            size={depth === 0 ? 18 : 15}
            strokeWidth={isSelectedLeaf ? 2.2 : 1.8}
            style={{
              flexShrink: 0,
              color: planned ? '#94a3b8' : isSelectedLeaf ? '#0c326f' : isSelectedParent ? '#0c326f' : '#64748b'
            }}
          />
        )}
        {!collapsed && (
          <>
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.label}
            </span>
            {item.badge && badgeStyle && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: '999px',
                background: badgeStyle.bg,
                color: badgeStyle.text,
                lineHeight: 1
              }}>
                {item.badge.text}
              </span>
            )}
            {planned && <Lock size={12} style={{ flexShrink: 0, opacity: 0.6 }} />}
            {hasChildren && !planned && (
              expanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: '#64748b' }} /> : <ChevronRight size={14} style={{ flexShrink: 0, color: '#64748b' }} />
            )}
          </>
        )}
      </button>

      {hasChildren && expanded && !collapsed && (
        <div style={{ marginTop: '0.1rem', marginBottom: '0.2rem' }}>
          {item.children!.map((child) => (
            <SidebarLink
              key={child.id}
              item={child}
              depth={depth + 1}
              collapsed={collapsed}
              onAction={onAction}
              onRequestExpand={onRequestExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  mode = 'desktop',
  drawerOpen = false,
  onCloseDrawer,
  collapsed,
  onToggleCollapsed,
  onRequestExpand,
  onOpenExportModal,
  onOpenDepartmentsModal
}) => {
  const { role } = useAuth();
  // roleStatus 'loading' é tratado como role=null (só itens públicos aparecem
  // até a role real resolver) — mesmo princípio fail-closed do backend.
  const visibleNavigation = useMemo(() => filterNavigationByRole(navigationConfig, role), [role]);

  const isDrawer = mode === 'drawer';
  const asideRef = useRef<HTMLElement>(null);

  // Drawer: foco entra ao abrir e fica preso (Tab/Shift+Tab) enquanto aberto.
  useEffect(() => {
    if (!isDrawer || !drawerOpen) return;
    const el = asideRef.current;
    if (!el) return;
    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    focusables()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [isDrawer, drawerOpen]);

  const handleAction = (actionId: string) => {
    if (isDrawer) onCloseDrawer?.();
    if (actionId === 'open-export-modal' && onOpenExportModal) {
      onOpenExportModal();
    } else if (actionId === 'open-departments-modal' && onOpenDepartmentsModal) {
      onOpenDepartmentsModal();
    }
  };

  return (
    <aside
      ref={asideRef}
      className={isDrawer ? 'app-drawer' : undefined}
      aria-label={isDrawer ? 'Menu de navegação' : undefined}
      aria-hidden={isDrawer && !drawerOpen ? true : undefined}
      // inert evita foco em links do drawer fechado (React 19 aceita o atributo booleano)
      inert={isDrawer && !drawerOpen ? true : undefined}
      style={
        isDrawer
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 'min(300px, 85vw)',
              height: '100dvh',
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              zIndex: 60,
              transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: drawerOpen ? '0 10px 40px rgba(15, 23, 42, 0.25)' : 'none'
            }
          : {
              width: collapsed ? '64px' : '280px',
              flexShrink: 0,
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'sticky',
              top: 0,
              height: '100dvh',
              overflowY: 'auto',
              zIndex: 40
            }
      }
    >
      <div style={{
        padding: collapsed ? '1.1rem 0.5rem' : '1.1rem 1rem',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        minHeight: '64px'
      }}>
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#0c326f'
            }}>
              Navegação
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={isDrawer ? onCloseDrawer : onToggleCollapsed}
          title={isDrawer ? 'Fechar menu' : collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label={isDrawer ? 'Fechar menu' : collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isDrawer ? '44px' : '28px',
            height: isDrawer ? '44px' : '28px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            color: '#64748b',
            cursor: 'pointer',
            transition: 'background 0.15s ease'
          }}
        >
          {isDrawer ? <X size={18} /> : collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>

      <nav
        aria-label="Navegação Principal"
        style={{
          flex: 1,
          padding: '0.75rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem'
        }}
      >
        {visibleNavigation.map((item) => {
          // Linha divisória sutil separando "Visão Geral" dos módulos de gestão
          const showTopDivider = item.id === 'atas';

          return (
            <React.Fragment key={item.id}>
              {showTopDivider && (
                <div style={{
                  height: '1px',
                  background: '#f1f5f9',
                  margin: '0.4rem 0.5rem 0.4rem'
                }} />
              )}
              <SidebarLink
                item={item}
                depth={0}
                collapsed={collapsed}
                onAction={handleAction}
                onRequestExpand={onRequestExpand}
              />
            </React.Fragment>
          );
        })}
      </nav>
    </aside>
  );
};

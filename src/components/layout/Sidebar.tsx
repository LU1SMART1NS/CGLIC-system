import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Lock } from 'lucide-react';
import { navigationConfig, type NavItem } from '../../config/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenContractTemplatesModal?: () => void;
  onOpenExportModal?: () => void;
  onOpenSeiModal?: () => void;
  onOpenDepartmentsModal?: () => void;
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.route && item.route === pathname) return true;
  if (item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix))) return true;
  return item.children?.some((child) => isItemActive(child, pathname)) ?? false;
}

function isExactChildActive(item: NavItem, pathname: string): boolean {
  if (item.route && item.route === pathname) return true;
  if (item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

const SidebarLink: React.FC<{
  item: NavItem;
  depth: number;
  collapsed: boolean;
  onAction?: (actionId: string) => void;
}> = ({ item, depth, collapsed, onAction }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = isItemActive(item, location.pathname);
  const exactActive = isExactChildActive(item, location.pathname);
  const [expanded, setExpanded] = useState(active);
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

  // Destaque visual:
  // Se for nível 0 com filhos: destaque suave de categoria ativa
  // Se for folha (nível 0 sem filhos ou nível 1+): destaque de item selecionado
  const isSelectedLeaf = !hasChildren && exactActive;
  const isSelectedParent = hasChildren && active;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={planned && !hasChildren}
        title={collapsed ? item.label : planned ? `${item.label} — em breve` : item.label}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: depth === 0 ? '0.65rem 0.85rem' : '0.48rem 0.85rem 0.48rem 2.1rem',
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
                fontSize: '0.68rem',
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapsed,
  onOpenContractTemplatesModal,
  onOpenExportModal,
  onOpenSeiModal,
  onOpenDepartmentsModal
}) => {
  const handleAction = (actionId: string) => {
    if (actionId === 'open-contract-templates' && onOpenContractTemplatesModal) {
      onOpenContractTemplatesModal();
    } else if (actionId === 'open-export-modal' && onOpenExportModal) {
      onOpenExportModal();
    } else if (actionId === 'open-sei-modal' && onOpenSeiModal) {
      onOpenSeiModal();
    } else if (actionId === 'open-departments-modal' && onOpenDepartmentsModal) {
      onOpenDepartmentsModal();
    }
  };

  return (
    <aside
      style={{
        width: collapsed ? '64px' : '280px',
        flexShrink: 0,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        zIndex: 40
      }}
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
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            color: '#64748b',
            cursor: 'pointer',
            transition: 'background 0.15s ease'
          }}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {navigationConfig.map((item) => (
          <SidebarLink
            key={item.id}
            item={item}
            depth={0}
            collapsed={collapsed}
            onAction={handleAction}
          />
        ))}
      </nav>

      <div style={{
        padding: '0.75rem',
        borderTop: '1px solid #f1f5f9',
        fontSize: '0.7rem',
        color: '#94a3b8',
        textAlign: collapsed ? 'center' : 'left'
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>ComprasSUSP • v2.0</span>
            <span>SENASP / MJSP • UASG 200331</span>
          </div>
        )}
      </div>
    </aside>
  );
};

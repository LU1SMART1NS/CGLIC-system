import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { typography, spacing } from '../tokens';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { InfoHint } from './InfoHint';

/** Espaço à direita das abas da área (AreaTabs): no desktop, as ações da página sobem para lá. */
export const AREA_TABS_ACTIONS_ID = 'area-tabs-actions';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  /** Explicação detalhada, mostrada sob demanda num ícone ⓘ ao lado do título. */
  hint?: string;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  hint,
  actions,
  className,
  style
}) => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // Procura o espaço das abas depois de montar (nos testes e no SSR não existe, e as ações ficam no lugar).
  useEffect(() => {
    const next = isDesktop ? document.getElementById(AREA_TABS_ACTIONS_ID) : null;
    setSlot((current) => (current === next ? current : next));
  });

  const actionsNode = actions ? (
    <div className="ds-page-header__actions" style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
      {actions}
    </div>
  ) : null;

  return (
    <header
      className={`ds-page-header ${className ?? ''}`.trim()}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.lg,
        marginBottom: '1.25rem',
        ...style
      }}
    >
      <div className="ds-page-header__title-block" style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        <div className="ds-page-header__title-row" style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {icon && <span style={{ color: '#0f172a', display: 'flex', fontSize: '1.5rem' }}>{icon}</span>}
          <h1 className="ds-page-header__title" style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 900,
            color: '#0f172a',
            letterSpacing: '-0.02em',
            fontFamily: typography.fontFamily.sans,
            lineHeight: typography.lineHeight.tight
          }}>
            {title}
          </h1>
          {hint && <InfoHint content={hint} testId="page-header-hint" />}
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && (
          <p className="ds-page-header__subtitle" title={subtitle} style={{
            margin: 0,
            color: '#64748b',
            fontSize: '0.84rem',
            fontFamily: typography.fontFamily.sans
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {actionsNode && !slot && actionsNode}
      {actionsNode && slot && createPortal(actionsNode, slot)}
    </header>
  );
};

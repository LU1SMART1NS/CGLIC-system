import React from 'react';
import { typography, spacing } from '../tokens';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
  className,
  style
}) => {
  return (
    <header
      className={className}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {icon && <span style={{ color: '#0f172a', display: 'flex', fontSize: '1.5rem' }}>{icon}</span>}
          <h1 style={{
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
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && (
          <p style={{
            margin: 0,
            color: '#64748b',
            fontSize: '0.84rem',
            fontFamily: typography.fontFamily.sans
          }}>
            {subtitle}
          </p>
        )}
      </div>
      
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {actions}
        </div>
      )}
    </header>
  );
};

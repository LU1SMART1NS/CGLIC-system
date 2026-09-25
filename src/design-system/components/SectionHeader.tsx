import React from 'react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  countBadge?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  countBadge,
  actions,
  testId,
  className = ''
}) => {
  return (
    <div
      data-testid={testId || 'section-header'}
      className={`section-header ${className}`.trim()}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.xl
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          {icon && (
            <div
              style={{
                color: colors.brand.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
          <h3
            style={{
              fontSize: typography.fontSize.h3,
              fontWeight: typography.fontWeight.extrabold,
              color: colors.text.primary,
              margin: 0,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs
            }}
          >
            <span>{title}</span>
            {countBadge && (
              <span
                style={{
                  fontSize: typography.fontSize.label,
                  fontWeight: typography.fontWeight.bold,
                  padding: `${spacing.xxs} ${spacing.sm}`,
                  borderRadius: shapes.radius.full,
                  background: colors.background.subtle,
                  color: colors.text.secondary,
                  border: `1px solid ${colors.border.default}`
                }}
              >
                {countBadge}
              </span>
            )}
          </h3>
        </div>
        {subtitle && (
          <p
            style={{
              fontSize: typography.fontSize.bodySm,
              color: colors.text.muted,
              margin: `${spacing.xxs} 0 0 0`
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
};

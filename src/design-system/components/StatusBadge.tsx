import React from 'react';
import { colors, shapes, typography, spacing } from '../tokens';

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple';

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  dot?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  testId?: string;
  className?: string;
}

const sizeConfig = {
  sm: {
    padding: `${spacing.xxs} ${spacing.xs}`,
    fontSize: typography.fontSize.caption,
    dotSize: '6px'
  },
  md: {
    padding: `${spacing.xs} ${spacing.sm}`,
    fontSize: typography.fontSize.label,
    dotSize: '7px'
  },
  lg: {
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.fontSize.bodySm,
    dotSize: '8px'
  }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  dot = true,
  size = 'md',
  icon,
  testId,
  className = ''
}) => {
  const token = colors.semantic[variant] || colors.semantic.neutral;
  const currentSize = sizeConfig[size] || sizeConfig.md;

  return (
    <span
      data-testid={testId || 'status-badge'}
      className={`status-badge ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        background: token.bg,
        border: `1px solid ${token.border}`,
        color: token.text,
        borderRadius: shapes.radius.full,
        padding: currentSize.padding,
        fontSize: currentSize.fontSize,
        fontWeight: typography.fontWeight.bold,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        lineHeight: 1
      }}
    >
      {dot && (
        <span
          style={{
            width: currentSize.dotSize,
            height: currentSize.dotSize,
            borderRadius: '50%',
            background: token.solid,
            display: 'inline-block'
          }}
          aria-hidden="true"
        />
      )}
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </span>
  );
};

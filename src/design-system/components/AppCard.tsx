import React from 'react';
import { colors, shapes, spacing } from '../tokens';

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'subtle' | 'warning' | 'danger' | 'success';
  highlightBorderTop?: string;
  padding?: keyof typeof spacing;
  className?: string;
  children: React.ReactNode;
}

export const AppCard: React.FC<AppCardProps> = ({
  variant = 'default',
  highlightBorderTop,
  padding = 'xl',
  className = '',
  style,
  children,
  ...rest
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'elevated':
        return {
          background: colors.background.surface,
          border: `1px solid ${colors.border.default}`,
          boxShadow: shapes.shadow.md
        };
      case 'subtle':
        return {
          background: colors.background.subtle,
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: 'none'
        };
      case 'warning':
        return {
          background: colors.semantic.warning.bg,
          border: `1px solid ${colors.semantic.warning.border}`,
          boxShadow: shapes.shadow.sm
        };
      case 'danger':
        return {
          background: colors.semantic.danger.bg,
          border: `1px solid ${colors.semantic.danger.border}`,
          boxShadow: shapes.shadow.sm
        };
      case 'success':
        return {
          background: colors.semantic.success.bg,
          border: `1px solid ${colors.semantic.success.border}`,
          boxShadow: shapes.shadow.sm
        };
      case 'default':
      default:
        return {
          background: colors.background.surface,
          border: `1px solid ${colors.border.default}`,
          boxShadow: shapes.shadow.sm
        };
    }
  };

  const variantStyle = getVariantStyles();

  return (
    <div
      className={`app-card ${className}`.trim()}
      style={{
        ...variantStyle,
        borderRadius: shapes.radius['2xl'],
        padding: spacing[padding],
        borderTop: highlightBorderTop ? `4px solid ${highlightBorderTop}` : undefined,
        transition: shapes.transition.fast,
        ...style
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

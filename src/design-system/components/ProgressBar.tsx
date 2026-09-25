import React from 'react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showPercent?: boolean;
  colorScheme?: 'auto' | 'primary' | 'success' | 'warning' | 'danger' | 'purple';
  height?: string;
  testId?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercent = true,
  colorScheme = 'auto',
  height = '8px',
  testId = 'progress-bar',
  className = ''
}) => {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const getBarColor = () => {
    if (colorScheme === 'auto') {
      if (percent >= 85) return colors.semantic.danger.solid;
      if (percent >= 70) return colors.semantic.warning.solid;
      return colors.brand.primary;
    }
    switch (colorScheme) {
      case 'success': return colors.semantic.success.solid;
      case 'warning': return colors.semantic.warning.solid;
      case 'danger': return colors.semantic.danger.solid;
      case 'purple': return colors.semantic.purple.solid;
      case 'primary':
      default:
        return colors.brand.primary;
    }
  };

  const barColor = getBarColor();

  return (
    <div data-testid={testId} className={`progress-bar-container ${className}`.trim()} style={{ width: '100%' }}>
      {(label || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxs }}>
          {label && (
            <span style={{ fontSize: typography.fontSize.label, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>
              {label}
            </span>
          )}
          {showPercent && (
            <span style={{ fontSize: typography.fontSize.label, fontWeight: typography.fontWeight.bold, color: barColor }}>
              {percent.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progresso'}
        style={{
          width: '100%',
          height,
          background: colors.background.muted,
          borderRadius: shapes.radius.full,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: barColor,
            borderRadius: shapes.radius.full,
            transition: shapes.transition.slow
          }}
        />
      </div>
    </div>
  );
};

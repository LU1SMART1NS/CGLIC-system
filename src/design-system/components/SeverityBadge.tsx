import React from 'react';
import { AlertCircle, AlertTriangle, Info, Flame } from 'lucide-react';
import { severityTokens, type SeverityLevel, shapes, typography, spacing } from '../tokens';

export interface SeverityBadgeProps {
  severity: SeverityLevel;
  customLabel?: string;
  showIcon?: boolean;
  testId?: string;
  className?: string;
}

const severityIcons: Record<SeverityLevel, React.ReactNode> = {
  CRITICA: <Flame size={13} aria-hidden="true" />,
  URGENTE: <AlertTriangle size={13} aria-hidden="true" />,
  ATENCAO: <AlertCircle size={13} aria-hidden="true" />,
  INFO: <Info size={13} aria-hidden="true" />
};

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  customLabel,
  showIcon = true,
  testId,
  className = ''
}) => {
  const token = severityTokens[severity] || severityTokens.INFO;
  const icon = severityIcons[severity] || severityIcons.INFO;

  return (
    <span
      data-testid={testId || `severity-badge-${severity.toLowerCase()}`}
      className={`severity-badge ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        background: token.badgeBg,
        border: `1px solid ${token.badgeBorder}`,
        color: token.badgeText,
        borderRadius: shapes.radius.md,
        padding: `${spacing.xxs} ${spacing.sm}`,
        fontSize: typography.fontSize.caption,
        fontWeight: typography.fontWeight.extrabold,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap'
      }}
    >
      {showIcon && <span style={{ color: token.iconColor }}>{icon}</span>}
      <span>{customLabel || token.label}</span>
    </span>
  );
};

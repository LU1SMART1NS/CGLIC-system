import React from 'react';
import { AlertCircle, AlertTriangle, Info, Flame } from 'lucide-react';
import { severityTokens, type SeverityLevel, shapes, typography, spacing } from '../tokens';

export interface SeverityBadgeProps {
  severity: SeverityLevel;
  customLabel?: string;
  showIcon?: boolean;
  /** Só o ícone (cada nível tem o seu): o nível e o detalhe ficam na dica e no nome acessível. */
  iconOnly?: boolean;
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
  iconOnly = false,
  testId,
  className = ''
}) => {
  const token = severityTokens[severity] || severityTokens.INFO;
  const icon = severityIcons[severity] || severityIcons.INFO;

  if (iconOnly) {
    const nivel = token.label.charAt(0) + token.label.slice(1).toLowerCase();
    const dica = customLabel ? `${nivel}: ${customLabel}` : nivel;
    return (
      <span
        data-testid={testId || `severity-badge-${severity.toLowerCase()}`}
        className={`severity-badge ds-badge ${className}`.trim()}
        role="img"
        aria-label={dica}
        title={dica}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '22px',
          background: token.badgeBg,
          border: `1px solid ${token.badgeBorder}`,
          color: token.iconColor,
          borderRadius: shapes.radius.md,
          flex: 'none'
        }}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      data-testid={testId || `severity-badge-${severity.toLowerCase()}`}
      className={`severity-badge ds-badge ${className}`.trim()}
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
      <span className="ds-badge__label" title={customLabel || token.label}>{customLabel || token.label}</span>
    </span>
  );
};

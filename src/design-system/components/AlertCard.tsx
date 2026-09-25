import React from 'react';
import { ArrowRight, Calendar, Layers, Tag } from 'lucide-react';
import { SeverityBadge } from './SeverityBadge';
import { severityTokens, type SeverityLevel, type OperationalCategory, operationalCategoryTokens, colors, shapes, typography, spacing } from '../tokens';

export interface AlertCardProps {
  id?: string;
  title: string;
  severity: SeverityLevel;
  description?: string;
  category?: OperationalCategory;
  categoryLabel?: string;
  entityName?: string; // Ex: "Contrato 15/2026" ou "Ata 00049/2025"
  entityType?: 'CONTRATO' | 'ARP' | 'EMPENHO' | 'PAGAMENTO' | 'TAREFA';
  originSource?: string; // Ex: "v_arp_item_saldo_detalhado", "Contratos.gov.br", "PNCP"
  dateLabel?: string;
  badgeLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  targetUrl?: string;
  testId?: string;
  className?: string;
}

export const AlertCard: React.FC<AlertCardProps> = ({
  id,
  title,
  severity,
  description,
  category = 'ALERTA',
  categoryLabel,
  entityName,
  entityType,
  originSource,
  dateLabel,
  badgeLabel,
  actionLabel,
  onAction,
  targetUrl,
  testId,
  className = ''
}) => {
  const token = severityTokens[severity] || severityTokens.INFO;
  const categoryToken = operationalCategoryTokens[category] || operationalCategoryTokens.ALERTA;

  const handleActionClick = (e: React.MouseEvent) => {
    if (onAction) {
      e.preventDefault();
      onAction();
    } else if (targetUrl) {
      window.location.href = targetUrl;
    }
  };

  const hasAction = Boolean(onAction || targetUrl || actionLabel);
  const resolvedActionLabel = actionLabel || (entityType === 'ARP' ? 'Ver Ata' : 'Ver Detalhes');

  return (
    <article
      id={id}
      data-testid={testId || `alert-card-${id || severity.toLowerCase()}`}
      className={`alert-card ${className}`.trim()}
      style={{
        background: colors.background.surface,
        border: `1px solid ${colors.border.default}`,
        borderLeft: `4px solid ${token.borderLeft}`,
        borderRadius: shapes.radius.lg,
        padding: spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        boxShadow: shapes.shadow.sm,
        transition: shapes.transition.fast
      }}
    >
      {/* Top Header: Severity + Category + Badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
          <SeverityBadge severity={severity} />
          
          <span
            style={{
              fontSize: typography.fontSize.caption,
              fontWeight: typography.fontWeight.semibold,
              padding: `${spacing.xxs} ${spacing.xs}`,
              borderRadius: shapes.radius.sm,
              background: categoryToken.bg,
              border: `1px solid ${categoryToken.border}`,
              color: categoryToken.text,
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xxs
            }}
          >
            <Layers size={11} aria-hidden="true" />
            <span>{categoryLabel || categoryToken.label}</span>
          </span>

          {entityName && (
            <span
              style={{
                fontSize: typography.fontSize.caption,
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                background: colors.background.subtle,
                border: `1px solid ${colors.border.default}`,
                padding: `${spacing.xxs} ${spacing.xs}`,
                borderRadius: shapes.radius.sm
              }}
            >
              {entityName}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          {badgeLabel && (
            <span
              style={{
                fontSize: typography.fontSize.caption,
                fontWeight: typography.fontWeight.bold,
                padding: `${spacing.xxs} ${spacing.xs}`,
                borderRadius: shapes.radius.sm,
                background: colors.background.subtle,
                color: colors.text.secondary
              }}
            >
              <Tag size={10} style={{ display: 'inline', marginRight: spacing.xxs }} />
              {badgeLabel}
            </span>
          )}

          {dateLabel && (
            <span
              style={{
                fontSize: typography.fontSize.caption,
                color: colors.text.muted,
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xxs
              }}
            >
              <Calendar size={11} aria-hidden="true" />
              <span>{dateLabel}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <h4
            style={{
              margin: 0,
              fontSize: typography.fontSize.body,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              lineHeight: typography.lineHeight.snug
            }}
          >
            {title}
          </h4>

          {description && (
            <p
              style={{
                margin: `${spacing.xs} 0 0 0`,
                fontSize: typography.fontSize.bodySm,
                color: colors.text.secondary,
                lineHeight: typography.lineHeight.normal
              }}
            >
              {description}
            </p>
          )}

          {originSource && (
            <div style={{ marginTop: spacing.xs, fontSize: typography.fontSize.caption, color: colors.text.subtle }}>
              Fonte Canônica: <code>{originSource}</code>
            </div>
          )}
        </div>

        {/* Action Button */}
        {hasAction && (
          <div style={{ alignSelf: 'center' }}>
            <button
              type="button"
              onClick={handleActionClick}
              aria-label={`${resolvedActionLabel} para ${title}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs} ${spacing.md}`,
                background: colors.background.subtle,
                color: colors.brand.primary,
                border: `1px solid ${colors.border.strong}`,
                borderRadius: shapes.radius.md,
                fontSize: typography.fontSize.bodySm,
                fontWeight: typography.fontWeight.bold,
                cursor: 'pointer',
                transition: shapes.transition.fast,
                whiteSpace: 'nowrap'
              }}
            >
              <span>{resolvedActionLabel}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
};

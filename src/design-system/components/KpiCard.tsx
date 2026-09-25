import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { colors, shapes, spacing, typography } from '../tokens';

export type KpiCardVariant = 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger';

export interface KpiCardProps {
  title: string;
  value?: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  subContent?: React.ReactNode;
  variant?: KpiCardVariant;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  testId?: string;
  ariaLabel?: string;
}

const variantTokens: Record<KpiCardVariant, {
  topBorder: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
}> = {
  default: {
    topBorder: colors.brand.primary,
    iconBg: colors.semantic.info.bg,
    iconColor: colors.semantic.info.text,
    valueColor: colors.text.primary
  },
  primary: {
    topBorder: colors.brand.primary,
    iconBg: colors.brand.primaryLight,
    iconColor: colors.brand.primary,
    valueColor: colors.brand.primaryHover
  },
  success: {
    topBorder: colors.semantic.success.solid,
    iconBg: colors.semantic.success.bg,
    iconColor: colors.semantic.success.text,
    valueColor: colors.semantic.success.text
  },
  warning: {
    topBorder: colors.semantic.warning.solid,
    iconBg: colors.semantic.warning.bg,
    iconColor: colors.semantic.warning.text,
    valueColor: colors.semantic.warning.text
  },
  danger: {
    topBorder: colors.semantic.danger.solid,
    iconBg: colors.semantic.danger.bg,
    iconColor: colors.semantic.danger.text,
    valueColor: colors.semantic.danger.text
  },
  info: {
    topBorder: colors.brand.secondary,
    iconBg: colors.brand.secondaryLight,
    iconColor: colors.brand.secondary,
    valueColor: colors.brand.secondaryDark
  }
};

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  icon,
  badge,
  description,
  subContent,
  variant = 'default',
  isLoading = false,
  isError = false,
  errorMessage = 'Erro ao carregar dados deste indicador',
  isEmpty = false,
  emptyMessage = 'Nenhum dado registrado',
  testId,
  ariaLabel
}) => {
  const currentVariant = variantTokens[variant] || variantTokens.default;

  // 1. Estado de Loading (Skeleton)
  if (isLoading) {
    return (
      <article
        data-testid={testId ? `${testId}-loading` : 'kpi-card-loading'}
        aria-busy="true"
        aria-label={`Carregando ${title}`}
        className="kpi-card animate-pulse"
        style={{
          background: colors.background.surface,
          borderRadius: shapes.radius['2xl'],
          padding: spacing.xl,
          border: `1px solid ${colors.border.default}`,
          borderTop: `4px solid ${currentVariant.topBorder}`,
          boxShadow: shapes.shadow.sm,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ width: '60%' }}>
            <div style={{ height: '12px', background: colors.border.default, borderRadius: '4px', width: '80%' }}></div>
            <div style={{ height: '28px', background: colors.border.strong, borderRadius: '6px', width: '100%', marginTop: '0.75rem' }}></div>
          </div>
          <div style={{ width: '38px', height: '38px', background: colors.border.default, borderRadius: '8px' }}></div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <div style={{ height: '10px', background: colors.background.subtle, borderRadius: '4px', width: '90%' }}></div>
        </div>
      </article>
    );
  }

  // 2. Estado de Erro Explícito
  if (isError) {
    return (
      <article
        data-testid={testId ? `${testId}-error` : 'kpi-card-error'}
        role="alert"
        aria-label={`Erro no indicador ${title}: ${errorMessage}`}
        className="kpi-card"
        style={{
          background: colors.semantic.danger.bg,
          borderRadius: shapes.radius['2xl'],
          padding: spacing.xl,
          border: `1px solid ${colors.semantic.danger.border}`,
          borderTop: `4px solid ${colors.semantic.danger.solid}`,
          boxShadow: shapes.shadow.sm,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div>
          <span style={{ fontSize: typography.fontSize.label, fontWeight: typography.fontWeight.bold, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.semantic.danger.text }}>
            {title}
          </span>
          <div style={{ fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold, color: colors.semantic.danger.text, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={16} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: typography.fontSize.label, color: colors.semantic.danger.text }}>
          Tente atualizar a página ou verificar os serviços conectados.
        </div>
      </article>
    );
  }

  // 3. Estado Vazio Explícito
  if (isEmpty) {
    return (
      <article
        data-testid={testId ? `${testId}-empty` : 'kpi-card-empty'}
        className="kpi-card"
        style={{
          background: colors.background.surface,
          borderRadius: shapes.radius['2xl'],
          padding: spacing.xl,
          border: `1px solid ${colors.border.default}`,
          borderTop: `4px solid ${colors.border.interactive}`,
          boxShadow: shapes.shadow.sm,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: typography.fontSize.label, fontWeight: typography.fontWeight.bold, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.text.muted }}>
              {title}
            </span>
            <div style={{ fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Inbox size={18} aria-hidden="true" />
              <span>{emptyMessage}</span>
            </div>
          </div>
          {icon && (
            <div style={{ padding: spacing.sm, background: colors.background.subtle, borderRadius: shapes.radius.lg, color: colors.text.subtle }}>
              {icon}
            </div>
          )}
        </div>
        {description && (
          <div style={{ marginTop: '0.75rem', fontSize: typography.fontSize.bodySm, color: colors.text.subtle }}>
            {description}
          </div>
        )}
      </article>
    );
  }

  // 4. Estado Normal
  return (
    <article
      data-testid={testId || 'kpi-card'}
      aria-label={ariaLabel || `${title}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`}
      className="kpi-card"
      style={{
        background: colors.background.surface,
        borderRadius: shapes.radius['2xl'],
        padding: spacing.xl,
        border: `1px solid ${colors.border.default}`,
        borderTop: `4px solid ${currentVariant.topBorder}`,
        boxShadow: shapes.shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '160px',
        transition: shapes.transition.fast
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
          <div>
            <h4
              style={{
                fontSize: typography.fontSize.label,
                fontWeight: typography.fontWeight.bold,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: colors.text.muted,
                margin: 0
              }}
            >
              {title}
            </h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            {badge && <div>{badge}</div>}
            {icon && (
              <div
                style={{
                  padding: spacing.sm,
                  background: currentVariant.iconBg,
                  borderRadius: shapes.radius.lg,
                  color: currentVariant.iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: spacing.sm }}>
          <div
            style={{
              fontSize: typography.fontSize.kpi,
              fontWeight: typography.fontWeight.extrabold,
              color: currentVariant.valueColor,
              lineHeight: typography.lineHeight.tight,
              letterSpacing: '-0.02em',
              wordBreak: 'break-word'
            }}
          >
            {value}
            {unit && (
              <span style={{ fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, marginLeft: spacing.xs }}>
                {unit}
              </span>
            )}
          </div>
        </div>

        {subContent && (
          <div style={{ marginTop: spacing.sm }}>
            {subContent}
          </div>
        )}
      </div>

      {description && (
        <div
          style={{
            marginTop: spacing.md,
            fontSize: typography.fontSize.bodySm,
            color: colors.text.secondary,
            borderTop: `1px solid ${colors.border.subtle}`,
            paddingTop: spacing.sm
          }}
        >
          {description}
        </div>
      )}
    </article>
  );
};

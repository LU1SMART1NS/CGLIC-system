import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Erro ao carregar dados',
  message = 'Ocorreu uma falha ao consultar os serviços oficiais ou processar as informações.',
  onRetry,
  retryLabel = 'Tentar Novamente',
  testId = 'error-state',
  className = ''
}) => {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`error-state ${className}`.trim()}
      style={{
        padding: spacing.xl,
        background: colors.semantic.danger.bg,
        border: `1px solid ${colors.semantic.danger.border}`,
        borderTop: `4px solid ${colors.semantic.danger.solid}`,
        borderRadius: shapes.radius.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        boxShadow: shapes.shadow.sm
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, color: colors.semantic.danger.text }}>
        <AlertCircle size={20} aria-hidden="true" />
        <h4 style={{ margin: 0, fontSize: typography.fontSize.h4, fontWeight: typography.fontWeight.bold }}>
          {title}
        </h4>
      </div>

      <p style={{ margin: 0, fontSize: typography.fontSize.bodySm, color: colors.semantic.danger.text, lineHeight: typography.lineHeight.normal }}>
        {message}
      </p>

      {onRetry && (
        <div style={{ marginTop: spacing.xs }}>
          <button
            type="button"
            onClick={onRetry}
            data-testid={`${testId}-retry-btn`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: `${spacing.xs} ${spacing.md}`,
              borderRadius: shapes.radius.md,
              border: `1px solid ${colors.semantic.danger.solid}`,
              background: colors.background.surface,
              color: colors.semantic.danger.text,
              fontSize: typography.fontSize.bodySm,
              fontWeight: typography.fontWeight.bold,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{retryLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
};

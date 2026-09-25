import React from 'react';
import { Inbox } from 'lucide-react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nenhum registro encontrado',
  description = 'Não há dados disponíveis para o contexto ou filtros selecionados.',
  icon,
  action,
  testId = 'empty-state',
  className = ''
}) => {
  return (
    <div
      data-testid={testId}
      className={`empty-state ${className}`.trim()}
      style={{
        padding: `${spacing['3xl']} ${spacing.xl}`,
        textAlign: 'center',
        background: colors.background.surface,
        border: `1px dashed ${colors.border.strong}`,
        borderRadius: shapes.radius.xl,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm
      }}
    >
      <div
        style={{
          padding: spacing.md,
          borderRadius: shapes.radius.full,
          background: colors.background.subtle,
          color: colors.text.subtle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        aria-hidden="true"
      >
        {icon || <Inbox size={32} />}
      </div>

      <h4
        style={{
          margin: 0,
          fontSize: typography.fontSize.h4,
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary
        }}
      >
        {title}
      </h4>

      {description && (
        <p
          style={{
            margin: 0,
            fontSize: typography.fontSize.bodySm,
            color: colors.text.muted,
            maxWidth: '480px',
            lineHeight: typography.lineHeight.normal
          }}
        >
          {description}
        </p>
      )}

      {action && (
        <div style={{ marginTop: spacing.sm }}>
          {action}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { User, Calendar, Cpu } from 'lucide-react';
import { StatusBadge, type StatusBadgeVariant } from './StatusBadge';
import { colors, shapes, typography, spacing } from '../tokens';

export type TaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NAO_APLICAVEL' | 'CANCELADA';
export type TaskExecutionMode = 'MANUAL' | 'AUTOMATICO' | 'SISTEMICO' | 'SEMI_AUTOMATICO';

export interface TaskCardProps {
  id: string;
  title: string;
  assigneeName?: string;
  deadline?: string;
  daysRemaining?: number;
  status?: TaskStatus;
  executionMode?: TaskExecutionMode;
  contextName?: string; // Ex: "Contrato 15/2026"
  onAction?: () => void;
  actionLabel?: string;
  testId?: string;
  className?: string;
}

const statusVariantMap: Record<TaskStatus, StatusBadgeVariant> = {
  PENDENTE: 'warning',
  EM_ANDAMENTO: 'info',
  CONCLUIDA: 'success',
  NAO_APLICAVEL: 'neutral',
  CANCELADA: 'danger'
};

const statusDisplayMap: Record<TaskStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA: 'Concluída',
  NAO_APLICAVEL: 'N/A',
  CANCELADA: 'Cancelada'
};

export const TaskCard: React.FC<TaskCardProps> = ({
  id,
  title,
  assigneeName = 'Não atribuído',
  deadline,
  daysRemaining,
  status = 'PENDENTE',
  executionMode = 'MANUAL',
  contextName,
  onAction,
  actionLabel = 'Tratar',
  testId,
  className = ''
}) => {
  const isOverdue = typeof daysRemaining === 'number' && daysRemaining < 0 && status !== 'CONCLUIDA';
  const isDueToday = typeof daysRemaining === 'number' && daysRemaining === 0 && status !== 'CONCLUIDA';
  const badgeVariant = statusVariantMap[status] || 'neutral';

  return (
    <div
      id={id}
      data-testid={testId || `task-card-${id}`}
      className={`task-card ${className}`.trim()}
      style={{
        background: colors.background.surface,
        border: `1px solid ${isOverdue ? colors.semantic.danger.border : colors.border.default}`,
        borderLeft: isOverdue ? `4px solid ${colors.semantic.danger.solid}` : `4px solid ${colors.border.interactive}`,
        borderRadius: shapes.radius.lg,
        padding: spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        boxShadow: shapes.shadow.sm,
        transition: shapes.transition.fast
      }}
    >
      {/* Top Header: Context + Status + Execution Mode */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          {contextName && (
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
              {contextName}
            </span>
          )}

          <StatusBadge
            label={statusDisplayMap[status]}
            variant={badgeVariant}
            size="sm"
          />
        </div>

        {/* Execution Mode */}
        <span
          style={{
            fontSize: typography.fontSize.caption,
            fontWeight: typography.fontWeight.semibold,
            color: executionMode === 'AUTOMATICO' ? colors.semantic.purple.text : colors.text.muted,
            background: executionMode === 'AUTOMATICO' ? colors.semantic.purple.bg : colors.background.subtle,
            border: `1px solid ${executionMode === 'AUTOMATICO' ? colors.semantic.purple.border : colors.border.default}`,
            padding: `${spacing.xxs} ${spacing.xs}`,
            borderRadius: shapes.radius.sm,
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xxs
          }}
        >
          {executionMode === 'AUTOMATICO' ? <Cpu size={11} /> : <User size={11} />}
          <span>{executionMode === 'AUTOMATICO' ? 'Automática' : 'Manual'}</span>
        </span>
      </div>

      {/* Title */}
      <h4 style={{ margin: 0, fontSize: typography.fontSize.body, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>
        {title}
      </h4>

      {/* Meta Footer: Assignee + Deadline + Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, borderTop: `1px solid ${colors.border.subtle}`, paddingTop: spacing.xs, marginTop: spacing.xxs }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.xxs, fontSize: typography.fontSize.label, color: colors.text.secondary }}>
            <User size={13} aria-hidden="true" />
            <span>{assigneeName}</span>
          </div>

          {deadline && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xxs,
                fontSize: typography.fontSize.label,
                fontWeight: isOverdue || isDueToday ? typography.fontWeight.bold : typography.fontWeight.normal,
                color: isOverdue ? colors.semantic.danger.text : (isDueToday ? colors.semantic.warning.text : colors.text.muted)
              }}
            >
              <Calendar size={13} aria-hidden="true" />
              <span>{deadline}</span>
              {typeof daysRemaining === 'number' && (
                <span>
                  ({isOverdue ? `Atrasada ${Math.abs(daysRemaining)}d` : (isDueToday ? 'Vence hoje' : `em ${daysRemaining}d`)})
                </span>
              )}
            </div>
          )}
        </div>

        {onAction && (
          <button
            type="button"
            onClick={onAction}
            data-testid={`task-action-btn-${id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xxs,
              padding: `${spacing.xxs} ${spacing.sm}`,
              background: colors.background.subtle,
              color: colors.brand.primary,
              border: `1px solid ${colors.border.strong}`,
              borderRadius: shapes.radius.md,
              fontSize: typography.fontSize.label,
              fontWeight: typography.fontWeight.bold,
              cursor: 'pointer'
            }}
          >
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};

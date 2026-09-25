import React from 'react';
import { Calendar, ShieldCheck, Clock, FileText } from 'lucide-react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface TimelineEventItem {
  id: string;
  date: string;
  title: string;
  description?: string;
  type?: string;
  category?: 'FATO_OFICIAL' | 'OPERACIONAL' | 'SISTEMICO';
  origin?: string; // Ex: "Contratos.gov.br", "Compras.gov.br", "Manual"
  badgeLabel?: string;
  icon?: React.ReactNode;
}

export interface TimelineProps {
  events: TimelineEventItem[];
  emptyMessage?: string;
  testId?: string;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  emptyMessage = 'Nenhum evento registrado no histórico.',
  testId = 'events-timeline',
  className = ''
}) => {
  if (events.length === 0) {
    return (
      <div data-testid={`${testId}-empty`} style={{ padding: spacing.xl, textAlign: 'center', color: colors.text.muted }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`timeline-container ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        paddingLeft: spacing.xl
      }}
    >
      {/* Linha Vertical Guia */}
      <div
        style={{
          position: 'absolute',
          left: '11px',
          top: '8px',
          bottom: '8px',
          width: '2px',
          background: colors.border.default
        }}
        aria-hidden="true"
      />

      {events.map((event, idx) => {
        const isOfficial = event.category === 'FATO_OFICIAL';

        return (
          <div
            key={event.id || idx}
            data-testid={`${testId}-item-${event.id || idx}`}
            style={{
              position: 'relative',
              paddingBottom: idx === events.length - 1 ? 0 : spacing.xl,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.xs
            }}
          >
            {/* Ponto / Ícone no Eixo */}
            <div
              style={{
                position: 'absolute',
                left: '-24px',
                top: '2px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: isOfficial ? colors.semantic.success.bg : colors.background.surface,
                border: `2px solid ${isOfficial ? colors.semantic.success.solid : colors.brand.primary}`,
                color: isOfficial ? colors.semantic.success.text : colors.brand.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-hidden="true"
            >
              {event.icon || (isOfficial ? <ShieldCheck size={11} /> : <Clock size={11} />)}
            </div>

            {/* Conteúdo do Evento */}
            <div
              style={{
                background: colors.background.surface,
                border: `1px solid ${colors.border.default}`,
                borderRadius: shapes.radius.lg,
                padding: spacing.md,
                boxShadow: shapes.shadow.sm
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: typography.fontSize.caption,
                      fontWeight: typography.fontWeight.bold,
                      padding: `${spacing.xxs} ${spacing.xs}`,
                      borderRadius: shapes.radius.sm,
                      background: isOfficial ? colors.semantic.success.bg : colors.semantic.info.bg,
                      color: isOfficial ? colors.semantic.success.text : colors.semantic.info.text,
                      border: `1px solid ${isOfficial ? colors.semantic.success.border : colors.semantic.info.border}`
                    }}
                  >
                    {isOfficial ? 'Fato Oficial' : 'Operacional'}
                  </span>

                  {event.type && (
                    <span
                      style={{
                        fontSize: typography.fontSize.caption,
                        fontWeight: typography.fontWeight.semibold,
                        color: colors.text.secondary
                      }}
                    >
                      {event.type}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: typography.fontSize.caption, color: colors.text.muted, display: 'inline-flex', alignItems: 'center', gap: spacing.xxs }}>
                  <Calendar size={11} aria-hidden="true" />
                  <span>{event.date}</span>
                </span>
              </div>

              <h5 style={{ margin: 0, fontSize: typography.fontSize.bodySm, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>
                {event.title}
              </h5>

              {event.description && (
                <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.fontSize.bodySm, color: colors.text.secondary }}>
                  {event.description}
                </p>
              )}

              {event.origin && (
                <div style={{ marginTop: spacing.xs, fontSize: typography.fontSize.caption, color: colors.text.subtle, display: 'flex', alignItems: 'center', gap: spacing.xxs }}>
                  <FileText size={10} aria-hidden="true" />
                  <span>Fonte: {event.origin}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

import React from 'react';
import { AlertCircle, ArrowLeft, Loader2, Search } from 'lucide-react';
import { AppButton } from '../../design-system';
import { colors, shapes, typography } from '../../design-system/tokens';
import { Instrument360Page } from './Instrument360Page';

type InstrumentPageStateKind = 'loading' | 'error' | 'notFound' | 'forbidden';

interface InstrumentPageStateProps {
  kind: InstrumentPageStateKind;
  title: string;
  message?: React.ReactNode;
  /** "Tentar novamente" (apenas no erro). */
  onRetry?: () => void;
  backLabel?: string;
  onBack?: () => void;
}

const ICON_STYLE: Record<Exclude<InstrumentPageStateKind, 'loading'>, { bg: string; fg: string }> = {
  error: { bg: 'var(--color-danger-bg-strong)', fg: 'var(--color-danger)' },
  forbidden: { bg: 'var(--color-danger-bg-strong)', fg: 'var(--color-danger)' },
  notFound: { bg: colors.background.subtle, fg: colors.text.muted }
};

/**
 * Estados de página inteira das telas de instrumento (Ata 360, Contrato 360, Item):
 * carregando, erro, não encontrado e acesso não autorizado, com o mesmo visual.
 */
export const InstrumentPageState: React.FC<InstrumentPageStateProps> = ({
  kind,
  title,
  message,
  onRetry,
  backLabel,
  onBack
}) => {
  const isDanger = kind === 'error' || kind === 'forbidden';
  return (
    <Instrument360Page>
      <div
        role={kind === 'loading' ? 'status' : undefined}
        data-testid={`instrument-state-${kind}`}
        style={{
          background: colors.background.surface,
          borderRadius: shapes.radius.lg,
          border: `1px solid ${isDanger ? 'var(--color-danger-border)' : colors.border.default}`,
          padding: kind === 'loading' ? '2.5rem' : '3rem 2rem',
          textAlign: 'center'
        }}
      >
        {kind === 'loading' ? (
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', margin: '0 auto 1rem auto' }} />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: ICON_STYLE[kind].bg,
              color: ICON_STYLE[kind].fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto'
            }}
          >
            {kind === 'notFound' ? <Search size={24} /> : <AlertCircle size={24} />}
          </div>
        )}
        <h2
          style={{
            fontSize: typography.fontSize.h3,
            fontWeight: typography.fontWeight.bold,
            color: isDanger ? 'var(--color-danger-text-strong)' : colors.text.primary,
            margin: '0 0 0.5rem 0'
          }}
        >
          {title}
        </h2>
        {message && (
          <p style={{ fontSize: typography.fontSize.body, color: colors.text.muted, maxWidth: 550, margin: '0 auto 1.5rem auto' }}>
            {message}
          </p>
        )}
        {(onRetry || onBack) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            {onRetry && <AppButton onClick={onRetry}>Tentar novamente</AppButton>}
            {onBack && (
              <AppButton variant={onRetry ? 'outline' : 'primary'} icon={<ArrowLeft size={16} />} onClick={onBack}>
                {backLabel}
              </AppButton>
            )}
          </div>
        )}
      </div>
    </Instrument360Page>
  );
};

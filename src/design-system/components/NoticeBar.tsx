import React from 'react';
import { ActionButton } from './ActionButton';

export type NoticeBarTone = 'warning' | 'info' | 'success' | 'danger';

export interface NoticeBarProps {
  tone?: NoticeBarTone;
  /** Texto do aviso. */
  children: React.ReactNode;
  /** Ação ao lado do texto (botão), quando houver. */
  action?: React.ReactNode;
  testId?: string;
  /** Quando informado, mostra o botão de fechar o aviso. */
  onDismiss?: () => void;
}

const TONES: Record<NoticeBarTone, { background: string; border: string; color: string }> = {
  warning: { background: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', color: 'var(--color-warning-text-strong)' },
  info: { background: 'var(--color-info-bg)', border: 'var(--color-info-border)', color: 'var(--color-info-text-strong)' },
  success: { background: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success-text-strong)' },
  danger: { background: 'var(--color-danger-bg)', border: 'var(--color-danger-border)', color: 'var(--color-danger-text-strong)' }
};

/**
 * Faixa de aviso que pede uma ação, no topo de uma aba (logo abaixo do resumo).
 * Mesmo desenho para pendências de confirmação, empenhos sem unidade e avisos parecidos.
 */
export const NoticeBar: React.FC<NoticeBarProps> = ({ tone = 'warning', children, action, testId = 'notice-bar', onDismiss }) => {
  const t = TONES[tone];
  return (
    <div
      data-testid={testId}
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.6rem 0.9rem',
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: '8px',
        fontSize: '0.85rem'
      }}
    >
      <span style={{ color: t.color }}>{children}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        {action}
        {onDismiss && (
          <ActionButton action="fechar" iconOnly label="Fechar aviso" onClick={onDismiss} />
        )}
      </span>
    </div>
  );
};

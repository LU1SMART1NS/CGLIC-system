import React from 'react';
import { X } from 'lucide-react';
import { AppButton } from './AppButton';

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
  warning: { background: '#fffbeb', border: '#fde68a', color: '#92400e' },
  info: { background: '#eff6ff', border: '#bfdbfe', color: '#1e3a8a' },
  success: { background: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  danger: { background: '#fef2f2', border: '#fecaca', color: '#991b1b' }
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
          <AppButton variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={onDismiss} title="Fechar aviso" />
        )}
      </span>
    </div>
  );
};

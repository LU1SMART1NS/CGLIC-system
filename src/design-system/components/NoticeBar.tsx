import React from 'react';

export type NoticeBarTone = 'warning' | 'info';

export interface NoticeBarProps {
  tone?: NoticeBarTone;
  /** Texto do aviso. */
  children: React.ReactNode;
  /** Ação ao lado do texto (botão), quando houver. */
  action?: React.ReactNode;
  testId?: string;
}

const TONES: Record<NoticeBarTone, { background: string; border: string; color: string }> = {
  warning: { background: '#fffbeb', border: '#fde68a', color: '#92400e' },
  info: { background: '#eff6ff', border: '#bfdbfe', color: '#1e3a8a' }
};

/**
 * Faixa de aviso que pede uma ação, no topo de uma aba (logo abaixo do resumo).
 * Mesmo desenho para pendências de confirmação, empenhos sem unidade e avisos parecidos.
 */
export const NoticeBar: React.FC<NoticeBarProps> = ({ tone = 'warning', children, action, testId = 'notice-bar' }) => {
  const t = TONES[tone];
  return (
    <div
      data-testid={testId}
      role="status"
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
      {action}
    </div>
  );
};

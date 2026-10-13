import React from 'react';

export type MetricTone = 'default' | 'warning' | 'danger';

export interface MetricStripItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: MetricTone;
  testId?: string;
}

export interface MetricStripProps {
  /** Título curto acima dos cartões (ex.: "SENASP neste item"). */
  title?: string;
  items: MetricStripItem[];
  testId?: string;
}

/**
 * Faixa de números: cartões lado a lado com rótulo, número e explicação em linhas comuns a todos (grid com
 * subgrid). Um rótulo que quebra em duas linhas empurra os números de todos os cartões juntos, e eles ficam
 * sempre na mesma altura. Sem subgrid (navegadores antigos), o rótulo reserva duas linhas.
 */
export const MetricStrip: React.FC<MetricStripProps> = ({ title, items, testId }) => (
  <div className="ds-metric-strip" data-testid={testId}>
    {title && <div className="ds-metric-strip__title">{title}</div>}
    <div className="ds-metric-strip__grid">
      {items.map((it) => (
        <div key={it.label} className={`ds-metric${it.tone && it.tone !== 'default' ? ` ds-metric--${it.tone}` : ''}`} data-testid={it.testId}>
          <div className="ds-metric__label">{it.label}</div>
          <div className="ds-metric__value">{it.value}</div>
          <div className="ds-metric__hint">{it.hint}</div>
        </div>
      ))}
    </div>
  </div>
);

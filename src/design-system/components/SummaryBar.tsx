import React from 'react';
import { ProgressBar } from './ProgressBar';

export type SummaryBarTone = 'default' | 'success' | 'warning' | 'danger';

export interface SummaryBarItem {
  label: string;
  value: string;
  /** Unidade exibida após o valor (padrão "un"); vazio para não exibir. */
  unit?: string;
  tone?: SummaryBarTone;
}

export interface SummaryBarProps {
  items: SummaryBarItem[];
  /** Barra de consumo abaixo dos números (mesma regra de cor em todas as telas). */
  progress?: { value: number; max: number; label?: string };
  /** Elementos curtos ao lado dos números (ex.: selo de pendência). */
  extra?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  /** Avisos abaixo do resumo (faixa de pendências, alerta de referência). */
  children?: React.ReactNode;
  testId?: string;
}

const TONE_COLOR: Record<SummaryBarTone, string | undefined> = {
  default: undefined,
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)'
};

/**
 * Resumo de uma aba em uma linha: os números principais, uma barra de consumo opcional e avisos.
 * Substitui as fileiras de cartões nas abas de detalhe, para todas terem a mesma identidade.
 */
export const SummaryBar: React.FC<SummaryBarProps> = ({
  items,
  progress,
  extra,
  loading = false,
  loadingLabel = 'Carregando...',
  children,
  testId = 'summary-bar'
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid={testId}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
      {loading ? (
        <span style={{ color: 'var(--text-secondary)' }}>{loadingLabel}</span>
      ) : (
        <>
          {items.map((item) => (
            <span key={item.label}>
              {item.label} <strong style={{ color: TONE_COLOR[item.tone ?? 'default'] }}>{item.value}</strong>
              {(item.unit ?? 'un') !== '' && <span style={{ color: 'var(--text-muted)' }}> {item.unit ?? 'un'}</span>}
            </span>
          ))}
          {extra}
        </>
      )}
    </div>
    {!loading && progress && (
      <ProgressBar
        value={progress.value}
        max={progress.max}
        label={progress.label}
        showPercent={false}
        height="6px"
        testId={`${testId}-progress`}
      />
    )}
    {!loading && children}
  </div>
);

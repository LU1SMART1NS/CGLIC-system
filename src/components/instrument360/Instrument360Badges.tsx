import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PRAZO_COLORS, type PrazoFaixa } from '../carteira/carteiraPrazo';

const COLORS = { inkSoft: '#334155', line: '#e2e8f0', surface: '#f8fafc' };

export interface InstrumentStatus {
  faixa: PrazoFaixa;
  label: string;
  /** `neutral` mostra o selo cinza (a gravidade fica no indicador). */
  neutral?: boolean;
}

/** Selo de situação (Vigente, Encerrada...), igual no cartão e na barra fixa. */
export const InstrumentStatusBadge: React.FC<{ status: InstrumentStatus; testId?: string; compact?: boolean }> = ({ status, testId, compact }) => {
  const colors = status.neutral ? { color: COLORS.inkSoft, bg: COLORS.surface } : PRAZO_COLORS[status.faixa];
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: compact ? '2px 8px' : '3px 10px',
        borderRadius: '999px',
        fontSize: compact ? '0.72rem' : '0.78rem',
        fontWeight: 700,
        color: colors.color,
        background: colors.bg,
        border: status.neutral ? `1px solid ${COLORS.line}` : '1px solid transparent',
        whiteSpace: 'nowrap'
      }}
    >
      <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} />
      {status.label}
    </span>
  );
};

/** Aviso em selo vermelho ao lado da situação (ex.: "Ata vence em 8 dias"). */
export const InstrumentAlertBadge: React.FC<{ children: React.ReactNode; testId?: string; compact?: boolean }> = ({ children, testId, compact }) => (
  <span
    data-testid={testId}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: compact ? '2px 8px' : '3px 10px',
      borderRadius: '999px',
      fontSize: compact ? '0.72rem' : '0.78rem',
      fontWeight: 700,
      color: '#b91c1c',
      background: 'transparent',
      border: '1px solid #b91c1c',
      whiteSpace: 'nowrap'
    }}
  >
    <AlertTriangle size={11} aria-hidden="true" />
    {children}
  </span>
);

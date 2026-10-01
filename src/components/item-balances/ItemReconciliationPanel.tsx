import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../../design-system';
import { colors, shapes, typography } from '../../design-system/tokens';
import { formatNumber } from '../../utils/format';
import type { ReconciliationReport } from '../../types';

const Term: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }}>
    <span style={{ fontSize: typography.fontSize.caption, color: colors.text.muted }}>{label}</span>
    <span style={{ fontSize: strong ? '1.05rem' : typography.fontSize.body, fontWeight: strong ? 800 : 700, color: tone || colors.text.primary }}>
      {value} un
    </span>
  </div>
);

const Op: React.FC<{ children: string }> = ({ children }) => (
  <span aria-hidden="true" style={{ alignSelf: 'flex-end', paddingBottom: 2, color: colors.text.subtle, fontWeight: 700 }}>{children}</span>
);

/**
 * Conferência do saldo do item, na aba Empenhos: Registrada − empenhos (API + manuais) = saldo calculado,
 * comparado com o saldo informado pelo SIASG. A situação (consistente/divergente) também aparece no topo da tela.
 */
export const ItemReconciliationPanel: React.FC<{ report: ReconciliationReport }> = ({ report }) => {
  const divergente = report.status === 'DIVERGENTE';
  const consistente = report.status === 'CONSISTENTE';
  return (
    <section
      data-testid="item-reconciliation-panel"
      aria-label="Conferência do saldo"
      style={{
        border: `1px solid ${divergente ? colors.semantic.warning.border : colors.border.default}`,
        background: divergente ? colors.semantic.warning.bg : colors.background.surface,
        borderRadius: shapes.radius.lg,
        padding: '1rem 1.25rem'
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <ShieldCheck size={16} color="#0c326f" />
        <h3 style={{ margin: 0, fontSize: typography.fontSize.body, fontWeight: 800, color: '#0c326f' }}>Conferência do saldo</h3>
        <StatusBadge
          label={consistente ? 'Consistente com o SIASG' : divergente ? 'Divergente' : 'Sem dado da API'}
          variant={consistente ? 'success' : divergente ? 'warning' : 'neutral'}
          size="sm"
        />
      </header>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Term label="Registrada" value={formatNumber(report.quantidadeRegistrada)} />
        <Op>−</Op>
        <Term label="Empenhos oficiais (API)" value={formatNumber(report.totalEmpenhadoApi)} tone={colors.semantic.success.text} />
        <Op>−</Op>
        <Term label="Empenhos manuais" value={formatNumber(report.totalEmpenhadoManual)} tone={colors.semantic.warning.text} />
        <Op>=</Op>
        <Term label="Saldo calculado" value={formatNumber(report.saldoCalculado)} strong tone="#0c326f" />
        <span style={{ alignSelf: 'stretch', borderLeft: `1px solid ${colors.border.default}`, margin: '0 0.4rem' }} />
        <Term label="Saldo no SIASG" value={report.saldoApi !== undefined ? formatNumber(report.saldoApi) : 'N/D'} />
        {divergente && report.saldoApi !== undefined && (
          <Term
            label="Diferença"
            value={report.divergencia > 0 ? `+${formatNumber(report.divergencia)}` : formatNumber(report.divergencia)}
            tone={colors.semantic.danger.text}
          />
        )}
      </div>
      {!consistente && report.mensagem && (
        <p style={{ margin: '0.75rem 0 0', fontSize: typography.fontSize.bodySm, color: colors.text.secondary }}>{report.mensagem}</p>
      )}
    </section>
  );
};

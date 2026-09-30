import React from 'react';
import type { ContractDashboardRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { severityTokens } from '../../design-system/tokens';
import { formatDateBR } from '../../services/temporalEngineService';
import { buildContractLifeline, type LifelineMilestone } from '../../services/contractLifelineService';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';

interface ContractHealthStripProps {
  contract: ContractDashboardRecord;
  contractKey: string;
  counts: Record<SeverityLevel, number>;
  onOpenActions: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

const tileBase: React.CSSProperties = {
  borderRadius: '8px',
  padding: '0.7rem 0.9rem',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  textAlign: 'left'
};

const MILESTONE_COLORS: Record<LifelineMilestone['state'], string> = {
  PASSADO: '#94a3b8',
  PROXIMO: '#d97706',
  FUTURO: '#64748b'
};

function relativeDays(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias > 0) return `em ${dias} dia${dias === 1 ? '' : 's'}`;
  return `há ${Math.abs(dias)} dia${dias === -1 ? '' : 's'}`;
}

const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: SeverityLevel; onClick?: () => void; testId?: string }> = ({
  label,
  value,
  hint,
  tone,
  onClick,
  testId
}) => {
  const token = tone ? severityTokens[tone] : null;
  const style: React.CSSProperties = {
    ...tileBase,
    ...(token ? { background: token.badgeBg, border: `1px solid ${token.badgeBorder}` } : {}),
    ...(onClick ? { cursor: 'pointer', font: 'inherit' } : {})
  };
  const content = (
    <>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: token ? token.badgeText : '#64748b' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: token ? token.badgeText : '#0f172a', lineHeight: 1.3 }}>{value}</div>
      {hint && <div style={{ fontSize: '0.72rem', color: token ? token.badgeText : '#64748b' }}>{hint}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} style={style} data-testid={testId}>
      {content}
    </button>
  ) : (
    <div style={style} data-testid={testId}>
      {content}
    </div>
  );
};

export const ContractHealthStrip: React.FC<ContractHealthStripProps> = ({ contract, contractKey, counts, onOpenActions }) => {
  const lifeline = React.useMemo(() => buildContractLifeline(contract), [contract]);
  const financial = useContractFinancialSummary(contract, contractKey);

  const valorGlobal = contract.valorGlobal || contract.valorInicial || 0;
  const totalPago = financial.summary?.totalValorPagoGlobal ?? 0;
  const pagoValue = financial.isLoading && !financial.summary
    ? '…'
    : financial.summary && valorGlobal > 0
    ? `${Math.round((totalPago / valorGlobal) * 100)}%`
    : '—';
  const pagoHint = financial.summary && valorGlobal > 0
    ? `${formatCurrency(totalPago)} de ${formatCurrency(valorGlobal)}`
    : financial.isLoading
    ? 'Carregando empenhos'
    : 'Sem empenhos vinculados';

  const vigenciaValue = !lifeline ? '—' : lifeline.diasParaFim < 0 ? 'Encerrada' : `${lifeline.diasParaFim} dias`;
  const vigenciaHint = lifeline
    ? lifeline.diasParaFim < 0
      ? `desde ${formatDateBR(lifeline.end)}`
      : `até ${formatDateBR(lifeline.end)}`
    : 'Vigência não informada';

  const proximos = lifeline?.milestones.filter((m) => m.state !== 'PASSADO').slice(0, 3) ?? [];

  return (
    <section
      data-testid="contract-health-strip"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.1rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.25rem'
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <Tile label="Vigência restante" value={vigenciaValue} hint={vigenciaHint} testId="health-vigencia" />
        <Tile label="Pago do valor global" value={pagoValue} hint={pagoHint} testId="health-pago" />
        <Tile
          label="Críticas"
          value={String(counts.CRITICA)}
          hint="vencidas"
          tone={counts.CRITICA > 0 ? 'CRITICA' : undefined}
          onClick={onOpenActions}
          testId="health-criticas"
        />
        <Tile
          label="Urgentes"
          value={String(counts.URGENTE)}
          hint="até 7 dias"
          tone={counts.URGENTE > 0 ? 'URGENTE' : undefined}
          onClick={onOpenActions}
          testId="health-urgentes"
        />
        <Tile
          label="Em atenção"
          value={String(counts.ATENCAO)}
          hint="8 a 30 dias"
          tone={counts.ATENCAO > 0 ? 'ATENCAO' : undefined}
          onClick={onOpenActions}
          testId="health-atencao"
        />
      </div>

      {lifeline && (
        <div style={{ marginTop: '1.1rem' }} data-testid="contract-lifeline">
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.6rem' }}>Linha da vida do contrato</div>
          <div style={{ position: 'relative', height: '10px', background: '#e2e8f0', borderRadius: '5px', margin: '0 7px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${lifeline.todayPct}%`, background: '#0c326f', borderRadius: '5px' }} />
            {lifeline.milestones.map((m) => (
              <span
                key={m.id}
                title={`${m.label} — ${formatDateBR(m.date)} (${relativeDays(m.diasRestantes)})`}
                style={{
                  position: 'absolute',
                  left: `${m.pct}%`,
                  top: '50%',
                  width: '12px',
                  height: '12px',
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  background: m.state === 'PASSADO' ? MILESTONE_COLORS.PASSADO : '#ffffff',
                  border: `2px solid ${MILESTONE_COLORS[m.state]}`
                }}
              />
            ))}
            {lifeline.todayPct > 0 && lifeline.todayPct < 100 && (
              <span
                title="Hoje"
                style={{
                  position: 'absolute',
                  left: `${lifeline.todayPct}%`,
                  top: '-5px',
                  width: '2px',
                  height: '20px',
                  transform: 'translateX(-50%)',
                  background: '#0f172a'
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginTop: '0.4rem' }}>
            <span>Início · {formatDateBR(lifeline.start)}</span>
            <span>Fim · {formatDateBR(lifeline.end)}</span>
          </div>

          {proximos.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Próximos marcos:</span>
              {proximos.map((m) => (
                <span
                  key={m.id}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '6px',
                    border: `1px solid ${m.state === 'PROXIMO' ? '#fde68a' : '#e2e8f0'}`,
                    background: m.state === 'PROXIMO' ? '#fffbeb' : '#f8fafc',
                    color: m.state === 'PROXIMO' ? '#92400e' : '#334155'
                  }}
                >
                  {m.label} · {formatDateBR(m.date)} ({relativeDays(m.diasRestantes)})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

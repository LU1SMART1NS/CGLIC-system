import React from 'react';
import type { SeverityLevel } from '../../design-system/tokens';
import { severityTokens } from '../../design-system/tokens';
import { formatDateBR } from '../../services/temporalEngineService';
import type { ContractLifeline, LifelineMilestone } from '../../services/contractLifelineService';

/**
 * Peças do cabeçalho das telas 360 (Contrato e Ata): cartões de indicador,
 * indicador único de pendências e linha da vida com marcos nomeados.
 */

const tileBase: React.CSSProperties = {
  borderRadius: '8px',
  padding: '0.7rem 0.9rem',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  textAlign: 'left'
};

const POSITIVE = { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' };

export const HealthTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: SeverityLevel;
  /** Estado "tudo certo" (verde), usado pelo indicador de pendências quando não há nenhuma. */
  positive?: boolean;
  /** Valor textual longo (ex.: nome do fornecedor) em fonte menor. */
  compact?: boolean;
  onClick?: () => void;
  testId?: string;
}> = ({ label, value, hint, tone, positive = false, compact = false, onClick, testId }) => {
  const token = tone ? severityTokens[tone] : null;
  const colors = token
    ? { bg: token.badgeBg, border: token.badgeBorder, text: token.badgeText }
    : positive
      ? POSITIVE
      : null;
  const style: React.CSSProperties = {
    ...tileBase,
    ...(colors ? { background: colors.bg, border: `1px solid ${colors.border}` } : {}),
    ...(onClick ? { cursor: 'pointer', font: 'inherit' } : {})
  };
  const content = (
    <>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: colors ? colors.text : '#64748b' }}>{label}</div>
      <div
        title={compact ? value : undefined}
        style={{
          fontSize: compact ? '0.92rem' : '1.3rem',
          fontWeight: 800,
          color: colors ? colors.text : '#0f172a',
          lineHeight: 1.3,
          margin: compact ? '0.2rem 0' : 0,
          ...(compact ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {})
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: '0.72rem', color: colors ? colors.text : '#64748b' }}>{hint}</div>}
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

export const HealthTileGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>{children}</div>
);

const PENDENCIA_LABELS: Record<Exclude<SeverityLevel, 'INFO'>, [string, string]> = {
  CRITICA: ['crítica', 'críticas'],
  URGENTE: ['urgente', 'urgentes'],
  ATENCAO: ['em atenção', 'em atenção']
};

/**
 * Indicador único de pendências: junta crítica/urgente/atenção num só cartão
 * (verde quando não há nenhuma; na cor da mais grave quando há).
 */
export const PendenciasTile: React.FC<{
  counts: Record<SeverityLevel, number>;
  onClick: () => void;
  testId: string;
}> = ({ counts, onClick, testId }) => {
  const severities = (['CRITICA', 'URGENTE', 'ATENCAO'] as const).filter((s) => counts[s] > 0);
  const total = severities.reduce((acc, s) => acc + counts[s], 0);

  // Lembretes de prazo (INFO) não exigem ação agora; ficam na aba Ações, fora do indicador.
  if (total === 0) {
    return <HealthTile label="Pendências" value="Nenhuma" hint="tudo em dia" positive onClick={onClick} testId={testId} />;
  }
  const hint = severities.map((s) => `${counts[s]} ${PENDENCIA_LABELS[s][counts[s] === 1 ? 0 : 1]}`).join(' · ');
  return <HealthTile label="Pendências" value={String(total)} hint={hint} tone={severities[0]} onClick={onClick} testId={testId} />;
};

const MILESTONE_COLORS: Record<LifelineMilestone['state'], string> = {
  PASSADO: '#94a3b8',
  PROXIMO: '#d97706',
  FUTURO: '#64748b'
};

/** Nome curto do marco para caber sob a linha da vida (o nome completo fica no tooltip). */
export function shortMilestoneLabel(label: string): string {
  const reajuste = /Reajuste \((\d+) meses\)/.exec(label);
  if (reajuste) return `Reajuste ${reajuste[1]}m`;
  if (/Prorroga/i.test(label)) return 'Prorrogação';
  if (/Exaust/i.test(label)) return 'Nova licitação';
  if (/Interesse/i.test(label)) return 'Consulta ao fornecedor';
  if (/Controle/i.test(label)) return 'Órgãos de controle';
  return label.replace(/\s*\(.*\)\s*$/, '');
}

function relativeDays(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias > 0) return `em ${dias} dia${dias === 1 ? '' : 's'}`;
  return `há ${Math.abs(dias)} dia${dias === -1 ? '' : 's'}`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
}

/** Duas faixas de rótulos: um marco vai para a segunda faixa quando fica perto do anterior da primeira. */
function placeMilestoneLabels(milestones: LifelineMilestone[]): Array<{ m: LifelineMilestone; row: 0 | 1 }> {
  return milestones.reduce<{ placed: Array<{ m: LifelineMilestone; row: 0 | 1 }>; lastRow0: number }>(
    (acc, m) => {
      const row: 0 | 1 = m.pct - acc.lastRow0 < 14 ? 1 : 0;
      return { placed: [...acc.placed, { m, row }], lastRow0: row === 0 ? m.pct : acc.lastRow0 };
    },
    { placed: [], lastRow0: -100 }
  ).placed;
}

/** Posição do rótulo sem estourar as bordas da barra. */
function labelPosition(pct: number): React.CSSProperties {
  if (pct < 8) return { left: 0 };
  if (pct > 92) return { right: 0, textAlign: 'right' };
  return { left: `${pct}%`, transform: 'translateX(-50%)', textAlign: 'center' };
}

/**
 * Linha da vida: vigência em cima (os dias restantes ficam no selo do título); marcos nomeados embaixo
 * (em duas faixas quando ficam próximos) e o "Hoje" marcado sobre a barra.
 */
export const LifelineBar: React.FC<{
  lifeline: ContractLifeline | null;
  testId: string;
  /** Mantido por compatibilidade: a situação (prazo, cancelada) vive no selo do título, não na barra. */
  cancelada?: boolean;
}> = ({ lifeline, testId }) => {
  if (!lifeline) {
    return (
      <div data-testid={testId} style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '1rem' }}>
        Vigência não informada.
      </div>
    );
  }

  const placed = placeMilestoneLabels(lifeline.milestones);
  const hasSecondRow = placed.some((p) => p.row === 1);
  const showToday = lifeline.todayPct > 0 && lifeline.todayPct < 100;

  return (
    <div data-testid={testId} style={{ marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: showToday ? '1.1rem' : '0.5rem' }}>
        <span style={{ color: '#475569' }}>
          <strong style={{ color: '#0f172a' }}>Vigência</strong> · {formatDateBR(lifeline.start)} a {formatDateBR(lifeline.end)}
        </span>
      </div>

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
        {showToday && (
          <>
            <span style={{ position: 'absolute', left: `${lifeline.todayPct}%`, top: '-5px', width: '2px', height: '20px', transform: 'translateX(-50%)', background: '#0f172a' }} />
            <span
              style={{
                position: 'absolute',
                bottom: '16px',
                fontSize: '0.68rem',
                fontWeight: 800,
                color: '#0f172a',
                whiteSpace: 'nowrap',
                ...labelPosition(lifeline.todayPct)
              }}
            >
              Hoje
            </span>
          </>
        )}
      </div>

      {placed.length > 0 && (
        <div style={{ position: 'relative', height: hasSecondRow ? '3.6rem' : '1.9rem', margin: '0.35rem 7px 0' }}>
          {placed.map(({ m, row }) => (
            <span
              key={m.id}
              title={`${m.label} — ${formatDateBR(m.date)} (${relativeDays(m.diasRestantes)})`}
              style={{
                position: 'absolute',
                top: row === 0 ? 0 : '1.75rem',
                fontSize: '0.68rem',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                color: m.state === 'PROXIMO' ? '#92400e' : m.state === 'PASSADO' ? '#94a3b8' : '#475569',
                fontWeight: m.state === 'PROXIMO' ? 800 : 600,
                ...labelPosition(m.pct)
              }}
            >
              {shortMilestoneLabel(m.label)}
              <br />
              {shortDate(m.date)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

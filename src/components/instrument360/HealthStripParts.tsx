import React from 'react';
import { AlertTriangle, Check, Circle } from 'lucide-react';
import type { SeverityLevel } from '../../design-system/tokens';
import { severityTokens } from '../../design-system/tokens';
import { formatDateBR } from '../../services/temporalEngineService';
import { clusterLifelineEvents, type ContractLifeline, type LifelineMilestone } from '../../services/contractLifelineService';

/**
 * Peças do topo das telas 360 (Ata, Contrato e Item): cartões de indicador, indicador único de
 * pendências e a régua de prazos, que mora dentro do cartão de vigência.
 *
 * Cartão em 4 camadas: rótulo, valor, conteúdo extra (a régua) e dica. A gravidade aparece só no
 * selo (ícone e texto) e na borda esquerda; o fundo e o número continuam neutros.
 */

const COLORS = {
  ink: '#0f172a',
  inkSoft: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  surface: '#f8fafc',
  ok: '#166534',
  tick: '#94a3b8',
  brand: '#0c326f',
  warn: '#d97706'
};

/** Texto do selo por tom. INFO não tem selo. */
const BADGE_LABEL: Record<SeverityLevel, string | null> = {
  CRITICA: 'Crítico',
  URGENTE: 'Urgente',
  ATENCAO: 'Atenção',
  INFO: null
};

/** Dica de no máximo 2 linhas: o cartão tem altura fixa nos cabeçalhos 360, e o texto cortado aparece inteiro na dica do mouse. */
const HINT_CLAMP: React.CSSProperties = {
  fontSize: '0.78rem',
  color: COLORS.inkSoft,
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

export const HealthTile: React.FC<{
  label: string;
  value: string;
  /** Uma ou mais linhas de dica, ancoradas na base do cartão. */
  hint?: string | string[];
  tone?: SeverityLevel;
  /** Substitui o texto do selo (ex.: "Atenção" no tom âmbar usado pela vigência). */
  badge?: string;
  /** Estado "tudo certo": a dica ganha um visto verde. O cartão continua neutro. */
  positive?: boolean;
  /** Valor textual longo (ex.: nome do fornecedor) em fonte menor. */
  compact?: boolean;
  /** Ocupa 2 colunas do grid (cartão que leva a régua). */
  wide?: boolean;
  /** Conteúdo abaixo das dicas (a régua de prazos). */
  children?: React.ReactNode;
  /** Texto do tooltip do cartão; sem ele, o tooltip é a junção das dicas. */
  tooltip?: string;
  onClick?: () => void;
  testId?: string;
}> = ({ label, value, hint, tone, badge, positive = false, compact = false, wide = false, children, tooltip, onClick, testId }) => {
  const token = tone && tone !== 'INFO' ? severityTokens[tone] : null;
  const badgeText = token ? (badge ?? BADGE_LABEL[tone as SeverityLevel]) : null;
  const hints = (Array.isArray(hint) ? hint : hint ? [hint] : []).filter(Boolean);
  // Cartão com a régua: a dica vai ao lado do valor, para o cartão ter a altura dos demais.
  const inlineHints = wide && Boolean(children);

  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr',
    alignContent: 'start',
    gap: '4px',
    minWidth: 0,
    padding: '12px 14px',
    borderRadius: '10px',
    border: `1px solid ${COLORS.line}`,
    borderLeft: `3px solid ${token ? token.borderLeft : COLORS.line}`,
    background: COLORS.surface,
    color: COLORS.ink,
    textAlign: 'left',
    ...(onClick ? { cursor: 'pointer', font: 'inherit' } : {})
  };

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <span
          title={label}
          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {label}
        </span>
        {token && badgeText && (
          <span
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '1px 7px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: token.badgeBg,
              color: token.badgeText,
              border: `1px solid ${token.badgeBorder}`
            }}
          >
            {tone === 'CRITICA' ? <AlertTriangle size={11} aria-hidden="true" /> : <Circle size={9} fill="currentColor" aria-hidden="true" />}
            {badgeText}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'nowrap', gap: '0 10px', minWidth: 0 }}>
        <div
          title={compact ? value : undefined}
          style={{
            fontSize: compact ? '0.92rem' : '1.4rem',
            fontWeight: 800,
            color: COLORS.ink,
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
            flex: 'none',
            ...(compact ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto' } : {})
          }}
        >
          {value}
        </div>
        {inlineHints &&
          hints.map((line) => (
            <span key={line} title={line} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', color: COLORS.inkSoft, lineHeight: 1.3 }}>
              {line}
            </span>
          ))}
      </div>
      <div
        title={inlineHints ? undefined : tooltip || hints.join(' · ') || undefined}
        style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
      >
        {(inlineHints ? [] : hints).map((line, index) =>
          positive && index === 0 ? (
            <div key={line} style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: 600, color: COLORS.ok, lineHeight: 1.3 }}>
              <Check size={12} aria-hidden="true" />
              {line}
            </div>
          ) : (
            <div key={line} style={{ ...HINT_CLAMP, ...(index === 0 ? { marginTop: 'auto' } : {}) }}>
              {line}
            </div>
          )
        )}
        {children}
      </div>
    </>
  );

  const className = wide ? 'health-tile health-tile--wide' : 'health-tile';
  return onClick ? (
    <button type="button" onClick={onClick} style={style} className={className} data-testid={testId}>
      {content}
    </button>
  ) : (
    <div style={style} className={className} data-testid={testId}>
      {content}
    </div>
  );
};

/**
 * Grade dos indicadores. Com `columns`, o número de colunas depende da largura do CARTÃO (não da janela,
 * que perde cerca de 350px para o menu lateral e as margens): até 890px são 2 por linha e até 420px, 1.
 * Sem `columns`, o número de colunas se ajusta sozinho ao espaço.
 */
export const HealthTileGrid: React.FC<{ children: React.ReactNode; columns?: 4 | 5 }> = ({ children, columns }) => (
  <div className="health-tiles-wrap">
    <div className="health-tile-grid" data-columns={columns}>
      {children}
    </div>
  </div>
);

const PENDENCIA_LABELS: Record<Exclude<SeverityLevel, 'INFO'>, [string, string]> = {
  CRITICA: ['crítica', 'críticas'],
  URGENTE: ['urgente', 'urgentes'],
  ATENCAO: ['em atenção', 'em atenção']
};

/**
 * Indicador único de pendências: junta crítica/urgente/atenção num só cartão
 * (neutro com visto quando não há nenhuma; com o selo da mais grave quando há).
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

/**
 * Nome do marco na régua. Os marcos de 180 e 90 dias são gatilhos de PLANEJAMENTO, não a
 * prorrogação nem a licitação em si; o nome diz isso. Os demais mantêm o nome do motor de prazos.
 */
export function shortMilestoneLabel(label: string): string {
  if (/Prorroga/i.test(label)) return /\bAta\b/.test(label) ? 'Planejamento de prorrogação' : 'Início da análise de prorrogação';
  if (/Exaust/i.test(label)) return 'Planejar nova licitação';
  if (/Interesse/i.test(label)) return 'Consulta ao fornecedor';
  if (/Controle/i.test(label)) return 'Remessa aos órgãos de controle';
  return label.replace(/\s*\((?!\d+ meses).*\)\s*$/, '');
}

function relativeDays(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias > 0) return `em ${dias} dia${dias === 1 ? '' : 's'}`;
  return `há ${Math.abs(dias)} dia${dias === -1 ? '' : 's'}`;
}

/** Marco a menos que isso (em px) do marcador de fim é desenhado junto dele. Medido na barra real, não em %. */
const MERGE_WITH_END_PX = 14;

/** Largura em px de um elemento, acompanhando redimensionamentos (0 até a primeira medição). */
function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>): number {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Régua de prazos, dentro do cartão de vigência: barra do tempo consumido, "Hoje" e fim.
 * Só o PRÓXIMO marco tem texto; os que já passaram e os futuros além dele viram traços cinza, com nome e
 * data na dica. Termos do histórico (aditivos, apostilamentos) são losangos numa faixa abaixo da barra.
 * O motor só sabe se a data passou, está próxima ou é futura: não sabe se o ato foi cumprido.
 */
export const LifelineRule: React.FC<{
  lifeline: ContractLifeline | null;
  testId: string;
  /** Tom do cartão; colore o preenchimento da barra. */
  tone?: SeverityLevel;
}> = ({ lifeline, testId, tone }) => {
  const barRef = React.useRef<HTMLDivElement>(null);
  const barWidth = useElementWidth(barRef);

  if (!lifeline) {
    return (
      <div data-testid={testId} style={{ fontSize: '0.78rem', color: COLORS.muted, marginTop: '0.75rem' }}>
        Vigência não informada.
      </div>
    );
  }

  const milestones = lifeline.milestones;
  const passed = milestones.filter((m) => m.state === 'PASSADO');
  const ahead = milestones.filter((m) => m.state !== 'PASSADO');
  const next: LifelineMilestone | undefined = ahead[0];
  const ticks = [...passed, ...ahead.slice(1)];
  // Sem medição ainda (SSR/primeiro render), cai no equivalente antigo de 3%.
  const distanceToEndPx = next ? ((100 - next.pct) / 100) * (barWidth || 460) : Infinity;
  const mergedWithEnd = Boolean(next && distanceToEndPx <= MERGE_WITH_END_PX);
  const termos = clusterLifelineEvents(lifeline.events ?? []);
  const totalTermos = lifeline.events?.length ?? 0;

  const showToday = lifeline.todayPct > 0 && lifeline.todayPct < 100;
  const fillColor = tone && tone !== 'INFO' ? severityTokens[tone].borderLeft : COLORS.brand;
  const nextColor = next?.state === 'PROXIMO' ? COLORS.warn : COLORS.tick;

  const leftNote =
    totalTermos > 0
      ? `${totalTermos} ${totalTermos === 1 ? 'termo registrado' : 'termos registrados'}`
      : passed.length > 0
        ? `${passed.length} ${passed.length === 1 ? 'marco já passou' : 'marcos já passaram'}`
        : null;
  const nextText = next ? `${shortMilestoneLabel(next.label)} · ${formatDateBR(next.date)}` : null;
  const markerTitle = (m: LifelineMilestone) => `${m.label} · ${formatDateBR(m.date)} · ${relativeDays(m.diasRestantes)}`;

  return (
    <div data-testid={testId} style={{ position: 'relative', margin: '22px 12px 0 8px' }}>
      <div
        ref={barRef}
        role="img"
        aria-label={`${Math.round(lifeline.todayPct)}% da vigência consumida.${nextText ? ` Próximo marco: ${nextText}.` : ''}${totalTermos ? ` ${totalTermos} termos registrados.` : ''}`}
        style={{ position: 'relative', height: '6px', borderRadius: '3px', background: '#dfe5ee' }}
      >
        <i style={{ position: 'absolute', inset: '0 auto 0 0', width: `${lifeline.todayPct}%`, background: fillColor, borderRadius: '3px' }} />

        {ticks.map((m) => (
          <span
            key={m.id}
            tabIndex={0}
            title={markerTitle(m)}
            aria-label={markerTitle(m)}
            style={{ position: 'absolute', left: `${m.pct}%`, top: '50%', width: '3px', height: '14px', transform: 'translate(-50%, -50%)', background: COLORS.tick, borderRadius: '1px' }}
          />
        ))}

        {next && !mergedWithEnd && (
          <span
            tabIndex={0}
            title={markerTitle(next)}
            aria-label={markerTitle(next)}
            style={{
              position: 'absolute',
              left: `${next.pct}%`,
              top: '50%',
              width: '14px',
              height: '14px',
              boxSizing: 'border-box',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `3px solid ${nextColor}`,
              background: '#ffffff',
              zIndex: 2
            }}
          />
        )}

        {termos.map((cluster) => (
          <span
            key={`${cluster.date}-${cluster.pct}`}
            role="img"
            tabIndex={0}
            title={cluster.labels.join('\n')}
            aria-label={cluster.labels.join('; ')}
            style={{
              position: 'absolute',
              left: `${cluster.pct}%`,
              top: '50%',
              width: '9px',
              height: '9px',
              zIndex: 1,
              boxSizing: 'border-box',
              transform: 'translate(-50%, -50%) rotate(45deg)',
              background: COLORS.brand,
              border: '1.5px solid #ffffff'
            }}
          >
            {cluster.count > 1 && (
              <span style={{ position: 'absolute', left: '9px', top: '-12px', transform: 'rotate(-45deg)', fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>
                {cluster.count}
              </span>
            )}
          </span>
        ))}

        <span
          tabIndex={mergedWithEnd ? 0 : undefined}
          title={mergedWithEnd && next ? `Fim da vigência · ${formatDateBR(lifeline.end)}. ${markerTitle(next)}` : `Fim da vigência · ${formatDateBR(lifeline.end)}`}
          style={{
            position: 'absolute',
            right: mergedWithEnd ? '-12px' : '-10px',
            top: '50%',
            width: mergedWithEnd ? '14px' : '10px',
            height: mergedWithEnd ? '14px' : '10px',
            boxSizing: 'border-box',
            transform: 'translateY(-50%)',
            background: COLORS.ink,
            borderRadius: '2px',
            ...(mergedWithEnd ? { border: `3px solid ${nextColor}` } : {})
          }}
        />

        {showToday && (
          <span style={{ position: 'absolute', left: `${lifeline.todayPct}%`, top: '-7px', width: '2px', height: '20px', transform: 'translateX(-50%)', background: COLORS.ink }}>
            <b
              style={{
                position: 'absolute',
                bottom: '22px',
                fontSize: '0.75rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: COLORS.ink,
                ...(lifeline.todayPct > 85 ? { right: '-2px' } : { left: '50%', transform: 'translateX(-50%)' })
              }}
            >
              Hoje
            </b>
          </span>
        )}
      </div>

      {(leftNote || nextText) && (
        <div className="lifeline-notes" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px', fontSize: '0.75rem', lineHeight: 1.2, color: COLORS.muted }}>
          {leftNote && <span style={{ flex: 'none', whiteSpace: 'nowrap' }}>{leftNote}</span>}
          {nextText && (
            <span
              title={nextText}
              style={{ minWidth: 0, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700, color: next?.state === 'PROXIMO' ? '#b45309' : COLORS.inkSoft }}
            >
              {nextText}
            </span>
          )}
        </div>
      )}

      {/* Celular: sem hover, os marcos viram uma lista com nome, data e prazo. */}
      {milestones.length > 0 && (
        <ul className="lifeline-list" aria-label="Marcos da vigência">
          {milestones.map((m) => (
            <li key={m.id} data-next={m === next ? 'true' : undefined}>
              <span>{shortMilestoneLabel(m.label)} · {formatDateBR(m.date)}</span>
              <span>{relativeDays(m.diasRestantes)}</span>
            </li>
          ))}
          {totalTermos > 0 && (
            <li>
              <span>{totalTermos} {totalTermos === 1 ? 'termo registrado' : 'termos registrados'}</span>
              <span />
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

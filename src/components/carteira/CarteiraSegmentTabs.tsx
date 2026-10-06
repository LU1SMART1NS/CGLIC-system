export interface CarteiraSegment<T extends string> {
  id: T;
  label: string;
  count: number;
  /** Ponto colorido antes do rótulo (ex.: crítico, fila com pendência). */
  dot?: string;
  title?: string;
}

interface CarteiraSegmentTabsProps<T extends string> {
  segments: Array<CarteiraSegment<T>>;
  active: T;
  onSelect: (id: T) => void;
  /** Prefixo dos data-testid: `${testIdPrefix}-${id}`. */
  testIdPrefix: string;
  ariaLabel: string;
  /** Resumo curto à direita (ex.: "R$ 184,2 mi em valor vigente"). */
  meta?: string;
}

/**
 * Segmentos sublinhados com contagem (padrão "Open · Closed" das listas do GitHub/Jira): as situações das carteiras
 * e as filas da Central de Distribuição.
 */
export function CarteiraSegmentTabs<T extends string>({ segments, active, onSelect, testIdPrefix, ariaLabel, meta }: CarteiraSegmentTabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="ds-tabs-scroll"
      style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}
    >
      {segments.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            title={s.title}
            aria-pressed={on}
            onClick={() => onSelect(s.id)}
            data-testid={`${testIdPrefix}-${s.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.75rem',
              marginBottom: '-1px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--primary)' : 'transparent'}`,
              color: on ? '#0f172a' : '#64748b',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {s.dot && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />}
            {s.label}
            <span style={{ color: '#0f172a', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
          </button>
        );
      })}
      {meta && (
        <span style={{ marginLeft: 'auto', paddingLeft: '0.75rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      )}
    </div>
  );
}

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
 * Trilho segmentado com contagem (filtros da lista; o selecionado fica destacado enquanto estiver ativo): as situações das carteiras
 * e as filas da Central de Distribuição.
 */
export function CarteiraSegmentTabs<T extends string>({ segments, active, onSelect, testIdPrefix, ariaLabel, meta }: CarteiraSegmentTabsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="segment-pills">
      <div className="segment-pills__rail">
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
              className="segment-pill"
            >
              {s.dot && <span aria-hidden="true" className="segment-pill__dot" style={{ background: s.dot }} />}
              {s.label}
              <span className="segment-pill__count">{s.count}</span>
            </button>
          );
        })}
      </div>
      {meta && (
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      )}
    </div>
  );
}

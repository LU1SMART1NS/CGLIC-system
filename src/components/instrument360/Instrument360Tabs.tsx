import React from 'react';
import { ArrowUp } from 'lucide-react';
import { useScrollActiveTab } from '../../design-system/hooks/useScrollActiveTab';
import { InstrumentAlertBadge, InstrumentStatusBadge } from './Instrument360Badges';
import { scrollToSummary, useHeroOutOfView, useInstrument360Dock } from './instrument360Dock';

export interface Instrument360TabDef<T extends string> {
  id: T;
  label: string;
}

interface Instrument360TabsProps<T extends string> {
  tabs: Instrument360TabDef<T>[];
  active: T;
  onSelect: (tab: T) => void;
  /** Prefixo de ids/aria (ex.: "contract" → contract-tab-acoes / contract-tabpanel-acoes). */
  idPrefix: string;
  ariaLabel: string;
}

/**
 * Barra de abas das telas 360 (Ata, Contrato e Item). Gruda no alto, logo abaixo do cabeçalho do sistema,
 * quando o cartão do topo sai da vista; aí ganha à esquerda a seta e a identidade compacta do instrumento,
 * que levam de volta ao cartão. Com o cartão à vista, é a linha de abas de sempre.
 */
export const Instrument360Tabs = React.forwardRef(function Instrument360Tabs<T extends string>(
  { tabs, active, onSelect, idPrefix, ariaLabel }: Instrument360TabsProps<T>,
  ref: React.Ref<HTMLDivElement>
) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  useScrollActiveTab(listRef, active);
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref]
  );
  const dock = useInstrument360Dock();
  const summary = dock?.summary ?? null;
  const stuck = useHeroOutOfView(dock?.heroEl ?? null);
  const showMini = stuck && summary !== null;
  return (
    <>
      {/* Marca o ponto onde a barra fica antes de grudar: é para onde a rolagem das abas aponta. */}
      <div data-i360-dock-anchor="" aria-hidden="true" style={{ height: 0 }} />
      <div className="i360-dock" data-i360-dock="" data-stuck={showMini ? 'true' : undefined}>
        <div className="i360-dock-row">
          {showMini && summary && (
            <div className="i360-dock-mini" data-testid="instrument-dock-mini">
              <button type="button" className="i360-dock-up" onClick={scrollToSummary} aria-label="Voltar ao resumo" title="Voltar ao resumo">
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="i360-dock-id"
                onClick={scrollToSummary}
                title="Voltar ao resumo"
                aria-label={`Voltar ao resumo de ${summary.title}`}
              >
                <span className="i360-dock-title">{summary.title}</span>
                {summary.status && <InstrumentStatusBadge status={summary.status} compact />}
                {summary.alert && <InstrumentAlertBadge compact>{summary.alert}</InstrumentAlertBadge>}
                {summary.subtitle && <span className="i360-dock-sub">{summary.subtitle}</span>}
              </button>
            </div>
          )}
          <div
            ref={setRefs}
            className="ds-tabs-scroll i360-dock-tabs"
            role="tablist"
            aria-label={ariaLabel}
            style={{
              display: 'flex',
              gap: '0.25rem',
              ['--scroll-bg' as string]: showMini ? '#ffffff' : '#f8fafc',
              borderBottom: '1px solid #e2e8f0'
            }}
          >
            {tabs.map((tab) => {
              const selected = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`${idPrefix}-tabpanel-${tab.id}`}
                  onClick={() => onSelect(tab.id)}
                  style={{
                    padding: '0.6rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `3px solid ${selected ? '#0c326f' : 'transparent'}`,
                    marginBottom: '-1px',
                    color: selected ? '#0c326f' : '#475569',
                    fontWeight: selected ? 800 : 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}) as <T extends string>(props: Instrument360TabsProps<T> & { ref?: React.Ref<HTMLDivElement> }) => React.ReactElement;

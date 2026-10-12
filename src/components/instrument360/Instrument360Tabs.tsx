import React from 'react';
import { useScrollActiveTab } from '../../design-system/hooks/useScrollActiveTab';

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
 * Linha de abas das telas 360 (Ata, Contrato e Item). Fica dentro do `Instrument360Head`, logo abaixo do
 * cartão do topo; com o cartão encolhido, as abas viram pastas encostadas na base da faixa azul.
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
  return (
    <div
      ref={setRefs}
      className="ds-tabs-scroll i360-tabs"
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: '0.25rem',
        ['--scroll-bg' as string]: '#eef3fb'
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
            className="i360-tab"
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom: `3px solid ${selected ? 'var(--primary)' : 'transparent'}`,
              marginBottom: '-2px',
              color: selected ? 'var(--primary)' : '#475569',
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
  );
}) as <T extends string>(props: Instrument360TabsProps<T> & { ref?: React.Ref<HTMLDivElement> }) => React.ReactElement;

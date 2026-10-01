import React from 'react';

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

/** Barra de abas das telas 360 (Contrato e Ata). */
export const Instrument360Tabs = React.forwardRef(function Instrument360Tabs<T extends string>(
  { tabs, active, onSelect, idPrefix, ariaLabel }: Instrument360TabsProps<T>,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: '0.25rem',
        flexWrap: 'wrap',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '1.25rem',
        scrollMarginTop: '1rem'
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
  );
}) as <T extends string>(props: Instrument360TabsProps<T> & { ref?: React.Ref<HTMLDivElement> }) => React.ReactElement;

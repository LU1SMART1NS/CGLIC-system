import React from 'react';

export type GestaoInstrumentosCategoryTab =
  | 'TODAS'
  | 'VENCIMENTOS'
  | 'SALDOS'
  | 'REAJUSTES'
  | 'PAGAMENTOS'
  | 'TAREFAS';

interface TabDef {
  id: GestaoInstrumentosCategoryTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'VENCIMENTOS', label: 'Vencimentos' },
  { id: 'SALDOS', label: 'Saldos' },
  { id: 'REAJUSTES', label: 'Reajustes' },
  { id: 'PAGAMENTOS', label: 'Pagamentos' },
  { id: 'TAREFAS', label: 'Tarefas' }
];

interface GestaoInstrumentosCategoryTabsProps {
  counts: Record<GestaoInstrumentosCategoryTab, number>;
  active: GestaoInstrumentosCategoryTab;
  onSelect: (tab: GestaoInstrumentosCategoryTab) => void;
}

export const GestaoInstrumentosCategoryTabs: React.FC<GestaoInstrumentosCategoryTabsProps> = ({
  counts,
  active,
  onSelect
}) => {
  return (
    <div
      role="tablist"
      aria-label="Filtrar por categoria de atenção"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            data-testid={`instrumentos-tab-${tab.id.toLowerCase()}`}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '999px',
              border: isActive ? '1px solid #0c326f' : '1px solid #e2e8f0',
              background: isActive ? '#0c326f' : '#ffffff',
              color: isActive ? '#ffffff' : '#475569',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label} ({counts[tab.id] ?? 0})
          </button>
        );
      })}
    </div>
  );
};

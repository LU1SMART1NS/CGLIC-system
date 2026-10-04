import React from 'react';
import { useScrollActiveTab } from '../../design-system/hooks/useScrollActiveTab';

export type GestaoInstrumentosCategoryTab =
  | 'TODAS'
  | 'SALDOS'
  | 'REAJUSTES'
  | 'PAGAMENTOS'
  | 'TAREFAS'
  | 'LEMBRETES';

interface TabDef {
  id: GestaoInstrumentosCategoryTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'SALDOS', label: 'Saldos' },
  { id: 'REAJUSTES', label: 'Reajustes' },
  { id: 'PAGAMENTOS', label: 'Pagamentos' },
  { id: 'TAREFAS', label: 'Tarefas' },
  { id: 'LEMBRETES', label: 'Lembretes' }
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
  const listRef = React.useRef<HTMLDivElement>(null);
  useScrollActiveTab(listRef, active);
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Filtrar por categoria de atenção"
      className="ds-tabs-scroll"
      style={{
        display: 'flex',
        gap: '0.25rem',
        borderBottom: '1px solid #e2e8f0',
        ['--scroll-bg' as string]: '#f8fafc'
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
              padding: '0.5rem 0.9rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isActive ? '#0c326f' : 'transparent'}`,
              marginBottom: '-1px',
              color: isActive ? '#0c326f' : '#475569',
              fontSize: '0.82rem',
              fontWeight: isActive ? 800 : 600,
              cursor: 'pointer',
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

import React from 'react';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';

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

/** Categorias da Visão Geral no mesmo trilho das carteiras. */
export const GestaoInstrumentosCategoryTabs: React.FC<GestaoInstrumentosCategoryTabsProps> = ({
  counts,
  active,
  onSelect
}) => (
  <CarteiraSegmentTabs
    segments={TABS.map((tab) => ({ ...tab, count: counts[tab.id] ?? 0 }))}
    active={active}
    onSelect={onSelect}
    testIdPrefix="instrumentos-tab"
    ariaLabel="Filtrar por categoria de atenção"
  />
);

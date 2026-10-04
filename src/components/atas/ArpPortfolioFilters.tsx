import React from 'react';
import { carteiraSelect } from '../carteira/carteiraStyles';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES } from '../carteira/carteiraGestor';
import type { ArpVigenciaFilterOption } from './ArpPortfolioSummary';
import { VIGENCIA_RULES } from '../../config/alertRules';

export interface ArpPortfolioFilterState {
  statusVigencia: ArpVigenciaFilterOption;
  filtroAlocacao: 'TODAS' | 'SIM' | 'NAO';
  filtroEmpenho: 'TODAS' | 'SIM' | 'NAO';
  /** Nome do gestor ('TODOS' = sem filtro; '__SEM_GESTOR__' = atas sem gestor atribuído). */
  gestor: string;
  busca: string;
}

export const ARP_FILTER_SCHEMA: CarteiraFilterSchema<ArpPortfolioFilterState> = {
  statusVigencia: { param: 'situacao', default: 'VIGENTES', values: ['TODOS', 'VIGENTES', 'CRITICO', 'ATENCAO', 'HISTORICO'] },
  filtroAlocacao: { param: 'alocacao', default: 'TODAS', values: ['TODAS', 'SIM', 'NAO'] },
  filtroEmpenho: { param: 'empenho', default: 'TODAS', values: ['TODAS', 'SIM', 'NAO'] },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

export const DEFAULT_ARP_FILTERS: ArpPortfolioFilterState = {
  statusVigencia: 'VIGENTES',
  filtroAlocacao: 'TODAS',
  filtroEmpenho: 'TODAS',
  gestor: TODOS_GESTORES,
  busca: ''
};

interface ArpPortfolioFiltersProps {
  filters: ArpPortfolioFilterState;
  gestores?: string[];
  /** Esconde o seletor de gestor (perfil "gestor", que já vê só as próprias atas). */
  showGestorFilter?: boolean;
  onChangeFilter: <K extends keyof ArpPortfolioFilterState>(key: K, value: ArpPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalAtas: number;
}

export const ArpPortfolioFilters: React.FC<ArpPortfolioFiltersProps> = ({
  filters,
  gestores = [],
  showGestorFilter = true,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalAtas
}) => {
  const hasActiveFilters = hasActiveCarteiraFilters(ARP_FILTER_SCHEMA, filters);

  return (
    <CarteiraFilterBar
      busca={filters.busca}
      searchPlaceholder="Buscar por Ata, fornecedor, CNPJ, item..."
      onChangeBusca={(value) => onChangeFilter('busca', value)}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={onResetFilters}
      counter={carteiraCounter(totalFiltered, totalAtas, hasActiveFilters, 'Ata', 'Atas')}
      testIdPrefix="arp"
    >
      <select
        value={filters.statusVigencia}
        onChange={(e) => onChangeFilter('statusVigencia', e.target.value as ArpVigenciaFilterOption)}
        data-testid="arp-filter-vigencia"
        style={carteiraSelect}
      >
        <option value="TODOS">Todas as Vigências</option>
        <option value="VIGENTES">Vigentes</option>
        <option value="CRITICO">Crítico (≤{VIGENCIA_RULES.faixaCriticoAteDias} dias)</option>
        <option value="ATENCAO">Atenção ({VIGENCIA_RULES.faixaCriticoAteDias + 1}–{VIGENCIA_RULES.faixaAtencaoAteDias} dias)</option>
        <option value="HISTORICO">Histórico</option>
      </select>

      <select
        value={filters.filtroAlocacao}
        onChange={(e) => onChangeFilter('filtroAlocacao', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
        data-testid="arp-filter-alocacao"
        style={carteiraSelect}
      >
        <option value="TODAS">Alocação (Todas)</option>
        <option value="SIM">Com Alocação</option>
        <option value="NAO">Sem Alocação</option>
      </select>

      <select
        value={filters.filtroEmpenho}
        onChange={(e) => onChangeFilter('filtroEmpenho', e.target.value as 'TODAS' | 'SIM' | 'NAO')}
        data-testid="arp-filter-empenho"
        style={carteiraSelect}
      >
        <option value="TODAS">Empenho (Todos)</option>
        <option value="SIM">Com Empenho</option>
        <option value="NAO">Sem Empenho</option>
      </select>

      {showGestorFilter && (
        <CarteiraGestorSelect
          value={filters.gestor}
          gestores={gestores}
          onChange={(value) => onChangeFilter('gestor', value)}
          testId="arp-filter-gestor"
        />
      )}
    </CarteiraFilterBar>
  );
};

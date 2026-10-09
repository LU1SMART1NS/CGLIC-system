import React from 'react';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters } from '../carteira/carteiraFilters';
import { CarteiraAlocacaoSelect, CarteiraEmpenhoSelect, CarteiraUnidadeSelect } from '../carteira/CarteiraExecucaoSelects';
import { ARP_FILTER_SCHEMA, type ArpPortfolioFilterState } from '../atas/ArpPortfolioFilters';
import type { NivelAtendimento } from '../../utils/itemAtendimento';
import { CarteiraPapelSelect } from '../carteira/CarteiraPapelSelect';
import type { FiltroPapelSenasp } from '../../utils/ataIdentidade';

/**
 * A aba Itens usa os mesmos filtros e os mesmos parâmetros de URL da aba Atas
 * (?situacao=&alocacao=&empenho=&unidade=&gestor=&papel=&busca=), então os filtros acompanham a troca de aba.
 */
export const ITENS_FILTER_SCHEMA = ARP_FILTER_SCHEMA;
export type ItensPortfolioFilterState = ArpPortfolioFilterState;

interface ItensPortfolioFiltersProps {
  filters: ItensPortfolioFilterState;
  gestores?: string[];
  unidades?: Array<{ chave: string; nome: string }>;
  /** Quantos itens cada nível de alocação / empenho traria (aparece no menu do filtro). */
  alocacaoCounts?: Partial<Record<NivelAtendimento, number>>;
  empenhoCounts?: Partial<Record<NivelAtendimento, number>>;
  /** Quantos itens cada papel da SENASP traria (aparece no menu do filtro). */
  papelCounts?: Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>>;
  /** Esconde o seletor de gestor (perfil "gestor", que já vê só os itens das próprias atas). */
  showGestorFilter?: boolean;
  onChangeFilter: <K extends keyof ItensPortfolioFilterState>(key: K, value: ItensPortfolioFilterState[K]) => void;
  onResetFilters: () => void;
  totalFiltered: number;
  totalItens: number;
}

export const ItensPortfolioFilters: React.FC<ItensPortfolioFiltersProps> = ({
  filters,
  gestores = [],
  unidades = [],
  alocacaoCounts,
  empenhoCounts,
  papelCounts,
  showGestorFilter = true,
  onChangeFilter,
  onResetFilters,
  totalFiltered,
  totalItens
}) => {
  const hasActiveFilters = hasActiveCarteiraFilters(ITENS_FILTER_SCHEMA, filters);

  return (
    <CarteiraFilterBar
      busca={filters.busca}
      searchPlaceholder="Buscar por item, descrição, ata, fornecedor..."
      onChangeBusca={(value) => onChangeFilter('busca', value)}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={onResetFilters}
      counter={carteiraCounter(totalFiltered, totalItens, hasActiveFilters, 'item', 'itens')}
      testIdPrefix="itens"
    >
      <CarteiraAlocacaoSelect
        value={filters.filtroAlocacao}
        onChange={(value) => onChangeFilter('filtroAlocacao', value)}
        counts={alocacaoCounts}
        testId="itens-filter-alocacao"
      />

      <CarteiraEmpenhoSelect
        value={filters.filtroEmpenho}
        onChange={(value) => onChangeFilter('filtroEmpenho', value)}
        counts={empenhoCounts}
        testId="itens-filter-empenho"
      />

      <CarteiraUnidadeSelect
        value={filters.unidade}
        unidades={unidades}
        onChange={(value) => onChangeFilter('unidade', value)}
        testId="itens-filter-unidade"
      />

      <CarteiraPapelSelect
        value={filters.papel}
        onChange={(value) => onChangeFilter('papel', value)}
        counts={papelCounts}
        testId="itens-filter-papel"
      />

      {showGestorFilter && (
        <CarteiraGestorSelect
          value={filters.gestor}
          gestores={gestores}
          onChange={(value) => onChangeFilter('gestor', value)}
          testId="itens-filter-gestor"
        />
      )}
    </CarteiraFilterBar>
  );
};

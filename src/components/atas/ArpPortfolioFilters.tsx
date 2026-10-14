import React from 'react';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES } from '../carteira/carteiraGestor';
import type { ArpVigenciaFilterOption } from './ArpPortfolioSummary';
import {
  CarteiraAlocacaoSelect,
  CarteiraAtaAssinadaSelect,
  FILTRO_ATA_ASSINADA_VALUES,
  type FiltroAtaAssinada,
  CarteiraEmpenhoSelect,
  CarteiraUnidadeSelect,
  NIVEL_FILTER_VALUES,
  TODAS_UNIDADES
} from '../carteira/CarteiraExecucaoSelects';
import type { FiltroNivel, NivelAtendimento } from '../../utils/itemAtendimento';
import { CarteiraPapelSelect } from '../carteira/CarteiraPapelSelect';
import { FILTRO_PAPEL_VALUES, type FiltroPapelSenasp } from '../../utils/ataIdentidade';

export interface ArpPortfolioFilterState {
  statusVigencia: ArpVigenciaFilterOption;
  /** Alocação interna da ata, somada dos itens, contra o quantitativo SENASP. */
  filtroAlocacao: FiltroNivel;
  /** Empenho da ata, somado dos itens, contra a quantidade contratada. */
  filtroEmpenho: FiltroNivel;
  /** Unidade interna (nome normalizado; 'TODAS' = sem filtro). */
  unidade: string;
  /** Qtd. da ata assinada a informar ou informada (migration 116). */
  ataAssinada: FiltroAtaAssinada;
  /** Nome do gestor ('TODOS' = sem filtro; '__SEM_GESTOR__' = atas sem gestor atribuído). */
  gestor: string;
  /** Papel da SENASP na ata: gerenciada pela CGLIC ou de outro órgão (participante ou adesão, migration 106). */
  papel: FiltroPapelSenasp;
  busca: string;
}

export const ARP_FILTER_SCHEMA: CarteiraFilterSchema<ArpPortfolioFilterState> = {
  statusVigencia: { param: 'situacao', default: 'VIGENTES', values: ['TODOS', 'VIGENTES', 'CRITICO', 'ATENCAO', 'HISTORICO'] },
  filtroAlocacao: { param: 'alocacao', default: 'TODOS', values: NIVEL_FILTER_VALUES },
  filtroEmpenho: { param: 'empenho', default: 'TODOS', values: NIVEL_FILTER_VALUES },
  unidade: { param: 'unidade', default: TODAS_UNIDADES },
  ataAssinada: { param: 'assinada', default: 'TODOS', values: FILTRO_ATA_ASSINADA_VALUES },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  papel: { param: 'papel', default: 'TODOS', values: FILTRO_PAPEL_VALUES },
  busca: { param: 'busca', default: '' }
};

export const DEFAULT_ARP_FILTERS: ArpPortfolioFilterState = {
  statusVigencia: 'VIGENTES',
  filtroAlocacao: 'TODOS',
  filtroEmpenho: 'TODOS',
  unidade: TODAS_UNIDADES,
  ataAssinada: 'TODOS',
  gestor: TODOS_GESTORES,
  papel: 'TODOS',
  busca: ''
};

interface ArpPortfolioFiltersProps {
  filters: ArpPortfolioFilterState;
  gestores?: string[];
  /** Unidades internas com alocação (opções do seletor). */
  unidades?: Array<{ chave: string; nome: string }>;
  /** Quantas atas cada nível de alocação / empenho traria (aparece no menu do filtro). */
  alocacaoCounts?: Partial<Record<NivelAtendimento, number>>;
  empenhoCounts?: Partial<Record<NivelAtendimento, number>>;
  /** Quantas atas cada situação da qtd. da ata assinada traria (aparece no menu do filtro). */
  ataAssinadaCounts?: Partial<Record<Exclude<FiltroAtaAssinada, 'TODOS'>, number>>;
  /** Quantas atas cada papel da SENASP traria (aparece no menu do filtro). */
  papelCounts?: Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>>;
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
  unidades = [],
  alocacaoCounts,
  empenhoCounts,
  ataAssinadaCounts,
  papelCounts,
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
      <CarteiraAlocacaoSelect
        value={filters.filtroAlocacao}
        onChange={(value) => onChangeFilter('filtroAlocacao', value)}
        counts={alocacaoCounts}
        testId="arp-filter-alocacao"
      />

      <CarteiraEmpenhoSelect
        value={filters.filtroEmpenho}
        onChange={(value) => onChangeFilter('filtroEmpenho', value)}
        counts={empenhoCounts}
        testId="arp-filter-empenho"
      />

      <CarteiraUnidadeSelect
        value={filters.unidade}
        unidades={unidades}
        onChange={(value) => onChangeFilter('unidade', value)}
        testId="arp-filter-unidade"
      />

      <CarteiraAtaAssinadaSelect
        value={filters.ataAssinada}
        onChange={(value) => onChangeFilter('ataAssinada', value)}
        counts={ataAssinadaCounts}
        testId="arp-filter-ata-assinada"
      />

      <CarteiraPapelSelect
        value={filters.papel}
        onChange={(value) => onChangeFilter('papel', value)}
        counts={papelCounts}
        testId="arp-filter-papel"
      />

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

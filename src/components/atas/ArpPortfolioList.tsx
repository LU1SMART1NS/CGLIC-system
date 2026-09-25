import React from 'react';
import { RotateCcw } from 'lucide-react';
import { AtaCard } from '../cards/AtaCard';
import { AtaCardSkeleton } from '../cards/AtaCardSkeleton';
import { EmptyState } from '../../design-system/components/EmptyState';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';

interface ArpPortfolioListProps {
  cards: AtaGroupedCard[];
  totalAtas: number;
  isLoading?: boolean;
  itemsLoadingByAta?: Record<string, boolean>;
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onResetFilters: () => void;
}

export const ArpPortfolioList: React.FC<ArpPortfolioListProps> = ({
  cards,
  totalAtas,
  isLoading = false,
  itemsLoadingByAta = {},
  onSelectArp,
  onSelectItem,
  onResetFilters
}) => {
  if (isLoading && totalAtas === 0) {
    return (
      <div className="ata-cards-container" aria-busy="true" aria-label="Carregando atas...">
        <AtaCardSkeleton />
        <AtaCardSkeleton />
        <AtaCardSkeleton />
      </div>
    );
  }

  if (totalAtas === 0) {
    return (
      <EmptyState
        title="Nenhuma Ata de Registro de Preços encontrada."
        description="Não há atas sincronizadas ou cadastradas para a unidade gerenciadora atual."
      />
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          Nenhuma Ata corresponde aos filtros aplicados.
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Altere os critérios selecionados ou limpe os filtros para visualizar a carteira completa de Atas.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.85rem',
            background: '#0c326f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} /> Limpar Filtros
        </button>
      </div>
    );
  }

  return (
    <div className="ata-cards-container" role="feed" aria-label="Lista de Atas de Registro de Preços">
      {cards.map((card) => {
        const ataKey = `${card.arp.numeroAtaRegistroPreco}-${card.arp.codigoUnidadeGerenciadora}`;
        const isCardLoading = Boolean(itemsLoadingByAta[ataKey]);

        return (
          <AtaCard
            key={card.key}
            card={card}
            isLoading={isCardLoading}
            onSelectArp={onSelectArp}
            onSelectItem={onSelectItem}
          />
        );
      })}
    </div>
  );
};

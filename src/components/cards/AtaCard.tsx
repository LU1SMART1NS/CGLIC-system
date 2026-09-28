import React from 'react';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';
import { AtaCardHeader } from './AtaCardHeader';
import { AtaItemList } from './AtaItemList';
import { AtaManagerSelector } from './AtaManagerSelector';

interface AtaCardProps {
  card: AtaGroupedCard;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onSelectArp?: (arp: ArpRecord) => void;
  isLoading?: boolean;
}

export const AtaCard: React.FC<AtaCardProps> = ({
  card,
  onSelectItem,
  isLoading = false
}) => {
  const { arp, fornecedorNome, fornecedorCnpj, adesaoStatus, itens } = card;

  return (
    <article className="ata-card" aria-label={`Ata ${arp.numeroAtaRegistroPreco} - Fornecedor ${fornecedorNome}`}>
      {/* Header */}
      <AtaCardHeader
        arp={arp}
        fornecedorNome={fornecedorNome}
        fornecedorCnpj={fornecedorCnpj}
        adesaoStatus={adesaoStatus}
      />

      <div style={{ padding: '0 1rem 0.75rem' }}>
        <AtaManagerSelector ataKey={arp.numeroAtaRegistroPreco} />
      </div>

      {/* Item List */}
      <AtaItemList
        itens={itens}
        isLoading={isLoading}
        onSelectItem={(item) => onSelectItem(arp, item)}
      />
    </article>
  );
};

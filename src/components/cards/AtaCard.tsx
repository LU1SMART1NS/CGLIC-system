import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';
import { buildAtaKey } from '../../hooks/useAta';
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
  const navigate = useNavigate();

  return (
    <article className="ata-card" aria-label={`Ata ${arp.numeroAtaRegistroPreco} - Fornecedor ${fornecedorNome}`}>
      {/* Header */}
      <AtaCardHeader
        arp={arp}
        fornecedorNome={fornecedorNome}
        fornecedorCnpj={fornecedorCnpj}
        adesaoStatus={adesaoStatus}
      />

      <div className="ata-card-manager-row">
        <AtaManagerSelector ataKey={arp.numeroAtaRegistroPreco} />
        <button
          type="button"
          onClick={() => navigate(`/atas/detalhe/${encodeURIComponent(buildAtaKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora))}`)}
          data-testid={`ata-360-link-${arp.numeroAtaRegistroPreco}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.4rem 0.75rem',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#0c326f',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          Ver Detalhes 360° <ArrowRight size={13} />
        </button>
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

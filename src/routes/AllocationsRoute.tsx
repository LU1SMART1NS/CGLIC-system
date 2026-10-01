import React from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalAllocationsDashboard } from '../components/InternalAllocationsDashboard';
import { buildAtaItemPath } from '../hooks/useAta';
import type { ArpRecord, ArpItemRecord } from '../types';

export const AllocationsRoute: React.FC = () => {
  const navigate = useNavigate();
  const handleSelectItem = (arp: ArpRecord, item: ArpItemRecord) => {
    navigate(buildAtaItemPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem));
  };

  return (
    <InternalAllocationsDashboard
      onSelectItem={handleSelectItem}
    />
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalAllocationsDashboard } from '../components/InternalAllocationsDashboard';
import { useSelection } from '../context/SelectionContext';
import type { ArpRecord, ArpItemRecord } from '../types';

export const AllocationsRoute: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedArp, setSelectedItem } = useSelection();

  const handleSelectItem = (arp: ArpRecord, item: ArpItemRecord) => {
    setSelectedArp(arp);
    setSelectedItem(item);
    navigate('/atas/itens/saldo');
  };

  return (
    <InternalAllocationsDashboard
      onBack={() => navigate('/atas')}
      onSelectItem={handleSelectItem}
    />
  );
};

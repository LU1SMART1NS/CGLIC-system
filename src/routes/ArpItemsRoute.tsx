import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArpItems } from '../components/ArpItems';
import { useSelection } from '../context/SelectionContext';
import type { ArpItemRecord } from '../types';

export const ArpItemsRoute: React.FC = () => {
  const navigate = useNavigate();
  const { selectedArp, setSelectedItem } = useSelection();

  if (!selectedArp) {
    return <Navigate to="/atas" replace />;
  }

  const handleSelectItem = (item: ArpItemRecord) => {
    setSelectedItem(item);
    navigate('/atas/itens/saldo');
  };

  return (
    <ArpItems
      arp={selectedArp}
      onSelectItem={handleSelectItem}
      onBack={() => navigate('/atas')}
    />
  );
};

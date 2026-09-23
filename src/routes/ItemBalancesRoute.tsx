import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ItemBalances } from '../components/ItemBalances';
import { useSelection } from '../context/SelectionContext';

export const ItemBalancesRoute: React.FC = () => {
  const navigate = useNavigate();
  const { selectedArp, selectedItem } = useSelection();

  if (!selectedArp || !selectedItem) {
    return <Navigate to="/atas" replace />;
  }

  return (
    <ItemBalances
      arp={selectedArp}
      item={selectedItem}
      onBack={() => navigate('/atas/itens')}
    />
  );
};

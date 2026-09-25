import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArpSearch } from '../components/ArpSearch';
import { useSelection } from '../context/SelectionContext';
import type { ArpRecord, ArpItemRecord } from '../types';

export const ArpSearchRoute: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedArp, setSelectedItem, setGlobalArps, setGlobalItemsByAta } = useSelection();

  const handleSelectArp = (arp: ArpRecord) => {
    setSelectedArp(arp);
    navigate('/atas/itens');
  };

  const handleSelectItemFromSearch = (arp: ArpRecord, item: ArpItemRecord) => {
    setSelectedArp(arp);
    setSelectedItem(item);
    navigate('/atas/itens/saldo');
  };

  return (
    <ArpSearch
      onSelectArp={handleSelectArp}
      onSelectItem={handleSelectItemFromSearch}
      onArpsLoaded={(loadedArps, loadedItems) => {
        setGlobalArps(loadedArps);
        if (loadedItems) setGlobalItemsByAta(loadedItems);
      }}
    />
  );
};

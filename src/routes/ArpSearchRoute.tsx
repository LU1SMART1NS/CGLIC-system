import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArpSearch } from '../components/ArpSearch';
import { useSelection } from '../context/SelectionContext';
import { buildAtaItemPath, buildAtaPath } from '../hooks/useAta';
import type { ArpRecord, ArpItemRecord } from '../types';

export const ArpSearchRoute: React.FC = () => {
  const navigate = useNavigate();
  const { setGlobalArps, setGlobalItemsByAta } = useSelection();

  const handleSelectArp = (arp: ArpRecord) => {
    navigate(buildAtaPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora));
  };

  const handleSelectItemFromSearch = (arp: ArpRecord, item: ArpItemRecord) => {
    navigate(buildAtaItemPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem));
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

import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useNavigateWithOrigin } from '../hooks/useDetailOrigin';
import { ArpSearch } from '../components/ArpSearch';
import { useSelection } from '../context/SelectionContext';
import { buildAtaItemPath, buildAtaPath } from '../hooks/useAta';
import type { ArpRecord, ArpItemRecord } from '../types';

export const ArpSearchRoute: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { setGlobalArps, setGlobalItemsByAta } = useSelection();
  const [searchParams] = useSearchParams();

  const handleSelectArp = (arp: ArpRecord) => {
    navigate(buildAtaPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora));
  };

  const handleSelectItemFromSearch = (arp: ArpRecord, item: ArpItemRecord) => {
    navigate(buildAtaItemPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem));
  };

  // Endereço antigo das atas a montar (?ver=montar): virou a aba Atas › A montar.
  if (searchParams.get('ver') === 'montar') return <Navigate to="/atas/montar" replace />;

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

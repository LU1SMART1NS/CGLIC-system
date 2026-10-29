import React from 'react';
import { useNavigateWithOrigin } from '../hooks/useDetailOrigin';
import { ArpSearch } from '../components/ArpSearch';
import { useSelection } from '../context/SelectionContext';
import { buildAtaItemPath, buildAtaPath } from '../hooks/useAta';
import type { ArpRecord, ArpItemRecord } from '../types';
import { usePodeMontarAta } from '../hooks/useAtasAMontar';
import { AtasAMontarLista } from '../components/atas/montar/AtasAMontarLista';
import { SeletorVerAtas } from '../components/atas/montar/VerAtas';
import { useVerAtas } from '../components/atas/montar/ataAMontarRotas';

export const ArpSearchRoute: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { setGlobalArps, setGlobalItemsByAta } = useSelection();
  // Atas a montar (D1/D8): só para quem monta a ata (gestor e coordenador); os outros perfis ficam nas registradas.
  const podeMontar = usePodeMontarAta();
  const [verDaUrl, setVer] = useVerAtas();
  const ver = podeMontar ? verDaUrl : 'registradas';

  const handleSelectArp = (arp: ArpRecord) => {
    navigate(buildAtaPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora));
  };

  const handleSelectItemFromSearch = (arp: ArpRecord, item: ArpItemRecord) => {
    navigate(buildAtaItemPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem));
  };

  if (ver === 'montar') return <AtasAMontarLista seletor={<SeletorVerAtas ver={ver} onSelect={setVer} />} />;

  return (
    <ArpSearch
      seletor={podeMontar ? (registradas) => <SeletorVerAtas ver={ver} onSelect={setVer} registradas={registradas} /> : undefined}
      onSelectArp={handleSelectArp}
      onSelectItem={handleSelectItemFromSearch}
      onArpsLoaded={(loadedArps, loadedItems) => {
        setGlobalArps(loadedArps);
        if (loadedItems) setGlobalItemsByAta(loadedItems);
      }}
    />
  );
};

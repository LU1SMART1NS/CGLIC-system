import React from 'react';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { useAtasAMontar } from '../../../hooks/useAtasAMontar';
import type { VerAtas } from './ataAMontarRotas';

/**
 * "Ver: Registradas · A montar" no cabeçalho da Carteira de Atas, como "Por ata · Por item" na Alocação. As atas a
 * montar não entram no trilho nem nas contagens das registradas.
 */
export const SeletorVerAtas: React.FC<{ ver: VerAtas; onSelect: (v: VerAtas) => void; registradas?: number }> = ({ ver, onSelect, registradas }) => {
  const { data: aMontar } = useAtasAMontar();
  return (
    <CarteiraSegmentTabs<VerAtas>
      testIdPrefix="atas-ver"
      ariaLabel="Ver atas"
      active={ver}
      onSelect={onSelect}
      segments={[
        { id: 'registradas', label: 'Registradas', count: registradas, title: 'Atas publicadas, com vigência, saldo e gestor' },
        { id: 'montar', label: 'A montar', count: aMontar?.length, title: 'Pregões homologados no PNCP ainda sem ata: quadros da ata para o SEI' }
      ]}
    />
  );
};

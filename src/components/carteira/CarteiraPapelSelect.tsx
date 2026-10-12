import React from 'react';
import { CarteiraFilterButton } from './CarteiraFilterButton';
import { FILTRO_PAPEL_LABEL, type FiltroPapelSenasp } from '../../utils/ataIdentidade';

/**
 * Filtro "Papel" das abas Atas e Itens (mesmo parâmetro ?papel= na URL): a SENASP é gerenciadora (atas da CGLIC),
 * participante ou fez adesão em ata de outro órgão (migration 106).
 */
export const CarteiraPapelSelect: React.FC<{
  value: FiltroPapelSenasp;
  onChange: (value: FiltroPapelSenasp) => void;
  counts?: Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>>;
  testId: string;
}> = ({ value, onChange, counts, testId }) => (
  <CarteiraFilterButton
    label="Papel"
    value={value}
    emptyValue="TODOS"
    options={(Object.keys(FILTRO_PAPEL_LABEL) as Array<Exclude<FiltroPapelSenasp, 'TODOS'>>).map((p) => ({
      value: p,
      label: FILTRO_PAPEL_LABEL[p],
      count: counts?.[p]
    }))}
    onChange={(v) => onChange(v as FiltroPapelSenasp)}
    testId={testId}
  />
);

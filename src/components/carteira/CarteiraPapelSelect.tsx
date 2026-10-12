import React from 'react';
import { CarteiraFilterButton } from './CarteiraFilterButton';
import { FILTRO_PAPEL_LABEL, type FiltroPapelSenasp } from '../../utils/ataIdentidade';

/**
 * Filtro "Papel da SENASP" das abas Atas e Itens (mesmo parâmetro ?papel= na URL): gerenciada pela CGLIC ou de
 * outro órgão em que a SENASP é participante ou fez adesão (migration 106).
 */
export const CarteiraPapelSelect: React.FC<{
  value: FiltroPapelSenasp;
  onChange: (value: FiltroPapelSenasp) => void;
  counts?: Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>>;
  testId: string;
}> = ({ value, onChange, counts, testId }) => (
  <CarteiraFilterButton
    label="Papel da SENASP"
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

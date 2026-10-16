import React from 'react';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import {
  GRUPO_GTI_INFO,
  GRUPOS_GTI,
  MODO_FILTRO_GTI_LABEL,
  MODO_FILTRO_GTI_VALUES,
  type FiltroGti,
  type GrupoGti,
  type ModoFiltroGti
} from '../../config/gruposGti';

/**
 * Filtro "GTI" da carteira de Atas (?gti=): o grupo e, com ele escolhido, como contar o interesse (?gtiConta=).
 * Padrão aprovado no protótipo de 15/10/2026: interesse principal (o grupo com a maior fatia da ata).
 */
export const CarteiraGtiSelect: React.FC<{
  gti: FiltroGti;
  modo: ModoFiltroGti;
  onChangeGti: (value: FiltroGti) => void;
  onChangeModo: (value: ModoFiltroGti) => void;
  counts?: Partial<Record<GrupoGti, number>>;
  testIdPrefix: string;
}> = ({ gti, modo, onChangeGti, onChangeModo, counts, testIdPrefix }) => (
  <>
    <CarteiraFilterButton
      label="GTI"
      value={gti}
      emptyValue="TODOS"
      options={GRUPOS_GTI.map((g) => ({ value: g, label: `${GRUPO_GTI_INFO[g].curto} · ${GRUPO_GTI_INFO[g].descricao}`, count: counts?.[g] }))}
      onChange={(v) => onChangeGti(v as FiltroGti)}
      testId={`${testIdPrefix}-filter-gti`}
    />
    {gti !== 'TODOS' && (
      <CarteiraFilterButton
        label="Contar"
        value={modo}
        // Sempre mostra o modo em uso (o padrão também): "Contar: Interesse principal". O × volta ao padrão.
        emptyValue=""
        options={MODO_FILTRO_GTI_VALUES.map((m) => ({ value: m, label: MODO_FILTRO_GTI_LABEL[m] }))}
        onChange={(v) => onChangeModo((MODO_FILTRO_GTI_VALUES as readonly string[]).includes(v) ? (v as ModoFiltroGti) : 'PRINCIPAL')}
        testId={`${testIdPrefix}-filter-gti-modo`}
      />
    )}
  </>
);

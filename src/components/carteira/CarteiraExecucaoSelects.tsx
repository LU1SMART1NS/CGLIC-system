import React from 'react';
import { CarteiraFilterButton } from './CarteiraFilterButton';
import {
  FILTRO_NIVEL_VALUES,
  NIVEL_ALOCACAO_LABEL,
  NIVEL_EMPENHO_LABEL,
  type FiltroNivel,
  type NivelAtendimento
} from '../../utils/itemAtendimento';

/** Valor do filtro de unidade sem filtro. Os demais valores são o nome da unidade normalizado (minúsculas). */
export const TODAS_UNIDADES = 'TODAS';

export const NIVEL_FILTER_VALUES = FILTRO_NIVEL_VALUES;

const NIVEIS: NivelAtendimento[] = ['TOTAL', 'PARCIAL', 'SEM'];

interface NivelSelectProps {
  value: FiltroNivel;
  onChange: (value: FiltroNivel) => void;
  testId: string;
  /** Quantos registros cada nível traria (aparece no menu). */
  counts?: Partial<Record<NivelAtendimento, number>>;
}

/** Filtro "Alocação": totalmente, parcialmente ou sem alocação (contra o quantitativo SENASP do item). */
export const CarteiraAlocacaoSelect: React.FC<NivelSelectProps> = ({ value, onChange, testId, counts }) => (
  <CarteiraFilterButton
    label="Alocação"
    value={value}
    emptyValue="TODOS"
    options={NIVEIS.map((n) => ({ value: n, label: NIVEL_ALOCACAO_LABEL[n], count: counts?.[n] }))}
    onChange={(v) => onChange(v as FiltroNivel)}
    testId={testId}
  />
);

/** Filtro "Empenho": totalmente, parcialmente ou sem empenho (contra a quantidade contratada do item). */
export const CarteiraEmpenhoSelect: React.FC<NivelSelectProps> = ({ value, onChange, testId, counts }) => (
  <CarteiraFilterButton
    label="Empenho"
    value={value}
    emptyValue="TODOS"
    options={NIVEIS.map((n) => ({ value: n, label: NIVEL_EMPENHO_LABEL[n], count: counts?.[n] }))}
    onChange={(v) => onChange(v as FiltroNivel)}
    testId={testId}
  />
);

interface UnidadeSelectProps {
  value: string;
  unidades: Array<{ chave: string; nome: string }>;
  onChange: (value: string) => void;
  testId: string;
}

/** Filtro de unidade interna. Uma unidade vinda da URL que não está na lista continua selecionável. */
export const CarteiraUnidadeSelect: React.FC<UnidadeSelectProps> = ({ value, unidades, onChange, testId }) => {
  const conhecida = value === TODAS_UNIDADES || unidades.some((u) => u.chave === value);
  const options = [
    ...(conhecida ? [] : [{ value, label: value }]),
    ...unidades.map((u) => ({ value: u.chave, label: u.nome }))
  ];
  return (
    <CarteiraFilterButton label="Unidade" value={value} emptyValue={TODAS_UNIDADES} options={options} onChange={onChange} testId={testId} />
  );
};

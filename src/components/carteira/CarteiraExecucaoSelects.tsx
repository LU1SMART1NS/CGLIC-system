import React from 'react';
import { CarteiraFilterButton } from './CarteiraFilterButton';
import {
  FILTRO_NIVEL_VALUES,
  type FiltroNivel,
  type NivelAtendimento
} from '../../utils/itemAtendimento';

/** Valor do filtro de unidade sem filtro. Os demais valores são o nome da unidade normalizado (minúsculas). */
export const TODAS_UNIDADES = 'TODAS';

export const NIVEL_FILTER_VALUES = FILTRO_NIVEL_VALUES;

const NIVEIS: NivelAtendimento[] = ['TOTAL', 'PARCIAL', 'SEM'];
/** Rótulos curtos dentro do menu: o nome do filtro ("Alocação", "Empenho") já diz do que se trata. */
const ALOCACAO_FILTRO_LABEL: Record<NivelAtendimento, string> = { TOTAL: 'Total', PARCIAL: 'Parcial', SEM: 'Nenhuma' };
const EMPENHO_FILTRO_LABEL: Record<NivelAtendimento, string> = { TOTAL: 'Total', PARCIAL: 'Parcial', SEM: 'Nenhum' };

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
    options={NIVEIS.map((n) => ({ value: n, label: ALOCACAO_FILTRO_LABEL[n], count: counts?.[n] }))}
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
    options={NIVEIS.map((n) => ({ value: n, label: EMPENHO_FILTRO_LABEL[n], count: counts?.[n] }))}
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

/** Filtro "Qtd. assinada" (migration 116): atas com a quantidade da ata assinada a informar ou já informada. */
export type FiltroAtaAssinada = 'TODOS' | 'A_INFORMAR' | 'INFORMADA';
export const FILTRO_ATA_ASSINADA_VALUES: readonly FiltroAtaAssinada[] = ['TODOS', 'A_INFORMAR', 'INFORMADA'];

interface AtaAssinadaSelectProps {
  value: FiltroAtaAssinada;
  onChange: (value: FiltroAtaAssinada) => void;
  testId: string;
  counts?: Partial<Record<Exclude<FiltroAtaAssinada, 'TODOS'>, number>>;
}

export const CarteiraAtaAssinadaSelect: React.FC<AtaAssinadaSelectProps> = ({ value, onChange, testId, counts }) => (
  <CarteiraFilterButton
    label="Qtd. assinada"
    value={value}
    emptyValue="TODOS"
    options={[
      { value: 'A_INFORMAR', label: 'A informar', count: counts?.A_INFORMAR },
      { value: 'INFORMADA', label: 'Informada', count: counts?.INFORMADA }
    ]}
    onChange={(v) => onChange(v as FiltroAtaAssinada)}
    testId={testId}
  />
);

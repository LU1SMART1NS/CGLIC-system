import React from 'react';
import { GtiTag } from '../gti/GtiVisual';
import { formatCurrency } from '../../utils/format';
import type { GrupoPrincipal } from '../../config/gruposGti';
import type { TotaisDasAtas } from './valorDasAtas';

const pctDe = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const separador = <span aria-hidden="true" style={{ color: '#cbd5e1' }}>·</span>;

/** Etiqueta da unidade interna, no mesmo formato da etiqueta do GTI (sem a cor). */
const UnidadeTag: React.FC<{ nome: string }> = ({ nome }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.1rem 0.5rem',
      borderRadius: '999px',
      border: '1px solid #e2e8f0',
      background: '#f8fafc',
      fontSize: '0.75rem',
      fontWeight: 800,
      color: '#0f172a',
      whiteSpace: 'nowrap'
    }}
  >
    {nome}
  </span>
);

interface FaixaProps {
  etiqueta: React.ReactNode;
  atas: number;
  rotulo: string;
  valor: number;
  base: number;
  rotuloBase: string;
  testId: string;
}

/** Uma linha acima da lista: quantas atas, o valor do filtro e a parte dele na base (valor total ou valor SENASP). */
const Faixa: React.FC<FaixaProps> = ({ etiqueta, atas, rotulo, valor, base, rotuloBase, testId }) => (
  <div
    data-testid={testId}
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: '0.6rem',
      rowGap: '0.3rem',
      padding: '0.6rem 0.9rem',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      fontSize: '0.82rem',
      color: '#334155',
      fontVariantNumeric: 'tabular-nums'
    }}
  >
    {etiqueta}
    <b style={{ color: '#0f172a' }}>
      {atas} {atas === 1 ? 'ata' : 'atas'}
    </b>
    {separador}
    <span>
      {rotulo} <b style={{ color: '#0f172a' }}>{formatCurrency(valor)}</b>
    </span>
    {separador}
    <span>
      {pctDe(valor, base)}% {rotuloBase} ({formatCurrency(base)})
    </span>
  </div>
);

/** GTI filtrado: quanto os órgãos dele registraram nas atas exibidas e a parte dele no valor total dessas atas. */
export const FaixaDoGti: React.FC<{ gti: GrupoPrincipal; totais: TotaisDasAtas }> = ({ gti, totais }) => (
  <Faixa
    etiqueta={<GtiTag grupo={gti} />}
    atas={totais.atas}
    rotulo="Registrado"
    valor={totais.registradoGti}
    base={totais.valorTotal}
    rotuloBase="do valor total das atas"
    testId="atas-valor-gti"
  />
);

/**
 * Unidade interna filtrada: quanto foi alocado a ela nas atas exibidas e a parte disso no valor SENASP dessas atas.
 * Com "Sem unidade", o que ainda falta alocar.
 */
export const FaixaDaUnidade: React.FC<{ nome: string; semUnidade?: boolean; totais: TotaisDasAtas }> = ({ nome, semUnidade = false, totais }) => (
  <Faixa
    etiqueta={<UnidadeTag nome={nome} />}
    atas={totais.atas}
    rotulo={semUnidade ? 'A alocar' : 'Alocado'}
    valor={totais.alocadoUnidade}
    base={totais.valorSenasp}
    rotuloBase="do valor SENASP das atas"
    testId="atas-valor-unidade"
  />
);

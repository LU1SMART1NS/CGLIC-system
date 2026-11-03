import React from 'react';
import { carteiraDetalhe, carteiraNumero } from '../../carteira/carteiraStyles';
import { formatCurrency } from '../../../utils/format';
import { dataBR } from '../../../utils/emendasKits';
import type { LinhaPainelSiop } from '../../../services/emendasService';

const soma = (linhas: LinhaPainelSiop[], campo: 'dotacaoInicial' | 'dotacaoAtual' | 'empenhado' | 'liquidado' | 'pago') =>
  linhas.some((l) => l[campo] != null) ? linhas.reduce((s, l) => s + (l[campo] ?? 0), 0) : null;
const valor = (v: number | null) => (v == null ? '—' : formatCurrency(v));

/** Modalidade, GND, natureza, localizador e unidade orçamentária (e o órgão, se a emenda tiver mais de um). */
function detalheDaLinha(l: LinhaPainelSiop, variosOrgaos: boolean): string {
  return [
    l.modalidade,
    l.gnd ? `GND ${l.gnd.replace(/^GND\s*/i, '')}` : null,
    l.naturezaDespesa,
    l.localizador,
    l.unidadeOrcamentaria,
    variosOrgaos ? l.orgao : null
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A emenda como está no Painel do Orçamento Federal do SIOP (migration 252), lida pelo servidor uma vez por dia, com
 * todos os agrupadores do painel: cada linha é a emenda numa ação, modalidade, GND, natureza de despesa e localizador. Só informação: o valor da emenda nas telas continua o registrado na
 * conferência; o painel ajuda a conferir sem abrir o SIOP.
 */
export const NoPainelDoSiop: React.FC<{ linhas: LinhaPainelSiop[]; valorRegistrado?: number | null }> = ({ linhas, valorRegistrado }) => {
  if (!linhas.length) return null;
  const variosOrgaos = new Set(linhas.map((l) => l.orgao)).size > 1;
  const base = linhas.map((l) => l.baseSiafiEm).filter(Boolean).sort().at(-1) ?? null;
  const celula: React.CSSProperties = { padding: '0.45rem 0.6rem', borderTop: '1px solid var(--color-border)', textAlign: 'right', whiteSpace: 'nowrap', ...carteiraNumero };
  const titulo: React.CSSProperties = { ...celula, textAlign: 'left', whiteSpace: 'normal' };
  const cab: React.CSSProperties = { ...celula, borderTop: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' };
  const total: React.CSSProperties = { ...celula, fontWeight: 700 };
  return (
    <div data-testid="emenda-360-painel-siop" style={{ display: 'grid', gap: '0.4rem' }}>
      <div style={{ fontWeight: 700 }}>
        No painel do SIOP{base ? <span style={carteiraDetalhe}> · base SIAFI de {dataBR(base)}</span> : null}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: '0.88rem' }}>
          <thead>
            <tr>
              <th style={{ ...cab, textAlign: 'left' }}>Linha da emenda no painel</th>
              <th style={cab}>Dotação inicial</th>
              <th style={cab}>Dotação atual</th>
              <th style={cab}>Empenhado</th>
              <th style={cab}>Liquidado</th>
              <th style={cab}>Pago</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td style={titulo}>
                  {l.acao ?? 'Ação não informada'}
                  <div style={carteiraDetalhe}>{detalheDaLinha(l, variosOrgaos)}</div>
                </td>
                <td style={celula}>{valor(l.dotacaoInicial)}</td>
                <td style={celula}>{valor(l.dotacaoAtual)}</td>
                <td style={celula}>{valor(l.empenhado)}</td>
                <td style={celula}>{valor(l.liquidado)}</td>
                <td style={celula}>{valor(l.pago)}</td>
              </tr>
            ))}
            {linhas.length > 1 && (
              <tr>
                <td style={{ ...titulo, fontWeight: 700 }}>Total da emenda</td>
                <td style={total}>{valor(soma(linhas, 'dotacaoInicial'))}</td>
                <td style={total}>{valor(soma(linhas, 'dotacaoAtual'))}</td>
                <td style={total}>{valor(soma(linhas, 'empenhado'))}</td>
                <td style={total}>{valor(soma(linhas, 'liquidado'))}</td>
                <td style={total}>{valor(soma(linhas, 'pago'))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={carteiraDetalhe}>
        Lido do Painel do Orçamento Federal uma vez por dia, só para conferência.
        {valorRegistrado != null ? ` O valor da emenda nas telas segue o registrado na conferência (${formatCurrency(valorRegistrado)}).` : ''}
      </div>
    </div>
  );
};

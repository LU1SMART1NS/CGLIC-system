import React from 'react';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { CarteiraNivelPill } from '../carteira/CarteiraNivelPill';
import { carteiraTd, carteiraTh, LARGURA_BARRA_CARTEIRA } from '../carteira/carteiraStyles';
import { saldoBarColor } from './ataSaldoStats';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { formatCurrency, formatNumber } from '../../utils/format';
import { NIVEL_ALOCACAO_LABEL, NIVEL_EMPENHO_LABEL } from '../../utils/itemAtendimento';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import type { ArpItemRecord } from '../../types';

/** Unidades mostradas por item; as demais viram "+N" (a lista inteira fica no título). */
export const MAX_UNIDADES_VISIVEIS = 3;

const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b' };
const forte: React.CSSProperties = { fontWeight: 800, fontVariantNumeric: 'tabular-nums' };
const fmtPct = (pct: number) => `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

const Barra: React.FC<{ pct: number }> = ({ pct }) => (
  <span style={{ display: 'block', width: LARGURA_BARRA_CARTEIRA, maxWidth: '100%', height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden', marginTop: '0.3rem' }}>
    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: saldoBarColor(pct) }} />
  </span>
);

/** Saldo SENASP: quanto ainda pode ser consumido (ou quanto passou, em vermelho), a barra e o percentual. */
const SaldoCelula: React.FC<{ linha?: CarteiraItemRow; pct: number | null }> = ({ linha, pct }) => {
  if (pct === null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const consumido = linha?.consumido;
  const saldo = linha && consumido != null ? linha.quantitativoSenasp - consumido : null;
  return (
    <div>
      {saldo === null ? (
        <span style={forte}>{fmtPct(pct)}</span>
      ) : saldo < 0 ? (
        <span style={{ ...forte, color: 'var(--color-danger-text)' }}>{formatNumber(-saldo)} un acima</span>
      ) : (
        <span>
          <span style={forte}>{formatNumber(saldo)}</span> <span style={pequeno}>un {saldo === 1 ? 'resta' : 'restam'}</span>
        </span>
      )}
      <Barra pct={pct} />
      {saldo !== null && <div style={{ ...pequeno, marginTop: '0.25rem' }}>{fmtPct(pct)} consumido</div>}
    </div>
  );
};

/** Alocação nas unidades internas: situação, quanto foi alocado e as unidades com a quantidade de cada uma. */
const AlocacaoCelula: React.FC<{ linha: CarteiraItemRow; nomeDaUnidade: (chave: string) => string; testId: string }> = ({ linha, nomeDaUnidade, testId }) => {
  const unidades = Object.entries(linha.alocadoPorUnidade)
    .filter(([, qtd]) => qtd > 0)
    .sort((a, b) => b[1] - a[1]);
  const visiveis = unidades.slice(0, MAX_UNIDADES_VISIVEIS);
  const resto = unidades.length - visiveis.length;
  const todas = unidades.map(([chave, qtd]) => `${nomeDaUnidade(chave)}: ${formatNumber(qtd)}`).join(' · ');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <CarteiraNivelPill nivel={linha.nivelAlocacao} labels={NIVEL_ALOCACAO_LABEL} />
        <span style={{ ...pequeno, fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(linha.alocado)} de {formatNumber(linha.quantitativoSenasp)}
        </span>
      </div>
      {visiveis.length > 0 && (
        <div data-testid={testId} title={todas} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
          {visiveis.map(([chave, qtd]) => (
            <span key={chave} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 0.4rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
              {nomeDaUnidade(chave)} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(qtd)}</b>
            </span>
          ))}
          {resto > 0 && (
            <span style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 0.4rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>+{resto}</span>
          )}
        </div>
      )}
    </div>
  );
};

/** Empenho do item: situação e quanto foi empenhado do que foi contratado (mesmo texto da Carteira de Itens). */
const EmpenhoCelula: React.FC<{ linha: CarteiraItemRow }> = ({ linha }) => (
  <div>
    <CarteiraNivelPill nivel={linha.nivelEmpenho} labels={NIVEL_EMPENHO_LABEL} />
    <div style={{ ...pequeno, marginTop: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
      {linha.contratada == null
        ? `${formatNumber(linha.empenhado)} · sem qtd. contratada`
        : `${formatNumber(linha.empenhado)} de ${formatNumber(linha.contratada)} contratado`}
    </div>
  </div>
);

interface ItensDaAtaTabelaProps {
  numeroAta: string;
  itens: ArpItemRecord[];
  /** Linha do item na carteira (saldo, alocação, empenho); ausente enquanto carrega ou sem dado. */
  linhaDoItem: (item: ArpItemRecord) => CarteiraItemRow | undefined;
  pctDoItem: (item: ArpItemRecord) => number | null;
  nomeDaUnidade: (chave: string) => string;
  /** Gestor de saldo não vê empenho (fica fora dos contratos). */
  mostrarEmpenho: boolean;
  onSelectItem: (item: ArpItemRecord) => void;
}

/**
 * Itens da ata, na linha expandida da Carteira de Atas: quantidade SENASP, saldo SENASP, alocação nas unidades
 * internas e empenho, com os mesmos números da Carteira de Itens. A linha abre o Item 360.
 */
export const ItensDaAtaTabela: React.FC<ItensDaAtaTabelaProps> = ({ numeroAta, itens, linhaDoItem, pctDoItem, nomeDaUnidade, mostrarEmpenho, onSelectItem }) => (
  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
    <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={carteiraTh}>Item</th>
          <th style={{ ...carteiraTh, textAlign: 'right' }}>Qtd. SENASP</th>
          <th style={carteiraTh}>Saldo SENASP</th>
          <th style={carteiraTh}>Alocação nas unidades</th>
          {mostrarEmpenho && <th style={carteiraTh}>Empenho</th>}
        </tr>
      </thead>
      <tbody>
        {itens.map((item, idx) => {
          const linha = linhaDoItem(item);
          const pct = pctDoItem(item);
          const td: React.CSSProperties = { ...carteiraTd, verticalAlign: 'top' };
          return (
            <tr
              key={`${item.numeroItem}-${item.codigoItem}-${idx}`}
              data-testid={`arp-item-${numeroAta}-${item.numeroItem}`}
              className="carteira-row-link"
              onClick={abrirAoClicarNaLinha(() => onSelectItem(item))}
            >
              <td data-role="id" style={{ ...td, minWidth: '220px', maxWidth: '420px' }}>
                <CarteiraIdLink onClick={() => onSelectItem(item)} label={`Ver saldo do item ${item.numeroItem} da ata ${numeroAta}`} title="Ver o saldo do item">
                  {item.numeroItem}
                </CarteiraIdLink>
                <div title={item.descricaoItem} style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '0.15rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {descricaoItemEmFrase(item.descricaoItem) || '—'}
                </div>
              </td>
              <td data-label="Qtd. SENASP" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {linha ? (
                  <span>
                    <span style={forte}>{formatNumber(linha.quantitativoSenasp)}</span> <span style={pequeno}>un</span>
                  </span>
                ) : (
                  <span style={{ color: '#94a3b8' }}>—</span>
                )}
                {item.valorUnitario != null && Number(item.valorUnitario) > 0 && (
                  <div style={{ ...pequeno, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(item.valorUnitario))} un.</div>
                )}
              </td>
              <td data-label="Saldo SENASP" style={td}>
                <SaldoCelula linha={linha} pct={pct} />
              </td>
              <td data-label="Alocação nas unidades" style={td}>
                {linha ? (
                  <AlocacaoCelula linha={linha} nomeDaUnidade={nomeDaUnidade} testId={`arp-item-unidades-${numeroAta}-${item.numeroItem}`} />
                ) : (
                  <span style={{ color: '#94a3b8' }}>—</span>
                )}
              </td>
              {mostrarEmpenho && (
                <td data-label="Empenho" style={td}>
                  {linha ? <EmpenhoCelula linha={linha} /> : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

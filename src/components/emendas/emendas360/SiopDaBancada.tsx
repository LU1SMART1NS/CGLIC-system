import React from 'react';
import { carteiraDetalhe, carteiraNumero } from '../../carteira/carteiraStyles';
import { formatCurrency } from '../../../utils/format';
import { dataBR } from '../../../utils/emendasKits';
import type { EmendaSiop } from '../../../services/emendasService';

/**
 * Emenda de bancada no SIOP além do valor da emenda (protótipo aprovado em 29/10/2026, decisão D6, migration 239): os
 * bloqueios da linha de compra direta (21BM, modalidade 90) e as outras linhas da emenda (outra modalidade ou ação).
 * Só informação: nada disso entra no valor da emenda nem no valor a indicar.
 */
export const SiopDaBancada: React.FC<{ e: EmendaSiop }> = ({ e }) => {
  const fora = e.foraCompraDireta ?? [];
  const temBloqueio = (e.bloqueadoControle ?? 0) > 0 || (e.bloqueadoProgramacao ?? 0) > 0;
  if (!temBloqueio && fora.length === 0) return null;
  const celula: React.CSSProperties = { padding: '0.45rem 0.6rem', borderTop: '1px solid var(--color-border)', textAlign: 'right', whiteSpace: 'nowrap', ...carteiraNumero };
  const titulo: React.CSSProperties = { ...celula, textAlign: 'left', whiteSpace: 'normal' };
  const cab: React.CSSProperties = { ...celula, borderTop: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' };
  return (
    <div data-testid="emenda-360-siop-bancada" style={{ display: 'grid', gap: '0.4rem' }}>
      <div style={{ fontWeight: 700 }}>No SIOP, além da compra direta{e.siopLidoEm ? <span style={carteiraDetalhe}> · lido em {dataBR(e.siopLidoEm)}</span> : null}</div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: '0.88rem' }}>
          <thead>
            <tr>
              <th style={{ ...cab, textAlign: 'left' }}>Linha da emenda no SIOP</th>
              <th style={cab}>Autorizado</th>
              <th style={cab}>Empenhado</th>
              <th style={cab}>107 Bloqueado Controle SOF</th>
              <th style={cab}>108 Bloqueado Programação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={titulo}>
                21BM · modalidade 90 (compra direta)
                <div style={carteiraDetalhe}>é o valor da emenda nas telas</div>
              </td>
              <td style={celula}>{e.valor != null ? formatCurrency(e.valor) : '—'}</td>
              <td style={celula}>—</td>
              <td style={celula}>{e.bloqueadoControle != null ? formatCurrency(e.bloqueadoControle) : '—'}</td>
              <td style={celula}>{e.bloqueadoProgramacao != null ? formatCurrency(e.bloqueadoProgramacao) : '—'}</td>
            </tr>
            {fora.map((l) => (
              <tr key={`${l.acao}-${l.modalidade}`}>
                <td style={titulo}>
                  {l.acao} · modalidade {l.modalidade}
                  <div style={carteiraDetalhe}>fora da compra direta: não entra no valor da emenda</div>
                </td>
                <td style={celula}>{formatCurrency(l.autorizado)}</td>
                <td style={celula}>{formatCurrency(l.empenhado)}</td>
                <td style={celula}>—</td>
                <td style={celula}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={carteiraDetalhe}>Os bloqueios são só informação: não descontam do valor da emenda nem do valor a indicar.</div>
    </div>
  );
};

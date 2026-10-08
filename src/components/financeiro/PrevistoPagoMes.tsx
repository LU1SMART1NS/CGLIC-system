import React, { useMemo, useState } from 'react';
import { ActionButton, StatusBadge } from '../../design-system';
import { useFaturasCarteira } from '../../hooks/useFinanceiroCarteira';
import { compararPrevistoPago, type EnvioPrevisao } from '../../services/previsaoMensalService';
import { formatCurrency } from '../carteira/carteiraFormat';
import { carteiraFornecedor, carteiraSubtitle, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import type { ContratoDoFinanceiro } from './useContratosDoFinanceiro';
import { rotuloDoMes } from './financeiroFormat';

/** Diferença abaixo de R$ 1,00 conta como "conforme" (arredondamentos da OB). */
const TOLERANCIA = 1;

function situacao(previsto: number, pago: number): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  if (previsto === 0) return { label: 'Fora da previsão', variant: 'info' };
  if (pago === 0) return { label: 'Não pago', variant: 'neutral' };
  if (Math.abs(pago - previsto) < TOLERANCIA) return { label: 'Conforme', variant: 'success' };
  return pago > previsto ? { label: 'Pago a mais', variant: 'warning' } : { label: 'Pago a menos', variant: 'warning' };
}

/**
 * Previsto × pago de um mês com previsão enviada: o que a CGLIC informou à DGFNSP contra as faturas com ordem bancária
 * emitida no mês. Ajuda a calibrar a próxima previsão (Portaria 50, art. 5º, § 2º, III).
 */
export const PrevistoPagoMes: React.FC<{
  mes: string;
  envio: EnvioPrevisao;
  contrato: (contractKey: string) => ContratoDoFinanceiro;
  escopo: Set<string> | null;
}> = ({ mes, envio, contrato, escopo }) => {
  const faturas = useFaturasCarteira();
  const [aberto, setAberto] = useState(false);
  const linhas = useMemo(
    () => compararPrevistoPago(envio.linhas, faturas.data ?? [], mes).filter((l) => !escopo || escopo.has(l.contractKey)),
    [envio.linhas, faturas.data, mes, escopo]
  );
  if (faturas.isLoading) return null;

  const previsto = linhas.reduce((s, l) => s + l.previsto, 0);
  const pago = linhas.reduce((s, l) => s + l.pago, 0);
  const pct = previsto > 0 ? Math.round((pago / previsto) * 100) : null;

  return (
    <section data-testid="previsto-pago" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Previsto × pago em {rotuloDoMes(mes)}</div>
          <div style={carteiraSubtitle}>
            Previsto {formatCurrency(previsto)} · pago {formatCurrency(pago)}
            {pct !== null ? ` (${pct}%)` : ''} · pago = faturas com ordem bancária emitida no mês
          </div>
        </div>
        <ActionButton
          action={aberto ? 'recolher' : 'expandir'}
          size="sm"
          label={aberto ? 'Recolher' : `Ver por contrato (${linhas.length})`}
          onClick={() => setAberto((v) => !v)}
          data-testid="previsto-pago-toggle"
        />
      </div>
      {aberto && (
        <div className="carteira-shell" style={carteiraTableShell} data-testid="previsto-pago-table">
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Contrato</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Previsto</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Pago</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Diferença</th>
                  <th style={carteiraTh}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const c = contrato(l.contractKey);
                  const s = situacao(l.previsto, l.pago);
                  const dif = l.pago - l.previsto;
                  return (
                    <tr key={l.contractKey} data-testid={`previsto-pago-${l.contractKey}`}>
                      <td data-role="id" style={{ ...carteiraTd, minWidth: '220px', maxWidth: '340px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{c.numero}</div>
                        <div title={c.fornecedorNome} style={carteiraFornecedor}>{c.fornecedorNome}</div>
                      </td>
                      <td data-label="Previsto" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(l.previsto)}</td>
                      <td data-label="Pago" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div>
                          <div>{formatCurrency(l.pago)}</div>
                          {l.faturasPagas > 0 && <div style={carteiraSubtitle}>{l.faturasPagas} {l.faturasPagas === 1 ? 'fatura' : 'faturas'}</div>}
                        </div>
                      </td>
                      <td data-label="Diferença" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {Math.abs(dif) < TOLERANCIA ? '—' : `${dif > 0 ? '+' : '−'}${formatCurrency(Math.abs(dif))}`}
                      </td>
                      <td data-label="Situação" style={carteiraTd}>
                        <StatusBadge label={s.label} variant={s.variant} size="sm" dot={false} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

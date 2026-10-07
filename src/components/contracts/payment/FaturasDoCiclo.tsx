import React from 'react';
import { ActionButton, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { FaturasDoCicloState } from './cicloPagamentoShared';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Lista de faturas do contrato para marcar no ciclo, com "Buscar faturas agora" e a conferência do valor. */
export const FaturasDoCiclo: React.FC<{ cycle: PaymentFollowUpCycle; estado: FaturasDoCicloState; semFaturaTexto: string; testIdPrefix: string }> = ({
  cycle,
  estado,
  semFaturaTexto,
  testIdPrefix
}) => {
  const { lista, isLoading, selecionadas, alternar, soma, divergente, buscarAgora, buscando, aviso, podeBuscar } = estado;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Faturas cadastradas no Contratos.gov.br</div>
        {podeBuscar && (
          <ActionButton action="sincronizar" type="button" size="sm" onClick={() => void buscarAgora()} disabled={buscando} label={buscando ? 'Buscando...' : 'Buscar faturas agora'} />
        )}
      </div>
      {aviso && <NoticeBar tone="info" testId={`${testIdPrefix}-aviso`}>{aviso}</NoticeBar>}
      {isLoading ? (
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Carregando as faturas…</div>
      ) : lista.length === 0 ? (
        <NoticeBar tone="warning" testId={`${testIdPrefix}-sem-fatura`}>{semFaturaTexto}</NoticeBar>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid={`${testIdPrefix}-faturas`}>
          {lista.map((f) => {
            const emOutro = Boolean(f.cicloId && f.cicloId !== cycle.id);
            return (
              <label
                key={f.idFatura}
                htmlFor={`fatura-${f.idFatura}`}
                style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', opacity: emOutro ? 0.55 : 1 }}
              >
                <input id={`fatura-${f.idFatura}`} type="checkbox" checked={selecionadas.includes(f.idFatura)} disabled={emOutro} onChange={() => alternar(f.idFatura)} style={{ marginTop: '0.2rem' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <strong>
                    {f.numero ? `NF ${f.numero}` : `Fatura ${f.idFatura}`} · {moeda(f.valorLiquido)}
                  </strong>
                  <span style={{ color: '#64748b' }}>
                    {[
                      f.referencia ? `ref. ${f.referencia}` : null,
                      f.empenhos,
                      f.situacao,
                      f.paga ? 'já paga' : f.liquidada ? 'já liquidada' : null,
                      emOutro ? 'já está em outro ciclo' : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {selecionadas.length > 0 && (
        <NoticeBar tone={divergente ? 'warning' : 'success'} testId={`${testIdPrefix}-conferencia-valor`}>
          Ciclo {moeda(cycle.input.valorAtesto)} {divergente ? '≠' : '='} faturas {moeda(soma)}
          {divergente ? `: diferença de ${moeda(Math.abs(soma - cycle.input.valorAtesto))}.` : '.'}
        </NoticeBar>
      )}
    </>
  );
};

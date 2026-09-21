import React from 'react';
import { Share2 } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate, getProgressColorClass } from './itemBalanceUtils';
import type { AdesaoItemRecord, ArpItemRecord } from '../../types';

export interface AdesoesTabProps {
  adesoesLoading: boolean;
  adesoesError: string | null;
  adesoes: AdesaoItemRecord[];
  item: ArpItemRecord;
  totalAdesaoRegistrada: number;
  totalAdesaoEmpenhada: number;
  totalAdesaoSaldo: number;
  adesaoConsumidaPercent: number;
}

export const AdesoesTab: React.FC<AdesoesTabProps> = ({
  adesoesLoading,
  adesoesError,
  adesoes,
  item,
  totalAdesaoRegistrada,
  totalAdesaoEmpenhada,
  totalAdesaoSaldo,
  adesaoConsumidaPercent
}) => {
  const maximoAdesaoPermitido = item.maximoAdesao || (item.quantidadeHomologadaItem * 2);
  const percentAdesaoRegistrada = Math.min((totalAdesaoRegistrada / (maximoAdesaoPermitido || 1)) * 100, 100);
  const saldoNaoEmpenhado = totalAdesaoSaldo || (totalAdesaoRegistrada - totalAdesaoEmpenhada);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 1rem' }}>
      {/* Header / Context Banner */}
      <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
            <Share2 size={16} /> Adesões / Caronas de Órgãos Não Participantes
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>Endpoint 5: 5_consultarAdesoesItem</span>
            <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Art. 86 da Lei 14.133/21</span>
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#1e3a8a', margin: 0, lineHeight: 1.5 }}>
          Este painel detalha as solicitações e autorizações de adesão (caronas) formalizadas por órgãos e entidades externas que não integraram inicialmente o processo licitatório. 
          Os limites legais da Lei 14.133/2021 estabelecem teto de até <strong>50%</strong> do quantitativo do item por órgão não participante e <strong>200% (2x)</strong> no total cumulativo da Ata.
        </p>
      </div>

      {/* Stat Cards for Caronas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span className="meta-label" style={{ fontSize: '0.7rem' }}>Órgãos Solicitantes (Caronas)</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
            {adesoes.length} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>órgãos</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Entidades com carona autorizada/registrada
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Autorizado para Caronas</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>
              {formatNumber(totalAdesaoRegistrada)}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              de {formatNumber(maximoAdesaoPermitido)} máx
            </span>
          </div>
          <div className="progress-track" style={{ height: '5px', marginTop: '0.4rem', background: '#e9ecef' }}>
            <div className="progress-fill fill-info" style={{ width: `${percentAdesaoRegistrada}%` }}></div>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Limite máximo global permitido: {formatNumber(maximoAdesaoPermitido)} un
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Empenhado por Caronas</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
            {formatNumber(totalAdesaoEmpenhada)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Consumo: {formatNumber(adesaoConsumidaPercent)}% da cota concedida
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span className="meta-label" style={{ fontSize: '0.7rem' }}>Saldo Concedido Não Empenhado</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
            {formatNumber(saldoNaoEmpenhado)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Equivalente a {formatCurrency(saldoNaoEmpenhado * item.valorUnitario)}
          </div>
        </div>
      </div>

      {/* Adesões Data Table */}
      {adesoesLoading ? (
        <div className="spinner-container" style={{ padding: '2rem' }}>
          <div className="spinner spinner-glow"></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Consultando adesões de carona no Compras.gov.br (Endpoint 5)...</p>
        </div>
      ) : adesoes.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem 1.5rem', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
          <Share2 size={40} className="empty-state-icon" style={{ opacity: 0.4, color: 'var(--primary)' }} />
          <h4 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Nenhuma Carona Externa Registrada</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto' }}>
            {adesoesError || `Nenhum órgão não participante solicitou ou teve autorização de adesão registrada para o Item ${item.numeroItem} no módulo oficial do Compras.gov.br.`}
          </p>
        </div>
      ) : (
        <div className="table-container" style={{ marginTop: 0, overflowX: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <table className="custom-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Órgão Não Participante (Carona)</th>
                <th>Tipo de Vínculo</th>
                <th>Qtd. Concedida / Registrada</th>
                <th style={{ width: '220px' }}>Qtd. Empenhada</th>
                <th>Saldo p/ Empenho</th>
                <th>Data do Registro</th>
              </tr>
            </thead>
            <tbody>
              {adesoes.map((ade, idx) => {
                const empQtd = ade.quantidadeEmpenhada || 0;
                const regQtd = ade.quantidadeRegistrada || 0;
                const saldoQtd = ade.saldoEmpenho ?? (regQtd - empQtd);
                const consPerc = regQtd > 0 ? (empQtd / regQtd) * 100 : 0;

                return (
                  <tr key={`ade-${ade.unidade}-${idx}`}>
                    <td style={{ fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 700, color: '#0c326f' }}>
                        {ade.orgaoAdesao || (ade.unidade ? `UASG ${ade.unidade}` : 'Órgão Solicitante')}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {ade.unidade ? `UASG: ${ade.unidade}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                        {ade.tipo || 'NÃO PARTICIPANTE (CARONA)'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {formatNumber(regQtd)} un
                    </td>
                    <td>
                      <div className="progress-container">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatNumber(empQtd)}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{formatNumber(consPerc)}%</span>
                        </div>
                        <div className="progress-track" style={{ height: '6px', background: '#e9ecef' }}>
                          <div 
                            className={`progress-fill ${getProgressColorClass(100 - consPerc)}`}
                            style={{ width: `${Math.min(consPerc, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: saldoQtd > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {formatNumber(saldoQtd)} un
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {ade.dataHoraInclusao ? formatDate(ade.dataHoraInclusao) : ade.dataHoraAtualizacao ? formatDate(ade.dataHoraAtualizacao) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { formatNumber, getProgressColorClass, isGerenciadoraUasg, isAllowedEmpenhoUasg } from './itemBalanceUtils';
import { calculateTotalEmpenhado } from '../../services/balanceService';
import type { UnidadeItemRecord, Empenho } from '../../types';

export interface UnidadesTabProps {
  loading: boolean;
  error: string | null;
  sortedUnidades: UnidadeItemRecord[];
  allEmpenhos: Empenho[];
}

export const UnidadesTab: React.FC<UnidadesTabProps> = ({
  loading,
  error,
  sortedUnidades,
  allEmpenhos
}) => {
  if (loading) {
    return (
      <div className="spinner-container">
        <div className="spinner spinner-glow"></div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Buscando saldos individuais por unidade...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <HelpCircle size={40} className="empty-state-icon" />
        <p style={{ fontSize: '0.95rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="table-container" style={{ marginTop: 0 }}>
      <table className="custom-table">
        <thead>
          <tr>
            <th>Órgão Participante / UASG</th>
            <th>Tipo</th>
            <th>Original Registrado</th>
            <th>Qtd Empenhada</th>
            <th style={{ width: '220px' }}>Saldo p/ Empenho</th>
          </tr>
        </thead>
        <tbody>
          {sortedUnidades.map((uni, idx) => {
            const cleanUasg = String(uni.codigoUnidade || '').replace(/\D/g, '');
            const isUG = uni.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(cleanUasg);
            const hasMultipleUgRows = sortedUnidades.filter(u => isGerenciadoraUasg(u.codigoUnidade)).length > 1;

            const empsForUnit = allEmpenhos.filter(e => {
              const eUasg = String(e.uasg || '').replace(/\D/g, '');
              if (isUG) {
                if (hasMultipleUgRows) {
                  return eUasg === cleanUasg;
                }
                return isAllowedEmpenhoUasg(eUasg);
              }
              return eUasg === cleanUasg;
            });

            const empenhadoUnitQty = calculateTotalEmpenhado(empsForUnit);
            const effectiveSaldo = isUG 
              ? (uni.quantidadeRegistrada - empenhadoUnitQty)
              : (uni.saldoRemanejamentoEmpenho !== undefined && uni.saldoRemanejamentoEmpenho !== null 
                  ? uni.saldoRemanejamentoEmpenho 
                  : (uni.quantidadeRegistrada - empenhadoUnitQty));

            const empPerc = uni.quantidadeRegistrada > 0 ? (effectiveSaldo / uni.quantidadeRegistrada) * 100 : 0;
            const clampedPerc = Math.max(0, Math.min(100, empPerc));

            return (
              <tr key={`${uni.codigoUnidade}-${idx}`}>
                <td style={{ fontSize: '0.88rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {uni.nomeUnidade}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 500 }}>
                    UASG: {uni.codigoUnidade}
                  </div>
                </td>
                <td>
                  <span className={`badge ${isUG ? 'badge-info' : 'badge-success'}`}>
                    {isUG ? 'GERENCIADORA' : 'PARTICIPANTE'}
                  </span>
                </td>
                <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {formatNumber(uni.quantidadeRegistrada)}
                </td>
                <td style={{ fontWeight: 700, fontFamily: 'monospace', color: empenhadoUnitQty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {formatNumber(empenhadoUnitQty)} un
                </td>
                <td>
                  <div className="progress-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 700, color: effectiveSaldo < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {formatNumber(effectiveSaldo)}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatNumber(empPerc)}%</span>
                    </div>
                    <div className="progress-track" style={{ height: '6px' }}>
                      <div 
                        className={`progress-fill ${getProgressColorClass(clampedPerc)}`}
                        style={{ width: `${clampedPerc}%` }}
                      ></div>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

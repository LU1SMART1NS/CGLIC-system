import React from 'react';
import { ArrowRightLeft, Users, DollarSign } from 'lucide-react';
import { formatCurrency, formatNumber, getProgressColorClass } from './itemBalanceUtils';

export interface ItemBalancesSummaryCardsProps {
  officialCalculatedSaldo: number;
  itemTotalQty: number;
  quantidadeEstimadaEdital?: number;
  empenhoPercentClamped: number;
  totalConsumidoEmpenho: number;
  empenhoConsumidoPercent: number;
  rawEmpenhoPercentRestante: number;
  totalSaldoAdesoes: number;
  totalLimiteAdesao: number;
  adsPercValClamped: number;
  totalConsumidoAdesao: number;
  adsConsPercVal: number;
  adsPercVal: number;
  valorFinanceiroDisponivel: number;
  valorFinanceiroConsumido: number;
  onAdesoesClick: () => void;
}

export const ItemBalancesSummaryCards: React.FC<ItemBalancesSummaryCardsProps> = ({
  officialCalculatedSaldo,
  itemTotalQty,
  quantidadeEstimadaEdital,
  empenhoPercentClamped,
  totalConsumidoEmpenho,
  empenhoConsumidoPercent,
  rawEmpenhoPercentRestante,
  totalSaldoAdesoes,
  totalLimiteAdesao,
  adsPercValClamped,
  totalConsumidoAdesao,
  adsConsPercVal,
  adsPercVal,
  valorFinanceiroDisponivel,
  valorFinanceiroConsumido,
  onAdesoesClick
}) => {
  return (
    <section className="balances-header-grid">
      {/* Empenho Balance Card */}
      <div className="glass-card balance-card-summary">
        <div className="balance-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)' }}>
          <ArrowRightLeft size={24} />
        </div>
        <div className="balance-info-wrap" style={{ flexGrow: 1 }}>
          <span className="meta-label">Saldo p/ Empenho / Remanejamento</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span className="balance-val" style={{ color: 'var(--text-primary)' }}>
              {formatNumber(officialCalculatedSaldo)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              de {formatNumber(itemTotalQty)} un
              {quantidadeEstimadaEdital && quantidadeEstimadaEdital !== itemTotalQty && (
                <span style={{ marginLeft: '0.25rem', opacity: 0.8, fontWeight: 500 }} title={`Quantitativo originário do edital: ${formatNumber(quantidadeEstimadaEdital)} un`}>
                  (Edital: {formatNumber(quantidadeEstimadaEdital)})
                </span>
              )}
            </span>
          </div>
          
          <div className="progress-container" style={{ marginTop: '0.75rem' }}>
            <div className="progress-track">
              <div 
                className={`progress-fill ${getProgressColorClass(empenhoPercentClamped)}`}
                style={{ width: `${empenhoPercentClamped}%` }}
              ></div>
            </div>
            <div className="progress-label-row">
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Consumido: {formatNumber(totalConsumidoEmpenho)} ({formatNumber(empenhoConsumidoPercent)}%)</span>
              <span style={{ fontWeight: 700, fontSize: '0.7rem', color: rawEmpenhoPercentRestante < 20 ? 'var(--danger)' : 'var(--success)' }}>{formatNumber(rawEmpenhoPercentRestante)}% restante</span>
            </div>
          </div>
        </div>
      </div>

      {/* Adesao (Carona) Balance Card */}
      <div 
        className="glass-card balance-card-summary" 
        onClick={onAdesoesClick}
        style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
        title="Clique para ver o detalhamento de caronas externas autorizadas"
      >
        <div className="balance-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent)' }}>
          <Users size={24} />
        </div>
        <div className="balance-info-wrap" style={{ flexGrow: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="meta-label">Saldo para Adesões (Caronas)</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>Ver Caronas →</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span className="balance-val" style={{ color: 'var(--accent)' }}>
              {formatNumber(totalSaldoAdesoes)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              de {formatNumber(totalLimiteAdesao)} un
            </span>
          </div>

          <div className="progress-container" style={{ marginTop: '0.75rem' }}>
            <div className="progress-track">
              <div 
                className={`progress-fill ${getProgressColorClass(adsPercValClamped)}`}
                style={{ width: `${adsPercValClamped}%` }}
              ></div>
            </div>
            <div className="progress-label-row">
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Consumido: {formatNumber(totalConsumidoAdesao)} ({formatNumber(adsConsPercVal)}%)</span>
              <span style={{ fontWeight: 700, fontSize: '0.7rem', color: adsPercValClamped < 20 ? 'var(--danger)' : 'var(--accent)' }}>{formatNumber(adsPercVal)}% restante</span>
            </div>
          </div>
        </div>
      </div>

      {/* Value Balance Card */}
      <div className="glass-card balance-card-summary">
        <div className="balance-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' }}>
          <DollarSign size={24} />
        </div>
        <div className="balance-info-wrap">
          <span className="meta-label">Valor Financeiro Disponível (Empenho)</span>
          <span className="balance-val" style={{ color: valorFinanceiroDisponivel < 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
            {formatCurrency(valorFinanceiroDisponivel)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Total consumido: {formatCurrency(valorFinanceiroConsumido)}
          </span>
        </div>
      </div>
    </section>
  );
};

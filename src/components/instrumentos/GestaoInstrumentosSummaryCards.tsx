import React from 'react';
import { Package, FileText, Coins, AlertTriangle } from 'lucide-react';

export interface GestaoInstrumentosCounts {
  // Card 1 — ARP
  totalAtas: number;
  itensCriticosArp: number;
  itensProximosLimiteArp: number;
  // Card 2 — Contratos
  contratosAtivos: number;
  contratosEmAtencao60a90d: number;
  contratosEmProrrogacao: number;
  contratosAVencer30d: number;
  // Card 3 — Valor Global
  valorVigenteTotal: number;
  totalEmpenhado: number;
  // Card 4 — Alertas
  criticalCount: number;
  totalAlertasAtivos: number;
  urgenteCount: number;
  atencaoCount: number;
}

export type GestaoInstrumentosCardId = 'ARP' | 'CONTRATOS' | 'VALOR' | 'ALERTAS';

interface GestaoInstrumentosSummaryCardsProps {
  counts: GestaoInstrumentosCounts;
  activeCard: GestaoInstrumentosCardId | null;
  onSelectCard: (card: GestaoInstrumentosCardId) => void;
}

function formatCurrency(val: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(part: number, total: number): string {
  if (!total) return '0,0%';
  return `${((part / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const cardBaseStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '1.1rem 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.15s ease-in-out',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.78rem',
  color: '#64748b'
};

export const GestaoInstrumentosSummaryCards: React.FC<GestaoInstrumentosSummaryCardsProps> = ({
  counts,
  activeCard,
  onSelectCard
}) => {
  const saldoDisponivel = counts.valorVigenteTotal - counts.totalEmpenhado;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '0.9rem'
      }}
    >
      {/* Card 1 — Atas de Registro de Preço (ARP) */}
      <button
        type="button"
        onClick={() => onSelectCard('ARP')}
        data-testid="instrumentos-card-arp"
        style={{
          ...cardBaseStyle,
          border: activeCard === 'ARP' ? '2px solid #0c326f' : cardBaseStyle.border
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Atas de Registro de Preço (ARP)
          </span>
          <div style={{ background: '#eff6ff', color: '#0c326f', padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
            <Package size={16} />
          </div>
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0c326f', letterSpacing: '-0.02em' }}>
          {counts.totalAtas} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>geridas</span>
        </div>
        <div style={rowStyle}>
          <span>Saldo crítico (≥85%)</span>
          <strong style={{ color: counts.itensCriticosArp > 0 ? '#dc2626' : '#0f172a' }}>{counts.itensCriticosArp}</strong>
        </div>
        <div style={rowStyle}>
          <span>Próximo do limite (70–84%)</span>
          <strong style={{ color: counts.itensProximosLimiteArp > 0 ? '#d97706' : '#0f172a' }}>{counts.itensProximosLimiteArp}</strong>
        </div>
      </button>

      {/* Card 2 — Contratos Vigentes */}
      <button
        type="button"
        onClick={() => onSelectCard('CONTRATOS')}
        data-testid="instrumentos-card-contratos"
        style={{
          ...cardBaseStyle,
          border: activeCard === 'CONTRATOS' ? '2px solid #0c326f' : cardBaseStyle.border
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Contratos Vigentes
          </span>
          <div style={{ background: '#ecfdf5', color: '#059669', padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
            <FileText size={16} />
          </div>
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669', letterSpacing: '-0.02em' }}>
          {counts.contratosAtivos} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>ativos</span>
        </div>
        <div style={rowStyle}>
          <span>Em atenção (60–90 dias)</span>
          <strong style={{ color: counts.contratosEmAtencao60a90d > 0 ? '#d97706' : '#0f172a' }}>{counts.contratosEmAtencao60a90d}</strong>
        </div>
        <div style={rowStyle}>
          <span>Em prorrogação</span>
          <strong>{counts.contratosEmProrrogacao}</strong>
        </div>
        <div style={rowStyle}>
          <span>A vencer (≤30 dias)</span>
          <strong style={{ color: counts.contratosAVencer30d > 0 ? '#dc2626' : '#0f172a' }}>{counts.contratosAVencer30d}</strong>
        </div>
      </button>

      {/* Card 3 — Valor Total Global */}
      <button
        type="button"
        onClick={() => onSelectCard('VALOR')}
        data-testid="instrumentos-card-valor"
        style={{
          ...cardBaseStyle,
          border: activeCard === 'VALOR' ? '2px solid #0c326f' : cardBaseStyle.border
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Valor Total Global
          </span>
          <div style={{ background: '#fef9c3', color: '#a16207', padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
            <Coins size={16} />
          </div>
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#a16207', letterSpacing: '-0.02em' }}>
          {formatCurrency(counts.valorVigenteTotal)}
        </div>
        <div style={rowStyle}>
          <span>Empenho realizado</span>
          <strong>{formatCurrency(counts.totalEmpenhado)} ({formatPercent(counts.totalEmpenhado, counts.valorVigenteTotal)})</strong>
        </div>
        <div style={rowStyle}>
          <span>Saldo disponível</span>
          <strong>{formatCurrency(saldoDisponivel)} ({formatPercent(saldoDisponivel, counts.valorVigenteTotal)})</strong>
        </div>
      </button>

      {/* Card 4 — Alertas Críticos */}
      <button
        type="button"
        onClick={() => onSelectCard('ALERTAS')}
        data-testid="instrumentos-card-alertas"
        style={{
          ...cardBaseStyle,
          border: activeCard === 'ALERTAS' ? '2px solid #dc2626' : cardBaseStyle.border
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Alertas Críticos
          </span>
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
            <AlertTriangle size={16} />
          </div>
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626', letterSpacing: '-0.02em' }}>
          {counts.criticalCount} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>itens críticos</span>
        </div>
        <div style={rowStyle}>
          <span>Pendências totais</span>
          <strong>{counts.totalAlertasAtivos}</strong>
        </div>
        <div style={rowStyle}>
          <span>Urgentes</span>
          <strong style={{ color: counts.urgenteCount > 0 ? '#d97706' : '#0f172a' }}>{counts.urgenteCount}</strong>
        </div>
        <div style={rowStyle}>
          <span>Em atenção</span>
          <strong>{counts.atencaoCount}</strong>
        </div>
      </button>
    </div>
  );
};

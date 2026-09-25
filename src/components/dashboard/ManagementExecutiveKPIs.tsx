import React from 'react';
import {
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Scale,
  CreditCard,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ManagementKpiCard } from './ManagementKpiCard';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type { ManagementDashboardReadModel } from '../../types/managementDashboard';

export interface ManagementExecutiveKPIsProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  uasg?: string;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR');
}

function formatPercent(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0,00%';
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Primeira Dobra do Dashboard Gerencial: 4 KPIs Executivos Principais (SaldoARP 3.0 — Fase 8-C)
 * 
 * Regras Estritas:
 * 1. Consome dados consolidados do Read Model — NENHUM cálculo de negócio no componente;
 * 2. Estado de loading não mostra zero;
 * 3. Erro não vira zero;
 * 4. Empty state explícito se não houver contratos;
 * 5. Responsivo e acessível.
 */
export const ManagementExecutiveKPIs: React.FC<ManagementExecutiveKPIsProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  error: propError,
  uasg = '200331'
}) => {
  // Se os dados não forem injetados diretamente pelas props, consome via hook
  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propError?.message || hookResult.error?.message || 'Erro ao conectar aos serviços de dados';

  const executive = readModel?.executive;
  const financial = readModel?.financial;

  const totalContratos = executive?.totalContratos ?? 0;
  const hasNoContracts = !isLoading && !isError && totalContratos === 0;

  // Formatação da Variação Acumulada
  const deltaTotal = executive?.deltaAcumuladoTotal ?? 0;
  const deltaPercent = executive?.percentualVariacaoAcumulada ?? 0;
  const deltaFormatted = deltaTotal > 0
    ? `+${formatCurrency(deltaTotal)}`
    : (deltaTotal < 0 ? `-${formatCurrency(Math.abs(deltaTotal))}` : formatCurrency(0));

  const deltaVariant = deltaTotal > 0 ? 'info' : (deltaTotal < 0 ? 'warning' : 'default');
  const DeltaIcon = deltaTotal > 0 ? TrendingUp : (deltaTotal < 0 ? TrendingDown : Scale);

  return (
    <section aria-labelledby="management-executive-kpis-title" className="management-executive-kpis">
      <div style={{ marginBottom: '1rem' }}>
        <h3
          id="management-executive-kpis-title"
          style={{
            fontSize: '1.125rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Layers size={20} color="#0284c7" aria-hidden="true" />
          <span>Visão Executiva Global</span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
          Indicadores consolidados em tempo real — UASG {readModel?.uasg || uasg}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem'
        }}
      >
        {/* KPI 1: Contratos Ativos */}
        <ManagementKpiCard
          testId="kpi-contratos-ativos"
          title="Contratos Ativos"
          value={formatNumber(executive?.contratosAtivos)}
          unit="vigentes"
          icon={<FileText size={22} />}
          variant="primary"
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isEmpty={hasNoContracts}
          emptyMessage="Nenhum contrato cadastrado"
          description={
            executive ? (
              <span>
                Total de <strong>{formatNumber(executive.totalContratos)}</strong> contratos ({formatNumber(executive.contratosEncerrados)} encerrados)
              </span>
            ) : undefined
          }
          subContent={
            executive && executive.contratosEmProrrogacao > 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#0284c7' }} />
                <span><strong>{formatNumber(executive.contratosEmProrrogacao)}</strong> com prorrogação vigente</span>
              </div>
            ) : null
          }
        />

        {/* KPI 2: Valor Global Vigente */}
        <ManagementKpiCard
          testId="kpi-valor-vigente"
          title="Valor Global Vigente"
          value={formatCurrency(executive?.valorVigenteTotal)}
          icon={<DollarSign size={22} />}
          variant="success"
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isEmpty={hasNoContracts}
          emptyMessage="Sem valores vigentes"
          description={
            executive ? (
              <span>
                Valor original base: <strong>{formatCurrency(executive.valorOriginalTotal)}</strong>
              </span>
            ) : undefined
          }
        />

        {/* KPI 3: Variação Acumulada */}
        <ManagementKpiCard
          testId="kpi-variacao-acumulada"
          title="Variação Acumulada"
          value={deltaFormatted}
          icon={<DeltaIcon size={22} />}
          badge={
            executive && executive.valorOriginalTotal > 0 ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  background: deltaTotal > 0 ? '#eff6ff' : (deltaTotal < 0 ? '#fef2f2' : '#f1f5f9'),
                  color: deltaTotal > 0 ? '#1d4ed8' : (deltaTotal < 0 ? '#b91c1c' : '#475569')
                }}
              >
                {formatPercent(deltaPercent)}
              </span>
            ) : null
          }
          variant={deltaVariant}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isEmpty={hasNoContracts}
          emptyMessage="Sem aditamentos de valor"
          ariaLabel={`Variação acumulada de ${deltaFormatted}${executive?.valorOriginalTotal ? `, variação percentual de ${formatPercent(deltaPercent)}` : ''}`}
          description="Impacto monetário acumulado de aditamentos e apostilamentos"
        />

        {/* KPI 4: Execução Financeira Oficial */}
        <ManagementKpiCard
          testId="kpi-execucao-financeira"
          title="Execução Financeira"
          value={formatCurrency(financial?.totalPago)}
          unit="pagos"
          icon={<CreditCard size={22} />}
          variant="info"
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isEmpty={!isLoading && !isError && (!financial || (financial.totalEmpenhado === 0 && financial.totalPago === 0))}
          emptyMessage="Sem registros financeiros"
          description="Fontes oficiais: SIAFI / Contratos.gov"
          subContent={
            financial ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  background: '#f8fafc',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.72rem'
                }}
              >
                {/* Linha de Progresso: Empenhado -> Liquidado -> Pago */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#475569', fontWeight: 600 }}>
                  <span>Empenhado</span>
                  <ArrowRight size={12} color="#94a3b8" />
                  <span>Liquidado</span>
                  <ArrowRight size={12} color="#94a3b8" />
                  <span>Pago</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0f172a', fontWeight: 700 }}>
                  <span title="Total Empenhado">{formatCurrency(financial.totalEmpenhado)}</span>
                  <span title="Total Liquidado" style={{ color: '#0284c7' }}>
                    {formatCurrency(financial.totalLiquidado)}
                  </span>
                  <span title="Total Pago" style={{ color: '#059669' }}>
                    {formatCurrency(financial.totalPago)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b' }}>
                  <span>Liq: <strong>{financial.taxaLiquidacaoPercentual}%</strong></span>
                  <span>Pago/Liq: <strong>{financial.taxaPagamentoPercentual}%</strong></span>
                </div>
              </div>
            ) : null
          }
        />
      </div>
    </section>
  );
};

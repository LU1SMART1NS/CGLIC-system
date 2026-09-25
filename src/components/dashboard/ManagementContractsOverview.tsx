import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Scale,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type {
  ManagementDashboardReadModel
} from '../../types/managementDashboard';
import type { ReajusteRadarAlert } from '../../types/contractReajusteRadar';

export interface ManagementContractsOverviewProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  onNavigateContract?: (contractKey: string) => void;
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

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return 'N/D';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

type ContractTabFilter = 'TODOS' | 'VENCENDO' | 'REAJUSTE' | 'PRORROGACAO';

/**
 * Seção "Contratos & Reajustes" do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-E)
 * 
 * Princípios Fundamentais:
 * 1. Projeção visual pura dos domínios contratuais (sem novos cálculos embutidos);
 * 2. Isolamento rigoroso entre Valor Contratual e Execução Financeira;
 * 3. Navegação direta para o Contrato 360° (/contratos/:contractKey);
 * 4. Tratamento resiliente de loading (skeleton), erro e empty state.
 */
export const ManagementContractsOverview: React.FC<ManagementContractsOverviewProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  onNavigateContract
}) => {
  const [activeTab, setActiveTab] = useState<ContractTabFilter>('TODOS');

  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar dados da carteira contratual';

  const executive = readModel?.executive;
  const deadlines = readModel?.deadlines;
  const attention = readModel?.attention;

  const radarsMap = useMemo(() => {
    const map = new Map<string, ReajusteRadarAlert>();
    if (attention?.radarsReajuste) {
      for (const r of attention.radarsReajuste) {
        if (r && r.contractKey) {
          map.set(r.contractKey, r);
        }
      }
    }
    return map;
  }, [attention?.radarsReajuste]);

  // Lista unificada de contratos que demandam acompanhamento
  const monitoringItems = useMemo(() => {
    const items = deadlines?.itensVencendo || [];
    return items.map((item) => {
      const radar = radarsMap.get(item.contractKey);
      return {
        ...item,
        radar
      };
    });
  }, [deadlines?.itensVencendo, radarsMap]);

  // Filtro de visualização operacional
  const filteredItems = useMemo(() => {
    if (activeTab === 'VENCENDO') {
      return monitoringItems.filter((i) => i.faixa === '30D' || i.faixa === '60D' || i.faixa === 'VENCIDO');
    }
    if (activeTab === 'REAJUSTE') {
      return monitoringItems.filter((i) => Boolean(i.radar));
    }
    if (activeTab === 'PRORROGACAO') {
      return monitoringItems.filter((i) => i.diasRestantes >= 0 && i.diasRestantes <= 180);
    }
    return monitoringItems;
  }, [monitoringItems, activeTab]);

  const navigate = useNavigate();

  const handleContractClick = (contractKey: string) => {
    if (onNavigateContract) {
      onNavigateContract(contractKey);
    } else {
      navigate(`/contratos/${encodeURIComponent(contractKey)}`);
    }
  };

  // 1. Estado de Loading
  if (isLoading) {
    return (
      <section
        data-testid="management-contracts-overview-loading"
        aria-busy="true"
        aria-label="Carregando visão geral de contratos e reajustes"
        className="management-contracts-overview animate-pulse"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ width: '40%' }}>
            <div style={{ height: '18px', background: '#cbd5e1', borderRadius: '4px', width: '70%' }} />
            <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '4px', width: '90%', marginTop: '0.5rem' }} />
          </div>
          <div style={{ width: '120px', height: '24px', background: '#e2e8f0', borderRadius: '6px' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '80px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
          ))}
        </div>
        <div style={{ height: '150px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
      </section>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <section
        data-testid="management-contracts-overview-error"
        role="alert"
        aria-label={`Erro na visão de contratos e reajustes: ${errorMessage}`}
        className="management-contracts-overview"
        style={{
          background: '#fef2f2',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #fecaca',
          borderTop: '4px solid #ef4444',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b', fontWeight: 700, fontSize: '1rem' }}>
          <AlertTriangle size={20} aria-hidden="true" />
          <span>Contratos & Reajustes — Erro ao carregar carteira contratual</span>
        </div>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
          {errorMessage}
        </p>
      </section>
    );
  }

  const totalContratos = executive?.totalContratos ?? 0;
  const hasNoContracts = totalContratos === 0;

  // 3. Estado Vazio
  if (hasNoContracts) {
    return (
      <section
        data-testid="management-contracts-overview-empty"
        aria-labelledby="contracts-overview-title"
        className="management-contracts-overview"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3
              id="contracts-overview-title"
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
              <FileText size={20} color="#0284c7" aria-hidden="true" />
              <span>Contratos & Reajustes</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Gestão executiva da carteira de contratos administrativos
            </p>
          </div>
        </div>

        <div
          style={{
            padding: '2rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Nenhum contrato cadastrado para esta UASG.
          </div>
          <div style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
            Não foram localizados contratos oficiais ou manuais para exibição de vigências e reajustes.
          </div>
        </div>
      </section>
    );
  }

  // Delta e evolução de valor
  const deltaTotal = executive?.deltaAcumuladoTotal ?? 0;
  const deltaPercent = executive?.percentualVariacaoAcumulada ?? 0;
  const deltaFormatted = deltaTotal > 0
    ? `+${formatCurrency(deltaTotal)}`
    : (deltaTotal < 0 ? `-${formatCurrency(Math.abs(deltaTotal))}` : formatCurrency(0));

  return (
    <section
      data-testid="management-contracts-overview"
      aria-labelledby="contracts-overview-title"
      className="management-contracts-overview"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginTop: '1.5rem'
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h3
            id="contracts-overview-title"
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
            <FileText size={20} color="#0284c7" aria-hidden="true" />
            <span>Contratos & Reajustes</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.55rem',
                borderRadius: '12px',
                background: '#e0f2fe',
                color: '#0284c7'
              }}
            >
              {totalContratos} {totalContratos === 1 ? 'contrato' : 'contratos'}
            </span>
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
            Carteira contratual, evolução de valor, faixas de vigência e radar de reajuste
          </p>
        </div>

        {/* Resumo Rápido de Valores */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            background: '#f8fafc',
            padding: '0.5rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '0.78rem'
          }}
        >
          <div>
            <span style={{ color: '#64748b' }}>Vigente: </span>
            <strong style={{ color: '#0f172a' }}>{formatCurrency(executive?.valorVigenteTotal)}</strong>
          </div>
          <div style={{ height: '14px', width: '1px', background: '#cbd5e1' }} />
          <div>
            <span style={{ color: '#64748b' }}>Variação: </span>
            <strong style={{ color: deltaTotal >= 0 ? '#16a34a' : '#dc2626' }}>
              {deltaFormatted} ({formatPercent(deltaPercent)})
            </strong>
          </div>
        </div>
      </div>

      {/* Grid de Métricas de Vigência e Prazos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem'
        }}
      >
        {/* Card: Vigentes */}
        <div
          data-testid="metric-contratos-vigentes"
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
            Vigência Ativa
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
            {formatNumber(executive?.contratosAtivos)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '0.2rem' }}>
            {executive?.contratosEncerrados ?? 0} encerrados
          </div>
        </div>

        {/* Card: Vencendo em 30d */}
        <div
          data-testid="metric-vencendo-30d"
          style={{
            background: (deadlines?.vencendo30Dias ?? 0) > 0 ? '#fef2f2' : '#f8fafc',
            border: `1px solid ${(deadlines?.vencendo30Dias ?? 0) > 0 ? '#fecaca' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: (deadlines?.vencendo30Dias ?? 0) > 0 ? '#991b1b' : '#64748b', textTransform: 'uppercase' }}>
            Vencendo em ≤ 30d
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: (deadlines?.vencendo30Dias ?? 0) > 0 ? '#b91c1c' : '#0f172a', marginTop: '0.25rem' }}>
            {formatNumber(deadlines?.vencendo30Dias)}
          </div>
          <div style={{ fontSize: '0.72rem', color: (deadlines?.vencendo30Dias ?? 0) > 0 ? '#991b1b' : '#64748b', marginTop: '0.2rem' }}>
            Atenção imediata
          </div>
        </div>

        {/* Card: Vencendo em 60d-90d */}
        <div
          data-testid="metric-vencendo-60d-90d"
          style={{
            background: (deadlines?.vencendo90Dias ?? 0) > 0 ? '#fffbeb' : '#f8fafc',
            border: `1px solid ${(deadlines?.vencendo90Dias ?? 0) > 0 ? '#fde68a' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: (deadlines?.vencendo90Dias ?? 0) > 0 ? '#b45309' : '#64748b', textTransform: 'uppercase' }}>
            Vencendo em ≤ 90d
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: (deadlines?.vencendo90Dias ?? 0) > 0 ? '#d97706' : '#0f172a', marginTop: '0.25rem' }}>
            {formatNumber(deadlines?.vencendo90Dias)}
          </div>
          <div style={{ fontSize: '0.72rem', color: (deadlines?.vencendo90Dias ?? 0) > 0 ? '#b45309' : '#64748b', marginTop: '0.2rem' }}>
            {deadlines?.prorrogaçõesEmCurso ?? 0} em análise
          </div>
        </div>

        {/* Card: Radar de Reajuste */}
        <div
          data-testid="metric-radar-reajuste"
          style={{
            background: (attention?.radarsReajuste?.length ?? 0) > 0 ? '#f5f3ff' : '#f8fafc',
            border: `1px solid ${(attention?.radarsReajuste?.length ?? 0) > 0 ? '#ddd6fe' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: (attention?.radarsReajuste?.length ?? 0) > 0 ? '#6d28d9' : '#64748b', textTransform: 'uppercase' }}>
            Radar de Reajuste
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: (attention?.radarsReajuste?.length ?? 0) > 0 ? '#7c3aed' : '#0f172a', marginTop: '0.25rem' }}>
            {formatNumber(attention?.radarsReajuste?.length)}
          </div>
          <div style={{ fontSize: '0.72rem', color: (attention?.radarsReajuste?.length ?? 0) > 0 ? '#6d28d9' : '#64748b', marginTop: '0.2rem' }}>
            {attention?.radarsUrgentesCount ?? 0} urgentes (marco 1 ano)
          </div>
        </div>
      </div>

      {/* Barra de Filtro de Abas Operacionais */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '0.5rem',
          marginBottom: '1rem'
        }}
      >
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            data-testid="tab-todos"
            onClick={() => setActiveTab('TODOS')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'TODOS' ? '#0284c7' : '#f1f5f9',
              color: activeTab === 'TODOS' ? '#ffffff' : '#475569'
            }}
          >
            Todos ({monitoringItems.length})
          </button>
          <button
            type="button"
            data-testid="tab-vencendo"
            onClick={() => setActiveTab('VENCENDO')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'VENCENDO' ? '#0284c7' : '#f1f5f9',
              color: activeTab === 'VENCENDO' ? '#ffffff' : '#475569'
            }}
          >
            Vencendo em breve ({deadlines?.vencendo60Dias ?? 0})
          </button>
          <button
            type="button"
            data-testid="tab-reajuste"
            onClick={() => setActiveTab('REAJUSTE')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'REAJUSTE' ? '#0284c7' : '#f1f5f9',
              color: activeTab === 'REAJUSTE' ? '#ffffff' : '#475569'
            }}
          >
            Radar de Reajuste ({attention?.radarsReajuste?.length ?? 0})
          </button>
          <button
            type="button"
            data-testid="tab-prorrogacao"
            onClick={() => setActiveTab('PRORROGACAO')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'PRORROGACAO' ? '#0284c7' : '#f1f5f9',
              color: activeTab === 'PRORROGACAO' ? '#ffffff' : '#475569'
            }}
          >
            Prorrogações ({deadlines?.prorrogaçõesEmCurso ?? 0})
          </button>
        </div>
      </div>

      {/* Lista de Contratos em Acompanhamento */}
      {filteredItems.length === 0 ? (
        <div
          data-testid="empty-contracts-filter"
          style={{
            padding: '1.5rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.85rem'
          }}
        >
          Nenhum contrato encontrado para o filtro selecionado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filteredItems.map((item) => {
            const isVencido = item.faixa === 'VENCIDO';
            const isUrgent = item.faixa === '30D';
            const hasRadar = Boolean(item.radar);

            return (
              <article
                key={item.contractKey}
                data-testid={`contract-item-${item.contractKey}`}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${isVencido ? '#ef4444' : (isUrgent ? '#f59e0b' : '#3b82f6')}`,
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                {/* Identificação e Vigência */}
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                      {item.numeroContrato}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: isVencido ? '#fef2f2' : (isUrgent ? '#fffbeb' : '#eff6ff'),
                        color: isVencido ? '#b91c1c' : (isUrgent ? '#b45309' : '#1d4ed8')
                      }}
                    >
                      {isVencido ? 'Vencido' : `${item.diasRestantes} dias de vigência`}
                    </span>

                    {hasRadar && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: '#f5f3ff',
                          color: '#6d28d9',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        <Scale size={12} />
                        <span>Radar: {item.radar?.diasRestantes}d</span>
                      </span>
                    )}
                  </div>

                  {item.fornecedorNome && (
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem' }}>
                      {item.fornecedorNome}
                    </div>
                  )}

                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Término da Vigência: <strong>{formatDateBR(item.dataVigenciaFim)}</strong>
                  </div>
                </div>

                {/* Ação Canônica: Ver Contrato 360° */}
                <div>
                  <button
                    type="button"
                    onClick={() => handleContractClick(item.contractKey)}
                    aria-label={`Ver Contrato 360 do contrato ${item.numeroContrato}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.75rem',
                      background: '#f8fafc',
                      color: '#0284c7',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>Ver Contrato 360°</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

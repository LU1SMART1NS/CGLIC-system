import React, { useState, useMemo } from 'react';
import {
  Boxes,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type {
  ManagementDashboardReadModel,
  ManagementDashboardArpItemSummary
} from '../../types/managementDashboard';

export interface ManagementArpBalancesProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  onNavigateAta?: (numeroAta: string) => void;
  onNavigateContract?: (contractKey: string) => void;
}

type ArpItemFilter = 'TODOS' | 'CRITICOS' | 'PROXIMOS';

function formatQuantity(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatPercent(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0,00%';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Seção de Saldos de Atas de Registro de Preços (ARP) do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-G)
 * 
 * Princípios Fundamentais:
 * 1. Projeção estrita da dimensão física/quantitativa das Atas (Quantidade Homologada, Empenhada e Saldo);
 * 2. Isolamento absoluto entre Saldo Físico de ARP e Valores Financeiros/Contratuais (Zero menção a R$);
 * 3. Prevenção de dupla contagem através da leitura da view consolidada por item soberano;
 * 4. Tratamento resiliente de loading (skeleton), erro e empty state.
 */
export const ManagementArpBalances: React.FC<ManagementArpBalancesProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  onNavigateAta,
  onNavigateContract
}) => {
  const [filter, setFilter] = useState<ArpItemFilter>('TODOS');

  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar saldos físicos de Atas de Registro de Preços';

  const arp = readModel?.arp;

  const filteredItems = useMemo(() => {
    if (!arp) return [];
    const baseList = arp.itensCriticosDetalhe || arp.topItensConsumidos || [];

    if (filter === 'CRITICOS') {
      return baseList.filter((item) => item.isCritico);
    }
    if (filter === 'PROXIMOS') {
      return baseList.filter((item) => item.isProximoLimite);
    }
    return baseList;
  }, [arp, filter]);

  // 1. Estado de Loading (Skeleton)
  if (isLoading) {
    return (
      <section
        data-testid="management-arp-balances-loading"
        aria-busy="true"
        aria-label="Carregando saldos físicos de Atas de Registro de Preços"
        className="management-arp-balances animate-pulse"
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
            <div style={{ height: '20px', background: '#cbd5e1', borderRadius: '4px', width: '60%' }} />
            <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '4px', width: '80%', marginTop: '0.5rem' }} />
          </div>
          <div style={{ width: '120px', height: '28px', background: '#e2e8f0', borderRadius: '6px' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '90px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
          ))}
        </div>
        <div style={{ height: '180px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
      </section>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <section
        data-testid="management-arp-balances-error"
        aria-labelledby="arp-balances-title"
        className="management-arp-balances"
        style={{
          background: '#fef2f2',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #fecaca',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b', fontWeight: 700, fontSize: '1rem' }}>
          <AlertCircle size={20} aria-hidden="true" />
          <span>Saldos de ARP — Erro ao carregar dados oficiais</span>
        </div>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
          {errorMessage}
        </p>
      </section>
    );
  }

  const hasNoArpData = !arp || (arp.totalItens === 0 && arp.totalAtas === 0);

  // 3. Estado Vazio
  if (hasNoArpData) {
    return (
      <section
        data-testid="management-arp-balances-empty"
        aria-labelledby="arp-balances-title"
        className="management-arp-balances"
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
              id="arp-balances-title"
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
              <Boxes size={20} color="#6366f1" aria-hidden="true" />
              <span>Saldos Físicos de Ata de Registro de Preços (ARP)</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Acompanhamento quantitativo consolidado dos itens registrados
            </p>
          </div>
        </div>
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1'
          }}
        >
          <Boxes size={32} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} aria-hidden="true" />
          <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: '0.95rem' }}>
            Nenhuma Ata de Registro de Preços ou item encontrado
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
            Não há registros de itens de ARP disponíveis para a UASG {uasg}.
          </p>
        </div>
      </section>
    );
  }

  const {
    totalAtas = 0,
    totalItens = 0,
    itensCriticosCount = 0,
    itensProximosLimiteCount = 0,
    quantidadeHomologadaTotal = 0,
    quantidadeEmpenhadaTotal = 0,
    saldoFisicoTotal = 0,
    percentualConsumoGlobal = 0
  } = arp;

  return (
    <section
      data-testid="management-arp-balances-section"
      aria-labelledby="arp-balances-title"
      className="management-arp-balances"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginTop: '1.5rem'
      }}
    >
      {/* Cabeçalho da Seção */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h3
            id="arp-balances-title"
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
            <Boxes size={22} color="#6366f1" aria-hidden="true" />
            <span>Saldos Físicos de Ata de Registro de Preços (ARP)</span>
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Consumo físico e saldo quantitativo oficial dos itens registrados (SSOT: <code>v_arp_item_saldo_detalhado</code>)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            data-testid="arp-total-atas-badge"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '9999px',
              background: '#ede9fe',
              color: '#5b21b6',
              border: '1px solid #ddd6fe'
            }}
          >
            {totalAtas} {totalAtas === 1 ? 'Ata' : 'Atas'}
          </span>
          <span
            data-testid="arp-total-itens-badge"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '9999px',
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #e2e8f0'
            }}
          >
            {totalItens} {totalItens === 1 ? 'Item Monitorado' : 'Itens Monitorados'}
          </span>
        </div>
      </div>

      {/* Grid de Métricas Principais (Dimensão Física) */}
      <div
        data-testid="arp-metrics-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}
      >
        {/* 1. Quantidade Homologada Total */}
        <div
          data-testid="arp-metric-homologado"
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quantidade Homologada
          </span>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {formatQuantity(quantidadeHomologadaTotal)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.35rem' }}>unidades</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Total registrado nas Atas
          </span>
        </div>

        {/* 2. Quantidade Empenhada Total */}
        <div
          data-testid="arp-metric-empenhado"
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quantidade Empenhada
          </span>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb' }}>
              {formatQuantity(quantidadeEmpenhadaTotal)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.35rem' }}>unidades</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, marginTop: '0.25rem' }}>
            {formatPercent(percentualConsumoGlobal)} do total homologado
          </span>
        </div>

        {/* 3. Saldo Físico Disponível */}
        <div
          data-testid="arp-metric-saldo"
          style={{
            background: saldoFisicoTotal > 0 ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${saldoFisicoTotal > 0 ? '#bbf7d0' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Saldo Físico Disponível
          </span>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d' }}>
              {formatQuantity(saldoFisicoTotal)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#166534', marginLeft: '0.35rem' }}>unidades</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
            Disponível para emissão de empenhos
          </span>
        </div>

        {/* 4. Saúde dos Itens (Críticos vs Próximos) */}
        <div
          data-testid="arp-metric-status"
          style={{
            background: itensCriticosCount > 0 ? '#fff1f2' : '#f8fafc',
            border: `1px solid ${itensCriticosCount > 0 ? '#fecdd3' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: itensCriticosCount > 0 ? '#be123c' : '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Itens em Atenção
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: itensCriticosCount > 0 ? '#e11d48' : '#334155' }}>
                {itensCriticosCount}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#e11d48', fontWeight: 700 }}>críticos (≥85%)</span>
            </div>
            {itensProximosLimiteCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#d97706' }}>
                  {itensProximosLimiteCount}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 600 }}>próximos</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: itensCriticosCount > 0 ? '#be123c' : '#64748b', marginTop: '0.25rem' }}>
            {itensCriticosCount === 0 && itensProximosLimiteCount === 0 ? 'Nenhum item em estado crítico' : 'Exigem atenção no fornecimento'}
          </span>
        </div>
      </div>

      {/* Barra de Progresso do Consumo Físico Global */}
      <div
        data-testid="arp-global-consumption-bar"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
            Consumo Físico Global da Carteira de Itens
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: percentualConsumoGlobal >= 85 ? '#e11d48' : '#2563eb' }}>
            {formatPercent(percentualConsumoGlobal)} consumido
          </span>
        </div>
        <div
          style={{
            height: '10px',
            width: '100%',
            background: '#e2e8f0',
            borderRadius: '9999px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, percentualConsumoGlobal))}%`,
              background: percentualConsumoGlobal >= 85 ? '#e11d48' : (percentualConsumoGlobal >= 70 ? '#f59e0b' : '#6366f1'),
              borderRadius: '9999px',
              transition: 'width 0.4s ease-in-out'
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>
          <span>0 un</span>
          <span>Empenhado: {formatQuantity(quantidadeEmpenhadaTotal)} un</span>
          <span>Homologado: {formatQuantity(quantidadeHomologadaTotal)} un</span>
        </div>
      </div>

      {/* Seção da Tabela / Lista de Itens Críticos */}
      <div
        data-testid="arp-critical-items-container"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      >
        {/* Header da Tabela com Filtros */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            background: '#fafafa'
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              Itens que Exigem Acompanhamento
            </h4>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Ordenados por maior percentual de consumo e menor saldo disponível
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={14} color="#64748b" aria-hidden="true" />
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '0.25rem' }}>Filtro:</span>
            <button
              type="button"
              data-testid="arp-filter-todos"
              onClick={() => setFilter('TODOS')}
              style={{
                fontSize: '0.75rem',
                fontWeight: filter === 'TODOS' ? 700 : 500,
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                border: filter === 'TODOS' ? '1px solid #6366f1' : '1px solid #cbd5e1',
                background: filter === 'TODOS' ? '#ede9fe' : '#ffffff',
                color: filter === 'TODOS' ? '#5b21b6' : '#475569',
                cursor: 'pointer'
              }}
            >
              Todos ({arp.itensCriticosDetalhe?.length || arp.topItensConsumidos.length})
            </button>
            <button
              type="button"
              data-testid="arp-filter-criticos"
              onClick={() => setFilter('CRITICOS')}
              style={{
                fontSize: '0.75rem',
                fontWeight: filter === 'CRITICOS' ? 700 : 500,
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                border: filter === 'CRITICOS' ? '1px solid #e11d48' : '1px solid #cbd5e1',
                background: filter === 'CRITICOS' ? '#fff1f2' : '#ffffff',
                color: filter === 'CRITICOS' ? '#be123c' : '#475569',
                cursor: 'pointer'
              }}
            >
              Críticos (≥85%)
            </button>
            <button
              type="button"
              data-testid="arp-filter-proximos"
              onClick={() => setFilter('PROXIMOS')}
              style={{
                fontSize: '0.75rem',
                fontWeight: filter === 'PROXIMOS' ? 700 : 500,
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                border: filter === 'PROXIMOS' ? '1px solid #d97706' : '1px solid #cbd5e1',
                background: filter === 'PROXIMOS' ? '#fffbeb' : '#ffffff',
                color: filter === 'PROXIMOS' ? '#b45309' : '#475569',
                cursor: 'pointer'
              }}
            >
              Próximos (70-84%)
            </button>
          </div>
        </div>

        {/* Tabela de Itens */}
        {filteredItems.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            Nenhum item corresponde ao filtro selecionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="arp-items-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8rem',
                textAlign: 'left'
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Ata / Item</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Descrição / Fornecedor</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Homologado</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Empenhado</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Saldo Físico</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, minWidth: '150px' }}>Consumo Físico</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item: ManagementDashboardArpItemSummary) => {
                  const isCrit = item.isCritico;
                  const isProx = item.isProximoLimite;

                  const badgeBg = isCrit ? '#fff1f2' : (isProx ? '#fffbeb' : '#f0fdf4');
                  const badgeColor = isCrit ? '#be123c' : (isProx ? '#b45309' : '#15803d');
                  const badgeBorder = isCrit ? '#fecdd3' : (isProx ? '#fde68a' : '#bbf7d0');
                  const badgeText = isCrit ? 'Crítico (≥85%)' : (isProx ? 'Próximo (70-84%)' : 'Regular (<70%)');

                  return (
                    <tr
                      key={item.itemKey}
                      data-testid={`arp-item-row-${item.itemKey}`}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Ata / Item */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          Ata {item.numeroAta}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Item nº {item.numeroItem}
                        </div>
                        {item.totalEmpenhosVinculados !== undefined && item.totalEmpenhosVinculados > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '0.2rem' }}>
                            {item.totalEmpenhosVinculados} {item.totalEmpenhosVinculados === 1 ? 'empenho' : 'empenhos'}
                          </div>
                        )}
                      </td>

                      {/* Descrição / Fornecedor */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', maxWidth: '280px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: '#1e293b',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={item.descricaoItem || 'Item de ARP'}
                        >
                          {item.descricaoItem || 'Item sem descrição'}
                        </div>
                        {item.fornecedorNome && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={item.fornecedorNome}
                          >
                            {item.fornecedorNome}
                          </div>
                        )}
                      </td>

                      {/* Quantidade Homologada */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                        {formatQuantity(item.quantidadeHomologada)}
                      </td>

                      {/* Quantidade Empenhada */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                        {formatQuantity(item.quantidadeConsumida)}
                      </td>

                      {/* Saldo Físico */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right', fontWeight: 800, color: item.saldoDisponivel > 0 ? '#15803d' : '#e11d48' }}>
                        {formatQuantity(item.saldoDisponivel)}
                      </td>

                      {/* Consumo Físico (%) + Barra */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              background: badgeBg,
                              color: badgeColor,
                              border: `1px solid ${badgeBorder}`
                            }}
                          >
                            {badgeText}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: badgeColor }}>
                            {formatPercent(item.percentualConsumido)}
                          </span>
                        </div>
                        <div
                          style={{
                            height: '6px',
                            width: '100%',
                            background: '#e2e8f0',
                            borderRadius: '9999px',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(0, item.percentualConsumido))}%`,
                              background: isCrit ? '#e11d48' : (isProx ? '#f59e0b' : '#22c55e'),
                              borderRadius: '9999px'
                            }}
                          />
                        </div>
                      </td>

                      {/* Ações / Drill-down */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                          {onNavigateAta && (
                            <button
                              type="button"
                              data-testid={`btn-navigate-ata-${item.itemKey}`}
                              onClick={() => onNavigateAta(item.numeroAta)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: '#6366f1',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0.2rem 0.4rem'
                              }}
                            >
                              <span>Ver Ata</span>
                              <ChevronRight size={12} aria-hidden="true" />
                            </button>
                          )}
                          {item.contractKey && onNavigateContract && (
                            <button
                              type="button"
                              data-testid={`btn-navigate-contract-${item.itemKey}`}
                              onClick={() => onNavigateContract(item.contractKey!)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: '#0284c7',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0.2rem 0.4rem'
                              }}
                            >
                              <span>Contrato 360°</span>
                              <ExternalLink size={12} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

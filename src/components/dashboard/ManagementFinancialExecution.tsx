import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  AlertCircle,
  Search,
  Filter,
  XCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type {
  ManagementDashboardReadModel,
  ManagementDashboardEmpenhoDetail
} from '../../types/managementDashboard';

export interface ManagementFinancialExecutionProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  onNavigateContract?: (contractKey: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export type EmpenhoFilter = 'TODOS' | 'COM_SALDO' | 'EXECUTADOS';

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Seção de Execução Financeira Detalhada do Dashboard Gerencial (SaldoARP 3.0 — Fase 9-I)
 * 
 * Princípios Fundamentais:
 * 1. Projeção estrita dos fatos financeiros oficiais (Empenhos, Liquidações, Pagamentos, RP);
 * 2. Isolamento total entre Execução Financeira e Saldo Físico de Ata de Registro de Preços;
 * 3. Prevenção absoluta de dupla contagem através da ancoragem na chave soberana de empenho;
 * 4. Tratamento resiliente de loading (skeleton), erro explícito e empty state.
 */
export const ManagementFinancialExecution: React.FC<ManagementFinancialExecutionProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  onNavigateContract,
  onRefresh,
  isRefreshing
}) => {
  const [filter, setFilter] = useState<EmpenhoFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar execução orçamentária e financeira';

  const financial = readModel?.financial;

  // Filtragem e busca local determinística sobre a lista de empenhos oficiais
  const filteredEmpenhos = useMemo(() => {
    if (!financial || !financial.topEmpenhos) return [];
    let list = financial.topEmpenhos;

    if (filter === 'COM_SALDO') {
      list = list.filter((emp) => emp.saldoNaoExecutado > 0);
    } else if (filter === 'EXECUTADOS') {
      list = list.filter((emp) => emp.saldoNaoExecutado <= 0 || emp.percentualExecutado >= 100);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((emp) => {
        const num = String(emp.numeroEmpenho || '').toLowerCase();
        const ano = String(emp.ano || '').toLowerCase();
        const forn = String(emp.fornecedorNome || '').toLowerCase();
        const cont = String(emp.contratoNumero || '').toLowerCase();
        return num.includes(q) || ano.includes(q) || forn.includes(q) || cont.includes(q);
      });
    }

    return list;
  }, [financial, filter, searchQuery]);

  // 1. Estado de Loading
  if (isLoading) {
    return (
      <section
        data-testid="management-financial-execution-loading"
        aria-busy="true"
        aria-label="Carregando execução orçamentária e financeira detalhada"
        className="management-financial-execution animate-pulse"
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
          <div style={{ width: '140px', height: '24px', background: '#e2e8f0', borderRadius: '6px' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '90px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
          ))}
        </div>
        <div style={{ height: '140px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
      </section>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <section
        data-testid="management-financial-execution-error"
        role="alert"
        aria-label={`Erro na execução financeira: ${errorMessage}`}
        className="management-financial-execution"
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
          <AlertCircle size={20} aria-hidden="true" />
          <span>Execução Financeira — Erro ao carregar dados oficiais</span>
        </div>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
          {errorMessage}
        </p>
      </section>
    );
  }

  const hasNoFinancialData = !financial || (financial.totalEmpenhado === 0 && financial.totalPago === 0);

  // 3. Estado Vazio
  if (hasNoFinancialData) {
    return (
      <section
        data-testid="management-financial-execution-empty"
        aria-labelledby="financial-execution-title"
        className="management-financial-execution"
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
              id="financial-execution-title"
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
              <CreditCard size={20} color="#0284c7" aria-hidden="true" />
              <span>Execução Orçamentária e Financeira Oficial</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Dados consolidados do SIAFI / Contratos.gov
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
            Não há execução financeira disponível para o período selecionado.
          </div>
          <div style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>
            Nenhum registro oficial de empenho ou pagamento foi localizado na base SIAFI/Contratos.gov.
          </div>
        </div>
      </section>
    );
  }

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else if (hookResult.refresh) {
      hookResult.refresh();
    } else if (hookResult.refetch) {
      hookResult.refetch();
    }
  };

  return (
    <section
      data-testid="management-financial-execution"
      aria-labelledby="financial-execution-title"
      className="management-financial-execution"
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
            id="financial-execution-title"
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
            <CreditCard size={20} color="#0284c7" aria-hidden="true" />
            <span>Execução Orçamentária e Financeira Oficial</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.55rem',
                borderRadius: '12px',
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0'
              }}
            >
              SIAFI / Contratos.gov
            </span>
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
            Fatos financeiros soberanos de empenhos, liquidações e ordens bancárias
          </p>
        </div>

        {/* Resumo Taxas e Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              <span style={{ color: '#64748b' }}>Liq/Emp: </span>
              <strong style={{ color: '#0284c7' }}>{financial.taxaLiquidacaoPercentual}%</strong>
            </div>
            <div style={{ height: '14px', width: '1px', background: '#cbd5e1' }} />
            <div>
              <span style={{ color: '#64748b' }}>Pago/Liq: </span>
              <strong style={{ color: '#059669' }}>{financial.taxaPagamentoPercentual}%</strong>
            </div>
          </div>

          <button
            type="button"
            data-testid="empenhos-refresh-btn"
            onClick={handleRefresh}
            title="Atualizar dados financeiros"
            aria-label="Atualizar dados financeiros"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#64748b',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 1. Funil de Execução Financeira (Empenhado -> Liquidado -> Pago) */}
      <div
        data-testid="financial-funnel-card"
        style={{
          background: '#f8fafc',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1.25rem',
          marginBottom: '1.25rem'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Empenhado */}
          <div data-testid="metric-total-empenhado">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
              1. Total Empenhado
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
              {formatCurrency(financial.totalEmpenhado)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>
              100% da dotação vinculada
            </div>
          </div>

          {/* Liquidado */}
          <div data-testid="metric-total-liquidado">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>
              2. Total Liquidado
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0369a1', marginTop: '0.25rem' }}>
              {formatCurrency(financial.totalLiquidado)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '0.15rem' }}>
              {financial.taxaLiquidacaoPercentual}% executado formalmente
            </div>
          </div>

          {/* Pago */}
          <div data-testid="metric-total-pago">
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#059669' }}>
              3. Total Pago (Ordem Bancária)
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#065f46', marginTop: '0.25rem' }}>
              {formatCurrency(financial.totalPago)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '0.15rem' }}>
              {financial.taxaPagamentoPercentual}% sobre o liquidado
            </div>
          </div>
        </div>

        {/* Barra de Progresso Visual de Liquidação / Pagamento */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div
              style={{
                width: `${Math.min(100, financial.taxaLiquidacaoPercentual)}%`,
                background: '#0284c7',
                transition: 'width 0.3s ease'
              }}
              title={`Liquidado: ${financial.taxaLiquidacaoPercentual}%`}
            />
          </div>
        </div>
      </div>

      {/* 2. Grid de Saldos Financeiros Canônicos (4 Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem'
        }}
      >
        {/* Saldo a Liquidar */}
        <div
          data-testid="metric-saldo-a-liquidar"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #0284c7',
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
            Saldo a Liquidar
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {formatCurrency(financial.saldoALiquidar)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            Empenhado − Liquidado
          </div>
        </div>

        {/* Saldo a Pagar */}
        <div
          data-testid="metric-saldo-a-pagar"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>
            Saldo a Pagar
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {formatCurrency(financial.saldoAPagar)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            Liquidado − Pago
          </div>
        </div>

        {/* Saldo Não Executado */}
        <div
          data-testid="metric-saldo-nao-executado"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #64748b',
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Saldo Não Executado
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {formatCurrency(financial.saldoNaoExecutado)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            Empenhado − Pago
          </div>
        </div>

        {/* Restos a Pagar Pendentes */}
        <div
          data-testid="metric-saldo-rp-pendente"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #8b5cf6',
            borderRadius: '8px',
            padding: '0.85rem 1rem'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
            Restos a Pagar (RP)
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {formatCurrency(financial.saldoRpPendente)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            Inscrito: {formatCurrency(financial.totalRpInscrito)} | Pago: {formatCurrency(financial.totalRpPago)}
          </div>
        </div>
      </div>

      {/* 3. Camada 1: Barra de Filtros e Busca Padronizada */}
      <div
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.65rem 0.95rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          fontSize: '0.8rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748b', fontWeight: 700, fontSize: '0.76rem', flexShrink: 0 }}>
            <Filter size={13} /> Filtros:
          </div>

          {/* Select de Situação de Execução */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            data-testid="empenhos-filter-status"
            style={{
              maxWidth: '220px',
              minWidth: '160px',
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.78rem',
              color: '#0f172a',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <option value="TODOS" data-testid="empenhos-filter-todos">Todas as Situações</option>
            <option value="COM_SALDO" data-testid="empenhos-filter-com-saldo">Com Saldo a Executar</option>
            <option value="EXECUTADOS" data-testid="empenhos-filter-executados">100% Executados</option>
          </select>

          {/* Busca textual */}
          <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '380px' }}>
            <Search
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              data-testid="empenhos-search-input"
              placeholder="Buscar empenho, credor, contrato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.65rem 0.35rem 2rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.78rem',
                color: '#0f172a',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Limpar busca"
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: 0
                }}
              >
                <XCircle size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {(filter !== 'TODOS' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setFilter('TODOS');
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={12} /> Limpar
            </button>
          )}
        </div>

        {/* Contador à Direita */}
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
          {filteredEmpenhos.length === (financial.topEmpenhos?.length || 0)
            ? `${financial.topEmpenhos?.length || 0} empenhos`
            : `${filteredEmpenhos.length} de ${financial.topEmpenhos?.length || 0} empenhos`}
        </div>
      </div>

      {/* 4. Camada 2: Card da Tabela de Empenhos (Soberano, abre diretamente no thead) */}
      <div
        data-testid="empenhos-table-container"
        style={{
          marginTop: '0.85rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Tabela ou Empty State de Filtro */}
        {filteredEmpenhos.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
              Nenhuma nota de empenho corresponde aos filtros aplicados.
            </p>
            <p style={{ margin: '0.35rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
              Altere a situação ou limpe o termo de busca para visualizar os empenhos da unidade.
            </p>
            {(filter !== 'TODOS' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFilter('TODOS');
                  setSearchQuery('');
                }}
                style={{
                  marginTop: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#0c326f',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={12} /> Limpar Filtros
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="table-empenhos"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                textAlign: 'left'
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Nota de Empenho</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Credor / Fornecedor</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Contrato</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Empenhado</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Liquidado</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Pago</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Saldo a Executar</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>% Exec.</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmpenhos.map((emp: ManagementDashboardEmpenhoDetail) => (
                  <tr
                    key={emp.empenhoKey}
                    data-testid={`row-empenho-${emp.numeroEmpenho}`}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                      {emp.numeroEmpenho}
                      {emp.ano && <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '0.25rem' }}>/{emp.ano}</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {emp.fornecedorNome || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                      {emp.contratoNumero ? (
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>Contrato {emp.contratoNumero}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Sem contrato</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(emp.valorEmpenhado)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#0284c7' }}>
                      {formatCurrency(emp.valorLiquidado)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                      {formatCurrency(emp.valorPago)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#64748b' }}>
                      {formatCurrency(emp.saldoNaoExecutado)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: emp.percentualExecutado >= 80 ? '#ecfdf5' : (emp.percentualExecutado >= 40 ? '#eff6ff' : '#f8fafc'),
                          color: emp.percentualExecutado >= 80 ? '#065f46' : (emp.percentualExecutado >= 40 ? '#1d4ed8' : '#64748b'),
                          border: emp.percentualExecutado >= 80 ? '1px solid #a7f3d0' : (emp.percentualExecutado >= 40 ? '1px solid #bfdbfe' : '1px solid #e2e8f0')
                        }}
                      >
                        {emp.percentualExecutado}%
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {emp.contratoNumero && onNavigateContract ? (
                        <button
                          type="button"
                          data-testid={`btn-navigate-contract-${emp.numeroEmpenho}`}
                          onClick={() => onNavigateContract(emp.contratoNumero!)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#0c326f',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            padding: '0.35rem 0.65rem'
                          }}
                        >
                          <span>Contrato 360°</span>
                          <ExternalLink size={12} aria-hidden="true" />
                        </button>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nota de Conformidade Contábil */}
      <div
        style={{
          marginTop: '1.25rem',
          padding: '0.75rem 1rem',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          fontSize: '0.75rem',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        <ShieldCheck size={16} color="#0284c7" style={{ flexShrink: 0 }} aria-hidden="true" />
        <div>
          <strong>Nota de Conformidade Contábil:</strong> Os valores e saldos desta tela refletem exclusivamente os fatos orçamentários oficiais extraídos do SIAFI (<code>v_empenhos_resumo</code>). O consumo de saldo físico das Atas de Registro de Preços é mantido na dimensão física (<code>v_arp_item_saldo_detalhado</code>).
        </div>
      </div>
    </section>
  );
};

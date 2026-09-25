import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertCircle,
  ExternalLink,
  Filter,
  CheckCircle2,
  FileCheck,
  Search,
  RefreshCw,
  XCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type {
  ManagementDashboardReadModel
} from '../../types/managementDashboard';
import type {
  PaymentFollowUpCycle,
  PaymentWorkflowStatus
} from '../../types/paymentFollowUp';

export interface ManagementPaymentsOverviewProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  onNavigateContract?: (contractKey: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export type PaymentFilter = 'TODOS' | 'CRITICOS' | 'CGOFI' | 'INSTRUCAO' | 'CONFIRMADOS';

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

export function getWorkflowStatusDisplay(status: PaymentWorkflowStatus): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (status) {
    case 'RECEBIDO':
      return { label: 'Atesto Recebido', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
    case 'ATRIBUIDO':
      return { label: 'Atribuído', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    case 'EM_INSTRUCAO':
      return { label: 'Em Instrução', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
    case 'PENDENTE_DOCUMENTACAO':
      return { label: 'Pendência Documental', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    case 'DESPACHO_ELABORADO':
      return { label: 'Despacho Elaborado', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' };
    case 'ENVIADO_CGOFI':
      return { label: 'Enviado à CGOFI', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
    case 'AGUARDANDO_CGOFI':
      return { label: 'Aguardando CGOFI', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
    case 'DEVOLVIDO_FISCAL':
      return { label: 'Devolvido pela CGOFI', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    case 'PAGAMENTO_CONFIRMADO':
      return { label: 'Pagamento Confirmado (OB)', bg: '#f0fdf4', color: '#166534', border: '#86efac' };
    case 'CONCLUIDO':
      return { label: 'Concluído', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    case 'CANCELADO':
      return { label: 'Cancelado', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
    default:
      return { label: status, bg: '#f1f5f9', color: '#334155', border: '#e2e8f0' };
  }
}

/**
 * Seção de Faturamento e Acompanhamento de Pagamentos do Dashboard Gerencial (SaldoARP 3.0 — Fase 9-H)
 * 
 * Princípios Fundamentais:
 * 1. Separação explícita entre Acompanhamento Operacional (Atesto, Instrução, CGOFI, OB) e Execução Financeira Oficial (SIAFI);
 * 2. Projeção fiel dos ciclos originados no paymentFollowUpService;
 * 3. Identificação transparente de gargalos da CGOFI (> 5 dias úteis sem resposta);
 * 4. Exibição da Ordem Bancária quando o ciclo estiver com pagamento confirmado, sem criar novos fatos financeiros;
 * 5. Tratamento de loading (skeleton), erro explícito e empty state.
 */
export const ManagementPaymentsOverview: React.FC<ManagementPaymentsOverviewProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  onNavigateContract,
  onRefresh,
  isRefreshing
}) => {
  const [filter, setFilter] = useState<PaymentFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar dados de faturamento e pagamentos';

  const payments = readModel?.payments;

  const filteredCycles = useMemo(() => {
    if (!payments) return [];
    const baseList = payments.ciclosAbertosDetalhe || payments.ciclosRecentes || [];

    let list = baseList;

    if (filter === 'CRITICOS') {
      list = baseList.filter(
        (c) => c.prazos?.statusPrazo === 'CRITICO' || c.prazos?.statusPrazo === 'VENCIDO' || c.prazos?.isVencida
      );
    } else if (filter === 'CGOFI') {
      list = baseList.filter(
        (c) => c.status === 'AGUARDANDO_CGOFI' || c.status === 'ENVIADO_CGOFI' || (c.prazos?.diasSemRespostaCgofi ?? 0) > 5
      );
    } else if (filter === 'INSTRUCAO') {
      list = baseList.filter(
        (c) => c.status === 'RECEBIDO' || c.status === 'ATRIBUIDO' || c.status === 'EM_INSTRUCAO' || c.status === 'PENDENTE_DOCUMENTACAO' || c.status === 'DESPACHO_ELABORADO'
      );
    } else if (filter === 'CONFIRMADOS') {
      list = baseList.filter(
        (c) => c.status === 'PAGAMENTO_CONFIRMADO' || c.status === 'CONCLUIDO' || Boolean(c.input?.numeroOrdemBancaria)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => {
        const ck = String(c.contractKey || '').toLowerCase();
        const comp = String(c.competencia || '').toLowerCase();
        const doc = String(c.input?.documentoAtestoSei || '').toLowerCase();
        const proc = String(c.input?.numeroProcessoPagamentoSei || '').toLowerCase();
        const resp = String(c.input?.responsavelNome || '').toLowerCase();
        const ob = String(c.input?.numeroOrdemBancaria || '').toLowerCase();
        return ck.includes(q) || comp.includes(q) || doc.includes(q) || proc.includes(q) || resp.includes(q) || ob.includes(q);
      });
    }

    return list;
  }, [payments, filter, searchQuery]);

  // 1. Estado de Loading (Skeleton)
  if (isLoading) {
    return (
      <section
        data-testid="management-payments-overview-loading"
        aria-busy="true"
        aria-label="Carregando acompanhamento de faturamento e pagamentos"
        className="management-payments-overview animate-pulse"
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
        data-testid="management-payments-overview-error"
        aria-labelledby="payments-overview-title"
        className="management-payments-overview"
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
          <span>Faturamento & Pagamentos — Erro ao carregar dados operacionais</span>
        </div>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
          {errorMessage}
        </p>
      </section>
    );
  }

  const hasNoData = !payments || payments.totalCiclos === 0;

  // 3. Estado Vazio
  if (hasNoData) {
    return (
      <section
        data-testid="management-payments-overview-empty"
        aria-labelledby="payments-overview-title"
        className="management-payments-overview"
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
              id="payments-overview-title"
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
              <FileCheck size={20} color="#0d9488" aria-hidden="true" />
              <span>Acompanhamento de Faturamento e Pagamentos</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Fluxo operacional de faturas, atestos e tramitação CGOFI
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
          <Clock size={32} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} aria-hidden="true" />
          <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: '0.95rem' }}>
            Nenhum ciclo de pagamento registrado
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
            Não há faturas ou atestos operacionais cadastrados para a UASG {uasg}.
          </p>
        </div>
      </section>
    );
  }

  const {
    totalCiclos,
    ciclosAbertosCount,
    ciclosConcluidosCount,
    ciclosCriticosCount,
    ciclosAtrasoCgofiCount,
    faturasVencidasCount = 0,
    faturasVenceHojeCount = 0,
    faturasProximasVencimentoCount = 0,
    envioCgofiAtrasadoCount = 0,
    documentacaoPendenteCount = 0,
    margemEnvioEstreitaCount = 0,
    distribuicaoPorEstado = {},
    tempoMedioCgofiDisponivel,
    tempoMedioCgofiDias
  } = payments;

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
      data-testid="management-payments-overview-section"
      aria-labelledby="payments-overview-title"
      className="management-payments-overview"
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
          gap: '1rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h3
            id="payments-overview-title"
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
            <FileCheck size={22} color="#0d9488" aria-hidden="true" />
            <span>Acompanhamento de Faturamento e Pagamentos</span>
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Fluxo operacional de faturas, atestos, prazos e tramitação CGOFI (Fonte: <code>paymentFollowUpService</code>)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            data-testid="payments-total-ciclos-badge"
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
            {totalCiclos} {totalCiclos === 1 ? 'Ciclo Total' : 'Ciclos Totais'}
          </span>
          <span
            data-testid="payments-abertos-badge"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '9999px',
              background: '#ccfbf1',
              color: '#0f766e',
              border: '1px solid #99f6e4'
            }}
          >
            {ciclosAbertosCount} {ciclosAbertosCount === 1 ? 'Em Andamento' : 'Em Andamento'}
          </span>
          <span
            data-testid="payments-concluidos-badge"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '9999px',
              background: '#f0fdf4',
              color: '#15803d',
              border: '1px solid #bbf7d0'
            }}
          >
            {ciclosConcluidosCount} {ciclosConcluidosCount === 1 ? 'Concluído' : 'Concluídos'}
          </span>

          <button
            type="button"
            data-testid="payments-refresh-btn"
            onClick={handleRefresh}
            title="Atualizar dados de faturamento"
            aria-label="Atualizar dados de faturamento"
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

      {/* Grid de KPIs Operacionais (4 Cards) */}
      <div
        data-testid="payments-metrics-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}
      >
        {/* 1. Ciclos Abertos */}
        <div
          data-testid="payments-kpi-abertos"
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
            Ciclos em Tramitação
          </span>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              {ciclosAbertosCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.35rem' }}>faturas ativas</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Atestos recebidos em processamento
          </span>
        </div>

        {/* 2. Faturas Críticas / Vencidas */}
        <div
          data-testid="payments-kpi-criticas"
          style={{
            background: (faturasVencidasCount > 0 || ciclosCriticosCount > 0) ? '#fff1f2' : '#f8fafc',
            border: `1px solid ${(faturasVencidasCount > 0 || ciclosCriticosCount > 0) ? '#fecdd3' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: faturasVencidasCount > 0 ? '#be123c' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Urgência de Vencimento
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: faturasVencidasCount > 0 ? '#e11d48' : '#0f172a' }}>
              {faturasVencidasCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#e11d48', fontWeight: 700 }}>vencidas</span>
            {(faturasVenceHojeCount > 0 || faturasProximasVencimentoCount > 0) && (
              <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
                (+{faturasVenceHojeCount + faturasProximasVencimentoCount} em ≤3d)
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: faturasVencidasCount > 0 ? '#be123c' : '#64748b', marginTop: '0.25rem' }}>
            {faturasVencidasCount > 0 ? 'Risco de juros e mora contratual' : 'Nenhuma fatura vencida no momento'}
          </span>
        </div>

        {/* 3. Gargalo CGOFI (>5 dias sem resposta) */}
        <div
          data-testid="payments-kpi-cgofi"
          style={{
            background: ciclosAtrasoCgofiCount > 0 ? '#fff7ed' : '#f8fafc',
            border: `1px solid ${ciclosAtrasoCgofiCount > 0 ? '#fed7aa' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: ciclosAtrasoCgofiCount > 0 ? '#c2410c' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Gargalo CGOFI
          </span>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: ciclosAtrasoCgofiCount > 0 ? '#ea580c' : '#0f172a' }}>
              {ciclosAtrasoCgofiCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#c2410c', marginLeft: '0.35rem', fontWeight: 600 }}>
              {ciclosAtrasoCgofiCount === 1 ? 'processo > 5 dias úteis' : 'processos > 5 dias úteis'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: ciclosAtrasoCgofiCount > 0 ? '#c2410c' : '#64748b', marginTop: '0.25rem' }}>
            Aguardando emissão de Ordem Bancária
          </span>
        </div>

        {/* 4. Pendências & Prazos Internos */}
        <div
          data-testid="payments-kpi-pendencias"
          style={{
            background: (documentacaoPendenteCount > 0 || envioCgofiAtrasadoCount > 0 || margemEnvioEstreitaCount > 0) ? '#fffbeb' : '#f8fafc',
            border: `1px solid ${(documentacaoPendenteCount > 0 || envioCgofiAtrasadoCount > 0 || margemEnvioEstreitaCount > 0) ? '#fde68a' : '#e2e8f0'}`,
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Pendências e Prazos
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309' }}>
              {documentacaoPendenteCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>pendências</span>
            {envioCgofiAtrasadoCount > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#e11d48', fontWeight: 700 }}>
                ({envioCgofiAtrasadoCount} envio atrasado)
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '0.25rem' }}>
            CNDs vencidas ou margem estreita
          </span>
        </div>
      </div>

      {/* Fluxo Operacional por Estágio do Workflow */}
      <div
        data-testid="payments-pipeline-container"
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
            Fluxo Operacional de Tramitação (Estágios do Workflow)
          </span>
          {tempoMedioCgofiDisponivel && typeof tempoMedioCgofiDias === 'number' ? (
            <span
              data-testid="payments-tempo-medio-cgofi"
              style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '0.2rem 0.5rem', borderRadius: '6px' }}
            >
              Tempo Médio CGOFI: {tempoMedioCgofiDias} dias úteis
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              SLA CGOFI: monitoramento contínuo
            </span>
          )}
        </div>

        <div
          data-testid="payments-stages-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.5rem'
          }}
        >
          {/* Estágio 1: Recebido / Atribuído */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>1. Recebido</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#334155', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['RECEBIDO'] || 0) + (distribuicaoPorEstado['ATRIBUIDO'] || 0)}
            </div>
          </div>

          {/* Estágio 2: Em Instrução */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>2. Em Instrução</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['EM_INSTRUCAO'] || 0) + (distribuicaoPorEstado['PENDENTE_DOCUMENTACAO'] || 0)}
            </div>
          </div>

          {/* Estágio 3: Despacho Elaborado */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>3. Despacho</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7e22ce', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['DESPACHO_ELABORADO'] || 0}
            </div>
          </div>

          {/* Estágio 4: CGOFI */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>4. CGOFI</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ea580c', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['ENVIADO_CGOFI'] || 0) + (distribuicaoPorEstado['AGUARDANDO_CGOFI'] || 0)}
            </div>
          </div>

          {/* Estágio 5: Pagamento / Concluído */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>5. Pago / Concluído</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['PAGAMENTO_CONFIRMADO'] || 0) + (distribuicaoPorEstado['CONCLUIDO'] || 0)}
            </div>
          </div>

          {/* Exceções: Devolvido / Cancelado */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Exceções</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['DEVOLVIDO_FISCAL'] || 0) + (distribuicaoPorEstado['CANCELADO'] || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Camada 1: Barra de Filtros & Contexto Desacoplada */}
      <div
        data-testid="payments-filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.65rem 0.95rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
          marginBottom: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
            <Filter size={13} color="#64748b" />
            <span>Filtros:</span>
          </div>

          {/* Select de Status do Fluxo */}
          <select
            data-testid="payments-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as PaymentFilter)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="TODOS">Todos os Ciclos ({payments.ciclosAbertosDetalhe?.length || payments.ciclosRecentes?.length || 0})</option>
            <option value="CRITICOS">Críticos / Vencidos</option>
            <option value="CGOFI">Gargalo CGOFI</option>
            <option value="INSTRUCAO">Em Instrução</option>
            <option value="CONFIRMADOS">Confirmados (OB)</option>
          </select>

          {/* Campo de Busca Textual */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '1', maxWidth: '380px' }}>
            <Search
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              data-testid="payments-search-input"
              placeholder="Buscar contrato, SEI, atesto, responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.65rem 0.35rem 2rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
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
          {filteredCycles.length === (payments.ciclosAbertosDetalhe?.length || payments.ciclosRecentes?.length || 0)
            ? `${filteredCycles.length} faturas`
            : `${filteredCycles.length} de ${payments.ciclosAbertosDetalhe?.length || payments.ciclosRecentes?.length || 0} faturas`}
        </div>
      </div>

      {/* 4. Camada 2: Card da Tabela de Pagamentos (Soberano, abre diretamente no thead) */}
      <div
        data-testid="payments-table-container"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Tabela ou Empty State de Filtro */}
        {filteredCycles.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#334155' }}>
              Nenhum ciclo de pagamento corresponde ao filtro ou busca selecionada.
            </p>
            {(filter !== 'TODOS' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFilter('TODOS');
                  setSearchQuery('');
                }}
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#0d9488',
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Limpar filtros e busca
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="payments-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8rem',
                textAlign: 'left'
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Contrato / Competência</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Atesto / Processo SEI</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Valor Atesto</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Estado do Workflow</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Prazos & SLA</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Ordem Bancária (OB)</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredCycles.map((cycle: PaymentFollowUpCycle) => {
                  const statusInfo = getWorkflowStatusDisplay(cycle.status);
                  const isVencida = cycle.prazos?.statusPrazo === 'VENCIDO' || cycle.prazos?.isVencida;
                  const diasVenc = cycle.prazos?.diasUteisAteVencimento ?? 0;
                  const diasCgofi = cycle.prazos?.diasSemRespostaCgofi ?? 0;

                  return (
                    <tr
                      key={cycle.cycleKey}
                      data-testid={`payment-row-${cycle.cycleKey}`}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Contrato / Competência */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          Contrato {cycle.contractKey}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Competência: {cycle.competencia || 'N/D'}
                        </div>
                      </td>

                      {/* Atesto / Processo SEI */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                          {cycle.input?.documentoAtestoSei || 'Atesto sem doc'}
                        </div>
                        {cycle.input?.numeroProcessoPagamentoSei && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Proc: {cycle.input.numeroProcessoPagamentoSei}
                          </div>
                        )}
                        {cycle.input?.responsavelNome && (
                          <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: '0.15rem' }}>
                            Resp: {cycle.input.responsavelNome}
                          </div>
                        )}
                      </td>

                      {/* Valor Atesto */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(cycle.input?.valorAtesto)}
                      </td>

                      {/* Estado do Workflow */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            border: `1px solid ${statusInfo.border}`,
                            display: 'inline-block'
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Prazos & SLA */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        {isVencida ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#be123c' }}>
                            FATURA VENCIDA ({Math.abs(diasVenc)}d úteis)
                          </span>
                        ) : diasVenc <= 3 ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>
                            Vence em {diasVenc} {diasVenc === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                            Vence em {diasVenc} dias úteis
                          </span>
                        )}
                        {diasCgofi > 5 && (cycle.status === 'AGUARDANDO_CGOFI' || cycle.status === 'ENVIADO_CGOFI') && (
                          <div style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: 700, marginTop: '0.2rem' }}>
                            CGOFI: {diasCgofi} dias sem resposta
                          </div>
                        )}
                      </td>

                      {/* Ordem Bancária */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        {cycle.input?.numeroOrdemBancaria ? (
                          <div>
                            <div style={{ fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <CheckCircle2 size={13} aria-hidden="true" />
                              <span>{cycle.input.numeroOrdemBancaria}</span>
                            </div>
                            {cycle.input.dataOrdemBancaria && (
                              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                Emitida em: {formatDateBR(cycle.input.dataOrdemBancaria)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Pendente de emissão
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right' }}>
                        {onNavigateContract && (
                          <button
                            type="button"
                            data-testid={`btn-navigate-payment-${cycle.cycleKey}`}
                            onClick={() => onNavigateContract(cycle.contractKey)}
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
                              padding: '0.35rem 0.65rem',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>Contrato 360°</span>
                            <ExternalLink size={12} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nota de Isolamento Arquitetural */}
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
        <ShieldCheck size={16} color="#0d9488" style={{ flexShrink: 0 }} aria-hidden="true" />
        <div>
          <strong>Nota de Conformidade:</strong> O status operacional <code>PAGAMENTO_CONFIRMADO</code> indica a conclusão da etapa administrativa de confirmação de Ordem Bancária no workflow interno. Os desembolsos financeiros soberanos são computados exclusivamente a partir dos fatos oficiais do SIAFI (<code>v_empenhos_resumo</code>).
        </div>
      </div>
    </section>
  );
};

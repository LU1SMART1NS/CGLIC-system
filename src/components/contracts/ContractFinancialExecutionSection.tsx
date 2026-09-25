import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  Receipt,
  Layers,
  ArrowRight,
  Loader2
} from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { useContractDetails } from '../../hooks/useContractDetails';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { aggregateContractFinancialExecution } from '../../services/financialExecutionService';

interface ContractFinancialExecutionSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
}

const formatCurrency = (val?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const parts = val.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(val).toLocaleDateString('pt-BR');
  } catch {
    return val;
  }
};

export interface NormalizedContractEmpenho {
  canonical_key: string;
  numero_oficial: string;
  credor_nome: string;
  data_emissao: string;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_rpinscrito: number;
  situacao: string;
}

export function prepareContractEmpenhosList(
  contract: Partial<ContractDashboardRecord>,
  detailsEmpenhos: any[] = [],
  dashboardEmpenhos: any[] = []
): NormalizedContractEmpenho[] {
  const rawEmpenhosFromDetails = (detailsEmpenhos || []).map((e) => ({
    canonical_key: e.canonical_key || `${contract.uasg || '200331'}-${e.ano || '2026'}-${e.numero_empenho || e.numeroEmpenho || e.numero || ''}`,
    numero_oficial: e.numero_oficial || e.numero_empenho || e.numeroEmpenho || e.numero || '',
    credor_nome: e.credor_nome || e.credor || e.fornecedor_nome || '',
    data_emissao: e.data_emissao || e.dataEmissao || '',
    valor_empenhado: Number(e.valor_empenhado ?? e.valorEmpenhado ?? e.valor ?? 0),
    valor_liquidado: Number(e.valor_liquidado ?? e.valorLiquidado ?? 0),
    valor_pago: Number(e.valor_pago ?? e.valorPago ?? 0),
    valor_rpinscrito: Number(e.valor_rpinscrito ?? 0),
    situacao: e.situacao || 'EMITIDO'
  }));

  const rawEmpenhosFromDashboard = (dashboardEmpenhos || []).map((e: any) => ({
    canonical_key: e.canonical_key || e.id || `${e.uasg || contract.uasg || '200331'}-${e.ano || '2026'}-${e.numero || ''}`,
    numero_oficial: e.numero_oficial || e.numero || '',
    credor_nome: e.credor_nome || e.credor || '',
    data_emissao: e.data_emissao || e.dataEmissao || '',
    valor_empenhado: Number(e.valor_empenhado ?? e.valor ?? 0),
    valor_liquidado: Number(e.valor_liquidado ?? 0),
    valor_pago: Number(e.valor_pago ?? 0),
    valor_rpinscrito: Number(e.valor_rpinscrito ?? 0),
    situacao: e.situacao || 'EMITIDO'
  }));

  // Mescla e deduplica por canonical_key (prevenção rigorosa contra double counting)
  const empenhoMap = new Map<string, NormalizedContractEmpenho>();
  for (const emp of [...rawEmpenhosFromDashboard, ...rawEmpenhosFromDetails]) {
    const key = emp.canonical_key || emp.numero_oficial;
    if (key && !empenhoMap.has(key)) {
      empenhoMap.set(key, emp);
    }
  }
  return Array.from(empenhoMap.values());
}

export const ContractFinancialExecutionSection: React.FC<ContractFinancialExecutionSectionProps> = ({
  contract,
  contractKey
}) => {
  const navigate = useNavigate();

  // Consulta detalhes sob demanda (Contratos.gov / Compras.gov)
  const { data: details, isLoading: loadingDetails, isError: errorDetails, refetch: refetchDetails } = useContractDetails(contract, true);

  // Consulta read model consolidado do dashboard para o contrato (v_empenhos_resumo via Supabase)
  const { readModel, isLoading: loadingDashboard, isError: errorDashboard, refetch: refetchDashboard } = useManagementDashboard({
    uasg: contract.uasg || '200331',
    contractKey
  });

  const isLoading = loadingDetails || loadingDashboard;
  const isError = Boolean((errorDetails || errorDashboard) && !details?.empenhos?.length && !readModel?.financial?.topEmpenhos?.length);

  // Unifica e normaliza a lista de empenhos do contrato sem duplicidade
  const empenhosList = prepareContractEmpenhosList(
    contract,
    details?.empenhos,
    readModel?.financial?.topEmpenhos
  );

  // 1. Estado de Carregamento
  if (isLoading && empenhosList.length === 0) {
    return (
      <div
        style={{
          padding: '2.5rem',
          textAlign: 'center',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}
      >
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#0c326f', margin: '0 auto 0.75rem auto' }} />
        <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
          Carregando lastro orçamentário e empenhos vinculados...
        </p>
      </div>
    );
  }

  // 2. Estado de Erro / Indisponibilidade de Dados Financeiros
  if (isError && empenhosList.length === 0) {
    return (
      <div
        style={{
          padding: '2rem 1.5rem',
          textAlign: 'center',
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
          color: '#991b1b'
        }}
      >
        <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
          Indisponibilidade na consulta de dados financeiros
        </p>
        <p style={{ fontSize: '0.8rem', color: '#7f1d1d', maxWidth: '520px', margin: '0 auto 1rem auto' }}>
          Não foi possível conectar aos serviços de consulta de empenhos oficiais neste momento. Isto não indica ausência de empenhos, mas uma indisponibilidade temporária de consulta.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => {
              refetchDetails();
              refetchDashboard();
            }}
            style={{
              padding: '0.45rem 0.9rem',
              backgroundColor: '#991b1b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate('/empenhos')}
            style={{
              padding: '0.45rem 0.9rem',
              backgroundColor: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Ver Painel Geral de Empenhos
          </button>
        </div>
      </div>
    );
  }

  // 3. Estado Sem Empenhos Vinculados (EmptyState Semântico)
  if (empenhosList.length === 0) {
    return (
      <div
        style={{
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px dashed #cbd5e1',
          color: '#64748b'
        }}
      >
        <Receipt size={32} style={{ margin: '0 auto 0.75rem auto', color: '#94a3b8' }} />
        <p style={{ fontSize: '0.92rem', fontWeight: 700, color: '#334155', margin: '0 0 0.35rem 0' }}>
          Não há empenhos vinculados disponíveis para este contrato
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.25rem auto' }}>
          Nenhuma Nota de Empenho foi vinculada a este contrato nas bases oficiais ou no cadastro manual.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => navigate(`/empenhos?contractKey=${encodeURIComponent(contractKey)}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#0c326f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Consultar em Empenhos <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // 4. Calcula o sumário agregado usando o motor canônico de execução financeira
  const summary = aggregateContractFinancialExecution(contractKey, empenhosList);

  const totalEmpenhado = summary.totalValorEmpenhadoGlobal;
  const totalLiquidado = summary.totalValorLiquidadoGlobal;
  const totalPago = summary.totalValorPagoGlobal;
  const saldoNaoExecutado = summary.saldoNaoExecutadoGlobal;
  const saldoALiquidar = summary.saldoALiquidarGlobal;
  const saldoAPagar = summary.saldoAPagarGlobal;

  const pctLiquidado = totalEmpenhado > 0 ? (totalLiquidado / totalEmpenhado) * 100 : 0;
  const pctPago = totalEmpenhado > 0 ? (totalPago / totalEmpenhado) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. KPIs da Execução Financeira Oficial */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}
      >
        {/* Total Empenhado */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Total Empenhado
            </span>
            <Receipt size={16} color="#0c326f" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0c326f' }}>
            {formatCurrency(totalEmpenhado)}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {summary.totalEmpenhosVinculados} {summary.totalEmpenhosVinculados === 1 ? 'empenho vinculado' : 'empenhos vinculados'}
          </span>
        </div>

        {/* Total Liquidado */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Total Liquidado
            </span>
            <CreditCard size={16} color="#0369a1" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0369a1' }}>
            {formatCurrency(totalLiquidado)}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>
            {pctLiquidado.toFixed(1)}% do empenhado
          </span>
        </div>

        {/* Total Pago */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Total Pago (SIAFI)
            </span>
            <CheckCircle2 size={16} color="#059669" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
            {formatCurrency(totalPago)}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
            {pctPago.toFixed(1)}% do empenhado
          </span>
        </div>

        {/* Saldo Não Executado */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Saldo Não Executado
            </span>
            <Clock size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
            {formatCurrency(saldoNaoExecutado)}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#b45309' }}>
            Empenhado − Pago
          </span>
        </div>
      </div>

      {/* 2. Barra de Progresso / Funil de Execução */}
      {totalEmpenhado > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem 1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
              Funil de Execução Financeira
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              A Liquidar: <strong>{formatCurrency(saldoALiquidar)}</strong> • A Pagar: <strong>{formatCurrency(saldoAPagar)}</strong>
            </span>
          </div>

          <div
            style={{
              height: '10px',
              width: '100%',
              backgroundColor: '#e2e8f0',
              borderRadius: '999px',
              overflow: 'hidden',
              display: 'flex'
            }}
          >
            <div
              title={`Pago: ${pctPago.toFixed(1)}%`}
              style={{
                width: `${Math.min(pctPago, 100)}%`,
                backgroundColor: '#059669',
                transition: 'width 0.3s ease'
              }}
            />
            <div
              title={`Liquidado a Pagar: ${(pctLiquidado - pctPago).toFixed(1)}%`}
              style={{
                width: `${Math.max(0, Math.min(pctLiquidado - pctPago, 100 - pctPago))}%`,
                backgroundColor: '#0284c7',
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              marginTop: '0.6rem',
              fontSize: '0.72rem',
              color: '#64748b'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }} />
              Pago: {formatCurrency(totalPago)} ({pctPago.toFixed(1)}%)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0284c7' }} />
              Liquidado a Pagar: {formatCurrency(saldoAPagar)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }} />
              A Liquidar: {formatCurrency(saldoALiquidar)}
            </span>
          </div>
        </div>
      )}

      {/* 3. Tabela de Empenhos Vinculados ou Empty State */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={16} color="#0c326f" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
              Notas de Empenho Vinculadas ao Contrato
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: '#e2e8f0',
                color: '#475569',
                padding: '0.1rem 0.45rem',
                borderRadius: '999px'
              }}
            >
              {empenhosList.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/empenhos?contractKey=${encodeURIComponent(contractKey)}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#0c326f',
              cursor: 'pointer'
            }}
          >
            Abrir em Empenhos <ArrowRight size={13} />
          </button>
        </div>

        {empenhosList.length === 0 ? (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              color: '#64748b'
            }}
          >
            <Receipt size={32} style={{ margin: '0 auto 0.75rem auto', color: '#94a3b8' }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', margin: '0 0 0.25rem 0' }}>
              Não há empenhos vinculados disponíveis para este contrato
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: '480px', margin: '0 auto 1rem auto' }}>
              Nenhum empenho foi associado a este contrato nas bases oficiais ou no cadastro manual.
            </p>
            <button
              type="button"
              onClick={() => navigate('/empenhos')}
              style={{
                padding: '0.45rem 0.9rem',
                backgroundColor: '#0c326f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Consultar Painel Geral de Empenhos
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Número do Empenho</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Credor</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Data Emissão</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700, textAlign: 'right' }}>Empenhado</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700, textAlign: 'right' }}>Liquidado</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700, textAlign: 'right' }}>Pago</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700, textAlign: 'right' }}>Saldo a Executar</th>
                </tr>
              </thead>
              <tbody>
                {empenhosList.map((emp, index) => {
                  const empSaldo = Math.max(0, emp.valor_empenhado - emp.valor_pago);
                  return (
                    <tr
                      key={emp.canonical_key || emp.numero_oficial || index}
                      style={{
                        borderBottom: index < empenhosList.length - 1 ? '1px solid #f1f5f9' : 'none',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0c326f' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          {emp.numero_oficial || 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#334155' }}>
                        {emp.credor_nome || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b' }}>
                        {formatDate(emp.data_emissao)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: '#0c326f' }}>
                        {formatCurrency(emp.valor_empenhado)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>
                        {formatCurrency(emp.valor_liquidado)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        {formatCurrency(emp.valor_pago)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>
                        {formatCurrency(empSaldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight, RotateCcw } from 'lucide-react';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { formatDateBR } from '../../../services/temporalEngineService';
import { getContractDaysRemaining } from '../../../services/dashboardService';
import type { ContractDashboardRecord } from '../../../types';

interface ContractsPortfolioTableProps {
  contracts: ContractDashboardRecord[];
  totalContracts: number;
  onResetFilters: () => void;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTipoInstrumento(tipo?: string): string {
  if (!tipo) return 'Contrato';
  switch (tipo) {
    case 'TERMO_CONTRATO':
      return 'Contrato';
    case 'CARTA_CONTRATO':
      return 'Carta Contrato';
    case 'NOTA_EMPENHO':
      return 'Nota de Empenho';
    case 'AUTORIZACAO_COMPRA':
      return 'Autorização de Compra';
    case 'ORDEM_EXECUCAO_SERVICO':
      return 'Ordem de Serviço';
    case 'OUTRO_INSTRUMENTO_HABIL':
      return 'Outro Instrumento';
    default:
      return tipo;
  }
}

export const ContractsPortfolioTable: React.FC<ContractsPortfolioTableProps> = ({
  contracts,
  totalContracts,
  onResetFilters
}) => {
  const navigate = useNavigate();

  if (totalContracts === 0) {
    return (
      <EmptyState
        title="Nenhum contrato encontrado."
        description="Não há contratos cadastrados ou sincronizados para a unidade atual."
      />
    );
  }

  if (contracts.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          Nenhum contrato corresponde aos filtros aplicados.
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Altere os critérios selecionados ou limpe os filtros para visualizar a carteira completa.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.85rem',
            background: '#0c326f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} /> Limpar Filtros
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="contracts-portfolio-table"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.82rem',
          textAlign: 'left'
        }}>
          <thead>
            <tr style={{
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '0.78rem',
              fontWeight: 700
            }}>
              <th style={{ padding: '0.75rem 1rem' }}>Contrato & Objeto</th>
              <th style={{ padding: '0.75rem 1rem' }}>Situação</th>
              <th style={{ padding: '0.75rem 1rem' }}>Vigência</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Valor Vigente</th>
              <th style={{ padding: '0.75rem 1rem' }}>Acompanhamento</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => {
              const contractKey = contract.id || `${contract.uasg || '200331'}-${contract.numero}-${contract.ano}`;
              const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
              const numDisplay = contract.numeroFormatado || `${contract.numero}/${contract.ano}`;
              const isVigente = contract.statusVigencia === 'Vigente';
              const isExpirado = contract.statusVigencia === 'Expirado' || (diasRestantes !== null && diasRestantes < 0);
              const isAVencer60d = contract.statusVigencia === 'A Vencer (60d)' || (diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 60);

              // StatusBadge variant
              const statusVariant = isExpirado
                ? 'danger'
                : isAVencer60d
                  ? 'warning'
                  : isVigente
                    ? 'success'
                    : 'neutral';

              const statusLabel = isExpirado
                ? 'Expirado'
                : isAVencer60d
                  ? 'A Vencer (≤60d)'
                  : isVigente
                    ? 'Vigente'
                    : 'Não Informado';

              return (
                <tr
                  key={contractKey}
                  data-testid={`contract-row-${contractKey}`}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* 1. Contrato, Fornecedor & Objeto */}
                  <td style={{ padding: '0.85rem 1rem', maxWidth: '380px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <div style={{ padding: '0.3rem', background: '#eff6ff', borderRadius: '6px', color: '#0c326f', marginTop: '0.1rem' }}>
                        <FileText size={15} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 800 }}>
                          Contrato nº {numDisplay}
                        </strong>

                        {contract.fornecedorNome && (
                          <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                            {contract.fornecedorNome}
                            {contract.fornecedorCnpjCpf && (
                              <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '0.35rem' }}>
                                • {contract.fornecedorCnpjCpf}
                              </span>
                            )}
                          </span>
                        )}

                        {contract.objeto && (
                          <p style={{
                            fontSize: '0.75rem',
                            color: '#64748b',
                            margin: '0.15rem 0 0 0',
                            lineHeight: 1.35,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {contract.objeto}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Situação & Instrumento */}
                  <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                      <StatusBadge
                        label={statusLabel}
                        variant={statusVariant}
                        size="sm"
                      />
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#475569',
                        background: '#f1f5f9',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {formatTipoInstrumento(contract.tipoInstrumento)}
                      </span>
                    </div>
                  </td>

                  {/* 3. Vigência */}
                  <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                        {formatDateBR(contract.dataVigenciaFim)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Início: {formatDateBR(contract.dataVigenciaInicio)}
                      </span>
                      {diasRestantes !== null && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: diasRestantes <= 30 ? '#dc2626' : diasRestantes <= 60 ? '#d97706' : '#15803d'
                        }}>
                          {diasRestantes < 0
                            ? `Vencido há ${Math.abs(diasRestantes)}d`
                            : diasRestantes === 0
                              ? 'Vence hoje'
                              : `${diasRestantes} dias restantes`}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 4. Valor Global / Vigente */}
                  <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
                        {formatCurrency(contract.valorGlobal || contract.valorInicial)}
                      </span>
                      {contract.valorInicial && contract.valorGlobal && contract.valorGlobal !== contract.valorInicial && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Inicial: {formatCurrency(contract.valorInicial)}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 5. Acompanhamento */}
                  <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                    {diasRestantes !== null && diasRestantes <= 30 && diasRestantes >= 0 ? (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#b91c1c',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        Vencimento Crítico (≤30d)
                      </span>
                    ) : diasRestantes !== null && diasRestantes <= 60 && diasRestantes > 30 ? (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#b45309',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        Atenção Vigência (≤60d)
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#475569',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px'
                      }}>
                        Regular
                      </span>
                    )}
                  </td>

                  {/* 6. Ação Principal */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/contratos/${encodeURIComponent(contractKey)}`)}
                      data-testid={`open-contract-360-btn-${contractKey}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.85rem',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#0c326f',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Abrir 360° <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { SeverityBadge } from '../../../design-system/components/SeverityBadge';
import { formatDateBR } from '../../../services/temporalEngineService';
import { formatContractNumber } from '../../../utils/contractNumber';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../../carteira/CarteiraDetailLabel';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import type { PrazoFaixa } from '../../carteira/carteiraPrazo';
import { ManagerCell, type ManagerAssignContext } from '../../carteira/ManagerAssign';
import { getAcaoInfo, getMotivoInfo } from '../../instrumentos/gestaoInstrumentosRowHelpers';
import type { DashboardAttentionItem } from '../../../types/managementDashboard';
import type { ContractDashboardRecord } from '../../../types';

/** Contrato já enriquecido com o que a tabela precisa exibir (prazo, gestor e pendências). */
export interface ContractPortfolioRow {
  contract: ContractDashboardRecord;
  contractKey: string;
  diasRestantes: number | null;
  faixa: PrazoFaixa;
  gestorNome?: string;
  pendencias: DashboardAttentionItem[];
}

interface ContractsPortfolioTableProps {
  rows: ContractPortfolioRow[];
  totalContracts: number;
  onResetFilters: () => void;
  pageSize?: number;
  /** Atribuição de gestor na própria carteira (admin e gestor). */
  canAssign?: boolean;
  assignContext?: ManagerAssignContext;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTipoInstrumento(tipo?: string): string {
  switch (tipo) {
    case undefined:
    case '':
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

/** Severidade mais alta entre as pendências do contrato (para colorir o contador). */
const SEVERITY_ORDER = ['CRITICA', 'URGENTE', 'ATENCAO', 'INFO'] as const;
function worstSeverity(pendencias: DashboardAttentionItem[]): DashboardAttentionItem['severity'] {
  for (const sev of SEVERITY_ORDER) {
    if (pendencias.some((p) => p.severity === sev)) return sev;
  }
  return 'INFO';
}
const PENDENCIA_COLORS: Record<string, { color: string; bg: string }> = {
  CRITICA: { color: '#b91c1c', bg: '#fef2f2' },
  URGENTE: { color: '#c2410c', bg: '#fff7ed' },
  ATENCAO: { color: '#b45309', bg: '#fffbeb' },
  INFO: { color: '#1d4ed8', bg: '#eff6ff' }
};

export const ContractsPortfolioTable: React.FC<ContractsPortfolioTableProps> = ({
  rows,
  totalContracts,
  onResetFilters,
  pageSize = 15,
  canAssign = false,
  assignContext = { links: [] }
}) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Só volta à página 1 quando o conjunto listado muda (filtro/busca), não quando
  // um gestor é atribuído e a linha é recalculada.
  const rowsSignature = useMemo(() => rows.map((r) => r.contractKey).join('|'), [rows]);
  useEffect(() => {
    setPage(1);
    setExpandedKey(null);
  }, [rowsSignature]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize]
  );

  if (totalContracts === 0) {
    return (
      <EmptyState
        title="Nenhum contrato encontrado."
        description="Não há contratos cadastrados ou sincronizados para as unidades consolidadas."
      />
    );
  }

  if (rows.length === 0) {
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
    <div data-testid="contracts-portfolio-table" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
              <th style={carteiraTh}>Nº do contrato</th>
              <th style={carteiraTh}>Fornecedor</th>
              <th style={carteiraTh}>Vigência</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor Vigente</th>
              <th style={carteiraTh}>Pendências</th>
              <th style={carteiraTh}>Gestor</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const { contract, contractKey, diasRestantes, faixa, gestorNome, pendencias } = row;
              const isExpanded = expandedKey === contractKey;
              const numDisplay = formatContractNumber(contract);
              const valorVigente = contract.valorGlobal || contract.valorInicial;
              const tipoLabel = formatTipoInstrumento(contract.tipoInstrumento);
              const acrescimoPct =
                contract.valorInicial && contract.valorGlobal && contract.valorInicial > 0
                  ? ((contract.valorGlobal - contract.valorInicial) / contract.valorInicial) * 100
                  : 0;
              const worst = pendencias.length > 0 ? PENDENCIA_COLORS[worstSeverity(pendencias)] : null;

              return (
                <React.Fragment key={contractKey}>
                  <tr data-testid={`contracts-row-${contractKey}`}>
                    <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : contractKey)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Recolher detalhes do contrato' : 'Expandir detalhes do contrato'}
                        data-testid={`contracts-expand-${contractKey}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: '0.2rem' }}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td data-label="Contrato" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800 }}>{numDisplay}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                        {tipoLabel === 'Contrato' ? `UASG ${contract.uasg}` : `${tipoLabel} · UASG ${contract.uasg}`}
                      </div>
                    </td>
                    <td style={{ ...carteiraTd, maxWidth: '220px', minWidth: '170px' }}>
                      {contract.fornecedorNome && (
                        <div title={contract.fornecedorNome} style={{ fontWeight: 600, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{contract.fornecedorNome}</div>
                      )}
                    </td>
                    <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <CarteiraPrazoPill faixa={faixa} diasRestantes={diasRestantes} />
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        até {formatDateBR(contract.dataVigenciaFim)}
                      </div>
                    </td>
                    <td data-label="Valor vigente" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      {formatCurrency(valorVigente)}
                    </td>
                    <td data-label="Pendências" style={carteiraTd}>
                      {worst ? (
                        <span
                          data-testid={`contracts-pendencias-${contractKey}`}
                          style={{ fontSize: '0.75rem', fontWeight: 800, color: worst.color, background: worst.bg, padding: '0.2rem 0.55rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
                        >
                          {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <ManagerCell
                        target={{ tipo: 'CONTRATO', contractKey }}
                        gestorNome={gestorNome}
                        canAssign={canAssign}
                        testId={`contracts-manager-${contractKey}`}
                        links={assignContext.links}
                        contractsByKey={assignContext.contractsByKey}
                      />
                    </td>
                    <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/contratos/${encodeURIComponent(contractKey)}`)}
                        data-testid={`open-contract-360-btn-${contractKey}`}
                        style={carteiraButton}
                      >
                        Ver Detalhes <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="carteira-expanded" data-testid={`contracts-expanded-${contractKey}`}>
                      <td colSpan={8} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '1rem', fontSize: '0.82rem' }}>
                          <div>
                            <CarteiraDetailLabel>Processo</CarteiraDetailLabel>
                            <div>{contract.processo || '—'}</div>
                          </div>
                          <div>
                            <CarteiraDetailLabel>Modalidade</CarteiraDetailLabel>
                            <div>{contract.modalidadeCompra || '—'}</div>
                          </div>
                          <div>
                            <CarteiraDetailLabel>Valor</CarteiraDetailLabel>
                            <div>{formatCurrency(valorVigente)}</div>
                            {contract.valorInicial && contract.valorGlobal && contract.valorInicial !== contract.valorGlobal && (
                              <div style={{ color: '#64748b' }}>
                                Inicial: {formatCurrency(contract.valorInicial)}
                                {acrescimoPct > 0.05 && (
                                  <span style={{ color: '#b45309', fontWeight: 700 }}>
                                    {' '}(+{acrescimoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em aditivos)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <CarteiraDetailLabel>Vigência</CarteiraDetailLabel>
                            <div>{formatDateBR(contract.dataVigenciaInicio)} a {formatDateBR(contract.dataVigenciaFim)}</div>
                          </div>
                          <div>
                            <CarteiraDetailLabel>Empenhos</CarteiraDetailLabel>
                            <div>
                              {typeof contract.empenhosCount === 'number'
                                ? `${contract.empenhosCount} ${contract.empenhosCount === 1 ? 'vinculado' : 'vinculados'}`
                                : '—'}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: '0.9rem' }}>
                          <CarteiraDetailLabel>Pendências abertas</CarteiraDetailLabel>
                          {pendencias.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Nenhuma pendência em aberto.</div>
                          ) : (
                            pendencias.map((p) => {
                              const motivo = getMotivoInfo(p.category);
                              const acao = getAcaoInfo(p);
                              return (
                                <div
                                  key={p.id}
                                  className="carteira-pend-row"
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.45rem 0', borderTop: '1px solid #e2e8f0' }}
                                >
                                  <div className="carteira-pend-main" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                                    <SeverityBadge severity={p.severity} />
                                    <span style={{ fontWeight: 700, color: motivo.color }}>{motivo.label}</span>
                                    <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {p.badgeLabel || p.description || p.title}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => navigate(acao.targetUrl)}
                                    style={carteiraButton}
                                  >
                                    {acao.label} <ArrowRight size={13} />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <CarteiraPagination
        page={currentPage}
        pageSize={pageSize}
        total={rows.length}
        onChange={setPage}
        testIdPrefix="contracts"
      />
    </div>
  );
};

import React, { useCallback, useState, useEffect } from 'react';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { SeverityBadge } from '../../../design-system/components/SeverityBadge';
import { formatDateBR } from '../../../services/temporalEngineService';
import { formatContractNumber } from '../../../utils/contractNumber';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../../carteira/CarteiraDetailLabel';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { formatCurrency } from '../../carteira/carteiraFormat';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { situacaoDaFaixa, type PrazoFaixa } from '../../carteira/carteiraPrazo';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../../carteira/CarteiraCellFilter';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../../carteira/CarteiraRowLink';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import type { ContractsPortfolioFilterState } from './ContractsPortfolioFilters';
import { ManagerCell } from '../../carteira/ManagerAssign';
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
  /** Números das atas de que o contrato se originou (vínculo por item); vazio = contrato sem ata. */
  atas?: string[];
}

interface ContractsPortfolioTableProps {
  rows: ContractPortfolioRow[];
  totalContracts: number;
  onResetFilters: () => void;
  pageSize?: number;
  /** Coordenador: "Sem gestor" vira atalho para a Central de Distribuição (a atribuição é feita só lá). */
  canAssign?: boolean;
  /** Clique num valor da célula aplica o filtro correspondente (prazo → situação, pendências, fornecedor → busca). */
  onFilter?: <K extends keyof ContractsPortfolioFilterState>(key: K, value: ContractsPortfolioFilterState[K]) => void;
}

const SORT_COLUMNS: Record<string, CarteiraSortColumn<ContractPortfolioRow>> = {
  numero: { value: (r) => `${r.contract.ano ?? ''}-${String(r.contract.numero ?? '').padStart(6, '0')}` },
  vigencia: { value: (r) => r.diasRestantes },
  valor: { value: (r) => r.contract.valorGlobal || r.contract.valorInicial || 0, firstDir: 'desc' },
  pendencias: { value: (r) => r.pendencias.length, firstDir: 'desc' },
  gestor: { value: (r) => r.gestorNome }
};

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
  onFilter
}) => {
  const navigate = useNavigateWithOrigin();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(rows, SORT_COLUMNS);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems: pageRows, signature } = useCarteiraPagination(
    sorted,
    useCallback((r: ContractPortfolioRow) => r.contractKey, []),
    pageSize
  );
  useEffect(() => {
    setExpandedKey(null);
  }, [signature]);

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
      <CarteiraNoResults
        title="Nenhum contrato corresponde aos filtros aplicados."
        description="Altere os critérios selecionados ou limpe os filtros para visualizar a carteira completa."
        onResetFilters={onResetFilters}
      />
    );
  }

  return (
    <div data-testid="contracts-portfolio-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
              <CarteiraSortHeader label="Contrato" sortKey="numero" {...sortProps} />
              <CarteiraSortHeader label="Vigência" sortKey="vigencia" {...sortProps} />
              <CarteiraSortHeader label="Valor Vigente" sortKey="valor" align="right" {...sortProps} />
              <CarteiraSortHeader label="Pendências" sortKey="pendencias" {...sortProps} />
              <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const { contract, contractKey, diasRestantes, faixa, gestorNome, pendencias, atas = [] } = row;
              const isExpanded = expandedKey === contractKey;
              const numDisplay = formatContractNumber(contract);
              const valorVigente = contract.valorGlobal || contract.valorInicial;
              const tipoLabel = formatTipoInstrumento(contract.tipoInstrumento);
              const abrirContrato = () => navigate(`/contratos/${encodeURIComponent(contractKey)}`);
              const acrescimoPct =
                contract.valorInicial && contract.valorGlobal && contract.valorInicial > 0
                  ? ((contract.valorGlobal - contract.valorInicial) / contract.valorInicial) * 100
                  : 0;
              const worst = pendencias.length > 0 ? PENDENCIA_COLORS[worstSeverity(pendencias)] : null;

              return (
                <React.Fragment key={contractKey}>
                  <tr data-testid={`contracts-row-${contractKey}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(abrirContrato)}>
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
                    <td data-role="id" style={{ ...carteiraTd, minWidth: '200px', maxWidth: '320px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <CarteiraIdLink
                        onClick={abrirContrato}
                        label={`Ver detalhes do contrato ${numDisplay}`}
                        testId={`open-contract-360-btn-${contractKey}`}
                        title={`Ver detalhes · ${tipoLabel === 'Contrato' ? '' : `${tipoLabel} · `}UASG ${contract.uasg}`}
                      >
                        {numDisplay}
                      </CarteiraIdLink>
                      {tipoLabel !== 'Contrato' && <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>{tipoLabel}</span>}
                      {atas.length > 0 && (
                        <>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>·</span>
                          <CarteiraCellFilter
                            descricao={atas.length === 1 ? `ata ${atas[0]}` : 'estas atas'}
                            onFilter={onFilter && (() => onFilter('busca', atas[0]))}
                          >
                            <span
                              data-testid={`contracts-ata-${contractKey}`}
                              title={atas.length === 1 ? undefined : `Atas: ${atas.join(', ')}`}
                              style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}
                            >
                              {atas.length === 1 ? `Ata ${atas[0]}` : `${atas.length} atas`}
                            </span>
                          </CarteiraCellFilter>
                        </>
                      )}
                      </div>
                      {contract.fornecedorNome && (
                        <CarteiraCellFilter
                          descricao={`fornecedor ${contract.fornecedorNome}`}
                          onFilter={onFilter && (() => onFilter('busca', contract.fornecedorNome || ''))}
                        >
                          <div title={contract.fornecedorNome} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{contract.fornecedorNome}</div>
                        </CarteiraCellFilter>
                      )}
                      </div>
                    </td>
                    <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <CarteiraCellFilter
                        descricao="esta situação de prazo"
                        onFilter={onFilter && situacaoDaFaixa(faixa) ? () => onFilter('status', situacaoDaFaixa(faixa)!) : undefined}
                      >
                        <CarteiraPrazoPill faixa={faixa} diasRestantes={diasRestantes} />
                      </CarteiraCellFilter>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        até {formatDateBR(contract.dataVigenciaFim)}
                      </div>
                    </td>
                    <td data-label="Valor vigente" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      {formatCurrency(valorVigente)}
                    </td>
                    <td data-label="Pendências" style={carteiraTd}>
                      {worst ? (
                        <CarteiraCellFilter descricao="contratos com pendência" onFilter={onFilter && (() => onFilter('pendencia', 'COM_PENDENCIA'))}>
                        <span
                          data-testid={`contracts-pendencias-${contractKey}`}
                          style={{ fontSize: '0.75rem', fontWeight: 800, color: worst.color, background: worst.bg, padding: '0.2rem 0.55rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
                        >
                          {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}
                        </span>
                        </CarteiraCellFilter>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <ManagerCell gestorNome={gestorNome} canAssign={canAssign} testId={`contracts-manager-${contractKey}`} />
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="carteira-expanded" data-testid={`contracts-expanded-${contractKey}`}>
                      <td colSpan={6} style={CARTEIRA_EXPANDED_CELL_STYLE}>
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

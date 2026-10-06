import React, { useState, useMemo } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { AppButton, EmptyState, ErrorState, FilterBar, StatusBadge } from '../../design-system';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { formatCurrency } from '../../utils/format';
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
}

export type EmpenhoFilter = 'TODOS' | 'COM_SALDO' | 'EXECUTADOS';

const PAGE_SIZE = 15;

/**
 * Seção de Execução Financeira Detalhada do Dashboard Gerencial (CGLIC 3.0 — Fase 9-I)
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
  onRefresh
}) => {
  const [filter, setFilter] = useState<EmpenhoFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar execução orçamentária e financeira';

  const financial = readModel?.financial;
  const totalLista = financial?.topEmpenhos?.length || 0;

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

  React.useEffect(() => setPage(1), [filter, searchQuery]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredEmpenhos.length / PAGE_SIZE)));
  const pageEmpenhos = useMemo(
    () => filteredEmpenhos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredEmpenhos, currentPage]
  );

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
      <ErrorState
        testId="management-financial-execution-error"
        title="Execução Financeira — Erro ao carregar dados oficiais"
        message={errorMessage}
        onRetry={onRefresh}
      />
    );
  }

  // 3. Estado Vazio
  if (!financial || (financial.totalEmpenhado === 0 && financial.totalPago === 0)) {
    return (
      <EmptyState
        testId="management-financial-execution-empty"
        icon={<CreditCard size={32} aria-hidden="true" />}
        title="Não há execução financeira disponível para o período selecionado."
        description="Nenhum registro oficial de empenho ou pagamento foi localizado na base SIAFI/Contratos.gov."
      />
    );
  }

  return (
    <section
      data-testid="management-financial-execution"
      aria-label="Execução financeira"
      className="management-financial-execution"
      style={{ marginTop: 0 }}
    >
      {/* Indicadores: Empenhado → Liquidado → Pago e os saldos de cada etapa (cada número uma vez) */}
      <div data-testid="financial-funnel-card" style={{ marginBottom: '1.25rem' }}>
        <HealthTileGrid>
          <div data-testid="metric-total-empenhado">
            <HealthTile label="Total empenhado" value={formatCurrency(financial.totalEmpenhado)} hint="dotação vinculada" />
          </div>
          <div data-testid="metric-total-liquidado">
            <HealthTile
              label="Total liquidado"
              value={formatCurrency(financial.totalLiquidado)}
              hint={`${financial.taxaLiquidacaoPercentual}% do empenhado`}
            />
          </div>
          <div data-testid="metric-total-pago">
            <HealthTile
              label="Total pago (OB)"
              value={formatCurrency(financial.totalPago)}
              hint={`${financial.taxaPagamentoPercentual}% do liquidado`}
              positive
            />
          </div>
          <div data-testid="metric-saldo-a-liquidar">
            <HealthTile label="Saldo a Liquidar" value={formatCurrency(financial.saldoALiquidar)} hint="Empenhado − Liquidado" />
          </div>
          <div data-testid="metric-saldo-a-pagar">
            <HealthTile label="Saldo a Pagar" value={formatCurrency(financial.saldoAPagar)} hint="Liquidado − Pago" />
          </div>
          <div data-testid="metric-saldo-nao-executado">
            <HealthTile label="Saldo Não Executado" value={formatCurrency(financial.saldoNaoExecutado)} hint="Empenhado − Pago" />
          </div>
          <div data-testid="metric-saldo-rp-pendente">
            <HealthTile
              label="Restos a Pagar (RP)"
              value={formatCurrency(financial.saldoRpPendente)}
              hint={`Inscrito ${formatCurrency(financial.totalRpInscrito)} · Pago ${formatCurrency(financial.totalRpPago)}`}
              tone={financial.saldoRpPendente > 0 ? 'ATENCAO' : undefined}
            />
          </div>
        </HealthTileGrid>
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: '0.85rem' }}>
        <FilterBar
          testId="empenhos-filter-bar"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Buscar empenho, credor, contrato..."
          selects={[
            {
              id: 'empenhos-filter-status',
              label: 'Situação',
              value: filter,
              onChange: (v) => setFilter(v as EmpenhoFilter),
              options: [
                { value: 'TODOS', label: 'Todas as Situações' },
                { value: 'COM_SALDO', label: 'Com Saldo a Executar' },
                { value: 'EXECUTADOS', label: '100% Executados' }
              ]
            }
          ]}
          hasActiveFilters={filter !== 'TODOS' || Boolean(searchQuery)}
          onClearFilters={() => {
            setFilter('TODOS');
            setSearchQuery('');
          }}
        />
        <div data-testid="empenhos-counter" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', margin: '0.5rem 0.25rem 0' }}>
          {filteredEmpenhos.length === totalLista
            ? `${totalLista} empenhos`
            : `${filteredEmpenhos.length} de ${totalLista} empenhos`}
        </div>
      </div>

      {/* Tabela */}
      <div data-testid="empenhos-table-container" style={carteiraTableShell}>
        {filteredEmpenhos.length === 0 ? (
          <EmptyState
            testId="empenhos-filter-empty"
            title="Nenhuma nota de empenho corresponde aos filtros aplicados."
            description="Altere a situação ou limpe o termo de busca para visualizar os empenhos da unidade."
            action={
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter('TODOS');
                  setSearchQuery('');
                }}
              >
                Limpar filtros
              </AppButton>
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" data-testid="table-empenhos" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Nota de Empenho</th>
                  <th style={carteiraTh}>Credor / Fornecedor</th>
                  <th style={carteiraTh}>Contrato</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Empenhado</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Liquidado</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Pago</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Saldo a Executar</th>
                  <th style={{ ...carteiraTh, textAlign: 'center' }}>% Exec.</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageEmpenhos.map((emp: ManagementDashboardEmpenhoDetail) => (
                  <tr key={emp.empenhoKey} data-testid={`row-empenho-${emp.numeroEmpenho}`}>
                    <td data-role="id" style={{ ...carteiraTd, fontWeight: 700 }}>
                      {emp.numeroEmpenho}
                      {emp.ano && <span style={{ color: '#64748b', fontWeight: 500, marginLeft: '0.25rem' }}>/{emp.ano}</span>}
                    </td>
                    <td data-role="id" style={carteiraTd}>{emp.fornecedorNome || '—'}</td>
                    <td data-label="Contrato" style={carteiraTd}>
                      {emp.contratoNumero ? (
                        <span style={{ fontWeight: 600 }}>Contrato {emp.contratoNumero}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Sem contrato</span>
                      )}
                    </td>
                    <td data-label="Empenhado" style={{ ...carteiraTd, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(emp.valorEmpenhado)}</td>
                    <td data-label="Liquidado" style={{ ...carteiraTd, textAlign: 'right', color: 'var(--color-info-text)' }}>{formatCurrency(emp.valorLiquidado)}</td>
                    <td data-label="Pago" style={{ ...carteiraTd, textAlign: 'right', color: 'var(--color-success)', fontWeight: 700 }}>{formatCurrency(emp.valorPago)}</td>
                    <td data-label="Saldo a executar" style={{ ...carteiraTd, textAlign: 'right', color: '#64748b' }}>{formatCurrency(emp.saldoNaoExecutado)}</td>
                    <td data-label="% Exec." style={{ ...carteiraTd, textAlign: 'center' }}>
                      <StatusBadge
                        label={`${emp.percentualExecutado}%`}
                        variant={emp.percentualExecutado >= 80 ? 'success' : emp.percentualExecutado >= 40 ? 'info' : 'neutral'}
                        size="sm"
                        dot={false}
                      />
                    </td>
                    <td data-role="action" style={{ ...carteiraTd, textAlign: 'right' }}>
                      {emp.contratoNumero && onNavigateContract ? (
                        <AppButton
                          type="button"
                          variant="link"
                          size="sm"
                          data-testid={`btn-navigate-contract-${emp.numeroEmpenho}`}
                          onClick={() => onNavigateContract(emp.contratoNumero!)}
                        >
                          Ver contrato <ExternalLink size={12} aria-hidden="true" />
                        </AppButton>
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
        <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={filteredEmpenhos.length} onChange={setPage} testIdPrefix="empenhos" />
      </div>
      <p data-testid="empenhos-footnote" style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.75rem 0.25rem 0' }}>
        Os valores desta tela vêm dos fatos orçamentários oficiais do SIAFI. O consumo de saldo físico das Atas de Registro de Preços é acompanhado na tela de cada item da ata.
      </p>
    </section>
  );
};

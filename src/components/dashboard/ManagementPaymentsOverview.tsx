import React, { useState, useMemo } from 'react';
import { Clock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import type {
  ManagementDashboardReadModel
} from '../../types/managementDashboard';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';
import { getPaymentStatusDisplay } from '../../utils/paymentStatusDisplay';
import { formatCurrency, formatDateBR } from '../../utils/format';
import { AppButton, EmptyState, ErrorState, FilterBar, StatusBadge } from '../../design-system';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { PAGAMENTO_RULES } from '../../config/alertRules';

export interface ManagementPaymentsOverviewProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  onNavigateContract?: (contractKey: string) => void;
  onRefresh?: () => void;
}

export type PaymentFilter = 'TODOS' | 'CRITICOS' | 'CGOFI' | 'INSTRUCAO' | 'CONFIRMADOS';

export const getWorkflowStatusDisplay = getPaymentStatusDisplay;

/**
 * Seção de Faturamento e Acompanhamento de Pagamentos do Dashboard Gerencial (CGLIC 3.0 — Fase 9-H)
 * 
 * Princípios Fundamentais:
 * 1. Separação explícita entre Acompanhamento Operacional (Atesto, Instrução, CGOFI, OB) e Execução Financeira Oficial (SIAFI);
 * 2. Projeção fiel dos ciclos originados no paymentFollowUpService;
 * 3. Identificação transparente de gargalos da CGOFI (> 5 dias úteis sem resposta);
 * 4. Exibição da Ordem Bancária quando o ciclo estiver com pagamento confirmado, sem criar novos fatos financeiros;
 * 5. Tratamento de loading (skeleton), erro explícito e empty state.
 */
const PAGE_SIZE = 15;

export const ManagementPaymentsOverview: React.FC<ManagementPaymentsOverviewProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  onNavigateContract,
  onRefresh
}) => {
  const [filter, setFilter] = useState<PaymentFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

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
        (c) => c.status === 'ENVIADO_CGOFI' || c.alerts?.some((a) => a.tipo === 'CGOFI_SEM_RESPOSTA')
      );
    } else if (filter === 'INSTRUCAO') {
      list = baseList.filter(
        (c) => c.status === 'RECEBIDO' || c.status === 'COM_PENDENCIA' || c.status === 'CONFERIDO' || c.status === 'DEVOLVIDO'
      );
    } else if (filter === 'CONFIRMADOS') {
      list = baseList.filter(
        (c) => c.status === 'PAGO' || Boolean(c.input?.numeroOrdemBancaria)
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

  React.useEffect(() => setPage(1), [filter, searchQuery]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredCycles.length / PAGE_SIZE)));
  const pageCycles = useMemo(
    () => filteredCycles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredCycles, currentPage]
  );

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
      <ErrorState
        testId="management-payments-overview-error"
        title="Faturamento e pagamentos: erro ao carregar os dados"
        message={errorMessage}
        onRetry={onRefresh}
      />
    );
  }

  // 3. Estado Vazio
  if (!payments || payments.totalCiclos === 0) {
    return (
      <EmptyState
        testId="management-payments-overview-empty"
        icon={<Clock size={32} aria-hidden="true" />}
        title="Nenhum ciclo de pagamento registrado"
        description={`Não há faturas ou atestos operacionais cadastrados para a UASG ${uasg}.`}
      />
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

  const totalLista = (payments.ciclosAbertosDetalhe || payments.ciclosRecentes || []).length;

  return (
    <section
      data-testid="management-payments-overview-section"
      aria-label="Faturamento e pagamentos"
      className="management-payments-overview"
      style={{ marginTop: 0 }}
    >
      {/* Indicadores (mesmo padrão das telas 360); cada um filtra a lista abaixo */}
      <div data-testid="payments-metrics-grid" style={{ marginBottom: '1.25rem' }}>
        <HealthTileGrid>
          <HealthTile
            label="Ciclos em Tramitação"
            value={String(ciclosAbertosCount)}
            hint="faturas ativas · atestos em processamento"
            onClick={() => setFilter('TODOS')}
            testId="payments-kpi-abertos"
          />
          <HealthTile
            label="Urgência de vencimento"
            value={`${faturasVencidasCount} vencidas`}
            hint={
              faturasVencidasCount > 0
                ? `Risco de juros e mora${faturasVenceHojeCount + faturasProximasVencimentoCount > 0 ? ` · +${faturasVenceHojeCount + faturasProximasVencimentoCount} em ≤${PAGAMENTO_RULES.criticoAteDiasUteis}d` : ''}`
                : faturasVenceHojeCount + faturasProximasVencimentoCount > 0
                  ? `${faturasVenceHojeCount + faturasProximasVencimentoCount} vencem em ≤${PAGAMENTO_RULES.criticoAteDiasUteis} dias`
                  : 'Nenhuma fatura vencida no momento'
            }
            tone={faturasVencidasCount > 0 || ciclosCriticosCount > 0 ? 'CRITICA' : faturasVenceHojeCount + faturasProximasVencimentoCount > 0 ? 'ATENCAO' : undefined}
            onClick={() => setFilter('CRITICOS')}
            testId="payments-kpi-criticas"
          />
          <HealthTile
            label="Gargalo CGOFI"
            value={String(ciclosAtrasoCgofiCount)}
            hint={ciclosAtrasoCgofiCount === 1 ? `processo > ${PAGAMENTO_RULES.cgofiSemRespostaAcimaDeDiasUteis} dias úteis sem resposta` : `processos > ${PAGAMENTO_RULES.cgofiSemRespostaAcimaDeDiasUteis} dias úteis sem resposta`}
            tone={ciclosAtrasoCgofiCount > 0 ? 'URGENTE' : undefined}
            onClick={() => setFilter('CGOFI')}
            testId="payments-kpi-cgofi"
          />
          <HealthTile
            label="Pendências e prazos"
            value={`${documentacaoPendenteCount} pendências`}
            hint={
              envioCgofiAtrasadoCount > 0
                ? `${envioCgofiAtrasadoCount} envio atrasado à CGOFI`
                : margemEnvioEstreitaCount > 0
                  ? `${margemEnvioEstreitaCount} com margem de envio estreita`
                  : 'CNDs vencidas ou margem estreita'
            }
            tone={envioCgofiAtrasadoCount > 0 ? 'URGENTE' : documentacaoPendenteCount > 0 || margemEnvioEstreitaCount > 0 ? 'ATENCAO' : undefined}
            onClick={() => setFilter('INSTRUCAO')}
            testId="payments-kpi-pendencias"
          />
        </HealthTileGrid>
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
            gap: '0.5rem'
          }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>1. Em conferência</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#334155', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['RECEBIDO'] || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Com pendência</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['COM_PENDENCIA'] || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>2. Conferido</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7e22ce', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['CONFERIDO'] || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>3. Na CGOFI</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ea580c', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['ENVIADO_CGOFI'] || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>4. Pago</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534', marginTop: '0.2rem' }}>
              {distribuicaoPorEstado['PAGO'] || 0}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Exceções</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.2rem' }}>
              {(distribuicaoPorEstado['DEVOLVIDO'] || 0) + (distribuicaoPorEstado['CANCELADO'] || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: '0.85rem' }}>
        <FilterBar
          testId="payments-filter-bar"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Buscar por contrato, competência, atesto, processo SEI, responsável ou OB..."
          selects={[
            {
              id: 'payments-filter-select',
              label: 'Situação',
              value: filter,
              onChange: (v) => setFilter(v as PaymentFilter),
              options: [
                { value: 'TODOS', label: `Todos os ciclos (${totalLista})` },
                { value: 'CRITICOS', label: 'Críticos / Vencidos' },
                { value: 'CGOFI', label: 'Gargalo CGOFI' },
                { value: 'INSTRUCAO', label: 'Com a CGLIC' },
                { value: 'CONFIRMADOS', label: 'Confirmados (OB)' }
              ]
            }
          ]}
          hasActiveFilters={filter !== 'TODOS' || Boolean(searchQuery)}
          onClearFilters={() => {
            setFilter('TODOS');
            setSearchQuery('');
          }}
        />
        <div data-testid="payments-counter" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', margin: '0.5rem 0.25rem 0' }}>
          {filteredCycles.length === totalLista
            ? `${totalCiclos} ${totalCiclos === 1 ? 'ciclo' : 'ciclos'}`
            : `${filteredCycles.length} de ${totalLista} ciclos`}
          {' · '}
          {ciclosAbertosCount} em andamento · {ciclosConcluidosCount} {ciclosConcluidosCount === 1 ? 'concluído' : 'concluídos'}
        </div>
      </div>

      {/* Tabela */}
      <div data-testid="payments-table-container" style={carteiraTableShell}>
        {filteredCycles.length === 0 ? (
          <EmptyState
            testId="payments-filter-empty"
            title="Nenhum ciclo de pagamento corresponde ao filtro ou busca selecionada."
            action={
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter('TODOS');
                  setSearchQuery('');
                }}
              >
                Limpar filtros e busca
              </AppButton>
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="payments-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Contrato / Competência</th>
                  <th style={carteiraTh}>Atesto / Processo SEI</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor do atesto</th>
                  <th style={carteiraTh}>Situação</th>
                  <th style={carteiraTh}>Prazos e SLA</th>
                  <th style={carteiraTh}>Ordem Bancária (OB)</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageCycles.map((cycle: PaymentFollowUpCycle) => {
                  const statusInfo = getWorkflowStatusDisplay(cycle.status);
                  const isVencida = cycle.prazos?.statusPrazo === 'VENCIDO' || cycle.prazos?.isVencida;
                  const diasVenc = cycle.prazos?.diasUteisAteVencimento ?? 0;
                  const diasCgofi = cycle.prazos?.diasSemRespostaCgofi ?? 0;
                  const cgofiAtrasado = cycle.status === 'ENVIADO_CGOFI' && Boolean(cycle.alerts?.some((a) => a.tipo === 'CGOFI_SEM_RESPOSTA'));
                  const encerrado = cycle.status === 'PAGO' || cycle.status === 'CANCELADO';

                  return (
                    <tr key={cycle.cycleKey} data-testid={`payment-row-${cycle.cycleKey}`}>
                      <td style={{ ...carteiraTd, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700 }}>Contrato {cycle.contractKey}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Competência: {cycle.competencia || 'N/D'}</div>
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{cycle.input?.documentoAtestoSei || 'Atesto sem doc'}</div>
                        {cycle.input?.numeroProcessoPagamentoSei && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Proc: {cycle.input.numeroProcessoPagamentoSei}</div>
                        )}
                        {cycle.input?.responsavelNome && (
                          <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '0.15rem' }}>Resp: {cycle.input.responsavelNome}</div>
                        )}
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top', textAlign: 'right', fontWeight: 700 }}>
                        {formatCurrency(cycle.input?.valorAtesto)}
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top' }}>
                        <StatusBadge label={statusInfo.label} variant={statusInfo.variant} size="sm" dot={false} />
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top' }}>
                        {encerrado ? (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                        ) : isVencida ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#be123c' }}>
                            FATURA VENCIDA ({Math.abs(diasVenc)}d úteis)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', fontWeight: diasVenc <= 3 ? 700 : 400, color: diasVenc <= 3 ? '#d97706' : '#475569' }}>
                            Vence em {diasVenc} {diasVenc === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {cgofiAtrasado && (
                          <div style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: 700, marginTop: '0.2rem' }}>
                            Cobrar a CGOFI: {diasCgofi} dias úteis sem resposta
                          </div>
                        )}
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top' }}>
                        {cycle.input?.numeroOrdemBancaria ? (
                          <div>
                            <div style={{ fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <CheckCircle2 size={13} aria-hidden="true" />
                              <span>{cycle.input.numeroOrdemBancaria}</span>
                            </div>
                            {cycle.input.dataOrdemBancaria && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Emitida em: {formatDateBR(cycle.input.dataOrdemBancaria)}</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pendente de emissão</span>
                        )}
                      </td>

                      <td style={{ ...carteiraTd, verticalAlign: 'top', textAlign: 'right' }}>
                        {onNavigateContract && (
                          <button
                            type="button"
                            data-testid={`btn-navigate-payment-${cycle.cycleKey}`}
                            onClick={() => onNavigateContract(cycle.contractKey)}
                            style={carteiraButton}
                          >
                            Ver contrato <ExternalLink size={12} aria-hidden="true" />
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
        <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={filteredCycles.length} onChange={setPage} testIdPrefix="payments" />
      </div>
      <p data-testid="payments-footnote" style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.75rem 0.25rem 0' }}>
        "Pagamento confirmado (OB)" indica a conclusão da etapa administrativa no acompanhamento. Os desembolsos oficiais são apurados pelos dados do SIAFI, na tela de Empenhos.
      </p>
    </section>
  );
};

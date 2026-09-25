import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { useAllContractManagers } from '../../hooks/useAllContractManagers';
import { GestaoInstrumentosHeader } from './GestaoInstrumentosHeader';
import { GestaoInstrumentosSummaryCards, type GestaoInstrumentosCardId } from './GestaoInstrumentosSummaryCards';
import { GestaoInstrumentosCategoryTabs, type GestaoInstrumentosCategoryTab } from './GestaoInstrumentosCategoryTabs';
import { GestaoInstrumentosCompactFilters, type GestaoInstrumentosCompactFiltersState } from './GestaoInstrumentosCompactFilters';
import { GestaoInstrumentosTable } from './GestaoInstrumentosTable';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import type { DashboardAttentionCategory, DashboardAttentionItem } from '../../types/managementDashboard';

const TAB_CATEGORY_MAP: Record<Exclude<GestaoInstrumentosCategoryTab, 'TODAS'>, DashboardAttentionCategory[]> = {
  VENCIMENTOS: ['PRORROGACAO_PROXIMA'],
  SALDOS: ['ATA_CRITICA'],
  REAJUSTES: ['REAJUSTE_RADAR'],
  PAGAMENTOS: ['PAGAMENTO_CRITICO'],
  TAREFAS: ['TAREFA_ATRASADA', 'TAREFA_PROXIMA']
};

function matchesTab(item: DashboardAttentionItem, tab: GestaoInstrumentosCategoryTab): boolean {
  if (tab === 'TODAS') return true;
  return TAB_CATEGORY_MAP[tab].includes(item.category);
}

/**
 * Painel Unificado de Gestão e Monitoramento — Lei 14.133.
 *
 * Consolida a antiga "Visão Geral" (/) e "Central de Atenção" (/prazos) numa única
 * camada de apresentação sobre o mesmo Read Model do `useManagementDashboard`
 * (Funil Único de Atenção). Nenhuma nova query, RPC ou regra de negócio é criada aqui —
 * apenas leitura, agregação em memória e formatação do que o dashboardService já calcula.
 */
export const GestaoInstrumentosDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialSeverity = searchParams.get('severity');
  const isValidSeverity = (value: string | null): value is GestaoInstrumentosCompactFiltersState['severidade'] =>
    !!value && ['CRITICA', 'URGENTE', 'ATENCAO', 'INFO'].includes(value);

  const [activeTab, setActiveTab] = useState<GestaoInstrumentosCategoryTab>('TODAS');
  const [severidade, setSeveridade] = useState<GestaoInstrumentosCompactFiltersState['severidade']>(
    isValidSeverity(initialSeverity) ? initialSeverity : 'TODAS'
  );
  const [busca, setBusca] = useState('');

  const {
    readModel,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error,
    refetch
  } = useManagementDashboard({ uasg: '200331' });

  const { data: managers } = useAllContractManagers('200331');

  const allItems = useMemo(() => readModel?.attention?.items || [], [readModel]);

  const tabCounts = useMemo(() => {
    return {
      TODAS: allItems.length,
      VENCIMENTOS: allItems.filter((i) => matchesTab(i, 'VENCIMENTOS')).length,
      SALDOS: allItems.filter((i) => matchesTab(i, 'SALDOS')).length,
      REAJUSTES: allItems.filter((i) => matchesTab(i, 'REAJUSTES')).length,
      PAGAMENTOS: allItems.filter((i) => matchesTab(i, 'PAGAMENTOS')).length,
      TAREFAS: allItems.filter((i) => matchesTab(i, 'TAREFAS')).length
    };
  }, [allItems]);

  const fornecedorByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of readModel?.availableFilters?.contracts || []) {
      if (c.sublabel) map.set(c.key, c.sublabel);
    }
    for (const a of readModel?.availableFilters?.atas || []) {
      if (a.sublabel) map.set(a.key, a.sublabel);
    }
    return map;
  }, [readModel]);

  const responsavelByContractKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, manager] of Object.entries(managers || {})) {
      if (manager?.gestorNome) map.set(key, manager.gestorNome);
    }
    return map;
  }, [managers]);

  const summaryCounts = useMemo(() => {
    const severityBuckets = {
      urgente: allItems.filter((i) => i.severity === 'URGENTE').length,
      atencao: allItems.filter((i) => i.severity === 'ATENCAO').length
    };

    return {
      totalAtas: readModel?.arp?.totalAtas ?? 0,
      itensCriticosArp: readModel?.arp?.itensCriticosCount ?? 0,
      itensProximosLimiteArp: readModel?.arp?.itensProximosLimiteCount ?? 0,
      contratosAtivos: readModel?.executive?.contratosAtivos ?? 0,
      contratosEmAtencao60a90d: (readModel?.deadlines?.vencendo60Dias ?? 0) + (readModel?.deadlines?.vencendo90Dias ?? 0),
      contratosEmProrrogacao: readModel?.deadlines?.prorrogaçõesEmCurso ?? 0,
      contratosAVencer30d: readModel?.deadlines?.vencendo30Dias ?? 0,
      valorVigenteTotal: readModel?.executive?.valorVigenteTotal ?? 0,
      totalEmpenhado: readModel?.financial?.totalEmpenhado ?? 0,
      criticalCount: readModel?.attention?.criticalCount ?? 0,
      totalAlertasAtivos: readModel?.attention?.totalAlertasAtivos ?? 0,
      urgenteCount: severityBuckets.urgente,
      atencaoCount: severityBuckets.atencao
    };
  }, [readModel, allItems]);

  const activeCard: GestaoInstrumentosCardId | null = useMemo(() => {
    if (activeTab === 'SALDOS') return 'ARP';
    if (activeTab === 'VENCIMENTOS') return 'CONTRATOS';
    if (severidade === 'CRITICA') return 'ALERTAS';
    return null;
  }, [activeTab, severidade]);

  const handleSelectCard = useCallback((card: GestaoInstrumentosCardId) => {
    if (card === 'ARP') {
      setActiveTab((prev) => (prev === 'SALDOS' ? 'TODAS' : 'SALDOS'));
    } else if (card === 'CONTRATOS') {
      setActiveTab((prev) => (prev === 'VENCIMENTOS' ? 'TODAS' : 'VENCIMENTOS'));
    } else if (card === 'ALERTAS') {
      setSeveridade((prev) => (prev === 'CRITICA' ? 'TODAS' : 'CRITICA'));
      setActiveTab('TODAS');
    } else {
      // VALOR: card de composição da carteira, não é um balde de alerta — apenas limpa os filtros.
      setActiveTab('TODAS');
      setSeveridade('TODAS');
    }
  }, [setActiveTab, setSeveridade]);

  const filteredItems = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return allItems.filter((item) => {
      if (!matchesTab(item, activeTab)) return false;
      if (severidade !== 'TODAS' && item.severity !== severidade) return false;

      if (query) {
        const fornecedor = (fornecedorByKey.get(item.contractKey || item.numeroAta || '') || '').toLowerCase();
        const haystack = [item.title, item.description, item.numeroContrato, item.contractKey, item.numeroAta, fornecedor]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [allItems, activeTab, severidade, busca, fornecedorByKey]);

  const handleChangeFilter = useCallback(<K extends keyof GestaoInstrumentosCompactFiltersState>(
    key: K,
    value: GestaoInstrumentosCompactFiltersState[K]
  ) => {
    if (key === 'severidade') {
      setSeveridade(value as GestaoInstrumentosCompactFiltersState['severidade']);
    } else {
      setBusca(value as string);
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setActiveTab('TODAS');
    setSeveridade('TODAS');
    setBusca('');
  }, [setActiveTab, setSeveridade, setBusca]);

  if (isError && !readModel) {
    return (
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <ErrorState
          title="Erro ao carregar a Gestão de Instrumentos"
          message={error?.message || 'Não foi possível consolidar a carteira de ARPs e contratos.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '1.5rem 2rem 3rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      <GestaoInstrumentosHeader
        uasg={readModel?.uasg}
        onRefresh={() => refetch()}
        isRefreshing={isLoading || isFetching}
        lastUpdated={dataUpdatedAt}
      />

      <GestaoInstrumentosSummaryCards
        counts={summaryCounts}
        activeCard={activeCard}
        onSelectCard={handleSelectCard}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
          Ações Imediatas / Pendências da Carteira
        </h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
          Instrumentos que exigem sua atenção e as próximas ações recomendadas.
        </p>

        <GestaoInstrumentosCategoryTabs
          counts={tabCounts}
          active={activeTab}
          onSelect={setActiveTab}
        />

        <GestaoInstrumentosCompactFilters
          filters={{ severidade, busca }}
          onChangeFilter={handleChangeFilter}
          onResetFilters={handleResetFilters}
          totalFiltered={filteredItems.length}
          totalItems={allItems.length}
        />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
          <SkeletonLoader variant="card" height="96px" />
        </div>
      ) : (
        <GestaoInstrumentosTable
          items={filteredItems}
          totalItems={allItems.length}
          fornecedorByKey={fornecedorByKey}
          responsavelByContractKey={responsavelByContractKey}
          onResetFilters={handleResetFilters}
        />
      )}
    </div>
  );
};

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
import type { DashboardAttentionCategory } from '../../types/managementDashboard';
import { getLookupKey, getInstrumentoInfo, type AttentionItemWithUasg } from './gestaoInstrumentosRowHelpers';

type TipoFilter = 'TODOS' | 'ARP' | 'CONTRATO';

/** UASGs consolidadas nesta tela — mesmo padrão de UASG única já usado no resto do sistema, chamado uma vez por unidade. */
const UASGS: string[] = ['200330', '200331'];

const TAB_CATEGORY_MAP: Record<Exclude<GestaoInstrumentosCategoryTab, 'TODAS'>, DashboardAttentionCategory[]> = {
  VENCIMENTOS: ['PRORROGACAO_PROXIMA'],
  SALDOS: ['ATA_CRITICA'],
  REAJUSTES: ['REAJUSTE_RADAR'],
  PAGAMENTOS: ['PAGAMENTO_CRITICO'],
  TAREFAS: ['TAREFA_ATRASADA', 'TAREFA_PROXIMA']
};

function matchesTab(item: AttentionItemWithUasg, tab: GestaoInstrumentosCategoryTab): boolean {
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
  /** Acionado apenas pelos cards de resumo (ex.: "Contratos Vigentes" deve mostrar só Contratos, não ARPs). */
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('TODOS');

  const dash200330 = useManagementDashboard({ uasg: UASGS[0] });
  const dash200331 = useManagementDashboard({ uasg: UASGS[1] });
  const dashboards = [dash200330, dash200331];

  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);

  const isLoading = dashboards.some((d) => d.isLoading);
  const isFetching = dashboards.some((d) => d.isFetching);
  const hasAnyReadModel = dashboards.some((d) => d.readModel);
  const isError = dashboards.some((d) => d.isError) && !hasAnyReadModel;
  const error = dashboards.find((d) => d.isError)?.error ?? null;
  const dataUpdatedAt = Math.max(...dashboards.map((d) => d.dataUpdatedAt || 0)) || undefined;
  const refetch = useCallback(() => {
    dash200330.refetch();
    dash200331.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItems = useMemo<AttentionItemWithUasg[]>(() => {
    const merged: AttentionItemWithUasg[] = [];
    for (const uasg of UASGS) {
      const dash = uasg === UASGS[0] ? dash200330 : dash200331;
      const items = dash.readModel?.attention?.items || [];
      for (const item of items) {
        merged.push({ ...item, uasg });
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel]);

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
    for (const uasg of UASGS) {
      const dash = uasg === UASGS[0] ? dash200330 : dash200331;
      for (const c of dash.readModel?.availableFilters?.contracts || []) {
        if (c.sublabel) map.set(c.key, c.sublabel);
      }
      for (const a of dash.readModel?.availableFilters?.atas || []) {
        if (a.sublabel) map.set(`${uasg}-${a.key}`, a.sublabel);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel]);

  const responsavelByContractKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const managers of [managers200330.data, managers200331.data]) {
      for (const [key, manager] of Object.entries(managers || {})) {
        if (manager?.gestorNome) map.set(key, manager.gestorNome);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers200330.data, managers200331.data]);

  const summaryCounts = useMemo(() => {
    const urgenteCount = allItems.filter((i) => i.severity === 'URGENTE').length;
    const atencaoCount = allItems.filter((i) => i.severity === 'ATENCAO').length;

    const sum = (pick: (rm: NonNullable<ReturnType<typeof useManagementDashboard>['readModel']>) => number) =>
      dashboards.reduce((acc, d) => acc + (d.readModel ? pick(d.readModel) : 0), 0);

    return {
      totalAtas: sum((rm) => rm.arp.totalAtas),
      itensCriticosArp: sum((rm) => rm.arp.itensCriticosCount),
      itensProximosLimiteArp: sum((rm) => rm.arp.itensProximosLimiteCount ?? 0),
      contratosAtivos: sum((rm) => rm.executive.contratosAtivos),
      contratosEmAtencao60a90d: sum((rm) => rm.deadlines.vencendo60Dias + rm.deadlines.vencendo90Dias),
      contratosEmProrrogacao: sum((rm) => rm.deadlines.prorrogaçõesEmCurso),
      contratosAVencer30d: sum((rm) => rm.deadlines.vencendo30Dias),
      valorVigenteTotal: sum((rm) => rm.executive.valorVigenteTotal),
      totalEmpenhado: sum((rm) => rm.financial.totalEmpenhado),
      criticalCount: sum((rm) => rm.attention.criticalCount),
      totalAlertasAtivos: sum((rm) => rm.attention.totalAlertasAtivos),
      urgenteCount,
      atencaoCount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel, allItems]);

  const activeCard: GestaoInstrumentosCardId | null = useMemo(() => {
    if (activeTab === 'SALDOS') return 'ARP';
    if (activeTab === 'VENCIMENTOS' && tipoFilter === 'CONTRATO') return 'CONTRATOS';
    if (severidade === 'CRITICA') return 'ALERTAS';
    return null;
  }, [activeTab, severidade, tipoFilter]);

  const handleSelectCard = useCallback((card: GestaoInstrumentosCardId) => {
    if (card === 'ARP') {
      setActiveTab((prev) => (prev === 'SALDOS' ? 'TODAS' : 'SALDOS'));
      setTipoFilter('TODOS');
    } else if (card === 'CONTRATOS') {
      const isActive = activeTab === 'VENCIMENTOS' && tipoFilter === 'CONTRATO';
      setActiveTab(isActive ? 'TODAS' : 'VENCIMENTOS');
      setTipoFilter(isActive ? 'TODOS' : 'CONTRATO');
    } else if (card === 'ALERTAS') {
      setSeveridade((prev) => (prev === 'CRITICA' ? 'TODAS' : 'CRITICA'));
      setActiveTab('TODAS');
      setTipoFilter('TODOS');
    } else {
      // VALOR: card de composição da carteira, não é um balde de alerta — apenas limpa os filtros.
      setActiveTab('TODAS');
      setSeveridade('TODAS');
      setTipoFilter('TODOS');
    }
  }, [activeTab, tipoFilter]);

  const handleSelectTab = useCallback((tab: GestaoInstrumentosCategoryTab) => {
    setActiveTab(tab);
    setTipoFilter('TODOS');
  }, []);

  const filteredItems = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return allItems.filter((item) => {
      if (!matchesTab(item, activeTab)) return false;
      if (severidade !== 'TODAS' && item.severity !== severidade) return false;
      if (tipoFilter !== 'TODOS') {
        const tipo = getInstrumentoInfo(item).tipo === 'ARP' ? 'ARP' : 'CONTRATO';
        if (tipo !== tipoFilter) return false;
      }

      if (query) {
        const fornecedor = (fornecedorByKey.get(getLookupKey(item)) || '').toLowerCase();
        const haystack = [item.title, item.description, item.numeroContrato, item.contractKey, item.numeroAta, item.uasg, fornecedor]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [allItems, activeTab, severidade, tipoFilter, busca, fornecedorByKey]);

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
    setTipoFilter('TODOS');
    setBusca('');
  }, []);

  if (isError) {
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
        uasgs={UASGS}
        onRefresh={refetch}
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
          onSelect={handleSelectTab}
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

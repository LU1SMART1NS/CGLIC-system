import React, { useState, useMemo, useCallback } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { useSearchParams } from 'react-router-dom';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { useAllContractManagers } from '../../hooks/useAllContractManagers';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useRefreshItemSaldos } from '../../hooks/useRefreshItemSaldos';
import { useSincronizacaoContratos } from '../../hooks/useSincronizacaoContratos';
import { avisoComoItemDeAtencao, useAvisosPagamentoGerais } from '../../hooks/useAvisosPagamento';
import { useAuth } from '../../context/AuthContext';
import { GestaoInstrumentosHeader } from './GestaoInstrumentosHeader';
import { GestaoInstrumentosSummaryCards, type GestaoInstrumentosCardId } from './GestaoInstrumentosSummaryCards';
import { GestaoInstrumentosCategoryTabs, type GestaoInstrumentosCategoryTab } from './GestaoInstrumentosCategoryTabs';
import { GestaoInstrumentosCompactFilters, type GestaoInstrumentosCompactFiltersState } from './GestaoInstrumentosCompactFilters';
import { GestaoInstrumentosTable } from './GestaoInstrumentosTable';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import type { DashboardAttentionCategory } from '../../types/managementDashboard';
import { getLookupKey, getInstrumentoInfo, type AttentionItemWithUasg } from './gestaoInstrumentosRowHelpers';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';
import { AvisosResolvidosLista, useResolverAviso } from '../avisos/ResolverAviso';

type TipoFilter = 'TODOS' | 'ARP' | 'CONTRATO';

/** UASGs consolidadas nesta tela — mesmo padrão de UASG única já usado no resto do sistema, chamado uma vez por unidade. */
const UASGS = UASGS_CGLIC;

const TAB_CATEGORY_MAP: Record<Exclude<GestaoInstrumentosCategoryTab, 'TODAS'>, DashboardAttentionCategory[]> = {
  SALDOS: ['ATA_CRITICA', 'UNIDADE_PENDENTE'],
  REAJUSTES: ['REAJUSTE_RADAR'],
  PAGAMENTOS: ['PAGAMENTO_CRITICO', 'PAGAMENTO_PREVISTO'],
  TAREFAS: ['TAREFA_ATRASADA', 'TAREFA_PROXIMA'],
  LEMBRETES: ['LEMBRETE']
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

  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): a Visão Geral consolida 2 UASGs, então o recorte de
  // contratos é resolvido por UASG e repassado ao Read Model de cada uma —
  // mesmo princípio já aplicado em ContractsRoute.tsx (aba "Acompanhamento
  // e Prazos"), agora estendido a todos os blocos agregados (financeiro,
  // ARP, pagamentos, atenção) via buildManagementDashboardReadModel.
  const scope200330 = useAssignedManagementScope(UASGS[0]);
  const scope200331 = useAssignedManagementScope(UASGS[1]);

  // Só consulta depois do escopo do gestor: a chave inclui o escopo, e consultar antes carregava tudo duas vezes.
  const dash200330 = useManagementDashboard(
    { uasg: UASGS[0], assignedContractKeys: scope200330.contractKeys, assignedAtaKeys: scope200330.ataKeys },
    { enabled: !scope200330.isLoading }
  );
  const dash200331 = useManagementDashboard(
    { uasg: UASGS[1], assignedContractKeys: scope200331.contractKeys, assignedAtaKeys: scope200331.ataKeys },
    { enabled: !scope200331.isLoading }
  );
  const dashboards = [dash200330, dash200331];

  // Aguarda também os gestores carregarem antes de liberar a tela: evita
  // que o perfil "gestor" veja, por um instante, os agregados sem nenhum
  // recorte de escopo (assignedContractKeys ainda vazio por falta de dado).
  const isLoading = dashboards.some((d) => d.isLoading) || scope200330.isLoading || scope200331.isLoading;
  const isFetching = dashboards.some((d) => d.isFetching);
  const hasAnyReadModel = dashboards.some((d) => d.readModel);
  const isError = dashboards.some((d) => d.isError) && !hasAnyReadModel;
  const error = dashboards.find((d) => d.isError)?.error ?? null;
  const dataUpdatedAt = Math.max(...dashboards.map((d) => d.dataUpdatedAt || 0)) || undefined;
  // Mantém em dia a quantidade contratada dos itens (base do saldo SENASP) que este painel lê do banco.
  const itemSaldos = useRefreshItemSaldos();
  // Coordenador: atualiza os contratos com as fontes oficiais. Demais perfis: relê o banco.
  // Nos dois casos o painel é recarregado (a atualização invalida o read model).
  const sincronizacao = useSincronizacaoContratos();
  const refetch = useCallback(() => {
    void itemSaldos.refresh();
    void sincronizacao.atualizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sincronizacao.atualizar]);

  // Gestor de Saldo (domínio de alocações, sem contratos): enxerga só os alertas de saldo das Atas.
  const { role } = useAuth();
  const saldosOnly = role === 'gestor_saldos';
  // Expectativa de pagamento (Portaria 50): avisos calculados na tela a partir das marcas dos contratos.
  const { avisos: avisosPagamento } = useAvisosPagamentoGerais({ enabled: !saldosOnly });

  // ✓ Resolvido: a separação usa a lista viva de avisos resolvidos, para o aviso sumir na hora
  // (a Visão Geral já vem do banco sem os resolvidos, mas fica em cache por alguns minutos).
  const resolucao = useResolverAviso();
  const { porChave: avisosResolvidos, tarefasConcluidas } = resolucao;

  const { allItems, itensResolvidos } = useMemo(() => {
    const ativos: AttentionItemWithUasg[] = [];
    const resolvidos: AttentionItemWithUasg[] = [];
    for (const uasg of UASGS) {
      const dash = uasg === UASGS[0] ? dash200330 : dash200331;
      const attention = dash.readModel?.attention;
      for (const item of [...(attention?.items || []), ...(attention?.resolvidos || [])]) {
        if (saldosOnly && item.category !== 'ATA_CRITICA') continue;
        if (item.taskId && tarefasConcluidas.has(item.taskId)) continue;
        (item.avisoChave && avisosResolvidos.has(item.avisoChave) ? resolvidos : ativos).push({ ...item, uasg });
      }
    }
    for (const a of avisosPagamento) ativos.push(avisoComoItemDeAtencao(a, UASGS[0]));
    return { allItems: ativos, itensResolvidos: resolvidos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel, saldosOnly, avisosPagamento, avisosResolvidos, tarefasConcluidas]);

  const tabCounts = useMemo(() => {
    return {
      TODAS: allItems.length,
      SALDOS: allItems.filter((i) => matchesTab(i, 'SALDOS')).length,
      REAJUSTES: allItems.filter((i) => matchesTab(i, 'REAJUSTES')).length,
      PAGAMENTOS: allItems.filter((i) => matchesTab(i, 'PAGAMENTOS')).length,
      TAREFAS: allItems.filter((i) => matchesTab(i, 'TAREFAS')).length,
      LEMBRETES: allItems.filter((i) => matchesTab(i, 'LEMBRETES')).length
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
      // Só CRITICA: é o que o clique no card filtra. Urgentes aparecem na linha própria do card.
      criticalCount: allItems.filter((i) => i.severity === 'CRITICA').length,
      totalAlertasAtivos: sum((rm) => rm.attention.totalAlertasAtivos),
      urgenteCount,
      atencaoCount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel, allItems]);

  const activeCard: GestaoInstrumentosCardId | null = useMemo(() => {
    if (activeTab === 'SALDOS') return 'ARP';
    if (tipoFilter === 'CONTRATO') return 'CONTRATOS';
    if (severidade === 'CRITICA') return 'ALERTAS';
    return null;
  }, [activeTab, severidade, tipoFilter]);

  const handleSelectCard = useCallback((card: GestaoInstrumentosCardId) => {
    if (card === 'ARP') {
      setActiveTab((prev) => (prev === 'SALDOS' ? 'TODAS' : 'SALDOS'));
      setTipoFilter('TODOS');
    } else if (card === 'CONTRATOS') {
      const isActive = tipoFilter === 'CONTRATO';
      setActiveTab('TODAS');
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
        const haystack = [item.title, item.description, item.numeroContrato, item.contractKey, item.numeroAta, item.uasg, fornecedor, item.objetoItem, item.fornecedorNome]
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
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar a Visão Geral"
          message={error?.message || 'Não foi possível consolidar a carteira de ARPs e contratos.'}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <GestaoInstrumentosHeader
        // Só o coordenador atualiza com as fontes oficiais; os demais perfis já leem o banco atualizado.
        onRefresh={sincronizacao.podeForcar ? refetch : undefined}
        isRefreshing={isLoading || isFetching || itemSaldos.isRefreshing || sincronizacao.sincronizando}
        lastUpdated={sincronizacao.ultimoSucessoEm ?? dataUpdatedAt}
      />

      <GestaoInstrumentosSummaryCards
        counts={summaryCounts}
        activeCard={activeCard}
        onSelectCard={handleSelectCard}
        saldosOnly={saldosOnly}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
          Ações Imediatas / Pendências da Carteira
        </h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
          Instrumentos que exigem sua atenção e as próximas ações recomendadas.
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <GestaoInstrumentosCompactFilters
              filters={{ severidade, busca }}
              onChangeFilter={handleChangeFilter}
              onResetFilters={handleResetFilters}
              totalFiltered={filteredItems.length}
              totalItems={allItems.length}
            />
          </div>

          {!saldosOnly && (
            <GestaoInstrumentosCategoryTabs
              counts={tabCounts}
              active={activeTab}
              onSelect={handleSelectTab}
            />
          )}
        </div>
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
          onResolver={resolucao.abrir}
          podeResolverAlvo={resolucao.podeResolverAlvo}
        />
      )}

      <AvisosResolvidosLista
        itens={itensResolvidos.map((item) => ({
          chave: item.avisoChave!,
          titulo: item.objetoItem || item.title,
          contexto: `${getInstrumentoInfo(item).label} · UASG ${item.uasg}`
        }))}
        porChave={avisosResolvidos}
        podeReexibir={resolucao.podeResolver}
        onReexibir={(chave) => resolucao.reexibir.mutate({ chave })}
        reexibindo={resolucao.reexibir.isPending}
        testId="instrumentos-avisos-resolvidos"
      />
      {resolucao.dialog}
    </PageContainer>
  );
};

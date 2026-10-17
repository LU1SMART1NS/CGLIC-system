import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { useSearchParams } from 'react-router-dom';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { useAllContractManagers } from '../../hooks/useAllContractManagers';
import { ROTULO_GESTORES_ATAS, ROTULO_GESTORES_CONTRATOS, useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { ROTULO_AVISOS_RESOLVIDOS } from '../../hooks/useAvisosResolvidos';
import { naoCarregou, useLeiturasComFalha } from '../fonte/useLeiturasComFalha';
import { useRefreshItemSaldos } from '../../hooks/useRefreshItemSaldos';
import { useSincronizacaoContratos } from '../../hooks/useSincronizacaoContratos';
import { avisoComoItemDeAtencao, useAvisosPagamentoGerais } from '../../hooks/useAvisosPagamento';
import { useAuth } from '../../context/AuthContext';
import { GestaoInstrumentosHeader } from './GestaoInstrumentosHeader';
import { GestaoInstrumentosSummaryCards, type GestaoInstrumentosCardId } from './GestaoInstrumentosSummaryCards';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { GestaoInstrumentosCategoryTabs, type GestaoInstrumentosCategoryTab } from './GestaoInstrumentosCategoryTabs';
import { GestaoInstrumentosCompactFilters, type GestaoInstrumentosCompactFiltersState } from './GestaoInstrumentosCompactFilters';
import { GestaoInstrumentosTable } from './GestaoInstrumentosTable';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import type { DashboardAttentionCategory, FonteComFalha } from '../../types/managementDashboard';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';
import { getLookupKey, getInstrumentoInfo, motivoDoEndereco, motivoNoFiltro, type AttentionItemWithUasg } from './gestaoInstrumentosRowHelpers';
import type { CarteiraFilterOption } from '../carteira/CarteiraFilterButton';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';
import { AvisosResolvidosLista, useResolverAviso } from '../avisos/ResolverAviso';
import { Instrument360DockProvider } from '../instrument360/Instrument360DockProvider';
import { Instrument360Head } from '../instrument360/Instrument360Head';
import { scrollToDock } from '../instrument360/instrument360Dock';
import { GestaoInstrumentosDockStrip } from './GestaoInstrumentosDockStrip';
import { useAllAtaManagers } from '../../hooks/useAtaManagers';
import { usePainelCarteira } from '../../hooks/usePainelCarteira';
import { useUsers } from '../../hooks/useUsers';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useContagensExtras } from '../vinculacao/contagemExtras';
import { listarGestores } from '../../utils/escopoDoGestor';
import { EmptyState } from '../../design-system/components/EmptyState';
import { PainelFiltros, TODAS_UASGS, TODOS_OS_GESTORES } from './PainelFiltros';
import { PainelBotoesGavetas, PainelGaveta, type PainelBotaoGaveta, type PainelGavetaId } from './PainelGavetas';
import { GavetaSituacao } from './GavetaSituacao';
import { GavetaDistribuicaoConectada } from './GavetaDistribuicaoConectada';
import { GavetaAlocacao } from './GavetaAlocacao';
import { contarFaixas, criticasPorInstrumento, resumoPorGestor, type InstrumentoNoPainel } from './painelResumo';
import { formatNumber } from '../../utils/format';

type TipoFilter = 'TODOS' | 'ARP' | 'CONTRATO';

/** UASGs consolidadas nesta tela — mesmo padrão de UASG única já usado no resto do sistema, chamado uma vez por unidade. */
const UASGS = UASGS_CGLIC;

const TAB_CATEGORY_MAP: Record<Exclude<GestaoInstrumentosCategoryTab, 'TODAS'>, DashboardAttentionCategory[]> = {
  SALDOS: ['ATA_CRITICA', 'QUANTITATIVOS', 'REGISTRADO_ACIMA', 'ATA_ASSINADA', 'UNIDADE_PENDENTE', 'FORNECEDOR_PNCP', 'VINCULO_A_CONFERIR'],
  REAJUSTES: ['REAJUSTE_RADAR'],
  PAGAMENTOS: ['PAGAMENTO_CRITICO', 'PAGAMENTO_PREVISTO', 'FONTE_A_CONFERIR', 'EMPENHO_ACIMA'],
  TAREFAS: ['TAREFA_ATRASADA', 'TAREFA_PROXIMA'],
  LEMBRETES: ['LEMBRETE']
};

function matchesTab(item: AttentionItemWithUasg, tab: GestaoInstrumentosCategoryTab): boolean {
  if (tab === 'TODAS') return true;
  return TAB_CATEGORY_MAP[tab].includes(item.category);
}

/** Motivo do aviso no filtro, conforme a aba (detalhado nas abas de uma categoria só). */
function motivoNaAba(item: AttentionItemWithUasg, tab: GestaoInstrumentosCategoryTab): { value: string; label: string } {
  return motivoNoFiltro(item, tab !== 'TODAS' && TAB_CATEGORY_MAP[tab].length === 1);
}

/**
 * Painel Unificado de Gestão e Monitoramento — Lei 14.133.
 *
 * Consolida a antiga "Início" (/) e "Central de Atenção" (/prazos) numa única
 * camada de apresentação sobre o mesmo Read Model do `useManagementDashboard`
 * (Funil Único de Atenção). Nenhuma nova query, RPC ou regra de negócio é criada aqui —
 * apenas leitura, agregação em memória e formatação do que o dashboardService já calcula.
 */
export const GestaoInstrumentosDashboard: React.FC = () => {
  // Aba, severidade, gaveta aberta, UASG e gestor ficam no endereço: o link leva o painel como estava e o "Voltar"
  // de um detalhe devolve a mesma visão.
  const [searchParams, setSearchParams] = useSearchParams();
  const mudarEndereco = useCallback((mudancas: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const severidadeUrl = searchParams.get('severity');
  // "Info" saiu do filtro: são os lembretes, que já têm a categoria própria no trilho.
  const severidade: GestaoInstrumentosCompactFiltersState['severidade'] =
    severidadeUrl === 'CRITICA' || severidadeUrl === 'URGENTE' || severidadeUrl === 'ATENCAO' ? severidadeUrl : 'TODAS';
  const abaUrl = searchParams.get('aba') as GestaoInstrumentosCategoryTab | null;
  const activeTab: GestaoInstrumentosCategoryTab = abaUrl && abaUrl in TAB_CATEGORY_MAP ? abaUrl : 'TODAS';
  const motivoUrl = searchParams.get('motivo');
  const motivo: GestaoInstrumentosCompactFiltersState['motivo'] = motivoDoEndereco(motivoUrl);
  const uasgUrl = searchParams.get('uasg');
  const uasgFiltro = uasgUrl && (UASGS as readonly string[]).includes(uasgUrl) ? uasgUrl : TODAS_UASGS;
  const uasgsAtivas = useMemo(() => (uasgFiltro ? [uasgFiltro] : [...UASGS]), [uasgFiltro]);
  const [busca, setBusca] = useState('');
  /** Acionado apenas pelos cards de resumo (ex.: "Contratos Vigentes" deve mostrar só Contratos, não ARPs). */
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('TODOS');

  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);
  const ataManagersQuery = useAllAtaManagers();
  const { data: ataManagers, isLoading: ataManagersLoading } = ataManagersQuery;

  const { role } = useAuth();
  const saldosOnly = role === 'gestor_saldos';
  const semQuantitativos = role === 'gestor';
  const ehGestor = role === 'gestor';
  // Coordenador e consulta escolhem um gestor: o painel inteiro passa a ser a carteira dele, com o mesmo recorte
  // que ele vê no próprio painel (useAssignedManagementScope / escopoDoGestor).
  const podeFiltrarGestor = role === 'admin' || role === 'leitor';
  const { data: usuarios } = useUsers();
  // Só gestores de atas e contratos ativos podem ser escolhidos: coordenador, consulta e inativos ficam fora.
  const idsGestoresAtivos = useMemo(
    () => new Set((usuarios || []).filter((u) => u.ativo && u.perfil === 'gestor').map((u) => u.id)),
    [usuarios]
  );
  const gestores = useMemo(
    () =>
      listarGestores(
        [...Object.values(managers200330.data || {}), ...Object.values(managers200331.data || {})],
        Object.values(ataManagers || {}),
        idsGestoresAtivos
      ),
    [managers200330.data, managers200331.data, ataManagers, idsGestoresAtivos]
  );
  const gestorNome = podeFiltrarGestor ? searchParams.get('gestor') || TODOS_OS_GESTORES : TODOS_OS_GESTORES;
  const gestorEscolhido = gestorNome ? gestores.find((g) => g.nome === gestorNome) : undefined;
  const gestoresCarregando = Boolean(gestorNome) && (managers200330.isLoading || managers200331.isLoading || ataManagersLoading);

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): o Início consolida 2 UASGs, então o recorte de
  // contratos é resolvido por UASG e repassado ao Read Model de cada uma —
  // mesmo princípio já aplicado em ContractsRoute.tsx (aba "Acompanhamento
  // e Prazos"), agora estendido a todos os blocos agregados (financeiro,
  // ARP, pagamentos, atenção) via buildManagementDashboardReadModel.
  const scope200330 = useAssignedManagementScope(UASGS[0], { gestorUserId: gestorEscolhido?.userId });
  const scope200331 = useAssignedManagementScope(UASGS[1], { gestorUserId: gestorEscolhido?.userId });
  const scopeLoading = scope200330.isLoading || scope200331.isLoading || gestoresCarregando;

  // Só consulta depois do escopo do gestor: a chave inclui o escopo, e consultar antes carregava tudo duas vezes.
  const dash200330 = useManagementDashboard(
    { uasg: UASGS[0], assignedContractKeys: scope200330.contractKeys, assignedAtaKeys: scope200330.ataKeys },
    { enabled: !scopeLoading }
  );
  const dash200331 = useManagementDashboard(
    { uasg: UASGS[1], assignedContractKeys: scope200331.contractKeys, assignedAtaKeys: scope200331.ataKeys },
    { enabled: !scopeLoading }
  );
  const dashboards = useMemo(
    () => [dash200330, dash200331].filter((_, i) => uasgsAtivas.includes(UASGS[i])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dash200330.readModel, dash200331.readModel, dash200330.isLoading, dash200331.isLoading, dash200330.isFetching, dash200331.isFetching, dash200330.isError, dash200331.isError, uasgsAtivas]
  );

  // Aguarda também os gestores carregarem antes de liberar a tela: evita
  // que o perfil "gestor" veja, por um instante, os agregados sem nenhum
  // recorte de escopo (assignedContractKeys ainda vazio por falta de dado).
  const isLoading = dashboards.some((d) => d.isLoading) || scopeLoading;
  const isFetching = dashboards.some((d) => d.isFetching);
  const hasAnyReadModel = dashboards.some((d) => d.readModel);
  const isError = dashboards.some((d) => d.isError) && !hasAnyReadModel;
  const error = dashboards.find((d) => d.isError)?.error ?? null;
  const dataUpdatedAt = Math.max(...dashboards.map((d) => d.dataUpdatedAt || 0)) || undefined;
  // Fontes que falharam nesta leitura (ex.: saldo dos itens estourando o tempo limite): o resto da tela segue
  // e o aviso diz o que ficou de fora. Uma linha por fonte; "não carregou" vence "não atualizou".
  // As leituras que a tela faz por fora do painel (gestores, recorte do gestor) entram na mesma faixa: sem elas o
  // perfil gestor via o Início vazio e a coluna Responsável em branco, sem aviso.
  const leiturasDaTela = useLeiturasComFalha([
    { rotulo: ROTULO_GESTORES_CONTRATOS, query: managers200330 },
    { rotulo: ROTULO_GESTORES_CONTRATOS, query: managers200331 },
    { rotulo: ROTULO_GESTORES_ATAS, query: ataManagersQuery },
    ...(scope200330.leituras ?? []),
    ...(scope200331.leituras ?? [])
  ]);
  const fontesDoPainel = useMemo(() => dashboards.flatMap((d) => d.readModel?.fontesComFalha ?? []), [dashboards]);
  // Relê só o painel (sem disparar a sincronização com as fontes oficiais, que é pesada).
  const lerPainelDeNovo = useCallback(() => {
    for (const d of dashboards) void d.refetch();
  }, [dashboards]);
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

  // Gestor de Saldo (domínio de alocações, sem contratos): enxerga os alertas de saldo das Atas e os quantitativos a
  // conferir (cota própria, migration 109), que são pendência dele. O gestor da ata vê o saldo crítico, mas não os
  // quantitativos: quem os resolve é o gestor de saldo (o coordenador vê tudo). A qtd. da ata assinada a informar
  // (migration 116) é o contrário: quem informa é o gestor da ata, e o gestor de saldo não a vê. Registrado acima do
  // homologado (migration 142) também é do gestor da ata: o gestor de saldo só vê o aviso dentro do item.
  // Expectativa de pagamento (Portaria 50): avisos calculados na tela a partir das marcas dos contratos.
  const { avisos: avisosPagamento } = useAvisosPagamentoGerais({ enabled: !saldosOnly });

  // ✓ Resolvido: a separação usa a lista viva de avisos resolvidos, para o aviso sumir na hora
  // (o Início já vem do banco sem os resolvidos, mas fica em cache por alguns minutos).
  const resolucao = useResolverAviso();
  const { porChave: avisosResolvidos, tarefasConcluidas } = resolucao;
  // A lista viva dos resolvidos não carregou: vale a separação que o painel já fez (attention.resolvidos), senão os
  // avisos resolvidos voltariam para a lista como se estivessem em aberto.
  const resolvidosDoPainel = resolucao.consulta ? naoCarregou(resolucao.consulta) : false;
  const leituraDosResolvidos = useLeiturasComFalha(resolucao.consulta ? [{ rotulo: ROTULO_AVISOS_RESOLVIDOS, query: resolucao.consulta }] : []);
  // Uma linha por fonte na faixa; "não carregou" vence "não atualizou".
  const fontesComFalha = useMemo(() => {
    const porRotulo = new Map<string, FonteComFalha>();
    for (const f of [...fontesDoPainel, ...leiturasDaTela.falhas, ...leituraDosResolvidos.falhas]) {
      if (!porRotulo.has(f.rotulo) || f.situacao === 'NAO_CARREGOU') porRotulo.set(f.rotulo, f);
    }
    return [...porRotulo.values()];
  }, [fontesDoPainel, leiturasDaTela.falhas, leituraDosResolvidos.falhas]);
  const tentarDeNovo = () => {
    lerPainelDeNovo();
    void leiturasDaTela.tentarDeNovo();
    void leituraDosResolvidos.tentarDeNovo();
  };

  const { allItems, itensResolvidos } = useMemo(() => {
    const ativos: AttentionItemWithUasg[] = [];
    const resolvidos: AttentionItemWithUasg[] = [];
    for (const uasg of uasgsAtivas) {
      const dash = uasg === UASGS[0] ? dash200330 : dash200331;
      const attention = dash.readModel?.attention;
      const jaResolvidos = new Set(attention?.resolvidos || []);
      for (const item of [...(attention?.items || []), ...(attention?.resolvidos || [])]) {
        if (saldosOnly && item.category !== 'ATA_CRITICA' && item.category !== 'QUANTITATIVOS') continue;
        if (semQuantitativos && item.category === 'QUANTITATIVOS') continue;
        if (item.taskId && tarefasConcluidas.has(item.taskId)) continue;
        const resolvido = resolvidosDoPainel ? jaResolvidos.has(item) : Boolean(item.avisoChave && avisosResolvidos.has(item.avisoChave));
        (resolvido ? resolvidos : ativos).push({ ...item, uasg });
      }
    }
    // Avisos de pagamento são calculados para a carteira inteira do perfil: com UASG ou gestor escolhido, ficam só os
    // dos contratos que estão no painel.
    const contratosDoGestor = gestorEscolhido ? new Set([...(scope200330.contractKeys || []), ...(scope200331.contractKeys || [])]) : null;
    for (const a of avisosPagamento) {
      const item = avisoComoItemDeAtencao(a, UASGS[0]);
      if (!uasgsAtivas.includes(item.uasg)) continue;
      if (contratosDoGestor && !(item.contractKey && contratosDoGestor.has(item.contractKey))) continue;
      ativos.push(item);
    }
    return { allItems: ativos, itensResolvidos: resolvidos };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash200330.readModel, dash200331.readModel, uasgsAtivas, gestorEscolhido, scope200330.contractKeys, scope200331.contractKeys, saldosOnly, semQuantitativos, avisosPagamento, avisosResolvidos, resolvidosDoPainel, tarefasConcluidas]);

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
      // Gestor de Saldo: o total do banco soma avisos de todo tipo; conta só os de saldo, como a lista.
      totalAlertasAtivos: saldosOnly ? allItems.length : sum((rm) => rm.attention.totalAlertasAtivos),
      urgenteCount,
      atencaoCount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards, allItems, saldosOnly]);

  const activeCard: GestaoInstrumentosCardId | null = useMemo(() => {
    if (activeTab === 'SALDOS') return 'ARP';
    if (tipoFilter === 'CONTRATO') return 'CONTRATOS';
    if (severidade === 'CRITICA') return 'ALERTAS';
    return null;
  }, [activeTab, severidade, tipoFilter]);

  const handleSelectCard = useCallback((card: GestaoInstrumentosCardId) => {
    if (card === 'ARP') {
      // Troca de aba: o motivo é por aba, então sai junto (o da aba anterior pode nem existir nesta).
      mudarEndereco({ aba: activeTab === 'SALDOS' ? null : 'SALDOS', motivo: null });
      setTipoFilter('TODOS');
    } else if (card === 'CONTRATOS') {
      const isActive = tipoFilter === 'CONTRATO';
      mudarEndereco({ aba: null, motivo: null });
      setTipoFilter(isActive ? 'TODOS' : 'CONTRATO');
    } else if (card === 'ALERTAS') {
      mudarEndereco({ severity: severidade === 'CRITICA' ? null : 'CRITICA', aba: null, motivo: null });
      setTipoFilter('TODOS');
    } else {
      // VALOR: card de composição da carteira, não é um balde de alerta — apenas limpa os filtros.
      mudarEndereco({ aba: null, severity: null, motivo: null });
      setTipoFilter('TODOS');
    }
  }, [activeTab, tipoFilter, severidade, mudarEndereco]);

  const handleSelectTab = useCallback((tab: GestaoInstrumentosCategoryTab) => {
    // Cada aba tem os seus motivos; ao trocar de aba o filtro de Motivo é zerado.
    mudarEndereco({ aba: tab === 'TODAS' ? null : tab, motivo: null });
    setTipoFilter('TODOS');
  }, [mudarEndereco]);

  // Como nas telas 360: clicar num cartão, num número da faixa ou no trilho encolhe os cartões e leva à lista.
  const dockRef = React.useRef<HTMLDivElement>(null);
  const selectCardAndDock = useCallback((card: GestaoInstrumentosCardId) => {
    handleSelectCard(card);
    scrollToDock(dockRef.current);
  }, [handleSelectCard]);
  const selectTabAndDock = useCallback((tab: GestaoInstrumentosCategoryTab) => {
    handleSelectTab(tab);
    scrollToDock(dockRef.current);
  }, [handleSelectTab]);

  // Filtros de base (aba, prioridade, tipo e busca), sem o de Motivo: a lista aplica todos; o seletor de Motivo
  // usa só estes para contar quantos itens cada motivo traria na aba aberta (a contagem não muda ao escolher um motivo).
  const matchesBaseFilters = useCallback((item: AttentionItemWithUasg): boolean => {
    if (!matchesTab(item, activeTab)) return false;
    if (severidade !== 'TODAS' && item.severity !== severidade) return false;
    if (tipoFilter !== 'TODOS') {
      const tipo = getInstrumentoInfo(item).tipo === 'ARP' ? 'ARP' : 'CONTRATO';
      if (tipo !== tipoFilter) return false;
    }
    const query = busca.trim().toLowerCase();
    if (query) {
      const fornecedor = (fornecedorByKey.get(getLookupKey(item)) || '').toLowerCase();
      const haystack = [item.title, item.description, item.numeroContrato, item.contractKey, item.numeroAta, item.uasg, fornecedor, item.objetoItem, item.fornecedorNome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }, [activeTab, severidade, tipoFilter, busca, fornecedorByKey]);

  // Motivos presentes na aba aberta (já com os demais filtros aplicados), do mais frequente ao menos, com a contagem.
  const motivoOptions = useMemo<CarteiraFilterOption[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of allItems) {
      if (!matchesBaseFilters(item)) continue;
      const m = motivoNaAba(item, activeTab);
      const atual = counts.get(m.value);
      counts.set(m.value, { label: m.label, count: (atual?.count ?? 0) + 1 });
    }
    return [...counts.entries()]
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  }, [allItems, matchesBaseFilters, activeTab]);

  const filteredItems = useMemo(
    () => allItems.filter((item) => matchesBaseFilters(item) && (motivo === 'TODAS' || motivoNaAba(item, activeTab).value === motivo)),
    [allItems, matchesBaseFilters, motivo, activeTab]
  );

  const handleChangeFilter = useCallback(<K extends keyof GestaoInstrumentosCompactFiltersState>(
    key: K,
    value: GestaoInstrumentosCompactFiltersState[K]
  ) => {
    if (key === 'severidade') {
      const sev = value as GestaoInstrumentosCompactFiltersState['severidade'];
      mudarEndereco({ severity: sev === 'TODAS' ? null : sev });
    } else if (key === 'motivo') {
      const m = value as GestaoInstrumentosCompactFiltersState['motivo'];
      mudarEndereco({ motivo: m === 'TODAS' ? null : m });
    } else {
      setBusca(value as string);
    }
  }, [mudarEndereco]);

  const handleResetFilters = useCallback(() => {
    mudarEndereco({ aba: null, severity: null, motivo: null });
    setTipoFilter('TODOS');
    setBusca('');
  }, [mudarEndereco]);

  // ---- Filtros do painel (UASG e gestor) -------------------------------------------------------------------------
  const navigate = useNavigateWithOrigin();
  const escolherUasg = useCallback((u: string) => mudarEndereco({ uasg: u || null }), [mudarEndereco]);
  const escolherGestor = useCallback((nome: string) => {
    // Sem gestor escolhido volta a Distribuição; com gestor, a gaveta Distribuição não existe.
    mudarEndereco({ gestor: nome || null, gaveta: nome && searchParams.get('gaveta') === 'distribuicao' ? null : searchParams.get('gaveta') });
  }, [mudarEndereco, searchParams]);
  const limparFiltrosDoPainel = useCallback(() => mudarEndereco({ uasg: null, gestor: null }), [mudarEndereco]);

  // ---- Gavetas: botões com resumo e uma área aberta por vez -------------------------------------------------------
  const extras = useContagensExtras();
  const gavetasDisponiveis: PainelGavetaId[] = saldosOnly
    ? ['situacao', 'alocacao']
    : podeFiltrarGestor && !gestorNome
      ? ['situacao', 'distribuicao']
      : ['situacao'];
  const gavetaUrl = searchParams.get('gaveta') as PainelGavetaId | null;
  const gavetaAberta: PainelGavetaId | null = gavetaUrl && gavetasDisponiveis.includes(gavetaUrl) ? gavetaUrl : null;
  const rolarParaGaveta = useRef(false);
  const alternarGaveta = useCallback((id: PainelGavetaId) => {
    const abrir = gavetaAberta !== id;
    rolarParaGaveta.current = abrir;
    mudarEndereco({ gaveta: abrir ? id : null });
  }, [gavetaAberta, mudarEndereco]);
  // Ao abrir, a gaveta vem para logo abaixo da faixa (como os cartões levam à lista): continua visível ao rolar.
  useEffect(() => {
    if (!gavetaAberta || !rolarParaGaveta.current) return;
    rolarParaGaveta.current = false;
    scrollToDock(dockRef.current);
  }, [gavetaAberta]);

  const vencem90Contratos = summaryCounts.contratosEmAtencao60a90d + summaryCounts.contratosAVencer30d;
  const botoesGavetas: PainelBotaoGaveta[] = gavetasDisponiveis.map((id) => {
    if (id === 'situacao') {
      return saldosOnly
        ? { id, resumo: `${formatNumber(summaryCounts.itensCriticosArp)} itens acima de 80%`, atencao: summaryCounts.itensCriticosArp > 0 }
        : { id, resumo: `${formatNumber(vencem90Contratos)} ${vencem90Contratos === 1 ? 'contrato vence' : 'contratos vencem'} em 90 dias`, atencao: vencem90Contratos > 0 };
    }
    if (id === 'distribuicao') {
      const sem = extras.atasSemGestor;
      return sem == null ? { id, resumo: 'por gestor' } : { id, resumo: `${formatNumber(sem)} ${sem === 1 ? 'ata' : 'atas'} sem gestor`, atencao: sem > 0 };
    }
    const aAlocar = extras.itensAAlocar;
    return aAlocar == null ? { id } : { id, resumo: `${formatNumber(aAlocar)} ${aAlocar === 1 ? 'item' : 'itens'} a alocar`, atencao: aAlocar > 0 };
  });

  // Situação e Distribuição leem as carteiras de atas e contratos (mesmo cache); só com a gaveta aberta.
  const carteira = usePainelCarteira(gavetaAberta === 'situacao' || gavetaAberta === 'distribuicao');
  const recorte = useMemo(() => {
    const doEscopo = scope200330.contractKeys !== undefined || scope200331.contractKeys !== undefined;
    const contratos = doEscopo ? new Set([...(scope200330.contractKeys || []), ...(scope200331.contractKeys || [])]) : null;
    const atas = doEscopo ? new Set([...(scope200330.ataKeys || []), ...(scope200331.ataKeys || [])]) : null;
    const filtrar = (lista: InstrumentoNoPainel[], chaves: Set<string> | null) =>
      lista.filter((i) => uasgsAtivas.includes(i.uasg) && (!chaves || chaves.has(i.chave)));
    return { atas: filtrar(carteira.atas, atas), contratos: filtrar(carteira.contratos, contratos) };
  }, [carteira.atas, carteira.contratos, scope200330.contractKeys, scope200331.contractKeys, scope200330.ataKeys, scope200331.ataKeys, uasgsAtivas]);
  const consumo = useMemo(() => {
    const sum = (pick: (rm: NonNullable<ReturnType<typeof useManagementDashboard>['readModel']>) => number) =>
      dashboards.reduce((acc, d) => acc + (d.readModel ? pick(d.readModel) : 0), 0);
    return {
      totalItens: sum((rm) => rm.arp.totalItens),
      criticos: sum((rm) => rm.arp.itensCriticosCount),
      emAtencao: sum((rm) => rm.arp.itensProximosLimiteCount ?? 0)
    };
  }, [dashboards]);
  const resumoGestores = useMemo(
    () => (gavetaAberta === 'distribuicao' ? resumoPorGestor(carteira.gestores, recorte.atas, recorte.contratos, criticasPorInstrumento(allItems)) : []),
    [gavetaAberta, carteira.gestores, recorte, allItems]
  );

  const gaveta = gavetaAberta && (
    <PainelGaveta
      id={gavetaAberta}
      onFechar={() => alternarGaveta(gavetaAberta)}
      subtitulo={
        gavetaAberta === 'situacao'
          ? 'Clique numa faixa para abrir os registros.'
          : gavetaAberta === 'distribuicao'
            ? 'Vigentes de cada carteira; vencem = em até 90 dias; críticas = pendências críticas. Clique num gestor para ver o painel dele.'
            : 'Itens com quantitativo SENASP das atas não encerradas, pelo quanto já foi alocado às unidades.'
      }
    >
      {gavetaAberta === 'situacao' && (
        <GavetaSituacao
          atas={carteira.isLoading ? null : contarFaixas(recorte.atas)}
          contratos={saldosOnly ? undefined : carteira.isLoading ? null : contarFaixas(recorte.contratos)}
          consumo={consumo}
          gestorNome={gestorNome || undefined}
          isLoading={carteira.isLoading}
          onAbrir={navigate}
        />
      )}
      {gavetaAberta === 'distribuicao' && (
        <GavetaDistribuicaoConectada
          linhas={resumoGestores}
          isLoading={carteira.isLoading}
          onEscolherGestor={(nome) => {
            mudarEndereco({ gestor: nome, gaveta: null });
            window.scrollTo({ top: 0 });
          }}
          onDistribuir={() => navigate('/atas/distribuicao')}
        />
      )}
      {gavetaAberta === 'alocacao' && <GavetaAlocacao onAbrir={navigate} />}
    </PainelGaveta>
  );

  // Gestor sem nenhuma ata ou contrato atribuído: em vez de um painel zerado, explica o que falta. Se a leitura das
  // atribuições falhou, não é "sem carteira": a faixa diz o que não carregou.
  const escopoNaoCarregou = [...(scope200330.leituras ?? []), ...(scope200331.leituras ?? [])].some((l) => naoCarregou(l.query));
  const semCarteira =
    ehGestor &&
    !scopeLoading &&
    !escopoNaoCarregou &&
    (scope200330.contractKeys?.length ?? 0) + (scope200331.contractKeys?.length ?? 0) + (scope200330.ataKeys?.length ?? 0) === 0;

  if (isError) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar o Início"
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

      <PainelFiltros
        uasg={uasgFiltro}
        onUasg={escolherUasg}
        gestor={podeFiltrarGestor ? { valor: gestorNome, nomes: gestores.map((g) => g.nome), onChange: escolherGestor } : undefined}
        onLimpar={limparFiltrosDoPainel}
      />

      <FontesComFalhaAviso
        falhas={fontesComFalha}
        onTentar={tentarDeNovo}
        tentando={isFetching || leiturasDaTela.tentando || leituraDosResolvidos.tentando}
        onde="do Início"
        testIdPrefix="inicio-fontes"
      />

      {semCarteira ? (
        <EmptyState
          title="Você ainda não tem atas ou contratos atribuídos"
          description="Este painel mostra a sua carteira. Quando a coordenação distribuir atas ou contratos para você, os números e as pendências aparecem aqui."
          testId="instrumentos-sem-carteira"
        />
      ) : (
      // Cartões + trilho grudam no alto e encolhem em faixa azul ao rolar (mesmo bloco das telas 360).
      // A lista tem de ser o irmão seguinte do bloco; o espaço perdido ao encolher volta no fim (--i360-lost).
      <Instrument360DockProvider>
        <div style={{ paddingBottom: 'var(--i360-lost, 0px)' }}>
          <Instrument360Head>
            <GestaoInstrumentosDockStrip
              counts={summaryCounts}
              activeCard={activeCard}
              onSelectCard={selectCardAndDock}
              saldosOnly={saldosOnly}
              gestorNome={gestorNome || undefined}
              gavetas={gavetasDisponiveis}
              gavetaAberta={gavetaAberta}
              onToggleGaveta={alternarGaveta}
            />
            <div className="i360-fold" ref={dockRef}>
              <div className="i360-fold-in">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '0.75rem' }}>
                  <GestaoInstrumentosSummaryCards
                    counts={summaryCounts}
                    activeCard={activeCard}
                    onSelectCard={selectCardAndDock}
                    saldosOnly={saldosOnly}
                  />
                  <PainelBotoesGavetas botoes={botoesGavetas} aberta={gavetaAberta} onToggle={alternarGaveta} />
                  <SectionHeader
                    title="Pendências da carteira"
                    subtitle="Saldos, reajustes, pagamentos, tarefas e lembretes que exigem sua ação."
                    className="section-header--flush"
                    testId="instrumentos-pendencias-header"
                  />
                </div>
              </div>
            </div>

            {!saldosOnly && (
              <div className="vg-rail">
                <GestaoInstrumentosCategoryTabs
                  counts={tabCounts}
                  active={activeTab}
                  onSelect={selectTabAndDock}
                />
              </div>
            )}
          </Instrument360Head>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {gaveta}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                <GestaoInstrumentosCompactFilters
                  filters={{ severidade, motivo, busca }}
                  onChangeFilter={handleChangeFilter}
                  onResetFilters={handleResetFilters}
                  motivoOptions={motivoOptions}
                  totalFiltered={filteredItems.length}
                  totalItems={allItems.length}
                />
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
          </div>
        </div>
      </Instrument360DockProvider>
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

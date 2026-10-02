import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Trash2, ExternalLink, ChevronRight, ChevronDown, Eye } from 'lucide-react';
import { fetchPncpContractEmpenhos, fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe, fetchContratosGovData, getCanonicalContractKey, parsePncpIdentifiers } from '../services/api';
import { normalizeEmpenhoNumero, calculateItemCardMetrics, deduceEmpenhoQuantity, getEmpenhoEffectiveValue } from '../services/balanceService';
import { cacheArpsInDb, cacheArpItemsInDb } from '../services/dbCacheService';
import { type InternalDepartment } from '../services/unitService';
import { useItemUnidades } from '../hooks/useItemUnidades';
import { useItemAdesoes } from '../hooks/useItemAdesoes';
import { useDepartments } from '../hooks/useDepartments';
import { useItemEmpenhos } from '../hooks/useItemEmpenhos';
import { useItemContracts } from '../hooks/useItemContracts';
import { useItemAllocations } from '../hooks/useItemAllocations';
import { useSaveAllocations } from '../hooks/useSaveAllocations';
import { useItemEmpenhoLinks } from '../hooks/useItemEmpenhoLinks';
import { useSaveEmpenhoLinks } from '../hooks/useSaveEmpenhoLinks';
import { useItemManualQuantities } from '../hooks/useItemManualQuantities';
import { useItemManualContracts } from '../hooks/useItemManualContracts';
import { useDeleteManualContract } from '../hooks/useDeleteManualContract';
import { useItemContractEmpenhoLinks } from '../hooks/useItemContractEmpenhoLinks';
import { useItemContractLinks } from '../hooks/useItemContractLinks';
import { useUnlinkContractFromItem } from '../hooks/useUnlinkContractFromItem';
import { useDismissedContractSuggestions } from '../hooks/useDismissedContractSuggestions';
import { useSyncContractItemQuantity } from '../hooks/useSyncContractItemQuantity';
import { useSyncItemContractEmpenhos } from '../hooks/useSyncItemContractEmpenhos';
import { useItemEmpenhoVinculos } from '../hooks/useItemEmpenhoVinculos';
import { useConfirmEmpenhoItemQuantity } from '../hooks/useConfirmEmpenhoItemQuantity';
import {
  summarizeContractExecution,
  summarizeItemExecution,
  comprasGovConsumido,
  compareWithComprasGov
} from '../utils/itemExecutionSummary';
import type { ItemEmpenhoVinculo } from '../types/itemEmpenhoVinculo';
import { useDismissContractSuggestion } from '../hooks/useDismissContractSuggestion';
import { useRestoreContractSuggestion } from '../hooks/useRestoreContractSuggestion';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { enrichContractLinks } from '../services/arpContractLinkService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import { cnpjDaUasg } from '../config/unidadesGestoras';
import {
  buildItemContractSuggestions,
  buildItemSuggestionCriteria,
  quantidadesPorContrato,
  suggestionToContractRecord,
  type ItemContractSuggestion
} from '../utils/itemContractSuggestions';
import { AppButton, AppCard, EmptyState, SectionHeader } from '../design-system';

import { LinkContractModal } from './modals/LinkContractModal';
import { ContractSuggestionsPanel } from './item-balances/ContractSuggestionsPanel';
import { ItemHero, type ItemTab } from './item-balances/ItemHero';
import { ContractEmpenhosPanel } from './item-balances/ContractEmpenhosPanel';
import { AllocationsTab, type AllocationRow } from './item-balances/AllocationsTab';
import { summarizeAllocationExecution } from '../utils/allocationExecution';
import { ItemExecutionSummaryStrip } from './item-balances/ItemExecutionSummaryStrip';
import { Instrument360Tabs } from './instrument360/Instrument360Tabs';
import { useAuth } from '../context/AuthContext';
import { useToast, useConfirmDialog, StatusBadge } from '../design-system';
import { UnidadesTab } from './item-balances/UnidadesTab';
import { AdesoesTab } from './item-balances/AdesoesTab';
import { EmpenhoDetailModal } from './item-balances/EmpenhoDetailModal';
import { formatNumber, formatDate, isGerenciadoraUasg, isAllowedEmpenhoUasg, getContractPncpUrl } from './item-balances/itemBalanceUtils';
import type { ArpRecord, ArpItemRecord, EmpenhoSaldoItemRecord, InternalAllocation, PncpContract, PncpContractEmpenho, ContratosGovEmpenhoRecord, Empenho } from '../types';

interface ItemBalancesProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
}

const ITEM_TABS: ItemTab[] = ['unidades', 'contratos', 'alocacao', 'adesoes'];
const EMPTY_ALLOCATIONS: InternalAllocation[] = [];
const EMPTY_RECORD: Record<string, string> = {};
const EMPTY_RECORD_NUM: Record<string, number> = {};

export const ItemBalances: React.FC<ItemBalancesProps> = ({ arp, item, onBack }) => {

  const {
    data: unidades = [],
    isLoading: loading,
    error: unidadesQueryError
  } = useItemUnidades(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem,
    arp,
    item
  );
  const error = unidadesQueryError ? (unidadesQueryError.message || 'Erro ao buscar saldos por unidade.') : null;

  const {
    data: adesoes = [],
    isLoading: adesoesLoading,
    error: adesoesQueryError
  } = useItemAdesoes(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const adesoesError = adesoesQueryError ? (adesoesQueryError.message || 'Falha ao buscar as adesões do item.') : null;

  const {
    data: empenhos = [],
    refetch: refetchEmpenhos
  } = useItemEmpenhos(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  // Aba no endereço (?aba=), como nas telas 360: sobrevive a recarregar e pode ser compartilhada.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 'empenhos' era uma aba própria; os empenhos agora ficam dentro de cada contrato.
  const rawTabParam = searchParams.get('aba');
  const tabParam = (rawTabParam === 'empenhos' ? 'contratos' : rawTabParam) as ItemTab | null;
  const activeTab: ItemTab = tabParam && ITEM_TABS.includes(tabParam) ? tabParam : 'unidades';
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const setActiveTab = (tab: ItemTab) => {
    setSearchParams(tab === 'unidades' ? {} : { aba: tab }, { replace: true });
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Mesmas regras do backend: alocações e vínculo empenho→unidade exigem allocations.manage
  // (admin e gestor de saldos); contratos e empenhos manuais, admin e gestor.
  const { role } = useAuth();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const canManageAllocations = role === 'admin' || role === 'gestor_saldos';
  const canEditData = role === 'admin' || role === 'gestor';

  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});
  const [contractEmpenhos, setContractEmpenhos] = useState<Record<string, PncpContractEmpenho[]>>({});
  const [contractGovEmpenhos, setContractGovEmpenhos] = useState<Record<string, ContratosGovEmpenhoRecord[]>>({});
  const [empenhosLoadingMap, setEmpenhosLoadingMap] = useState<Record<string, boolean>>({});
  const [selectedEmpenhoDetail, setSelectedEmpenhoDetail] = useState<EmpenhoSaldoItemRecord | null>(null);

  const {
    data: allocationsState
  } = useItemAllocations(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const allocations = allocationsState?.allocations ?? EMPTY_ALLOCATIONS;
  const allocationVersion = allocationsState?.version ?? 1;

  const saveAllocationsMutation = useSaveAllocations();

  const {
    data: empenhoLinksState
  } = useItemEmpenhoLinks(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const empenhoLinks = empenhoLinksState?.links ?? EMPTY_RECORD;
  const empenhoLinkVersion = empenhoLinksState?.version ?? 1;

  const saveEmpenhoLinksMutation = useSaveEmpenhoLinks();

  const [newUnitName, setNewUnitName] = useState<string>('');

  const [newAllocatedQty, setNewAllocatedQty] = useState<number | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  // Hooks Canônicos de Leitura para Dados Manuais (React Query)
  const { data: manualQuantitiesState, refetch: refetchManualQuantities } = useItemManualQuantities(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const empenhoManualQuantities = manualQuantitiesState?.quantities ?? EMPTY_RECORD_NUM;

  const deleteManualContractMutation = useDeleteManualContract();

  const { data: manualContratos = [], refetch: refetchManualContracts } = useItemManualContracts(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );

  const { refetch: refetchContractEmpenhoLinks } = useItemContractEmpenhoLinks(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );

  // Estados Locais de Formulários e Modais (UI State)
  const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
  const canonicalItemKey = normalizeItemKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem);

  // Vínculos Oficiais com Contratos do CGLIC (Fase 6.2)
  const { data: contractLinks = [] } = useItemContractLinks(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem,
    canonicalItemKey
  );
  const { data: officialDashboardContracts = [] } = useContractsDashboard(arp.codigoUnidadeGerenciadora);
  const unlinkContractMutation = useUnlinkContractFromItem();
  const [isLinkContractModalOpen, setIsLinkContractModalOpen] = useState<boolean>(false);
  const [linkingSuggestion, setLinkingSuggestion] = useState<ItemContractSuggestion | null>(null);



  const loadManualData = async () => {
    try {
      await Promise.all([
        refetchManualQuantities(),
        refetchManualContracts(),
        refetchContractEmpenhoLinks()
      ]);
    } catch (e) {
      console.warn('Erro ao recarregar dados manuais:', e);
    }
  };

  const handleDeleteManualContrato = async (contratoId: string) => {
    if (await confirm({ title: 'Excluir contrato manual', message: 'Tem certeza que deseja excluir este contrato manual?', tone: 'danger', confirmLabel: 'Excluir' })) {
      try {
        await deleteManualContractMutation.mutateAsync({
          id: contratoId,
          itemKey
        });
      } catch (err: any) {
        console.error('Erro ao excluir contrato manual:', err);
        if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
          toast.error('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
        } else if (err?.code === 'CONTRACT_NOT_FOUND' || err?.sqlState === 'P0002') {
          toast.error('Contrato manual não encontrado ou já excluído.');
        } else {
          toast.error(`Erro ao excluir contrato manual: ${err?.message || 'Erro desconhecido'}`);
        }
      }
    }
  };

  const handleUnlinkOfficialContract = async (linkId: string, contractKey?: string) => {
    if (await confirm({ title: 'Desvincular contrato', message: 'Tem certeza que deseja desvincular este contrato oficial deste item da ata?', tone: 'danger', confirmLabel: 'Desvincular' })) {
      try {
        await unlinkContractMutation.mutateAsync({
          linkId,
          itemKey: canonicalItemKey,
          contractKey
        });
      } catch (err: any) {
        console.error('Erro ao desvincular contrato oficial:', err);
        if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
          toast.error('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
        } else {
          toast.error(`Erro ao desvincular contrato oficial: ${err?.message || 'Erro desconhecido'}`);
        }
      }
    }
  };

  // Cadastro de Unidades Oficiais
  const {
    data: departments = [],
    isLoading: departmentsLoading
  } = useDepartments();

  const getFirstAvailableUnitSigla = (
    deps: InternalDepartment[],
    allocs: InternalAllocation[],
    excludeId: string | null = null
  ): string => {
    const allocatedUnits = new Set(
      allocs
        .filter(a => a.id !== excludeId)
        .map(a => a.unitName.trim().toLowerCase())
    );
    const available = deps.find(d => !allocatedUnits.has(d.sigla.trim().toLowerCase()));
    return available ? available.sigla : (deps[0]?.sigla || '');
  };

  const pncpParams = useMemo(() => {
    const parsed = parsePncpIdentifiers(arp);
    if (parsed) return parsed;

    if (arp.linkAtaPNCP) {
      const match = arp.linkAtaPNCP.match(/atas\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
      if (match) {
        return {
          cnpj: match[1],
          ano: match[2],
          sequencial: match[3],
          sequencialAta: match[4]
        };
      }
    }

    if (arp.numeroControlePncpAta) {
      const parts = arp.numeroControlePncpAta.split('-');
      if (parts.length >= 4) {
        const cnpj = parts[0];
        const purchasePart = parts[2];
        const purchaseMatch = purchasePart.split('/');
        const sequencial = purchaseMatch[0];
        const ano = purchaseMatch[1] || arp.dataVigenciaInicial?.split('-')[0];
        const lastPart = parts[parts.length - 1];
        const sequencialAta = parseInt(lastPart, 10).toString();
        
        return { cnpj, ano, sequencial, sequencialAta };
      }
    }

    // Extrai sequencial da ata diretamente (ex: "00003/2026" -> sequencialAta = "3")
    const ataMatch = (arp.numeroAtaRegistroPreco || '').split('/');
    if (ataMatch.length === 2 && !isNaN(parseInt(ataMatch[0], 10))) {
      return {
        cnpj: cnpjDaUasg(arp.codigoUnidadeGerenciadora),
        ano: ataMatch[1] || arp.anoCompra || '',
        sequencial: arp.numeroCompra || '',
        sequencialAta: parseInt(ataMatch[0], 10).toString()
      };
    }

    return null;
  }, [arp]);

  const fallbackParams = useMemo(() => ({
    codigoOrgao: arp.codigoOrgao,
    codigoUnidadeGestora: arp.codigoUnidadeGerenciadora,
    idCompra: arp.idCompra,
    numeroCompra: arp.numeroCompra,
    anoCompra: arp.anoCompra,
    codigoModalidadeCompra: arp.codigoModalidadeCompra,
    dataVigenciaInicial: arp.dataVigenciaInicial,
    numeroControlePncpCompra: arp.numeroControlePncpCompra
  }), [arp]);

  const fornecedorInfo = useMemo(() => ({
    niFornecedor: item.niFornecedor,
    nomeFornecedor: item.nomeRazaoSocialFornecedor
  }), [item]);

  const {
    data: contracts = [],
    isLoading: contractsLoading,
    error: contractsQueryError,
    refetch: refetchContracts
  } = useItemContracts(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem,
    pncpParams?.cnpj,
    pncpParams?.ano,
    pncpParams?.sequencial,
    pncpParams?.sequencialAta,
    fallbackParams,
    fornecedorInfo,
    arp.numeroAtaRegistroPreco
  );
  const contractsError = contractsQueryError ? (contractsQueryError.message || 'Falha ao buscar contratos do PNCP.') : null;

  // Vínculos confirmados; a quantidade do item no contrato vem da API, não do vínculo
  const enrichedOfficialLinks = useMemo(() => {
    return enrichContractLinks(contractLinks, officialDashboardContracts, quantidadesPorContrato(contracts, officialDashboardContracts));
  }, [contractLinks, officialDashboardContracts, contracts]);

  // Empenhos do item que vieram dos contratos vinculados (arp_item_empenhos), com a quantidade de cada um.
  const { data: empenhoVinculos = [], isLoading: vinculosLoading } = useItemEmpenhoVinculos(canonicalItemKey);
  const confirmQuantityMutation = useConfirmEmpenhoItemQuantity();
  const syncEmpenhosMutation = useSyncItemContractEmpenhos();

  // Relê da API, para cada contrato vinculado, a quantidade contratada (que entra no saldo) e os empenhos do
  // contrato, estimados pelo preço unitário do próprio contrato. Ao abrir o item roda uma vez por contrato
  // (a quantidade só se nunca lida ou com mais de 6 horas); o botão Atualizar força tudo de novo.
  const syncContractQuantityMutation = useSyncContractItemQuantity();
  const contractSyncAttempted = React.useRef<Set<string>>(new Set());
  const [syncingContracts, setSyncingContracts] = useState(false);

  const syncLinkedContracts = async (force: boolean): Promise<{ total: number; falhas: number }> => {
    const sixHours = 6 * 60 * 60 * 1000;
    const targets = enrichedOfficialLinks.filter(
      (l) => l.contract && (force || !contractSyncAttempted.current.has(l.linkId))
    );
    // Marca todos de uma vez: uma nova passagem do efeito não repete contratos que já estão na fila.
    targets.forEach((l) => contractSyncAttempted.current.add(l.linkId));

    let falhas = 0;
    for (const l of targets) {
      const contract = l.contract!;
      const lastRead = l.quantidadeLidaEm ? Date.parse(l.quantidadeLidaEm) : NaN;
      const quantityStale = force || Number.isNaN(lastRead) || Date.now() - lastRead >= sixHours;
      let unitPrice = l.valorUnitarioContrato ?? (Number(item.valorUnitario) || undefined);
      let falhou = false;

      if (quantityStale) {
        try {
          const q = await syncContractQuantityMutation.mutateAsync({
            numeroAta: arp.numeroAtaRegistroPreco,
            uasg: arp.codigoUnidadeGerenciadora,
            numeroItem: item.numeroItem,
            contractKey: l.contractKey,
            contract
          });
          if (q.valorUnitario) unitPrice = q.valorUnitario;
        } catch (err) {
          falhou = true;
          console.warn('Quantidade contratada não sincronizada:', l.contractKey, err);
        }
      }
      try {
        await syncEmpenhosMutation.mutateAsync({
          numeroAta: arp.numeroAtaRegistroPreco,
          uasg: arp.codigoUnidadeGerenciadora,
          numeroItem: item.numeroItem,
          contract: {
            contractKey: l.contractKey,
            uasg: contract.uasg,
            numero: contract.numero,
            ano: contract.ano,
            contratoId: contract.contratoId
          },
          unitPrice
        });
      } catch (err) {
        falhou = true;
        console.warn('Empenhos do contrato não sincronizados:', l.contractKey, err);
      }
      if (falhou) falhas++;
    }
    return { total: targets.length, falhas };
  };

  useEffect(() => {
    if (!canEditData) return;
    void syncLinkedContracts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedOfficialLinks, canEditData, arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem]);

  const handleRefresh = async () => {
    refetchEmpenhos();
    refetchContracts();
    loadManualData();
    if (!canEditData || enrichedOfficialLinks.length === 0) return;
    setSyncingContracts(true);
    try {
      const { total, falhas } = await syncLinkedContracts(true);
      if (total === 0) return;
      if (falhas > 0) {
        toast.error(`${falhas} de ${total} ${total === 1 ? 'contrato não pôde ser atualizado' : 'contratos não puderam ser atualizados'} a partir da API. Tente novamente em instantes.`);
      } else {
        toast.success(total === 1 ? 'Contrato e empenhos atualizados.' : `${total} contratos e seus empenhos atualizados.`);
      }
    } finally {
      setSyncingContracts(false);
    }
  };

  // Sugestões de contrato (PNCP + catálogo), sem os já vinculados nem os descartados
  const { data: dismissedSuggestions = [] } = useDismissedContractSuggestions(canonicalItemKey);
  const dismissSuggestionMutation = useDismissContractSuggestion();
  const restoreSuggestionMutation = useRestoreContractSuggestion();
  const { suggestions: contractSuggestions, dismissed: dismissedContractSuggestions } = useMemo(
    () => buildItemContractSuggestions({
      pncpContracts: contracts,
      officialContracts: officialDashboardContracts,
      criteria: buildItemSuggestionCriteria(arp, item),
      linkedContractKeys: contractLinks.map((l) => l.contractKey),
      dismissedContractKeys: dismissedSuggestions.map((d) => d.contractKey)
    }),
    [contracts, officialDashboardContracts, arp, item, contractLinks, dismissedSuggestions]
  );

  const handleSuggestionMutationError = (action: string, err: any) => {
    if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
      toast.error('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
    } else {
      toast.error(`Erro ao ${action}: ${err?.message || 'Erro desconhecido'}`);
    }
  };

  const handleDismissSuggestion = async (s: ItemContractSuggestion) => {
    try {
      await dismissSuggestionMutation.mutateAsync({ itemKey: canonicalItemKey, contractKey: s.contractKey });
    } catch (err: any) {
      handleSuggestionMutationError('descartar sugestão', err);
    }
  };

  const handleRestoreSuggestion = async (s: ItemContractSuggestion) => {
    try {
      await restoreSuggestionMutation.mutateAsync({ itemKey: canonicalItemKey, contractKey: s.contractKey });
    } catch (err: any) {
      handleSuggestionMutationError('restaurar sugestão', err);
    }
  };

  const handleLinkSuggestion = (s: ItemContractSuggestion) => {
    setLinkingSuggestion(s);
    setIsLinkContractModalOpen(true);
  };

  const handleCloseLinkContractModal = () => {
    setIsLinkContractModalOpen(false);
    setLinkingSuggestion(null);
  };

  // Carrega empenhos em background para todos os contratos e enriquece com dados oficiais
  useEffect(() => {
    if (!contracts || contracts.length === 0) return;
    contracts.forEach(async (c) => {
      const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
      if (c.contratoId) {
        try {
          const rawGovEmps = await fetchContratosGovEmpenhos(c.contratoId);
          if (rawGovEmps && rawGovEmps.length > 0) {
            const govEmps = await enrichGovEmpenhosWithDetails(rawGovEmps, c.contratoId, c);
            setContractGovEmpenhos(prev => ({ 
              ...prev, 
              [c.numeroContrato]: govEmps,
              [canKey]: govEmps
            }));
          }
        } catch (e) {
          console.warn('Erro ao carregar empenhos do Contratos.gov.br:', e);
        }
      }
      if (c.cnpj && c.anoContrato && c.sequencialContrato) {
        try {
          const emps = await fetchPncpContractEmpenhos(c.cnpj, String(c.anoContrato), String(c.sequencialContrato));
          if (emps && emps.length > 0) {
            setContractEmpenhos(prev => ({
              ...prev,
              [c.numeroContrato]: emps,
              [canKey]: emps
            }));
          }
        } catch (e) {
          console.warn('Erro ao carregar empenhos do PNCP:', e);
        }
      }
    });
  }, [contracts, item]);

  const enrichGovEmpenhosWithDetails = async (
    govEmps: ContratosGovEmpenhoRecord[],
    _contratoId?: number,
    contratoObj?: PncpContract
  ): Promise<ContratosGovEmpenhoRecord[]> => {
    const targetItemNum = parseInt(item.numeroItem, 10);
    const unitPrice = contratoObj?.valorUnitarioItem ?? item.valorUnitario;

    const enriched = await Promise.all(
      govEmps.map(async (emp) => {
        if (!emp.id && !emp.numero) return emp;
        let quantidadeFisica: number | undefined = undefined;
        let itensMinuta: any[] | undefined = undefined;

        // Fonte Única Oficial Direta: Consulta a minuta individual do empenho (/consultar/{id})
        if (emp.id) {
          try {
            const detalhe = await fetchContratoEmpenhoDetalhe(emp.id);
            if (detalhe && detalhe.itens_minuta) {
              itensMinuta = detalhe.itens_minuta;
              const matchedMinuta = detalhe.itens_minuta.find((i: any) => parseInt(i.numero_item_compra || '0', 10) === targetItemNum);
              if (matchedMinuta && typeof matchedMinuta.quantidade === 'number') {
                quantidadeFisica = matchedMinuta.quantidade;
              }
            }
          } catch (e) {
            // Ignora exceções de acesso à minuta
          }
        }

        // Fonte Oficial Deduzida: Se a minuta não está disponível, calcula determinística e temporalmente
        let quantidadeDeduzida: number | undefined = undefined;
        let isDeduzido = false;
        let isReforco = false;

        const effectiveEmpValue = getEmpenhoEffectiveValue(emp.empenhado, emp.rpinscrito);
        if (quantidadeFisica === undefined && unitPrice && effectiveEmpValue > 0) {
          const deduction = deduceEmpenhoQuantity(
            effectiveEmpValue,
            unitPrice,
            emp.data_emissao,
            contratoObj?.historicoPrecos
          );
          if (deduction.quantidade > 0 || deduction.isReforco) {
            quantidadeDeduzida = deduction.quantidade;
            isDeduzido = true;
            isReforco = deduction.isReforco;
          }
        }

        return {
          ...emp,
          itens_minuta: itensMinuta,
          quantidadeFisicaOriginal: quantidadeFisica,
          quantidadeDeduzida,
          isDeduzido,
          isReforco
        };
      })
    );
    return enriched;
  };

  const getEmpenhoQuantityInfo = (
    empKey: string, 
    emp?: ContratosGovEmpenhoRecord,
    manualQtdsMap: Record<string, number> = empenhoManualQuantities,
    contratoObj?: PncpContract
  ): { qty: number; isManual: boolean; isOfficial: boolean; isDeduzido?: boolean; isReforco?: boolean } => {
    // Prioridade 1: Quantidade Oficial retornada pela API (itens_minuta)
    if (emp?.quantidadeFisicaOriginal !== undefined && emp.quantidadeFisicaOriginal !== null) {
      return { qty: emp.quantidadeFisicaOriginal, isManual: false, isOfficial: true, isDeduzido: false, isReforco: false };
    }
    if (emp?.itens_minuta && emp.itens_minuta.length > 0) {
      const targetItemNum = parseInt(item.numeroItem, 10);
      const match = emp.itens_minuta.find((i: any) => parseInt(i.numero_item_compra || '0', 10) === targetItemNum);
      if (match && typeof match.quantidade === 'number') {
        return { qty: match.quantidade, isManual: false, isOfficial: true, isDeduzido: false, isReforco: false };
      }
    }
    // Prioridade 2: Preenchimento manual pelo usuário se a API não retornou dados
    if (manualQtdsMap[empKey] !== undefined) {
      return { qty: manualQtdsMap[empKey], isManual: true, isOfficial: false, isDeduzido: false, isReforco: false };
    }
    // Prioridade 3: Dedução Temporal Oficial via Valor Unitário do Contrato
    if (emp?.quantidadeDeduzida !== undefined) {
      return { qty: emp.quantidadeDeduzida, isManual: false, isOfficial: true, isDeduzido: true, isReforco: !!emp.isReforco };
    }
    // Fallback on-the-fly se emp ainda não foi enriquecido mas temos valor unitário
    const unitPrice = contratoObj?.valorUnitarioItem ?? item.valorUnitario;
    const effectiveEmpValue = getEmpenhoEffectiveValue(emp?.empenhado, emp?.rpinscrito);
    if (effectiveEmpValue > 0 && unitPrice) {
      const deduction = deduceEmpenhoQuantity(effectiveEmpValue, unitPrice, emp?.data_emissao, contratoObj?.historicoPrecos);
      if (deduction.quantidade > 0 || deduction.isReforco) {
        return { qty: deduction.quantidade, isManual: false, isOfficial: true, isDeduzido: true, isReforco: deduction.isReforco };
      }
    }

    return { qty: 0, isManual: false, isOfficial: false, isDeduzido: false, isReforco: false };
  };

  const toggleContractExpansion = async (contrato: PncpContract) => {
    const key = contrato.numeroContrato;
    const canKey = getCanonicalContractKey(contrato.numeroContrato, contrato.anoContrato, contrato.numeroControlePncp);
    const isCurrentlyExpanded = !!expandedContracts[key] || !!expandedContracts[canKey];
    
    setExpandedContracts(prev => ({ 
      ...prev, 
      [key]: !isCurrentlyExpanded,
      [canKey]: !isCurrentlyExpanded 
    }));

    if (!isCurrentlyExpanded && !contractGovEmpenhos[key] && !contractGovEmpenhos[canKey] && !contractEmpenhos[key] && !contractEmpenhos[canKey]) {
      setEmpenhosLoadingMap(prev => ({ ...prev, [key]: true, [canKey]: true }));
      try {
        let govEmpsLoaded = false;
        if (contrato.contratoId) {
          const rawGovEmps = await fetchContratosGovEmpenhos(contrato.contratoId);
          if (rawGovEmps && rawGovEmps.length > 0) {
            const govEmps = await enrichGovEmpenhosWithDetails(rawGovEmps, contrato.contratoId, contrato);
            setContractGovEmpenhos(prev => ({ ...prev, [key]: govEmps, [canKey]: govEmps }));
            govEmpsLoaded = true;
          }
        }
        if (!govEmpsLoaded && contrato.uasg) {
          const govData = await fetchContratosGovData(contrato.uasg, contrato.numeroContrato, contrato.anoContrato);
          if (govData.contratoId) {
            contrato.contratoId = govData.contratoId;
            const rawGovEmps = await fetchContratosGovEmpenhos(govData.contratoId);
            if (rawGovEmps && rawGovEmps.length > 0) {
              const govEmps = await enrichGovEmpenhosWithDetails(rawGovEmps, govData.contratoId, contrato);
              setContractGovEmpenhos(prev => ({ ...prev, [key]: govEmps, [canKey]: govEmps }));
              govEmpsLoaded = true;
            }
          }
        }
        if (contrato.cnpj && contrato.anoContrato && contrato.sequencialContrato) {
          const emps = await fetchPncpContractEmpenhos(contrato.cnpj, String(contrato.anoContrato), String(contrato.sequencialContrato));
          if (emps && emps.length > 0) {
            setContractEmpenhos(prev => ({ ...prev, [key]: emps, [canKey]: emps }));
          }
        }
      } catch (err) {
        console.error('Error fetching contract empenhos:', err);
      } finally {
        setEmpenhosLoadingMap(prev => ({ ...prev, [key]: false, [canKey]: false }));
      }
    }
  };

  useEffect(() => {
    if (selectedEmpenhoDetail) {
      const filtered = getFilteredContractsForModal(selectedEmpenhoDetail);
      filtered.forEach(c => {
        const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
        if (!contractGovEmpenhos[c.numeroContrato] && !contractGovEmpenhos[canKey] && !contractEmpenhos[c.numeroContrato] && !contractEmpenhos[canKey] && !empenhosLoadingMap[c.numeroContrato] && !empenhosLoadingMap[canKey]) {
          fetchContractEmpenhosForModal(c);
        }
      });
    }
  }, [selectedEmpenhoDetail]);

  const fetchContractEmpenhosForModal = async (contrato: PncpContract) => {
    const key = contrato.numeroContrato;
    const canKey = getCanonicalContractKey(contrato.numeroContrato, contrato.anoContrato, contrato.numeroControlePncp);
    setEmpenhosLoadingMap(prev => ({ ...prev, [key]: true, [canKey]: true }));
    try {
      if (contrato.contratoId) {
        const rawGovEmps = await fetchContratosGovEmpenhos(contrato.contratoId);
        if (rawGovEmps && rawGovEmps.length > 0) {
          const govEmps = await enrichGovEmpenhosWithDetails(rawGovEmps, contrato.contratoId, contrato);
          setContractGovEmpenhos(prev => ({ ...prev, [key]: govEmps, [canKey]: govEmps }));
        }
      }
      if (contrato.cnpj && contrato.anoContrato && contrato.sequencialContrato) {
        const emps = await fetchPncpContractEmpenhos(contrato.cnpj, String(contrato.anoContrato), String(contrato.sequencialContrato));
        if (emps && emps.length > 0) {
          setContractEmpenhos(prev => ({ ...prev, [key]: emps, [canKey]: emps }));
        }
      }
    } catch (err) {
      console.error('Error fetching contract empenhos for modal:', err);
    } finally {
      setEmpenhosLoadingMap(prev => ({ ...prev, [key]: false, [canKey]: false }));
    }
  };

  const getFilteredContractsForModal = (emp: EmpenhoSaldoItemRecord) => {
    const match = emp.unidade.match(/^(\d+)/);
    const uasg = match ? match[1] : '';
    
    const targetCnpj = cnpjDaUasg(uasg);

    if (!targetCnpj) return contracts;

    return contracts.filter(c => {
      if (c.cnpj === targetCnpj) {
        return true;
      }
      if (c.cnpj && c.cnpj.includes(targetCnpj)) {
        return true;
      }
      return false;
    });
  };

  useEffect(() => {
    cacheArpsInDb([arp]);
    cacheArpItemsInDb(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, [item]);
    try {
      const meta = JSON.stringify({ valorUnitario: item.valorUnitario, descricaoItem: item.descricaoItem });
      localStorage.setItem(`saldoarp-item-meta-${arp.numeroAtaRegistroPreco}-${item.numeroItem}`, meta);
      localStorage.setItem(`saldoarp-item-meta-${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`, meta);
    } catch {}
  }, [item]);

  const saveAllocationsToStorage = async (newAllocations: InternalAllocation[]) => {
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    try {
      setAllocationError(null);
      await saveAllocationsMutation.mutateAsync({
        itemKey,
        allocations: newAllocations,
        expectedVersion: allocationVersion
      });
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        setAllocationError('Conflito de concorrência: as alocações foram modificadas por outro usuário. Recarregue a página antes de salvar novamente.');
      } else {
        setAllocationError(err?.message || 'Erro ao salvar alocações.');
      }
    }
  };

  const gerenciadoraUnits = unidades.filter(uni => uni.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(uni.codigoUnidade, arp.codigoUnidadeGerenciadora));
  const totalUGQty = gerenciadoraUnits.length > 0 
    ? gerenciadoraUnits.reduce((sum, u) => sum + (Number(u.quantidadeRegistrada) || 0), 0)
    : (Number(item.quantidadeHomologadaItem) || 0);

  const handleAddAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    setAllocationError(null);

    const fallbackUnit = getFirstAvailableUnitSigla(departments, allocations, editingId);
    const chosenUnit = (newUnitName || fallbackUnit).trim();

    if (!chosenUnit) {
      setAllocationError('Selecione uma unidade interna oficial.');
      return;
    }

    // Validação de duplicidade: não permitir alocar a mesma unidade mais de uma vez
    const isDuplicate = allocations.some(
      a => a.id !== editingId && a.unitName.trim().toLowerCase() === chosenUnit.toLowerCase()
    );

    if (isDuplicate) {
      setAllocationError(`A unidade "${chosenUnit}" já possui uma alocação cadastrada para este item. Edite a alocação existente na tabela abaixo ou selecione outra unidade.`);
      return;
    }

    const allocQty = Number(newAllocatedQty);

    if (isNaN(allocQty) || allocQty <= 0) {
      setAllocationError('A quantidade alocada deve ser um número maior que zero.');
      return;
    }

    const currentAllocatedSum = allocations
      .filter(a => a.id !== editingId)
      .reduce((sum, current) => sum + current.allocatedQty, 0);

    if (currentAllocatedSum + allocQty > totalUGQty) {
      const available = totalUGQty - currentAllocatedSum;
      setAllocationError(`Limite excedido! O quantitativo total da Unidade Gerenciadora para este item é de ${formatNumber(totalUGQty)} unidades. Você só pode alocar mais ${formatNumber(available)} unidades.`);
      return;
    }

    let updatedList: InternalAllocation[];
    if (editingId) {
      updatedList = allocations.map(a => 
        a.id === editingId 
          ? { ...a, unitName: chosenUnit, allocatedQty: allocQty }
          : a
      );
      setEditingId(null);
    } else {
      const newAlloc: InternalAllocation = {
        id: Date.now().toString(),
        unitName: chosenUnit,
        allocatedQty: allocQty,
        empenhadaQty: 0
      };
      updatedList = [...allocations, newAlloc];
    }

    saveAllocationsToStorage(updatedList);
    
    const nextAvailable = getFirstAvailableUnitSigla(departments, updatedList, null);
    setNewUnitName(nextAvailable);
    setNewAllocatedQty('');
  };

  const handleEditAllocation = (alloc: InternalAllocation) => {
    setEditingId(alloc.id);
    setNewUnitName(alloc.unitName);
    setNewAllocatedQty(alloc.allocatedQty);
    setAllocationError(null);
  };

  const handleDeleteAllocation = (id: string) => {
    const updated = allocations.filter(a => a.id !== id);
    saveAllocationsToStorage(updated);
    if (editingId === id) {
      setEditingId(null);
      const nextAvailable = getFirstAvailableUnitSigla(departments, updated, null);
      setNewUnitName(nextAvailable);
      setNewAllocatedQty('');
    } else {
      const nextAvailable = getFirstAvailableUnitSigla(departments, updated, editingId);
      setNewUnitName(nextAvailable);
    }

    // Clean up any empenho links referencing this deleted department
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    const cleanedLinks = { ...empenhoLinks };
    let hasChanges = false;
    for (const empenhoUnit in cleanedLinks) {
      if (cleanedLinks[empenhoUnit] === id) {
        delete cleanedLinks[empenhoUnit];
        hasChanges = true;
      }
    }
    if (hasChanges) {
      saveEmpenhoLinksMutation.mutateAsync({
        itemKey,
        links: cleanedLinks,
        expectedVersion: empenhoLinkVersion
      }).catch(err => {
        console.warn('Erro ao atualizar vínculos de empenhos após exclusão de alocação:', err);
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    const nextAvailable = getFirstAvailableUnitSigla(departments, allocations, null);
    setNewUnitName(nextAvailable);
    setNewAllocatedQty('');
    setAllocationError(null);
  };

  const handleConfirmEmpenhoQuantity = async (v: ItemEmpenhoVinculo, quantidade: number | null) => {
    try {
      await confirmQuantityMutation.mutateAsync({ itemKey: canonicalItemKey, empenhoId: v.empenhoId, quantidade });
    } catch (err: any) {
      if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        toast.error('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
      } else {
        toast.error(`Erro ao confirmar a quantidade do empenho ${v.empenho.numero}: ${err?.message || 'Erro desconhecido'}`);
      }
    }
  };

  const handleConfirmAllEmpenhoQuantities = async (vinculos: ItemEmpenhoVinculo[]) => {
    let falhas = 0;
    for (const v of vinculos) {
      if (v.quantidadeSugerida == null) continue;
      try {
        await confirmQuantityMutation.mutateAsync({ itemKey: canonicalItemKey, empenhoId: v.empenhoId, quantidade: v.quantidadeSugerida });
      } catch (err) {
        falhas++;
        console.warn('Quantidade do empenho não confirmada:', v.empenho.numero, err);
      }
    }
    if (falhas > 0) toast.error(`${falhas} ${falhas === 1 ? 'empenho não pôde' : 'empenhos não puderam'} ser confirmado${falhas === 1 ? '' : 's'}.`);
  };

  const handleLinkEmpenho = async (empenhoUnidade: string, departmentId: string) => {
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    const updatedLinks = {
      ...empenhoLinks,
      [empenhoUnidade]: departmentId
    };
    if (!departmentId) {
      delete updatedLinks[empenhoUnidade];
    }
    try {
      setAllocationError(null);
      await saveEmpenhoLinksMutation.mutateAsync({
        itemKey,
        links: updatedLinks,
        expectedVersion: empenhoLinkVersion
      });
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        setAllocationError('Conflito de concorrência: os vínculos de empenhos foram modificados por outro usuário. Recarregue a página antes de salvar novamente.');
      } else {
        setAllocationError(err?.message || 'Erro ao salvar vínculo de empenho.');
      }
    }
  };




  // Mapeia empenhos oficiais da API (SIASG e Contratos.gov/PNCP) para a entidade canônica Empenho
  // FILTRAGEM OBRIGATÓRIA: Apresentar apenas empenhos das UASGs 200331 e 200330
  const officialApiEmpenhos: Empenho[] = React.useMemo(() => {
    const list: Empenho[] = [];
    const seen = new Set<string>();

    empenhos.forEach((emp, idx) => {
      const num = emp.numeroEmpenho || `EMP-${idx + 1}`;
      const ano = parseInt(arp.anoCompra, 10) || new Date().getFullYear();
      const cleanUasg = (emp.unidade || arp.codigoUnidadeGerenciadora || '').replace(/\D/g, '');

      // Filtra estritamente apenas empenhos das UASGs 200331 e 200330
      if (!isAllowedEmpenhoUasg(cleanUasg)) return;

      const key = `${normalizeEmpenhoNumero(num)}-${ano}-${cleanUasg}-${item.numeroItem}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: `api-siasg-${key}`,
          numero: num,
          ano,
          arpId: item.numeroAtaRegistroPreco,
          itemId: item.numeroItem,
          uasg: cleanUasg,
          quantidade: Number(emp.quantidadeEmpenhada) || 0,
          valorUnitario: Number(item.valorUnitario) || undefined,
          valorTotal: Number(emp.valorEmpenhado) || (Number(emp.quantidadeEmpenhada) * Number(item.valorUnitario || 0)) || undefined,
          data: emp.dataEmpenho || emp.dataHoraInclusao?.split('T')[0],
          fornecedor: emp.fornecedorNome || item.nomeRazaoSocialFornecedor,
          unidadeInternaId: empenhoLinks[num],
          origem: 'API',
          status: 'CONFIRMADO',
          criadoEm: emp.dataHoraInclusao || new Date().toISOString(),
          atualizadoEm: emp.dataHoraAtualizacao || new Date().toISOString()
        });
      }
    });

    Object.entries(contractGovEmpenhos).forEach(([, emps]) => {
      emps.forEach(emp => {
        const num = emp.numero;
        if (!num) return;
        const ano = parseInt(arp.anoCompra, 10) || new Date().getFullYear();
        const cleanUasg = (emp.unidade_gestora || arp.codigoUnidadeGerenciadora || '').replace(/\D/g, '');

        // Filtra estritamente apenas empenhos das UASGs 200331 e 200330
        if (!isAllowedEmpenhoUasg(cleanUasg)) return;

        const key = `${normalizeEmpenhoNumero(num)}-${ano}-${cleanUasg}-${item.numeroItem}`;
        
        const empKey = emp.numero || String(emp.id);
        const qtdDetail = getEmpenhoQuantityInfo(empKey, emp, empenhoManualQuantities);
        const effectiveQty = qtdDetail.qty;

        if (!seen.has(key) && effectiveQty > 0) {
          seen.add(key);
          const rawVal = typeof emp.empenhado === 'number' ? emp.empenhado : parseFloat(String(emp.empenhado || '0').replace(/\./g, '').replace(',', '.'));
          list.push({
            id: `api-gov-${key}`,
            numero: num,
            ano,
            arpId: item.numeroAtaRegistroPreco,
            itemId: item.numeroItem,
            uasg: cleanUasg,
            quantidade: effectiveQty,
            valorUnitario: Number(item.valorUnitario) || undefined,
            valorTotal: !isNaN(rawVal) && rawVal > 0 ? rawVal : (effectiveQty * Number(item.valorUnitario || 0)),
            data: emp.data_emissao,
            fornecedor: emp.credor || item.nomeRazaoSocialFornecedor,
            unidadeInternaId: empenhoLinks[num],
            origem: 'API',
            status: 'CONFIRMADO',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
          });
        }
      });
    });

    return list;
  }, [empenhos, contractGovEmpenhos, empenhoLinks, item, arp, empenhoManualQuantities]);

  // Empenhos lidos das APIs oficiais (alimentam a Alocação interna); o empenho do item por contrato vem de arp_item_empenhos.
  const allEmpenhos: Empenho[] = officialApiEmpenhos;

  // Calculate totals
  const totalRegistrado = unidades.reduce((acc, curr) => acc + curr.quantidadeRegistrada, 0);
  const gerenciadoraUnit = unidades.find(u => u.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(u.codigoUnidade));

  const totalAdesaoRegistrada = adesoes.reduce((acc, a) => acc + (Number(a.quantidadeRegistrada) || 0), 0);
  const totalAdesaoEmpenhada = adesoes.reduce((acc, a) => acc + (Number(a.quantidadeEmpenhada) || 0), 0);
  const totalAdesaoSaldo = adesoes.reduce((acc, a) => acc + (Number(a.saldoEmpenho) || 0), 0);
  const adesaoConsumidaPercent = totalAdesaoRegistrada > 0 ? (totalAdesaoEmpenhada / totalAdesaoRegistrada) * 100 : 0;

  // Fórmula Oficial do Saldo: Saldo = QuantidadeRegistrada - ∑ Empenhos

  // Execução do item: o consumo da ata é o contratado (quantidade lida da API nos contratos vinculados);
  // o empenho é a execução desse contratado. O Compras.gov é só referência.
  const executionSummary = React.useMemo(
    () => summarizeItemExecution({
      homologado: Number(item.quantidadeHomologadaItem) || totalRegistrado,
      contratados: enrichedOfficialLinks.map((l) => l.quantidadeContratada ?? null),
      vinculos: empenhoVinculos
    }),
    [item.quantidadeHomologadaItem, totalRegistrado, enrichedOfficialLinks, empenhoVinculos]
  );
  // Empenhos pendentes que já têm quantidade sugerida: podem ser confirmados de uma vez, no item inteiro.
  const empenhosAceitaveis = React.useMemo(
    () => empenhoVinculos.filter((v) => v.quantidade == null && v.quantidadeSugerida != null && v.quantidadeSugerida > 0),
    [empenhoVinculos]
  );
  const comprasGovReferencia = React.useMemo(() => {
    const consumido = comprasGovConsumido(unidades);
    return { ...compareWithComprasGov(consumido, executionSummary.contratado), consumido };
  }, [unidades, executionSummary.contratado]);

  // Cálculo seguro e sem duplicidade das métricas dos cards de resumo
  const cardMetrics = calculateItemCardMetrics({
    quantidadeHomologada: item.quantidadeHomologadaItem || totalRegistrado,
    totalEmpenhado: executionSummary.contratado,
    maximoAdesaoItem: item.maximoAdesao,
    totalAdesaoConsumida: totalAdesaoEmpenhada || totalAdesaoRegistrada,
    valorUnitario: item.valorUnitario,
    gerenciadoraLimiteAdesao: gerenciadoraUnit?.qtdLimiteAdesao
  });

  const {
    officialSaldo: officialCalculatedSaldo,
    totalEmpenhado: totalConsumidoEmpenho,
    itemTotalQty,
    empenhoConsumidoPercent,
    rawEmpenhoPercentRestante,
    limiteAdesao: totalLimiteAdesao,
    saldoAdesoes: totalSaldoAdesoes,
    valorFinanceiroDisponivel,
    valorFinanceiroConsumido
  } = cardMetrics;

  // Alocação interna: o empenhado de cada unidade vem das quantidades confirmadas dos empenhos vinculados a ela.
  const allocationExecution = React.useMemo(
    () => summarizeAllocationExecution(allocations, empenhoVinculos, empenhoLinks),
    [allocations, empenhoVinculos, empenhoLinks]
  );
  const allocationRows: AllocationRow[] = React.useMemo(
    () => allocations.map((a) => {
      const exec = allocationExecution.porAlocacao.get(a.id);
      return {
        id: a.id,
        unitName: a.unitName,
        allocatedQty: a.allocatedQty,
        empenhado: exec?.empenhado ?? 0,
        pendentes: exec?.pendentes ?? 0,
        pendentesSugerido: exec?.pendentesSugerido ?? 0
      };
    }),
    [allocations, allocationExecution]
  );

  const totalAllocatedSum = allocations.reduce((acc, curr) => acc + curr.allocatedQty, 0);
  const remainingUGQty = totalUGQty - totalAllocatedSum;
  const percentAllocated = totalUGQty > 0 ? (totalAllocatedSum / totalUGQty) * 100 : 0;

  // Normaliza e ordena unidades considerando UASGs 200331 e 200330 como GERENCIADORA
  const sortedUnidades = [...unidades].map(uni => {
    const cleanUasg = String(uni.codigoUnidade || '').replace(/\D/g, '');
    const isUG = uni.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(cleanUasg);
    return {
      ...uni,
      tipoUnidade: (isUG ? 'GERENCIADORA' : (uni.tipoUnidade || 'PARTICIPANTE')) as 'GERENCIADORA' | 'PARTICIPANTE'
    };
  }).sort((a, b) => {
    if (a.tipoUnidade === 'GERENCIADORA' && b.tipoUnidade !== 'GERENCIADORA') return -1;
    if (a.tipoUnidade !== 'GERENCIADORA' && b.tipoUnidade === 'GERENCIADORA') return 1;
    return (a.codigoUnidade || '').localeCompare(b.codigoUnidade || '');
  });

  const linkedContractsCount = manualContratos.length + enrichedOfficialLinks.length;
  const contractsCount = linkedContractsCount;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      <ItemHero
        arp={arp}
        item={item}
        onBack={onBack}
        backLabel={role === 'gestor_saldos' ? 'Voltar para Alocações' : undefined}
        isRefreshing={loading || contractsLoading || syncingContracts}
        onRefresh={handleRefresh}
        metrics={{
          officialSaldo: officialCalculatedSaldo,
          itemTotalQty,
          totalEmpenhado: totalConsumidoEmpenho,
          empenhoConsumidoPercent,
          rawEmpenhoPercentRestante,
          saldoAdesoes: totalSaldoAdesoes,
          limiteAdesao: totalLimiteAdesao,
          valorFinanceiroDisponivel,
          valorFinanceiroConsumido
        }}
        referencia={comprasGovReferencia}
        onGoTo={setActiveTab}
      />

      <Instrument360Tabs
        ref={tabsRef}
        tabs={[
          { id: 'unidades', label: `Órgãos participantes (${sortedUnidades.length})` },
          { id: 'contratos', label: `Contratos e empenhos (${contractsCount})` },
          { id: 'alocacao', label: `Alocação interna (${allocations.length})` },
          { id: 'adesoes', label: `Adesões (${adesoes.length})` }
        ]}
        active={activeTab}
        onSelect={setActiveTab}
        idPrefix="item"
        ariaLabel="Seções do item"
      />

      <div role="tabpanel" id={`item-tabpanel-${activeTab}`} aria-labelledby={`item-tab-${activeTab}`}>
        {activeTab === 'unidades' ? (
          <UnidadesTab
            loading={loading}
            error={error}
            sortedUnidades={sortedUnidades}
            allEmpenhos={allEmpenhos}
          />
        ) : activeTab === 'contratos' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Contratos (PNCP, oficiais e manuais) */}
            <AppCard style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <ItemExecutionSummaryStrip
                  summary={executionSummary}
                  referencia={comprasGovReferencia}
                  loading={contractsLoading && enrichedOfficialLinks.length === 0}
                  canEdit={canEditData}
                  aceitaveis={empenhosAceitaveis.length}
                  onAcceptAll={() => handleConfirmAllEmpenhoQuantities(empenhosAceitaveis)}
                  busy={confirmQuantityMutation.isPending}
                />
              </div>

              <ContractSuggestionsPanel
                suggestions={contractSuggestions}
                dismissed={dismissedContractSuggestions}
                loading={contractsLoading}
                error={contractsError}
                canEdit={canEditData}
                busy={dismissSuggestionMutation.isPending || restoreSuggestionMutation.isPending}
                onLink={handleLinkSuggestion}
                onDismiss={handleDismissSuggestion}
                onRestore={handleRestoreSuggestion}
              />

              <SectionHeader
                title="Vinculados"
                icon={<Building2 size={16} />}
                countBadge={linkedContractsCount}
                actions={canEditData ? (
                  <AppButton
                    variant="primary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => { setLinkingSuggestion(null); setIsLinkContractModalOpen(true); }}
                    title="Vincular a este item um contrato oficial existente da UASG"
                  >
                    Vincular Contrato
                  </AppButton>
                ) : undefined}
              />

              {linkedContractsCount === 0 ? (
                <EmptyState
                  title="Nenhum contrato vinculado"
                  description="Vincule um contrato sugerido acima ou escolha um contrato oficial da UASG."
                  icon={<Building2 size={32} color="#94a3b8" />}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {(() => {
                    const isGerenciadora = (u: string) => isGerenciadoraUasg(u, arp.codigoUnidadeGerenciadora);

                    const officialContractsList = enrichedOfficialLinks.map(oc => {
                      const parts = oc.contractKey.split('-');
                      const ano = parts.length >= 3 ? Number(parts[2]) : undefined;
                      return {
                        numeroContrato: oc.numeroContratoFormatado,
                        anoContrato: ano,
                        uasg: oc.uasg,
                        orgaoNome: oc.orgaoNome,
                        nomeRazaoSocialFornecedor: oc.fornecedorNome,
                        niFornecedor: oc.fornecedorCnpj,
                        numeroControlePncp: undefined,
                        linkVisualizacao: oc.linkPncp,
                        tipoUnidade: isGerenciadora(oc.uasg) ? 'GERENCIADORA' : 'PARTICIPANTE',
                        quantidadeContratada: oc.quantidadeContratada,
                        dataVigenciaFim: oc.dataVigenciaFim,
                        statusVigencia: oc.statusVigencia,
                        _isManual: false,
                        _isOfficialLink: true,
                        _linkId: oc.linkId,
                        contractKey: oc.contractKey
                      };
                    });

                    const deduplicateContractsList = (list: any[]) => {
                      const map = new Map<string, any>();
                      list.forEach((c, idx) => {
                        const canKey = c.contractKey || getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp) || `contract-${idx}`;
                        if (!map.has(canKey)) {
                          map.set(canKey, c);
                        } else {
                          const existing = map.get(canKey)!;
                          map.set(canKey, {
                            ...existing,
                            ...c,
                            _isManual: existing._isManual || c._isManual,
                            _manualId: existing._manualId || c._manualId,
                            _isOfficialLink: existing._isOfficialLink || c._isOfficialLink,
                            _linkId: existing._linkId || c._linkId,
                            contractKey: existing.contractKey || c.contractKey,
                            quantidadeContratada: c.quantidadeContratada ?? existing.quantidadeContratada,
                            linkVisualizacao: existing.linkVisualizacao || c.linkVisualizacao
                          });
                        }
                      });
                      return Array.from(map.values());
                    };

                    return [
                      {
                        title: 'Contratos vinculados',
                        list: deduplicateContractsList([
                          ...officialContractsList,
                          ...manualContratos.map(mc => ({
                            numeroContrato: mc.numero,
                            anoContrato: mc.ano,
                            uasg: mc.uasg,
                            orgaoNome: isGerenciadora(mc.uasg) ? 'SENASP / MJSP' : `UASG ${mc.uasg}`,
                            nomeRazaoSocialFornecedor: mc.fornecedor || item.nomeRazaoSocialFornecedor,
                            niFornecedor: mc.cnpjFornecedor || item.niFornecedor,
                            numeroControlePncp: mc.numeroControlePncp,
                            linkVisualizacao: mc.linkPncp,
                            tipoUnidade: isGerenciadora(mc.uasg) ? 'GERENCIADORA' : 'PARTICIPANTE',
                            _isManual: true,
                            _manualId: mc.id
                          } as any))
                        ])
                      }
                    ];
                  })().map((section, sidx) => (
                    <div key={`contract-sec-${sidx}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {section.list.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                          Nenhum contrato localizado para este grupo.
                        </div>
                      ) : (
                        <div className="table-container" style={{ marginTop: 0, overflowX: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <table className="custom-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ width: '40px' }}></th>
                                <th>Número do contrato</th>
                                <th>Unidade</th>
                                <th>Fornecedor</th>
                                <th>Qtd. contratada</th>
                                <th>Empenhado</th>
                                <th>A empenhar</th>
                                <th>Vigência</th>
                                <th style={{ textAlign: 'center' }}>Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.list.map((c: any, idx) => {
                                const contractUrl = c.linkVisualizacao || getContractPncpUrl(c);
                                const canKey = c.contractKey || getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
                                const isExpanded = !!expandedContracts[c.numeroContrato] || !!expandedContracts[canKey];

                                const displayNumeroContrato = (() => {
                                  const num = c.numeroContrato;
                                  if (!num) return '-';
                                  if (num.includes('/')) return num;
                                  if (/^\d{4}NE/i.test(num)) return num;
                                  return c.anoContrato ? `${num}/${c.anoContrato}` : num;
                                })();

                                const isGer = isGerenciadoraUasg(c.uasg, arp.codigoUnidadeGerenciadora) || c.tipoUnidade === 'GERENCIADORA';
                                const contractUasg = c.uasg || (isGer ? (arp.codigoUnidadeGerenciadora || '200331') : '');
                                const matchedUnit = unidades.find(u => String(u.codigoUnidade).trim() === String(contractUasg).trim());
                                const resolvedOrgaoName = isGer
                                  ? (arp.nomeOrgao || arp.nomeUnidadeGerenciadora || c.orgaoNome)
                                  : (matchedUnit?.nomeUnidade || (c.orgaoNome && !c.orgaoNome.includes('SECRETARIA NACIONAL') ? c.orgaoNome : `Órgão Participante`));

                                return (
                                  <React.Fragment key={`${c.numeroContrato}-${idx}`}>
                                    <tr style={{ background: isExpanded ? '#f8fafc' : 'transparent' }}>
                                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                        <button
                                          onClick={() => toggleContractExpansion(c)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', padding: '6px' }}
                                          title={isExpanded ? "Recolher empenhos" : "Expandir empenhos"}
                                        >
                                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                      </td>
                                      <td style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', color: '#0c326f' }}>
                                        {displayNumeroContrato}
                                      </td>
                                      <td style={{ fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                          {resolvedOrgaoName}
                                          {contractUasg ? (
                                            <span style={{ marginLeft: '0.4rem', fontSize: '0.74rem', color: '#1d4ed8', fontWeight: 600, background: '#eff6ff', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                              UASG: {contractUasg}
                                            </span>
                                          ) : null}
                                        </div>
                                        {!isGer && (
                                          <div style={{ marginTop: '0.25rem' }}>
                                            <StatusBadge label="Participante" variant="neutral" size="sm" dot={false} />
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ fontSize: '0.82rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.nomeRazaoSocialFornecedor}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                          CNPJ: {c.niFornecedor?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || '-'}
                                        </div>
                                      </td>
                                      <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700, color: c.quantidadeContratada != null ? 'var(--success)' : 'var(--text-muted)' }}>
                                        {c.quantidadeContratada != null ? (
                                          <span>{formatNumber(c.quantidadeContratada)}</span>
                                        ) : (
                                          <span style={{ fontSize: '0.76rem', fontWeight: 500, color: 'var(--text-muted)' }} title="Aguardando sincronização de dados abertos">
                                            N/D (Aguardando sincronização)
                                          </span>
                                        )}
                                      </td>
                                      {(() => {
                                        const exec = summarizeContractExecution(c.contractKey || '', c.quantidadeContratada ?? null, empenhoVinculos);
                                        return (
                                          <>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700 }}>
                                              {formatNumber(exec.empenhado)}
                                              {exec.pendentes > 0 && (
                                                <div style={{ fontFamily: 'inherit', fontWeight: 500, fontSize: '0.7rem', color: 'var(--warning)' }}>
                                                  {exec.pendentes} {exec.pendentes === 1 ? 'pendente' : 'pendentes'}
                                                </div>
                                              )}
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700, color: exec.aEmpenhar != null && exec.aEmpenhar < 0 ? 'var(--danger)' : undefined }}>
                                              {exec.aEmpenhar != null ? formatNumber(exec.aEmpenhar) : <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>N/D</span>}
                                            </td>
                                          </>
                                        );
                                      })()}
                                      <td style={{ fontSize: '0.8rem' }}>
                                        {c._isManual && (
                                          <StatusBadge label="Manual" variant="warning" size="sm" dot={false} />
                                        )}
                                        {c.dataVigenciaFim ? (
                                          <>
                                            <div style={{ color: 'var(--text-secondary)' }}>até {formatDate(c.dataVigenciaFim)}</div>
                                            {c.statusVigencia && c.statusVigencia !== 'Não Informado' && (
                                              <StatusBadge
                                                label={c.statusVigencia}
                                                variant={c.statusVigencia === 'Vigente' ? 'success' : c.statusVigencia === 'Expirado' ? 'danger' : 'warning'}
                                                size="sm"
                                                dot={false}
                                              />
                                            )}
                                          </>
                                        ) : !c._isManual ? (
                                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        ) : null}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                          {c.contractKey && (
                                            <AppButton
                                              variant="outline"
                                              size="sm"
                                              iconOnly
                                              icon={<Eye size={15} />}
                                              onClick={() => navigate(`/contratos/${encodeURIComponent(c.contractKey)}`)}
                                              title="Ver detalhes do contrato"
                                            />
                                          )}
                                          {contractUrl ? (
                                            <AppButton
                                              variant="ghost"
                                              size="sm"
                                              iconOnly
                                              icon={<ExternalLink size={15} />}
                                              onClick={() => window.open(contractUrl, '_blank', 'noopener,noreferrer')}
                                              title="Abrir o contrato no portal oficial"
                                            />
                                          ) : null}
                                          {canEditData && c._isOfficialLink && c._linkId && (
                                            <AppButton
                                              variant="ghostDanger"
                                              size="sm"
                                              iconOnly
                                              icon={<Trash2 size={15} />}
                                              onClick={() => handleUnlinkOfficialContract(c._linkId, c.contractKey)}
                                              disabled={unlinkContractMutation.isPending}
                                              title="Desvincular contrato deste item"
                                            />
                                          )}
                                          {canEditData && c._isManual && c._manualId && (
                                            <AppButton
                                              variant="ghostDanger"
                                              size="sm"
                                              iconOnly
                                              icon={<Trash2 size={15} />}
                                              onClick={() => handleDeleteManualContrato(c._manualId)}
                                              disabled={deleteManualContractMutation.isPending}
                                              title="Excluir contrato manual"
                                            />
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={9} style={{ padding: '0 0 1rem 0', background: '#f8fafc' }}>
                                          <div style={{ padding: '1rem', marginLeft: '2.5rem', marginRight: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                            <ContractEmpenhosPanel
                                              contractKey={c.contractKey || ''}
                                              contratado={c.quantidadeContratada ?? null}
                                              vinculos={empenhoVinculos}
                                              loading={vinculosLoading}
                                              canEdit={canEditData}
                                              canManageAllocations={canManageAllocations}
                                              allocationOptions={allocationRows.map((a) => ({
                                                id: a.id,
                                                unitName: a.unitName,
                                                saldoQty: a.allocatedQty - a.empenhado
                                              }))}
                                              linkedAllocationId={(numero) => empenhoLinks[numero] || ''}
                                              onConfirm={handleConfirmEmpenhoQuantity}
                                              onConfirmAll={handleConfirmAllEmpenhoQuantities}
                                              onLinkAllocation={handleLinkEmpenho}
                                              busy={confirmQuantityMutation.isPending || saveEmpenhoLinksMutation.isPending}
                                            />
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: '#f8fafc', fontWeight: 700 }} data-testid="vinculados-total">
                                <td colSpan={4} style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total</td>
                                <td style={{ fontFamily: 'monospace' }}>{formatNumber(executionSummary.contratado)}</td>
                                <td style={{ fontFamily: 'monospace' }}>{formatNumber(executionSummary.empenhado)}</td>
                                <td style={{ fontFamily: 'monospace', color: executionSummary.aEmpenhar < 0 ? 'var(--danger)' : undefined }}>
                                  {formatNumber(executionSummary.aEmpenhar)}
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

          </div>
        ) : activeTab === 'alocacao' ? (
          <AllocationsTab
            ugUasg={arp.codigoUnidadeGerenciadora}
            totalUG={totalUGQty}
            totalAllocated={totalAllocatedSum}
            remaining={remainingUGQty}
            percentAllocated={percentAllocated}
            rows={allocationRows}
            semUnidade={allocationExecution.semUnidade}
            departments={departments}
            departmentsLoading={departmentsLoading}
            canManage={canManageAllocations}
            editingId={editingId}
            unitName={newUnitName || getFirstAvailableUnitSigla(departments, allocations, editingId)}
            onUnitChange={setNewUnitName}
            qty={newAllocatedQty}
            onQtyChange={setNewAllocatedQty}
            onSubmit={handleAddAllocation}
            onCancelEdit={handleCancelEdit}
            saving={saveAllocationsMutation.isPending || saveEmpenhoLinksMutation.isPending}
            error={allocationError}
            onEdit={(id) => {
              const alloc = allocations.find((a) => a.id === id);
              if (alloc) handleEditAllocation(alloc);
            }}
            onDelete={handleDeleteAllocation}
            onGoToContracts={() => setActiveTab('contratos')}
          />
        ) : (
          <AdesoesTab
            adesoesLoading={adesoesLoading}
            adesoesError={adesoesError}
            adesoes={adesoes}
            item={item}
            totalAdesaoRegistrada={totalAdesaoRegistrada}
            totalAdesaoEmpenhada={totalAdesaoEmpenhada}
            totalAdesaoSaldo={totalAdesaoSaldo}
            adesaoConsumidaPercent={adesaoConsumidaPercent}
          />
        )}
      </div>

      {/* Modal for detailing contract & empenhos */}
      <EmpenhoDetailModal
        selectedEmpenhoDetail={selectedEmpenhoDetail}
        onClose={() => setSelectedEmpenhoDetail(null)}
        arpNumeroAta={arp.numeroAtaRegistroPreco}
        itemNumeroItem={item.numeroItem}
        contractsLoading={contractsLoading}
        filteredContracts={selectedEmpenhoDetail ? getFilteredContractsForModal(selectedEmpenhoDetail) : []}
        contractEmpenhos={contractEmpenhos}
        empenhosLoadingMap={empenhosLoadingMap}
      />

      {/* Modal de Cadastro/Edição de Empenho Manual */}


      {/* Modal de Vínculo com Contrato Oficial da UASG (Fase 6.2) */}
      <LinkContractModal
        isOpen={isLinkContractModalOpen}
        onClose={handleCloseLinkContractModal}
        initialContract={linkingSuggestion ? suggestionToContractRecord(linkingSuggestion) : null}
        itemKey={canonicalItemKey}
        numeroAta={arp.numeroAtaRegistroPreco}
        numeroItem={item.numeroItem}
        uasg={arp.codigoUnidadeGerenciadora}
        itemUnitPrice={item.valorUnitario}
        existingLinkedContractKeys={enrichedOfficialLinks.map(l => l.contractKey)}
      />
    </div>
  );
};

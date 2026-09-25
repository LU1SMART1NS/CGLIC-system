import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, DollarSign, Plus, Edit2, Trash2, ExternalLink, ChevronRight, ChevronDown, Check, X, RotateCcw, Eye } from 'lucide-react';
import { fetchPncpContractEmpenhos, fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe, fetchContratosGovData, getCanonicalContractKey, parsePncpIdentifiers } from '../services/api';
import { calculateTotalEmpenhado, reconcileBalances, matchAndMergeEmpenhos, normalizeEmpenhoNumero, calculateAllocationsWithEmpenhos, calculateItemCardMetrics, deduceEmpenhoQuantity, getEmpenhoEffectiveValue } from '../services/balanceService';
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
import { useItemManualEmpenhos } from '../hooks/useItemManualEmpenhos';
import { useSaveManualEmpenhos } from '../hooks/useSaveManualEmpenhos';
import { useItemManualQuantities } from '../hooks/useItemManualQuantities';
import { useSaveManualQuantities } from '../hooks/useSaveManualQuantities';
import { useItemManualContracts } from '../hooks/useItemManualContracts';
import { useSaveManualContract } from '../hooks/useSaveManualContract';
import { useDeleteManualContract } from '../hooks/useDeleteManualContract';
import { useItemContractEmpenhoLinks } from '../hooks/useItemContractEmpenhoLinks';
import { useItemContractLinks } from '../hooks/useItemContractLinks';
import { useUnlinkContractFromItem } from '../hooks/useUnlinkContractFromItem';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { enrichContractLinks } from '../services/arpContractLinkService';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import { AppButton, AppCard, EmptyState } from '../design-system';

import { ManualEmpenhoModal } from './modals/ManualEmpenhoModal';
import { ManualContratoModal } from './modals/ManualContratoModal';
import { LinkContractModal } from './modals/LinkContractModal';
import { ItemReconciliationCard } from './ItemReconciliationCard';
import { ItemBalancesHeader } from './item-balances/ItemBalancesHeader';
import { ItemBalancesSummaryCards } from './item-balances/ItemBalancesSummaryCards';
import { UnidadesTab } from './item-balances/UnidadesTab';
import { AdesoesTab } from './item-balances/AdesoesTab';
import { EmpenhoDetailModal } from './item-balances/EmpenhoDetailModal';
import { formatNumber, formatDate, getProgressColorClass, isGerenciadoraUasg, isAllowedEmpenhoUasg, getContractPncpUrl } from './item-balances/itemBalanceUtils';
import type { ArpRecord, ArpItemRecord, EmpenhoSaldoItemRecord, InternalAllocation, PncpContract, PncpContractEmpenho, ContratosGovEmpenhoRecord, Empenho, Contrato, ReconciliationReport } from '../types';

interface ItemBalancesProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
}

const EMPTY_ALLOCATIONS: InternalAllocation[] = [];
const EMPTY_RECORD: Record<string, string> = {};
const EMPTY_RECORD_NUM: Record<string, number> = {};
const EMPTY_MANUAL_EMPENHOS: Empenho[] = [];

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
  const [activeTab, setActiveTab] = useState<'unidades' | 'empenhos' | 'alocacao' | 'adesoes'>('unidades');

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
  const { data: manualEmpenhosState, refetch: refetchManualEmpenhos } = useItemManualEmpenhos(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const manualEmpenhos = manualEmpenhosState?.empenhos ?? EMPTY_MANUAL_EMPENHOS;
  const manualEmpenhosVersion = manualEmpenhosState?.version ?? 1;

  const saveManualEmpenhosMutation = useSaveManualEmpenhos();

  const { data: manualQuantitiesState, refetch: refetchManualQuantities } = useItemManualQuantities(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );
  const empenhoManualQuantities = manualQuantitiesState?.quantities ?? EMPTY_RECORD_NUM;
  const manualQuantitiesVersion = manualQuantitiesState?.version ?? 1;

  const saveManualQuantitiesMutation = useSaveManualQuantities();
  const saveManualContractMutation = useSaveManualContract();
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

  // Vínculos Oficiais com Contratos do SaldoARP (Fase 6.2)
  const { data: contractLinks = [] } = useItemContractLinks(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem,
    canonicalItemKey
  );
  const { data: officialDashboardContracts = [] } = useContractsDashboard(arp.codigoUnidadeGerenciadora);
  const unlinkContractMutation = useUnlinkContractFromItem();
  const [isLinkContractModalOpen, setIsLinkContractModalOpen] = useState<boolean>(false);

  const enrichedOfficialLinks = useMemo(() => {
    return enrichContractLinks(contractLinks, officialDashboardContracts);
  }, [contractLinks, officialDashboardContracts]);

  const [editingEmpenhoKey, setEditingEmpenhoKey] = useState<string | null>(null);
  const [editingEmpenhoQty, setEditingEmpenhoQty] = useState<string>('');
  const [isManualEmpenhoModalOpen, setIsManualEmpenhoModalOpen] = useState<boolean>(false);
  const [isManualContratoModalOpen, setIsManualContratoModalOpen] = useState<boolean>(false);
  const [editingManualEmpenho, setEditingManualEmpenho] = useState<Empenho | null>(null);

  const loadManualData = async () => {
    try {
      await Promise.all([
        refetchManualEmpenhos(),
        refetchManualQuantities(),
        refetchManualContracts(),
        refetchContractEmpenhoLinks()
      ]);
    } catch (e) {
      console.warn('Erro ao recarregar dados manuais:', e);
    }
  };

  const handleStartEditEmpenhoQty = (empKey: string, currentQty: number) => {
    setEditingEmpenhoKey(empKey);
    setEditingEmpenhoQty(String(currentQty ?? 0));
  };

  const handleSaveEmpenhoQty = async (empKey: string) => {
    const parsed = parseFloat(editingEmpenhoQty);
    if (isNaN(parsed) || parsed < 0) {
      alert('Por favor, informe uma quantidade válida maior ou igual a 0.');
      return;
    }
    const updated = { ...empenhoManualQuantities, [empKey]: parsed };
    try {
      await saveManualQuantitiesMutation.mutateAsync({
        itemKey,
        quantities: updated,
        expectedVersion: manualQuantitiesVersion
      });
      setEditingEmpenhoKey(null);
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        alert('Conflito de concorrência: as quantidades manuais foram modificadas por outro usuário. Os dados serão recarregados.');
      } else {
        alert(`Erro ao salvar quantidade manual: ${err?.message || 'Erro desconhecido'}`);
      }
    }
  };

  const handleRestoreEmpenhoQty = async (empKey: string) => {
    const updated = { ...empenhoManualQuantities };
    delete updated[empKey];
    try {
      await saveManualQuantitiesMutation.mutateAsync({
        itemKey,
        quantities: updated,
        expectedVersion: manualQuantitiesVersion
      });
      if (editingEmpenhoKey === empKey) {
        setEditingEmpenhoKey(null);
      }
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        alert('Conflito de concorrência: as quantidades manuais foram modificadas por outro usuário. Os dados serão recarregados.');
      } else {
        alert(`Erro ao restaurar quantidade manual: ${err?.message || 'Erro desconhecido'}`);
      }
    }
  };

  // Handlers para Empenhos Manuais (Migrado para React Query na Fase 4.3D.2B)
  const handleSaveManualEmpenho = async (empenhoData: Partial<Empenho>) => {
    let updatedList: Empenho[];
    if (editingManualEmpenho) {
      updatedList = manualEmpenhos.map(e =>
        e.id === editingManualEmpenho.id
          ? ({ ...e, ...empenhoData, atualizadoEm: new Date().toISOString() } as Empenho)
          : e
      );
    } else {
      const newEmp: Empenho = {
        id: `manual-emp-${Date.now()}`,
        numero: empenhoData.numero || '',
        ano: empenhoData.ano || new Date().getFullYear(),
        arpId: arp.numeroAtaRegistroPreco,
        itemId: item.numeroItem,
        uasg: empenhoData.uasg || arp.codigoUnidadeGerenciadora || '200331',
        quantidade: empenhoData.quantidade || 0,
        valorUnitario: empenhoData.valorUnitario || Number(item.valorUnitario) || undefined,
        valorTotal: empenhoData.valorTotal || (Number(empenhoData.quantidade || 0) * Number(item.valorUnitario || 0)),
        data: empenhoData.data || new Date().toISOString().split('T')[0],
        fornecedor: empenhoData.fornecedor || item.nomeRazaoSocialFornecedor,
        cnpjFornecedor: empenhoData.cnpjFornecedor || item.niFornecedor,
        unidadeInternaId: empenhoData.unidadeInternaId,
        observacao: empenhoData.observacao,
        origem: 'MANUAL',
        status: empenhoData.status || 'CONFIRMADO',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };
      updatedList = [...manualEmpenhos, newEmp];
    }

    try {
      await saveManualEmpenhosMutation.mutateAsync({
        itemKey,
        empenhos: updatedList,
        expectedVersion: manualEmpenhosVersion
      });
      setEditingManualEmpenho(null);
    } catch (err: any) {
      console.error('Erro ao persistir empenhos manuais:', err);
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        alert('Atenção: Os empenhos manuais deste item foram modificados por outro usuário. Por favor, recarregue e tente novamente.');
      } else if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        alert('Acesso negado: operação restrita a gestores e administradores do SaldoARP.');
      } else {
        alert(`Erro ao salvar empenho manual: ${err?.message || 'Erro desconhecido'}`);
      }
      throw err;
    }
  };

  const handleDeleteManualEmpenho = async (empenhoId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este empenho manual?')) {
      const updated = manualEmpenhos.filter(e => e.id !== empenhoId);
      try {
        await saveManualEmpenhosMutation.mutateAsync({
          itemKey,
          empenhos: updated,
          expectedVersion: manualEmpenhosVersion
        });
      } catch (err: any) {
        console.error('Erro ao excluir empenho manual:', err);
        if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
          alert('Atenção: Os empenhos manuais deste item foram modificados por outro usuário. Por favor, recarregue e tente novamente.');
        } else if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
          alert('Acesso negado: operação restrita a gestores e administradores do SaldoARP.');
        } else {
          alert(`Erro ao excluir empenho manual: ${err?.message || 'Erro desconhecido'}`);
        }
      }
    }
  };

  const handleSaveManualContrato = async (
    contratoData: Omit<Contrato, 'id' | 'criadoEm' | 'atualizadoEm'>,
    selectedEmpenhoIds: string[]
  ) => {
    const newContratoId = `manual-contrato-${Date.now()}`;
    const newContrato: Contrato = {
      ...contratoData,
      id: newContratoId,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };

    try {
      await saveManualContractMutation.mutateAsync({
        contrato: newContrato,
        empenhoIds: selectedEmpenhoIds
      });
    } catch (err: any) {
      console.error('Erro ao salvar contrato manual:', err);
      if (err?.code === 'INVALID_CONTRACT_LINK' || err?.sqlState === '23514') {
        alert('Regra RN-07: Todo contrato exige vinculação a pelo menos um empenho como lastro orçamentário.');
      } else if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        alert('Acesso negado: operação restrita a gestores e administradores do SaldoARP.');
      } else {
        alert(`Erro ao salvar contrato manual: ${err?.message || 'Erro desconhecido'}`);
      }
      throw err;
    }
  };

  const handleDeleteManualContrato = async (contratoId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este contrato manual?')) {
      try {
        await deleteManualContractMutation.mutateAsync({
          id: contratoId,
          itemKey
        });
      } catch (err: any) {
        console.error('Erro ao excluir contrato manual:', err);
        if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
          alert('Acesso negado: operação restrita a gestores e administradores do SaldoARP.');
        } else if (err?.code === 'CONTRACT_NOT_FOUND' || err?.sqlState === 'P0002') {
          alert('Contrato manual não encontrado ou já excluído.');
        } else {
          alert(`Erro ao excluir contrato manual: ${err?.message || 'Erro desconhecido'}`);
        }
      }
    }
  };

  const handleUnlinkOfficialContract = async (linkId: string) => {
    if (window.confirm('Tem certeza que deseja desvincular este contrato oficial deste item da ata?')) {
      try {
        await unlinkContractMutation.mutateAsync({
          linkId,
          itemKey: canonicalItemKey
        });
      } catch (err: any) {
        console.error('Erro ao desvincular contrato oficial:', err);
        if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
          alert('Acesso negado: operação restrita a gestores e administradores do SaldoARP.');
        } else {
          alert(`Erro ao desvincular contrato oficial: ${err?.message || 'Erro desconhecido'}`);
        }
      }
    }
  };

  // Cadastro de Unidades Oficiais
  const {
    data: departments = []
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
      const isSenasp = arp.codigoUnidadeGerenciadora === '200331';
      return {
        cnpj: isSenasp ? '00394494000136' : '',
        ano: ataMatch[1] || arp.anoCompra || '2026',
        sequencial: arp.numeroCompra || '1',
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
    
    const uasgToCnpj: Record<string, string> = {
      '200331': '00394494000136', // SENASP
      '154080': '34792077000163', // UFSC
    };

    const targetCnpj = uasgToCnpj[uasg];

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
      const ano = parseInt(arp.anoCompra || '2026', 10);
      const rawUasg = emp.unidade || arp.codigoUnidadeGerenciadora || '200331';
      const cleanUasg = rawUasg.replace(/\D/g, '') || '200331';

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
        const ano = parseInt(arp.anoCompra || '2026', 10);
        const rawUasg = emp.unidade_gestora || arp.codigoUnidadeGerenciadora || '200331';
        const cleanUasg = rawUasg.replace(/\D/g, '') || '200331';

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

  const filteredManualEmpenhos = React.useMemo(() => {
    return manualEmpenhos.filter(me => {
      const u = (me.uasg || '200331').replace(/\D/g, '');
      return isAllowedEmpenhoUasg(u);
    });
  }, [manualEmpenhos]);

  // Lista Unificada de Empenhos com Matching e Promoção Inteligente (exclusiva das UASGs 200331 e 200330)
  const allEmpenhos: Empenho[] = React.useMemo(() => {
    return matchAndMergeEmpenhos(officialApiEmpenhos, filteredManualEmpenhos);
  }, [officialApiEmpenhos, filteredManualEmpenhos]);

  // Calculate totals
  const totalRegistrado = unidades.reduce((acc, curr) => acc + curr.quantidadeRegistrada, 0);
  const totalSaldoRemanejamento = unidades.reduce((acc, curr) => acc + curr.saldoRemanejamentoEmpenho, 0);
  const gerenciadoraUnit = unidades.find(u => u.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(u.codigoUnidade));

  const totalAdesaoRegistrada = adesoes.reduce((acc, a) => acc + (Number(a.quantidadeRegistrada) || 0), 0);
  const totalAdesaoEmpenhada = adesoes.reduce((acc, a) => acc + (Number(a.quantidadeEmpenhada) || 0), 0);
  const totalAdesaoSaldo = adesoes.reduce((acc, a) => acc + (Number(a.saldoEmpenho) || 0), 0);
  const adesaoConsumidaPercent = totalAdesaoRegistrada > 0 ? (totalAdesaoEmpenhada / totalAdesaoRegistrada) * 100 : 0;

  // Relatório de Reconciliação Contábil Oficial do Item
  const reconciliationReport: ReconciliationReport = React.useMemo(() => {
    return reconcileBalances(
      item.quantidadeHomologadaItem,
      allEmpenhos,
      totalSaldoRemanejamento > 0 ? totalSaldoRemanejamento : null
    );
  }, [item.quantidadeHomologadaItem, allEmpenhos, totalSaldoRemanejamento]);

  // Fórmula Oficial do Saldo: Saldo = QuantidadeRegistrada - ∑ Empenhos
  const totalCalculatedEmpenhado = calculateTotalEmpenhado(allEmpenhos);

  // Cálculo seguro e sem duplicidade das métricas dos cards de resumo
  const cardMetrics = calculateItemCardMetrics({
    quantidadeHomologada: item.quantidadeHomologadaItem || totalRegistrado,
    totalEmpenhado: totalCalculatedEmpenhado,
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
    empenhoPercentClamped,
    limiteAdesao: totalLimiteAdesao,
    totalConsumidoAdesao,
    saldoAdesoes: totalSaldoAdesoes,
    adsPercVal,
    adsConsPercVal,
    adsPercValClamped,
    valorFinanceiroDisponivel,
    valorFinanceiroConsumido
  } = cardMetrics;

  // Dynamic Internal UG allocation calculations
  // Cálculo seguro e sem duplicidade de consumo por Alocação Interna a partir da lista canônica unificada de empenhos
  const allocationsWithEmpenho = React.useMemo(() => {
    return calculateAllocationsWithEmpenhos(allocations, allEmpenhos, empenhoLinks);
  }, [allocations, allEmpenhos, empenhoLinks]);

  const totalAllocatedSum = allocationsWithEmpenho.reduce((acc, curr) => acc + curr.allocatedQty, 0);
  const totalEmpenhadaSum = allocationsWithEmpenho.reduce((acc, curr) => acc + curr.empenhadaQty, 0);
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

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Navigation Breadcrumb & Item Info Overview */}
      <ItemBalancesHeader arp={arp} item={item} onBack={onBack} />

      {/* Executive Item Reconciliation Audit Card */}
      {!loading && (
        <ItemReconciliationCard
          report={reconciliationReport}
          onRefresh={() => {
            refetchEmpenhos();
            refetchContracts();
            loadManualData();
          }}
          isLoading={loading || contractsLoading}
        />
      )}

      {/* Global item balance metrics */}
      {!loading && !error && (
        <ItemBalancesSummaryCards
          officialCalculatedSaldo={officialCalculatedSaldo}
          itemTotalQty={itemTotalQty}
          quantidadeEstimadaEdital={item.quantidadeEstimadaEdital}
          empenhoPercentClamped={empenhoPercentClamped}
          totalConsumidoEmpenho={totalConsumidoEmpenho}
          empenhoConsumidoPercent={empenhoConsumidoPercent}
          rawEmpenhoPercentRestante={rawEmpenhoPercentRestante}
          totalSaldoAdesoes={totalSaldoAdesoes}
          totalLimiteAdesao={totalLimiteAdesao}
          adsPercValClamped={adsPercValClamped}
          totalConsumidoAdesao={totalConsumidoAdesao}
          adsConsPercVal={adsConsPercVal}
          adsPercVal={adsPercVal}
          valorFinanceiroDisponivel={valorFinanceiroDisponivel}
          valorFinanceiroConsumido={valorFinanceiroConsumido}
          onAdesoesClick={() => setActiveTab('adesoes')}
        />
      )}

      {/* Granular unit breakdown */}
      <AppCard style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', margin: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Building2 size={18} color="#0c326f" /> Detalhamento de Saldos e Empenhos por Órgão
        </h3>

        {/* Tab navigation (Gov.br segmented / pill style) */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('unidades')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'unidades' ? 700 : 500,
              background: activeTab === 'unidades' ? '#0c326f' : '#f1f5f9',
              color: activeTab === 'unidades' ? '#ffffff' : '#475569',
              border: activeTab === 'unidades' ? '1px solid #0c326f' : '1px solid #e2e8f0',
              transition: 'all 0.15s ease'
            }}
          >
            Saldos dos Órgãos
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('alocacao')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'alocacao' ? 700 : 500,
              background: activeTab === 'alocacao' ? '#0c326f' : '#f1f5f9',
              color: activeTab === 'alocacao' ? '#ffffff' : '#475569',
              border: activeTab === 'alocacao' ? '1px solid #0c326f' : '1px solid #e2e8f0',
              transition: 'all 0.15s ease'
            }}
          >
            Alocação Interna
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('empenhos')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'empenhos' ? 700 : 500,
              background: activeTab === 'empenhos' ? '#0c326f' : '#f1f5f9',
              color: activeTab === 'empenhos' ? '#ffffff' : '#475569',
              border: activeTab === 'empenhos' ? '1px solid #0c326f' : '1px solid #e2e8f0',
              transition: 'all 0.15s ease'
            }}
          >
            Contratos e Empenhos
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('adesoes')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'adesoes' ? 700 : 500,
              background: activeTab === 'adesoes' ? '#0c326f' : '#f1f5f9',
              color: activeTab === 'adesoes' ? '#ffffff' : '#475569',
              border: activeTab === 'adesoes' ? '1px solid #0c326f' : '1px solid #e2e8f0',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            Adesões e Caronas
            {adesoes.length > 0 && (
              <span style={{
                background: activeTab === 'adesoes' ? 'rgba(255,255,255,0.25)' : '#0c326f',
                color: '#fff',
                fontSize: '0.7rem',
                padding: '0.1rem 0.45rem',
                borderRadius: '10px',
                fontWeight: 800
              }}>
                {adesoes.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'unidades' ? (
          <UnidadesTab
            loading={loading}
            error={error}
            sortedUnidades={sortedUnidades}
            allEmpenhos={allEmpenhos}
          />
        ) : activeTab === 'empenhos' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Section 1: Contratos (PNCP, Oficiais e Manuais) */}
            <AppCard style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0c326f', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <Building2 size={16} color="#0c326f" /> Contratos Celebrados
                  </h4>
                  <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {contracts.length + manualContratos.length + enrichedOfficialLinks.length}{' '}
                    {contracts.length + manualContratos.length + enrichedOfficialLinks.length === 1 ? 'contrato' : 'contratos'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <AppButton
                    variant="primary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => setIsLinkContractModalOpen(true)}
                    title="Vincular contrato oficial existente da UASG a este item da ata"
                  >
                    Vincular Contrato Oficial
                  </AppButton>
                  <AppButton
                    variant="outline"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => setIsManualContratoModalOpen(true)}
                    title="Cadastrar contrato manual (legado)"
                  >
                    Adicionar Manual
                  </AppButton>
                </div>
              </div>

              {contractsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Buscando contratos no PNCP...</span>
                </div>
              ) : contractsError ? (
                <div style={{ padding: '1rem', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>
                  ⚠️ {contractsError}
                </div>
              ) : (contracts.length === 0 && manualContratos.length === 0 && enrichedOfficialLinks.length === 0) ? (
                <EmptyState
                  title="Nenhum contrato localizado"
                  description="Nenhum contrato localizado no PNCP, vinculado oficialmente ou adicionado manualmente para esta Ata."
                  icon={<Building2 size={32} color="#94a3b8" />}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {(() => {
                    const isGerenciadora = (u: string) => {
                      const trimmed = String(u || '').trim();
                      return trimmed === '200331' || trimmed === '200330' || (arp.codigoUnidadeGerenciadora && trimmed === String(arp.codigoUnidadeGerenciadora).trim());
                    };

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
                        title: 'Unidade Gestora (Gerenciadora)',
                        icon: <Building2 size={16} color="var(--primary)" />,
                        list: deduplicateContractsList([
                          ...contracts.filter(c => {
                            const u = String(c.uasg || '').trim();
                            if (isGerenciadora(u)) return true;
                            if (c.tipoUnidade === 'GERENCIADORA') return true;
                            return false;
                          }),
                          ...officialContractsList.filter(oc => isGerenciadora(oc.uasg)),
                          ...manualContratos
                            .filter(mc => isGerenciadora(mc.uasg))
                            .map(mc => ({
                              numeroContrato: mc.numero,
                              anoContrato: mc.ano,
                              uasg: mc.uasg,
                              orgaoNome: 'SENASP / MJSP',
                              nomeRazaoSocialFornecedor: mc.fornecedor || item.nomeRazaoSocialFornecedor,
                              niFornecedor: mc.cnpjFornecedor || item.niFornecedor,
                              numeroControlePncp: mc.numeroControlePncp,
                              linkVisualizacao: mc.linkPncp,
                              tipoUnidade: 'GERENCIADORA',
                              _isManual: true,
                              _manualId: mc.id
                            } as any))
                        ]),
                        badgeClass: 'badge-info',
                        badgeLabel: 'Órgão Gerenciador'
                      },
                      {
                        title: 'Participantes',
                        icon: <Users size={16} color="#0f766e" />,
                        list: deduplicateContractsList([
                          ...contracts.filter(c => {
                            const u = String(c.uasg || '').trim();
                            if (isGerenciadora(u)) return false;
                            if (c.tipoUnidade === 'GERENCIADORA') return false;
                            return true;
                          }),
                          ...officialContractsList.filter(oc => !isGerenciadora(oc.uasg)),
                          ...manualContratos
                            .filter(mc => !isGerenciadora(mc.uasg))
                            .map(mc => ({
                              numeroContrato: mc.numero,
                              anoContrato: mc.ano,
                              uasg: mc.uasg,
                              orgaoNome: `UASG ${mc.uasg}`,
                              nomeRazaoSocialFornecedor: mc.fornecedor || item.nomeRazaoSocialFornecedor,
                              niFornecedor: mc.cnpjFornecedor || item.niFornecedor,
                              numeroControlePncp: mc.numeroControlePncp,
                              linkVisualizacao: mc.linkPncp,
                              tipoUnidade: 'PARTICIPANTE',
                              _isManual: true,
                              _manualId: mc.id
                            } as any))
                        ]),
                        badgeClass: 'badge-success',
                        badgeLabel: 'Órgãos Participantes'
                      }
                    ];
                  })().map((section, sidx) => (
                    <div key={`contract-sec-${sidx}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {section.icon} {section.title}
                        </div>
                        <span className={`badge ${section.badgeClass}`} style={{ fontSize: '0.72rem' }}>
                          {section.list.length} {section.list.length === 1 ? 'contrato' : 'contratos'}
                        </span>
                      </div>

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
                                <th>Órgão / UASG</th>
                                <th>Fornecedor</th>
                                <th>Quantidade contratada</th>
                                <th>Origem</th>
                                <th style={{ textAlign: 'center' }}>Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.list.map((c: any, idx) => {
                                const contractUrl = c.linkVisualizacao || getContractPncpUrl(c);
                                const canKey = c.contractKey || getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
                                const isExpanded = !!expandedContracts[c.numeroContrato] || !!expandedContracts[canKey];
                                const govEmps = contractGovEmpenhos[c.numeroContrato] || contractGovEmpenhos[canKey];
                                const pncpEmps = contractEmpenhos[c.numeroContrato] || contractEmpenhos[canKey];

                                const displayNumeroContrato = (() => {
                                  const num = c.numeroContrato;
                                  if (!num) return '-';
                                  if (num.includes('/')) return num;
                                  if (/^\d{4}NE/i.test(num)) return num;
                                  return c.anoContrato ? `${num}/${c.anoContrato}` : num;
                                })();

                                const isGer = section.title.includes('Gerenciadora');
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
                                      <td>
                                        {c._isOfficialLink ? (
                                          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }} title="Contrato Oficial vinculado do SaldoARP">
                                            🟢 Oficial
                                          </span>
                                        ) : c._isManual ? (
                                          <span style={{ background: '#fefce8', color: '#a16207', border: '1px solid #fde047', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                            🟡 Manual
                                          </span>
                                        ) : (
                                          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                            🟢 Oficial
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                          {c.contractKey && (
                                            <Link
                                              to={`/contratos/${encodeURIComponent(c.contractKey)}`}
                                              className="btn btn-secondary"
                                              style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', height: 'auto', border: '1px solid #93c5fd', color: '#1d4ed8', background: '#eff6ff', textDecoration: 'none', fontWeight: 600 }}
                                              title="Abrir Contrato 360°"
                                            >
                                              <Eye size={13} /> Visão 360°
                                            </Link>
                                          )}
                                          {contractUrl ? (
                                            <a 
                                              href={contractUrl} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              className="btn btn-secondary"
                                              style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', height: 'auto', border: '1px solid var(--border-color)', color: 'var(--primary)' }}
                                              title="Visualizar contrato no portal oficial"
                                            >
                                              <ExternalLink size={14} /> Visualizar
                                            </a>
                                          ) : null}
                                          {c._isOfficialLink && c._linkId && (
                                            <button
                                              onClick={() => handleUnlinkOfficialContract(c._linkId)}
                                              disabled={unlinkContractMutation.isPending}
                                              className="btn btn-secondary"
                                              style={{ padding: '0.3rem 0.5rem', color: '#b91c1c', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '4px' }}
                                              title="Desvincular contrato oficial deste item"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          )}
                                          {c._isManual && c._manualId && (
                                            <button
                                              onClick={() => handleDeleteManualContrato(c._manualId)}
                                              disabled={deleteManualContractMutation.isPending}
                                              className="btn btn-secondary"
                                              style={{ padding: '0.3rem 0.5rem', color: '#b91c1c', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '4px' }}
                                              title="Excluir contrato manual"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    
                                    {/* Nested Expandable Commitments (Empenhos) Row */}
                                    {isExpanded && (
                                      <tr>
                                        <td colSpan={7} style={{ padding: '0 0 1rem 0', background: '#f8fafc' }}>
                                          <div style={{ padding: '1rem', marginLeft: '2.5rem', marginRight: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                                            {(() => {
                                              const totalEmpenhadoContrato = (govEmps || []).reduce((sum, emp) => {
                                                const k = emp.numero || String(emp.id);
                                                const info = getEmpenhoQuantityInfo(k, emp, empenhoManualQuantities, c);
                                                return sum + (info.qty || 0);
                                              }, 0);
                                              const qtdContratada = c.quantidadeContratada ?? null;
                                              const isFechado = qtdContratada !== null && totalEmpenhadoContrato === qtdContratada;
                                              const isParcial = qtdContratada !== null && totalEmpenhadoContrato < qtdContratada;
                                              const isExcesso = qtdContratada !== null && totalEmpenhadoContrato > qtdContratada;

                                              return (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                  <h5 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <DollarSign size={14} color="var(--primary)" /> Empenhos Vinculados a este Contrato ({govEmps?.length || pncpEmps?.length || 0})
                                                  </h5>
                                                  {qtdContratada !== null && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700 }}>
                                                      <span>Total Empenhado: <strong>{formatNumber(totalEmpenhadoContrato)}</strong> de <strong>{formatNumber(qtdContratada)} un</strong></span>
                                                      {isFechado && (
                                                        <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px' }}>
                                                          ✓ 100% Empenhado
                                                        </span>
                                                      )}
                                                      {isParcial && (
                                                        <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px' }}>
                                                          🔵 Empenhamento Parcial (Saldo: {formatNumber(qtdContratada - totalEmpenhadoContrato)} un)
                                                        </span>
                                                      )}
                                                      {isExcesso && (
                                                        <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '12px' }}>
                                                          ⚠️ Excesso (+{formatNumber(totalEmpenhadoContrato - qtdContratada)} un)
                                                        </span>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                            
                                            {(govEmps && govEmps.length > 0) ? (
                                              <div className="table-container" style={{ marginTop: 0, overflowX: 'auto' }}>
                                                <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                                                  <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>N.º Empenho</th>
                                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Órgão / UG</th>
                                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Unidade Interna</th>
                                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Qtd Física (Item)</th>
                                                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Data de Emissão</th>
                                                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)', width: '100px' }}>Ação</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {govEmps.map((emp, eidx) => {
                                                      const currentLinkId = empenhoLinks[emp.numero] || (emp.id ? empenhoLinks[String(emp.id)] : '') || '';
                                                      const empKey = emp.numero || String(emp.id);
                                                      const qtyInfo = getEmpenhoQuantityInfo(empKey, emp, empenhoManualQuantities, c);
                                                      const isEditing = editingEmpenhoKey === empKey;

                                                      return (
                                                        <tr key={`${emp.numero}-${eidx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0c326f', fontFamily: 'monospace' }}>{emp.numero}</td>
                                                          <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                            {isGer ? (arp.nomeOrgao || 'SENASP / MJSP') : resolvedOrgaoName}
                                                          </td>
                                                          <td style={{ padding: '6px 8px' }}>
                                                            {allocations.length === 0 ? (
                                                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Sem unidades cadastradas</span>
                                                            ) : (
                                                              <select
                                                                value={currentLinkId}
                                                                onChange={(e) => handleLinkEmpenho(emp.numero, e.target.value)}
                                                                disabled={saveEmpenhoLinksMutation.isPending}
                                                                className="form-input"
                                                                style={{
                                                                  padding: '0.2rem 0.4rem',
                                                                  fontSize: '0.75rem',
                                                                  height: 'auto',
                                                                  width: '100%',
                                                                  maxWidth: '220px',
                                                                  borderColor: currentLinkId ? 'var(--primary)' : '#cbd5e1',
                                                                  background: currentLinkId ? '#eff6ff' : '#ffffff',
                                                                  fontWeight: currentLinkId ? 600 : 400
                                                                }}
                                                              >

                                                                <option value="">Não vinculado</option>
                                                                {allocationsWithEmpenho.map(a => (
                                                                  <option key={a.id} value={a.id}>
                                                                    {a.unitName} (Saldo: {formatNumber(a.saldoQty != null ? a.saldoQty : (a.allocatedQty - a.empenhadaQty))} un)
                                                                  </option>
                                                                ))}
                                                              </select>
                                                            )}
                                                          </td>
                                                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                            {isEditing ? (
                                                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <input
                                                                  type="number"
                                                                  className="form-input"
                                                                  value={editingEmpenhoQty}
                                                                  onChange={(e) => setEditingEmpenhoQty(e.target.value)}
                                                                  disabled={saveManualQuantitiesMutation.isPending}
                                                                  style={{ width: '65px', padding: '2px 4px', fontSize: '0.78rem', height: '24px', textAlign: 'center', fontWeight: 700 }}
                                                                  autoFocus
                                                                  onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleSaveEmpenhoQty(empKey);
                                                                    if (e.key === 'Escape') setEditingEmpenhoKey(null);
                                                                  }}
                                                                />
                                                                <button
                                                                  type="button"
                                                                  onClick={() => handleSaveEmpenhoQty(empKey)}
                                                                  disabled={saveManualQuantitiesMutation.isPending}
                                                                  style={{ background: '#22c55e', color: '#ffffff', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', height: '24px', display: 'flex', alignItems: 'center' }}
                                                                  title="Salvar quantidade manual"
                                                                >
                                                                  <Check size={12} />
                                                                </button>
                                                                <button
                                                                  type="button"
                                                                  onClick={() => setEditingEmpenhoKey(null)}
                                                                  disabled={saveManualQuantitiesMutation.isPending}
                                                                  style={{ background: '#94a3b8', color: '#ffffff', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', height: '24px', display: 'flex', alignItems: 'center' }}
                                                                  title="Cancelar"
                                                                >
                                                                  <X size={12} />
                                                                </button>
                                                              </div>
                                                            ) : (
                                                              qtyInfo.isOfficial ? (
                                                                qtyInfo.isReforco ? (
                                                                  <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    {formatNumber(qtyInfo.qty)} un
                                                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }} title="Empenho complementar de reforço financeiro">
                                                                      Reforço
                                                                    </span>
                                                                  </span>
                                                                ) : (
                                                                  <span style={{ color: 'var(--success)' }}>
                                                                    {formatNumber(qtyInfo.qty)} un
                                                                  </span>
                                                                )
                                                              ) : qtyInfo.isManual ? (
                                                                <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                  {formatNumber(qtyInfo.qty)} un
                                                                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }}>
                                                                    Auditado
                                                                  </span>
                                                                </span>
                                                              ) : (
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                                                                  N/D
                                                                </span>
                                                              )
                                                            )}
                                                          </td>
                                                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{formatDate(emp.data_emissao)}</td>
                                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleStartEditEmpenhoQty(empKey, qtyInfo.qty)}
                                                                disabled={saveManualQuantitiesMutation.isPending}
                                                                className="btn btn-secondary"
                                                                style={{ padding: '2px 6px', fontSize: '0.72rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                                                title="Ajustar quantidade física deste empenho"
                                                              >
                                                                <Edit2 size={11} /> Ajustar
                                                              </button>
                                                              {qtyInfo.isManual && (
                                                                <button
                                                                  type="button"
                                                                  onClick={() => handleRestoreEmpenhoQty(empKey)}
                                                                  disabled={saveManualQuantitiesMutation.isPending}
                                                                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                                                                  title="Restaurar para o valor oficial deduzido da API"
                                                                >
                                                                  <RotateCcw size={12} />
                                                                </button>
                                                              )}
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>
                                            ) : (
                                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
                                                Nenhum empenho detalhado para este contrato.
                                              </div>
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
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

            {/* Section 2: Todas as Notas de Empenho Conhecidas (Consumo Real de Saldo) */}
            <AppCard style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0c326f', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <DollarSign size={16} color="#0c326f" /> Notas de Empenho Conhecidas (Consumo de Saldo)
                  </h4>
                  <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {allEmpenhos.length} {allEmpenhos.length === 1 ? 'empenho' : 'empenhos'}
                  </span>
                </div>
                <AppButton
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => {
                    setEditingManualEmpenho(null);
                    setIsManualEmpenhoModalOpen(true);
                  }}
                >
                  Adicionar Empenho
                </AppButton>
              </div>

              {allEmpenhos.length === 0 ? (
                <EmptyState
                  title="Nenhum empenho registrado"
                  description="Nenhum empenho localizado na API ou cadastrado manualmente para este item."
                  icon={<DollarSign size={32} color="#94a3b8" />}
                />
              ) : (
                <div className="table-container" style={{ marginTop: 0, overflowX: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <table className="custom-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>N.º do Empenho</th>
                        <th>Ano</th>
                        <th>UASG / Órgão</th>
                        <th>Unidade Interna (Alocação)</th>
                        <th style={{ textAlign: 'center' }}>Qtd Física (Item)</th>
                        <th style={{ textAlign: 'center' }}>Origem & Confiança</th>
                        <th style={{ textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEmpenhos.map((emp) => {
                        const currentLinkId = emp.unidadeInternaId || empenhoLinks[emp.numero] || '';
                        const isManual = emp.origem === 'MANUAL';
                        const isSincronizado = emp.origem === 'SINCRONIZADO';
                        const isDivergente = emp.status === 'DIVERGENTE';

                        return (
                          <tr key={emp.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0c326f', fontSize: '0.85rem' }}>
                              {emp.numero}
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>{emp.ano}</td>
                            <td style={{ fontSize: '0.82rem' }}>
                              <span style={{ fontWeight: 600 }}>UASG {emp.uasg}</span>
                              {emp.fornecedor && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.fornecedor}</div>
                              )}
                            </td>
                            <td>
                              {allocations.length === 0 ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Sem unidades cadastradas</span>
                              ) : (
                                <select
                                  value={currentLinkId}
                                  onChange={(e) => handleLinkEmpenho(emp.numero, e.target.value)}
                                  disabled={saveEmpenhoLinksMutation.isPending}
                                  className="form-input"
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    fontSize: '0.75rem',
                                    height: 'auto',
                                    width: '100%',
                                    maxWidth: '220px',
                                    borderColor: currentLinkId ? 'var(--primary)' : '#cbd5e1',
                                    background: currentLinkId ? '#eff6ff' : '#ffffff',
                                    fontWeight: currentLinkId ? 600 : 400
                                  }}
                                >

                                  <option value="">Não vinculado</option>
                                  {allocationsWithEmpenho.map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.unitName} (Saldo: {formatNumber(a.saldoQty != null ? a.saldoQty : (a.allocatedQty - a.empenhadaQty))} un)
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                              {formatNumber(emp.quantidade)} un
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isDivergente ? (
                                <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                  🔴 Divergente
                                </span>
                              ) : isSincronizado ? (
                                <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                  🔵 Sincronizado
                                </span>
                              ) : isManual ? (
                                <span style={{ background: '#fefce8', color: '#a16207', border: '1px solid #fde047', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                  🟡 Manual
                                </span>
                              ) : (
                                <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                  🟢 Oficial
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isManual ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                  <button
                                    onClick={() => {
                                      setEditingManualEmpenho(emp);
                                      setIsManualEmpenhoModalOpen(true);
                                    }}
                                    disabled={saveManualEmpenhosMutation.isPending}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }}
                                    title="Editar empenho manual"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteManualEmpenho(emp.id)}
                                    disabled={saveManualEmpenhosMutation.isPending}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', color: '#b91c1c', border: '1px solid #fecaca', background: '#fef2f2' }}
                                    title="Excluir empenho manual"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </AppCard>

          </div>
        ) : activeTab === 'alocacao' ? (
          /* INTERNAL ALLOCATION TAB CONTENT */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0.5rem 1rem' }}>
            
            {/* Stat Cards for Allocations */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Disponível da UG</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatNumber(totalUGQty)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Quantitativo original registrado para a UASG {arp.codigoUnidadeGerenciadora}
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Alocado Interno</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {formatNumber(totalAllocatedSum)}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    de {formatNumber(totalUGQty)} un
                  </span>
                </div>
                {/* Progress bar */}
                <div className="progress-track" style={{ height: '5px', marginTop: '0.4rem', background: '#e9ecef' }}>
                  <div className="progress-fill fill-success" style={{ width: `${Math.min(percentAllocated, 100)}%` }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  <span>Alocado: {formatNumber(percentAllocated)}%</span>
                  <span>Restam {formatNumber(remainingUGQty)} un</span>
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Empenhado Interno</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatNumber(totalEmpenhadaSum)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Total de empenhos vinculados pelas unidades internas
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Saldo Disponível Líquido</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatNumber(totalAllocatedSum - totalEmpenhadaSum)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Saldo líquido a empenhar somando as divisões
                </div>
              </div>
            </div>

            {/* Error Message */}
            {allocationError && (
              <div style={{ 
                padding: '0.75rem 1rem', 
                background: '#f8d7da', 
                color: '#721c24', 
                border: '1px solid #f5c6cb', 
                borderRadius: '4px', 
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: 'var(--font-family)'
              }}>
                ⚠️ {allocationError}
              </div>
            )}

            {/* Allocation Form */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', fontWeight: 800, color: '#0c326f' }}>
                {editingId ? <Edit2 size={16} color="#0c326f" /> : <Plus size={16} color="#0c326f" />}
                <span>{editingId ? 'Editar Alocação de Unidade Interna' : 'Alocar Novo Quantitativo para Unidade Interna'}</span>
              </div>
              <form onSubmit={handleAddAllocation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                        <Building2 size={13} style={{ marginRight: '4px', verticalAlign: '-1px' }} /> Unidade / Departamento Interno *
                      </label>
                      <Link
                        to="/admin/departamentos"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#0c326f',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          textDecoration: 'none'
                        }}
                        title="Abrir gestão de Unidades Internas em nova aba"
                      >
                        Unidades Internas <ExternalLink size={11} />
                      </Link>
                    </div>
                    <select 
                      className="form-input" 
                      value={newUnitName || getFirstAvailableUnitSigla(departments, allocations, editingId)}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      style={{ fontWeight: 700, color: '#0c326f', cursor: 'pointer', fontSize: '0.82rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
                      required
                    >
                      {departments.map(d => {
                        const isAllocated = allocations.some(
                          a => a.id !== editingId && a.unitName.trim().toLowerCase() === d.sigla.trim().toLowerCase()
                        );
                        return (
                          <option key={d.id} value={d.sigla} disabled={isAllocated}>
                            {d.sigla} — {d.nomeCompleto} {isAllocated ? ' (Já alocada)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem', display: 'block' }}>
                      Qtd Alocada *
                    </label>
                    <input 
                      type="number" 
                      className="form-input" 
                      min="1"
                      placeholder="Ex: 50"
                      value={newAllocatedQty}
                      onChange={(e) => setNewAllocatedQty(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {editingId && (
                    <AppButton 
                      type="button" 
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit} 
                      disabled={saveAllocationsMutation.isPending}
                    >
                      Cancelar
                    </AppButton>
                  )}
                  <AppButton 
                    type="submit" 
                    variant="primary"
                    size="sm"
                    icon={saveAllocationsMutation.isPending ? undefined : (editingId ? <Check size={14} /> : <Plus size={14} />)}
                    isLoading={saveAllocationsMutation.isPending}
                    disabled={saveAllocationsMutation.isPending || (!editingId && departments.length > 0 && departments.every(d => allocations.some(a => a.unitName.trim().toLowerCase() === d.sigla.trim().toLowerCase())))}
                  >
                    {editingId ? 'Salvar Alocação' : 'Adicionar Alocação'}
                  </AppButton>
                </div>
              </form>
            </div>

            {/* Department Table */}
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0c326f', marginBottom: '0.75rem', borderBottom: 'none', paddingBottom: 0 }}>
                Unidades Internas Cadastradas ({allocations.length})
              </h4>
              {allocations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                  Nenhuma alocação interna efetuada para este item ainda. Use o formulário acima para cadastrar unidades.
                </div>
              ) : (
                <div className="table-container" style={{ marginTop: 0 }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Unidade / Departamento Interno</th>
                        <th>Qtd Alocada</th>
                        <th>Qtd Empenhada (Uso)</th>
                        <th>Saldo a Empenhar</th>
                        <th style={{ width: '220px' }}>% Consumido</th>
                        <th style={{ width: '120px', textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationsWithEmpenho.map((alloc) => {
                        const balance = alloc.allocatedQty - alloc.empenhadaQty;
                        const usePercent = alloc.allocatedQty > 0 ? (alloc.empenhadaQty / alloc.allocatedQty) * 100 : 0;
                        const isOver = balance < 0;

                        return (
                          <tr key={alloc.id}>
                            <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {alloc.unitName}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {formatNumber(alloc.allocatedQty)}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--warning)' }}>
                              {formatNumber(alloc.empenhadaQty)}
                            </td>
                            <td style={{ 
                              fontFamily: 'monospace', 
                              fontWeight: 700, 
                              color: isOver ? 'var(--danger)' : 'var(--success)' 
                            }}>
                              {formatNumber(balance)}
                            </td>
                            <td>
                              <div className="progress-container">
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{formatNumber(usePercent)}%</span>
                                </div>
                                <div className="progress-track" style={{ height: '6px', background: '#e9ecef' }}>
                                  <div 
                                    className={`progress-fill ${getProgressColorClass(100 - usePercent)}`}
                                    style={{ width: `${Math.min(usePercent, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => handleEditAllocation(alloc)}
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', borderColor: 'var(--border-color)', color: 'var(--text-secondary)', textTransform: 'none', height: 'auto', border: '1px solid var(--border-color)' }}
                                  title="Editar"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteAllocation(alloc.id)}
                                  disabled={saveAllocationsMutation.isPending || saveEmpenhoLinksMutation.isPending}
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', borderColor: '#f5c6cb', color: 'var(--danger)', textTransform: 'none', height: 'auto', border: '1px solid #f5c6cb' }}
                                  title="Excluir"
                                >

                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
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
      </AppCard>

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
      <ManualEmpenhoModal
        isOpen={isManualEmpenhoModalOpen}
        onClose={() => {
          setIsManualEmpenhoModalOpen(false);
          setEditingManualEmpenho(null);
        }}
        onSave={handleSaveManualEmpenho}
        arpId={arp.numeroAtaRegistroPreco}
        itemId={item.numeroItem}
        defaultUasg={arp.codigoUnidadeGerenciadora || '200331'}
        defaultFornecedor={item.nomeRazaoSocialFornecedor}
        defaultCnpj={item.niFornecedor}
        defaultValorUnitario={item.valorUnitario}
        initialEmpenho={editingManualEmpenho}
        isLoading={saveManualEmpenhosMutation.isPending}
      />

      {/* Modal de Cadastro de Contrato Manual com Vínculo Obrigatório */}
      <ManualContratoModal
        isOpen={isManualContratoModalOpen}
        onClose={() => setIsManualContratoModalOpen(false)}
        onSave={handleSaveManualContrato}
        arpId={arp.numeroAtaRegistroPreco}
        itemId={item.numeroItem}
        defaultUasg={arp.codigoUnidadeGerenciadora || '200331'}
        defaultFornecedor={item.nomeRazaoSocialFornecedor}
        defaultCnpj={item.niFornecedor}
        availableEmpenhos={allEmpenhos}
        isLoading={saveManualContractMutation.isPending}
      />

      {/* Modal de Vínculo com Contrato Oficial da UASG (Fase 6.2) */}
      <LinkContractModal
        isOpen={isLinkContractModalOpen}
        onClose={() => setIsLinkContractModalOpen(false)}
        itemKey={canonicalItemKey}
        numeroAta={arp.numeroAtaRegistroPreco}
        numeroItem={item.numeroItem}
        uasg={arp.codigoUnidadeGerenciadora}
        quantidadeDisponivelItem={item.quantidadeHomologadaItem}
        existingLinkedContractKeys={enrichedOfficialLinks.map(l => l.contractKey)}
      />
    </div>
  );
};

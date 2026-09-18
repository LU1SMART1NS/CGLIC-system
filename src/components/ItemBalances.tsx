import React, { useState, useEffect } from 'react';
import { ChevronLeft, Building2, HelpCircle, ArrowRightLeft, Users, DollarSign, Plus, Edit2, Trash2, ExternalLink, ChevronRight, ChevronDown, Check, X, Share2, RotateCcw } from 'lucide-react';
import { fetchUnidadesItem, fetchEmpenhosSaldoItem, fetchPncpContracts, fetchPncpContractEmpenhos, fetchAdesoesItem, fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe, fetchContratosGovData, getCanonicalContractKey, parsePncpIdentifiers } from '../services/api';
import { fetchAllocations, saveAllocations, fetchEmpenhoLinks, saveEmpenhoLinks, fetchEmpenhoManualQuantities, saveEmpenhoManualQuantities, removeEmpenhoManualQuantity, fetchManualEmpenhos, saveManualEmpenhos, fetchManualContratos, saveManualContratos, fetchContratoEmpenhoLinks, saveContratoEmpenhoLinks } from '../services/allocationService';
import { calculateTotalEmpenhado, reconcileBalances, matchAndMergeEmpenhos, normalizeEmpenhoNumero, calculateAllocationsWithEmpenhos, calculateItemCardMetrics, deduceEmpenhoQuantity } from '../services/balanceService';
import { cacheArpsInDb, cacheArpItemsInDb } from '../services/dbCacheService';
import { fetchDepartments, type InternalDepartment } from '../services/unitService';
import { ManageDepartmentsModal } from './ManageDepartmentsModal';
import { ManualEmpenhoModal } from './modals/ManualEmpenhoModal';
import { ManualContratoModal } from './modals/ManualContratoModal';
import { ItemReconciliationCard } from './ItemReconciliationCard';
import { formatPncpContractUrl, formatPncpAtaUrl, formatPncpCompraUrl } from '../utils/pncpUtils';
import type { ArpRecord, ArpItemRecord, UnidadeItemRecord, EmpenhoSaldoItemRecord, InternalAllocation, PncpContract, PncpContractEmpenho, AdesaoItemRecord, ContratosGovEmpenhoRecord, Empenho, Contrato, ContratoEmpenho, ReconciliationReport } from '../types';

interface ItemBalancesProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
}

export const ItemBalances: React.FC<ItemBalancesProps> = ({ arp, item, onBack }) => {
  const [unidades, setUnidades] = useState<UnidadeItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [empenhos, setEmpenhos] = useState<EmpenhoSaldoItemRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'unidades' | 'empenhos' | 'alocacao' | 'adesoes'>('unidades');

  const [adesoes, setAdesoes] = useState<AdesaoItemRecord[]>([]);
  const [adesoesLoading, setAdesoesLoading] = useState<boolean>(true);
  const [adesoesError, setAdesoesError] = useState<string | null>(null);

  const [contracts, setContracts] = useState<PncpContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState<boolean>(true);
  const [contractsError, setContractsError] = useState<string | null>(null);

  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});
  const [contractEmpenhos, setContractEmpenhos] = useState<Record<string, PncpContractEmpenho[]>>({});
  const [contractGovEmpenhos, setContractGovEmpenhos] = useState<Record<string, ContratosGovEmpenhoRecord[]>>({});
  const [empenhosLoadingMap, setEmpenhosLoadingMap] = useState<Record<string, boolean>>({});
  const [selectedEmpenhoDetail, setSelectedEmpenhoDetail] = useState<EmpenhoSaldoItemRecord | null>(null);

  const [allocations, setAllocations] = useState<InternalAllocation[]>([]);
  const [empenhoLinks, setEmpenhoLinks] = useState<Record<string, string>>({});
  const [newUnitName, setNewUnitName] = useState<string>('');
  const [newAllocatedQty, setNewAllocatedQty] = useState<number | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  // Estados Canônicos de Registros Manuais e Auditoria
  const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
  const [manualEmpenhos, setManualEmpenhos] = useState<Empenho[]>([]);
  const [manualContratos, setManualContratos] = useState<Contrato[]>([]);
  const [contratoEmpenhoLinks, setContratoEmpenhoLinks] = useState<ContratoEmpenho[]>([]);
  const [empenhoManualQuantities, setEmpenhoManualQuantities] = useState<Record<string, number>>({});
  const [editingEmpenhoKey, setEditingEmpenhoKey] = useState<string | null>(null);
  const [editingEmpenhoQty, setEditingEmpenhoQty] = useState<string>('');
  const [isManualEmpenhoModalOpen, setIsManualEmpenhoModalOpen] = useState<boolean>(false);
  const [isManualContratoModalOpen, setIsManualContratoModalOpen] = useState<boolean>(false);
  const [editingManualEmpenho, setEditingManualEmpenho] = useState<Empenho | null>(null);

  const loadManualData = async () => {
    try {
      const emps = await fetchManualEmpenhos(itemKey);
      setManualEmpenhos(emps);
      const ctrs = await fetchManualContratos(itemKey);
      setManualContratos(ctrs);
      const links = await fetchContratoEmpenhoLinks(itemKey);
      setContratoEmpenhoLinks(links);
      const manualQtds = await fetchEmpenhoManualQuantities(itemKey);
      setEmpenhoManualQuantities(manualQtds);
    } catch (e) {
      console.warn('Erro ao carregar dados manuais:', e);
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
    setEmpenhoManualQuantities(updated);
    await saveEmpenhoManualQuantities(itemKey, updated);
    setEditingEmpenhoKey(null);
  };

  const handleRestoreEmpenhoQty = async (empKey: string) => {
    const updated = await removeEmpenhoManualQuantity(itemKey, empKey);
    setEmpenhoManualQuantities(updated);
    if (editingEmpenhoKey === empKey) {
      setEditingEmpenhoKey(null);
    }
  };

  const handleSaveManualEmpenho = async (empData: Omit<Empenho, 'id' | 'criadoEm' | 'atualizadoEm'>) => {
    let updated: Empenho[];
    if (editingManualEmpenho) {
      updated = manualEmpenhos.map(e =>
        e.id === editingManualEmpenho.id
          ? { ...e, ...empData, atualizadoEm: new Date().toISOString() }
          : e
      );
    } else {
      const newEmp: Empenho = {
        ...empData,
        id: `manual-emp-${Date.now()}`,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };
      updated = [...manualEmpenhos, newEmp];
    }
    setManualEmpenhos(updated);
    await saveManualEmpenhos(itemKey, updated);
    setEditingManualEmpenho(null);
  };

  const handleDeleteManualEmpenho = async (empId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este empenho manual?')) {
      const updated = manualEmpenhos.filter(e => e.id !== empId);
      setManualEmpenhos(updated);
      await saveManualEmpenhos(itemKey, updated);

      const updatedLinks = contratoEmpenhoLinks.filter(l => l.empenhoId !== empId);
      setContratoEmpenhoLinks(updatedLinks);
      await saveContratoEmpenhoLinks(itemKey, updatedLinks);
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
    const updatedContratos = [...manualContratos, newContrato];
    setManualContratos(updatedContratos);
    await saveManualContratos(itemKey, updatedContratos);

    const newLinks: ContratoEmpenho[] = selectedEmpenhoIds.map(empId => ({
      id: `link-${newContratoId}-${empId}`,
      contratoId: newContratoId,
      empenhoId: empId,
      dataVinculo: new Date().toISOString(),
      origem: 'MANUAL'
    }));
    const updatedLinks = [...contratoEmpenhoLinks, ...newLinks];
    setContratoEmpenhoLinks(updatedLinks);
    await saveContratoEmpenhoLinks(itemKey, updatedLinks);
  };

  const handleDeleteManualContrato = async (contratoId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este contrato manual?')) {
      const updatedContratos = manualContratos.filter(c => c.id !== contratoId);
      setManualContratos(updatedContratos);
      await saveManualContratos(itemKey, updatedContratos);

      const updatedLinks = contratoEmpenhoLinks.filter(l => l.contratoId !== contratoId);
      setContratoEmpenhoLinks(updatedLinks);
      await saveContratoEmpenhoLinks(itemKey, updatedLinks);
    }
  };

  // Cadastro de Unidades Oficiais
  const [departments, setDepartments] = useState<InternalDepartment[]>([]);
  const [isManageDepsModalOpen, setIsManageDepsModalOpen] = useState<boolean>(false);

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

  const loadDepartments = async () => {
    const deps = await fetchDepartments();
    setDepartments(deps);
    if (deps.length > 0 && !newUnitName) {
      setNewUnitName(getFirstAvailableUnitSigla(deps, allocations, editingId));
    }
  };


  const loadUnidades = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUnidadesItem(
        item.numeroAtaRegistroPreco,
        item.codigoUnidadeGerenciadora,
        item.numeroItem
      );
      if (data.resultado && data.resultado.length > 0) {
        setUnidades(data.resultado);
      } else {
        setUnidades([{
          numeroAta: item.numeroAtaRegistroPreco,
          unidadeGerenciadora: arp.codigoUnidadeGerenciadora || '200331',
          numeroItem: item.numeroItem,
          codigoPdm: String(item.codigoPdm || ''),
          descricaoItem: item.descricaoItem,
          fornecedor: item.nomeRazaoSocialFornecedor,
          codigoUnidade: arp.codigoUnidadeGerenciadora || '200331',
          nomeUnidade: arp.nomeUnidadeGerenciadora || arp.nomeOrgao || 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA',
          tipoUnidade: 'GERENCIADORA',
          quantidadeRegistrada: item.quantidadeHomologadaItem || 0,
          saldoRemanejamentoEmpenho: item.quantidadeHomologadaItem || 0,
          saldoAdesoes: 0,
          qtdLimiteAdesao: item.maximoAdesao || 0,
          qtdLimiteInformadoCompra: item.maximoAdesao || 0,
          aceitaAdesao: item.maximoAdesao > 0,
          dataHoraInclusao: new Date().toISOString(),
          dataHoraAtualizacao: new Date().toISOString(),
          dataHoraExclusao: null
        }]);
      }
    } catch (err: any) {
      // Fallback gracioso para a Unidade Gerenciadora
      setUnidades([{
        numeroAta: item.numeroAtaRegistroPreco,
        unidadeGerenciadora: arp.codigoUnidadeGerenciadora || '200331',
        numeroItem: item.numeroItem,
        codigoPdm: String(item.codigoPdm || ''),
        descricaoItem: item.descricaoItem,
        fornecedor: item.nomeRazaoSocialFornecedor,
        codigoUnidade: arp.codigoUnidadeGerenciadora || '200331',
        nomeUnidade: arp.nomeUnidadeGerenciadora || arp.nomeOrgao || 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA',
        tipoUnidade: 'GERENCIADORA',
        quantidadeRegistrada: item.quantidadeHomologadaItem || 0,
        saldoRemanejamentoEmpenho: item.quantidadeHomologadaItem || 0,
        saldoAdesoes: 0,
        qtdLimiteAdesao: item.maximoAdesao || 0,
        qtdLimiteInformadoCompra: item.maximoAdesao || 0,
        aceitaAdesao: item.maximoAdesao > 0,
        dataHoraInclusao: new Date().toISOString(),
        dataHoraAtualizacao: new Date().toISOString(),
        dataHoraExclusao: null
      }]);
    } finally {
      setLoading(false);
    }
  };

  const loadEmpenhos = async () => {
    try {
      const data = await fetchEmpenhosSaldoItem(
        item.numeroAtaRegistroPreco,
        item.codigoUnidadeGerenciadora
      );
      const targetItemNum = parseInt(item.numeroItem, 10);
      const filtered = (data.resultado || []).filter(rec => {
        const recItemNum = parseInt(rec.numeroItem, 10);
        return recItemNum === targetItemNum || rec.numeroItem === item.numeroItem;
      });
      setEmpenhos(filtered);
    } catch (err: any) {
      console.warn('Erro ao buscar saldos de empenhos:', err);
    }
  };

  const loadAdesoes = async () => {
    setAdesoesLoading(true);
    setAdesoesError(null);
    try {
      const data = await fetchAdesoesItem(
        item.numeroAtaRegistroPreco,
        item.codigoUnidadeGerenciadora,
        item.numeroItem
      );
      const targetItemNum = parseInt(item.numeroItem, 10);
      const filtered = (data.resultado || []).filter(rec => {
        const recItemNum = parseInt(rec.numeroItem, 10);
        return recItemNum === targetItemNum || rec.numeroItem === item.numeroItem || (!rec.numeroItem);
      });
      setAdesoes(filtered);
      if (filtered.length === 0) {
        setAdesoesError('Nenhuma adesão (carona) externa registrada para este item no Compras.gov.br.');
      }
    } catch (err: any) {
      setAdesoesError(err.message || 'Falha ao buscar as adesões do item.');
    } finally {
      setAdesoesLoading(false);
    }
  };

  const parsePncpParams = () => {
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
  };

  const loadContracts = async () => {
    setContractsLoading(true);
    setContractsError(null);
    const params = parsePncpParams();

    try {
      const cnpj = params?.cnpj || (arp.codigoUnidadeGerenciadora === '200331' || arp.codigoUnidadeGerenciadora === '200330' ? '00394494000136' : '');
      const ano = params?.ano || arp.anoCompra || '2026';
      const sequencial = params?.sequencial || arp.numeroCompra || '1';
      const sequencialAta = params?.sequencialAta || '';

      const fallbackParams = {
        codigoOrgao: arp.codigoOrgao,
        codigoUnidadeGestora: arp.codigoUnidadeGerenciadora,
        idCompra: arp.idCompra,
        numeroCompra: arp.numeroCompra,
        anoCompra: arp.anoCompra,
        codigoModalidadeCompra: arp.codigoModalidadeCompra,
        dataVigenciaInicial: arp.dataVigenciaInicial,
        numeroControlePncpCompra: arp.numeroControlePncpCompra
      };

      const fornecedorInfo = {
        niFornecedor: item.niFornecedor,
        nomeFornecedor: item.nomeRazaoSocialFornecedor
      };

      const data = await fetchPncpContracts(
        cnpj,
        ano,
        sequencial,
        sequencialAta,
        item.numeroItem,
        fallbackParams,
        fornecedorInfo,
        arp.numeroAtaRegistroPreco
      );
      setContracts(data);

      // Carrega empenhos em background para todos os contratos e enriquece com dados oficiais
      data.forEach(async (c) => {
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
    } catch (err: any) {
      setContractsError(err.message || 'Falha ao buscar contratos do PNCP.');
    } finally {
      setContractsLoading(false);
    }
  };

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

        if (quantidadeFisica === undefined && unitPrice && emp.empenhado) {
          const deduction = deduceEmpenhoQuantity(
            emp.empenhado,
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
    if (emp?.empenhado && unitPrice) {
      const deduction = deduceEmpenhoQuantity(emp.empenhado, unitPrice, emp.data_emissao, contratoObj?.historicoPrecos);
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

  const loadAllocations = async () => {
    setAllocationError(null);
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    const rawData = await fetchAllocations(itemKey);

    // Consolidar alocações duplicadas com o mesmo nome de unidade se existirem
    const mapByUnitName = new Map<string, InternalAllocation>();
    const remappedIds = new Map<string, string>();
    let hasDuplicates = false;

    rawData.forEach(alloc => {
      const normalizedName = alloc.unitName.trim();
      const key = normalizedName.toLowerCase();
      if (!mapByUnitName.has(key)) {
        mapByUnitName.set(key, { ...alloc, unitName: normalizedName });
      } else {
        hasDuplicates = true;
        const main = mapByUnitName.get(key)!;
        remappedIds.set(alloc.id, main.id);
        main.allocatedQty += alloc.allocatedQty;
        main.empenhadaQty += alloc.empenhadaQty;
      }
    });

    const consolidated = Array.from(mapByUnitName.values());

    if (hasDuplicates) {
      await saveAllocations(itemKey, consolidated);

      if (remappedIds.size > 0) {
        const currentLinks = await fetchEmpenhoLinks(itemKey);
        let linksUpdated = false;
        const newLinks = { ...currentLinks };
        for (const empNum in newLinks) {
          const targetId = newLinks[empNum];
          if (remappedIds.has(targetId)) {
            newLinks[empNum] = remappedIds.get(targetId)!;
            linksUpdated = true;
          }
        }
        if (linksUpdated) {
          setEmpenhoLinks(newLinks);
          await saveEmpenhoLinks(itemKey, newLinks);
        }
      }
    }

    setAllocations(consolidated);
  };

  const loadEmpenhoLinks = async () => {
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    const links = await fetchEmpenhoLinks(itemKey);
    setEmpenhoLinks(links);
    const manualQtds = await fetchEmpenhoManualQuantities(itemKey);
    setEmpenhoManualQuantities(manualQtds);
  };

  useEffect(() => {
    cacheArpsInDb([arp]);
    cacheArpItemsInDb(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, [item]);
    try {
      const meta = JSON.stringify({ valorUnitario: item.valorUnitario, descricaoItem: item.descricaoItem });
      localStorage.setItem(`saldoarp-item-meta-${arp.numeroAtaRegistroPreco}-${item.numeroItem}`, meta);
      localStorage.setItem(`saldoarp-item-meta-${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`, meta);
    } catch {}
    loadUnidades();
    loadEmpenhos();
    loadContracts();
    loadAllocations();
    loadEmpenhoLinks();
    loadManualData();
    loadAdesoes();
    loadDepartments();
  }, [item]);

  const saveAllocationsToStorage = async (newAllocations: InternalAllocation[]) => {
    const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
    setAllocations(newAllocations);
    await saveAllocations(itemKey, newAllocations);
  };

  const isGerenciadoraUasg = (codigo?: string | number) => {
    const clean = String(codigo || '').replace(/\D/g, '');
    return clean === '200331' || clean === '200330' || clean === String(arp.codigoUnidadeGerenciadora).replace(/\D/g, '');
  };

  const isAllowedEmpenhoUasg = (uasg?: string | number) => {
    if (!uasg) return false;
    const clean = String(uasg).replace(/\D/g, '');
    return clean === '200331' || clean === '200330';
  };

  const gerenciadoraUnits = unidades.filter(uni => uni.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(uni.codigoUnidade));
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
      setEmpenhoLinks(cleanedLinks);
      saveEmpenhoLinks(itemKey, cleanedLinks);
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
    setEmpenhoLinks(updatedLinks);
    await saveEmpenhoLinks(itemKey, updatedLinks);

    const updatedAllocations = calculateAllocationsWithEmpenhos(allocations, allEmpenhos, updatedLinks);
    setAllocations(updatedAllocations);
    await saveAllocations(itemKey, updatedAllocations);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const cleanDate = dateStr.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getContractPncpUrl = (contrato: PncpContract) => {
    return formatPncpContractUrl(
      contrato.numeroControlePncp,
      contrato.linkVisualizacao
    );
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

  // Sincroniza as quantidades empenhadas com o storage caso haja discrepância
  useEffect(() => {
    if (allocations.length > 0 && allEmpenhos.length > 0) {
      const updatedAllocations = calculateAllocationsWithEmpenhos(allocations, allEmpenhos, empenhoLinks);
      const hasDiff = updatedAllocations.some((u, i) => u.empenhadaQty !== allocations[i]?.empenhadaQty);
      if (hasDiff) {
        setAllocations(updatedAllocations);
        const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
        saveAllocations(itemKey, updatedAllocations);
      }
    }
  }, [allEmpenhos, empenhoLinks]);

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

  const getProgressColorClass = (percent: number) => {
    if (percent < 20) return 'fill-danger';
    if (percent < 50) return 'fill-warning';
    return 'fill-success';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Navigation Breadcrumb */}
      <div className="breadcrumb">
        <span className="breadcrumb-item" style={{ cursor: 'pointer' }} onClick={onBack}>
          Ata {arp.numeroAtaRegistroPreco}
        </span>
        <span style={{ margin: '0 0.25rem' }}>/</span>
        <span className="breadcrumb-item active">Item {item.numeroItem}</span>
      </div>

      {/* Item info overview */}
      <section className="glass-card" style={{ background: 'linear-gradient(135deg, #f0f5fc 0%, #e1ebf8 100%)', borderColor: '#b2cbe6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="item-number">Item {item.numeroItem}</span>
              <span className="badge badge-info">{item.tipoItem}</span>
              <span className="badge badge-success">Preço Unitário: {formatCurrency(item.valorUnitario)}</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {item.descricaoItem}
            </h2>
          </div>
          <button onClick={onBack} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            <ChevronLeft size={16} /> Voltar aos itens
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
          <div className="meta-field">
            <span className="meta-label">Fornecedor</span>
            <span className="meta-value" style={{ color: 'var(--text-secondary)' }}>{item.nomeRazaoSocialFornecedor}</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Quantidade Original</span>
            <span className="meta-value">{formatNumber(item.quantidadeHomologadaItem)} unidades</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Valor Total do Item</span>
            <span className="meta-value" style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatCurrency(item.valorTotal)}</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Situação Sicap / Adesão</span>
            <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {item.maximoAdesao > 0 ? (
                <span className="badge badge-success">Aceita Adesão</span>
              ) : (
                <span className="badge badge-danger">Não Aceita Adesão</span>
              )}
            </span>
          </div>
        </div>

        {/* Links externos para PNCP */}
        {(() => {
          const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
          const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);
          if (!ataUrl && !compraUrl) return null;

          return (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {ataUrl && (
                <a 
                  href={ataUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', padding: '0.3rem 0.65rem' }}
                >
                  <ExternalLink size={12} /> Ver Ata no PNCP
                </a>
              )}
              {compraUrl && (
                <a 
                  href={compraUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', padding: '0.3rem 0.65rem' }}
                >
                  <ExternalLink size={12} /> Ver Edital / Contratação no PNCP
                </a>
              )}
            </div>
          );
        })()}
      </section>

      {/* Executive Item Reconciliation Audit Card */}
      {!loading && (
        <ItemReconciliationCard
          report={reconciliationReport}
          onRefresh={() => {
            loadEmpenhos();
            loadContracts();
            loadManualData();
          }}
          isLoading={loading || contractsLoading}
        />
      )}

      {/* Global item balance metrics */}
      {!loading && !error && (
        <section className="balances-header-grid">
          {/* Empenho Balance Card */}
          <div className="glass-card balance-card-summary">
            <div className="balance-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)' }}>
              <ArrowRightLeft size={24} />
            </div>
            <div className="balance-info-wrap" style={{ flexGrow: 1 }}>
              <span className="meta-label">Saldo p/ Empenho / Remanejamento</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span className="balance-val" style={{ color: 'var(--text-primary)' }}>
                  {formatNumber(officialCalculatedSaldo)}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  de {formatNumber(itemTotalQty)} un
                  {item.quantidadeEstimadaEdital && item.quantidadeEstimadaEdital !== itemTotalQty && (
                    <span style={{ marginLeft: '0.25rem', opacity: 0.8, fontWeight: 500 }} title={`Quantitativo originário do edital: ${formatNumber(item.quantidadeEstimadaEdital)} un`}>
                      (Edital: {formatNumber(item.quantidadeEstimadaEdital)})
                    </span>
                  )}
                </span>
              </div>
              
              <div className="progress-container" style={{ marginTop: '0.75rem' }}>
                <div className="progress-track">
                  <div 
                    className={`progress-fill ${getProgressColorClass(empenhoPercentClamped)}`}
                    style={{ width: `${empenhoPercentClamped}%` }}
                  ></div>
                </div>
                <div className="progress-label-row">
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Consumido: {formatNumber(totalConsumidoEmpenho)} ({formatNumber(empenhoConsumidoPercent)}%)</span>
                  <span style={{ fontWeight: 700, fontSize: '0.7rem', color: rawEmpenhoPercentRestante < 20 ? 'var(--danger)' : 'var(--success)' }}>{formatNumber(rawEmpenhoPercentRestante)}% restante</span>
                </div>
              </div>
            </div>
          </div>

          {/* Adesao (Carona) Balance Card */}
          <div 
            className="glass-card balance-card-summary" 
            onClick={() => setActiveTab('adesoes')}
            style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
            title="Clique para ver o detalhamento de caronas externas autorizadas"
          >
            <div className="balance-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent)' }}>
              <Users size={24} />
            </div>
            <div className="balance-info-wrap" style={{ flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="meta-label">Saldo para Adesões (Caronas)</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>Ver Caronas →</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span className="balance-val" style={{ color: 'var(--accent)' }}>
                  {formatNumber(totalSaldoAdesoes)}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  de {formatNumber(totalLimiteAdesao)} un
                </span>
              </div>

              <div className="progress-container" style={{ marginTop: '0.75rem' }}>
                <div className="progress-track">
                  <div 
                    className={`progress-fill ${getProgressColorClass(adsPercValClamped)}`}
                    style={{ width: `${adsPercValClamped}%` }}
                  ></div>
                </div>
                <div className="progress-label-row">
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Consumido: {formatNumber(totalConsumidoAdesao)} ({formatNumber(adsConsPercVal)}%)</span>
                  <span style={{ fontWeight: 700, fontSize: '0.7rem', color: adsPercValClamped < 20 ? 'var(--danger)' : 'var(--accent)' }}>{formatNumber(adsPercVal)}% restante</span>
                </div>
              </div>
            </div>
          </div>

          {/* Value Balance Card */}
          <div className="glass-card balance-card-summary">
            <div className="balance-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' }}>
              <DollarSign size={24} />
            </div>
            <div className="balance-info-wrap">
              <span className="meta-label">Valor Financeiro Disponível (Empenho)</span>
              <span className="balance-val" style={{ color: valorFinanceiroDisponivel < 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
                {formatCurrency(valorFinanceiroDisponivel)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Total consumido: {formatCurrency(valorFinanceiroConsumido)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Granular unit breakdown */}
      <section className="glass-card" style={{ padding: '1rem' }}>
        <h3 className="section-title" style={{ fontSize: '1.1rem', padding: '0.5rem 1rem', marginBottom: '1rem' }}>
          <Building2 size={16} color="var(--primary)" /> Detalhamento de Saldos e Empenhos por Órgão
        </h3>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingLeft: '1rem' }}>
          <button 
            onClick={() => setActiveTab('unidades')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: activeTab === 'unidades' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
              color: activeTab === 'unidades' ? '#fff' : 'var(--text-secondary)',
              border: activeTab === 'unidades' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              boxShadow: activeTab === 'unidades' ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Saldos dos Órgãos (Geral)
          </button>
          <button 
            onClick={() => setActiveTab('alocacao')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: activeTab === 'alocacao' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
              color: activeTab === 'alocacao' ? '#fff' : 'var(--text-secondary)',
              border: activeTab === 'alocacao' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              boxShadow: activeTab === 'alocacao' ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Alocação Interna (UG)
          </button>
          <button 
            onClick={() => setActiveTab('empenhos')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: activeTab === 'empenhos' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
              color: activeTab === 'empenhos' ? '#fff' : 'var(--text-secondary)',
              border: activeTab === 'empenhos' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              boxShadow: activeTab === 'empenhos' ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Contratos & Empenhos
          </button>
          <button 
            onClick={() => setActiveTab('adesoes')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: activeTab === 'adesoes' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
              color: activeTab === 'adesoes' ? '#fff' : 'var(--text-secondary)',
              border: activeTab === 'adesoes' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              boxShadow: activeTab === 'adesoes' ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <Share2 size={13} /> Adesões / Caronas (Endpoint 5)
            {adesoes.length > 0 && (
              <span style={{
                background: activeTab === 'adesoes' ? 'rgba(255,255,255,0.3)' : 'var(--accent)',
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
          loading ? (
            <div className="spinner-container">
              <div className="spinner spinner-glow"></div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Buscando saldos individuais por unidade...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <HelpCircle size={40} className="empty-state-icon" />
              <p style={{ fontSize: '0.95rem' }}>{error}</p>
            </div>
          ) : (
            <div className="table-container" style={{ marginTop: 0 }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Órgão Participante / UASG</th>
                    <th>Tipo</th>
                    <th>Original Registrado</th>
                    <th>Qtd Empenhada</th>
                    <th style={{ width: '220px' }}>Saldo p/ Empenho</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUnidades.map((uni, idx) => {
                    const cleanUasg = String(uni.codigoUnidade || '').replace(/\D/g, '');
                    const isUG = uni.tipoUnidade === 'GERENCIADORA' || isGerenciadoraUasg(cleanUasg);
                    const hasMultipleUgRows = sortedUnidades.filter(u => isGerenciadoraUasg(u.codigoUnidade)).length > 1;

                    const empsForUnit = allEmpenhos.filter(e => {
                      const eUasg = String(e.uasg || '').replace(/\D/g, '');
                      if (isUG) {
                        if (hasMultipleUgRows) {
                          return eUasg === cleanUasg;
                        }
                        return isAllowedEmpenhoUasg(eUasg);
                      }
                      return eUasg === cleanUasg;
                    });

                    const empenhadoUnitQty = calculateTotalEmpenhado(empsForUnit);
                    const effectiveSaldo = isUG 
                      ? (uni.quantidadeRegistrada - empenhadoUnitQty)
                      : (uni.saldoRemanejamentoEmpenho !== undefined && uni.saldoRemanejamentoEmpenho !== null 
                          ? uni.saldoRemanejamentoEmpenho 
                          : (uni.quantidadeRegistrada - empenhadoUnitQty));

                    const empPerc = uni.quantidadeRegistrada > 0 ? (effectiveSaldo / uni.quantidadeRegistrada) * 100 : 0;
                    const clampedPerc = Math.max(0, Math.min(100, empPerc));

                    return (
                      <tr key={`${uni.codigoUnidade}-${idx}`}>
                        <td style={{ fontSize: '0.88rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {uni.nomeUnidade}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 500 }}>
                            UASG: {uni.codigoUnidade}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${isUG ? 'badge-info' : 'badge-success'}`}>
                            {isUG ? 'GERENCIADORA' : 'PARTICIPANTE'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                          {formatNumber(uni.quantidadeRegistrada)}
                        </td>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace', color: empenhadoUnitQty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {formatNumber(empenhadoUnitQty)} un
                        </td>
                        <td>
                          <div className="progress-container">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              <span style={{ fontWeight: 700, color: effectiveSaldo < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                                {formatNumber(effectiveSaldo)}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>{formatNumber(empPerc)}%</span>
                            </div>
                            <div className="progress-track" style={{ height: '6px' }}>
                              <div 
                                className={`progress-fill ${getProgressColorClass(clampedPerc)}`}
                                style={{ width: `${clampedPerc}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'empenhos' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Section 1: Contratos (PNCP e Manuais) */}
            <div className="glass-card" style={{ padding: '1.25rem', background: '#f8fafc', borderColor: '#e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                  <Building2 size={16} /> Contratos Celebrados (PNCP e Manuais)
                </h4>
                <button
                  type="button"
                  onClick={() => setIsManualContratoModalOpen(true)}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '4px' }}
                >
                  <Plus size={14} /> Adicionar Contrato
                </button>
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
              ) : (contracts.length === 0 && manualContratos.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                  Nenhum contrato cadastrado no PNCP ou manualmente para esta Ata.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {(() => {
                    const deduplicateContractsList = (list: any[]) => {
                      const map = new Map<string, any>();
                      list.forEach((c, idx) => {
                        const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp) || `contract-${idx}`;
                        if (!map.has(canKey)) {
                          map.set(canKey, c);
                        } else {
                          const existing = map.get(canKey)!;
                          map.set(canKey, {
                            ...existing,
                            ...c,
                            _isManual: existing._isManual || c._isManual,
                            _manualId: existing._manualId || c._manualId,
                            quantidadeContratada: existing.quantidadeContratada ?? c.quantidadeContratada,
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
                            if (u === '200331' || u === '200330') return true;
                            if (c.tipoUnidade === 'GERENCIADORA') return true;
                            return false;
                          }),
                          ...manualContratos
                            .filter(mc => mc.uasg === '200331' || mc.uasg === '200330')
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
                            if (u === '200331' || u === '200330') return false;
                            if (c.tipoUnidade === 'GERENCIADORA') return false;
                            return true;
                          }),
                          ...manualContratos
                            .filter(mc => mc.uasg !== '200331' && mc.uasg !== '200330')
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
                                const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
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
                                        {c._isManual ? (
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
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
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
                                          {c._isManual && c._manualId && (
                                            <button
                                              onClick={() => handleDeleteManualContrato(c._manualId)}
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
                                                      <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Valor Empenhado</th>
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
                                                                  style={{ background: '#22c55e', color: '#ffffff', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', height: '24px', display: 'flex', alignItems: 'center' }}
                                                                  title="Salvar quantidade manual"
                                                                >
                                                                  <Check size={12} />
                                                                </button>
                                                                <button
                                                                  type="button"
                                                                  onClick={() => setEditingEmpenhoKey(null)}
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
                                                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontFamily: 'monospace' }}>
                                                            {formatCurrency(typeof emp.empenhado === 'number' ? emp.empenhado : parseFloat(String(emp.empenhado || '0').replace(/\./g, '').replace(',', '.')))}
                                                          </td>
                                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                              <button
                                                                type="button"
                                                                onClick={() => handleStartEditEmpenhoQty(empKey, qtyInfo.qty)}
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
            </div>

            {/* Section 2: Todas as Notas de Empenho Conhecidas (Consumo Real de Saldo) */}
            <div className="glass-card" style={{ padding: '1.25rem', background: '#f8fafc', borderColor: '#e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                    <DollarSign size={16} /> Notas de Empenho Conhecidas (Consumo de Saldo)
                  </h4>
                  <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                    {allEmpenhos.length} {allEmpenhos.length === 1 ? 'empenho' : 'empenhos'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingManualEmpenho(null);
                    setIsManualEmpenhoModalOpen(true);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '4px' }}
                >
                  <Plus size={14} /> Adicionar Empenho
                </button>
              </div>

              {allEmpenhos.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                  Nenhum empenho localizado na API ou cadastrado manualmente. Clique em <strong>"+ Adicionar Empenho"</strong> para registrar uma Nota de Empenho.
                </div>
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
                        <th style={{ textAlign: 'right' }}>Valor Total</th>
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
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {emp.valorTotal ? formatCurrency(emp.valorTotal) : '-'}
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
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }}
                                    title="Editar empenho manual"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteManualEmpenho(emp.id)}
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
            </div>

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
            <div style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fcfdfe' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0c326f', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: 'none', paddingBottom: 0 }}>
                <Plus size={16} /> {editingId ? 'Editar Alocação de Unidade Interna' : 'Alocar Novo Quantitativo para Unidade Interna'}
              </h4>
              <form onSubmit={handleAddAllocation} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', margin: 0 }}>
                      <Building2 size={13} style={{ marginRight: '4px' }} /> Unidade / Departamento Interno *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManageDepsModalOpen(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                      title="Cadastrar, editar ou mesclar diretorias oficiais"
                    >
                      ⚙️ Gerenciar Unidades
                    </button>
                  </div>
                  <select 
                    className="form-input" 
                    value={newUnitName || getFirstAvailableUnitSigla(departments, allocations, editingId)}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    style={{ fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }}
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
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Qtd Alocada *</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="1"
                    placeholder="Ex: 50"
                    value={newAllocatedQty}
                    onChange={(e) => setNewAllocatedQty(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ flex: 1, height: '38px', padding: '0 1rem', fontSize: '0.8rem' }}
                    disabled={!editingId && departments.length > 0 && departments.every(d => allocations.some(a => a.unitName.trim().toLowerCase() === d.sigla.trim().toLowerCase()))}
                  >
                    {editingId ? <Check size={14} /> : <Plus size={14} />} {editingId ? 'Salvar' : 'Adicionar'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={handleCancelEdit} className="btn btn-secondary" style={{ height: '38px', padding: '0 0.75rem', borderColor: '#df152a', color: '#df152a' }}>
                      <X size={14} />
                    </button>
                  )}
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
          /* ADESOES / CARONAS EXTERNAS TAB CONTENT (ENDPOINT 5) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 1rem' }}>
            {/* Header / Context Banner */}
            <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                  <Share2 size={16} /> Adesões / Caronas de Órgãos Não Participantes
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>Endpoint 5: 5_consultarAdesoesItem</span>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Art. 86 da Lei 14.133/21</span>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#1e3a8a', margin: 0, lineHeight: 1.5 }}>
                Este painel detalha as solicitações e autorizações de adesão (caronas) formalizadas por órgãos e entidades externas que não integraram inicialmente o processo licitatório. 
                Os limites legais da Lei 14.133/2021 estabelecem teto de até <strong>50%</strong> do quantitativo do item por órgão não participante e <strong>200% (2x)</strong> no total cumulativo da Ata.
              </p>
            </div>

            {/* Stat Cards for Caronas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Órgãos Solicitantes (Caronas)</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {adesoes.length} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>órgãos</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Entidades com carona autorizada/registrada
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Autorizado para Caronas</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>
                    {formatNumber(totalAdesaoRegistrada)}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    de {formatNumber(item.maximoAdesao || (item.quantidadeHomologadaItem * 2))} máx
                  </span>
                </div>
                <div className="progress-track" style={{ height: '5px', marginTop: '0.4rem', background: '#e9ecef' }}>
                  <div className="progress-fill fill-info" style={{ width: `${Math.min((totalAdesaoRegistrada / (item.maximoAdesao || (item.quantidadeHomologadaItem * 2) || 1)) * 100, 100)}%` }}></div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Limite máximo global permitido: {formatNumber(item.maximoAdesao || (item.quantidadeHomologadaItem * 2))} un
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Total Empenhado por Caronas</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatNumber(totalAdesaoEmpenhada)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Consumo: {formatNumber(adesaoConsumidaPercent)}% da cota concedida
                </div>
              </div>

              <div style={{ padding: '1rem 1.25rem', background: '#ffffff', borderRadius: '6px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <span className="meta-label" style={{ fontSize: '0.7rem' }}>Saldo Concedido Não Empenhado</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatNumber(totalAdesaoSaldo || (totalAdesaoRegistrada - totalAdesaoEmpenhada))} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>un</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Equivalente a {formatCurrency((totalAdesaoSaldo || (totalAdesaoRegistrada - totalAdesaoEmpenhada)) * item.valorUnitario)}
                </div>
              </div>
            </div>

            {/* Adesões Data Table */}
            {adesoesLoading ? (
              <div className="spinner-container" style={{ padding: '2rem' }}>
                <div className="spinner spinner-glow"></div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Consultando adesões de carona no Compras.gov.br (Endpoint 5)...</p>
              </div>
            ) : adesoes.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem 1.5rem', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <Share2 size={40} className="empty-state-icon" style={{ opacity: 0.4, color: 'var(--primary)' }} />
                <h4 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Nenhuma Carona Externa Registrada</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto' }}>
                  {adesoesError || `Nenhum órgão não participante solicitou ou teve autorização de adesão registrada para o Item ${item.numeroItem} no módulo oficial do Compras.gov.br.`}
                </p>
              </div>
            ) : (
              <div className="table-container" style={{ marginTop: 0, overflowX: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <table className="custom-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Órgão Não Participante (Carona)</th>
                      <th>Tipo de Vínculo</th>
                      <th>Qtd. Concedida / Registrada</th>
                      <th style={{ width: '220px' }}>Qtd. Empenhada</th>
                      <th>Saldo p/ Empenho</th>
                      <th>Data do Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adesoes.map((ade, idx) => {
                      const empQtd = ade.quantidadeEmpenhada || 0;
                      const regQtd = ade.quantidadeRegistrada || 0;
                      const saldoQtd = ade.saldoEmpenho ?? (regQtd - empQtd);
                      const consPerc = regQtd > 0 ? (empQtd / regQtd) * 100 : 0;

                      return (
                        <tr key={`ade-${ade.unidade}-${idx}`}>
                          <td style={{ fontSize: '0.85rem' }}>
                            <div style={{ fontWeight: 700, color: '#0c326f' }}>
                              {ade.orgaoAdesao || (ade.unidade ? `UASG ${ade.unidade}` : 'Órgão Solicitante')}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {ade.unidade ? `UASG: ${ade.unidade}` : ''}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                              {ade.tipo || 'NÃO PARTICIPANTE (CARONA)'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {formatNumber(regQtd)} un
                          </td>
                          <td>
                            <div className="progress-container">
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatNumber(empQtd)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{formatNumber(consPerc)}%</span>
                              </div>
                              <div className="progress-track" style={{ height: '6px', background: '#e9ecef' }}>
                                <div 
                                  className={`progress-fill ${getProgressColorClass(100 - consPerc)}`}
                                  style={{ width: `${Math.min(consPerc, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: saldoQtd > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                            {formatNumber(saldoQtd)} un
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {ade.dataHoraInclusao ? formatDate(ade.dataHoraInclusao) : ade.dataHoraAtualizacao ? formatDate(ade.dataHoraAtualizacao) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal for detailing contract & empenhos */}
      {selectedEmpenhoDetail && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="glass-card" style={{
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: '#ffffff',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button 
              onClick={() => setSelectedEmpenhoDetail(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            >
              <X size={20} />
            </button>

            {/* Modal Header */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
                  {selectedEmpenhoDetail.tipo}
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                  UASG Beneficiária: {selectedEmpenhoDetail.unidade.match(/^(\d+)/)?.[1]}
                </span>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {selectedEmpenhoDetail.unidade.replace(/^\d+\s*-\s*/, '')}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                Ata n.º {arp.numeroAtaRegistroPreco} | Item {item.numeroItem}
              </p>
            </div>

            {/* Section 1: Balanço de Saldos do SIASG */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ArrowRightLeft size={14} color="var(--primary)" /> Balanço de Saldos (SIASG)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>QUANTIDADE REGISTRADA</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {formatNumber(selectedEmpenhoDetail.quantidadeRegistrada)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>QUANTIDADE EMPENHADA</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--warning)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {formatNumber(selectedEmpenhoDetail.quantidadeEmpenhada)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SALDO P/ EMPENHAR</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: selectedEmpenhoDetail.saldoEmpenho < 0 ? 'var(--danger)' : 'var(--success)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {formatNumber(selectedEmpenhoDetail.saldoEmpenho)}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Contratos & Empenhos Vinculados (PNCP) */}
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Building2 size={14} color="var(--primary)" /> Contratos & Empenhos Publicados no PNCP
              </h4>
              
              {contractsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: '16px', height: '16px' }}></div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Buscando dados no PNCP...</span>
                </div>
              ) : getFilteredContractsForModal(selectedEmpenhoDetail).length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                  Nenhum contrato cadastrado no PNCP para esta UASG nesta Ata.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {getFilteredContractsForModal(selectedEmpenhoDetail).map((c, cidx) => {
                    const contractUrl = getContractPncpUrl(c);
                    const emps = contractEmpenhos[c.numeroContrato] || [];
                    const isLoadingEmps = empenhosLoadingMap[c.numeroContrato];
                    
                    return (
                      <div key={`${c.numeroContrato}-${cidx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                        {/* Contract Header Row */}
                        <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Contrato {c.numeroContrato}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              CNPJ Contratado: {c.niFornecedor?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || '-'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Vigência: {formatDate(c.dataVigenciaInicial)} a {formatDate(c.dataVigenciaFinal)}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--success)' }}>
                              {formatCurrency(c.valorInicial || 0)}
                            </span>
                            {contractUrl && (
                              <a href={contractUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                                PNCP <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Contract Object */}
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '1px solid #f1f5f9', background: '#ffffff', textAlign: 'justify', lineHeight: '1.4' }}>
                          <strong>Objeto:</strong> {c.objeto}
                        </div>

                        {/* Contract Empenhos */}
                        <div style={{ padding: '0.75rem 1rem', background: '#ffffff' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <DollarSign size={11} /> Empenhos deste Contrato
                          </div>
                          
                          {isLoadingEmps ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                              <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                              <span>Carregando empenhos...</span>
                            </div>
                          ) : emps.length === 0 ? (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                              Nenhum empenho publicado para este contrato no PNCP.
                            </div>
                          ) : (
                            <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                  <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>N.º Empenho</th>
                                  <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Data Emissão</th>
                                  <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Valor do Empenho</th>
                                </tr>
                              </thead>
                              <tbody>
                                {emps.map((empItem, eidx) => (
                                  <tr key={`${empItem.numeroEmpenho}-${eidx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{empItem.numeroEmpenho}</td>
                                    <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{formatDate(empItem.dataEmissaoEmpenho)}</td>
                                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontFamily: 'monospace' }}>
                                      {formatCurrency(empItem.valorTotal)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setSelectedEmpenhoDetail(null)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestão Central de Unidades Oficiais */}
      <ManageDepartmentsModal
        isOpen={isManageDepsModalOpen}
        onClose={() => {
          setIsManageDepsModalOpen(false);
          loadDepartments();
          loadAllocations();
        }}
        onDepartmentsUpdated={() => {
          loadDepartments();
          loadAllocations();
        }}
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
      />
    </div>
  );
};

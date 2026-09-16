import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  ArrowLeft, 
  Download, 
  Filter, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  Printer,
  Trash2,
  FileSpreadsheet
} from 'lucide-react';
import { fetchAllAllocationsGlobal, fetchEmpenhoLinks, fetchManualEmpenhos, clearAllAllocations, type GlobalAllocationRecord } from '../services/allocationService';
import { fetchArps, fetchArpItems, fetchEmpenhosSaldoItem, fetchPncpContracts, fetchContratosGovEmpenhos } from '../services/api';
import { fetchArpsFromDb } from '../services/dbCacheService';
import { ManageDepartmentsModal } from './ManageDepartmentsModal';
import { ExportExcelModal } from './modals/ExportExcelModal';
import type { ArpRecord, ArpItemRecord } from '../types';

interface InternalAllocationsDashboardProps {
  onBack: () => void;
  onSelectItem?: (arp: ArpRecord, item: ArpItemRecord) => void;
}

interface EnrichedAllocationItem {
  id: string;
  itemKey: string;
  unitName: string;
  allocatedQty: number;
  empenhadaQty: number;
  saldoQty: number;
  // Enriched data
  arp?: ArpRecord;
  item?: ArpItemRecord;
  unitPrice: number;
  allocatedValue: number;
  empenhadaValue: number;
  saldoValue: number;
  numeroAta: string;
  numeroItem: string;
  descricaoItem: string;
  fornecedorNome: string;
  dataVigenciaFinal?: string;
  isExpired: boolean;
  isExpiringSoon: boolean; // < 90 dias
}

function parseItemKey(key: string): { numeroAta: string; uasg: string; itemNum: string } {
  const parts = key.split('-');
  if (parts.length >= 3) {
    const itemNum = parts.pop()!;
    const uasg = parts.pop()!;
    const numeroAta = parts.join('-');
    return { numeroAta, uasg, itemNum };
  }
  const itemNum = parts[parts.length - 1] || '1';
  const numeroAta = parts[0] || '';
  return { numeroAta, uasg: '200331', itemNum };
}

export const InternalAllocationsDashboard: React.FC<InternalAllocationsDashboardProps> = ({
  onBack,
  onSelectItem
}) => {
  const [allocations, setAllocations] = useState<GlobalAllocationRecord[]>([]);
  const [arps, setArps] = useState<ArpRecord[]>([]);
  const [itemsByAta, setItemsByAta] = useState<Record<string, ArpItemRecord[]>>({});
  const [empenhosByItem, setEmpenhosByItem] = useState<Record<string, { links: Record<string, string>; empenhos: any[] }>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros
  const [selectedUnit, setSelectedUnit] = useState<string>('TODAS');
  const [filterVigencia, setFilterVigencia] = useState<'TODAS' | 'VIGENTE' | 'ALERTAS' | 'EXPIRADA'>('TODAS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedAtas, setExpandedAtas] = useState<Record<string, boolean>>({});
  const [isManageDepsModalOpen, setIsManageDepsModalOpen] = useState<boolean>(false);
  const [isExportExcelModalOpen, setIsExportExcelModalOpen] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Carrega todas as alocações salvas (Supabase + localStorage)
      const globalAllocations = await fetchAllAllocationsGlobal();
      setAllocations(globalAllocations);

      if (globalAllocations.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Identifica todas as Atas únicas referenciadas nas alocações
      const atasToFetch = new Map<string, { numeroAta: string; uasg: string }>();
      globalAllocations.forEach(alloc => {
        const { numeroAta, uasg } = parseItemKey(alloc.itemKey);
        if (numeroAta) {
          atasToFetch.set(`${numeroAta}-${uasg}`, { numeroAta, uasg });
        }
      });

      const loadedArps: ArpRecord[] = [];
      const loadedItemsMap: Record<string, ArpItemRecord[]> = {};
      const loadedEmpenhosMap: Record<string, { links: Record<string, string>; empenhos: any[] }> = {};

      // 3. Busca direcionada para cada Ata identificada
      await Promise.all(
        Array.from(atasToFetch.values()).map(async ({ numeroAta, uasg }) => {
          let foundArp: ArpRecord | undefined;
          
          // Extrai o ano da Ata (ex: "00037/2026" -> 2026)
          const ataYearParts = numeroAta.split('/');
          const ataYear = ataYearParts.length === 2 ? parseInt(ataYearParts[1], 10) : new Date().getFullYear();
          const startYear = isNaN(ataYear) ? 2024 : ataYear - 1;
          const endYear = isNaN(ataYear) ? 2028 : ataYear + 1;

          // 1. Primeiro verifica no cache do Supabase / local
          const cached = await fetchArpsFromDb(uasg, numeroAta);
          foundArp = cached.arps.find(a => 
            a.numeroAtaRegistroPreco === numeroAta || 
            a.numeroAtaRegistroPreco.includes(numeroAta) ||
            numeroAta.includes(a.numeroAtaRegistroPreco)
          );

          // 2. Se não estiver em cache, consulta a ARP na API com janela precisa de datas (1 requisição rápida)
          if (!foundArp) {
            try {
              const arpRes = await fetchArps({
                numeroAtaRegistroPreco: numeroAta,
                codigoUnidadeGerenciadora: uasg,
                dataVigenciaInicialMin: `${startYear}-01-01`,
                dataVigenciaInicialMax: `${endYear}-12-31`
              });
              foundArp = (arpRes.resultado || []).find(a => 
                a.numeroAtaRegistroPreco === numeroAta || 
                a.numeroAtaRegistroPreco.includes(numeroAta) ||
                numeroAta.includes(a.numeroAtaRegistroPreco)
              );
            } catch (e) {
              console.warn(`Erro ao buscar Ata ${numeroAta} na API:`, e);
            }
          }

          // 3. Consulta os itens da Ata (via fetchArpItems testando anos prováveis)
          const ataKey = `${numeroAta}-${uasg}`;
          let loadedItems: ArpItemRecord[] = [];

          const vigenciaTestDates = foundArp?.dataVigenciaInicial 
            ? [foundArp.dataVigenciaInicial] 
            : [`${ataYear}-01-01`, `${startYear}-01-01`, `${endYear}-01-01`];

          for (const testDate of vigenciaTestDates) {
            try {
              const itemsRes = await fetchArpItems(testDate, uasg, numeroAta);
              if (itemsRes.resultado && itemsRes.resultado.length > 0) {
                loadedItems = itemsRes.resultado;
                break;
              }
            } catch {}
          }

          // Se encontrou itens mas não tinha ARP cadastrada na consulta geral, reconstrói o ARP
          if (!foundArp && loadedItems.length > 0) {
            const firstItem = loadedItems[0];
            foundArp = {
              numeroAtaRegistroPreco: numeroAta,
              codigoUnidadeGerenciadora: uasg,
              nomeUnidadeGerenciadora: firstItem.nomeRazaoSocialFornecedor || 'SENASP',
              codigoOrgao: 0,
              nomeOrgao: 'Ministério da Justiça e Segurança Pública',
              numeroCompra: '',
              anoCompra: String(ataYear),
              codigoModalidadeCompra: '05',
              nomeModalidadeCompra: 'Pregão',
              dataAssinatura: firstItem.dataVigenciaInicial || `${ataYear}-01-01`,
              dataVigenciaInicial: firstItem.dataVigenciaInicial || `${ataYear}-01-01`,
              dataVigenciaFinal: firstItem.dataVigenciaFinal || `${ataYear + 1}-12-31`,
              valorTotal: loadedItems.reduce((s, i) => s + (i.valorTotal || 0), 0),
              statusAta: 'Ata de Registro de Preços',
              objeto: firstItem.descricaoItem || '',
              quantidadeItens: loadedItems.length,
              dataHoraAtualizacao: new Date().toISOString(),
              dataHoraInclusao: new Date().toISOString(),
              dataHoraExclusao: null,
              ataExcluido: false,
              numeroControlePncpAta: '',
              numeroControlePncpCompra: '',
              idCompra: ''
            };
          }

          if (foundArp) {
            loadedArps.push(foundArp);
          }

          if (loadedItems.length > 0) {
            loadedItemsMap[ataKey] = loadedItems;
            loadedItemsMap[`${numeroAta}`] = loadedItems;

            // Busca todos os empenhos da Ata (SIASG e Contratos.gov/PNCP)
            let ataEmpenhos: any[] = [];
            try {
              const empRes = await fetchEmpenhosSaldoItem(numeroAta, uasg);
              ataEmpenhos = empRes.resultado || [];
            } catch {}

            let govEmpenhosList: any[] = [];
            try {
              const cnpj = (uasg === '200331' || uasg === '200330') ? '00394494000136' : '';
              const contracts = await fetchPncpContracts(cnpj, String(ataYear), foundArp?.numeroCompra || '1', '', '', {
                codigoOrgao: foundArp?.codigoOrgao,
                codigoUnidadeGestora: uasg,
                idCompra: foundArp?.idCompra,
                numeroCompra: foundArp?.numeroCompra,
                anoCompra: foundArp?.anoCompra
              });

              for (const c of contracts) {
                if (c.contratoId) {
                  try {
                    const rawGovEmps = await fetchContratosGovEmpenhos(c.contratoId);
                    if (rawGovEmps && rawGovEmps.length > 0) {
                      rawGovEmps.forEach((ge: any) => {
                        const rawVal = typeof ge.empenhado === 'number' ? ge.empenhado : parseFloat(String(ge.empenhado || '0').replace(/\./g, '').replace(',', '.'));
                        govEmpenhosList.push({
                          numeroEmpenho: ge.numero,
                          numero: ge.numero,
                          quantidadeEmpenhada: ge.quantidadeFisicaOriginal || 0,
                          quantidade: ge.quantidadeFisicaOriginal || 0,
                          valorEmpenhado: !isNaN(rawVal) && rawVal > 0 ? rawVal : 0,
                          valorTotal: !isNaN(rawVal) && rawVal > 0 ? rawVal : 0,
                          fornecedor: ge.credor,
                          uasg: ge.unidade_gestora || uasg
                        });
                      });
                    }
                  } catch {}
                }
              }
            } catch {}

            // Para cada item da Ata, consulta links de empenhos e filtra empenhos do item
            await Promise.all(
              loadedItems.map(async (itm) => {
                const cleanItmNum = parseInt(itm.numeroItem || '1', 10).toString();
                const paddedItmNum = (itm.numeroItem || '1').toString().padStart(5, '0');
                const itemKey = `${numeroAta}-${uasg}-${itm.numeroItem}`;
                const links = await fetchEmpenhoLinks(itemKey);
                let manualEmps: any[] = [];
                try {
                  manualEmps = await fetchManualEmpenhos(itemKey);
                } catch {}
                
                const itemEmpenhos = [
                  ...ataEmpenhos.filter(e => parseInt(e.numeroItem || '1', 10).toString() === cleanItmNum),
                  ...manualEmps.map(me => ({
                    numeroEmpenho: me.numero,
                    numero: me.numero,
                    quantidadeEmpenhada: me.quantidade,
                    quantidade: me.quantidade,
                    valorEmpenhado: me.valorTotal || (me.quantidade * (me.valorUnitario || itm.valorUnitario || 0)),
                    valorTotal: me.valorTotal || (me.quantidade * (me.valorUnitario || itm.valorUnitario || 0)),
                    fornecedor: me.fornecedor,
                    uasg: me.uasg
                  })),
                  ...govEmpenhosList
                ];

                loadedEmpenhosMap[itemKey] = { links, empenhos: itemEmpenhos };
                loadedEmpenhosMap[`${numeroAta}-${uasg}-${cleanItmNum}`] = { links, empenhos: itemEmpenhos };
                loadedEmpenhosMap[`${numeroAta}-${uasg}-${paddedItmNum}`] = { links, empenhos: itemEmpenhos };
                loadedEmpenhosMap[`${numeroAta}-${cleanItmNum}`] = { links, empenhos: itemEmpenhos };
              })
            );
          }
        })
      );

      setArps(loadedArps);
      setItemsByAta(loadedItemsMap);
      setEmpenhosByItem(loadedEmpenhosMap);
    } catch (e) {
      console.warn('Erro ao carregar dados do painel de unidades:', e);
    } finally {
      setLoading(false);
    }
  };

  // Lista única de Unidades Internas cadastradas
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    allocations.forEach(a => {
      if (a.unitName) set.add(a.unitName);
    });
    return Array.from(set).sort();
  }, [allocations]);

  // Cruzamento e enriquecimento dos dados
  const enrichedItems: EnrichedAllocationItem[] = useMemo(() => {
    const today = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(today.getDate() + 90);

    // Mapa de itens para lookup rápido com suporte a variações de padding de número do item
    const itemsLookup = new Map<string, { arp: ArpRecord; item: ArpItemRecord }>();
    for (const arp of arps) {
      const uasg = arp.codigoUnidadeGerenciadora || '200331';
      const ataNum = arp.numeroAtaRegistroPreco;
      const ataKey = `${ataNum}-${uasg}`;
      const items = itemsByAta[ataKey] || [];

      items.forEach(item => {
        const itemNumClean = parseInt(item.numeroItem || '1', 10).toString();
        const itemNumPadded = (item.numeroItem || '1').toString().padStart(5, '0');

        // Permutações de chave
        itemsLookup.set(`${ataNum}-${uasg}-${itemNumClean}`, { arp, item });
        itemsLookup.set(`${ataNum}-${uasg}-${itemNumPadded}`, { arp, item });
        itemsLookup.set(`${ataNum}-${itemNumClean}`, { arp, item });
        itemsLookup.set(`${ataNum}-${itemNumPadded}`, { arp, item });
        itemsLookup.set(`${ataNum.replace(/^0+/, '')}-${uasg}-${itemNumClean}`, { arp, item });
      });
    }

    return allocations.map(alloc => {
      const { numeroAta, uasg, itemNum } = parseItemKey(alloc.itemKey);
      const cleanItemNum = parseInt(itemNum || '1', 10).toString();
      const paddedItemNum = (itemNum || '1').toString().padStart(5, '0');

      // Tenta encontrar o item nas permutações
      const match = itemsLookup.get(alloc.itemKey) ||
                    itemsLookup.get(`${numeroAta}-${uasg}-${cleanItemNum}`) ||
                    itemsLookup.get(`${numeroAta}-${uasg}-${paddedItemNum}`) ||
                    itemsLookup.get(`${numeroAta}-${cleanItemNum}`) ||
                    itemsLookup.get(`${numeroAta}-${paddedItemNum}`);

      const arp = match?.arp;
      const item = match?.item;

      const unitPrice = item?.valorUnitario || 0;

      // Calcula a quantidade e o valor empenhados reais a partir dos links de empenho daquele item
      let calculatedEmpenhadaQty = 0;
      let calculatedEmpenhadaValue = 0;
      const itemEmpData = empenhosByItem[alloc.itemKey] || 
                          empenhosByItem[`${numeroAta}-${uasg}-${cleanItemNum}`] ||
                          empenhosByItem[`${numeroAta}-${uasg}-${paddedItemNum}`];
      
      if (itemEmpData && itemEmpData.empenhos && itemEmpData.empenhos.length > 0 && itemEmpData.links && Object.keys(itemEmpData.links).length > 0) {
        const seenEmpNos = new Set<string>();
        itemEmpData.empenhos.forEach((emp: any) => {
          const empNo = emp.numeroEmpenho || emp.numero;
          if (empNo && !seenEmpNos.has(empNo)) {
            if (itemEmpData.links[empNo] === alloc.id || emp.unidadeInternaId === alloc.id) {
              seenEmpNos.add(empNo);
              const q = Number(emp.quantidadeEmpenhada || emp.quantidade || 0);
              const v = Number(emp.valorEmpenhado || emp.valorTotal || 0);
              calculatedEmpenhadaQty += q;
              calculatedEmpenhadaValue += v > 0 ? v : (q * (emp.valorUnitario || unitPrice));
            }
          }
        });
      }

      // Fallback para alloc.empenhadaQty se não houver empenhos específicos vinculados
      if (calculatedEmpenhadaQty === 0 && alloc.empenhadaQty && alloc.empenhadaQty > 0) {
        calculatedEmpenhadaQty = alloc.empenhadaQty;
        calculatedEmpenhadaValue = alloc.empenhadaQty * unitPrice;
      }

      const saldoQty = Math.max(0, alloc.allocatedQty - calculatedEmpenhadaQty);
      const saldoValue = saldoQty * unitPrice;
      const empenhadaValue = calculatedEmpenhadaValue;
      const allocatedValue = empenhadaValue + saldoValue;

      const vigenciaFinalDate = arp?.dataVigenciaFinal ? new Date(arp.dataVigenciaFinal) : undefined;
      const isExpired = vigenciaFinalDate ? vigenciaFinalDate < today : false;
      const isExpiringSoon = vigenciaFinalDate ? (vigenciaFinalDate >= today && vigenciaFinalDate <= ninetyDaysFromNow) : false;

      const displayNumeroAta = arp?.numeroAtaRegistroPreco || numeroAta;
      const displayNumeroItem = item?.numeroItem || paddedItemNum;
      const descricaoItem = item?.descricaoItem || 'Item de Registro de Preços';
      const fornecedorNome = item?.nomeRazaoSocialFornecedor || arp?.nomeUnidadeGerenciadora || 'Fornecedor da Ata';

      return {
        id: alloc.id,
        itemKey: alloc.itemKey,
        unitName: alloc.unitName,
        allocatedQty: alloc.allocatedQty,
        empenhadaQty: calculatedEmpenhadaQty,
        saldoQty,
        arp,
        item,
        unitPrice,
        allocatedValue,
        empenhadaValue,
        saldoValue,
        numeroAta: displayNumeroAta,
        numeroItem: displayNumeroItem,
        descricaoItem,
        fornecedorNome,
        dataVigenciaFinal: arp?.dataVigenciaFinal,
        isExpired,
        isExpiringSoon
      };
    });
  }, [allocations, arps, itemsByAta, empenhosByItem]);

  // Filtragem dos itens
  const filteredItems = useMemo(() => {
    return enrichedItems.filter(item => {
      // 1. Filtro por Unidade
      if (selectedUnit !== 'TODAS' && item.unitName !== selectedUnit) {
        return false;
      }

      // 2. Filtro por Vigência
      if (filterVigencia === 'VIGENTE' && item.isExpired) return false;
      if (filterVigencia === 'EXPIRADA' && !item.isExpired) return false;
      if (filterVigencia === 'ALERTAS' && !item.isExpiringSoon) return false;

      // 3. Filtro por Busca de Texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchAta = item.numeroAta.toLowerCase().includes(term);
        const matchDesc = item.descricaoItem.toLowerCase().includes(term);
        const matchForn = item.fornecedorNome.toLowerCase().includes(term);
        const matchUnit = item.unitName.toLowerCase().includes(term);
        if (!matchAta && !matchDesc && !matchForn && !matchUnit) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedItems, selectedUnit, filterVigencia, searchTerm]);

  // Agrupamento dos itens por ATA
  const groupedByAta = useMemo(() => {
    const map = new Map<string, {
      numeroAta: string;
      arp?: ArpRecord;
      fornecedorNome: string;
      dataVigenciaFinal?: string;
      isExpired: boolean;
      isExpiringSoon: boolean;
      totalAllocatedValue: number;
      totalEmpenhadaValue: number;
      totalSaldoValue: number;
      totalAllocatedQty: number;
      totalSaldoQty: number;
      items: EnrichedAllocationItem[];
    }>();

    filteredItems.forEach(i => {
      const key = i.numeroAta;
      if (!map.has(key)) {
        map.set(key, {
          numeroAta: i.numeroAta,
          arp: i.arp,
          fornecedorNome: i.fornecedorNome,
          dataVigenciaFinal: i.dataVigenciaFinal,
          isExpired: i.isExpired,
          isExpiringSoon: i.isExpiringSoon,
          totalAllocatedValue: 0,
          totalEmpenhadaValue: 0,
          totalSaldoValue: 0,
          totalAllocatedQty: 0,
          totalSaldoQty: 0,
          items: []
        });
      }

      const entry = map.get(key)!;
      entry.totalAllocatedValue += i.allocatedValue;
      entry.totalEmpenhadaValue += i.empenhadaValue;
      entry.totalSaldoValue += i.saldoValue;
      entry.totalAllocatedQty += i.allocatedQty;
      entry.totalSaldoQty += i.saldoQty;
      entry.items.push(i);
    });

    return Array.from(map.values()).sort((a, b) => b.totalSaldoValue - a.totalSaldoValue);
  }, [filteredItems]);

  // KPIs da visualização atual
  const summaryKpis = useMemo(() => {
    let totalAllocatedValue = 0;
    let totalEmpenhadaValue = 0;
    let totalSaldoValue = 0;
    let totalAllocatedQty = 0;
    let totalSaldoQty = 0;
    const uniqueAtas = new Set<string>();
    const uniqueItems = new Set<string>();

    filteredItems.forEach(i => {
      totalAllocatedValue += i.allocatedValue;
      totalEmpenhadaValue += i.empenhadaValue;
      totalSaldoValue += i.saldoValue;
      totalAllocatedQty += i.allocatedQty;
      totalSaldoQty += i.saldoQty;
      uniqueAtas.add(i.numeroAta);
      uniqueItems.add(`${i.numeroAta}-${i.numeroItem}`);
    });

    const percentAvailable = totalAllocatedQty > 0 
      ? Math.round((totalSaldoQty / totalAllocatedQty) * 100) 
      : 100;

    return {
      totalAllocatedValue,
      totalEmpenhadaValue,
      totalSaldoValue,
      totalAllocatedQty,
      totalSaldoQty,
      percentAvailable,
      atasCount: uniqueAtas.size,
      itemsCount: uniqueItems.size
    };
  }, [filteredItems]);

  const toggleAtaExpand = (ataKey: string) => {
    setExpandedAtas(prev => ({
      ...prev,
      [ataKey]: prev[ataKey] === undefined ? false : !prev[ataKey]
    }));
  };

  const handleExportCsv = () => {
    const headers = ['Unidade Interna', 'Numero Ata', 'Numero Item', 'Descricao', 'Fornecedor', 'Valor Unitario', 'Qtd Alocada', 'Qtd Empenhada', 'Saldo Qtd', 'Saldo Financeiro (R$)', 'Vigencia Final'];
    const rows = filteredItems.map(i => [
      `"${i.unitName}"`,
      `"${i.numeroAta}"`,
      `"${i.numeroItem}"`,
      `"${i.descricaoItem.replace(/"/g, '""')}"`,
      `"${i.fornecedorNome.replace(/"/g, '""')}"`,
      `"${i.unitPrice.toFixed(2)}"`,
      i.allocatedQty,
      i.empenhadaQty,
      i.saldoQty,
      `"${i.saldoValue.toFixed(2)}"`,
      `"${i.dataVigenciaFinal || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `saldos_unidades_internas_${selectedUnit.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('pt-BR').format(val);
  };

  const handleClearAllAllocations = async () => {
    if (window.confirm('⚠️ ATENÇÃO: Tem certeza que deseja ZERAR todas as alocações internas e vínculos de empenhos de todas as atas? Esta ação removerá todas as cotas cadastradas.')) {
      await clearAllAllocations();
      await loadData();
      alert('Todas as alocações internas foram zeradas com sucesso!');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Header & Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button 
            type="button" 
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', fontSize: '0.82rem', marginBottom: '0.75rem' }}
          >
            <ArrowLeft size={15} /> Voltar para Visão Geral de Atas
          </button>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Painel Executivo de Unidades Internas
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem', marginBottom: 0 }}>
            Gestão consolidada de cotas reservadas, saldo remanescente e execução orçamentária por Diretoria / Coordenação
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            onClick={handleClearAllAllocations} 
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#dc2626', borderColor: '#fca5a5' }}
            title="Zerar todas as cotas alocadas de todas as atas"
          >
            <Trash2 size={16} /> Zerar Alocações
          </button>
          <button 
            type="button" 
            onClick={() => setIsManageDepsModalOpen(true)} 
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            title="Gerenciar e cadastrar diretorias oficiais ou mesclar nomes com erro de digitação"
          >
            <Building2 size={16} /> Gerenciar Unidades
          </button>
          <button 
            type="button" 
            onClick={() => window.print()} 
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <Printer size={16} /> Imprimir
          </button>
          <button 
            type="button" 
            onClick={() => setIsExportExcelModalOpen(true)} 
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', background: '#0c326f' }}
            title="Exportar dados de cotas e alocações para planilha Excel parametrizável"
          >
            <FileSpreadsheet size={16} color="#00cc55" /> Exportar Excel (.xlsx)
          </button>
          <button 
            type="button" 
            onClick={handleExportCsv} 
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <section className="kpi-grid">
        {/* KPI 1: Saldo Disponível em Reais */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--success)' }}>
          <div className="kpi-header success">
            <DollarSign size={16} /> Saldo Disponível (R$)
          </div>
          <div className="kpi-value" style={{ color: 'var(--success-text)' }}>
            {formatCurrency(summaryKpis.totalSaldoValue)}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Qtd em Saldo:</strong>
              <div className="kpi-footer-val">{formatNumber(summaryKpis.totalSaldoQty)} un</div>
            </div>
            <div>
              <strong>Disponibilidade:</strong>
              <div className="kpi-footer-val" style={{ color: 'var(--success)' }}>{summaryKpis.percentAvailable}% livre</div>
            </div>
          </div>
        </div>

        {/* KPI 2: Total Reservado / Alocado */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--primary)' }}>
          <div className="kpi-header primary">
            <Layers size={16} /> Total Alocado (Cota)
          </div>
          <div className="kpi-value">
            {formatCurrency(summaryKpis.totalAllocatedValue)}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Total Itens (Qtd):</strong>
              <div className="kpi-footer-val">{formatNumber(summaryKpis.totalAllocatedQty)} un</div>
            </div>
            <div>
              <strong>Itens Distintos:</strong>
              <div className="kpi-footer-val">{summaryKpis.itemsCount} itens</div>
            </div>
          </div>
        </div>

        {/* KPI 3: Total já Empenhado */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--warning)' }}>
          <div className="kpi-header warning">
            <TrendingUp size={16} /> Total Empenhado (Consumo)
          </div>
          <div className="kpi-value">
            {formatCurrency(summaryKpis.totalEmpenhadaValue)}
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Qtd Empenhada:</strong>
              <div className="kpi-footer-val">{formatNumber(summaryKpis.totalAllocatedQty - summaryKpis.totalSaldoQty)} un</div>
            </div>
            <div>
              <strong>Taxa de Consumo:</strong>
              <div className="kpi-footer-val">{100 - summaryKpis.percentAvailable}% utilizado</div>
            </div>
          </div>
        </div>

        {/* KPI 4: Atas Vinculadas */}
        <div className="kpi-card" style={{ borderTop: '4px solid var(--primary-hover)' }}>
          <div className="kpi-header primary">
            <Building2 size={16} /> Atas com Alocação
          </div>
          <div className="kpi-value">
            {summaryKpis.atasCount} <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Atas</span>
          </div>
          <div className="kpi-footer">
            <div>
              <strong>Unidade em Foco:</strong>
              <div className="kpi-footer-val" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedUnit}>
                {selectedUnit === 'TODAS' ? 'Todas as Unidades' : selectedUnit}
              </div>
            </div>
            <div>
              <strong>Status:</strong>
              <div className="kpi-footer-val" style={{ color: 'var(--success)' }}>Ativo</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Selection Section */}
      <section className="comprassusp-filter-card" style={{ gap: '1rem' }}>
        <div className="filter-header">
          <h2 className="section-title" style={{ fontSize: '1.15rem', margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <Filter size={18} color="var(--primary)" /> Filtros de Visualização por Unidade Interna
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Exibindo {filteredItems.length} {filteredItems.length === 1 ? 'item alocado' : 'itens alocados'} em {groupedByAta.length} Atas
          </span>
        </div>

        <div className="form-grid">
          {/* Seletor de Unidade */}
          <div className="form-group">
            <label className="form-label">
              <Building2 size={14} /> Diretoria / Unidade Interna
            </label>
            <select
              className="form-input"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{ fontWeight: 700, color: 'var(--primary)' }}
            >
              <option value="TODAS">🏢 Todas as Unidades ({availableUnits.length} Diretorias)</option>
              {availableUnits.map(u => (
                <option key={u} value={u}>📍 {u}</option>
              ))}
            </select>
          </div>

          {/* Filtro de Vigência */}
          <div className="form-group">
            <label className="form-label">
              <Calendar size={14} /> Vigência da Ata
            </label>
            <select
              className="form-input"
              value={filterVigencia}
              onChange={(e) => setFilterVigencia(e.target.value as any)}
              style={{ fontWeight: 600 }}
            >
              <option value="TODAS">Todas as Atas</option>
              <option value="VIGENTE">Somente Atas Vigentes</option>
              <option value="ALERTAS">⚠️ Vencendo em Breve (&lt; 90 dias)</option>
              <option value="EXPIRADA">Atas Expiradas</option>
            </select>
          </div>

          {/* Busca Textual */}
          <div className="form-group">
            <label className="form-label">
              <Search size={14} /> Pesquisar Item ou Ata
            </label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Ex: Sonar, 00038/2026, Ultramar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Main Results Table / Cards */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando dados das alocações e Atas...</p>
          </div>
        ) : groupedByAta.length === 0 ? (
          <div className="empty-state">
            <Layers size={40} className="empty-state-icon" />
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>Nenhuma alocação encontrada para os filtros selecionados</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '500px' }}>
              Para alocar saldos para diretorias internas, acesse qualquer Ata na tela inicial, clique no item desejado e acesse a aba <strong>"Alocação Interna (UG)"</strong>.
            </p>
          </div>
        ) : (
          groupedByAta.map(group => {
            const isExpanded = expandedAtas[group.numeroAta] !== false; // Default expanded
            return (
              <article key={group.numeroAta} className="ata-card" style={{ padding: 0 }}>
                {/* Header do Card da Ata */}
                <header 
                  className="ata-card-header" 
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleAtaExpand(group.numeroAta)}
                >
                  <div className="ata-card-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <h3 className="ata-card-number" style={{ fontSize: '1.15rem' }}>
                        ATA {group.numeroAta.replace(/^ATA\s+/i, '')}
                      </h3>
                      
                      {group.isExpired ? (
                        <span className="badge danger">
                          <AlertTriangle size={12} /> Expirada
                        </span>
                      ) : group.isExpiringSoon ? (
                        <span className="badge warning">
                          <Clock size={12} /> Vence em &lt; 90 dias
                        </span>
                      ) : (
                        <span className="badge success">
                          <CheckCircle2 size={12} /> Vigente
                        </span>
                      )}

                      {group.dataVigenciaFinal && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Vigência até: <strong>{new Date(group.dataVigenciaFinal).toLocaleDateString('pt-BR')}</strong>
                        </span>
                      )}
                    </div>

                    <p className="ata-card-supplier" style={{ marginTop: '0.2rem' }}>
                      Fornecedor: <strong>{group.fornecedorNome}</strong>
                    </p>
                  </div>

                  <div className="ata-card-header-right" style={{ gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Saldo da Unidade
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--success-text)', fontFamily: 'monospace' }}>
                        {formatCurrency(group.totalSaldoValue)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {formatNumber(group.totalSaldoQty)} un disponíveis
                      </div>
                    </div>

                    <button 
                      type="button" 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      aria-label={isExpanded ? 'Recolher Ata' : 'Expandir Ata'}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </header>

                {/* Tabela de Itens Alocados */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
                    <table className="custom-table" style={{ margin: 0, border: 'none' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ width: '80px', padding: '0.75rem 1rem' }}>ITEM</th>
                          <th style={{ padding: '0.75rem 1rem' }}>DESCRIÇÃO DO MATERIAL / SERVIÇO</th>
                          <th style={{ width: '180px', padding: '0.75rem 1rem' }}>UNIDADE INTERNA</th>
                          <th style={{ width: '130px', textAlign: 'right', padding: '0.75rem 1rem' }}>VALOR UNIT.</th>
                          <th style={{ width: '100px', textAlign: 'center', padding: '0.75rem 1rem' }}>COTA</th>
                          <th style={{ width: '100px', textAlign: 'center', padding: '0.75rem 1rem' }}>EMPENHADO</th>
                          <th style={{ width: '100px', textAlign: 'center', padding: '0.75rem 1rem' }}>SALDO (UN)</th>
                          <th style={{ width: '150px', textAlign: 'right', padding: '0.75rem 1rem' }}>SALDO (R$)</th>
                          <th style={{ width: '120px', textAlign: 'center', padding: '0.75rem 1rem' }}>AÇÃO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((i, idx) => (
                          <tr key={`${i.id}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                              #{String(i.numeroItem).padStart(5, '0')}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>
                                {i.descricaoItem}
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className="badge primary" style={{ fontSize: '0.72rem' }}>
                                {i.unitName}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem' }}>
                              {i.unitPrice > 0 ? formatCurrency(i.unitPrice) : '—'}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                              {formatNumber(i.allocatedQty)}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: i.empenhadaQty > 0 ? 'var(--warning-text)' : 'var(--text-muted)', fontWeight: 600 }}>
                              {formatNumber(i.empenhadaQty)}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800, color: i.saldoQty > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                              {formatNumber(i.saldoQty)}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--success-text)' }}>
                              {i.saldoValue > 0 ? formatCurrency(i.saldoValue) : 'R$ 0,00'}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                              {i.arp && i.item && onSelectItem ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectItem(i.arp!, i.item!)}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                  title="Abrir detalhamento completo do item e empenhos"
                                >
                                  Ver Item <ExternalLink size={12} />
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* Modal de Gestão Central de Unidades Oficiais */}
      <ManageDepartmentsModal
        isOpen={isManageDepsModalOpen}
        onClose={() => {
          setIsManageDepsModalOpen(false);
          loadData();
        }}
        onDepartmentsUpdated={() => {
          loadData();
        }}
      />

      <ExportExcelModal
        isOpen={isExportExcelModalOpen}
        onClose={() => setIsExportExcelModalOpen(false)}
        atas={arps}
        itemsByAta={itemsByAta}
        defaultGranularity="BY_ALLOCATION"
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchAllAllocationsGlobal, fetchEmpenhoLinks, fetchManualEmpenhos, type GlobalAllocationRecord } from '../services/allocationService';
import { fetchArps, fetchArpItems, fetchEmpenhosSaldoItem } from '../services/api';
import { fetchArpsFromDb } from '../services/dbCacheService';
import { ExportExcelModal } from './modals/ExportExcelModal';
import { InternalUnitsModal } from './modals/InternalUnitsModal';
import { AllocationsPortfolioHeader } from './atas/allocations/AllocationsPortfolioHeader';
import { AllocationsPortfolioSummary } from './atas/allocations/AllocationsPortfolioSummary';
import { AllocationsPortfolioFilters, type AllocationsPortfolioFilterState } from './atas/allocations/AllocationsPortfolioFilters';
import { AllocationsPortfolioContent, type EnrichedAllocationRow } from './atas/allocations/AllocationsPortfolioContent';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import type { ArpRecord, ArpItemRecord } from '../types';

interface InternalAllocationsDashboardProps {
  onSelectItem?: (arp: ArpRecord, item: ArpItemRecord) => void;
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
  onSelectItem
}) => {
  const [allocations, setAllocations] = useState<GlobalAllocationRecord[]>([]);
  const [arps, setArps] = useState<ArpRecord[]>([]);
  const [itemsByAta, setItemsByAta] = useState<Record<string, ArpItemRecord[]>>({});
  const [empenhosByItem, setEmpenhosByItem] = useState<Record<string, { links: Record<string, string>; empenhos: any[] }>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros
  const [filterState, setFilterState] = useState<AllocationsPortfolioFilterState>({
    unit: 'TODAS',
    vigencia: 'TODAS',
    search: ''
  });

  const [isExportExcelModalOpen, setIsExportExcelModalOpen] = useState<boolean>(false);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Carrega todas as alocações salvas
      const globalAllocations = await fetchAllAllocationsGlobal();
      setAllocations(globalAllocations);

      if (globalAllocations.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Extrai as Atas referenciadas
      const uniqueAtaKeys = new Set<string>();
      const itemKeys = new Set<string>();

      globalAllocations.forEach(a => {
        itemKeys.add(a.itemKey);
        const { numeroAta, uasg } = parseItemKey(a.itemKey);
        if (numeroAta) {
          uniqueAtaKeys.add(`${numeroAta}-${uasg}`);
        }
      });

      // 3. Busca metadados das Atas do DB local com fallback API
      let loadedArps: ArpRecord[] = [];
      try {
        const dbResult = await fetchArpsFromDb('200331');
        if (dbResult.arps && dbResult.arps.length > 0) {
          loadedArps = dbResult.arps;
        }
      } catch (e) {
        console.warn('Erro ao carregar atas do cache:', e);
      }

      if (loadedArps.length === 0) {
        try {
          const apiRes = await fetchArps({
            dataVigenciaInicialMin: '2024-01-01',
            dataVigenciaInicialMax: '2028-08-21',
            codigoUnidadeGerenciadora: '200331',
            numeroAtaRegistroPreco: ''
          });
          loadedArps = apiRes.resultado || [];
        } catch (e) {
          console.warn('Erro ao buscar atas da API:', e);
        }
      }

      setArps(loadedArps);

      // 4. Busca os itens de cada Ata
      const itemsMap: Record<string, ArpItemRecord[]> = {};
      await Promise.all(
        Array.from(uniqueAtaKeys).map(async (key) => {
          const parts = key.split('-');
          const uasg = parts.pop() || '200331';
          const numeroAta = parts.join('-');
          const targetArp = loadedArps.find(a => a.numeroAtaRegistroPreco === numeroAta);

          try {
            const data = await fetchArpItems(
              targetArp?.dataVigenciaInicial || '2024-01-01',
              uasg,
              numeroAta,
              targetArp
            );
            if (data && data.resultado) {
              itemsMap[key] = data.resultado;
            }
          } catch (e) {
            console.warn(`Erro ao carregar itens da Ata ${numeroAta}:`, e);
          }
        })
      );
      setItemsByAta(itemsMap);

      // 5. Para cada item com alocação, busca os empenhos e links de unidade
      const empsMap: Record<string, { links: Record<string, string>; empenhos: any[] }> = {};
      await Promise.all(
        Array.from(itemKeys).map(async (key) => {
          const { numeroAta, uasg } = parseItemKey(key);
          try {
            const [links, manualEmps, officialEmps] = await Promise.all([
              fetchEmpenhoLinks(key),
              fetchManualEmpenhos(key),
              fetchEmpenhosSaldoItem(numeroAta, uasg).catch(() => ({ resultado: [] }))
            ]);

            const allEmps: any[] = [...(officialEmps?.resultado || [])];

            manualEmps.forEach(m => {
              allEmps.push({
                numero: m.numero,
                empenhado: m.quantidade,
                isManual: true
              });
            });

            empsMap[key] = { links, empenhos: allEmps };
          } catch (e) {
            console.warn(`Erro ao carregar empenhos do item ${key}:`, e);
          }
        })
      );
      setEmpenhosByItem(empsMap);
    } catch (err) {
      console.error('Falha geral ao carregar alocações:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Enriquecimento completo das alocações
  const enrichedItems = useMemo<EnrichedAllocationRow[]>(() => {
    const today = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(today.getDate() + 90);

    return allocations.map(alloc => {
      const { numeroAta, uasg, itemNum } = parseItemKey(alloc.itemKey);
      const ataKey = `${numeroAta}-${uasg}`;
      const targetArp = arps.find(a => a.numeroAtaRegistroPreco === numeroAta);
      const ataItems = itemsByAta[ataKey] || [];
      const targetItem = ataItems.find(i => String(parseInt(i.numeroItem, 10)) === String(parseInt(itemNum, 10)));

      // Identifica o fornecedor oficial
      const fornecedor = targetItem?.nomeRazaoSocialFornecedor || targetArp?.objeto || 'Fornecedor da Ata';
      const unitPrice = Number(targetItem?.valorUnitario) || 0;
      const descricao = targetItem?.descricaoItem || `Item ${itemNum}`;

      // Empenhos associados a esta unidade
      const itemEmpData = empenhosByItem[alloc.itemKey];
      let empenhadaQty = 0;

      if (itemEmpData) {
        const { links, empenhos } = itemEmpData;
        empenhos.forEach(emp => {
          const empNum = emp.numero || emp.numeroEmpenho;
          const assignedUnit = links[empNum];
          if (assignedUnit && assignedUnit.toLowerCase() === alloc.unitName.toLowerCase()) {
            const rawQtd = Number(emp.empenhado) || Number(emp.quantidade) || 0;
            if (rawQtd > 0) {
              empenhadaQty += (rawQtd > 1000 && unitPrice > 0) ? Math.round(rawQtd / unitPrice) : rawQtd;
            }
          }
        });
      }

      const allocatedQty = Number(alloc.allocatedQty) || 0;
      const saldoQty = Math.max(0, allocatedQty - empenhadaQty);

      const vigenciaFinalDate = targetArp?.dataVigenciaFinal ? new Date(targetArp.dataVigenciaFinal) : undefined;
      const isExpired = Boolean(targetArp?.isCanceladaPncp || (vigenciaFinalDate && vigenciaFinalDate < today));
      const isExpiringSoon = !isExpired && Boolean(vigenciaFinalDate && vigenciaFinalDate <= ninetyDaysFromNow);

      return {
        id: alloc.id,
        itemKey: alloc.itemKey,
        unitName: alloc.unitName,
        allocatedQty,
        empenhadaQty,
        saldoQty,
        unitPrice,
        allocatedValue: allocatedQty * unitPrice,
        empenhadaValue: empenhadaQty * unitPrice,
        saldoValue: saldoQty * unitPrice,
        numeroAta,
        numeroItem: itemNum,
        descricaoItem: descricao,
        fornecedorNome: fornecedor,
        dataVigenciaFinal: targetArp?.dataVigenciaFinal,
        isExpired,
        isExpiringSoon,
        arp: targetArp,
        item: targetItem
      };
    });
  }, [allocations, arps, itemsByAta, empenhosByItem]);

  // Lista de unidades únicas disponíveis
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    enrichedItems.forEach(i => {
      if (i.unitName && i.unitName.trim() !== '') set.add(i.unitName.trim());
    });
    return Array.from(set).sort();
  }, [enrichedItems]);

  // Métricas de resumo globais
  const summaryMetrics = useMemo(() => {
    let totalAllocatedQty = 0;
    let totalAllocatedValue = 0;
    let totalEmpenhadaQty = 0;
    let totalEmpenhadaValue = 0;
    let saldoQty = 0;
    let saldoValue = 0;

    enrichedItems.forEach(item => {
      totalAllocatedQty += item.allocatedQty;
      totalAllocatedValue += item.allocatedValue;
      totalEmpenhadaQty += item.empenhadaQty;
      totalEmpenhadaValue += item.empenhadaValue;
      saldoQty += item.saldoQty;
      saldoValue += item.saldoValue;
    });

    return {
      totalAllocatedQty,
      totalAllocatedValue,
      totalEmpenhadaQty,
      totalEmpenhadaValue,
      saldoQty,
      saldoValue,
      totalUnits: availableUnits.length
    };
  }, [enrichedItems, availableUnits]);

  // Filtragem dos itens
  const filteredItems = useMemo(() => {
    return enrichedItems.filter(item => {
      // 1. Filtro por Unidade
      if (filterState.unit !== 'TODAS') {
        if (item.unitName.toLowerCase() !== filterState.unit.toLowerCase()) return false;
      }

      // 2. Filtro por Vigência da Ata
      if (filterState.vigencia === 'VIGENTE' && item.isExpired) return false;
      if (filterState.vigencia === 'ALERTAS' && !item.isExpiringSoon) return false;
      if (filterState.vigencia === 'EXPIRADA' && !item.isExpired) return false;

      // 3. Busca Textual
      if (filterState.search.trim().length > 0) {
        const query = filterState.search.trim().toLowerCase();
        const matches =
          item.unitName.toLowerCase().includes(query) ||
          item.numeroAta.toLowerCase().includes(query) ||
          item.numeroItem.includes(query) ||
          item.descricaoItem.toLowerCase().includes(query) ||
          item.fornecedorNome.toLowerCase().includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [enrichedItems, filterState]);

  const handleFilterChange = useCallback(
    <K extends keyof AllocationsPortfolioFilterState>(key: K, value: AllocationsPortfolioFilterState[K]) => {
      setFilterState(prev => ({
        ...prev,
        [key]: value
      }));
    },
    []
  );

  const handleResetFilters = useCallback(() => {
    setFilterState({
      unit: 'TODAS',
      vigencia: 'TODAS',
      search: ''
    });
  }, []);

  return (
    <div style={{
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '1.5rem 2rem 3rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      <AllocationsPortfolioHeader
        onOpenManageUnits={() => setIsUnitsModalOpen(true)}
        onOpenExportExcel={() => setIsExportExcelModalOpen(true)}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonLoader variant="card" height="90px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="320px" count={1} />
        </div>
      ) : (
        <>
          <AllocationsPortfolioSummary
            totalAllocatedQty={summaryMetrics.totalAllocatedQty}
            totalAllocatedValue={summaryMetrics.totalAllocatedValue}
            totalEmpenhadaQty={summaryMetrics.totalEmpenhadaQty}
            totalEmpenhadaValue={summaryMetrics.totalEmpenhadaValue}
            saldoQty={summaryMetrics.saldoQty}
            saldoValue={summaryMetrics.saldoValue}
            totalUnits={summaryMetrics.totalUnits}
          />

          <AllocationsPortfolioFilters
            filters={filterState}
            availableUnits={availableUnits}
            onChangeFilter={handleFilterChange}
            onResetFilters={handleResetFilters}
            totalFiltered={filteredItems.length}
            totalItems={enrichedItems.length}
          />

          <AllocationsPortfolioContent
            items={filteredItems}
            totalAllocationsCount={enrichedItems.length}
            onSelectItem={(arp, item) => {
              if (onSelectItem) {
                onSelectItem(arp, item);
              }
            }}
            onResetFilters={handleResetFilters}
          />
        </>
      )}

      <ExportExcelModal
        isOpen={isExportExcelModalOpen}
        onClose={() => setIsExportExcelModalOpen(false)}
        atas={arps}
        itemsByAta={itemsByAta}
      />

      <InternalUnitsModal
        isOpen={isUnitsModalOpen}
        onClose={() => setIsUnitsModalOpen(false)}
        onUnitsUpdated={loadData}
      />
    </div>
  );
};

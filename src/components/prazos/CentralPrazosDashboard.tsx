import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { useCentralPrazosData } from '../../hooks/useCentralPrazosData';
import { CentralPrazosKPIHeader } from './CentralPrazosKPIHeader';
import { CentralPrazosFiltersBar } from './CentralPrazosFiltersBar';
import { CentralPrazosTable } from './CentralPrazosTable';
import { ExplicabilidadeModal } from './ExplicabilidadeModal';
import type { CentralPrazosItem, CentralPrazosTab } from '../../types/centralPrazos';

export const CentralPrazosDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const {
    items,
    kpis,
    isLoading,
    isError,
    refetch,
    filters,
    setFilters,
    resetFilters
  } = useCentralPrazosData('200331');

  const [selectedExplicabilidadeItem, setSelectedExplicabilidadeItem] = useState<CentralPrazosItem | null>(null);

  // Sincroniza a aba ativa caso tenha sido passada via URL (?tab=...) ou state da rota
  useEffect(() => {
    const tabParam = (searchParams.get('tab') || (location.state as any)?.tab) as CentralPrazosTab | null;
    if (tabParam && ['TODAS', 'ATRASADAS', 'HOJE', 'SETE_DIAS', 'TRINTA_DIAS', 'FUTURAS', 'MINHAS'].includes(tabParam)) {
      setFilters((prev) => ({ ...prev, tab: tabParam }));
    }
  }, [searchParams, location.state, setFilters]);

  const handleSelectTab = (tab: CentralPrazosTab) => {
    setFilters((prev) => ({ ...prev, tab }));
  };

  const handleChangeFilter = <K extends keyof typeof filters>(key: K, value: typeof filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{
      maxWidth: '1800px',
      margin: '0 auto',
      padding: '1.5rem 3rem',
      fontFamily: 'var(--font-family)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '1rem',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              background: '#0c326f',
              color: '#ffffff',
              padding: '0.45rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={22} />
            </div>
            <div>
              <h1 style={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.02em',
                borderBottom: 'none',
                paddingBottom: 0
              }}>
                Central de Prazos, Obrigações e Tarefas
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.2rem 0 0 0', fontWeight: 500 }}>
                Acompanhamento temporal unificado de contratos, atas de registro de preços, deadlines operacionais e tarefas humanas
              </p>
            </div>
          </div>
        </div>

        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '0.45rem 0.85rem',
          fontSize: '0.78rem',
          color: '#475569',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <ShieldCheck size={16} color="#15803d" />
          <span>Fuso Oficial: <strong>America/Sao_Paulo</strong> | Cálculo Não Destrutivo</span>
        </div>
      </div>

      {isError && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '1rem',
          color: '#991b1b',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={20} />
          <span>Ocorreu um erro ao consolidar os prazos e tarefas. Verifique a conexão com o banco e tente novamente.</span>
        </div>
      )}

      {/* Cards de KPIs Executivos */}
      <CentralPrazosKPIHeader
        kpis={kpis}
        activeTab={filters.tab}
        onSelectTab={handleSelectTab}
      />

      {/* Barra de Filtros e Busca */}
      <CentralPrazosFiltersBar
        filters={filters}
        onChangeFilter={handleChangeFilter}
        onResetFilters={resetFilters}
        onRefresh={refetch}
        isLoading={isLoading}
        totalFiltered={items.length}
      />

      {/* Tabela Operacional */}
      <CentralPrazosTable
        items={items}
        isLoading={isLoading}
        onOpenExplicabilidade={(item) => setSelectedExplicabilidadeItem(item)}
      />

      {/* Modal de Explicabilidade Transparente */}
      <ExplicabilidadeModal
        item={selectedExplicabilidadeItem}
        onClose={() => setSelectedExplicabilidadeItem(null)}
      />
    </div>
  );
};

import React from 'react';
import { Search, RotateCcw, RefreshCw } from 'lucide-react';
import type { CentralPrazosFilterParams, CentralPrazosTab } from '../../types/centralPrazos';

interface CentralPrazosFiltersBarProps {
  filters: CentralPrazosFilterParams;
  onChangeFilter: <K extends keyof CentralPrazosFilterParams>(key: K, value: CentralPrazosFilterParams[K]) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  totalFiltered: number;
}

export const CentralPrazosFiltersBar: React.FC<CentralPrazosFiltersBarProps> = ({
  filters,
  onChangeFilter,
  onResetFilters,
  onRefresh,
  isLoading,
  totalFiltered
}) => {
  const tabs: { id: CentralPrazosTab; label: string }[] = [
    { id: 'TODAS', label: 'Todas as Obrigações' },
    { id: 'ATRASADAS', label: '🚨 Atrasadas' },
    { id: 'HOJE', label: '⚡ Vencendo Hoje' },
    { id: 'SETE_DIAS', label: '⚠️ Próximos 7 Dias' },
    { id: 'TRINTA_DIAS', label: '📅 Próximos 30 Dias' },
    { id: 'FUTURAS', label: '🔮 Futuras (>30d)' },
    { id: 'MINHAS', label: '👤 Sob Minha Gestão' }
  ];

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      padding: '1.25rem',
      marginBottom: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
    }}>
      {/* Abas de Visão Temporal */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '0.75rem'
      }}>
        {tabs.map((t) => {
          const isActive = filters.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeFilter('tab', t.id)}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? '#0c326f' : '#f1f5f9',
                color: isActive ? '#ffffff' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Linha de Controles e Filtros */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.75rem',
        alignItems: 'center'
      }}>
        {/* Busca Textual */}
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Buscar contrato, ata, fornecedor, responsável, ação..."
            value={filters.busca}
            onChange={(e) => onChangeFilter('busca', e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Tipo de Entidade (Contrato vs ARP) */}
        <div>
          <select
            value={filters.entidadeTipo}
            onChange={(e) => onChangeFilter('entidadeTipo', e.target.value as any)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              background: '#ffffff',
              color: '#334155'
            }}
          >
            <option value="TODOS">Todas as Entidades (Contratos & ARPs)</option>
            <option value="CONTRATO">Somente Contratos</option>
            <option value="ARP">Somente ARPs</option>
          </select>
        </div>

        {/* Nível de Atenção */}
        <div>
          <select
            value={filters.nivelAtencao}
            onChange={(e) => onChangeFilter('nivelAtencao', e.target.value as any)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              background: '#ffffff',
              color: '#334155'
            }}
          >
            <option value="TODOS">Todos os Níveis de Atenção</option>
            <option value="CRITICO">🚨 Apenas Crítico (Atrasados/Hoje)</option>
            <option value="ATENCAO">⚠️ Apenas Atenção (&le;30d)</option>
            <option value="NORMAL">✅ Normal / Planejado</option>
          </select>
        </div>

        {/* Status da Tarefa */}
        <div>
          <select
            value={filters.statusTarefa}
            onChange={(e) => onChangeFilter('statusTarefa', e.target.value as any)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              background: '#ffffff',
              color: '#334155'
            }}
          >
            <option value="TODOS">Todos os Tipos de Registro</option>
            <option value="PENDENTE">Tarefas Pendentes</option>
            <option value="EM_ANDAMENTO">Tarefas Em Andamento</option>
            <option value="CONCLUIDA">Tarefas Concluídas</option>
            <option value="SEM_TAREFA">Gatilhos Operacionais (Sem Tarefa)</option>
          </select>
        </div>
      </div>

      {/* Rodapé dos Filtros: Total e Ações */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: '0.5rem',
        borderTop: '1px solid #f1f5f9',
        fontSize: '0.8rem',
        color: '#64748b'
      }}>
        <div>
          Exibindo <strong>{totalFiltered}</strong> registro(s) correspondentes aos critérios.
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onResetFilters}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={13} /> Limpar Filtros
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.85rem',
              background: '#0c326f',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin-animation' : ''} />
            Atualizar
          </button>
        </div>
      </div>
    </div>
  );
};

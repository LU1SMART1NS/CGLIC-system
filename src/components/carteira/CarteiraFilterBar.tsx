import React from 'react';
import { Search, X } from 'lucide-react';
import { carteiraSelect } from './carteiraStyles';
import { SEM_GESTOR, TODOS_GESTORES } from './carteiraGestor';

interface CarteiraFilterBarProps {
  busca: string;
  searchPlaceholder: string;
  onChangeBusca: (value: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Texto à direita (ex.: "Exibindo 3 de 10 contratos"). */
  counter: string;
  /** Prefixo dos data-testid (`arp`, `contracts`). */
  testIdPrefix: string;
  /** Os seletores próprios de cada carteira. */
  children?: React.ReactNode;
}

/** Barra de filtros comum às carteiras de Atas e de Contratos: busca, seletores, "Limpar" e contador. */
export const CarteiraFilterBar: React.FC<CarteiraFilterBarProps> = ({
  busca,
  searchPlaceholder,
  onChangeBusca,
  hasActiveFilters,
  onResetFilters,
  counter,
  testIdPrefix,
  children
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', flex: 1 }}>
      <div style={{ position: 'relative', minWidth: 0, flex: '1 1 260px', maxWidth: '400px' }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={busca}
          onChange={(e) => onChangeBusca(e.target.value)}
          data-testid={`${testIdPrefix}-filter-search`}
          style={{
            width: '100%',
            padding: '0.4rem 0.7rem 0.4rem 2rem',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.8rem',
            color: '#0f172a',
            outline: 'none'
          }}
        />
      </div>

      {children}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          data-testid={`${testIdPrefix}-reset-filters-btn`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.35rem 0.65rem',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '0.76rem',
            fontWeight: 700,
            color: '#991b1b',
            cursor: 'pointer'
          }}
        >
          <X size={12} /> Limpar
        </button>
      )}
    </div>

    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{counter}</div>
  </div>
);

interface CarteiraGestorSelectProps {
  value: string;
  gestores: string[];
  onChange: (value: string) => void;
  testId: string;
}

/** Seletor de gestor das carteiras, com a opção "Sem gestor". Um gestor vindo da URL que não está na lista continua selecionável. */
export const CarteiraGestorSelect: React.FC<CarteiraGestorSelectProps> = ({ value, gestores, onChange, testId }) => {
  const options = value !== TODOS_GESTORES && value !== SEM_GESTOR && !gestores.includes(value) ? [value, ...gestores] : gestores;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} style={carteiraSelect} aria-label="Filtrar por gestor">
      <option value={TODOS_GESTORES}>Todos os Gestores</option>
      <option value={SEM_GESTOR}>Sem gestor</option>
      {options.map((nome) => (
        <option key={nome} value={nome}>{nome}</option>
      ))}
    </select>
  );
};

/** Contador à direita da barra: "Exibindo X de Y" com filtro ativo, senão só o total. */
export function carteiraCounter(totalFiltered: number, total: number, hasActiveFilters: boolean, singular: string, plural: string): string {
  return hasActiveFilters || totalFiltered !== total
    ? `Exibindo ${totalFiltered} de ${total} ${plural}`
    : `${total} ${total === 1 ? singular : plural}`;
}

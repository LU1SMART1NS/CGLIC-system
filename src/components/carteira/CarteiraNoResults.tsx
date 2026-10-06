import React from 'react';
import { RotateCcw } from 'lucide-react';

interface CarteiraNoResultsProps {
  title: string;
  description: string;
  onResetFilters: () => void;
}

/** Estado vazio das carteiras quando há instrumentos, mas nenhum passa pelos filtros. */
export const CarteiraNoResults: React.FC<CarteiraNoResultsProps> = ({ title, description, onResetFilters }) => (
  <div style={{
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '3rem 1.5rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem'
  }}>
    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>{description}</p>
    <button
      type="button"
      onClick={onResetFilters}
      style={{
        marginTop: '0.5rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.45rem 0.85rem',
        background: 'var(--primary)',
        border: 'none',
        borderRadius: '6px',
        fontSize: '0.78rem',
        fontWeight: 700,
        color: '#ffffff',
        cursor: 'pointer'
      }}
    >
      <RotateCcw size={13} /> Limpar Filtros
    </button>
  </div>
);

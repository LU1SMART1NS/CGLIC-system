import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { carteiraTh } from './carteiraStyles';
import type { SortDir } from './useCarteiraSort';

interface SortState {
  activeKey: string | null;
  activeDir: SortDir | null;
  onSort: (key: string) => void;
}

interface CarteiraSortButtonProps extends SortState {
  label: string;
  sortKey: string;
}

/** Botão de ordenação dentro de um cabeçalho (a seta indica o sentido). */
export const CarteiraSortButton: React.FC<CarteiraSortButtonProps> = ({ label, sortKey, activeKey, activeDir, onSort }) => {
  const ativo = activeKey === sortKey && activeDir !== null;
  const Icon = !ativo ? ArrowUpDown : activeDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-${sortKey}`}
      title={`Ordenar por ${label.toLowerCase()}`}
      aria-label={`Ordenar por ${label.toLowerCase()}${ativo ? (activeDir === 'asc' ? ' (crescente)' : ' (decrescente)') : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: ativo ? 'var(--primary)' : 'inherit',
        cursor: 'pointer'
      }}
    >
      {label}
      <Icon size={12} aria-hidden="true" style={{ opacity: ativo ? 1 : 0.45 }} />
    </button>
  );
};

interface CarteiraSortHeaderProps extends SortState {
  label: string;
  sortKey: string;
  align?: 'left' | 'right' | 'center';
  /** Explicação da coluna, mostrada ao parar o mouse no cabeçalho. */
  hint?: string;
}

/** Cabeçalho de coluna que ordena a tabela ao clicar. */
export const CarteiraSortHeader: React.FC<CarteiraSortHeaderProps> = ({ label, sortKey, align = 'left', hint, ...sort }) => {
  const ativo = sort.activeKey === sortKey && sort.activeDir !== null;
  return (
    <th
      title={hint}
      style={{ ...carteiraTh, textAlign: align }}
      aria-sort={ativo ? (sort.activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <CarteiraSortButton label={label} sortKey={sortKey} {...sort} />
    </th>
  );
};

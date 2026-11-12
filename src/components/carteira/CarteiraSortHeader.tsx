import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { AnchoredPanel } from '../../design-system/components/AnchoredPanel';
import { AppButton } from '../../design-system/components/AppButton';
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

export interface CarteiraSortOption {
  key: string;
  label: string;
}

interface CarteiraSortMenuProps extends SortState {
  label: string;
  options: CarteiraSortOption[];
  testId?: string;
}

/**
 * Cabeçalho de coluna que junta vários valores (ex.: Empenhado · Pago · Sobra): abre a lista de por qual deles ordenar.
 * O cabeçalho mostra o valor que ordena agora e a seta do sentido; escolher o mesmo de novo inverte, como na coluna simples.
 */
export const CarteiraSortMenu: React.FC<CarteiraSortMenuProps> = ({ label, options, activeKey, activeDir, onSort, testId }) => {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const ativa = activeDir !== null ? options.find((o) => o.key === activeKey) : undefined;
  const Icon = !ativa ? ArrowUpDown : activeDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(rect)}
        data-testid={testId}
        title={`Ordenar por: ${options.map((o) => o.label.toLowerCase()).join(', ')}`}
        onClick={(e) => setRect(rect ? null : e.currentTarget.getBoundingClientRect())}
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
          color: ativa ? 'var(--primary)' : 'inherit',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
        {ativa && <span style={{ fontWeight: 700 }}>· {ativa.label}</span>}
        <Icon size={12} aria-hidden="true" style={{ opacity: ativa ? 1 : 0.45 }} />
        <ChevronDown size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
      </button>
      {rect && (
        <AnchoredPanel anchorRect={rect} onClose={() => setRect(null)} ariaLabel={`Ordenar ${label.toLowerCase()}`} width={220} testId={testId ? `${testId}-painel` : undefined}>
          <div role="menu" className="ds-row-menu">
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', padding: '0.25rem 0.5rem' }}>Ordenar por</div>
            {options.map((o) => {
              const esta = ativa?.key === o.key;
              const Seta = !esta ? null : activeDir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <AppButton
                  key={o.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={esta}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="ds-row-menu__item"
                  data-testid={`sort-${o.key}`}
                  onClick={() => {
                    setRect(null);
                    onSort(o.key);
                  }}
                  style={esta ? { color: 'var(--primary)', fontWeight: 800 } : undefined}
                >
                  {o.label}
                  {Seta && <Seta size={12} aria-hidden="true" style={{ marginLeft: '0.35rem' }} />}
                </AppButton>
              );
            })}
          </div>
        </AnchoredPanel>
      )}
    </>
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

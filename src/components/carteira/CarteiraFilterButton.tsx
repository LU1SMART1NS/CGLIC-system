import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

export interface CarteiraFilterOption {
  value: string;
  label: string;
  /** Quantos registros a opção traria (opcional). */
  count?: number;
}

interface CarteiraFilterButtonProps {
  /** Nome do filtro ("Alocação", "Gestor"). */
  label: string;
  value: string;
  /** Valor que significa "sem filtro". */
  emptyValue: string;
  options: CarteiraFilterOption[];
  onChange: (value: string) => void;
  testId: string;
}

/**
 * Filtro em botão (padrão Jira/Linear): vazio mostra "+ Alocação"; escolhido mostra
 * "Alocação: Sem alocação ×". As opções abrem num menu, com a contagem de cada uma.
 */
export const CarteiraFilterButton: React.FC<CarteiraFilterButtonProps> = ({ label, value, emptyValue, options, onChange, testId }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const ativo = value !== emptyValue;
  const selecionada = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const escolher = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }} data-testid={testId}>
      {/* A borda fica só no contorno: os dois botões de dentro não têm borda (evita a emenda mais grossa entre eles). */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          borderRadius: '6px',
          borderWidth: '1px',
          borderStyle: ativo ? 'solid' : 'dashed',
          borderColor: ativo ? '#0c326f' : '#cbd5e1',
          background: ativo ? '#e0e7f5' : '#ffffff',
          overflow: 'hidden'
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="carteira-filter-btn"
          data-testid={`${testId}-btn`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.38rem 0.65rem',
            border: 'none',
            background: 'transparent',
            color: ativo ? '#0c326f' : '#334155',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {ativo ? (
            <>
              {label}: <span style={{ fontWeight: 800 }}>{selecionada?.label ?? value}</span>
            </>
          ) : (
            <>
              <Plus size={13} aria-hidden="true" /> {label}
            </>
          )}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {ativo && (
          <button
            type="button"
            onClick={() => onChange(emptyValue)}
            aria-label={`Remover filtro ${label}`}
            className="carteira-filter-btn"
            data-testid={`${testId}-clear`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 0.5rem',
              border: 'none',
              borderLeft: '1px solid rgba(12, 50, 111, 0.25)',
              background: 'transparent',
              color: '#0c326f',
              cursor: 'pointer'
            }}
          >
            <X size={13} />
          </button>
        )}
      </span>

      {open && (
        <div
          id={menuId}
          className="carteira-filter-menu"
          role="menu"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 30,
            minWidth: '220px',
            maxHeight: '320px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            padding: '0.25rem'
          }}
        >
          {options.map((o) => {
            const checked = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => escolher(checked ? emptyValue : o.value)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '0.45rem 0.6rem',
                  border: 'none',
                  borderRadius: '6px',
                  background: checked ? '#e0e7f5' : 'transparent',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  fontWeight: checked ? 800 : 600,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                <span>{o.label}</span>
                {typeof o.count === 'number' && <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{o.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

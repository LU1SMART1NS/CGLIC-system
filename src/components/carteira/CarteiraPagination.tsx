import React from 'react';

interface CarteiraPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  testIdPrefix: string;
}

export const CarteiraPagination: React.FC<CarteiraPaginationProps> = ({
  page,
  pageSize,
  total,
  onChange,
  testIdPrefix
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const current = Math.min(page, totalPages);
  // Janela deslizante de páginas para não renderizar dezenas de botões.
  const first = Math.max(1, Math.min(current - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  const pages = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const pageButton = (p: number, label: React.ReactNode, active = false, disabled = false) => (
    <button
      key={`${typeof label === 'string' ? label : p}-${p}`}
      type="button"
      className={typeof label === 'string' && /^\d+$/.test(label) ? 'carteira-pagination__num' : undefined}
      disabled={disabled}
      onClick={() => onChange(p)}
      data-testid={`${testIdPrefix}-page-${p}`}
      style={{
        minWidth: '28px',
        padding: '0.3rem 0.5rem',
        borderRadius: '6px',
        border: active ? '1px solid var(--primary)' : '1px solid #e2e8f0',
        background: active ? 'var(--primary)' : '#ffffff',
        color: active ? '#ffffff' : '#475569',
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="carteira-pagination" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.65rem 0.85rem',
      borderTop: '1px solid #e2e8f0',
      fontSize: '0.78rem',
      color: '#64748b'
    }}>
      <span>
        Mostrando {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, total)} de {total}
      </span>
      <div className="carteira-pagination__pages" style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
        {pageButton(Math.max(1, current - 1), 'Anterior', false, current === 1)}
        {pages.map((p) => pageButton(p, String(p), p === current))}
        <span className="carteira-pagination__compact" aria-hidden="true">
          {current}/{totalPages}
        </span>
        {pageButton(Math.min(totalPages, current + 1), 'Próxima', false, current === totalPages)}
      </div>
    </div>
  );
};

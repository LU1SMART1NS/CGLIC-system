import React from 'react';

interface CarteiraCellFilterProps {
  /** O que o clique filtra, para o título e o leitor de tela (ex.: "gestor Marina Costa"). */
  descricao: string;
  onFilter?: () => void;
  /** Ocupa a linha inteira da célula (sem o espaço de texto em volta), para alinhar pelo topo. */
  bloco?: boolean;
  children: React.ReactNode;
}

/**
 * Valor de célula que filtra a lista ao ser clicado (ex.: o selo "Sem alocação" aplica esse filtro).
 * Sem `onFilter`, mostra só o conteúdo.
 */
export const CarteiraCellFilter: React.FC<CarteiraCellFilterProps> = ({ descricao, onFilter, bloco, children }) => {
  if (!onFilter) return <>{children}</>;
  return (
    <button
      type="button"
      className="carteira-cell-filter"
      onClick={onFilter}
      title={`Filtrar por ${descricao}`}
      aria-label={`Filtrar por ${descricao}`}
      style={{ display: bloco ? 'block' : undefined, background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', textAlign: 'inherit', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
};

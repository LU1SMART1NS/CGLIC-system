import React from 'react';
import { PRAZO_COLORS, formatDiasRestantes, type PrazoFaixa } from './carteiraPrazo';

interface CarteiraPrazoPillProps {
  faixa: PrazoFaixa;
  diasRestantes: number | null;
}

export const CarteiraPrazoPill: React.FC<CarteiraPrazoPillProps> = ({ faixa, diasRestantes }) => {
  const { color, bg } = PRAZO_COLORS[faixa];
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.72rem',
        fontWeight: 800,
        color,
        background: bg,
        padding: '0.2rem 0.5rem',
        borderRadius: '4px',
        whiteSpace: 'nowrap'
      }}
    >
      {formatDiasRestantes(diasRestantes)}
    </span>
  );
};

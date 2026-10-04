import React from 'react';
import type { NivelAtendimento } from '../../utils/itemAtendimento';

const COLORS: Record<NivelAtendimento, { color: string; bg: string }> = {
  TOTAL: { color: '#15803d', bg: '#f0fdf4' },
  PARCIAL: { color: '#b45309', bg: '#fffbeb' },
  SEM: { color: '#475569', bg: '#f1f5f9' }
};

interface CarteiraNivelPillProps {
  nivel: NivelAtendimento | null;
  /** Texto de cada nível (ex.: "Totalmente alocado"). */
  labels: Record<NivelAtendimento, string>;
}

/** Selo do estado de alocação ou de empenho; sem nível conhecido (ata sem itens carregados) mostra um traço. */
export const CarteiraNivelPill: React.FC<CarteiraNivelPillProps> = ({ nivel, labels }) => {
  if (!nivel) return <span style={{ color: '#94a3b8' }}>—</span>;
  const { color, bg } = COLORS[nivel];
  return (
    <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 800, color, background: bg, padding: '0.2rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
      {labels[nivel]}
    </span>
  );
};

import React from 'react';

/** Título de seção das linhas expandidas das carteiras (ex.: "Processo", "Pendências abertas", "Itens da ata"). */
export const CarteiraDetailLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', marginBottom: '0.2rem' }}>
    {children}
  </div>
);

/** Padding único da célula expandida, para as duas carteiras ficarem idênticas. */
export const CARTEIRA_EXPANDED_CELL_STYLE: React.CSSProperties = {
  padding: '0.9rem 1.25rem 1.1rem 2.5rem',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0'
};

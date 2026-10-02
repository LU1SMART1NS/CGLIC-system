import React from 'react';

/**
 * Casca das telas de detalhe (Ata, Contrato e Item): largura máxima e margens iguais em todas.
 * Também é usada pelos estados de página inteira (carregando, erro, acesso negado).
 */
export const Instrument360Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div data-testid="instrument-page" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
    {children}
  </div>
);

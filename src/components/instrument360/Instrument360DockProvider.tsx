import React from 'react';
import { DockContext, type Instrument360DockSummary } from './instrument360Dock';

/**
 * Liga o cartão do topo (que registra o resumo e o próprio elemento) à barra de abas (que decide quando
 * mostrar o resumo). Fora do provider, a barra de abas segue sem a identidade compacta.
 */
export const Instrument360DockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [summary, setSummary] = React.useState<Instrument360DockSummary | null>(null);
  const [heroEl, setHeroEl] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ summary, setSummary, heroEl, setHeroEl }), [summary, heroEl]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
};

import React from 'react';
import { DockContext } from './instrument360Dock';

/**
 * Liga o bloco do topo (`Instrument360Head`, que decide quando encolher) ao cartão (que muda de aparência
 * quando encolhido). Fora do provider, o cartão fica sempre inteiro.
 */
export const Instrument360DockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [min, setMin] = React.useState(false);
  const [phone, setPhone] = React.useState<{ active: boolean; docked: boolean; slot: HTMLElement | null }>({ active: false, docked: false, slot: null });
  const value = React.useMemo(
    () => ({ min, setMin, phone: phone.active, phoneDocked: phone.docked, phoneBarSlot: phone.slot, setPhone }),
    [min, phone]
  );
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
};

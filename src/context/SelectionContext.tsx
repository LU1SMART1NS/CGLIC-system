import React, { createContext, useContext, useState } from 'react';
import type { ArpRecord, ArpItemRecord } from '../types';

interface SelectionContextValue {
  selectedArp: ArpRecord | null;
  selectedItem: ArpItemRecord | null;
  globalArps: ArpRecord[];
  globalItemsByAta: Record<string, ArpItemRecord[]>;
  setSelectedArp: (arp: ArpRecord | null) => void;
  setSelectedItem: (item: ArpItemRecord | null) => void;
  setGlobalArps: (arps: ArpRecord[]) => void;
  setGlobalItemsByAta: (items: Record<string, ArpItemRecord[]>) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * Mantém a seleção de Ata/Item em memória entre rotas de drill-down
 * (equivalente ao estado que antes vivia direto em App.tsx).
 */
export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedArp, setSelectedArp] = useState<ArpRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<ArpItemRecord | null>(null);
  const [globalArps, setGlobalArps] = useState<ArpRecord[]>([]);
  const [globalItemsByAta, setGlobalItemsByAta] = useState<Record<string, ArpItemRecord[]>>({});

  return (
    <SelectionContext.Provider
      value={{
        selectedArp,
        selectedItem,
        globalArps,
        globalItemsByAta,
        setSelectedArp,
        setSelectedItem,
        setGlobalArps,
        setGlobalItemsByAta
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
};

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelection deve ser usado dentro de SelectionProvider');
  }
  return ctx;
}

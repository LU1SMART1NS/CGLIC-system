import React from 'react';
import { useSearchParams } from 'react-router-dom';

/** Resolve a aba ativa a partir do `?aba=`; valor desconhecido cai na aba padrão e `aliases` cobre nomes antigos. */
export function resolveInstrumentTab<T extends string>(
  raw: string | null,
  tabs: readonly T[],
  defaultTab: T,
  aliases: Record<string, T> = {}
): T {
  const resolved = raw ? (aliases[raw] ?? raw) : null;
  return resolved && (tabs as readonly string[]).includes(resolved) ? (resolved as T) : defaultTab;
}

/** Parâmetros da URL para uma aba: a aba padrão fica de fora do endereço. */
export function tabSearchParams<T extends string>(tab: T, defaultTab: T): Record<string, string> {
  return tab === defaultTab ? {} : { aba: tab };
}

/**
 * Aba da tela de detalhe no endereço (`?aba=`), com o mesmo comportamento em Ata, Contrato e Item:
 * trocar de aba não empilha histórico e nem os atalhos de fora das abas (cartões do topo, avisos)
 * rolam a página.
 */
export function useInstrumentTab<T extends string>(options: { tabs: readonly T[]; defaultTab: T; aliases?: Record<string, T> }) {
  const { tabs, defaultTab, aliases } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const activeTab = resolveInstrumentTab(searchParams.get('aba'), tabs, defaultTab, aliases);

  const goToTab = (tab: T) => {
    setSearchParams(tabSearchParams(tab, defaultTab), { replace: true });
  };

  return { activeTab, goToTab, tabsRef };
}

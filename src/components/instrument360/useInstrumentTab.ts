import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { scrollToDock } from './instrument360Dock';

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
 * trocar de aba não empilha histórico. Todo clique do usuário (abas, cartões do topo, avisos) rola a
 * página até a barra de abas grudar no alto, com o conteúdo da aba logo abaixo; abrir a tela ou um
 * endereço com `?aba=` não rola, para o cartão do topo aparecer inteiro.
 */
export function useInstrumentTab<T extends string>(options: { tabs: readonly T[]; defaultTab: T; aliases?: Record<string, T> }) {
  const { tabs, defaultTab, aliases } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const activeTab = resolveInstrumentTab(searchParams.get('aba'), tabs, defaultTab, aliases);

  /** `extra` vai junto no endereço (ex.: `{ abrir: '2024NE000337' }` para a aba abrir aquela linha). */
  const goToTab = (tab: T, extra?: Record<string, string>) => {
    // Mantém o state da navegação: é nele que viaja a origem do Voltar.
    setSearchParams({ ...tabSearchParams(tab, defaultTab), ...extra }, { replace: true, state: location.state });
    scrollToDock(tabsRef.current);
  };

  return { activeTab, goToTab, tabsRef, searchParams };
}

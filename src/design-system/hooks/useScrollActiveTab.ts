import { useEffect, type RefObject } from 'react';

/**
 * Em barras de abas roláveis, centraliza a aba ativa (`aria-selected="true"`) ao trocar de aba,
 * para que a seleção nunca fique escondida fora da área visível. Rola só na horizontal.
 */
export function useScrollActiveTab(containerRef: RefObject<HTMLElement | null>, activeKey: string): void {
  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!container || !active || container.scrollWidth <= container.clientWidth) return;
    const target = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [containerRef, activeKey]);
}

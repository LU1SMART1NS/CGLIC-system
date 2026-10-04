import React from 'react';
import type { PrazoFaixa } from '../carteira/carteiraPrazo';

/** O que a barra fixa mostra do instrumento enquanto o cartão do topo está fora da vista. */
export interface Instrument360DockSummary {
  title: string;
  status?: { faixa: PrazoFaixa; label: string; neutral?: boolean };
  /** Aviso em vermelho (ex.: "Vence em 8 dias"). */
  alert?: string;
  /** Fornecedor, quando a tela tem um. */
  subtitle?: string;
}

export interface DockContextValue {
  summary: Instrument360DockSummary | null;
  setSummary: (summary: Instrument360DockSummary | null) => void;
  heroEl: HTMLElement | null;
  setHeroEl: (el: HTMLElement | null) => void;
}

export const DockContext = React.createContext<DockContextValue | null>(null);

export function useInstrument360Dock(): DockContextValue | null {
  return React.useContext(DockContext);
}

/** Rolagem suave, exceto para quem pede menos movimento. */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Volta ao topo da página, onde o cartão aparece inteiro. */
export function scrollToSummary(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/**
 * Rola até o ponto em que a barra de abas gruda logo abaixo do cabeçalho do sistema, com o conteúdo da
 * aba começando embaixo dela. Serve tanto para quem está no topo quanto para quem já está com a barra presa.
 */
export function scrollToDock(tablist: HTMLElement | null): void {
  const dock = tablist?.closest<HTMLElement>('[data-i360-dock]');
  const anchor = dock?.previousElementSibling;
  if (!dock || !(anchor instanceof HTMLElement) || !anchor.hasAttribute('data-i360-dock-anchor')) return;
  const headerHeight = parseFloat(getComputedStyle(dock).getPropertyValue('--app-header-h')) || 0;
  const top = anchor.getBoundingClientRect().top + window.scrollY - headerHeight;
  window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
}

/**
 * `true` quando o cartão do topo já saiu da vista por cima, isto é, a barra de abas está grudada.
 * A borda de cima da área observada desce a altura do cabeçalho fixo do sistema.
 */
export function useHeroOutOfView(heroEl: HTMLElement | null): boolean {
  const [outOfView, setOutOfView] = React.useState(false);
  React.useEffect(() => {
    if (!heroEl || typeof IntersectionObserver === 'undefined') return;
    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      const headerHeight = parseFloat(getComputedStyle(heroEl).getPropertyValue('--app-header-h')) || 0;
      observer = new IntersectionObserver(
        ([entry]) => setOutOfView(!entry.isIntersecting && entry.boundingClientRect.top < 0),
        { rootMargin: `-${Math.round(headerHeight)}px 0px 0px 0px`, threshold: 0 }
      );
      observer.observe(heroEl);
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      window.removeEventListener('resize', observe);
      observer?.disconnect();
    };
  }, [heroEl]);
  return heroEl !== null && outOfView;
}

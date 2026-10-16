import React from 'react';

/** Estado do bloco do topo das telas 360 (cartão + abas): `min` = cartão encolhido em barra. */
export interface DockContextValue {
  min: boolean;
  setMin: (min: boolean) => void;
  /**
   * Celular com o cartão resumido (`Instrument360Head` com `resumoNoCelular`): o cartão rola com a página e,
   * quando sai inteiro da tela, aparece a barra azul (`phoneDocked`). A barra é desenhada pelo cartão dentro
   * de `phoneBarSlot`, um lugar que o bloco do topo reserva acima dele.
   */
  phone: boolean;
  phoneDocked: boolean;
  phoneBarSlot: HTMLElement | null;
  setPhone: (phone: { active: boolean; docked: boolean; slot: HTMLElement | null }) => void;
}

export const DockContext = React.createContext<DockContextValue | null>(null);

export function useInstrument360Dock(): DockContextValue | null {
  return React.useContext(DockContext);
}

/** Rolagem suave, exceto para quem pede menos movimento. */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Rolagem passa deste ponto: o cartão encolhe. Só volta a abrir ao chegar ao topo (abaixo de DOCK_OPEN_AT). */
export const DOCK_MIN_AT = 60;
export const DOCK_OPEN_AT = 4;
/** Altura da barra azul do celular (nome, situação e Resumo), acima das abas que grudam. */
export const PHONE_BAR_H = 52;
/** Celular: abaixo desta largura o menu vira barra inferior e as telas 360 usam o cartão resumido. */
export const PHONE_QUERY = '(max-width: 767px)';
/** Duração da transição de encolher (igual a --i360-t no CSS). */
export const DOCK_TRANSITION_MS = 650;
/** Evento que a barra de abas dispara no bloco do topo para ele encolher e ficar assim até a pessoa rolar além de DOCK_MIN_AT. */
export const DOCK_PIN_EVENT = 'i360-pin';

/** Volta ao topo da página, onde o cartão aparece inteiro. */
export function scrollToSummary(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/**
 * Encolhe o cartão (se ainda não estiver) e rola até o conteúdo da aba ficar logo abaixo da barra.
 * Serve tanto para quem está no topo quanto para quem já está com a barra encolhida. A barra fica
 * encolhida mesmo se o destino cair perto do topo (senão a rolagem passaria pelo topo e reabriria o cartão).
 */
export function scrollToDock(tablist: HTMLElement | null): void {
  const head = tablist?.closest<HTMLElement>('[data-i360-head]');
  if (!head || !tablist) return;
  if (head.dataset.phone === 'true') {
    // Celular: as abas grudam abaixo da barra azul; rola até o conteúdo da aba ficar logo abaixo delas.
    const panel = head.nextElementSibling;
    if (!(panel instanceof HTMLElement)) return;
    const headerHeight = parseFloat(getComputedStyle(tablist).getPropertyValue('--app-header-h')) || 0;
    const gap = parseFloat(getComputedStyle(tablist).marginBottom) || 0;
    const top = panel.getBoundingClientRect().top + window.scrollY - headerHeight - PHONE_BAR_H - tablist.offsetHeight - gap;
    if (Math.abs(top - window.scrollY) > 2) window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
    return;
  }
  const wasMin = head.dataset.min === 'true';
  head.dispatchEvent(new CustomEvent(DOCK_PIN_EVENT));
  const go = () => {
    const panel = head.nextElementSibling;
    if (!(panel instanceof HTMLElement)) return;
    const headerHeight = parseFloat(getComputedStyle(head).getPropertyValue('--app-header-h')) || 0;
    const gap = parseFloat(getComputedStyle(head).marginBottom) || 0;
    const top = panel.getBoundingClientRect().top + window.scrollY - headerHeight - head.offsetHeight - gap;
    if (Math.abs(top - window.scrollY) > 2) window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
  };
  if (wasMin || scrollBehavior() === 'auto') go();
  else window.setTimeout(go, DOCK_TRANSITION_MS + 30);
}

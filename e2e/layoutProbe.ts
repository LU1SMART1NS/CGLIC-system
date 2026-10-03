import type { Page } from '@playwright/test';

export interface LayoutMetrics {
  path: string;
  viewportWidth: number;
  scrollWidth: number;
  /** Controles fora da tela e fora de qualquer área rolável (inalcançáveis). */
  unreachable: string[];
  /** Controles fora da tela dentro de áreas roláveis (exceto barras de abas). */
  offscreenInScroller: string[];
  smallTargets: string[];
  inputsBelow16: number;
  textBelow12: number;
}

/** Mede o layout da tela atual. Roda no navegador; mesmos critérios da auditoria mobile. */
export function measureLayout(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const main = document.querySelector('main') as HTMLElement;
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const label = (e: Element) =>
      ((e as HTMLElement).innerText || e.getAttribute('aria-label') || e.getAttribute('title') || e.tagName).trim().slice(0, 28);

    const scrollers = Array.from(main.querySelectorAll('*')).filter(
      (e) => e.scrollWidth > e.clientWidth + 2 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX)
    );
    const inScroller = (b: Element) => scrollers.some((s) => s !== b && s.contains(b));

    const controls = Array.from(
      main.querySelectorAll('button, a, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')
    ).filter(visible);
    const outside = (b: Element) => {
      const r = b.getBoundingClientRect();
      return r.right > vw + 1 || r.left < -1;
    };
    const fields = controls.filter((e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName));

    return {
      path: location.pathname + location.search,
      viewportWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      unreachable: controls.filter((b) => outside(b) && !inScroller(b)).map(label),
      offscreenInScroller: controls.filter((b) => outside(b) && inScroller(b) && !b.closest('[role=tablist]')).map(label),
      smallTargets: controls.filter((b) => b.getBoundingClientRect().height < 43.5).map(label),
      inputsBelow16: fields.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length,
      textBelow12: Array.from(main.querySelectorAll('*')).filter(
        (e) => e.children.length === 0 && ((e as HTMLElement).innerText || '').trim() && parseFloat(getComputedStyle(e).fontSize) < 12
      ).length
    };
  });
}

/** Espera os indicadores de carregamento sumirem (as telas 360 chegam a levar ~15s em desenvolvimento). */
export async function waitForSettled(page: Page): Promise<void> {
  await page.waitForSelector('main', { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const text = (document.querySelector('main') as HTMLElement | null)?.innerText ?? '';
      const loading = /Carregando|Atualizando\.\.\.|Sincronizando/.test(text) || document.querySelector('.animate-pulse, .spinner, [data-testid$="-loading"]');
      return !loading;
    },
    undefined,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(800);
}

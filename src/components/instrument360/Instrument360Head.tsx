import React from 'react';
import { DOCK_MIN_AT, DOCK_OPEN_AT, DOCK_PIN_EVENT, useInstrument360Dock } from './instrument360Dock';

/**
 * Bloco que gruda no alto das telas 360 (Ata, Contrato e Item): o cartão do topo e a barra de abas.
 * Ao rolar, o cartão encolhe até virar a faixa azul com o nome em cima e as abas embaixo; ao voltar ao
 * topo, abre de novo. O encolhimento é só visual (classes no CSS); aqui fica a regra de quando acontece.
 * O conteúdo da aba (`Instrument360TabPanel`) tem de ser o irmão seguinte.
 */
export const Instrument360Head: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dock = useInstrument360Dock();
  const min = dock?.min ?? false;
  const setMin = dock?.setMin;
  const ref = React.useRef<HTMLDivElement>(null);
  const pinned = React.useRef(false);
  const minRef = React.useRef(min);
  React.useEffect(() => {
    minRef.current = min;
  }, [min]);

  React.useEffect(() => {
    if (!setMin) return;
    const apply = (next: boolean) => {
      if (minRef.current === next) return;
      minRef.current = next;
      setMin(next);
    };
    const onScroll = () => {
      if (window.scrollY > DOCK_MIN_AT) {
        apply(true);
        pinned.current = false;
      } else if (window.scrollY < DOCK_OPEN_AT && !pinned.current) {
        apply(false);
      }
    };
    const el = ref.current;
    const onPin = () => {
      pinned.current = true;
      apply(true);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    el?.addEventListener(DOCK_PIN_EVENT, onPin);
    return () => {
      window.removeEventListener('scroll', onScroll);
      el?.removeEventListener(DOCK_PIN_EVENT, onPin);
      setMin(false);
    };
  }, [setMin]);

  // Mantém a altura da página: o que o cartão perde ao encolher vira espaço no fim (--i360-lost), para o
  // documento não encolher junto, a rolagem não ser empurrada e o cartão não reabrir sozinho.
  React.useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === 'undefined') return;
    let full = el.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (!minRef.current) full = el.offsetHeight;
      host.style.setProperty('--i360-lost', `${Math.max(0, full - el.offsetHeight)}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      host.style.removeProperty('--i360-lost');
    };
  }, []);

  return (
    <div ref={ref} className={min ? 'i360-head min' : 'i360-head'} data-i360-head="" data-min={min ? 'true' : 'false'}>
      {children}
    </div>
  );
};

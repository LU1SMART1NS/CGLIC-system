import React from 'react';
import { useMediaQuery } from '../../design-system/hooks/useMediaQuery';
import { DOCK_MIN_AT, DOCK_OPEN_AT, DOCK_PIN_EVENT, PHONE_BAR_H, PHONE_QUERY, useInstrument360Dock } from './instrument360Dock';

/**
 * Bloco que gruda no alto das telas 360 (Ata, Contrato e Item): o cartão do topo e a barra de abas.
 * Ao rolar, o cartão encolhe até virar a faixa azul com o nome em cima e as abas embaixo; ao voltar ao
 * topo, abre de novo. O encolhimento é só visual (classes no CSS); aqui fica a regra de quando acontece.
 * O conteúdo da aba (`Instrument360TabPanel`) tem de ser o irmão seguinte.
 *
 * Com `resumoNoCelular`, no celular o cartão não gruda nem encolhe: ele é resumido, rola com a página e, quando
 * sai inteiro da tela, aparece a barra azul (desenhada pelo cartão no lugar reservado aqui) com as abas grudadas
 * logo abaixo. No computador nada muda.
 */
export const Instrument360Head: React.FC<{ children: React.ReactNode; resumoNoCelular?: boolean }> = ({ children, resumoNoCelular = false }) => {
  const dock = useInstrument360Dock();
  const isPhoneScreen = useMediaQuery(PHONE_QUERY);
  const phone = resumoNoCelular && isPhoneScreen && Boolean(dock);
  const min = phone ? false : (dock?.min ?? false);
  const setMin = phone ? undefined : dock?.setMin;
  const setPhone = dock?.setPhone;
  const ref = React.useRef<HTMLDivElement>(null);
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const [phoneDocked, setPhoneDocked] = React.useState(false);

  // Celular: a barra aparece quando as abas chegam logo abaixo dela, isto é, quando o cartão já saiu da tela.
  React.useEffect(() => {
    if (!phone) return;
    const el = ref.current;
    const onScroll = () => {
      const tablist = el?.querySelector<HTMLElement>('[role="tablist"]');
      if (!tablist) return;
      const headerHeight = parseFloat(getComputedStyle(tablist).getPropertyValue('--app-header-h')) || 0;
      setPhoneDocked(tablist.getBoundingClientRect().top <= headerHeight + PHONE_BAR_H + 1);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      setPhoneDocked(false);
    };
  }, [phone]);

  React.useEffect(() => {
    if (!setPhone) return;
    setPhone({ active: phone, docked: phone && phoneDocked, slot: phone ? slot : null });
  }, [setPhone, phone, phoneDocked, slot]);
  React.useEffect(() => () => setPhone?.({ active: false, docked: false, slot: null }), [setPhone]);
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
    if (phone || !el || !host || typeof ResizeObserver === 'undefined') return;
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
  }, [phone]);

  if (phone) {
    return (
      <div ref={ref} className="i360-head i360-head--resumo" data-i360-head="" data-min="false" data-phone="true">
        <div ref={setSlot} className={phoneDocked ? 'i360-pbar on' : 'i360-pbar'} data-testid="instrument-360-phone-bar" aria-hidden={!phoneDocked} />
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={min ? 'i360-head min' : 'i360-head'} data-i360-head="" data-min={min ? 'true' : 'false'}>
      {children}
    </div>
  );
};

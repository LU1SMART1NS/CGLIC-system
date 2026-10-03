import React from 'react';
import { createPortal } from 'react-dom';
import { MODAL_Z_INDEX } from './Modal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { breakpoints } from '../tokens';

export interface AnchoredPanelProps {
  /** Retângulo da âncora (getBoundingClientRect do botão que abriu o painel). */
  anchorRect: DOMRect;
  onClose: () => void;
  ariaLabel: string;
  testId?: string;
  /** Largura máxima do popover no desktop (padrão 340px, limitada à tela). */
  width?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const MARGIN = 8;
const GAP = 6;

/**
 * Painel ancorado a um botão. Desktop: popover com detecção de colisão (abre para cima
 * quando falta espaço, limita a largura à tela e rola por dentro), que fecha com Esc,
 * clique fora e rolagem de ancestrais da âncora (a rolagem interna do painel é ignorada).
 * Celular (<768px ou toque): bottom sheet com overlay, que não fecha em resize/scroll
 * (o teclado virtual dispara resize ao focar um campo).
 */
export const AnchoredPanel: React.FC<AnchoredPanelProps> = ({
  anchorRect,
  onClose,
  ariaLabel,
  testId,
  width = 340,
  style,
  children
}) => {
  const isNarrow = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);
  const isCoarse = useMediaQuery('(pointer: coarse)');
  const asSheet = isNarrow || isCoarse;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<{ top?: number; bottom?: number; maxHeight: number } | null>(null);

  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    if (asSheet) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = previousOverflow;
      };
    }
    const onPointer = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onScroll = (e: Event) => {
      // Rolagem dentro do próprio painel (lista longa) não deve fechá-lo.
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      onCloseRef.current();
    };
    const onResize = () => onCloseRef.current();
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [asSheet]);

  // Posição vertical: abaixo da âncora; acima quando não cabe e há mais espaço lá.
  React.useLayoutEffect(() => {
    if (asSheet) return;
    const natural = panelRef.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - anchorRect.bottom - GAP - MARGIN;
    const spaceAbove = anchorRect.top - GAP - MARGIN;
    if (natural <= spaceBelow || spaceBelow >= spaceAbove) {
      setPlacement({ top: anchorRect.bottom + GAP, maxHeight: Math.max(160, spaceBelow) });
    } else {
      setPlacement({ bottom: window.innerHeight - anchorRect.top + GAP, maxHeight: Math.max(160, spaceAbove) });
    }
  }, [asSheet, anchorRect]);

  if (typeof document === 'undefined') return null;

  if (asSheet) {
    return createPortal(
      <div
        className="ds-anchored-sheet-overlay"
        style={{ zIndex: MODAL_Z_INDEX + 50 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          data-testid={testId}
          className="ds-anchored-sheet"
          style={{
            background: '#ffffff',
            borderTop: '1px solid #cbd5e1',
            boxShadow: '0 -10px 25px rgba(15, 23, 42, 0.18)',
            padding: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
            textAlign: 'left',
            whiteSpace: 'normal',
            ...style
          }}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  const panelWidth = Math.min(width, window.innerWidth - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(anchorRect.right - panelWidth, window.innerWidth - panelWidth - MARGIN));

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        position: 'fixed',
        zIndex: MODAL_Z_INDEX + 50,
        width: `${panelWidth}px`,
        left,
        top: placement?.top ?? anchorRect.bottom + GAP,
        bottom: placement?.bottom,
        maxHeight: placement?.maxHeight,
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
        padding: '0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        textAlign: 'left',
        whiteSpace: 'normal',
        ...style
      }}
    >
      {children}
    </div>,
    document.body
  );
};

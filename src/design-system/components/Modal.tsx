import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colors, shapes, typography } from '../tokens';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Botões do rodapé (alinhados à direita). */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Impede fechar por Esc/clique fora (ex.: durante gravação). */
  dismissible?: boolean;
  testId?: string;
  children: React.ReactNode;
}

const WIDTHS = { sm: '420px', md: '560px', lg: '760px', xl: '1040px' } as const;

/**
 * Camada única de modais. Layout e responsividade em index.css (.ds-modal*): em ≤480px o painel
 * vira bottom sheet de altura quase total, com rodapé fixo e botões empilhados de 44px.
 * Coloque as ações na prop `footer` (fixa), não no fim do corpo.
 */
/** Camada única de modais: mesmo z-index, Esc para fechar, foco inicial e rolagem do fundo travada. */
export const MODAL_Z_INDEX = 1000;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  footer,
  size = 'md',
  dismissible = true,
  testId = 'modal',
  children
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // onClose costuma ser recriada a cada render do chamador (arrow function inline).
  // Mantida numa ref para não disparar o efeito abaixo a cada tecla digitada no
  // modal — do contrário, o cleanup rouba o foco de volta para o elemento que
  // abriu o modal a cada re-render, interrompendo a digitação nos campos.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, dismissible]);

  if (!isOpen) return null;

  return createPortal(
    <div
      data-testid={`${testId}-overlay`}
      className="ds-modal-overlay"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      style={{ zIndex: MODAL_Z_INDEX, background: colors.background.overlay }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="ds-modal"
        style={{
          maxWidth: WIDTHS[size],
          background: colors.background.surface,
          borderRadius: shapes.radius.lg
        }}
      >
        <header className="ds-modal__header">
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: typography.fontSize.h3, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '0.25rem 0 0', fontSize: typography.fontSize.bodySm, color: colors.text.muted }}>{subtitle}</p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="ds-modal__close"
              style={{ color: colors.text.muted }}
            >
              <X size={18} />
            </button>
          )}
        </header>
        <div className="ds-modal__body">{children}</div>
        {footer && (
          <footer className="ds-modal__footer">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};

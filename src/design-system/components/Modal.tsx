import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colors, shapes, spacing, typography } from '../tokens';

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

  React.useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, dismissible, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      data-testid={`${testId}-overlay`}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: MODAL_Z_INDEX,
        background: colors.background.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        style={{
          width: '100%',
          maxWidth: WIDTHS[size],
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: colors.background.surface,
          borderRadius: shapes.radius.lg,
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
          outline: 'none'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.md,
            padding: `${spacing.md} ${spacing.lg}`,
            borderBottom: `1px solid ${colors.border.default}`
          }}
        >
          <div>
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.muted, padding: '4px', display: 'inline-flex' }}
            >
              <X size={18} />
            </button>
          )}
        </header>
        <div style={{ padding: spacing.lg, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: spacing.sm,
              padding: `${spacing.md} ${spacing.lg}`,
              borderTop: `1px solid ${colors.border.default}`
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};

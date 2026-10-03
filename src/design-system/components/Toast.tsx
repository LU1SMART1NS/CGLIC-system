import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { colors, shapes, spacing, typography } from '../tokens';
import { MODAL_Z_INDEX } from './Modal';

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, danger: AlertCircle, warning: AlertCircle, info: Info } as const;

/** Substitui `alert()`. Envolva a aplicação uma vez; use `useToast()` nos componentes. */
export const ToastProvider: React.FC<{ children: React.ReactNode; durationMs?: number }> = ({ children, durationMs = 5000 }) => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);

  const show = React.useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setItems((cur) => [...cur, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss, durationMs]
  );

  const api = React.useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'danger') }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div
          aria-live="polite"
          className="ds-toast-region"
          style={{ zIndex: MODAL_Z_INDEX + 100 }}
        >
          {items.map((t) => {
            const token = colors.semantic[t.tone];
            const Icon = ICONS[t.tone];
            return (
              <div
                key={t.id}
                role={t.tone === 'danger' ? 'alert' : 'status'}
                data-testid={`toast-${t.tone}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.md}`,
                  background: token.bg,
                  border: `1px solid ${token.border}`,
                  color: token.text,
                  borderRadius: shapes.radius.md,
                  fontSize: typography.fontSize.bodySm,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)'
                }}
              >
                <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{t.message}</span>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => dismiss(t.id)}
                  className="ds-toast__close"
                  style={{ color: 'inherit' }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

const NOOP_TOAST: ToastApi = { show: () => {}, success: () => {}, error: () => {} };

/** Sem provider (ex.: testes de renderização estática) os avisos são descartados. */
export function useToast(): ToastApi {
  return React.useContext(ToastContext) ?? NOOP_TOAST;
}

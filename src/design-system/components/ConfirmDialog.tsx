import React from 'react';
import { AppButton } from './AppButton';
import { Modal } from './Modal';
import { colors, typography } from '../tokens';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" para ações destrutivas (excluir, desvincular). */
  tone?: 'default' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Substitui `window.confirm`. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  isLoading = false,
  onConfirm,
  onCancel
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    size="sm"
    dismissible={!isLoading}
    testId="confirm-dialog"
    footer={
      <>
        <AppButton variant="outline" onClick={onCancel} disabled={isLoading}>
          {cancelLabel}
        </AppButton>
        <AppButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </AppButton>
      </>
    }
  >
    <div style={{ fontSize: typography.fontSize.body, color: colors.text.secondary, lineHeight: 1.5 }}>{message}</div>
  </Modal>
);

/**
 * Hook para usar o diálogo de forma imperativa:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title, message, tone: 'danger' }))) return;
 *   ... renderize {dialog} no JSX.
 */
export function useConfirm() {
  const [state, setState] = React.useState<
    (Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'> & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel' | 'isLoading'>) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    []
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = state ? (
    <ConfirmDialog {...state} isOpen onConfirm={() => close(true)} onCancel={() => close(false)} />
  ) : null;

  return { confirm, dialog };
}

type ConfirmOptions = Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel' | 'isLoading'>;
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Monta um único diálogo para a aplicação toda; use `useConfirmDialog()` em qualquer componente. */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { confirm, dialog } = useConfirm();
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog}
    </ConfirmContext.Provider>
  );
};

/** `await confirm({ title, message, tone: 'danger' })`. Sem provider (ex.: testes estáticos) nega a ação. */
export function useConfirmDialog(): ConfirmFn {
  return React.useContext(ConfirmContext) ?? (() => Promise.resolve(false));
}

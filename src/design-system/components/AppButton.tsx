import React, { type ButtonHTMLAttributes } from 'react';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'ghostDanger' | 'success' | 'link';
export type AppButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
  /** Ocupa toda a largura do contêiner (telas de acesso, rodapés de cartão no celular). */
  fullWidth?: boolean;
  /**
   * Botão quadrado só com ícone, para linhas densas de tabela. Sem texto visível, o nome acessível vem de
   * `aria-label` (ou, na falta dele, de `title`); informe sempre um dos dois.
   */
  iconOnly?: boolean;
}

/**
 * Único botão de ação do sistema. Cores, alturas (xs 24 / sm 32 / md 36 / lg 48), hover e foco
 * ficam em CSS (.ds-btn em index.css) e leem os tokens de cor; aqui só escolhemos as classes.
 * Não estilize `<button>` solto: use este componente (variante `link` para ação em texto).
 */
export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'primary', size = 'md', icon, isLoading, iconOnly = false, fullWidth = false, disabled, children, className, ...rest }, ref) => {
    const classes = [
      'ds-btn',
      `ds-btn--${variant}`,
      `ds-btn--${size}`,
      iconOnly ? 'ds-btn--icon' : '',
      fullWidth ? 'ds-btn--block' : '',
      className ?? ''
    ].filter(Boolean).join(' ');

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={classes}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...rest}
        aria-label={rest['aria-label'] ?? (iconOnly ? rest.title : undefined)}
      >
        {isLoading && <span className="ds-btn__spinner" aria-hidden="true" />}
        {!isLoading && icon && <span className="ds-btn__icon">{icon}</span>}
        {!iconOnly && children}
      </button>
    );
  }
);
AppButton.displayName = 'AppButton';

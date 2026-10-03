import React from 'react';
import { AppButton, type AppButtonProps } from './AppButton';

export interface IconButtonProps extends Omit<AppButtonProps, 'iconOnly' | 'icon' | 'children' | 'aria-label'> {
  /** Nome acessível (obrigatório): também vira o `title` quando nenhum for informado. */
  label: string;
  icon: React.ReactNode;
  pressed?: boolean;
  expanded?: boolean;
}

/**
 * Botão só com ícone. O visual segue compacto, mas em telas de toque a área clicável chega
 * a 44x44 (ver .ds-btn). Substitui os botões soltos `background: none; padding: 2px`.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, pressed, expanded, variant = 'ghost', size = 'sm', title, ...rest }, ref) => (
    <AppButton
      ref={ref}
      iconOnly
      variant={variant}
      size={size}
      icon={icon}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      {...rest}
    />
  )
);
IconButton.displayName = 'IconButton';

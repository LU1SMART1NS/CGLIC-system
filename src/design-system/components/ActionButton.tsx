import React from 'react';
import { ACTIONS, type ActionId } from '../actions';
import { AppButton, type AppButtonProps } from './AppButton';
import { IconButton } from './IconButton';

export interface ActionButtonProps extends Omit<AppButtonProps, 'variant' | 'icon' | 'iconOnly' | 'children'> {
  /** Ação do catálogo (src/design-system/actions.ts): define ícone, rótulo padrão e cor. */
  action: ActionId;
  /** Troca o texto (ou o nome acessível, se for só ícone) mantendo o ícone e a cor da ação. */
  label?: string;
  /** Só o ícone, com o rótulo como nome acessível e dica. */
  iconOnly?: boolean;
  /** Texto do botão quando precisa de mais que o rótulo (ex.: contagem). Ignorado se for só ícone. */
  children?: React.ReactNode;
  pressed?: boolean;
  expanded?: boolean;
}

/**
 * Botão de ação padronizado. A cor vem do catálogo, nunca do ponto de uso, para a mesma ação
 * ficar igual em todas as telas. Para ação fora do catálogo, acrescente-a lá ou use `AppButton`.
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ action, label, iconOnly = false, children, size, pressed, expanded, ...rest }, ref) => {
    const def = ACTIONS[action];
    const Icon = def.icon;
    const text = label ?? def.label;

    if (iconOnly) {
      const variant = def.variant === 'ghostDanger' ? 'ghostDanger' : 'ghost';
      return (
        <IconButton
          ref={ref}
          label={text}
          icon={<Icon size={15} aria-hidden="true" />}
          variant={variant}
          size={size ?? 'sm'}
          pressed={pressed}
          expanded={expanded}
          {...rest}
        />
      );
    }
    return (
      <AppButton ref={ref} variant={def.variant} size={size ?? 'md'} icon={<Icon size={14} aria-hidden="true" />} aria-expanded={expanded} aria-pressed={pressed} {...rest}>
        {children ?? text}
      </AppButton>
    );
  }
);
ActionButton.displayName = 'ActionButton';

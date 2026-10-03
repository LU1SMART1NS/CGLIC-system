import React, { type ButtonHTMLAttributes } from 'react';
import { shapes, spacing, typography } from '../tokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'ghostDanger';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
  /**
   * Botão quadrado só com ícone, para linhas densas de tabela. Sem texto visível, o nome acessível vem de
   * `aria-label` (ou, na falta dele, de `title`); informe sempre um dos dois.
   */
  iconOnly?: boolean;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'primary', size = 'md', icon, isLoading, iconOnly = false, disabled, children, className, style, ...rest }, ref) => {
    
    // Hover e foco ficam em CSS (.ds-btn em index.css): hover só em dispositivos com mouse
    // e foco só por teclado (:focus-visible), sem estado React por botão.
    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'secondary':
          return {
            backgroundColor: '#f1f5f9',
            color: '#0f172a',
            border: '1px solid #cbd5e1'
          };
        case 'outline':
          return {
            backgroundColor: '#ffffff',
            color: '#0c326f',
            border: '1px solid #cbd5e1'
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: '#475569',
            border: '1px solid transparent'
          };
        case 'ghostDanger':
          // Ação destrutiva discreta: só texto em vermelho; ganha fundo avermelhado ao passar o mouse.
          return {
            backgroundColor: 'transparent',
            color: '#b91c1c',
            border: '1px solid transparent'
          };
        case 'danger':
          return {
            backgroundColor: '#ef4444',
            color: '#ffffff',
            border: '1px solid transparent'
          };
        case 'primary':
        default:
          return {
            backgroundColor: '#0c326f',
            color: '#ffffff',
            border: '1px solid transparent'
          };
      }
    };

    const getSizeStyles = (): React.CSSProperties => {
      if (iconOnly) {
        const side = size === 'lg' ? '44px' : size === 'sm' ? '32px' : '36px';
        return { width: side, height: side, padding: 0, fontSize: size === 'sm' ? '0.75rem' : '0.85rem' };
      }
      switch (size) {
        case 'sm':
          return {
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
          };
        case 'lg':
          return {
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
          };
        case 'md':
        default:
          return {
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
          };
      }
    };

    const baseStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      fontWeight: 700,
      fontFamily: typography.fontFamily.sans,
      borderRadius: '6px',
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: shapes.transition.fast,
      boxSizing: 'border-box'
    };

    const combinedStyles = {
      ...baseStyles,
      ...getVariantStyles(),
      ...getSizeStyles(),
      ...style
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={combinedStyles}
        className={`ds-btn ds-btn--${variant}${className ? ` ${className}` : ''}`}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...rest}
        aria-label={rest['aria-label'] ?? (iconOnly ? rest.title : undefined)}
      >
        {isLoading && (
          <span style={{ 
            display: 'inline-block', 
            width: '1em', 
            height: '1em', 
            border: '2px solid currentColor', 
            borderRightColor: 'transparent', 
            borderRadius: '50%', 
            animation: 'spin 0.75s linear infinite' 
          }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </span>
        )}
        {!isLoading && icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
        {!iconOnly && children}
      </button>
    );
  }
);
AppButton.displayName = 'AppButton';

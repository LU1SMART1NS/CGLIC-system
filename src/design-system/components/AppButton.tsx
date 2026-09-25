import React, { type ButtonHTMLAttributes } from 'react';
import { shapes, spacing, typography } from '../tokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'primary', size = 'md', icon, isLoading, disabled, children, className, style, ...rest }, ref) => {
    
    const [isHovered, setIsHovered] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'secondary':
          return {
            backgroundColor: isHovered && !disabled ? '#e2e8f0' : '#f1f5f9',
            color: '#0f172a',
            border: '1px solid #cbd5e1'
          };
        case 'outline':
          return {
            backgroundColor: isHovered && !disabled ? '#f8fafc' : '#ffffff',
            color: '#0c326f',
            border: '1px solid #cbd5e1'
          };
        case 'ghost':
          return {
            backgroundColor: isHovered && !disabled ? '#f1f5f9' : 'transparent',
            color: '#475569',
            border: '1px solid transparent'
          };
        case 'danger':
          return {
            backgroundColor: isHovered && !disabled ? '#dc2626' : '#ef4444',
            color: '#ffffff',
            border: '1px solid transparent'
          };
        case 'primary':
        default:
          return {
            backgroundColor: isHovered && !disabled ? '#08214d' : '#0c326f',
            color: '#ffffff',
            border: '1px solid transparent'
          };
      }
    };

    const getSizeStyles = (): React.CSSProperties => {
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
      outline: isFocused ? '2px solid #0284c7' : 'none',
      outlineOffset: '2px',
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
        className={className}
        onMouseEnter={(e) => { setIsHovered(true); rest.onMouseEnter?.(e); }}
        onMouseLeave={(e) => { setIsHovered(false); rest.onMouseLeave?.(e); }}
        onFocus={(e) => { setIsFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setIsFocused(false); rest.onBlur?.(e); }}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...rest}
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
        {children}
      </button>
    );
  }
);
AppButton.displayName = 'AppButton';

import React from 'react';

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

const FieldShell: React.FC<FieldShellProps> = ({ id, label, hint, error, className, children }) => (
  <div className={`ds-field${className ? ` ${className}` : ''}`}>
    {label && (
      <label htmlFor={id} className="ds-field__label">
        {label}
      </label>
    )}
    {children}
    {hint && !error && (
      <span id={`${id}-hint`} className="ds-field__hint">
        {hint}
      </span>
    )}
    {error && (
      <span id={`${id}-error`} role="alert" className="ds-field__error">
        {error}
      </span>
    )}
  </div>
);

interface CommonProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Classe aplicada ao contêiner (label + campo), não ao campo. */
  containerClassName?: string;
}

const describedBy = (id: string, hint?: string, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

/** Campo de texto com label associado (id automático), 16px e 44px de altura em telas estreitas. */
export const AppInput = React.forwardRef<HTMLInputElement, CommonProps & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ label, hint, error, containerClassName, id, className, ...rest }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    return (
      <FieldShell id={fieldId} label={label} hint={hint} error={error} className={containerClassName}>
        <input
          ref={ref}
          id={fieldId}
          className={`ds-field__control${className ? ` ${className}` : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
AppInput.displayName = 'AppInput';

export const AppSelect = React.forwardRef<HTMLSelectElement, CommonProps & React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ label, hint, error, containerClassName, id, className, children, ...rest }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    return (
      <FieldShell id={fieldId} label={label} hint={hint} error={error} className={containerClassName}>
        <select
          ref={ref}
          id={fieldId}
          className={`ds-field__control${className ? ` ${className}` : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  }
);
AppSelect.displayName = 'AppSelect';

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, CommonProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, hint, error, containerClassName, id, className, ...rest }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    return (
      <FieldShell id={fieldId} label={label} hint={hint} error={error} className={containerClassName}>
        <textarea
          ref={ref}
          id={fieldId}
          className={`ds-field__control${className ? ` ${className}` : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...rest}
        />
      </FieldShell>
    );
  }
);
AppTextarea.displayName = 'AppTextarea';

import React from 'react';
import { dataBRparaISO, isoParaBR, mascaraDataBR, mascaraMesBR, mesBRparaISO } from '../../utils/mascaras';

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

type AppDateInputProps = CommonProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> & {
    /** aaaa-mm-dd (ou aaaa-mm com `mes`); '' enquanto a data estiver incompleta ou não existir. */
    value: string;
    onValueChange: (iso: string) => void;
    min?: string;
    max?: string;
    /** Só mês e ano (mm/aaaa). */
    mes?: boolean;
  };

/**
 * Data digitada dd/mm/aaaa (ou mm/aaaa) no lugar do calendário do navegador, que em alguns ambientes não deixa
 * escolher o dia. Recebe e devolve ISO, como o `type="date"`; data inexistente ou fora de min/max aparece no campo.
 */
export const AppDateInput: React.FC<AppDateInputProps> = ({ value, onValueChange, min, max, mes = false, label, hint, error, containerClassName, id, className, ...rest }) => {
  const auto = React.useId();
  const fieldId = id ?? auto;
  const ref = React.useRef<HTMLInputElement>(null);
  const [texto, setTexto] = React.useState(() => isoParaBR(value));
  const [emitido, setEmitido] = React.useState(value);
  // Valor trocado por fora (limpar o formulário, data sugerida): o campo mostra o novo.
  if (value !== emitido) {
    setEmitido(value);
    setTexto(isoParaBR(value));
  }
  const iso = mes ? mesBRparaISO(texto) : dataBRparaISO(texto);
  const completo = texto.replace(/\D/g, '').length === (mes ? 6 : 8);
  const erroDaData =
    completo && !iso
      ? mes ? 'Mês inválido.' : 'Data inválida.'
      : iso && min && iso < min
        ? `A partir de ${isoParaBR(min)}.`
        : iso && max && iso > max
          ? `Até ${isoParaBR(max)}.`
          : undefined;
  React.useEffect(() => {
    ref.current?.setCustomValidity(erroDaData ?? '');
  }, [erroDaData]);
  const erro = error ?? erroDaData;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={erro} className={containerClassName}>
      <input
        ref={ref}
        id={fieldId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={mes ? 'mm/aaaa' : 'dd/mm/aaaa'}
        maxLength={mes ? 7 : 10}
        className={`ds-field__control${className ? ` ${className}` : ''}`}
        aria-invalid={erro ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, erro)}
        {...rest}
        value={texto}
        onChange={(e) => {
          const novo = mes ? mascaraMesBR(e.target.value) : mascaraDataBR(e.target.value);
          const novoIso = mes ? mesBRparaISO(novo) : dataBRparaISO(novo);
          setTexto(novo);
          setEmitido(novoIso);
          onValueChange(novoIso);
        }}
      />
    </FieldShell>
  );
};

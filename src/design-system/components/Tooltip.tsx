import React from 'react';

export interface TooltipProps {
  /** Texto da dica. */
  content: string;
  /** Um único elemento focável (botão, link, ícone com tabIndex=0). */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

/**
 * Dica acessível: aparece com hover (mouse), foco (teclado) e toque/clique (celular), e fecha
 * com Esc, novo toque ou toque fora. Use no lugar de `title` quando a informação importa,
 * pois `title` não aparece em telas de toque.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const id = React.useId();
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const wrapperRef = React.useRef<HTMLSpanElement>(null);
  const visible = hover || focus || pinned;

  React.useEffect(() => {
    if (!pinned) return;
    const onDown = (e: Event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  const child = React.Children.only(children);

  return (
    <span
      ref={wrapperRef}
      className="ds-tooltip"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setHover(false);
          setPinned(false);
          setFocus(false);
        }
      }}
    >
      {React.cloneElement(child, {
        'aria-describedby': visible ? id : undefined,
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
          setFocus(true);
          child.props.onFocus?.(e);
        },
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          setFocus(false);
          child.props.onBlur?.(e);
        },
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          setPinned((p) => !p);
          child.props.onClick?.(e);
        }
      })}
      {visible && (
        <span id={id} role="tooltip" className="ds-tooltip__bubble">
          {content}
        </span>
      )}
    </span>
  );
};

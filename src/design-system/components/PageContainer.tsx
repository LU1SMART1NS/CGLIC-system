import React from 'react';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Largura máxima do conteúdo (px ou string CSS). Padrão: nenhuma — todas as telas usam a largura toda, com a mesma margem. */
  maxWidth?: number | string;
  children: React.ReactNode;
}

/**
 * Contêiner de página: NÃO define padding lateral nem largura máxima por padrão, para que todas as telas
 * comecem e terminem no mesmo lugar (antes cada tela tinha um limite centralizado e a folga lateral mudava).
 * O gutter horizontal vem uma única vez do <main className="app-main"> (--page-gutter),
 * para não somar paddings em telas estreitas.
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  maxWidth = 'none',
  className,
  style,
  children,
  ...rest
}) => (
  <div
    {...rest}
    className={`ds-page ${className ?? ''}`.trim()}
    style={{
      width: '100%',
      maxWidth,
      margin: '0 auto',
      padding: '0.75rem 0 2rem',
      ...style
    }}
  >
    {children}
  </div>
);

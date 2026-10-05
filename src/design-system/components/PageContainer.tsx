import React from 'react';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Largura máxima do conteúdo (px ou string CSS). */
  maxWidth?: number | string;
  children: React.ReactNode;
}

/**
 * Contêiner de página: limita a largura e centraliza, mas NÃO define padding lateral.
 * O gutter horizontal vem uma única vez do <main className="app-main"> (--page-gutter),
 * para não somar paddings em telas estreitas.
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  maxWidth = 1600,
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

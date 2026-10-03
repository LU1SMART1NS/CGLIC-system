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
  style,
  children,
  ...rest
}) => (
  <div
    {...rest}
    style={{
      width: '100%',
      maxWidth,
      margin: '0 auto',
      padding: '1.5rem 0 3rem',
      ...style
    }}
  >
    {children}
  </div>
);

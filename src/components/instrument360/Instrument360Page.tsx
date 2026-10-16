import React from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { Instrument360DockProvider } from './Instrument360DockProvider';

/**
 * Casca das telas de detalhe (Ata, Contrato e Item): mesma largura e margens das demais telas.
 * Também é usada pelos estados de página inteira (carregando, erro, acesso negado).
 * O gutter horizontal vem do <main> (--page-gutter); aqui só o respiro vertical.
 */
export const Instrument360Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <PageContainer data-testid="instrument-page" style={{ paddingBottom: 'calc(2rem + var(--i360-lost, 0px))' }}>
    <Instrument360DockProvider>{children}</Instrument360DockProvider>
  </PageContainer>
);

import React from 'react';
import { EmptyState } from '../../design-system/components/EmptyState';

/**
 * No lugar do "Nenhum…" de uma lista vazia quando a leitura dela falhou: a lista não está vazia, ela não carregou.
 * A faixa "não carregou" (FontesComFalhaAviso), acima, tem o "Tentar novamente".
 */
export const ListaNaoCarregou: React.FC<{ titulo: string; testId?: string }> = ({ titulo, testId = 'lista-nao-carregou' }) => (
  <EmptyState
    title={titulo}
    description="A leitura do banco falhou; não quer dizer que a lista está vazia. Use “Tentar novamente” no aviso acima."
    testId={testId}
  />
);

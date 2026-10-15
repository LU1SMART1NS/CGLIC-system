import React from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { DIAS_NOVIDADE } from './carteiraNovidade';

/** Etiqueta "Nova" (ata) ou "Novo" (contrato, item) para o que começou há no máximo 45 dias. */
export const CarteiraNovoBadge: React.FC<{ genero: 'f' | 'm'; testId?: string }> = ({ genero, testId }) => (
  <span
    data-testid={testId}
    title={`${genero === 'f' ? 'Assinada' : 'Assinado'} há menos de ${DIAS_NOVIDADE} dias`}
    style={{ display: 'inline-flex' }}
  >
    <StatusBadge label={genero === 'f' ? 'Nova' : 'Novo'} variant="success" size="sm" dot={false} />
  </span>
);

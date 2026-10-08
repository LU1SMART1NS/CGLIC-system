import React from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import type { OrigemVinculo } from '../../types/arpContractLinks';

/**
 * Quem fez o vínculo entre o item da ata e o contrato. O do sistema sempre aparece; o feito pela equipe só onde a
 * tela pede (`mostrarManual`), porque em outras telas "Manual" já significa contrato digitado à mão.
 */
export const OrigemVinculoBadge: React.FC<{ origem?: OrigemVinculo; mostrarManual?: boolean }> = ({ origem, mostrarManual = false }) => {
  if (origem === 'AUTOMATICO') {
    return (
      <span title="Vinculado pelo sistema: mesma compra, mesmo fornecedor e o item do contrato está nesta ata." data-testid="vinculo-origem-automatico">
        <StatusBadge label="Vinculado pelo sistema" variant="info" size="sm" dot={false} />
      </span>
    );
  }
  if (origem === 'MANUAL' && mostrarManual) {
    return (
      <span title="Vinculado por alguém da equipe." data-testid="vinculo-origem-manual">
        <StatusBadge label="Vinculado à mão" variant="neutral" size="sm" dot={false} />
      </span>
    );
  }
  return null;
};

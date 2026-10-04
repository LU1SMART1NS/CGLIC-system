import React from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';
import { CONTRACTS_PARTIAL_RETRY_MS } from '../../hooks/useContractsDashboard';

interface ContractsPartialNoticeProps {
  /** Tentar de novo agora, sem esperar a próxima tentativa automática. */
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Aviso de lista de contratos incompleta: uma das fontes (Contratos.gov.br ou Compras.gov.br) não
 * respondeu. Os totais abaixo do real mudam sozinhos quando a lista vier completa.
 */
export const ContractsPartialNotice: React.FC<ContractsPartialNoticeProps> = ({ onRetry, isRetrying = false }) => (
  <NoticeBar
    tone="warning"
    testId="contracts-partial-notice"
    action={
      <AppButton variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Tentando…' : 'Tentar agora'}
      </AppButton>
    }
  >
    A lista de contratos está incompleta: uma das fontes oficiais não respondeu. Os totais podem estar abaixo do real.
    Nova tentativa automática a cada {Math.round(CONTRACTS_PARTIAL_RETRY_MS / 1000)} segundos.
  </NoticeBar>
);

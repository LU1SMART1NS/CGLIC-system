import React from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';

interface ContractsPartialNoticeProps {
  /** Fontes que não responderam na última sincronização (ex.: "Contratos.gov.br"). */
  fontesComFalha?: string[];
  /** Última sincronização completa (todas as fontes responderam). */
  ultimoSucessoEm?: string | null;
  /** Só para o coordenador: atualizar agora com as fontes oficiais. */
  onRetry?: () => void;
  isRetrying?: boolean;
}

function formatarData(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Aviso de que a última sincronização dos contratos saiu incompleta: uma das fontes oficiais não
 * respondeu. Os contratos que já estavam no banco continuam aparecendo; o que mudou só na fonte que
 * falhou pode não estar refletido.
 */
export const ContractsPartialNotice: React.FC<ContractsPartialNoticeProps> = ({
  fontesComFalha = [],
  ultimoSucessoEm,
  onRetry,
  isRetrying = false
}) => {
  const fontes = fontesComFalha.length > 0 ? fontesComFalha.join(' e ') : 'uma das fontes oficiais';
  const completa = formatarData(ultimoSucessoEm);
  return (
    <NoticeBar
      tone="warning"
      testId="contracts-partial-notice"
      action={
        onRetry ? (
          <AppButton variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Atualizando…' : 'Tentar agora'}
          </AppButton>
        ) : undefined
      }
    >
      A última atualização dos contratos ficou incompleta: {fontes} não respondeu.
      {completa ? ` A última atualização completa foi em ${completa}.` : ''} Os dados podem estar desatualizados.
    </NoticeBar>
  );
};

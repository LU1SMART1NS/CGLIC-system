import React from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';

interface AlocacoesFalhaNoticeProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Aviso de que as alocações às unidades internas (arp_allocations) não carregaram. Antes a falha caía na cópia do
 * navegador, que podia ser velha; agora a tela avisa: o alocado e o filtro Unidade ficam sem dado até a leitura dar certo.
 */
export const AlocacoesFalhaNotice: React.FC<AlocacoesFalhaNoticeProps> = ({ onRetry, isRetrying = false }) => (
  <NoticeBar
    tone="warning"
    testId="alocacoes-falha-notice"
    action={
      <AppButton variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Carregando…' : 'Tentar de novo'}
      </AppButton>
    }
  >
    Não foi possível carregar as alocações às unidades internas. Enquanto isso, o alocado aparece zerado e o filtro
    "Unidade" fica sem opções.
  </NoticeBar>
);

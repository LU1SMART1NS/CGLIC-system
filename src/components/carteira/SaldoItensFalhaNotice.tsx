import React from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';

interface SaldoItensFalhaNoticeProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Aviso de que o saldo dos itens (v_arp_item_saldo_detalhado) não carregou. Sem ele a situação da qtd. da ata
 * assinada fica desconhecida: o filtro "Qtd. assinada" deixa de filtrar até a leitura dar certo.
 */
export const SaldoItensFalhaNotice: React.FC<SaldoItensFalhaNoticeProps> = ({ onRetry, isRetrying = false }) => (
  <NoticeBar
    tone="warning"
    testId="saldo-itens-falha-notice"
    action={
      <AppButton variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Carregando…' : 'Tentar de novo'}
      </AppButton>
    }
  >
    Não foi possível carregar a situação dos itens. Enquanto isso, o filtro "Qtd. assinada" não filtra e o consumo do
    saldo pode aparecer em branco.
  </NoticeBar>
);

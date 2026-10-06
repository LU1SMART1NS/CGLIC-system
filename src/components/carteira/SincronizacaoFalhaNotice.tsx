import React from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';

interface SincronizacaoFalhaNoticeProps {
  /** O que foi sincronizado, para o texto: "das atas", "dos contratos". */
  assunto: string;
  /** Mensagem gravada na última tentativa que falhou. */
  mensagem?: string | null;
  /** Fontes que não responderam (sincronização parcial). */
  fontesComFalha?: string[];
  /** Hora da última tentativa que falhou. */
  falhaEm?: string | null;
  /** Última sincronização completa. */
  ultimoSucessoEm?: string | null;
  /** Só para o coordenador: tentar de novo agora. */
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
 * Aviso de que a última sincronização com as fontes oficiais falhou ou ficou incompleta. Os dados que
 * já estavam no banco continuam na tela; o aviso diz desde quando eles estão em dia.
 */
export const SincronizacaoFalhaNotice: React.FC<SincronizacaoFalhaNoticeProps> = ({
  assunto,
  mensagem,
  fontesComFalha = [],
  falhaEm,
  ultimoSucessoEm,
  onRetry,
  isRetrying = false
}) => {
  const quando = formatarData(falhaEm);
  const completa = formatarData(ultimoSucessoEm);
  const motivoBruto = mensagem || (fontesComFalha.length > 0 ? `${fontesComFalha.join(' e ')} não respondeu` : 'uma das fontes oficiais não respondeu');
  const motivo = /[.!?]$/.test(motivoBruto.trim()) ? motivoBruto.trim() : `${motivoBruto.trim()}.`;
  return (
    <NoticeBar
      tone="warning"
      testId="sincronizacao-falha-notice"
      action={
        onRetry ? (
          <AppButton variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Atualizando…' : 'Tentar de novo'}
          </AppButton>
        ) : undefined
      }
    >
      A última atualização {assunto}{quando ? ` (${quando})` : ''} não foi concluída: {motivo}
      {completa ? ` Os dados estão em dia até ${completa}.` : ' Os dados mostrados são os que já estavam gravados.'}
    </NoticeBar>
  );
};

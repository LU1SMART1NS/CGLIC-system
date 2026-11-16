import React, { useState } from 'react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';
import { formatDateBR } from '../../services/temporalEngineService';
import { useContratosExecucao } from '../../hooks/useContratosExecucao';
import { pendenciasDoFechamento } from '../../utils/contratoExecutado';
import { ConfirmarExecucaoModal } from './portfolio/ConfirmarExecucaoModal';

/** Faixa do Contrato 360 (migration 314): escopo cumprido a confirmar, ou já confirmado com o SEI do recebimento. */
export const EscopoCumpridoAviso: React.FC<{ contractKey: string; numero: string; fornecedor?: string }> = ({ contractKey, numero, fornecedor }) => {
  const { porContrato, podeDecidir } = useContratosExecucao();
  const [aberta, setAberta] = useState(false);
  const execucao = porContrato.get(contractKey);
  if (!execucao?.estado) return null;

  const executado = execucao.estado === 'EXECUTADO' && execucao.confirmado;
  if (!executado && !podeDecidir) return null;
  const fechamento = pendenciasDoFechamento(execucao);

  return (
    <>
      {executado ? (
        <NoticeBar
          tone="success"
          testId="contrato360-executado"
          action={podeDecidir ? <AppButton size="sm" variant="outline" onClick={() => setAberta(true)}>Ver conferência</AppButton> : undefined}
        >
          Escopo cumprido: confirmado por {executado.por} em {formatDateBR(executado.em)} (SEI {executado.sei}). O contrato está fora dos
          avisos de prorrogação.{fechamento.length > 0 && ' Falta anular o saldo de empenho.'}
        </NoticeBar>
      ) : (
        <NoticeBar
          tone="info"
          testId="contrato360-escopo-cumprido"
          action={<AppButton size="sm" variant="outline" onClick={() => setAberta(true)}>Conferir e confirmar</AppButton>}
        >
          {execucao.decisaoSuperada
            ? 'Chegou fatura, nota ou aditivo depois da última decisão, e as faturas pagas ainda somam o valor do contrato. Confira de novo o escopo cumprido.'
            : 'As faturas pagas somam o valor do contrato, sem fatura em aberto. Confirme o escopo cumprido para tirá-lo dos avisos de prorrogação.'}
        </NoticeBar>
      )}
      <ConfirmarExecucaoModal isOpen={aberta} numero={numero} fornecedor={fornecedor} execucao={execucao} onClose={() => setAberta(false)} />
    </>
  );
};

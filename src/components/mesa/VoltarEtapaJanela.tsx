import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';

/**
 * Janela "Voltar etapa", a mesma no pedido de emenda e no item da fiscalização: desfaz só o último passo, diz o que
 * sai e pede o motivo, que fica no histórico. Quem chama decide para onde volta e grava.
 */
export const VoltarEtapaJanela: React.FC<{
  /** Nome da etapa para onde volta; nulo quando não volta por aqui. */
  para: string | null;
  /** Linha de cima: o que é e onde está hoje. */
  contexto: React.ReactNode;
  /** O que é apagado ("o recebimento provisório de 05/11/2026, SEI 37530982"). */
  apaga: string | null;
  /** Por que não volta (quando `para` é nulo). */
  impede?: string | null;
  /** Onde o registro apagado continua visível. */
  ondeFica: string;
  exemplo: string;
  /** Mínimo de letras do motivo (a Fiscalização pede 10). */
  minimo?: number;
  salvando: boolean;
  onVoltar: (motivo: string) => void;
  onClose: () => void;
  testId: string;
}> = ({ para, contexto, apaga, impede, ondeFica, exemplo, minimo = 1, salvando, onVoltar, onClose, testId }) => {
  const curto = (m: string) => m.trim().length < minimo;
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const salvar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (!curto(motivo) && para) onVoltar(motivo.trim());
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvando}
      size="md"
      testId={testId}
      title={para ? `Voltar para "${para}"` : 'Voltar etapa'}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvando} />
          <AppButton type="submit" form={`${testId}-form`} variant="primary" disabled={salvando || !para} isLoading={salvando} data-testid={`${testId}-salvar`}>
            Voltar etapa
          </AppButton>
        </>
      }
    >
      <form id={`${testId}-form`} onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{contexto}</div>
        {para ? (
          <NoticeBar tone="warning" testId={`${testId}-apaga`}>
            Desfaz só o último passo. Será apagado: {apaga}. O registro fica no {ondeFica}.
          </NoticeBar>
        ) : (
          <NoticeBar tone="info" testId={`${testId}-nao`}>
            {impede ?? 'Esta etapa não volta por aqui.'}
          </NoticeBar>
        )}
        {para && (
          <AppTextarea
            label="Motivo"
            rows={2}
            placeholder={exemplo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            error={tentou && curto(motivo) ? (minimo > 1 ? `Informe o motivo (${minimo} letras ou mais).` : 'Informe o motivo.') : undefined}
            data-testid={`${testId}-motivo`}
          />
        )}
      </form>
    </Modal>
  );
};

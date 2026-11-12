import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { useDevolverCcga } from '../../hooks/useEmendas';
import { formatNumber } from '../../utils/format';
import { MOTIVOS_DEVOLUCAO_CCGA } from '../../services/emendasService';
import type { EnvioParaContratar } from '../../utils/emendasCcga';

interface Props {
  envio: EnvioParaContratar;
  /** Nome curto de cada item pela chave; sem nome, mostra o número do item. */
  nomeDoItem: (itemKey: string) => string;
  onClose: () => void;
}

const caixa: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.5rem 0.65rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' };

/**
 * O gestor da ata (ou o coordenador) devolve à CAEP os itens da sua ata, com motivo e explicação (D3, D4). Os itens
 * voltam para "Nota de empenho emitida" e a CAEP recebe o aviso; o resto do pedido continua na CCGA.
 */
export const DevolverCcgaModal: React.FC<Props> = ({ envio, nomeDoItem, onClose }) => {
  const devolver = useDevolverCcga();
  const toast = useToast();
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(envio.linhas.map((l) => l.linhaId!).filter(Boolean)));
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DEVOLUCAO_CCGA[0]);
  const [explicacao, setExplicacao] = useState('');
  const [tentou, setTentou] = useState(false);
  const numeroAta = envio.ataKey.split('-')[0];

  const pendencias: string[] = [];
  if (marcadas.size === 0) pendencias.push('pelo menos um item');
  if (!explicacao.trim()) pendencias.push('a explicação para a CAEP');

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await devolver.mutateAsync({ pedidoId: envio.pedidoId, linhas: [...marcadas], motivo, explicacao: explicacao.trim() });
      toast.success(`${envio.pedidoNome}: ${marcadas.size === 1 ? '1 item devolvido' : `${marcadas.size} itens devolvidos`} à CAEP.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!devolver.isPending}
      size="md"
      testId="emendas-ccga-devolver-modal"
      title="Devolver à CAEP"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={devolver.isPending} />
          <AppButton type="submit" form="emendas-ccga-devolver-form" variant="primary" disabled={devolver.isPending} isLoading={devolver.isPending} data-testid="emendas-ccga-devolver-salvar">
            {marcadas.size === 1 ? 'Devolver 1 item' : `Devolver ${marcadas.size} itens`}
          </AppButton>
        </>
      }
    >
      <form id="emendas-ccga-devolver-form" onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {envio.pedidoNome}
          {envio.autor ? ` · ${envio.autor}` : ''} · só os itens da ata {numeroAta}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Itens que voltam (os contratados não aparecem: não voltam)</legend>
          {envio.linhas.map((l) => (
            <label key={l.linhaId} style={caixa}>
              <input
                type="checkbox"
                checked={marcadas.has(l.linhaId!)}
                onChange={(e) =>
                  setMarcadas((m) => {
                    const prox = new Set(m);
                    if (e.target.checked) prox.add(l.linhaId!);
                    else prox.delete(l.linhaId!);
                    return prox;
                  })
                }
                style={{ marginTop: 3 }}
                data-testid={`emendas-ccga-devolver-linha-${l.linhaId}`}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{l.itemKey ? nomeDoItem(l.itemKey) : 'Item'}</b>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{l.nota ?? 'sem nota ligada'}</span>
              </span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(l.quantidade)} un.</b>
            </label>
          ))}
        </fieldset>
        <AppSelect label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="emendas-ccga-devolver-motivo">
          {MOTIVOS_DEVOLUCAO_CCGA.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </AppSelect>
        <AppTextarea
          label="Explique para a CAEP"
          rows={2}
          placeholder="Ex.: o fornecedor informou que o saldo do item acabou na adesão de outro órgão"
          value={explicacao}
          onChange={(e) => setExplicacao(e.target.value)}
          error={tentou && !explicacao.trim() ? 'Explique o que aconteceu.' : undefined}
          data-testid="emendas-ccga-devolver-explicacao"
        />
        <NoticeBar tone="warning" testId="emendas-ccga-devolver-efeito">
          Os itens marcados voltam para "Nota de empenho emitida" e a CAEP recebe o aviso. O resto do pedido continua na CCGA.
        </NoticeBar>
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-ccga-devolver-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};

import React from 'react';
import { ActionButton, AppTextarea, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { useVinculosAConferir } from '../../hooks/useVinculosAConferir';
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN } from '../../services/avisosResolvidosService';
import { numeroDoContrato, textoDoMotivoVinculo, trabalhoDoGestor } from '../../services/vinculosAConferirService';

interface Props {
  itemKey: string;
  contractKey: string;
  /** 'aviso': faixa com o texto inteiro (Ata 360). 'selo': selo pequeno para dentro de tabela (Item 360). */
  formato?: 'aviso' | 'selo';
}

/**
 * Vínculo automático que a fonte desmentiu mas que tem trabalho do gestor (migration 112): o cron não o apagou.
 * Todos veem o aviso; só o coordenador decide, com justificativa: manter (o vínculo passa a ser da equipe) ou
 * retirar (a quantidade ajustada e a divisão entre unidades saem junto).
 */
export const VinculoAConferirAviso: React.FC<Props> = ({ itemKey, contractKey, formato = 'aviso' }) => {
  const { porPar, podeDecidir, manter, retirar } = useVinculosAConferir();
  const toast = useToast();
  const [aberto, setAberto] = React.useState(false);
  const [texto, setTexto] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const v = porPar.get(`${itemKey}|${contractKey}`);
  if (!v) return null;

  const gravando = manter.isPending || retirar.isPending;
  const trabalho = trabalhoDoGestor(v) || 'trabalho do gestor';
  const justificativa = texto.trim();
  const podeEnviar = justificativa.length >= JUSTIFICATIVA_MIN && !gravando;

  const abrir = () => {
    setTexto('');
    setErro(null);
    setAberto(true);
  };
  const fechar = () => {
    if (!gravando) setAberto(false);
  };

  const decidir = async (decisao: 'manter' | 'retirar') => {
    if (!podeEnviar) {
      setErro(`Escreva a justificativa com pelo menos ${JUSTIFICATIVA_MIN} caracteres.`);
      return;
    }
    setErro(null);
    try {
      await (decisao === 'manter' ? manter : retirar).mutateAsync({ itemKey, contractKey, justificativa });
      toast.success(decisao === 'manter' ? 'Vínculo mantido. Agora ele é da equipe e a automação não mexe mais.' : 'Vínculo retirado.');
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível gravar. Tente de novo.');
    }
  };

  const resumo = `A fonte desmentiu este vínculo automático: ${textoDoMotivoVinculo(v.motivo)}. Ele foi mantido porque tem ${trabalho}.`;

  const modal = (
    <Modal
      isOpen={aberto}
      onClose={fechar}
      dismissible={!gravando}
      size="md"
      title="Vínculo automático a conferir"
      testId="vinculo-a-conferir-dialog"
      footer={
        <>
          <ActionButton action="cancelar" size="sm" onClick={fechar} disabled={gravando} />
          <ActionButton action="retirarVinculo" size="sm" onClick={() => void decidir('retirar')} disabled={!podeEnviar} data-testid="vinculo-retirar" />
          <ActionButton action="manterVinculo" size="sm" onClick={() => void decidir('manter')} disabled={!podeEnviar} data-testid="vinculo-manter" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
          <strong>
            Contrato {numeroDoContrato(v.contractKey)} · ata {v.numeroAta} · item {Number(v.numeroItem) || v.numeroItem}
          </strong>
          <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>
            {[v.gestorAta ? `Gestor da ata: ${v.gestorAta}` : null, v.gestorContrato ? `Gestor do contrato: ${v.gestorContrato}` : null].filter(Boolean).join(' · ') || 'Sem gestor definido'}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>{resumo}</p>
        {v.quantidadeAjustada !== undefined && v.ajusteJustificativa && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
            Justificativa do ajuste: {v.ajusteJustificativa}
          </p>
        )}
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <li>
            <strong>Manter vínculo</strong>: passa a ser vínculo da equipe, a automação não mexe mais e o trabalho do gestor fica.
          </li>
          <li>
            <strong>Retirar vínculo</strong>: apaga a quantidade ajustada e a divisão entre unidades. O que foi perdido fica registrado na decisão.
          </li>
        </ul>
        <AppTextarea
          label="Justificativa (obrigatória)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={JUSTIFICATIVA_MAX}
          rows={3}
          placeholder="Ex.: aditivo trocou o item; confirmado com o fiscal do contrato"
          error={erro ?? undefined}
          data-testid="vinculo-justificativa"
        />
      </div>
    </Modal>
  );

  if (formato === 'selo') {
    return (
      <>
        <span title={resumo} data-testid="vinculo-a-conferir-selo" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <StatusBadge label="Vínculo a conferir" variant="warning" size="sm" dot={false} />
          {podeDecidir && <ActionButton action="conferir" size="sm" onClick={abrir} data-testid="vinculo-conferir" />}
        </span>
        {podeDecidir && modal}
      </>
    );
  }

  return (
    <>
      <NoticeBar tone="warning" testId="vinculo-a-conferir-aviso">
        <span>{resumo} {podeDecidir ? 'Decida se mantém ou retira.' : 'O coordenador decide se mantém ou retira.'}</span>
        {podeDecidir && (
          <span style={{ marginLeft: '0.5rem' }}>
            <ActionButton action="conferir" size="sm" onClick={abrir} data-testid="vinculo-conferir" />
          </span>
        )}
      </NoticeBar>
      {podeDecidir && modal}
    </>
  );
};

import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea, AppDateInput } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useRegistrarContatoEmenda } from '../../hooks/useEmendas';
import { NOME_ORGAO_ASPAR, numeroDaEmenda, ROTULO_MEIO } from '../../utils/emendasSemPedido';
import type { EmendaSiop, MeioDoContato, OrgaoAspar } from '../../services/emendasService';

const OUTRO = 'outro';

interface Props {
  emenda: EmendaSiop;
  nomeDoAutor: string;
  /** UF das ASPAR mostradas na emenda. */
  uf: string | null;
  /** Órgãos na ordem da tela (o do beneficiário primeiro). */
  orgaos: OrgaoAspar[];
  onClose: () => void;
}

/** Registrar uma conversa sobre a emenda sem pedido: o aviso conta os dias a partir do último contato (migration 205). */
export const ContatoEmendaModal: React.FC<Props> = ({ emenda, nomeDoAutor, uf, orgaos, onClose }) => {
  const registrar = useRegistrarContatoEmenda();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const opcoes = ['Assessoria do parlamentar', ...(uf ? orgaos.map((o) => `ASPAR · ${o} · ${uf}`) : [])];
  const [data, setData] = useState(hoje);
  const [quem, setQuem] = useState(opcoes[0]);
  const [outro, setOutro] = useState('');
  const [meio, setMeio] = useState<MeioDoContato>('TELEFONE');
  const [resumo, setResumo] = useState('');
  const [tentou, setTentou] = useState(false);
  const comQuem = quem === OUTRO ? outro.trim() : quem;

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (!comQuem || !resumo.trim() || !data) return;
    try {
      await registrar.mutateAsync({ emendaId: emenda.id, contato: { contatoEm: data, comQuem, meio, resumo: resumo.trim() } });
      toast.success('Contato registrado.');
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!registrar.isPending}
      size="md"
      testId="emendas-contato-emenda-modal"
      title="Registrar contato"
      subtitle={`Emenda ${numeroDaEmenda(emenda.numero)} / ${emenda.ano} · ${nomeDoAutor}`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={registrar.isPending} />
          <AppButton type="submit" form="emendas-contato-emenda-form" disabled={registrar.isPending} isLoading={registrar.isPending} data-testid="emendas-contato-emenda-salvar">
            Salvar contato
          </AppButton>
        </>
      }
    >
      <form id="emendas-contato-emenda-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.75rem' }}>
          <AppDateInput label="Data" max={hoje} value={data} onValueChange={setData} data-testid="emendas-contato-emenda-data" />
          <AppSelect label="Como" value={meio} onChange={(e) => setMeio(e.target.value as MeioDoContato)} data-testid="emendas-contato-emenda-meio">
            {(Object.keys(ROTULO_MEIO) as MeioDoContato[]).map((m) => (
              <option key={m} value={m}>
                {ROTULO_MEIO[m]}
              </option>
            ))}
          </AppSelect>
        </div>
        <AppSelect label="Com quem" value={quem} onChange={(e) => setQuem(e.target.value)} data-testid="emendas-contato-emenda-quem">
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o.startsWith('ASPAR') ? `${o} (${NOME_ORGAO_ASPAR[o.split(' · ')[1] as OrgaoAspar]})` : o}
            </option>
          ))}
          <option value={OUTRO}>Outra pessoa…</option>
        </AppSelect>
        {quem === OUTRO && (
          <AppInput label="Nome ou órgão" value={outro} onChange={(e) => setOutro(e.target.value)} error={tentou && !outro.trim() ? 'Diga com quem foi o contato.' : undefined} data-testid="emendas-contato-emenda-outro" />
        )}
        <AppTextarea
          label="O que ficou combinado"
          placeholder="Ex.: vão mandar os itens até sexta"
          rows={3}
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          error={tentou && !resumo.trim() ? 'Escreva o que ficou combinado.' : undefined}
          data-testid="emendas-contato-emenda-resumo"
        />
      </form>
    </Modal>
  );
};

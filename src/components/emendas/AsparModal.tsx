import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarAspar } from '../../hooks/useEmendas';
import { NOME_ORGAO_ASPAR } from '../../utils/emendasSemPedido';
import { formatarTelefone, soDigitos, type AsparDoOrgao, type OrgaoAspar } from '../../services/emendasService';

interface Props {
  uf: string;
  orgao: OrgaoAspar;
  atual: AsparDoOrgao | null;
  onClose: () => void;
}

/** Contato da assessoria parlamentar de um órgão na UF (migration 205). Tirar o contato deixa o órgão "a cadastrar". */
export const AsparModal: React.FC<Props> = ({ uf, orgao, atual, onClose }) => {
  const salvar = useSalvarAspar();
  const toast = useToast();
  const [nome, setNome] = useState(atual?.nome ?? '');
  const [cargo, setCargo] = useState(atual?.cargo ?? '');
  const [telefone, setTelefone] = useState(atual?.telefone ? formatarTelefone(atual.telefone) : '');
  const [whatsapp, setWhatsapp] = useState(atual?.whatsapp ?? false);
  const [email, setEmail] = useState(atual?.email ?? '');
  const [tentou, setTentou] = useState(false);
  const tel = soDigitos(telefone);
  const telefoneRuim = Boolean(tel) && !/^\d{10,11}$/.test(tel);
  const emailRuim = Boolean(email.trim()) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const gravar = async (apagar: boolean) => {
    try {
      await salvar.mutateAsync({ uf, orgao, nome: apagar ? '' : nome.trim(), cargo: cargo.trim() || null, telefone: tel || null, whatsapp, email: email.trim() || null });
      toast.success(apagar ? 'Contato tirado.' : 'Contato da ASPAR salvo.');
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (!nome.trim() || telefoneRuim || emailRuim) return;
    void gravar(false);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="md"
      testId="emendas-aspar-modal"
      title={`ASPAR · ${NOME_ORGAO_ASPAR[orgao]} · ${uf}`}
      footer={
        <>
          {atual && <ActionButton action="remover" type="button" label="Tirar contato" onClick={() => void gravar(true)} disabled={salvar.isPending} data-testid="emendas-aspar-tirar" />}
          <span style={{ flex: 1 }} />
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <ActionButton action="salvar" type="submit" form="emendas-aspar-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-aspar-salvar" />
        </>
      }
    >
      <form id="emendas-aspar-form" onSubmit={enviar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
        <AppInput label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} error={tentou && !nome.trim() ? 'Informe o nome.' : undefined} data-testid="emendas-aspar-nome" />
        <AppInput label="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} data-testid="emendas-aspar-cargo" />
        <AppInput label="Telefone" inputMode="tel" placeholder="(61) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} error={tentou && telefoneRuim ? 'DDD e 8 ou 9 dígitos.' : undefined} data-testid="emendas-aspar-telefone" />
        <AppInput label="E-mail institucional" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={tentou && emailRuim ? 'E-mail inválido.' : undefined} data-testid="emendas-aspar-email" />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} data-testid="emendas-aspar-whatsapp" />
          O telefone tem WhatsApp
        </label>
      </form>
    </Modal>
  );
};

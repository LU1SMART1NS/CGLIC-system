import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useDefinirFiscalizacao, useFiscaisAtivos, useRegistrarProcessoFiscalizacao } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, DecisaoFiscalizacao } from '../../services/fiscalizacaoService';
import { MOTIVO_MINIMO, NOME_SFC, decisaoPedeMotivo, decisaoSugerida, deEmenda, hojeEmBrasilia, numeroDoContrato } from '../../utils/fiscalizacao';

const seiValido = (s: string) => /^\d{7,10}$/.test(s.replace(/\D/g, ''));
const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';

/** Coordenador: quem fiscaliza o contrato (toda SFC/CGLIC, mista ou toda área requisitante), fiscal, substituto e portaria. */
export const DefinirFiscalizacaoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: () => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const { fiscais, consulta } = useFiscaisAtivos();
  const salvar = useDefinirFiscalizacao();
  const [decisao, setDecisao] = useState<DecisaoFiscalizacao>(() => decisaoSugerida(contrato));
  const [fiscal, setFiscal] = useState(contrato.fiscalUserId ?? '');
  const [substituto, setSubstituto] = useState(contrato.substitutoUserId ?? '');
  const [portaria, setPortaria] = useState(contrato.portariaSei ?? '');
  const [motivo, setMotivo] = useState(contrato.motivo ?? '');
  const pedeMotivo = decisaoPedeMotivo(contrato, decisao);
  const comFiscal = decisao !== 'AREA';
  const faltaMotivo = pedeMotivo && motivo.trim().length < MOTIVO_MINIMO;
  const faltaFiscal = comFiscal && !fiscal;
  const portariaRuim = comFiscal && portaria.trim() !== '' && !seiValido(portaria);
  const bloqueado = faltaMotivo || faltaFiscal || portariaRuim || (substituto === fiscal && substituto !== '');

  const enviar = () =>
    salvar.mutate(
      { contractKey: contrato.contractKey, fiscalizacao: decisao, fiscalUserId: fiscal || null, substitutoUserId: substituto || null, portariaSei: portaria || null, motivo: pedeMotivo || motivo ? motivo : null },
      {
        onSuccess: () => {
          toast.success(`Contrato ${numeroDoContrato(contrato)}: ${decisao === 'AREA' ? 'com a área requisitante' : `${decisao === 'MISTA' ? 'fiscalização mista' : NOME_SFC} · ${fiscais.find((f) => f.id === fiscal)?.nome ?? ''}`}`);
          onClose();
        },
        onError: (err) => toast.error(`Não foi possível salvar: ${erroDe(err)}`)
      }
    );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Quem fiscaliza o contrato ${numeroDoContrato(contrato)}`}
      subtitle={`${contrato.fornecedor ?? ''}${deEmenda(contrato) ? ` · emenda ${contrato.emendas.join(', ')}` : ' · sem emenda'}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-definir-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={salvar.isPending} />
          <ActionButton action="salvar" onClick={enviar} disabled={bloqueado} isLoading={salvar.isPending} data-testid="fisc-definir-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppSelect label="Fiscalização" value={decisao} onChange={(ev) => setDecisao(ev.target.value as DecisaoFiscalizacao)} data-testid="fisc-definir-decisao">
          <option value="SFC">Toda pela {NOME_SFC}</option>
          <option value="MISTA">Mista: parte {NOME_SFC}, parte área requisitante</option>
          <option value="AREA">Toda pela área requisitante</option>
        </AppSelect>
        {comFiscal && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
              <AppSelect label={`Fiscal ${NOME_SFC}`} value={fiscal} onChange={(ev) => setFiscal(ev.target.value)} data-testid="fisc-definir-fiscal">
                <option value="">Escolher…</option>
                {fiscais.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </AppSelect>
              <AppSelect label="Substituto" value={substituto} onChange={(ev) => setSubstituto(ev.target.value)} data-testid="fisc-definir-substituto">
                <option value="">Nenhum</option>
                {fiscais.filter((f) => f.id !== fiscal).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </AppSelect>
            </div>
            {!consulta.isLoading && fiscais.length === 0 && (
              <NoticeBar tone="warning">Nenhum servidor ativo com o perfil Gestor de Fiscalização. Dê o perfil em Ajustes › Usuários.</NoticeBar>
            )}
            <AppInput label="Portaria de designação (SEI)" value={portaria} onChange={(ev) => setPortaria(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 34152364" hint="Opcional agora; o fiscal vê o que falta no Início dele." error={portariaRuim ? 'Só números, 7 a 10 dígitos.' : undefined} />
          </>
        )}
        {decisao === 'MISTA' && <NoticeBar tone="info">As entregas do contrato chegam com a {NOME_SFC}. Na próxima etapa do módulo, o fiscal marca as que ficam com a área requisitante.</NoticeBar>}
        {(pedeMotivo || motivo) && (
          <AppTextarea
            label={pedeMotivo ? 'Motivo' : 'Motivo (opcional)'}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            rows={2}
            placeholder={deEmenda(contrato) ? 'ex.: a área requisitante assume a fiscalização deste contrato' : 'ex.: Projeto Pegasus'}
            hint={pedeMotivo ? (deEmenda(contrato) ? 'Contrato de emenda com a área requisitante: diga por quê.' : `Contrato sem emenda com a ${NOME_SFC}, em caráter extraordinário: diga por quê.`) : undefined}
            error={faltaMotivo && motivo.trim() !== '' ? `Ao menos ${MOTIVO_MINIMO} letras.` : undefined}
            data-testid="fisc-definir-motivo"
          />
        )}
        {contrato.definidoPorNome && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Última decisão: {contrato.definidoPorNome}.</span>}
      </div>
    </Modal>
  );
};

/** Fiscal, substituto ou coordenador: número SEI e data da autuação do processo de fiscalização. */
export const RegistrarProcessoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: () => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const registrar = useRegistrarProcessoFiscalizacao();
  const [sei, setSei] = useState(contrato.processoSei ?? '');
  const [data, setData] = useState(() => contrato.autuadoEm ?? hojeEmBrasilia());
  const hoje = hojeEmBrasilia();
  const ok = seiValido(sei) && Boolean(data) && data <= hoje;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Processo de fiscalização"
      subtitle={`Contrato ${numeroDoContrato(contrato)} · ${contrato.fornecedor ?? ''}`}
      size="sm"
      dismissible={!registrar.isPending}
      testId="fisc-processo-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={registrar.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={registrar.isPending}
            data-testid="fisc-processo-salvar"
            onClick={() =>
              registrar.mutate(
                { contractKey: contrato.contractKey, processoSei: sei, autuadoEm: data },
                { onSuccess: () => { toast.success(`Processo do contrato ${numeroDoContrato(contrato)} registrado`); onClose(); }, onError: (err) => toast.error(`Não foi possível registrar: ${erroDe(err)}`) }
              )
            }
          >
            Registrar
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppInput label="Processo no SEI" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 34472015" hint="Número do processo de acompanhamento contratual." data-testid="fisc-processo-sei" />
        <AppDateInput label="Autuado em" value={data} onValueChange={setData} max={hoje} />
      </div>
    </Modal>
  );
};

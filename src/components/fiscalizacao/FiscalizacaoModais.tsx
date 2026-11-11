import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { documentoSeiValido, mascaraDocumentoSei } from '../../utils/mascaras';
import { useDefinirFiscalizacao, useDesfazerTransferenciaFiscal, useFiscaisAtivos, useRegistrarProcessoFiscalizacao, useTransferirContratosFiscal, useTransferirFiscalTemporaria } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, DecisaoFiscalizacao, TransferenciaFiscal } from '../../services/fiscalizacaoService';
import { MOTIVO_MINIMO, NOME_SFC, dataBR, decisaoPedeMotivo, decisaoSugerida, deEmenda, hojeEmBrasilia, numeroDoContrato, type CargaDoFiscal } from '../../utils/fiscalizacao';

const seiValido = (s: string) => /^\d{7,10}$/.test(s.replace(/\D/g, ''));
const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';

/** Coordenador: quem fiscaliza o contrato (toda SFC/CGLIC, mista ou toda área requisitante), fiscal e portaria. */
export const DefinirFiscalizacaoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: () => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const { fiscais, consulta } = useFiscaisAtivos();
  const salvar = useDefinirFiscalizacao();
  const [decisao, setDecisao] = useState<DecisaoFiscalizacao>(() => decisaoSugerida(contrato));
  const [fiscal, setFiscal] = useState(contrato.fiscalUserId ?? '');
  const [portaria, setPortaria] = useState(contrato.portariaSei ?? '');
  const [motivo, setMotivo] = useState(contrato.motivo ?? '');
  const pedeMotivo = decisaoPedeMotivo(contrato, decisao);
  const comFiscal = decisao !== 'AREA';
  const faltaMotivo = pedeMotivo && motivo.trim().length < MOTIVO_MINIMO;
  const faltaFiscal = comFiscal && !fiscal;
  const portariaRuim = comFiscal && portaria.trim() !== '' && !seiValido(portaria);
  const bloqueado = faltaMotivo || faltaFiscal || portariaRuim;

  const enviar = () =>
    salvar.mutate(
      { contractKey: contrato.contractKey, fiscalizacao: decisao, fiscalUserId: fiscal || null, portariaSei: portaria || null, motivo: pedeMotivo || motivo ? motivo : null },
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
            <AppSelect label={`Fiscal ${NOME_SFC}`} value={fiscal} onChange={(ev) => setFiscal(ev.target.value)} data-testid="fisc-definir-fiscal">
              <option value="">Escolher…</option>
              {fiscais.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </AppSelect>
            {!consulta.isLoading && fiscais.length === 0 && (
              <NoticeBar tone="warning">Nenhum servidor ativo com o perfil Gestor de Fiscalização. Dê o perfil em Ajustes › Usuários.</NoticeBar>
            )}
            <AppInput label="Portaria de designação (SEI)" value={portaria} onChange={(ev) => setPortaria(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 34152364" hint="Opcional agora; o fiscal vê o que falta no Início dele." error={portariaRuim ? 'Só números, 7 a 10 dígitos.' : undefined} />
          </>
        )}
        {decisao === 'MISTA' && <NoticeBar tone="info">Os itens do contrato chegam com a {NOME_SFC}. Na próxima etapa do módulo, o fiscal marca as que ficam com a área requisitante.</NoticeBar>}
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

/** Fiscal ou coordenador: autuação pelo número SEI do contrato (documento) e a data do contrato (migration 266). */
export const RegistrarProcessoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: () => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const registrar = useRegistrarProcessoFiscalizacao();
  const [sei, setSei] = useState(contrato.processoSei ?? '');
  const [data, setData] = useState(() => contrato.autuadoEm ?? hojeEmBrasilia());
  const hoje = hojeEmBrasilia();
  const ok = documentoSeiValido(sei) && Boolean(data) && data <= hoje;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="SEI do contrato"
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
                { onSuccess: () => { toast.success(`SEI do contrato ${numeroDoContrato(contrato)} registrado`); onClose(); }, onError: (err) => toast.error(`Não foi possível registrar: ${erroDe(err)}`) }
              )
            }
          >
            Registrar
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppInput label="Número SEI do contrato" value={sei} onChange={(ev) => setSei(mascaraDocumentoSei(ev.target.value))} inputMode="numeric" placeholder="ex.: 25410220" hint="Número do documento do contrato no SEI: é ele que vale para a autuação." data-testid="fisc-processo-sei" />
        <AppDateInput label="Data do contrato" value={data} onValueChange={setData} max={hoje} />
      </div>
    </Modal>
  );
};

const MOTIVOS_AUSENCIA: Array<{ id: TransferenciaFiscal['motivo']; rotulo: string }> = [
  { id: 'FERIAS', rotulo: 'Férias' },
  { id: 'LICENCA', rotulo: 'Licença' },
  { id: 'AFASTAMENTO', rotulo: 'Afastamento' },
  { id: 'OUTRO', rotulo: 'Outro' }
];

/** Quem pode receber: fiscais ativos, menos quem sai e quem está ausente. */
function useDestinos(origemUserId: string, ausentes: TransferenciaFiscal[]) {
  const { fiscais, consulta } = useFiscaisAtivos();
  const fora = new Set(ausentes.map((t) => t.ausenteUserId));
  return { destinos: fiscais.filter((f) => f.id !== origemUserId && !fora.has(f.id)), consulta };
}

/**
 * Coordenador: passa de vez os contratos de um fiscal para outro, como o Transferir da Equipe de Atas e Contratos.
 * O destino passa a ser o fiscal dos contratos (migration 261).
 */
export const TransferirFiscalModal: React.FC<{
  carga: CargaDoFiscal;
  ausentes: TransferenciaFiscal[];
  /** Só estes contratos (marcados na Equipe); sem a lista, todos os do fiscal. */
  selecionados?: ContratoFiscalizacao[];
  onClose: () => void;
  onDone?: () => void;
}> = ({ carga, ausentes, selecionados, onClose, onDone }) => {
  const toast = useToast();
  const transferir = useTransferirContratosFiscal();
  const { destinos } = useDestinos(carga.userId, ausentes);
  const [destino, setDestino] = useState('');
  const nomeDestino = destinos.find((f) => f.id === destino)?.nome ?? '';
  const qtd = selecionados ? selecionados.length : carga.contratos;
  const enviar = () =>
    transferir.mutate(
      { origemUserId: carga.userId, destinoUserId: destino, contractKeys: selecionados?.map((c) => c.contractKey) },
      {
        onSuccess: (r) => {
          toast.success(`${r.fiscal} ${r.fiscal === 1 ? 'contrato passou' : 'contratos passaram'} de ${carga.nome} para ${nomeDestino}`);
          onDone?.();
          onClose();
        },
        onError: (err) => toast.error(`Não foi possível transferir: ${erroDe(err)}`)
      }
    );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={selecionados ? `Transferir ${qtd} ${qtd === 1 ? 'contrato' : 'contratos'} de ${carga.nome}` : `Transferir os contratos de ${carga.nome}`}
      subtitle={`${qtd} ${qtd === 1 ? 'contrato' : 'contratos'} como fiscal`}
      size="sm"
      dismissible={!transferir.isPending}
      testId="fisc-transferir-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={transferir.isPending} />
          <ActionButton action="transferir" onClick={enviar} disabled={!destino} isLoading={transferir.isPending} data-testid="fisc-transferir-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppSelect label="Para quem" value={destino} onChange={(ev) => setDestino(ev.target.value)} data-testid="fisc-transferir-destino">
          <option value="">Escolher…</option>
          {destinos.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </AppSelect>
        <NoticeBar tone="info">
          {nomeDestino || 'Quem receber'} passa a ser o fiscal desses contratos. Portaria e processo ficam como estão: se precisar de portaria nova, registre no contrato.
        </NoticeBar>
      </div>
    </Modal>
  );
};

/**
 * Coordenador: férias, licença… Os contratos em que o servidor é o fiscal vão para quem assume até o retorno e voltam
 * no Desfazer.
 */
export const TransferirFiscalTemporariamenteModal: React.FC<{ carga: CargaDoFiscal; ausentes: TransferenciaFiscal[]; onClose: () => void }> = ({ carga, ausentes, onClose }) => {
  const toast = useToast();
  const transferir = useTransferirFiscalTemporaria();
  const { destinos } = useDestinos(carga.userId, ausentes);
  const hoje = hojeEmBrasilia();
  const [motivo, setMotivo] = useState<TransferenciaFiscal['motivo']>('FERIAS');
  const [inicio, setInicio] = useState(hoje);
  const [retorno, setRetorno] = useState('');
  const [sei, setSei] = useState('');
  const [destino, setDestino] = useState('');
  const nomeDestino = destinos.find((f) => f.id === destino)?.nome ?? '';
  const retornoRuim = Boolean(retorno) && retorno < inicio;
  const ok = Boolean(destino && inicio && retorno) && !retornoRuim;
  const enviar = () =>
    transferir.mutate(
      { ausenteUserId: carga.userId, destinoUserId: destino, motivo, inicio, retornoPrevisto: retorno, seiNumero: sei.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(`${r.contratos} ${r.contratos === 1 ? 'contrato' : 'contratos'} de ${carga.nome} com ${nomeDestino} até ${dataBR(retorno)}`);
          onClose();
        },
        onError: (err) => toast.error(`Não foi possível transferir: ${erroDe(err)}`)
      }
    );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Transferir temporariamente os contratos de ${carga.nome}`}
      subtitle={`${carga.contratos} ${carga.contratos === 1 ? 'contrato' : 'contratos'} como fiscal`}
      size="md"
      dismissible={!transferir.isPending}
      testId="fisc-temporaria-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={transferir.isPending} />
          <ActionButton action="transferirTemporariamente" label="Transferir" onClick={enviar} disabled={!ok} isLoading={transferir.isPending} data-testid="fisc-temporaria-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.75rem' }}>
          <AppSelect label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value as TransferenciaFiscal['motivo'])} data-testid="fisc-temporaria-motivo">
            {MOTIVOS_AUSENCIA.map((m) => (
              <option key={m.id} value={m.id}>{m.rotulo}</option>
            ))}
          </AppSelect>
          <AppDateInput label="Saída" value={inicio} onValueChange={setInicio} />
          <AppDateInput label="Retorno previsto" value={retorno} onValueChange={setRetorno} min={inicio} error={retornoRuim ? 'Depois da saída.' : undefined} />
        </div>
        <AppSelect label="Quem assume" value={destino} onChange={(ev) => setDestino(ev.target.value)} data-testid="fisc-temporaria-destino">
          <option value="">Escolher…</option>
          {destinos.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </AppSelect>
        <AppInput label="Documento SEI (opcional)" value={sei} onChange={(ev) => setSei(ev.target.value)} placeholder="ex.: portaria de designação" />
        <NoticeBar tone="info">
          No retorno, o Desfazer devolve os contratos que ainda estiverem com {nomeDestino || 'quem assumir'}.
        </NoticeBar>
      </div>
    </Modal>
  );
};

/** Coordenador: devolve os contratos a quem voltou da ausência. */
export const DesfazerTransferenciaFiscalModal: React.FC<{ transferencia: TransferenciaFiscal; onClose: () => void }> = ({ transferencia: t, onClose }) => {
  const toast = useToast();
  const desfazer = useDesfazerTransferenciaFiscal();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Devolver os contratos de ${t.ausenteNome}`}
      subtitle={`Com ${t.destinoNome} desde ${dataBR(t.inicio)} · retorno previsto em ${dataBR(t.retornoPrevisto)}`}
      size="sm"
      dismissible={!desfazer.isPending}
      testId="fisc-desfazer-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={desfazer.isPending} />
          <ActionButton
            action="desfazer"
            isLoading={desfazer.isPending}
            data-testid="fisc-desfazer-salvar"
            onClick={() =>
              desfazer.mutate(t.id, {
                onSuccess: (r) => {
                  toast.success(`${r.devolvidos} ${r.devolvidos === 1 ? 'contrato voltou' : 'contratos voltaram'} para ${t.ausenteNome}${r.ficaram ? ` · ${r.ficaram} mudaram de mãos no período e ficaram` : ''}`);
                  onClose();
                },
                onError: (err) => toast.error(`Não foi possível desfazer: ${erroDe(err)}`)
              })
            }
          />
        </>
      }
    >
      <span style={carteiraDetalhe}>
        Voltam os {t.contratos} {t.contratos === 1 ? 'contrato' : 'contratos'} que ainda estão com {t.destinoNome}. O que você passou a outra pessoa no período fica onde está.
      </span>
    </Modal>
  );
};

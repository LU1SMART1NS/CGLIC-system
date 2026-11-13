import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useDefinirPrazoDoContrato, useFiscalizacaoDoContrato, useProrrogarPrazoEntregas, useRegistrarRecebimentoOrdem } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { MOTIVO_MINIMO, dataBR, hojeEmBrasilia } from '../../utils/fiscalizacao';
import { rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { INICIOS, devolverSuspensao, inicioDef, previstaPelaRegra, textoDaRegra, textoDosDias, type ContagemPrazo, type InicioPrazo, type RegraDoPrazo } from '../../utils/fiscalizacaoPrazo';

const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const seiValido = (s: string) => /^\d{7,10}$/.test(s);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const quem = (es: EntregaFiscalizacao[]) => {
  const nomes = [...new Set(es.map((e) => rotuloDoBeneficiario(e).principal))];
  return nomes.slice(0, 4).join(' · ') + (nomes.length > 4 ? ' …' : '');
};
const diasValidos = (n: number) => Number.isInteger(n) && n >= 1 && n <= 730;

/** A conta na tela, antes de gravar: "Entrega prevista: 11/01/2027 (60 dias corridos de 12/11/2026)". */
export const ContaDoPrazo: React.FC<{ inicio: string; dias: number; contagem?: ContagemPrazo; deQue?: string; testId?: string }> = ({ inicio, dias, contagem = 'CORRIDOS', deQue = 'do recebimento', testId }) => {
  if (!inicio || !diasValidos(dias)) return null;
  return (
    <NoticeBar tone="info" testId={testId}>
      Entrega prevista: <b>{dataBR(previstaPelaRegra(inicio, dias, contagem))}</b> ({textoDosDias(dias, contagem)} {deQue} em {dataBR(inicio)}).
    </NoticeBar>
  );
};

/** De onde veio o prazo do contrato, em uma linha (faixa da mesa e janelas). */
export const OrigemDoPrazo: React.FC<{ regra: RegraDoPrazo }> = ({ regra }) => (
  <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
    {regra.origem === 'CONTRATO'
      ? `informado no contrato${regra.definidoPor ? ` por ${regra.definidoPor}` : ''}${regra.definidoEm ? ` em ${dataBR(regra.definidoEm.slice(0, 10))}` : ''}`
      : regra.automatico
        ? `lido do TR da ata ${regra.ata ?? ''} (leitura automática)`
        : `do TR da ata ${regra.ata ?? ''}${regra.confirmadoPor ? `, confirmado por ${regra.confirmadoPor}` : ''}${regra.confirmadoEm ? ` em ${dataBR(regra.confirmadoEm.slice(0, 10))}` : ''}`}
  </span>
);

/** Campos do recebimento da Ordem: usados aqui e no Avançar para a Ordem. */
export const CamposDoRecebimento: React.FC<{
  recebidaEm: string;
  setRecebidaEm: (v: string) => void;
  dias: number;
  setDias: (v: number) => void;
  regra: RegraDoPrazo | null | undefined;
  minimo?: string;
  opcional?: boolean;
}> = ({ recebidaEm, setRecebidaEm, dias, setDias, regra, minimo, opcional }) => (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
      <AppDateInput
        label={opcional ? 'Recebida pelo fornecedor em (opcional)' : 'Recebida pelo fornecedor em'}
        value={recebidaEm}
        onValueChange={setRecebidaEm}
        min={minimo}
        max={hojeEmBrasilia()}
        hint="Data da assinatura ou da ciência do fornecedor na Ordem (SEI ou e-mail)."
      />
      <AppInput
        label={`Prazo de entrega (${regra?.contagem === 'UTEIS' ? 'dias úteis' : 'dias corridos'})`}
        type="number"
        min={1}
        value={Number.isFinite(dias) && dias > 0 ? dias : ''}
        onChange={(ev) => setDias(Number(ev.target.value))}
        hint={regra ? `O contrato prevê ${textoDaRegra(regra)}. Mude só se a Ordem disser outro prazo.` : 'O contrato ainda não tem prazo: o que você informar fica como o prazo do contrato.'}
        data-testid="fisc-prazo-dias"
      />
    </div>
    {recebidaEm && <ContaDoPrazo inicio={recebidaEm} dias={dias} contagem={regra?.contagem} testId="fisc-prazo-conta" />}
  </>
);

/**
 * Registrar o recebimento da Ordem (Com você › "Informar o recebimento da Ordem"): para itens que já estão na Ordem e
 * ainda não têm a data em que o fornecedor a recebeu. A data prevista de cada item sai da conta, não é digitada.
 */
export const RecebimentoDaOrdemModal: React.FC<{ entregas: EntregaFiscalizacao[]; onClose: (feito: boolean) => void }> = ({ entregas, onClose }) => {
  const toast = useToast();
  const salvar = useRegistrarRecebimentoOrdem();
  const { contrato } = useFiscalizacaoDoContrato(entregas[0]?.contractKey ?? '');
  const regra = contrato?.prazoEntrega;
  const [recebidaEm, setRecebidaEm] = useState(entregas.every((e) => e.ordemRecebidaEm === entregas[0].ordemRecebidaEm) ? entregas[0].ordemRecebidaEm ?? '' : '');
  const [dias, setDias] = useState<number>(regra?.dias ?? entregas[0]?.prazoDias ?? NaN);
  const emissao = entregas.map((e) => (e.etapa === 'ORDEM' ? e.etapaEm : null)).filter((d): d is string => Boolean(d)).sort()[0];
  const ok = Boolean(recebidaEm) && recebidaEm <= hojeEmBrasilia() && (!emissao || recebidaEm >= emissao) && diasValidos(dias);
  const comPlanilha = entregas.filter((e) => e.prevista && e.previstaOrigem !== 'ORDEM').length;
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Recebimento da Ordem de Fornecimento"
      subtitle={`${plural(entregas.length, 'item', 'itens')} · ${quem(entregas)}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-recebimento-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={salvar.isPending}
            data-testid="fisc-recebimento-salvar"
            onClick={() =>
              salvar.mutate(
                { ids: entregas.map((e) => e.id), recebidaEm, prazoDias: dias },
                { onSuccess: () => { toast.success(`Entrega prevista para ${dataBR(previstaPelaRegra(recebidaEm, dias, regra?.contagem))}`); onClose(true); }, onError: (err) => toast.error(`Não foi possível registrar: ${erroDe(err)}`) }
              )
            }
          >
            Registrar o recebimento
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {emissao && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Ordem emitida em {dataBR(emissao)}. O prazo corre do dia em que o fornecedor a recebeu, não da emissão.</span>}
        <CamposDoRecebimento recebidaEm={recebidaEm} setRecebidaEm={setRecebidaEm} dias={dias} setDias={setDias} regra={regra} minimo={emissao} />
        {comPlanilha > 0 && (
          <NoticeBar tone="warning" testId="fisc-recebimento-troca">
            {comPlanilha === 1 ? '1 item tem' : `${comPlanilha} itens têm`} data prevista informada antes. Ela passa a ser a da conta acima; a anterior fica no histórico.
          </NoticeBar>
        )}
      </div>
    </Modal>
  );
};

/**
 * Saída do Exército (Avançar a partir de "Aguardando o Exército"): mostra a conta antes de gravar. Prazo que conta da
 * autorização começa agora; prazo que já corria fica suspenso pelos dias de espera e esses dias voltam ao fornecedor.
 */
export const SaidaDoExercito: React.FC<{ entregas: EntregaFiscalizacao[]; autorizadoEm: string; regra: RegraDoPrazo | null | undefined }> = ({ entregas, autorizadoEm, regra }) => {
  if (!autorizadoEm) return null;
  if (regra?.inicio === 'EXERCITO') {
    return (
      <NoticeBar tone="info" testId="fisc-exercito-inicio">
        O prazo deste contrato conta da autorização: entrega prevista em <b>{dataBR(previstaPelaRegra(autorizadoEm, regra.dias, regra.contagem))}</b> ({textoDaRegra(regra)}).
      </NoticeBar>
    );
  }
  const e = entregas[0];
  if (!e?.etapaEm || !e.prevista) return <NoticeBar tone="info">Sem data prevista: a espera no Exército não muda nada.</NoticeBar>;
  const s = devolverSuspensao(e.prevista, e.etapaEm, autorizadoEm);
  return (
    <NoticeBar tone="info" testId="fisc-exercito-suspensao">
      Prazo suspenso de {dataBR(e.etapaEm)} a {dataBR(autorizadoEm)}: <b>{plural(s.dias, 'dia volta', 'dias voltam')}</b> ao fornecedor. A entrega prevista passa de {dataBR(e.prevista)} para <b>{dataBR(s.nova)}</b>
      {entregas.length > 1 ? ', e o mesmo vale para os outros itens' : ''}.
    </NoticeBar>
  );
};

/**
 * Prorrogar o prazo de entrega: só com a decisão registrada (SEI) e o motivo. A data anterior fica guardada e aparece
 * na janela do item. O atraso passa a contar da nova data; sem prorrogação, a data não muda.
 */
export const ProrrogarPrazoModal: React.FC<{ entregas: EntregaFiscalizacao[]; onClose: (feito: boolean) => void }> = ({ entregas, onClose }) => {
  const toast = useToast();
  const salvar = useProrrogarPrazoEntregas();
  const atual = entregas.map((e) => e.prevista).filter((d): d is string => Boolean(d)).sort().slice(-1)[0] ?? null;
  const [novaData, setNovaData] = useState('');
  const [motivo, setMotivo] = useState('');
  const [sei, setSei] = useState('');
  const ok = Boolean(novaData) && (!atual || novaData > atual) && motivo.trim().length >= MOTIVO_MINIMO && seiValido(sei);
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Prorrogar o prazo de entrega"
      subtitle={`${plural(entregas.length, 'item', 'itens')} · ${quem(entregas)}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-prorrogar-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={salvar.isPending}
            data-testid="fisc-prorrogar-salvar"
            onClick={() =>
              salvar.mutate(
                { ids: entregas.map((e) => e.id), novaData, motivo, documentoSei: sei },
                { onSuccess: () => { toast.success(`Prazo prorrogado para ${dataBR(novaData)}`); onClose(true); }, onError: (err) => toast.error(`Não foi possível prorrogar: ${erroDe(err)}`) }
              )
            }
          >
            Prorrogar
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.85rem' }}>
          <span style={{ color: '#64748b' }}>Prazo de hoje: </span>
          <b>{atual ? dataBR(atual) : 'sem data'}</b>
          {entregas.length === 1 && entregas[0].previstaOriginal && entregas[0].previstaOriginal !== atual && <span style={carteiraDetalhe}> · pela Ordem era {dataBR(entregas[0].previstaOriginal)}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
          <AppDateInput label="Nova data de entrega" value={novaData} onValueChange={setNovaData} min={atual ?? undefined} error={novaData && atual && novaData <= atual ? 'Depois do prazo de hoje.' : undefined} />
          <AppInput label="Documento SEI da decisão" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 37530982" hint="Despacho ou termo que aceitou a prorrogação." data-testid="fisc-prorrogar-sei" />
        </div>
        <AppTextarea label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: fornecedor pediu por atraso do fabricante, aceito pelo gestor" hint={`Fica no histórico do item (mínimo de ${MOTIVO_MINIMO} letras).`} data-testid="fisc-prorrogar-motivo" />
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>O atraso passa a contar da nova data. A data anterior continua no histórico e na janela do item. Espera no Exército não precisa de prorrogação: o sistema devolve os dias sozinho.</span>
      </div>
    </Modal>
  );
};

/**
 * Prazo de entrega do contrato (faixa da mesa › ⋯). O contrato herda o prazo do TR da ata (lido do PNCP e confirmado
 * pelo gestor da ata); o fiscal só corrige quando o contrato tem prazo próprio, com motivo. Não muda itens que já têm data.
 */
export const PrazoDoContratoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: (feito: boolean) => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const salvar = useDefinirPrazoDoContrato();
  const r = contrato.prazoEntrega;
  const [dias, setDias] = useState<number>(r?.dias ?? NaN);
  const [contagem, setContagem] = useState<ContagemPrazo>(r?.contagem ?? 'CORRIDOS');
  const [inicio, setInicio] = useState<InicioPrazo>(r?.inicio ?? 'OF_RECEBIMENTO');
  const [motivo, setMotivo] = useState('');
  const mudou = !r || r.dias !== dias || r.contagem !== contagem || r.inicio !== inicio;
  const precisaMotivo = Boolean(r) && mudou;
  const ok = diasValidos(dias) && mudou && (!precisaMotivo || motivo.trim().length >= MOTIVO_MINIMO);
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Prazo de entrega do contrato"
      subtitle={`Contrato ${contrato.numero}${contrato.fornecedor ? ` · ${contrato.fornecedor}` : ''}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-prazo-contrato-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            disabled={!ok}
            isLoading={salvar.isPending}
            data-testid="fisc-prazo-contrato-salvar"
            onClick={() => salvar.mutate({ contractKey: contrato.contractKey, dias, contagem, inicio, motivo }, { onSuccess: () => { toast.success(`Prazo do contrato: ${textoDaRegra({ dias, contagem, inicio })}`); onClose(true); }, onError: (err) => toast.error(`Não foi possível salvar: ${erroDe(err)}`) })}
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {r?.trecho && (
          <NoticeBar tone="info" testId="fisc-prazo-contrato-tr">
            <b>No TR da ata {r.ata}:</b> “{r.trecho}”{r.documento ? ` (${r.documento})` : ''}
          </NoticeBar>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.75rem' }}>
          <AppInput label="Dias" type="number" min={1} value={Number.isFinite(dias) && dias > 0 ? dias : ''} onChange={(ev) => setDias(Number(ev.target.value))} data-testid="fisc-prazo-contrato-dias" />
          <AppSelect label="Contagem" value={contagem} onChange={(ev) => setContagem(ev.target.value as ContagemPrazo)} data-testid="fisc-prazo-contrato-contagem">
            <option value="CORRIDOS">Dias corridos</option>
            <option value="UTEIS">Dias úteis</option>
          </AppSelect>
          <AppSelect label="A partir de" value={inicio} onChange={(ev) => setInicio(ev.target.value as InicioPrazo)} data-testid="fisc-prazo-contrato-inicio">
            {INICIOS.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </AppSelect>
        </div>
        {diasValidos(dias) && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Fica: <b>{textoDaRegra({ dias, contagem, inicio })}</b>.{inicio === 'ASSINATURA' && contrato.assinatura ? ` Assinado em ${dataBR(contrato.assinatura)}: entrega até ${dataBR(previstaPelaRegra(contrato.assinatura, dias, contagem))}.` : ''}</span>}
        {precisaMotivo && <AppTextarea label="Por que este contrato tem outro prazo?" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: aditivo 1 alterou o prazo de entrega" hint={`Fica no histórico do contrato (mínimo de ${MOTIVO_MINIMO} letras).`} />}
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Vale para as Ordens registradas daqui em diante. Itens que já têm data só mudam por prorrogação. {inicioDef(inicio).id === 'EXERCITO' ? 'Os itens ficam sem data até a autorização do Exército.' : ''}</span>
      </div>
    </Modal>
  );
};

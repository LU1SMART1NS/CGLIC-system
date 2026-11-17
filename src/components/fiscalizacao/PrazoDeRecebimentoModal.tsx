import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useDefinirPrazoDeRecebimento, useRegistrarComissaoRecebimento } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { MOTIVO_MINIMO, dataBR, hojeEmBrasilia } from '../../utils/fiscalizacao';
import { rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { FISCALIZACAO_RULES } from '../../config/alertRules';
import type { ContagemPrazo } from '../../utils/fiscalizacaoPrazo';
import { cobrancaDaComissao, origemDoRecebimento, textoDaRegraDeRecebimento, type InicioDoTrd, type RegraDoRecebimento } from '../../utils/fiscalizacaoRecebimento';

export type CamposDaRegra = Pick<RegraDoRecebimento, 'trpDias' | 'trpContagem' | 'trdDias' | 'trdContagem' | 'trdInicio'>;
const MODELO_AGU: CamposDaRegra = { trpDias: 0, trpContagem: 'CORRIDOS', trdDias: 10, trdContagem: 'UTEIS', trdInicio: 'ENTREGA' };
export const regraValida = (r: CamposDaRegra) => Number.isInteger(r.trpDias) && r.trpDias >= 0 && r.trpDias <= 90 && Number.isInteger(r.trdDias) && r.trdDias >= 1 && r.trdDias <= 90;
const mesma = (a: CamposDaRegra | null | undefined, b: CamposDaRegra) =>
  Boolean(a) && a!.trpDias === b.trpDias && a!.trpContagem === b.trpContagem && a!.trdDias === b.trdDias && a!.trdContagem === b.trdContagem && a!.trdInicio === b.trdInicio;

/** Os campos do TRP e do TRD: na janela do contrato e na do prazo da ata (gestor da ata). */
export const CamposDoRecebimento: React.FC<{ valor: CamposDaRegra; muda: (v: CamposDaRegra) => void; testId?: string }> = ({ valor, muda, testId = 'receb' }) => {
  const set = (p: Partial<CamposDaRegra>) => muda({ ...valor, ...p });
  const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.75rem' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={grade}>
        <AppSelect label="Recebimento provisório (TRP)" value={valor.trpDias === 0 ? 'ATO' : 'DIAS'} onChange={(ev) => set({ trpDias: ev.target.value === 'ATO' ? 0 : 5 })} data-testid={`${testId}-trp-modo`}>
          <option value="ATO">No ato da entrega</option>
          <option value="DIAS">Em dias da entrega</option>
        </AppSelect>
        {valor.trpDias > 0 && (
          <>
            <AppInput label="Dias" type="number" min={1} value={valor.trpDias} onChange={(ev) => set({ trpDias: Number(ev.target.value) })} data-testid={`${testId}-trp-dias`} />
            <AppSelect label="Contagem" value={valor.trpContagem} onChange={(ev) => set({ trpContagem: ev.target.value as ContagemPrazo })}>
              <option value="CORRIDOS">Dias corridos</option>
              <option value="UTEIS">Dias úteis</option>
            </AppSelect>
          </>
        )}
      </div>
      <div style={grade}>
        <AppInput label="Recebimento definitivo (TRD) em" type="number" min={1} value={valor.trdDias || ''} onChange={(ev) => set({ trdDias: Number(ev.target.value) })} data-testid={`${testId}-trd-dias`} />
        <AppSelect label="Contagem" value={valor.trdContagem} onChange={(ev) => set({ trdContagem: ev.target.value as ContagemPrazo })} data-testid={`${testId}-trd-contagem`}>
          <option value="UTEIS">Dias úteis</option>
          <option value="CORRIDOS">Dias corridos</option>
        </AppSelect>
        <AppSelect label="A partir de" value={valor.trdInicio} onChange={(ev) => set({ trdInicio: ev.target.value as InicioDoTrd })} data-testid={`${testId}-trd-inicio`}>
          <option value="ENTREGA">Da entrega (nota fiscal)</option>
          <option value="TRP">Do recebimento provisório</option>
        </AppSelect>
      </div>
      {regraValida(valor) && (
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
          Fica: <b>{textoDaRegraDeRecebimento(valor as RegraDoRecebimento)}</b>. Depois do TRD, o envio para pagamento em {FISCALIZACAO_RULES.envioPagamentoDiasUteis} dias úteis (Ajustes › Regras e alertas).
        </span>
      )}
    </div>
  );
};

/** Trechos do TR sobre o recebimento, como foram lidos. */
export const TrechosDoRecebimento: React.FC<{ regra: Pick<RegraDoRecebimento, 'ata' | 'trechoTrp' | 'trechoTrd'>; testId?: string }> = ({ regra, testId }) =>
  regra.trechoTrp || regra.trechoTrd ? (
    <NoticeBar tone="info" testId={testId}>
      <b>No TR da ata {regra.ata}:</b>
      {regra.trechoTrp && <div>“{regra.trechoTrp}”</div>}
      {regra.trechoTrd && <div>“{regra.trechoTrd}”</div>}
    </NoticeBar>
  ) : null;

/** Prazos do TRP e do TRD no contrato: corrige o que veio do TR (com motivo) ou informa quando o TR não diz. */
export const PrazoDeRecebimentoModal: React.FC<{ contrato: ContratoFiscalizacao; onClose: (feito: boolean) => void }> = ({ contrato, onClose }) => {
  const toast = useToast();
  const salvar = useDefinirPrazoDeRecebimento();
  const r = contrato.prazoRecebimento;
  const [valor, setValor] = useState<CamposDaRegra>(r ?? MODELO_AGU);
  const [motivo, setMotivo] = useState('');
  const mudou = !mesma(r, valor);
  const precisaMotivo = Boolean(r) && mudou;
  const ok = regraValida(valor) && mudou && (!precisaMotivo || motivo.trim().length >= MOTIVO_MINIMO);
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Prazo de recebimento do contrato"
      subtitle={`Contrato ${contrato.numero}${contrato.fornecedor ? ` · ${contrato.fornecedor}` : ''}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-recebimento-contrato-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            disabled={!ok}
            isLoading={salvar.isPending}
            data-testid="fisc-recebimento-contrato-salvar"
            onClick={() =>
              salvar.mutate(
                { contractKey: contrato.contractKey, regra: valor, motivo },
                {
                  onSuccess: () => {
                    toast.success(`Recebimento: ${textoDaRegraDeRecebimento(valor as RegraDoRecebimento)}`);
                    onClose(true);
                  },
                  onError: (err) => toast.error(`Não foi possível salvar: ${(err as Error)?.message || 'erro desconhecido'}`)
                }
              )
            }
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {r ? <TrechosDoRecebimento regra={r} testId="fisc-recebimento-contrato-tr" /> : (
          <NoticeBar tone="warning" testId="fisc-recebimento-contrato-sem-tr">
            O TR das atas deste contrato não traz o prazo de recebimento. Sem ele, os itens entregues não avisam o TRP nem o TRD. Os campos abaixo vêm preenchidos com o modelo da AGU (TRP no ato da entrega; TRD em 10 dias úteis da nota fiscal): confira no contrato antes de salvar.
          </NoticeBar>
        )}
        <CamposDoRecebimento valor={valor} muda={setValor} testId="fisc-recebimento-contrato" />
        {r && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Hoje: {origemDoRecebimento(r)}.</span>}
        {precisaMotivo && (
          <AppTextarea label="Por que este contrato tem outro prazo?" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: cláusula 8.3 do contrato dá 15 dias úteis para o recebimento definitivo" hint={`Fica no histórico do contrato (mínimo de ${MOTIVO_MINIMO} letras).`} />
        )}
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Vale para todos os itens do contrato que ainda não passaram do TRD, inclusive os já entregues.</span>
      </div>
    </Modal>
  );
};

/**
 * Envio dos itens entregues à comissão de recebimento (para o TRP) ou nova cobrança. Sem TRP depois dos dias da regra
 * (Ajustes › Regras e alertas › Fiscalização), o item volta ao fiscal para cobrar de novo.
 */
export const ComissaoDeRecebimentoModal: React.FC<{ entregas: EntregaFiscalizacao[]; tipo: 'ENVIO' | 'COBRANCA'; onClose: (feito: boolean) => void }> = ({ entregas, tipo, onClose }) => {
  const toast = useToast();
  const salvar = useRegistrarComissaoRecebimento();
  const hoje = hojeEmBrasilia();
  const [data, setData] = useState(hoje);
  const [sei, setSei] = useState('');
  const seiOk = !sei || /^\d{7,10}$/.test(sei.replace(/\D/g, ''));
  const dias = FISCALIZACAO_RULES.cobrarComissaoDias;
  const cobrarEm = data ? new Date(Date.parse(`${data}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10) : null;
  const nomes = [...new Set(entregas.map((e) => rotuloDoBeneficiario(e).principal))];
  const envio = tipo === 'ENVIO';
  const primeiro = entregas[0];
  const c = primeiro ? cobrancaDaComissao(primeiro, hoje) : null;
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={envio ? 'Enviar à comissão de recebimento' : 'Cobrar a comissão de recebimento'}
      subtitle={`${entregas.length === 1 ? '1 item' : `${entregas.length} itens`} · ${nomes.slice(0, 3).join(' · ')}${nomes.length > 3 ? ' …' : ''}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-comissao-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            label={envio ? 'Registrar o envio' : 'Registrar a cobrança'}
            disabled={!data || !seiOk}
            isLoading={salvar.isPending}
            data-testid="fisc-comissao-salvar"
            onClick={() =>
              salvar.mutate(
                { ids: entregas.map((e) => e.id), tipo, data, documentoSei: sei || null },
                {
                  onSuccess: () => {
                    toast.success(`${envio ? 'Envio à comissão registrado' : 'Cobrança registrada'}: cobrar de novo em ${dataBR(cobrarEm)} se o ${envio ? 'TRP' : c?.passo ?? 'TRP'} não vier`);
                    onClose(true);
                  },
                  onError: (err) => toast.error(`Não foi possível salvar: ${(err as Error)?.message || 'erro desconhecido'}`)
                }
              )
            }
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {!envio && c && (
          <NoticeBar tone="warning" testId="fisc-comissao-situacao">
            {c.passo === 'TRP' ? 'Enviado à comissão' : 'TRP registrado'} em {dataBR(c.desde)} ({c.dias} dias){c.cobrancas && primeiro?.comissaoCobradaEm ? `; última cobrança em ${dataBR(primeiro.comissaoCobradaEm)}` : ''}. O {c.passo} ainda não veio.
          </NoticeBar>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
          <AppDateInput label={envio ? 'Enviado em' : 'Cobrado em'} value={data} onValueChange={setData} max={hoje} />
          <AppInput label="Documento SEI (opcional)" value={sei} onChange={(ev) => setSei(ev.target.value)} placeholder={envio ? 'despacho ou e-mail' : 'e-mail ou despacho'} error={seiOk ? undefined : 'Número SEI com 7 a 10 dígitos.'} />
        </div>
        {cobrarEm && (
          <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
            Sem o {envio ? 'TRP' : c?.passo ?? 'TRP'} até <b>{dataBR(cobrarEm)}</b> ({dias} dias), o item volta para você cobrar de novo.
            {envio && primeiro?.entregueEm && primeiro.regraDeRecebimento !== false && primeiro.trpAte ? ` Pelo TR, o TRP era até ${dataBR(primeiro.trpAte)}.` : ''}
          </span>
        )}
      </div>
    </Modal>
  );
};

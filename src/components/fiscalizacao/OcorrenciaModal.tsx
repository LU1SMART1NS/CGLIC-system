import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useRegistrarOcorrencia } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { dataBR, hojeEmBrasilia } from '../../utils/fiscalizacao';
import { FISCALIZACAO_RULES } from '../../config/alertRules';
import { rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { NOME_DA_OCORRENCIA, somarDias, textoDaSubstituicao, type PrazoDeSubstituicao, type TipoOcorrencia } from '../../utils/fiscalizacaoOcorrencias';

const MEIOS = ['E-mail', 'Ofício', 'Despacho no SEI', 'Telefone', 'Reunião'];
const TEXTO_MINIMO = 10;

/** O que cada tipo pede: SEI obrigatório, texto obrigatório e o rótulo do texto. */
const CAMPOS: Record<TipoOcorrencia, { sei: boolean; texto: boolean; rotulo: string; exemplo: string }> = {
  COBRANCA: { sei: false, texto: false, rotulo: 'Observação (opcional)', exemplo: 'ex.: fornecedor disse que entrega na próxima semana' },
  NOTIFICACAO: { sei: true, texto: true, rotulo: 'Do que trata a notificação', exemplo: 'ex.: atraso de 45 dias na entrega dos coletes; pede justificativa' },
  RESPOSTA: { sei: false, texto: true, rotulo: 'O que o fornecedor respondeu', exemplo: 'ex.: alega falta de matéria-prima e promete entrega em 15 dias' },
  PEDIDO_PRORROGACAO: { sei: false, texto: true, rotulo: 'Motivo alegado pelo fornecedor', exemplo: 'ex.: atraso do fabricante no exterior' },
  PEDIDO_NEGADO: { sei: true, texto: true, rotulo: 'Por que o pedido foi negado', exemplo: 'ex.: motivo não comprovado; o prazo continua' },
  RECUSA: { sei: false, texto: true, rotulo: 'Motivo da recusa', exemplo: 'ex.: 12 coletes com tamanho diferente do pedido' },
  SUBSTITUICAO: { sei: false, texto: false, rotulo: 'Observação (opcional)', exemplo: 'ex.: substituídos os 12 coletes; conferidos pela comissão' }
};

const TITULO: Record<TipoOcorrencia, string> = {
  COBRANCA: 'Registrar a cobrança ao fornecedor',
  NOTIFICACAO: 'Notificar o fornecedor',
  RESPOSTA: 'Registrar a resposta à notificação',
  PEDIDO_PRORROGACAO: 'Registrar o pedido de prorrogação',
  PEDIDO_NEGADO: 'Negar o pedido de prorrogação',
  RECUSA: 'Recusar no recebimento',
  SUBSTITUICAO: 'Registrar a substituição'
};

/**
 * Ocorrência em um ou mais itens (entrega B): fica no histórico de cada item, com data, documento SEI e texto. A
 * notificação abre o prazo de resposta; a recusa abre o prazo de substituição (do TR, contado da notificação).
 */
export const OcorrenciaModal: React.FC<{ entregas: EntregaFiscalizacao[]; tipo: TipoOcorrencia; prazoSubstituicao?: PrazoDeSubstituicao | null; onClose: (feito: boolean) => void }> = ({ entregas, tipo, prazoSubstituicao, onClose }) => {
  const toast = useToast();
  const salvar = useRegistrarOcorrencia();
  const hoje = hojeEmBrasilia();
  const campos = CAMPOS[tipo];
  const [data, setData] = useState(hoje);
  const [sei, setSei] = useState('');
  const [meio, setMeio] = useState(MEIOS[0]);
  const [texto, setTexto] = useState('');
  const [prazoResposta, setPrazoResposta] = useState(5);
  const [novaData, setNovaData] = useState('');
  const [notificadoEm, setNotificadoEm] = useState(hoje);
  const regra = prazoSubstituicao ?? null;
  const [diasSubst, setDiasSubst] = useState<number>(regra?.dias ?? 30);

  const seiOk = sei ? /^\d{7,10}$/.test(sei) : !campos.sei;
  const textoOk = !campos.texto || texto.trim().length >= TEXTO_MINIMO;
  const extraOk =
    tipo === 'NOTIFICACAO' ? prazoResposta >= 1 && prazoResposta <= 90 : tipo === 'RECUSA' ? Boolean(notificadoEm) && diasSubst >= 1 && diasSubst <= 180 : true;
  const ok = Boolean(data) && data <= hoje && seiOk && textoOk && extraOk;
  const nomes = [...new Set(entregas.map((e) => rotuloDoBeneficiario(e).principal))];
  const ate = tipo === 'NOTIFICACAO' ? somarDias(data, prazoResposta) : tipo === 'RECUSA' && notificadoEm ? somarDias(notificadoEm, diasSubst) : null;

  const gravar = () =>
    salvar.mutate(
      {
        ids: entregas.map((e) => e.id),
        tipo,
        data,
        documentoSei: sei || null,
        texto: tipo === 'COBRANCA' ? [meio, texto.trim()].filter(Boolean).join(' · ') : texto,
        prazoDias: tipo === 'NOTIFICACAO' ? prazoResposta : tipo === 'RECUSA' ? diasSubst : null,
        novaData: tipo === 'PEDIDO_PRORROGACAO' ? novaData || null : null,
        notificadoEm: tipo === 'RECUSA' ? notificadoEm : null
      },
      {
        onSuccess: () => {
          toast.success(`${NOME_DA_OCORRENCIA[tipo]} registrada${ate ? `: prazo até ${dataBR(ate)}` : ''}`);
          onClose(true);
        },
        onError: (err) => toast.error(`Não foi possível registrar: ${(err as Error)?.message || 'erro desconhecido'}`)
      }
    );

  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={TITULO[tipo]}
      subtitle={`${entregas.length === 1 ? '1 item' : `${entregas.length} itens`} · ${nomes.slice(0, 3).join(' · ')}${nomes.length > 3 ? ' …' : ''}`}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-ocorrencia-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton action="salvar" label="Registrar" disabled={!ok} isLoading={salvar.isPending} onClick={gravar} data-testid="fisc-ocorrencia-salvar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.75rem' }}>
          <AppDateInput label={tipo === 'RECUSA' ? 'Recusado em' : tipo === 'SUBSTITUICAO' ? 'Substituído em' : tipo === 'PEDIDO_PRORROGACAO' ? 'Pedido em' : 'Data'} value={data} onValueChange={setData} max={hoje} />
          {tipo === 'COBRANCA' && (
            <AppSelect label="Como" value={meio} onChange={(ev) => setMeio(ev.target.value)} data-testid="fisc-ocorrencia-meio">
              {MEIOS.map((m) => <option key={m}>{m}</option>)}
            </AppSelect>
          )}
          <AppInput
            label={campos.sei ? 'Documento SEI' : 'Documento SEI (opcional)'}
            value={sei}
            onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="ex.: 37530982"
            error={sei && !seiOk ? 'Número SEI com 7 a 10 dígitos.' : undefined}
            data-testid="fisc-ocorrencia-sei"
          />
          {tipo === 'NOTIFICACAO' && (
            <AppInput label="Prazo de resposta (dias)" type="number" min={1} value={prazoResposta || ''} onChange={(ev) => setPrazoResposta(Number(ev.target.value))} data-testid="fisc-ocorrencia-prazo" />
          )}
          {tipo === 'PEDIDO_PRORROGACAO' && <AppDateInput label="Nova data pedida (opcional)" value={novaData} onValueChange={setNovaData} />}
          {tipo === 'RECUSA' && (
            <>
              <AppDateInput label="Fornecedor notificado em" value={notificadoEm} onValueChange={setNotificadoEm} max={hoje} />
              <AppInput label="Prazo para substituir (dias)" type="number" min={1} value={diasSubst || ''} onChange={(ev) => setDiasSubst(Number(ev.target.value))} data-testid="fisc-ocorrencia-subst" />
            </>
          )}
        </div>
        {tipo === 'RECUSA' && (
          <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
            {regra ? `Pelo ${regra.origem === 'TR' ? `TR da ata ${regra.ata ?? ''}` : 'contrato'}: ${textoDaSubstituicao(regra)}.` : 'O TR não traz o prazo de substituição: informe o do contrato.'} O item sai do recebimento até a substituição chegar.
          </span>
        )}
        <AppTextarea
          label={campos.rotulo}
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          rows={2}
          placeholder={campos.exemplo}
          hint={campos.texto ? `Fica no histórico de cada item (mínimo de ${TEXTO_MINIMO} letras).` : 'Fica no histórico de cada item.'}
          data-testid="fisc-ocorrencia-texto"
        />
        {ate && (
          <NoticeBar tone="info" testId="fisc-ocorrencia-ate">
            {tipo === 'NOTIFICACAO' ? 'Resposta até' : 'Substituir até'} <b>{dataBR(ate)}</b>. Passado o prazo sem registro, o item volta para você.
          </NoticeBar>
        )}
        {tipo === 'COBRANCA' && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>O item fica com o fornecedor por {FISCALIZACAO_RULES.cobrarFornecedorDias} dias (Ajustes › Regras e alertas); se continuar atrasado, volta para você cobrar de novo.</span>}
        {tipo === 'PEDIDO_PRORROGACAO' && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>O pedido fica com você até a decisão: "Prorrogar o prazo" ou "Negar o pedido".</span>}
      </div>
    </Modal>
  );
};

import React, { useState } from 'react';
import { Calendar, DollarSign, User } from 'lucide-react';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import { describeResponsavel } from '../planTaskEditing';
import { getPaymentStatusDisplay } from '../../../utils/paymentStatusDisplay';
import { ActionButton, NoticeBar, StatusBadge, WorkflowStepper, type WorkflowStep } from '../../../design-system';
import type { MarcoSimples } from './PaymentCycleModals';
import { PaymentCycleChecklist, PaymentCycleDocuments, PaymentCycleHistory, PaymentCycleItens, PaymentCyclePrazosLegais } from './PaymentCycleDetails';
import { calcularPrazosLegais } from '../../../services/prazosLegaisPagamento';
import { isoToBR } from './paymentFormUtils';
import { isPaymentCycleEncerrado } from '../../../services/paymentFollowUpService';
import type { useContractPaymentFollowUp } from '../../../hooks/useContractPaymentFollowUp';

/** Marcos do ciclo. Liquidado e Pago entram sozinhos (conciliação com a fatura e a ordem bancária). */
export const MARCOS: Array<{ id: string; title: string }> = [
  { id: 'recebido', title: 'Recebido' },
  { id: 'conferido', title: 'Conferido' },
  { id: 'enviado', title: 'Enviado à CGOFI' },
  { id: 'liquidado', title: 'Liquidado' },
  { id: 'pago', title: 'Pago' }
];

/** Quantos marcos já foram cumpridos em cada situação (o próximo é o marco em curso). */
export const MARCOS_CUMPRIDOS: Record<PaymentFollowUpCycle['status'], number> = {
  RECEBIDO: 1,
  COM_PENDENCIA: 1,
  DEVOLVIDO: 1,
  CONFERIDO: 2,
  ENVIADO_CGOFI: 3,
  LIQUIDADO: 4,
  PAGO: 5,
  CANCELADO: 0
};

/** Próxima ação do ciclo, conforme a situação. */
export type AcaoDoCiclo = 'CONFERIR' | 'RETORNO' | 'ENVIAR' | 'RESULTADO_CGOFI';
export type AcaoAberta = AcaoDoCiclo | MarcoSimples | 'ESCOLHER_FATURA';

export function proximaAcao(cycle: PaymentFollowUpCycle): { acao: AcaoDoCiclo; label: string } | null {
  switch (cycle.status) {
    case 'RECEBIDO':
    case 'DEVOLVIDO':
      return { acao: 'CONFERIR', label: 'Conferir' };
    case 'COM_PENDENCIA':
      return { acao: 'RETORNO', label: 'Recebido de volta' };
    case 'CONFERIDO':
      return { acao: 'ENVIAR', label: 'Enviar à CGOFI' };
    case 'ENVIADO_CGOFI':
    case 'LIQUIDADO':
      return { acao: 'RESULTADO_CGOFI', label: 'Registrar resultado da CGOFI' };
    default:
      return null;
  }
}

/** Ciclo em que o sistema já pode ligar a fatura (depois do envio à CGOFI). */
export const podeEscolherFatura = (cycle: PaymentFollowUpCycle) => ['ENVIADO_CGOFI', 'LIQUIDADO'].includes(cycle.status);

export function buildMarcoSteps(cycle: PaymentFollowUpCycle): WorkflowStep[] {
  const cumpridos = MARCOS_CUMPRIDOS[cycle.status];
  const cancelado = cycle.status === 'CANCELADO';
  const alvoDoMarco = (idx: number): string | undefined => {
    if (idx === 1) return cycle.input.prazoConferenciaAte;
    if (idx === 2) return cycle.input.prazoEnvioAte;
    if (idx === 3) return cycle.input.cobrarCgofiAte;
    return undefined;
  };
  const dataDoMarco = (idx: number): string | undefined => {
    if (idx === 0) return cycle.input.dataRecebimento;
    if (idx === 1) return cycle.input.dataConferencia;
    if (idx === 2) return cycle.input.dataEnvioCgofi;
    if (idx === 3) return cycle.input.dataLiquidacao;
    return cycle.input.dataOrdemBancaria;
  };

  return MARCOS.map((marco, idx) => {
    const feito = idx < cumpridos;
    const emCurso = !cancelado && idx === cumpridos;
    const data = dataDoMarco(idx);
    const alvo = alvoDoMarco(idx);
    let subtitle: string | undefined;
    if (feito && data) subtitle = isoToBR(data);
    else if (idx === 3 && alvo && !cancelado) subtitle = `cobrar a partir de ${isoToBR(alvo)}`;
    else if (idx >= 3 && !cancelado && !feito) subtitle = 'pelo sistema';
    else if (alvo && !cancelado) subtitle = `até ${isoToBR(alvo)}`;
    return {
      id: marco.id,
      title: marco.title,
      subtitle,
      state: cancelado ? 'BLOCKED' : feito ? 'COMPLETED' : emCurso ? 'CURRENT' : 'PENDING'
    };
  });
}

/** Linha de prazo da etapa em curso, com o dono (CGLIC executa; CGOFI só é acompanhada). */
export function etapaMessage(cycle: PaymentFollowUpCycle): { tone: 'info' | 'warning' | 'danger'; text: string } | null {
  const etapa = cycle.etapaAtual;
  if (!etapa) return null;
  const dias = Math.abs(etapa.diasUteisRestantes);
  const plural = dias === 1 ? 'dia útil' : 'dias úteis';
  const alvo = isoToBR(etapa.dataAlvo);
  const prefixo =
    etapa.etapa === 'CONFERENCIA'
      ? cycle.status === 'COM_PENDENCIA' ? 'Devolvido para correção; conferir de novo' : 'Conferir a documentação'
      : etapa.etapa === 'ENVIO' ? 'Enviar à CGOFI'
      : 'Acompanhando a CGOFI';
  if (etapa.dono === 'CGOFI') {
    return etapa.atrasado
      ? { tone: 'warning', text: `${prefixo}: passou da data de cobrança (${alvo}). Cobrar a CGOFI.` }
      : { tone: 'info', text: `${prefixo}: cobrar a partir de ${alvo} · faltam ${dias} ${plural}. O prazo de pagamento é da CGOFI.` };
  }
  return etapa.atrasado
    ? { tone: 'danger', text: `${prefixo}: prazo ${alvo} vencido há ${dias} ${plural}.` }
    : { tone: 'info', text: `${prefixo} até ${alvo} · faltam ${dias} ${plural}.` };
}

export function describeDocuments(cycle: PaymentFollowUpCycle): string {
  const itens = cycle.itens ?? [];
  if (itens.length > 0) return itens.map((i) => `NF ${i.notaFiscal}`).join(' · ');
  const documentos = cycle.documentos ?? [];
  if (documentos.length === 0) return cycle.input.observacoes || 'Termo de Atesto';
  return documentos.map((d) => (d.numero ? `${d.tipo} nº ${d.numero}` : d.tipo)).join(' · ');
}

/** Selo curto da situação do ciclo (tabelas). */
export const CycleStatusBadge: React.FC<{ cycle: PaymentFollowUpCycle }> = ({ cycle }) => {
  const s = getPaymentStatusDisplay(cycle.status);
  return <StatusBadge label={s.label} variant={s.variant} dot={false} size="sm" />;
};

type FollowUp = ReturnType<typeof useContractPaymentFollowUp>;

export interface PaymentCyclePanelProps {
  cycle: PaymentFollowUpCycle;
  gestorNome?: string;
  canEdit: boolean;
  isAdmin: boolean;
  /** Algum empenho do ciclo é de bem a incorporar (vai também à COLOG). */
  temBem: boolean;
  valorContrato: number | null;
  onAcao: (acao: AcaoAberta) => void;
  onCancelar: () => void;
  onExcluir: () => void;
  addDocument: FollowUp['addDocument'];
  removeDocument: FollowUp['removeDocument'];
}

/**
 * Um ciclo de atesto da CGLIC: os cinco marcos da Portaria 50, os avisos de prazo, as ações e, sob demanda,
 * prazos legais, itens, checklist, documentos e histórico. Abre dentro da linha da fatura ou do atesto.
 */
export const PaymentCyclePanel: React.FC<PaymentCyclePanelProps> = ({
  cycle,
  gestorNome,
  canEdit,
  isAdmin,
  temBem,
  valorContrato,
  onAcao,
  onCancelar,
  onExcluir,
  addDocument,
  removeDocument
}) => {
  const [detalhes, setDetalhes] = useState(false);
  const responsavel = describeResponsavel(cycle.input.responsavelNome, gestorNome);
  const acao = proximaAcao(cycle);
  const etapa = etapaMessage(cycle);
  const prazosLegais = calcularPrazosLegais(cycle, { valorContrato });
  const encerrado = isPaymentCycleEncerrado(cycle.status);
  const podeProrrogar = !cycle.input.liquidacaoProrrogada && ['RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI'].includes(cycle.status);
  const cologPendente = temBem && !cycle.input.cologEnviadoEm && ['ENVIADO_CGOFI', 'LIQUIDADO', 'PAGO'].includes(cycle.status);
  const escolherFatura = podeEscolherFatura(cycle);
  const semFatura = escolherFatura && (cycle.faturas ?? []).length === 0;
  const alertas = (cycle.alerts ?? []).filter((a) => a.tipo !== 'PRAZO_ETAPA_VENCIDO' && a.tipo !== 'CGOFI_SEM_RESPOSTA');

  return (
    <div data-testid={`payment-cycle-${cycle.cycleKey}`} className="detail-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <CycleStatusBadge cycle={cycle} />
        <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{describeDocuments(cycle)}</strong>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem 1.25rem', fontSize: '0.8rem', color: '#64748b', flexWrap: 'wrap' }}>
        <span>
          Id. SEI: <strong>{cycle.input.documentoAtestoSei}</strong>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={13} /> Atesto <strong>{isoToBR(cycle.input.dataAssinaturaAtesto)}</strong> · chegou em{' '}
          <strong>{isoToBR(cycle.input.dataRecebimento)}</strong>
        </span>
        {responsavel ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <User size={13} /> Responsável: <strong>{responsavel}</strong>
          </span>
        ) : (
          <span style={{ color: '#c2410c', fontWeight: 600 }}>Gestor do contrato não cadastrado</span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0f172a' }}>
          <DollarSign size={13} color="var(--color-success)" /> A pagar:{' '}
          <strong>{cycle.input.valorAtesto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={13} /> Vencimento da fatura: <strong>{isoToBR(cycle.input.dataVencimentoFatura)}</strong>
          {cycle.prazos?.diasUteisAteVencimento !== undefined && cycle.status !== 'PAGO' && cycle.status !== 'CANCELADO' && (
            <span style={{ color: cycle.prazos.diasUteisAteVencimento < 0 ? 'var(--color-danger)' : '#475569' }}>
              ({cycle.prazos.diasUteisAteVencimento < 0 ? `${Math.abs(cycle.prazos.diasUteisAteVencimento)}d vencida` : `${cycle.prazos.diasUteisAteVencimento}d úteis`})
            </span>
          )}
        </span>
      </div>

      <WorkflowStepper steps={buildMarcoSteps(cycle)} testId={`payment-stepper-${cycle.cycleKey}`} />

      {!encerrado && semFatura && (
        <NoticeBar tone="warning" testId={`payment-sem-fatura-${cycle.cycleKey}`}>
          Nenhuma fatura ligada a este ciclo. O sistema liga sozinho quando acha uma única fatura com o mesmo empenho e o mesmo
          valor; se houver mais de uma, use Escolher fatura para ele acompanhar a liquidação e a OB.
        </NoticeBar>
      )}
      {!encerrado && prazosLegais.chegada.fora && (
        <NoticeBar tone="warning" testId={`payment-chegada-${cycle.cycleKey}`}>
          Chegou com {prazosLegais.chegada.diasUteisAteVencimento} dia(s) útil(eis) até o vencimento; a Portaria 50 (art. 5º) pede no mínimo{' '}
          {prazosLegais.chegada.minimo}. O atraso nasceu antes da CGLIC.
        </NoticeBar>
      )}
      {!encerrado && prazosLegais.liquidacao.estourou && !prazosLegais.liquidacao.concluido && (
        <NoticeBar tone="danger" testId={`payment-liquidacao-${cycle.cycleKey}`}>
          Prazo de liquidação passou: {prazosLegais.liquidacao.diasUteis} dias úteis desde o atesto, teto de {prazosLegais.liquidacao.teto}{' '}
          (IN 77, art. 7º, I).
        </NoticeBar>
      )}
      {!encerrado && prazosLegais.riscoExtincao && (
        <NoticeBar tone="danger" testId={`payment-extincao-${cycle.cycleKey}`}>
          Mais de 2 meses desde o atesto sem pagamento: o contratado pode pedir a extinção do contrato (IN 77, art. 11).
        </NoticeBar>
      )}
      {!encerrado && cologPendente && (
        <NoticeBar tone="info" testId={`payment-colog-${cycle.cycleKey}`}>
          Bem a incorporar (ND 449052): o processo ainda não foi enviado à COLOG (Portaria 50, art. 5º, § 5º).
        </NoticeBar>
      )}
      {etapa && (
        <NoticeBar tone={etapa.tone} testId={`payment-etapa-${cycle.cycleKey}`}>
          {etapa.text}
        </NoticeBar>
      )}
      {alertas.map((alert) => (
        <NoticeBar
          key={alert.id}
          tone={alert.nivel === 'CRITICO' ? 'danger' : alert.nivel === 'ATENCAO' ? 'warning' : 'info'}
          testId={`payment-alert-${alert.id}`}
        >
          {alert.mensagem}
        </NoticeBar>
      ))}

      <div className="payment-cycle-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {canEdit && acao && (
          <ActionButton action="avancarEtapa" size="sm" onClick={() => onAcao(acao.acao)} title={acao.label}>
            <span className="payment-action-label">{acao.label}</span>
          </ActionButton>
        )}
        {canEdit && escolherFatura && (
          <ActionButton
            action="vincular"
            size="sm"
            onClick={() => onAcao('ESCOLHER_FATURA')}
            title={semFatura ? 'Escolher a fatura do ciclo' : 'Trocar a fatura do ciclo'}
            label={semFatura ? 'Escolher fatura' : 'Trocar fatura'}
          />
        )}
        {canEdit && cologPendente && (
          <ActionButton action="avancarEtapa" size="sm" onClick={() => onAcao('ENVIADO_COLOG')} title="Enviar à COLOG">
            <span className="payment-action-label">Enviar à COLOG</span>
          </ActionButton>
        )}
        {canEdit && podeProrrogar && (
          <ActionButton action="editar" size="sm" onClick={() => onAcao('PRORROGACAO_LIQUIDACAO')} title="Prorrogar o prazo de liquidação">
            <span className="payment-action-label">Prorrogar liquidação</span>
          </ActionButton>
        )}
        {canEdit && !encerrado && (
          <ActionButton action="cancelarCiclo" size="sm" onClick={onCancelar} title="Cancelar ciclo">
            <span className="payment-action-label">Cancelar ciclo</span>
          </ActionButton>
        )}
        {isAdmin && (
          <ActionButton action="excluir" size="sm" onClick={onExcluir} title="Excluir ciclo definitivamente">
            <span className="payment-action-label">Excluir</span>
          </ActionButton>
        )}
        <ActionButton
          action={detalhes ? 'recolher' : 'expandir'}
          size="sm"
          expanded={detalhes}
          onClick={() => setDetalhes((v) => !v)}
          title={detalhes ? 'Ocultar checklist, documentos e histórico' : 'Ver checklist, documentos e histórico'}
        >
          <span className="payment-action-label">{detalhes ? 'Ocultar checklist e documentos' : 'Checklist, documentos e histórico'}</span>
        </ActionButton>
      </div>

      {detalhes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '0.5rem' }}>
          <PaymentCyclePrazosLegais cycle={cycle} prazos={prazosLegais} />
          <PaymentCycleItens cycle={cycle} />
          <PaymentCycleChecklist cycle={cycle} />
          <PaymentCycleDocuments cycle={cycle} canEdit={canEdit} onAdd={addDocument} onRemove={removeDocument} />
          <PaymentCycleHistory cycle={cycle} />
        </div>
      )}
    </div>
  );
};

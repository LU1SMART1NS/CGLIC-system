import React, { useMemo, useState } from 'react';
import { Calendar, Clock, DollarSign, User } from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';
import { useContractPaymentFollowUp } from '../../hooks/useContractPaymentFollowUp';
import { useContractManager } from '../../hooks/useContractManager';
import { describeResponsavel } from './planTaskEditing';
import { getPaymentStatusDisplay } from '../../utils/paymentStatusDisplay';
import { useAuth } from '../../context/AuthContext';
import { ActionButton, EmptyState, NoticeBar, StatusBadge, WorkflowStepper, useConfirmDialog, useToast, type WorkflowStep } from '../../design-system';
import { CancelCycleModal, CreateCycleModal, MarcoSimplesModal, type MarcoSimples } from './payment/PaymentCycleModals';
import { useEmpenhosDoContrato } from './payment/cicloPagamentoShared';
import { ConferenciaModal } from './payment/ConferenciaModal';
import { EnvioCgofiModal } from './payment/EnvioCgofiModal';
import { PaymentCycleChecklist, PaymentCycleDocuments, PaymentCycleHistory, PaymentCycleItens, PaymentCyclePrazosLegais } from './payment/PaymentCycleDetails';
import { calcularPrazosLegais } from '../../services/prazosLegaisPagamento';
import { ehBemAIncorporar } from '../../services/cicloPagamentoApoioService';
import { isoToBR } from './payment/paymentFormUtils';
import { isPaymentCycleEncerrado } from '../../services/paymentFollowUpService';

export { formatCurrencyInputBR, maskDateInputBR, parseDateInputBR } from './payment/paymentFormUtils';

interface ContractPaymentFollowUpSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
}

/** Marcos do ciclo. Liquidado e Pago entram sozinhos (conciliação com a fatura e a ordem bancária). */
const MARCOS: Array<{ id: string; title: string }> = [
  { id: 'recebido', title: 'Recebido' },
  { id: 'conferido', title: 'Conferido' },
  { id: 'enviado', title: 'Enviado à CGOFI' },
  { id: 'liquidado', title: 'Liquidado' },
  { id: 'pago', title: 'Pago' }
];

/** Quantos marcos já foram cumpridos em cada situação (o próximo é o marco em curso). */
const MARCOS_CUMPRIDOS: Record<PaymentFollowUpCycle['status'], number> = {
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
type AcaoDoCiclo = 'CONFERIR' | 'RETORNO' | 'ENVIAR' | 'RESULTADO_CGOFI';
function proximaAcao(cycle: PaymentFollowUpCycle): { acao: AcaoDoCiclo; label: string } | null {
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

function buildMarcoSteps(cycle: PaymentFollowUpCycle): WorkflowStep[] {
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
function etapaMessage(cycle: PaymentFollowUpCycle): { tone: 'info' | 'warning' | 'danger'; text: string } | null {
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

function describeDocuments(cycle: PaymentFollowUpCycle): string {
  const itens = cycle.itens ?? [];
  if (itens.length > 0) return itens.map((i) => `NF ${i.notaFiscal}`).join(' · ');
  const documentos = cycle.documentos ?? [];
  if (documentos.length === 0) return cycle.input.observacoes || 'Termo de Atesto';
  return documentos.map((d) => (d.numero ? `${d.tipo} nº ${d.numero}` : d.tipo)).join(' · ');
}

export const ContractPaymentFollowUpSection: React.FC<ContractPaymentFollowUpSectionProps> = ({
  contract,
  contractKey
}) => {
  const {
    cycles,
    activeCount,
    registerPaymentCycle,
    registerMarco,
    addDocument,
    removeDocument,
    deleteCycle
  } = useContractPaymentFollowUp(contractKey);

  const { data: manager } = useContractManager(contractKey);
  const gestorNome = manager?.gestorNome || undefined;
  const { user, role } = useAuth();
  const canEdit = role === 'gestor' || role === 'admin';
  const isAdmin = role === 'admin';
  const confirm = useConfirmDialog();
  const toast = useToast();
  const registradoPorNome = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || undefined;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [acaoAberta, setAcaoAberta] = useState<{ cycleKey: string; acao: AcaoDoCiclo | MarcoSimples } | null>(null);
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});
  const [cancelCycleKey, setCancelCycleKey] = useState<string | null>(null);
  const acaoCycle = cycles.find((c) => c.cycleKey === acaoAberta?.cycleKey) ?? null;
  const abrir = (cycleKey: string, acao: AcaoDoCiclo | MarcoSimples) => setAcaoAberta({ cycleKey, acao });
  const fechar = () => setAcaoAberta(null);

  // Natureza de despesa dos empenhos: bem a incorporar (ND 449052) vai também à COLOG.
  const { data: empenhos = [] } = useEmpenhosDoContrato(contractKey);
  const bensDoContrato = useMemo(() => new Set(empenhos.filter((e) => ehBemAIncorporar(e.naturezaDespesa)).map((e) => e.canonicalKey)), [empenhos]);
  const temBem = (cycle: PaymentFollowUpCycle) =>
    (cycle.itens ?? []).some((i) => bensDoContrato.has(i.empenhoCanonicalKey)) ||
    Boolean(cycle.input.empenhoCanonicalKey && bensDoContrato.has(cycle.input.empenhoCanonicalKey));
  const hojeISO = new Date().toISOString().slice(0, 10);
  const contratoVigente = contract?.dataVigenciaFim ? contract.dataVigenciaFim.slice(0, 10) >= hojeISO : undefined;
  const valorContrato = contract?.valorGlobal || contract?.valorInicial || null;
  const cancelCycle = cycles.find((c) => c.cycleKey === cancelCycleKey) ?? null;

  const handleDelete = async (cycle: PaymentFollowUpCycle) => {
    const ok = await confirm({
      title: 'Excluir ciclo definitivamente',
      message: `Excluir o ciclo do atesto ${cycle.input.documentoAtestoSei}? Os documentos, o histórico e o checklist dele serão apagados e não podem ser recuperados. Para só encerrar o ciclo, use Cancelar.`,
      tone: 'danger',
      confirmLabel: 'Excluir'
    });
    if (!ok) return;
    try {
      await deleteCycle(cycle.cycleKey);
      toast.success('Ciclo excluído.');
    } catch (err) {
      toast.error((err as { message?: string } | null)?.message || 'Não foi possível excluir o ciclo.');
    }
  };

  const toggleExpand = (cycleKey: string) => {
    setExpandedCycles((prev) => ({ ...prev, [cycleKey]: !prev[cycleKey] }));
  };

  return (
    <div id="contract-payment-followup-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        {cycles.length > 0 && (
          <StatusBadge
            label={`${activeCount} ${activeCount === 1 ? 'ciclo ativo' : 'ciclos ativos'}`}
            variant={activeCount > 0 ? 'info' : 'neutral'}
            dot={false}
            testId="payment-active-count"
          />
        )}
        {canEdit && (
          <ActionButton action="novo" size="sm" onClick={() => setIsModalOpen(true)} style={{ marginLeft: 'auto' }}>
            Abrir ciclo de pagamento
          </ActionButton>
        )}
      </div>

      {cycles.length === 0 && (
        <EmptyState
          icon={<Clock size={28} />}
          title="Nenhum ciclo de faturamento/atesto em acompanhamento."
          description="Quando o processo de pagamento chegar à CGLIC, abra o ciclo aqui: conferência pelo checklist da Portaria 50, envio à CGOFI e o pagamento identificado pelo sistema."
          testId="payment-empty-state"
        />
      )}

      {cycles.map((cycle) => {
        const isExpanded = Boolean(expandedCycles[cycle.cycleKey]);
        const statusStyle = getPaymentStatusDisplay(cycle.status);
        const responsavel = describeResponsavel(cycle.input.responsavelNome, gestorNome);
        const acao = proximaAcao(cycle);
        const etapa = etapaMessage(cycle);
        const prazosLegais = calcularPrazosLegais(cycle, { valorContrato });
        const encerrado = isPaymentCycleEncerrado(cycle.status);
        const podeProrrogar = !cycle.input.liquidacaoProrrogada && ['RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI'].includes(cycle.status);
        const cologPendente = temBem(cycle) && !cycle.input.cologEnviadoEm && ['ENVIADO_CGOFI', 'LIQUIDADO', 'PAGO'].includes(cycle.status);

        return (
          <div
            key={cycle.cycleKey}
            data-testid={`payment-cycle-${cycle.cycleKey}`}
            style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}
          >
            <div className="payment-cycle-head" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <StatusBadge label={statusStyle.label} variant={statusStyle.variant} dot={false} size="sm" />
                  <strong style={{ fontSize: '0.98rem', color: '#0f172a' }}>{describeDocuments(cycle)}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem', color: '#64748b', flexWrap: 'wrap' }}>
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
              </div>

              <div className="payment-cycle-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {canEdit && acao && (
                  <ActionButton
                    action="avancarEtapa"
                    size="sm"
                    onClick={() => abrir(cycle.cycleKey, acao.acao)}
                    title={acao.label}>
                    <span className="payment-action-label">{acao.label}</span>
                  </ActionButton>
                )}
                {canEdit && cologPendente && (
                  <ActionButton action="avancarEtapa" size="sm" onClick={() => abrir(cycle.cycleKey, 'ENVIADO_COLOG')} title="Enviar à COLOG">
                    <span className="payment-action-label">Enviar à COLOG</span>
                  </ActionButton>
                )}
                {canEdit && podeProrrogar && (
                  <ActionButton action="editar" size="sm" onClick={() => abrir(cycle.cycleKey, 'PRORROGACAO_LIQUIDACAO')} title="Prorrogar o prazo de liquidação">
                    <span className="payment-action-label">Prorrogar liquidação</span>
                  </ActionButton>
                )}
                {canEdit && !isPaymentCycleEncerrado(cycle.status) && (
                  <ActionButton
                    action="cancelarCiclo"
                    size="sm"
                    onClick={() => setCancelCycleKey(cycle.cycleKey)}
                    title="Cancelar ciclo">
                    <span className="payment-action-label">Cancelar ciclo</span>
                  </ActionButton>
                )}
                {isAdmin && (
                  <ActionButton action="excluir"
                    size="sm"
                    onClick={() => void handleDelete(cycle)}
                    title="Excluir ciclo definitivamente">
                    <span className="payment-action-label">Excluir</span>
                  </ActionButton>
                )}
                <ActionButton action={isExpanded ? 'recolher' : 'expandir'}
                  size="sm"
                  onClick={() => toggleExpand(cycle.cycleKey)}
                  title={isExpanded ? 'Ocultar documentos e histórico' : 'Ver documentos e histórico'}>
                    <span className="payment-action-label">{isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
                  </ActionButton>
              </div>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <WorkflowStepper steps={buildMarcoSteps(cycle)} testId={`payment-stepper-${cycle.cycleKey}`} />
            </div>

            {!encerrado && (prazosLegais.chegada.fora || prazosLegais.liquidacao.estourou || prazosLegais.riscoExtincao || cologPendente) && (
              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {prazosLegais.chegada.fora && (
                  <NoticeBar tone="warning" testId={`payment-chegada-${cycle.cycleKey}`}>
                    Chegou com {prazosLegais.chegada.diasUteisAteVencimento} dia(s) útil(eis) até o vencimento; a Portaria 50 (art. 5º) pede no mínimo{' '}
                    {prazosLegais.chegada.minimo}. O atraso nasceu antes da CGLIC.
                  </NoticeBar>
                )}
                {prazosLegais.liquidacao.estourou && !prazosLegais.liquidacao.concluido && (
                  <NoticeBar tone="danger" testId={`payment-liquidacao-${cycle.cycleKey}`}>
                    Prazo de liquidação passou: {prazosLegais.liquidacao.diasUteis} dias úteis desde o atesto, teto de {prazosLegais.liquidacao.teto}{' '}
                    (IN 77, art. 7º, I).
                  </NoticeBar>
                )}
                {prazosLegais.riscoExtincao && (
                  <NoticeBar tone="danger" testId={`payment-extincao-${cycle.cycleKey}`}>
                    Mais de 2 meses desde o atesto sem pagamento: o contratado pode pedir a extinção do contrato (IN 77, art. 11).
                  </NoticeBar>
                )}
                {cologPendente && (
                  <NoticeBar tone="info" testId={`payment-colog-${cycle.cycleKey}`}>
                    Bem a incorporar (ND 449052): o processo ainda não foi enviado à COLOG (Portaria 50, art. 5º, § 5º).
                  </NoticeBar>
                )}
              </div>
            )}

            {(etapa || (cycle.alerts && cycle.alerts.length > 0)) && (
              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {etapa && (
                  <NoticeBar tone={etapa.tone === 'danger' ? 'danger' : etapa.tone} testId={`payment-etapa-${cycle.cycleKey}`}>
                    {etapa.text}
                  </NoticeBar>
                )}
                {cycle.alerts
                  // O prazo da etapa já aparece acima; evita repetir o mesmo aviso
                  ?.filter((a) => a.tipo !== 'PRAZO_ETAPA_VENCIDO' && a.tipo !== 'CGOFI_SEM_RESPOSTA')
                  .map((alert) => (
                    <NoticeBar
                      key={alert.id}
                      tone={alert.nivel === 'CRITICO' ? 'danger' : alert.nivel === 'ATENCAO' ? 'warning' : 'info'}
                      testId={`payment-alert-${alert.id}`}
                    >
                      {alert.mensagem}
                    </NoticeBar>
                  ))}
              </div>
            )}

            {isExpanded && (
              <div style={{ padding: '1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <PaymentCyclePrazosLegais cycle={cycle} prazos={prazosLegais} />
                <PaymentCycleItens cycle={cycle} />
                <PaymentCycleChecklist cycle={cycle} />
                <PaymentCycleDocuments cycle={cycle} canEdit={canEdit} onAdd={addDocument} onRemove={removeDocument} />
                <PaymentCycleHistory cycle={cycle} />
              </div>
            )}
          </div>
        );
      })}

      <CreateCycleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        contractKey={contractKey}
        gestorNome={gestorNome}
        registradoPorNome={registradoPorNome}
        onSubmit={registerPaymentCycle}
      />
      <CancelCycleModal
        cycle={cancelCycle}
        onClose={() => setCancelCycleKey(null)}
        registradoPorNome={registradoPorNome}
        onSubmit={registerMarco}
      />
      <ConferenciaModal
        cycle={acaoAberta?.acao === 'CONFERIR' ? acaoCycle : null}
        contratoVigente={contratoVigente}
        onClose={fechar}
        registradoPorNome={registradoPorNome}
        onSubmit={registerMarco}
      />
      <EnvioCgofiModal
        cycle={acaoAberta?.acao === 'ENVIAR' ? acaoCycle : null}
        contratoIdGov={contract?.contratoId ?? null}
        onClose={fechar}
        registradoPorNome={registradoPorNome}
        onSubmit={registerMarco}
      />
      <MarcoSimplesModal
        cycle={acaoAberta && !['CONFERIR', 'ENVIAR'].includes(acaoAberta.acao) ? acaoCycle : null}
        marco={acaoAberta && !['CONFERIR', 'ENVIAR'].includes(acaoAberta.acao) ? (acaoAberta.acao as MarcoSimples) : null}
        onClose={fechar}
        registradoPorNome={registradoPorNome}
        onSubmit={registerMarco}
      />
    </div>
  );
};

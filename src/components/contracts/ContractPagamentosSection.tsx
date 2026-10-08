import React, { useMemo, useState } from 'react';
import { Clock, FileText, Stamp } from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';
import { useContractPaymentFollowUp } from '../../hooks/useContractPaymentFollowUp';
import { useContractManager } from '../../hooks/useContractManager';
import { useAuth } from '../../context/AuthContext';
import { useFaturasDoContrato, empenhosDaFatura } from '../../hooks/useFaturasDoContrato';
import { useSincronizacaoEmpenhosContrato } from '../../hooks/useSincronizacaoEmpenhosContrato';
import type { FaturaDoContrato } from '../../services/faturasService';
import { isPaymentCycleEncerrado } from '../../services/paymentFollowUpService';
import { ehBemAIncorporar } from '../../services/cicloPagamentoApoioService';
import {
  ActionButton,
  AppButton,
  DataTable,
  EmptyState,
  ErrorState,
  NoticeBar,
  SectionHeader,
  StatusBadge,
  SummaryBar,
  useConfirmDialog,
  useToast,
  type Column
} from '../../design-system';
import { CancelCycleModal, CreateCycleModal, MarcoSimplesModal, type MarcoSimples } from './payment/PaymentCycleModals';
import { useEmpenhosDoContrato } from './payment/cicloPagamentoShared';
import { ConferenciaModal } from './payment/ConferenciaModal';
import { EnvioCgofiModal } from './payment/EnvioCgofiModal';
import { EscolherFaturaModal } from './payment/EscolherFaturaModal';
import { ExpectativaPagamentoContrato } from './payment/ExpectativaPagamentoContrato';
import { isoToBR } from './payment/paymentFormUtils';
import {
  CycleStatusBadge,
  PaymentCyclePanel,
  describeDocuments,
  podeEscolherFatura,
  proximaAcao,
  type AcaoAberta
} from './payment/PaymentCyclePanel';
import { useLinhasAbertas } from './useLinhasAbertas';

interface ContractPagamentosSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
  /** Fatura a abrir (vinda da aba Empenhos pelo endereço). */
  abrirFatura?: string | null;
  /** Abre a nota de empenho na aba Empenhos. */
  onAbrirEmpenho?: (numero: string) => void;
}

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dataHora = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Etapa da fatura: cancelada, paga (OB válida ou "Pago"), liquidada aguardando OB ou em andamento. */
export function etapaDaFatura(f: FaturaDoContrato): { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' | 'danger' } {
  if (f.cancelada) return { label: 'Cancelada', variant: 'neutral' };
  if (f.paga) return { label: 'Paga', variant: 'success' };
  if (f.dataLiquidacao) return { label: 'Liquidada', variant: 'info' };
  if (f.situacao === 'Siafi Erro') return { label: 'Erro no SIAFI', variant: 'danger' };
  return { label: f.situacao || 'Em andamento', variant: 'warning' };
}

/** Prazo da etapa em curso numa linha: selo (vencido/faltam) e a data. */
const PrazoDaEtapa: React.FC<{ cycle: PaymentFollowUpCycle }> = ({ cycle }) => {
  const e = cycle.etapaAtual;
  if (!e || isPaymentCycleEncerrado(cycle.status)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const dias = Math.abs(e.diasUteisRestantes);
  const texto = e.atrasado ? `vencido há ${dias} d.u.` : `faltam ${dias} d.u.`;
  const variant = e.atrasado ? (e.dono === 'CGLIC' ? 'danger' : 'warning') : dias <= 2 ? 'warning' : 'neutral';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
      <StatusBadge label={texto} variant={variant} size="sm" dot={false} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {e.dono === 'CGOFI' ? 'cobrar a CGOFI em' : 'até'} {isoToBR(e.dataAlvo)}
      </span>
    </div>
  );
};

/**
 * Aba Pagamentos do contrato, no molde da aba Contratos e empenhos do item: uma faixa de resumo com os avisos,
 * os atestos que ainda não têm fatura e as faturas do Contratos.gov.br. A linha da fatura abre o ciclo da CGLIC
 * ligado a ela (Portaria 50); a CGLIC acompanha e a CGOFI executa o pagamento.
 */
export const ContractPagamentosSection: React.FC<ContractPagamentosSectionProps> = ({ contract, contractKey, abrirFatura, onAbrirEmpenho }) => {
  const { cycles, registerPaymentCycle, registerMarco, addDocument, removeDocument, deleteCycle, ligarFaturas } = useContractPaymentFollowUp(contractKey);
  const { data: faturasData, isLoading: carregandoFaturas, isError: erroFaturas, refetch: recarregarFaturas } = useFaturasDoContrato(contractKey);
  const { data: syncEmpenhos, isLoading: carregandoEmpenhos } = useSincronizacaoEmpenhosContrato(contractKey);
  const { data: manager } = useContractManager(contractKey);
  const gestorNome = manager?.gestorNome || undefined;
  const { user, role } = useAuth();
  const canEdit = role === 'gestor' || role === 'admin';
  const isAdmin = role === 'admin';
  const confirm = useConfirmDialog();
  const toast = useToast();
  const registradoPorNome = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || undefined;

  const [criando, setCriando] = useState(false);
  const [acaoAberta, setAcaoAberta] = useState<{ cycleKey: string; acao: AcaoAberta } | null>(null);
  const [cancelCycleKey, setCancelCycleKey] = useState<string | null>(null);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const acaoCycle = cycles.find((c) => c.cycleKey === acaoAberta?.cycleKey) ?? null;
  const cancelCycle = cycles.find((c) => c.cycleKey === cancelCycleKey) ?? null;
  const abrir = (cycleKey: string, acao: AcaoAberta) => setAcaoAberta({ cycleKey, acao });
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

  const faturas = faturasData?.faturas ?? [];
  const resumo = faturasData?.resumo ?? null;
  const cicloDaFatura = useMemo(() => {
    const m = new Map<number, PaymentFollowUpCycle>();
    for (const c of cycles) for (const f of c.faturas ?? []) m.set(f.idFatura, c);
    return m;
  }, [cycles]);
  const semFatura = cycles.filter((c) => (c.faturas ?? []).length === 0);
  const emAtesto = semFatura.filter((c) => !isPaymentCycleEncerrado(c.status));
  const encerradosSemFatura = semFatura.filter((c) => isPaymentCycleEncerrado(c.status));
  const ativos = cycles.filter((c) => !isPaymentCycleEncerrado(c.status)).length;
  const prazoCglicVencido = cycles.filter((c) => !isPaymentCycleEncerrado(c.status) && c.etapaAtual?.dono === 'CGLIC' && c.etapaAtual.atrasado);
  const aguardandoFatura = emAtesto.filter((c) => podeEscolherFatura(c));

  // O cruzamento fatura × empenho vinculado só vale depois que os empenhos do contrato foram consultados.
  const empenhosConsultados = Boolean(syncEmpenhos?.ultimoSucessoEm);
  const comNeSemVinculo = faturas.filter((f) => f.empenhosSemVinculo > 0);
  const nesSemVinculo = [...new Set(comNeSemVinculo.flatMap((f) => empenhosDaFatura(f.empenhosSemVinculoNumeros)))];
  const npCompartilhada = faturas.filter((f) => !f.cancelada && f.npContratos > 1).length;

  const linhasFatura = useLinhasAbertas(abrirFatura, 'contract-faturas-table', faturas.length > 0);
  const linhasAtesto = useLinhasAbertas(null, 'payment-atesto-table', true);

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

  const painel = (cycle: PaymentFollowUpCycle) => (
    <PaymentCyclePanel
      cycle={cycle}
      gestorNome={gestorNome}
      canEdit={canEdit}
      isAdmin={isAdmin}
      temBem={temBem(cycle)}
      valorContrato={valorContrato}
      onAcao={(acao) => abrir(cycle.cycleKey, acao)}
      onCancelar={() => setCancelCycleKey(cycle.cycleKey)}
      onExcluir={() => void handleDelete(cycle)}
      addDocument={addDocument}
      removeDocument={removeDocument}
    />
  );

  const proximoPasso = (c: PaymentFollowUpCycle) => {
    if (!canEdit) return <CycleStatusBadge cycle={c} />;
    if (podeEscolherFatura(c)) {
      return <ActionButton action="vincular" size="sm" label="Escolher fatura" onClick={() => abrir(c.cycleKey, 'ESCOLHER_FATURA')} />;
    }
    const acao = proximaAcao(c);
    return acao ? (
      <ActionButton action="avancarEtapa" size="sm" onClick={() => abrir(c.cycleKey, acao.acao)}>
        {acao.label}
      </ActionButton>
    ) : null;
  };

  const colunasAtesto: Column<PaymentFollowUpCycle>[] = [
    {
      key: 'atesto',
      header: 'Atesto (SEI)',
      priority: 'primary',
      sortValue: (c) => c.input.documentoAtestoSei,
      render: (c) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <strong>{c.input.documentoAtestoSei}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{describeDocuments(c)}</span>
        </div>
      )
    },
    { key: 'valor', header: 'Valor', align: 'right', sortValue: (c) => c.input.valorAtesto, sortFirstDir: 'desc', render: (c) => moeda(c.input.valorAtesto) },
    { key: 'chegada', header: 'Chegou em', sortValue: (c) => c.input.dataRecebimento, sortFirstDir: 'desc', render: (c) => isoToBR(c.input.dataRecebimento) },
    { key: 'etapa', header: 'Etapa', render: (c) => <CycleStatusBadge cycle={c} /> },
    { key: 'prazo', header: 'Prazo', sortValue: (c) => c.etapaAtual?.dataAlvo, render: (c) => <PrazoDaEtapa cycle={c} /> },
    { key: 'passo', header: 'Próximo passo', render: proximoPasso }
  ];

  const linkEmpenho = (numero: string) =>
    onAbrirEmpenho ? (
      <AppButton key={numero} variant="link" size="xs" type="button" onClick={() => onAbrirEmpenho(numero)} title="Abrir a nota na aba Empenhos">
        {numero}
      </AppButton>
    ) : (
      <span key={numero}>{numero}</span>
    );

  const colunasFatura: Column<FaturaDoContrato>[] = [
    {
      key: 'numero',
      header: 'Fatura',
      priority: 'primary',
      sortValue: (f) => f.numero,
      render: (f) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <strong>{f.numero || f.idFatura}</strong>
          {f.referencia && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ref. {f.referencia}</span>}
        </div>
      )
    },
    { key: 'valor', header: 'Valor', align: 'right', sortValue: (f) => f.valor, sortFirstDir: 'desc', render: (f) => moeda(f.valor) },
    {
      key: 'etapa',
      header: 'Situação',
      sortValue: (f) => etapaDaFatura(f).label,
      render: (f) => {
        const e = etapaDaFatura(f);
        return <StatusBadge label={e.label} variant={e.variant} size="sm" dot={false} />;
      }
    },
    { key: 'liquidacao', header: 'Liquidação', sortValue: (f) => f.dataLiquidacao, sortFirstDir: 'desc', render: (f) => isoToBR(f.dataLiquidacao) || '—' },
    {
      key: 'ob',
      header: 'Ordem bancária',
      sortValue: (f) => f.obEmissao,
      sortFirstDir: 'desc',
      render: (f) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          {f.ordensBancarias ? (
            <>
              <span>{f.ordensBancarias}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isoToBR(f.obEmissao)}</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{f.dataLiquidacao && !f.cancelada ? 'aguardando' : '—'}</span>
          )}
          {f.np && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              NP {f.np}
              {f.npContratos > 1 ? ` · paga também outros ${f.npContratos - 1} contrato(s)` : ''}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'empenhos',
      header: 'Empenho',
      render: (f) => {
        const todas = empenhosDaFatura(f.empenhos);
        if (todas.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const fora = new Set(empenhosDaFatura(f.empenhosSemVinculoNumeros));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: 'flex-start' }}>
            {todas.map((n) =>
              fora.has(n) && empenhosConsultados ? (
                <span key={n} title="Empenho não vinculado a este contrato" style={{ color: 'var(--warning)', fontWeight: 600 }}>
                  {n} <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>(fora do contrato)</span>
                </span>
              ) : (
                linkEmpenho(n)
              )
            )}
          </div>
        );
      }
    },
    {
      key: 'ciclo',
      header: 'Ciclo da CGLIC',
      render: (f) => {
        const c = cicloDaFatura.get(f.idFatura);
        return c ? <CycleStatusBadge cycle={c} /> : <StatusBadge label="Sem ciclo" variant="neutral" size="sm" dot={false} />;
      }
    }
  ];

  const detalheDaFatura = (f: FaturaDoContrato) => {
    const c = cicloDaFatura.get(f.idFatura);
    if (c) return painel(c);
    return (
      <div className="detail-panel" data-testid={`fatura-sem-ciclo-${f.idFatura}`}>
        <span style={{ fontSize: '0.85rem' }}>
          Esta fatura não está ligada a nenhum ciclo da CGLIC. Pode ser um atesto que não passou pela coordenação ou uma fatura lançada no
          contrato errado.
        </span>
        {canEdit && aguardandoFatura.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {aguardandoFatura.map((c) => (
              <ActionButton key={c.cycleKey} action="vincular" size="sm" onClick={() => abrir(c.cycleKey, 'ESCOLHER_FATURA')}>
                Ligar ao atesto {c.input.documentoAtestoSei}
              </ActionButton>
            ))}
          </div>
        )}
      </div>
    );
  };

  const botaoAbrirCiclo = canEdit ? (
    <ActionButton action="novo" size="sm" onClick={() => setCriando(true)} data-testid="payment-open-cycle">
      Abrir ciclo de pagamento
    </ActionButton>
  ) : undefined;

  const nadaAinda = !carregandoFaturas && !erroFaturas && faturas.length === 0 && cycles.length === 0;

  return (
    <div id="contract-payment-followup-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <SummaryBar
        testId="contract-pagamentos-resumo"
        loading={carregandoFaturas}
        loadingLabel="Carregando faturas..."
        items={[
          { label: 'Faturado', value: moeda(resumo?.valorFaturado ?? 0), unit: '' },
          { label: 'Liquidado', value: moeda(resumo?.valorLiquidado ?? 0), unit: '' },
          { label: 'Pago', value: moeda(resumo?.valorPago ?? 0), unit: '', tone: 'success' },
          {
            label: 'Liquidadas aguardando OB',
            value: String(resumo?.liquidadasSemPagamento ?? 0),
            unit: '',
            tone: (resumo?.liquidadasSemPagamento ?? 0) > 0 ? 'warning' : 'default'
          },
          { label: 'Ciclos ativos', value: String(ativos), unit: '' }
        ]}
        progress={resumo && resumo.valorFaturado > 0 ? { value: resumo.valorPago, max: resumo.valorFaturado, label: 'Pago do faturado' } : undefined}
      >
        {faturasData?.sincronizadoEm && (
          <span data-testid="contract-faturas-sincronizado" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Faturas consultadas no Contratos.gov.br em {dataHora(faturasData.sincronizadoEm)}; ordens bancárias do Tesouro (STA).
          </span>
        )}
        {prazoCglicVencido.length > 0 && (
          <NoticeBar tone="danger" testId="payment-prazo-cglic-vencido">
            <strong>{prazoCglicVencido.length}</strong>{' '}
            {prazoCglicVencido.length === 1 ? 'ciclo está com o prazo da CGLIC vencido' : 'ciclos estão com o prazo da CGLIC vencido'}:{' '}
            {prazoCglicVencido.map((c) => c.input.documentoAtestoSei).join(', ')}.
          </NoticeBar>
        )}
        {nesSemVinculo.length > 0 && !empenhosConsultados && !carregandoEmpenhos && (
          <NoticeBar tone="info" testId="contract-faturas-empenhos-nao-consultados">
            Os empenhos deste contrato ainda não foram consultados no Contratos.gov.br, então as faturas ainda não podem ser conferidas com
            os empenhos vinculados. A sincronização do servidor faz essa consulta; para fazer agora, use Atualizar empenhos, no topo.
          </NoticeBar>
        )}
        {nesSemVinculo.length > 0 && empenhosConsultados && (
          <NoticeBar tone="warning" testId="contract-faturas-ne-sem-vinculo">
            {comNeSemVinculo.length === 1 ? '1 fatura cita' : `${comNeSemVinculo.length} faturas citam`} empenho que não está vinculado a este
            contrato no sistema: <strong>{nesSemVinculo.join(', ')}</strong>. Use Atualizar empenhos, no topo, e confira o contrato no
            Contratos.gov.br.
          </NoticeBar>
        )}
      </SummaryBar>

      {nadaAinda ? (
        <EmptyState
          icon={<Clock size={28} />}
          title={faturasData?.sincronizadoEm ? 'Nenhum atesto em acompanhamento e nenhuma fatura no Contratos.gov.br' : 'Nenhum atesto em acompanhamento'}
          description={
            faturasData?.sincronizadoEm
              ? `Faturas consultadas em ${dataHora(faturasData.sincronizadoEm)}. Quando o processo de pagamento chegar à CGLIC, abra o ciclo aqui: conferência pelo checklist da Portaria 50, envio à CGOFI e o pagamento identificado pelo sistema.`
              : 'Quando o processo de pagamento chegar à CGLIC, abra o ciclo aqui. As faturas deste contrato ainda não foram consultadas; a sincronização do servidor lê as faturas dos contratos vigentes e dos vencidos há até 24 meses.'
          }
          action={botaoAbrirCiclo}
          testId="payment-empty-state"
        />
      ) : (
        <>
          <div>
            <SectionHeader
              title="Em atesto na CGLIC"
              subtitle="Ciclos que ainda não têm fatura ligada no Contratos.gov.br"
              icon={<Stamp size={16} />}
              countBadge={emAtesto.length}
              actions={botaoAbrirCiclo}
            />
            <DataTable
              columns={colunasAtesto}
              data={mostrarEncerrados ? [...emAtesto, ...encerradosSemFatura] : emAtesto}
              keyExtractor={(c) => c.cycleKey}
              testId="payment-atesto-table"
              emptyMessage="Nenhum atesto aguardando a CGLIC."
              renderExpanded={painel}
              expandedKeys={linhasAtesto.abertas}
              onToggleExpand={linhasAtesto.alternar}
              expandLabel={(c) => `atesto ${c.input.documentoAtestoSei}`}
            />
            {encerradosSemFatura.length > 0 && (
              <AppButton variant="link" size="sm" onClick={() => setMostrarEncerrados((v) => !v)} style={{ marginTop: '0.4rem' }}>
                {mostrarEncerrados
                  ? 'Ocultar ciclos encerrados sem fatura'
                  : `Mostrar ${encerradosSemFatura.length} ${encerradosSemFatura.length === 1 ? 'ciclo encerrado' : 'ciclos encerrados'} sem fatura`}
              </AppButton>
            )}
          </div>

          <div>
            <SectionHeader
              title="Faturas"
              subtitle="Contratos.gov.br, liquidação no SIAFI e ordem bancária no Tesouro (atualizadas pelo servidor)"
              icon={<FileText size={16} />}
              countBadge={faturas.length}
            />
            {erroFaturas ? (
              <ErrorState
                title="Não foi possível ler as faturas do contrato"
                message="A consulta ao banco falhou. Isto não indica ausência de faturas."
                onRetry={() => recarregarFaturas()}
                testId="contract-faturas-error"
              />
            ) : (
              <>
                <DataTable
                  columns={colunasFatura}
                  data={faturas}
                  keyExtractor={(f) => String(f.idFatura)}
                  isLoading={carregandoFaturas}
                  testId="contract-faturas-table"
                  emptyMessage={
                    faturasData?.sincronizadoEm
                      ? `O Contratos.gov.br não tem fatura para este contrato (consulta de ${dataHora(faturasData.sincronizadoEm)}).`
                      : 'As faturas deste contrato ainda não foram consultadas. A sincronização do servidor lê as faturas de hora em hora.'
                  }
                  renderExpanded={detalheDaFatura}
                  expandedKeys={linhasFatura.abertas}
                  onToggleExpand={linhasFatura.alternar}
                  expandLabel={(f) => `fatura ${f.numero || f.idFatura}`}
                />
                {faturas.length > 0 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
                    Pago é a soma das faturas cuja nota de pagamento tem ordem bancária válida, não o valor da OB: uma OB pode pagar faturas de
                    vários contratos{npCompartilhada > 0 ? ` (${npCompartilhada} fatura(s) deste contrato estão nesse caso)` : ''}.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}

      <ExpectativaPagamentoContrato contractKey={contractKey} canEdit={canEdit} registradoPorNome={registradoPorNome} />

      <CreateCycleModal
        isOpen={criando}
        onClose={() => setCriando(false)}
        contractKey={contractKey}
        gestorNome={gestorNome}
        registradoPorNome={registradoPorNome}
        onSubmit={registerPaymentCycle}
      />
      <CancelCycleModal cycle={cancelCycle} onClose={() => setCancelCycleKey(null)} registradoPorNome={registradoPorNome} onSubmit={registerMarco} />
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
      <EscolherFaturaModal
        cycle={acaoAberta?.acao === 'ESCOLHER_FATURA' ? acaoCycle : null}
        contratoIdGov={contract?.contratoId ?? null}
        onClose={fechar}
        registradoPorNome={registradoPorNome}
        onSubmit={ligarFaturas}
      />
      <MarcoSimplesModal
        cycle={acaoAberta && !['CONFERIR', 'ENVIAR', 'ESCOLHER_FATURA'].includes(acaoAberta.acao) ? acaoCycle : null}
        marco={acaoAberta && !['CONFERIR', 'ENVIAR', 'ESCOLHER_FATURA'].includes(acaoAberta.acao) ? (acaoAberta.acao as MarcoSimples) : null}
        onClose={fechar}
        registradoPorNome={registradoPorNome}
        onSubmit={registerMarco}
      />
    </div>
  );
};

import React, { useState } from 'react';
import { Check, Circle, CircleDot, Minus, Sliders, ExternalLink, Plus } from 'lucide-react';
import type {
  AtaTask,
  AtaTaskPlan,
  ContractTask,
  ContractTaskPlan,
  ContractTaskStatusValue
} from '../../types';
import { groupMacrotasksByModule } from '../../utils/taskPlanModules';
import { sugerirNomeModulo } from '../../utils/planModuleNaming';
import { numeroEtapa, numeroTarefa, stripNumeracaoManual } from '../../utils/planNumbering';
import { ResponsavelField, type ResponsavelValue } from '../contracts/ResponsavelField';
import {
  AddTaskForm,
  AddMacrotaskForm,
  MacrotaskHeader,
  ModuleGroupHeader,
  ConfirmDeleteButton,
  MutationError,
  PERSONALIZADA_BADGE_STYLE,
  describeResponsavel
} from '../contracts/planTaskEditing';
import { formatDateBR } from '../../services/temporalEngineService';
import { classifyTaskAttention } from '../contracts/taskAttentionDisplay';
import { severityFromAttentionPriorityLevel } from '../../services/severityService';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { ActionButton, AppButton, DataTable, EmptyState, InfoHint, Modal, SummaryBar, useConfirmDialog } from '../../design-system';
import { lerNumeroSei, descreverNumeroSei } from '../../utils/numeroSei';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import type { AtualizarModuloInput, MarcaTarefaInput } from '../../adapters/modeloGestaoRpcAdapter';
import {
  aguardandoResposta,
  formatarEsforco,
  grupoDaTarefa,
  prazoEfetivo,
  rotuloLista,
  textoRegraPrazo,
  textoRegraResposta,
  type GrupoTarefa
} from '../../utils/modeloGestao';
import { AcaoEtiqueta, MarcaOrientarForm, ModuloDados, PlanoContadores, PregaoEtiqueta, RegraDetalhes, type ContagemGrupos } from './modeloGestaoPlano';
import { GRUPO_INFO } from '../../utils/modeloGestao';

/**
 * Plano de gestão: mesma tela para Contrato e Ata. O componente só desenha; quem usa informa por
 * `controller` as chaves, os textos e as ações (hooks de cada tipo de instrumento).
 */

export type PlanTask = ContractTask | AtaTask;
export type TaskPlan = ContractTaskPlan | AtaTaskPlan;

/** Mutação já ligada a um hook do React Query, no mínimo que a tela precisa. */
export interface PlanMutation<V> {
  mutate: (variables: V, options?: { onSuccess?: () => void }) => void;
  isPending: boolean;
  error: unknown;
}

/** Ação do controlador: `run` dispara, o resto é o estado da mutação por trás. */
export interface PlanAction<A extends unknown[]> {
  run: (...args: A) => void;
  isPending: boolean;
  error: unknown;
}

export interface TaskUpdateVars {
  taskId: string;
  status: ContractTaskStatusValue;
  nome?: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  prazo?: string | null;
  observacao?: string | null;
  /** Número SEI: undefined mantém; texto grava; null retira. */
  sei?: string | null;
}

export interface TaskPlanLabels {
  /** Título do estado sem plano (ex.: "Nenhum Modelo de Gestão aplicado a este contrato"). */
  semPlanoTitulo: string;
  semPlanoDescricao: string;
  /** Ex.: "gestor do contrato", "gestor da Ata". */
  gestorLabel: string;
  herancaMsg: string;
  semGestorMsg: string;
}

/** Modelo oferecido no "Aplicar modelo" (só os ativos). */
export interface TaskPlanTemplateOption {
  id: string;
  nome: string;
  /** Quando o módulo costuma entrar e em que processo SEI corre (modelos da CCGA). */
  quando?: string;
  processoTipo?: string;
}

export interface TaskPlanController {
  /** Chave do instrumento nos hooks de tarefa (contractKey ou ataKey). */
  entityKey: string;
  gestorNome?: string;
  labels: TaskPlanLabels;
  useUpdateTask: (key: string) => PlanMutation<TaskUpdateVars>;
  useDeleteTask: (key: string) => PlanMutation<string>;
  /** Modelo de gestão da CCGA (migration 210): as duas marcas do orientar, o ajuste da data e o módulo. */
  useMarcarPedido: (key: string) => PlanMutation<MarcaTarefaInput>;
  useRegistrarResposta: (key: string) => PlanMutation<MarcaTarefaInput>;
  useAjustarPrazo: (key: string) => PlanMutation<{ taskId: string; prazo: string | null }>;
  useAtualizarModulo: (key: string) => PlanMutation<AtualizarModuloInput>;
  templates: TaskPlanTemplateOption[];
  loadingTemplates: boolean;
  applyTemplate: PlanAction<[templateId: string, onSuccess: () => void, moduloNome?: string]>;
  startPlan: PlanAction<[]>;
  saveMacrotask: PlanAction<[vars: { id?: string; planId?: string; nome: string }]>;
  deleteMacrotask: PlanAction<[id: string]>;
  deleteModule: PlanAction<[vars: { planId: string; moduloId: string }]>;
  renameModule: PlanAction<[vars: { planId: string; moduloId: string; nome: string }]>;
  createTask: PlanAction<[vars: { macrotaskId: string; nome: string; prazo: string | null; observacao: string | null }]>;
  /** Plano só de leitura (perfil consulta): sem status clicável, edição, exclusão, modelos ou tarefas novas. */
  somenteLeitura?: boolean;
}

const STATUS_OPTIONS: { value: ContractTaskStatusValue; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PENDENTE', label: 'Pendente', icon: <Circle size={13} />, color: '#94a3b8' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento', icon: <CircleDot size={13} />, color: '#d97706' },
  { value: 'CONCLUIDA', label: 'Concluída', icon: <Check size={13} />, color: '#059669' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável', icon: <Minus size={13} />, color: '#94a3b8' }
];

const externalLinkOf = (task: PlanTask): string | undefined => (task as ContractTask).externalLinkUrl;

/** Status da tarefa para quem só consulta: o mesmo ícone do seletor, sem clique. */
const StatusSoLeitura: React.FC<{ status: ContractTaskStatusValue }> = ({ status }) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span
      title={opt.label}
      aria-label={opt.label}
      data-testid="plan-status-leitura"
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '4px',
        border: `1.5px solid ${opt.color}`,
        background: `${opt.color}1a`,
        color: opt.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      {opt.icon}
    </span>
  );
};

/** Linha de uma tarefa do plano, igual em Contrato e Ata. */
export type TaskPlanRowController = Pick<
  TaskPlanController,
  'entityKey' | 'gestorNome' | 'labels' | 'useUpdateTask' | 'useDeleteTask' | 'useMarcarPedido' | 'useRegistrarResposta' | 'useAjustarPrazo' | 'somenteLeitura'
>;

export const TaskPlanRow: React.FC<{ task: PlanTask; controller: TaskPlanRowController; numero?: string }> = ({ task, controller, numero }) => {
  const { entityKey, gestorNome, labels, useUpdateTask, useDeleteTask, useMarcarPedido, useRegistrarResposta, useAjustarPrazo, somenteLeitura = false } = controller;
  const updateMutation = useUpdateTask(entityKey);
  const deleteMutation = useDeleteTask(entityKey);
  const marcarPedido = useMarcarPedido(entityKey);
  const registrarResposta = useRegistrarResposta(entityKey);
  const ajustarPrazo = useAjustarPrazo(entityKey);
  // Orientar: formulário da marca aberta (pedido enviado ou resposta recebida).
  const [marca, setMarca] = useState<'PEDIDO' | 'RESPOSTA' | null>(null);
  const [verRegra, setVerRegra] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const nomeTarefa = stripNumeracaoManual(task.nome);
  const [nome, setNome] = useState(nomeTarefa);
  const [responsavel, setResponsavel] = useState<ResponsavelValue>({
    nome: task.responsavelNome || '',
    userId: task.responsavelUserId
  });
  const [prazo, setPrazo] = useState(task.prazo || '');
  const [observacao, setObservacao] = useState(task.observacao || '');
  const [sei, setSei] = useState(task.seiNumero || '');
  // Pergunta do número SEI aberta ao clicar em Concluída.
  const [perguntandoSei, setPerguntandoSei] = useState(false);
  const [seiConclusao, setSeiConclusao] = useState('');
  // Só as tarefas de contrato trazem o sistema de destino (ex.: SEI, SICAF).
  const externalLinkUrl = externalLinkOf(task);
  const sistemaDestino = (task as ContractTask).sistemaDestino;

  const isOpen = task.status !== 'CONCLUIDA' && task.status !== 'NAO_APLICAVEL';
  // Com o pedido enviado, o aviso conta pela resposta esperada, não pela data de envio.
  const esperando = aguardandoResposta(task);
  const attention = isOpen ? classifyTaskAttention({ ...(task as ContractTask), prazo: prazoEfetivo(task) }) : null;
  const regraPrazo = textoRegraPrazo(task);
  const regraResposta = textoRegraResposta(task);
  const temRegra = !!task.prazoAncora && task.prazoAncora !== 'FIXO';
  const esforco = formatarEsforco(task.esforcoMin);
  const temDetalhes = !!(task.lista?.length || task.nota || task.modeloSei || esforco);
  const orientarAberto = isOpen && task.acao === 'ORIENTAR';
  const urgencyLabel =
    attention?.level === 'VENCIDA'
      ? `${Math.abs(attention.diasRestantes ?? 0)} ${Math.abs(attention.diasRestantes ?? 0) === 1 ? 'dia útil' : 'dias úteis'} de atraso`
      : attention?.level === 'HOJE'
      ? 'Vence hoje'
      : attention?.level === 'URGENTE' || attention?.level === 'PROXIMA'
      ? `${attention.diasRestantes} ${attention.diasRestantes === 1 ? 'dia útil' : 'dias úteis'}`
      : null;

  const handleStatusChange = (status: ContractTaskStatusValue) => {
    if (status === task.status) return;
    if (status === 'CONCLUIDA') {
      setSeiConclusao(task.seiNumero || '');
      setPerguntandoSei(true);
      setExpanded(false);
      return;
    }
    setPerguntandoSei(false);
    updateMutation.mutate({ taskId: task.id, status });
  };

  const seiConclusaoLido = lerNumeroSei(seiConclusao);
  /** `semNumero`: conclui sem número (retira o que estava guardado de uma conclusão anterior). */
  const concluir = (semNumero: boolean) => {
    const lido = semNumero ? ({ tipo: 'VAZIO' } as const) : seiConclusaoLido;
    if (lido.tipo === 'INVALIDO') return;
    const numero = lido.tipo === 'VAZIO' ? null : lido.valor;
    updateMutation.mutate(
      // Sem número e nada guardado: só troca o status, como antes.
      { taskId: task.id, status: 'CONCLUIDA', sei: numero === null && !task.seiNumero ? undefined : numero },
      { onSuccess: () => setPerguntandoSei(false) }
    );
  };

  // Ao abrir, os campos releem o número e a data (podem ter mudado pela conclusão ou pelo recálculo).
  const alternarDetalhes = () => {
    if (!expanded) {
      setSei(task.seiNumero || '');
      setPrazo(task.prazo || '');
    }
    setExpanded(!expanded);
  };

  const seiLido = lerNumeroSei(sei);
  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (seiLido.tipo === 'INVALIDO') return;
    const novoSei = seiLido.tipo === 'VAZIO' ? null : seiLido.valor;
    updateMutation.mutate({
      taskId: task.id,
      status: task.status,
      nome: stripNumeracaoManual(nome).trim() || nomeTarefa,
      // Vazio limpa o responsável próprio e a tarefa volta a herdar o gestor.
      responsavelNome: responsavel.nome.trim(),
      responsavelUserId: responsavel.nome.trim() ? responsavel.userId : undefined,
      // Só grava a data se o gestor mudou: com regra, a data mudada fica marcada como ajustada.
      prazo: prazo && prazo !== task.prazo ? prazo : null,
      observacao: observacao || null,
      sei: novoSei === (task.seiNumero ?? null) ? undefined : novoSei
    });
    setExpanded(false);
  };

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '0.65rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Seletor Rápido de Status */}
        {somenteLeitura ? (
          <StatusSoLeitura status={task.status} />
        ) : (
        <div className="plan-status-group" style={{ display: 'flex', gap: '2px' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={task.status === opt.value}
              className="plan-status-btn"
              onClick={() => handleStatusChange(opt.value)}
              disabled={updateMutation.isPending}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: task.status === opt.value ? `1.5px solid ${opt.color}` : '1px solid #e2e8f0',
                background: task.status === opt.value ? `${opt.color}1a` : '#fff',
                color: task.status === opt.value ? opt.color : '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: updateMutation.isPending ? 'wait' : 'pointer',
                padding: 0
              }}
            >
              {opt.icon}
            </button>
          ))}
        </div>
        )}

        {/* Informações da Tarefa */}
        <div
          style={{ flex: '1 1 240px', minWidth: 0, cursor: somenteLeitura ? undefined : 'pointer' }}
          onClick={somenteLeitura ? undefined : () => alternarDetalhes()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: task.status === 'CONCLUIDA' ? '#94a3b8' : '#1e293b',
                textDecoration: task.status === 'CONCLUIDA' ? 'line-through' : 'none'
              }}
            >
              {numero ? `${numero}. ${nomeTarefa}` : nomeTarefa}
            </span>

            {task.acao && <AcaoEtiqueta acao={task.acao} comQuem={task.comQuem} />}
            {task.doPregao && <PregaoEtiqueta />}


            {task.seiNumero && <NumeroSeiEtiqueta numero={task.seiNumero} />}

            {task.origem === 'PERSONALIZADA' && <span style={PERSONALIZADA_BADGE_STYLE}>Personalizada</span>}

            {attention && urgencyLabel && (
              <SeverityBadge severity={severityFromAttentionPriorityLevel(attention.level)} customLabel={urgencyLabel} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
            {esperando ? (
              <span data-testid="plan-aguardando">
                {task.prazoResposta ? <>Resposta até {formatDateBR(task.prazoResposta)}</> : 'Aguardando resposta'}
                {task.pedidoEnviadoEm && <> · pedido em {formatDateBR(task.pedidoEnviadoEm)}</>}
                {task.pedidoSei && <> · SEI {task.pedidoSei}</>}
              </span>
            ) : task.prazo ? (
              <span>
                Prazo: {formatDateBR(task.prazo)}
                {isOpen && temRegra && (task.prazoAjustado ? ' · ajustada por você' : regraPrazo ? ` · ${regraPrazo}` : '')}
              </span>
            ) : (
              isOpen && <span>Sem prazo definido</span>
            )}
            {describeResponsavel(task.responsavelNome, gestorNome) && (
              <span>Resp: {describeResponsavel(task.responsavelNome, gestorNome)}</span>
            )}
          </div>
          {/* Quem só consulta não abre a edição: a observação aparece na própria linha. */}
          {somenteLeitura && task.observacao && (
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem', whiteSpace: 'pre-wrap' }}>{task.observacao}</div>
          )}
        </div>

        {/* Ações e Expansor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {temDetalhes && (
            <AppButton type="button" variant="link" size="sm" aria-expanded={verRegra} onClick={() => setVerRegra(!verRegra)}>
              {task.lista?.length ? `${rotuloLista(task.acao)} (${task.lista.length})` : 'Detalhes'}
            </AppButton>
          )}
          {orientarAberto && !somenteLeitura && !esperando && (
            <AppButton type="button" variant="outline" size="sm" onClick={() => setMarca(marca === 'PEDIDO' ? null : 'PEDIDO')} disabled={marcarPedido.isPending}>
              Pedido enviado
            </AppButton>
          )}
          {orientarAberto && !somenteLeitura && esperando && (
            <AppButton type="button" variant="outline" size="sm" onClick={() => setMarca(marca === 'RESPOSTA' ? null : 'RESPOSTA')} disabled={registrarResposta.isPending}>
              Resposta recebida
            </AppButton>
          )}
          {externalLinkUrl && (
            <a
              href={externalLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--primary)',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                textDecoration: 'none'
              }}
            >
              <span>{sistemaDestino || 'Sistema'}</span>
              <ExternalLink size={11} />
            </a>
          )}

          {!somenteLeitura && (
            <>
              <ActionButton action={expanded ? 'recolher' : 'expandir'} iconOnly label={expanded ? 'Recolher detalhes' : 'Editar prazo e responsável'}
                type="button"
                size="sm"
                onClick={() => alternarDetalhes()}
              />

              <ConfirmDeleteButton
                label="Excluir tarefa"
                confirmMessage={task.status === 'CONCLUIDA' ? 'Excluir tarefa já concluída?' : 'Excluir tarefa?'}
                disabled={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(task.id)}
              />
            </>
          )}
        </div>
      </div>

      {verRegra && temDetalhes && (
        <RegraDetalhes
          rotulo={rotuloLista(task.acao)}
          lista={task.lista}
          nota={task.nota}
          modeloSei={task.modeloSei}
          esforco={esforco}
          regraPrazo={regraPrazo}
          regraResposta={regraResposta}
        />
      )}

      {marca === 'PEDIDO' && (
        <MarcaOrientarForm
          taskId={task.id}
          tipo="PEDIDO"
          isPending={marcarPedido.isPending}
          error={marcarPedido.error}
          onCancel={() => setMarca(null)}
          onSubmit={({ sei: numero, data }) => marcarPedido.mutate({ taskId: task.id, sei: numero, data }, { onSuccess: () => setMarca(null) })}
        />
      )}
      {marca === 'RESPOSTA' && (
        <MarcaOrientarForm
          taskId={task.id}
          tipo="RESPOSTA"
          isPending={registrarResposta.isPending}
          error={registrarResposta.error}
          onCancel={() => setMarca(null)}
          onSubmit={({ sei: numero, data }) => registrarResposta.mutate({ taskId: task.id, sei: numero, data }, { onSuccess: () => setMarca(null) })}
        />
      )}

      {perguntandoSei && (
        <form
          aria-label="Número SEI da tarefa"
          onSubmit={(e) => {
            e.preventDefault();
            concluir(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPerguntandoSei(false);
          }}
          style={{
            marginTop: '0.65rem',
            padding: '0.75rem 1rem',
            background: 'var(--color-success-bg)',
            border: '1px solid var(--color-success-border)',
            borderRadius: '6px',
            display: 'grid',
            gap: '0.5rem',
            maxWidth: '640px'
          }}
        >
          <label htmlFor={`sei-conclusao-${task.id}`} style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
            Esta tarefa tem número SEI? <span style={{ fontWeight: 400, color: '#64748b' }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              id={`sei-conclusao-${task.id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={seiConclusao}
              onChange={(e) => setSeiConclusao(e.target.value)}
              placeholder="Ex.: 28451237"
              className="form-input"
              aria-invalid={seiConclusaoLido.tipo === 'INVALIDO'}
              aria-describedby={`sei-conclusao-ajuda-${task.id}`}
              style={{ width: '16rem', maxWidth: '100%', fontVariantNumeric: 'tabular-nums' }}
            />
            <ActionButton
              action="salvar"
              label="Concluir"
              type="submit"
              size="sm"
              disabled={updateMutation.isPending || seiConclusaoLido.tipo === 'INVALIDO'}
              isLoading={updateMutation.isPending}
            />
            <AppButton type="button" variant="link" size="sm" disabled={updateMutation.isPending} onClick={() => concluir(true)}>
              Concluir sem número
            </AppButton>
            <ActionButton action="cancelar" type="button" size="sm" onClick={() => setPerguntandoSei(false)} />
          </div>
          <div
            id={`sei-conclusao-ajuda-${task.id}`}
            style={{
              fontSize: '0.75rem',
              color: seiConclusaoLido.tipo === 'INVALIDO' ? 'var(--color-danger-text)' : seiConclusaoLido.tipo === 'VAZIO' ? '#64748b' : 'var(--color-success-text)'
            }}
          >
            {descreverNumeroSei(seiConclusaoLido)}
          </div>
          <MutationError error={updateMutation.error} />
        </form>
      )}

      {/* Painel Expansível de Detalhes da Tarefa */}
      {expanded && (
        <form
          onSubmit={handleSaveDetails}
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '0.75rem'
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">
              Nome da tarefa
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="form-input"
            />
          </div>

          <div>
            <label htmlFor={`responsavel-${task.id}`} className="form-label">
              Responsável
            </label>
            <ResponsavelField
              id={`responsavel-${task.id}`}
              value={responsavel}
              onChange={setResponsavel}
              gestorNome={gestorNome}
              gestorLabel={labels.gestorLabel}
            />
          </div>

          <div>
            <label className="form-label">
              Prazo limite
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="form-input"
            />
            {temRegra && (
              <div data-testid="plan-prazo-regra" style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {task.prazoAjustado ? (
                  <>
                    Data ajustada por você.{' '}
                    <AppButton
                      type="button"
                      variant="link"
                      size="sm"
                      disabled={ajustarPrazo.isPending}
                      onClick={() => ajustarPrazo.mutate({ taskId: task.id, prazo: null }, { onSuccess: () => setExpanded(false) })}
                    >
                      Voltar à regra
                    </AppButton>
                  </>
                ) : (
                  <>Projetada pela regra{regraPrazo ? `: ${regraPrazo}` : ''}. Se mudar, a data fica como ajustada por você.</>
                )}
                <MutationError error={ajustarPrazo.error} />
              </div>
            )}
          </div>

          <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: gestorNome ? '#64748b' : 'var(--color-warning-text)', marginTop: '-0.4rem' }}>
            {gestorNome ? labels.herancaMsg : labels.semGestorMsg}
          </div>

          <div>
            <label htmlFor={`sei-${task.id}`} className="form-label">
              Número SEI
            </label>
            <input
              id={`sei-${task.id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={sei}
              onChange={(e) => setSei(e.target.value)}
              placeholder="Sem número"
              className="form-input"
              aria-invalid={seiLido.tipo === 'INVALIDO'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
            {seiLido.tipo === 'INVALIDO' && (
              <div role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-danger-text)', marginTop: '0.25rem' }}>
                {descreverNumeroSei(seiLido)}
              </div>
            )}
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">
              Observação / Justificativa
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Anotações de instrução ou despacho"
              className="form-input"
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <ActionButton action="cancelar"
              type="button"
              size="sm"
              onClick={() => setExpanded(false)} />
            <ActionButton action="salvar"
              type="submit"
              size="sm"
              disabled={updateMutation.isPending || seiLido.tipo === 'INVALIDO'}
              isLoading={updateMutation.isPending}
            >
              Salvar Alterações
            </ActionButton>
          </div>
        </form>
      )}
      <MutationError error={deleteMutation.error} />
    </div>
  );
};

export const TaskPlanSection: React.FC<{
  plan: TaskPlan | null;
  isLoading?: boolean;
  controller: TaskPlanController;
}> = ({ plan, isLoading = false, controller: c }) => {
  const { labels } = c;
  const confirm = useConfirmDialog();
  const atualizarModulo = c.useAtualizarModulo(c.entityKey);
  // Contador clicado no topo: mostra só as tarefas daquele grupo.
  const [filtro, setFiltro] = useState<GrupoTarefa | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showApplyModel, setShowApplyModel] = useState(false);
  const [nomeNovoModulo, setNomeNovoModulo] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const finishApply = () => {
    setSelectedTemplateId('');
    setShowApplyModel(false);
    setNomeNovoModulo(null);
  };

  /** Módulos já aplicados a partir do modelo escolhido (para sugerir o nome do próximo). */
  const modulosDoModelo = (templateId: string) =>
    plan
      ? groupMacrotasksByModule(plan.macrotarefas as Parameters<typeof groupMacrotasksByModule>[0], plan)
          .filter((g) => g.modulo?.templateId === templateId)
          .map((g) => g.modulo!.nome)
      : [];

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) return;
    const existentes = modulosDoModelo(selectedTemplateId);
    if (existentes.length > 0) {
      // Mesmo modelo outra vez: o usuário confirma (ou troca) o nome do novo módulo.
      const nomeModelo = c.templates.find((t) => t.id === selectedTemplateId)?.nome ?? '';
      setNomeNovoModulo(sugerirNomeModulo(nomeModelo, existentes));
      return;
    }
    c.applyTemplate.run(selectedTemplateId, finishApply);
  };

  const confirmarNovoModulo = () => {
    if (!selectedTemplateId || !nomeNovoModulo?.trim()) return;
    c.applyTemplate.run(selectedTemplateId, finishApply, nomeNovoModulo.trim());
  };

  const modeloEscolhido = c.templates.find((tpl) => tpl.id === selectedTemplateId);
  const dicaModelo = modeloEscolhido && (modeloEscolhido.quando || modeloEscolhido.processoTipo) && (
    <div data-testid="task-plan-modelo-dica" style={{ fontSize: '0.78rem', color: '#475569' }}>
      {modeloEscolhido.quando && <>Quando: {modeloEscolhido.quando}</>}
      {modeloEscolhido.quando && modeloEscolhido.processoTipo && ' · '}
      {modeloEscolhido.processoTipo && <>Corre no {modeloEscolhido.processoTipo.charAt(0).toLowerCase() + modeloEscolhido.processoTipo.slice(1)}</>}
      {'. As datas das tarefas são calculadas pela regra de cada uma.'}
    </div>
  );

  if (isLoading) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="task-plan-loading" />;
  }

  // 1. Caso Nenhum Plano Tenha Sido Aplicado Ainda
  if (!plan && c.somenteLeitura) {
    return (
      <EmptyState
        icon={<Sliders size={28} />}
        title={labels.semPlanoTitulo}
        description={`O ${labels.gestorLabel} ainda não aplicou um Modelo de Gestão.`}
        testId="task-plan-empty"
      />
    );
  }
  if (!plan) {
    return (
      <EmptyState
        icon={<Sliders size={28} />}
        title={labels.semPlanoTitulo}
        description={labels.semPlanoDescricao}
        testId="task-plan-empty"
        action={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                aria-label="Modelo de gestão"
                className="form-input"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={c.loadingTemplates || c.applyTemplate.isPending}
                style={{ minWidth: 0, width: '100%', maxWidth: '360px' }}
              >
                <option value="">Selecione um Modelo de Gestão...</option>
                {c.templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.nome}
                  </option>
                ))}
              </select>

              <AppButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApplyTemplate}
                disabled={!selectedTemplateId || c.applyTemplate.isPending}
                isLoading={c.applyTemplate.isPending}
              >
                Aplicar Modelo
              </AppButton>
            </div>

            {dicaModelo}
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              ou{' '}
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                onClick={c.startPlan.run}
                disabled={c.startPlan.isPending}
                isLoading={c.startPlan.isPending}
              >
                Começar do zero
              </AppButton>
              {' '}e criar as tarefas manualmente.
            </div>
            <MutationError error={c.applyTemplate.error || c.startPlan.error} />
          </div>
        }
      />
    );
  }

  // 2. Plano Aplicado: Progresso e Lista de Macrotarefas
  const progresso = plan.progresso;
  const moduleGroups = groupMacrotasksByModule(plan.macrotarefas, plan);
  const modelCount = moduleGroups.filter((g) => g.modulo).length;
  const hasCustomGroup = moduleGroups.some((g) => !g.modulo);
  const planTitle =
    modelCount === 0
      ? 'Plano personalizado'
      : `${modelCount} modelo${modelCount !== 1 ? 's' : ''} aplicado${modelCount !== 1 ? 's' : ''}${hasCustomGroup ? ' + etapas personalizadas' : ''}`;
  const allCollapsed = moduleGroups.length > 0 && moduleGroups.every((g) => collapsedGroups.has(g.key));
  const countOverdue = (group: (typeof moduleGroups)[number]) =>
    group.macrotarefas.reduce(
      (n, macro) =>
        n +
        macro.tarefas.filter(
          (t) =>
            t.status !== 'CONCLUIDA' &&
            t.status !== 'NAO_APLICAVEL' &&
            classifyTaskAttention({ ...(t as ContractTask), prazo: prazoEfetivo(t) }).level === 'VENCIDA'
        ).length,
      0
    );

  const contagem: ContagemGrupos = { COMIGO: 0, COBRAR: 0, AGUARDANDO: 0, FONTE: 0 };
  for (const macro of plan.macrotarefas) {
    for (const t of macro.tarefas as PlanTask[]) {
      const g = grupoDaTarefa(t);
      if (g !== 'FEITA') contagem[g]++;
    }
  }
  const visivel = (t: PlanTask) => !filtro || grupoDaTarefa(t) === filtro;
  const gruposVisiveis = filtro
    ? moduleGroups.filter((g) => g.macrotarefas.some((m) => (m.tarefas as PlanTask[]).some(visivel)))
    : moduleGroups;

  return (
    <div>
      <Modal
        isOpen={nomeNovoModulo !== null}
        onClose={() => setNomeNovoModulo(null)}
        title="Aplicar modelo novamente"
        subtitle="Este modelo já foi aplicado a este plano. Acrescentar vai criar um novo módulo com as mesmas etapas e tarefas."
        size="sm"
        dismissible={!c.applyTemplate.isPending}
        testId="apply-again-modal"
        footer={
          <>
            <ActionButton action="cancelar" type="button" onClick={() => setNomeNovoModulo(null)} disabled={c.applyTemplate.isPending} />
            <AppButton
              type="button"
              variant="primary"
              onClick={confirmarNovoModulo}
              disabled={!nomeNovoModulo?.trim() || c.applyTemplate.isPending}
              isLoading={c.applyTemplate.isPending}
            >
              Aplicar
            </AppButton>
          </>
        }
      >
        <label className="form-label" htmlFor="nome-novo-modulo">Nome do novo módulo</label>
        <input
          id="nome-novo-modulo"
          className="form-input"
          value={nomeNovoModulo ?? ''}
          onChange={(e) => setNomeNovoModulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmarNovoModulo();
            }
          }}
          maxLength={200}
          style={{ width: '100%' }}
        />
      </Modal>

      {/* Resumo do plano: progresso à esquerda, ações à direita */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>{planTitle}</div>
          <SummaryBar
            testId="task-plan-summary"
            items={[
              { label: 'Concluídas', value: `${progresso.concluidas} de ${progresso.total - progresso.naoAplicaveis}`, unit: `tarefas (${progresso.percentual}%)` },
              ...(progresso.atrasadas > 0 ? [{ label: 'Atrasadas', value: String(progresso.atrasadas), unit: '', tone: 'danger' as const }] : [])
            ]}
            progress={{ value: progresso.concluidas, max: Math.max(progresso.total - progresso.naoAplicaveis, 1), label: 'Progresso do plano' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
          {moduleGroups.length > 1 && (
            <ActionButton action={allCollapsed ? 'expandir' : 'recolher'} iconOnly label={allCollapsed ? 'Expandir todos' : 'Recolher todos'}
              type="button"
              size="sm"
              onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(moduleGroups.map((g) => g.key)))}
            />
          )}
          {c.somenteLeitura ? null : showApplyModel ? (
            <ActionButton action="fechar" type="button" size="sm" onClick={() => setShowApplyModel(false)} />
          ) : (
            <AppButton type="button" variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowApplyModel(true)}>
              Aplicar modelo
            </AppButton>
          )}
        </div>
      </div>

      {progresso.total > 0 && <PlanoContadores contagem={contagem} ativo={filtro} onChange={setFiltro} />}
      {filtro && filtro !== 'FEITA' && (
        <div data-testid="task-plan-filtro" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569', marginBottom: '0.75rem' }}>
          <span>
            Mostrando: <strong>{GRUPO_INFO[filtro].rotulo}</strong> ({GRUPO_INFO[filtro].descricao})
          </span>
          <AppButton type="button" variant="link" size="sm" onClick={() => setFiltro(null)}>
            Mostrar todas
          </AppButton>
        </div>
      )}
      {filtro && gruposVisiveis.length === 0 && (
        <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '0.75rem 0' }}>Nenhuma tarefa neste grupo.</div>
      )}

      {showApplyModel && !c.somenteLeitura && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              aria-label="Modelo de gestão a acrescentar"
              className="form-input"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={c.loadingTemplates || c.applyTemplate.isPending}
              style={{ minWidth: 0, width: '100%', maxWidth: '360px' }}
            >
              <option value="">Selecione um Modelo de Gestão...</option>
              {c.templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.nome}
                </option>
              ))}
            </select>
            <AppButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || c.applyTemplate.isPending}
              isLoading={c.applyTemplate.isPending}
            >
              Acrescentar ao plano
            </AppButton>
            <InfoHint testId="task-plan-apply-note" content="As etapas e tarefas do modelo são acrescentadas ao plano atual; nada do que já existe é alterado." />
          </div>
          {dicaModelo}
        </div>
      )}

      <MutationError
        error={
          c.applyTemplate.error ||
          c.saveMacrotask.error ||
          c.deleteMacrotask.error ||
          c.deleteModule.error ||
          c.renameModule.error ||
          c.createTask.error
        }
      />

      {/* Lista de Macrotarefas e Tarefas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {gruposVisiveis.map((group) => {
          const collapsed = collapsedGroups.has(group.key);
          return (
          <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <ModuleGroupHeader
              nome={group.modulo ? group.modulo.nome : 'Etapas personalizadas'}
              appliedAt={group.modulo?.appliedAt}
              concluidas={group.concluidas}
              aplicaveis={group.aplicaveis}
              etapas={group.macrotarefas.length}
              atrasadas={countOverdue(group)}
              collapsed={collapsed}
              onToggleCollapsed={() => toggleGroup(group.key)}
              isPending={c.deleteModule.isPending || c.renameModule.isPending}
              onRename={
                group.modulo && !c.somenteLeitura
                  ? (nome) => c.renameModule.run({ planId: plan.id, moduloId: group.modulo!.id, nome })
                  : undefined
              }
              onDelete={
                group.modulo && !c.somenteLeitura
                  ? async () => {
                      const ok = await confirm({
                        title: 'Excluir módulo',
                        message: `Excluir o módulo "${group.modulo!.nome}" e todas as suas etapas e tarefas?`,
                        confirmLabel: 'Excluir',
                        tone: 'danger'
                      });
                      if (ok) c.deleteModule.run({ planId: plan.id, moduloId: group.modulo!.id });
                    }
                  : undefined
              }
            />
            {!collapsed && group.modulo && (group.modulo.processoTipo || group.modulo.ancoraData) && (
              <ModuloDados
                key={`${group.modulo.id}-${group.modulo.processoSei ?? ''}-${group.modulo.ancoraData ?? ''}`}
                modulo={group.modulo}
                somenteLeitura={c.somenteLeitura}
                isPending={atualizarModulo.isPending}
                error={atualizarModulo.error}
                onSave={({ processoSei, ancora }) => {
                  if (!processoSei && !ancora) return;
                  atualizarModulo.mutate({ moduloId: group.modulo!.id, processoSei, ancora });
                }}
              />
            )}
        {!collapsed && group.macrotarefas.map((macro, macroIndex) => (filtro && !(macro.tarefas as PlanTask[]).some(visivel)) ? null : (
          <div
            key={macro.id}
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '1rem'
            }}
          >
            <MacrotaskHeader
              nome={macro.nome}
              numero={numeroEtapa(macroIndex)}
              taskCount={macro.tarefas.length}
              isPending={c.saveMacrotask.isPending || c.deleteMacrotask.isPending}
              onRename={c.somenteLeitura ? undefined : (nome) => c.saveMacrotask.run({ id: macro.id, nome: stripNumeracaoManual(nome) })}
              onDelete={c.somenteLeitura ? undefined : () => c.deleteMacrotask.run(macro.id)}
            />

            <div>
              {macro.tarefas.map((tarefa, tarefaIndex) =>
                visivel(tarefa) ? <TaskPlanRow key={tarefa.id} task={tarefa} controller={c} numero={numeroTarefa(macroIndex, tarefaIndex)} /> : null
              )}
              {!c.somenteLeitura && !filtro && <AddTaskForm
                gestorNome={c.gestorNome}
                isPending={c.createTask.isPending}
                onSubmit={(values) =>
                  c.createTask.run({
                    macrotaskId: macro.id,
                    nome: stripNumeracaoManual(values.nome),
                    prazo: values.prazo || null,
                    observacao: values.observacao || null
                  })
                }
              />}
            </div>
          </div>
        ))}
          </div>
          );
        })}

        {!c.somenteLeitura && !filtro && (
          <AddMacrotaskForm
            isPending={c.saveMacrotask.isPending}
            onSubmit={(nome) => c.saveMacrotask.run({ planId: plan.id, nome: stripNumeracaoManual(nome) })}
          />
        )}
      </div>
    </div>
  );
};

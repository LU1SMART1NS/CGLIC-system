import React, { useState } from 'react';
import type { AcaoGestor, TaskPlanModuleRef } from '../../types';
import { ACAO_INFO, GRUPO_INFO, type GrupoTarefa } from '../../utils/modeloGestao';
import { formatDateBR } from '../../services/temporalEngineService';
import { lerNumeroSei, descreverNumeroSei } from '../../utils/numeroSei';
import { mascaraProcessoSei } from '../../utils/mascaras';
import { ActionButton, AppButton, Modal } from '../../design-system';
import { AppTextarea, AppDateInput } from '../../design-system/components/FormFields';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { MutationError } from '../contracts/planTaskEditing';

/**
 * Peças do plano do gestor (modelo de gestão da CCGA, protótipos aprovados em 26 e 28/10/2026):
 * etiqueta da ação, contadores que filtram, marcas do orientar, dados do módulo e o que o
 * plano automático faz sozinho (módulo que entrou, dispensa, tarefa fechada pela fonte).
 */

/** Etiqueta da ação do gestor, com "com quem" ao lado quando houver. */
export const AcaoEtiqueta: React.FC<{ acao: AcaoGestor; comQuem?: string }> = ({ acao, comQuem }) => {
  const info = ACAO_INFO[acao];
  return (
    <span
      data-testid="plan-acao"
      title={`${info.rotulo}: ${info.descricao}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: info.cor,
        background: info.fundo,
        border: `1px solid ${info.cor}33`,
        borderRadius: '999px',
        padding: '0.1rem 0.55rem',
        whiteSpace: 'nowrap'
      }}
    >
      {info.rotulo}
      {comQuem && <span style={{ fontWeight: 500, color: '#475569' }}>· {comQuem}</span>}
    </span>
  );
};

/** Selo da tarefa que vale para todas as atas do mesmo pregão. */
export const PregaoEtiqueta: React.FC = () => (
  <span
    title="Vale para todas as atas do mesmo pregão"
    style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '4px', padding: '0.05rem 0.4rem' }}
  >
    do pregão
  </span>
);

export type ContagemGrupos = Record<Exclude<GrupoTarefa, 'FEITA'>, number>;

/** Quatro contadores no topo do plano; clicar filtra a lista, clicar de novo mostra tudo. */
export const PlanoContadores: React.FC<{
  contagem: ContagemGrupos;
  ativo: GrupoTarefa | null;
  onChange: (grupo: GrupoTarefa | null) => void;
}> = ({ contagem, ativo, onChange }) => {
  const grupos = Object.keys(GRUPO_INFO) as Array<keyof typeof GRUPO_INFO>;
  return (
    <div role="group" aria-label="Filtrar tarefas do plano" data-testid="plan-contadores" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      {grupos.map((g) => {
        const selecionado = ativo === g;
        const alerta = g === 'COBRAR' && contagem[g] > 0;
        return (
          <button
            key={g}
            type="button"
            aria-pressed={selecionado}
            onClick={() => onChange(selecionado ? null : g)}
            aria-label={`${contagem[g]} ${GRUPO_INFO[g].rotulo}: ${GRUPO_INFO[g].descricao}`}
            title={GRUPO_INFO[g].descricao}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '0.4rem',
              // Dois por linha no celular; no computador ficam lado a lado.
              flex: '1 1 8rem',
              maxWidth: '13rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              border: selecionado ? '2px solid var(--primary)' : '1px solid #cbd5e1',
              background: selecionado ? '#eef3fb' : '#fff',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit'
            }}
          >
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: alerta ? 'var(--color-danger)' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {contagem[g]}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{GRUPO_INFO[g].rotulo}</span>
          </button>
        );
      })}
    </div>
  );
};

const hojeISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Formulário curto das marcas do orientar: número SEI (opcional) e data (hoje por padrão).
 * `tipo` PEDIDO = pedido enviado; RESPOSTA = resposta recebida (conclui a tarefa).
 */
export const MarcaOrientarForm: React.FC<{
  taskId: string;
  tipo: 'PEDIDO' | 'RESPOSTA';
  isPending: boolean;
  error: unknown;
  onSubmit: (vars: { sei: string | null; data: string }) => void;
  onCancel: () => void;
}> = ({ taskId, tipo, isPending, error, onSubmit, onCancel }) => {
  const [sei, setSei] = useState('');
  const [data, setData] = useState(hojeISO());
  const lido = lerNumeroSei(sei);
  const id = `marca-${tipo.toLowerCase()}-${taskId}`;
  return (
    <form
      aria-label={tipo === 'PEDIDO' ? 'Pedido enviado' : 'Resposta recebida'}
      onSubmit={(e) => {
        e.preventDefault();
        if (lido.tipo === 'INVALIDO' || !data) return;
        onSubmit({ sei: lido.tipo === 'VAZIO' ? null : lido.valor, data });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{
        marginTop: '0.65rem',
        padding: '0.75rem 1rem',
        background: tipo === 'PEDIDO' ? '#fff8eb' : 'var(--color-success-bg)',
        border: `1px solid ${tipo === 'PEDIDO' ? '#f5d9a8' : 'var(--color-success-border)'}`,
        borderRadius: '6px',
        display: 'grid',
        gap: '0.5rem',
        maxWidth: '640px'
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
        {tipo === 'PEDIDO' ? 'Pedido enviado' : 'Resposta recebida'}
        <span style={{ fontWeight: 400, color: '#64748b' }}>
          {tipo === 'PEDIDO' ? ' · a data da resposta passa a contar do envio' : ' · conclui a tarefa e move as seguintes'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor={`${id}-sei`} className="form-label">
            Número SEI <span style={{ fontWeight: 400, color: '#64748b' }}>(opcional)</span>
          </label>
          <input
            id={`${id}-sei`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={sei}
            onChange={(e) => setSei(e.target.value)}
            placeholder={tipo === 'PEDIDO' ? 'Ofício ou despacho' : 'Documento da resposta'}
            className="form-input"
            aria-invalid={lido.tipo === 'INVALIDO'}
            style={{ width: '14rem', maxWidth: '100%', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-data`} className="form-label">
            {tipo === 'PEDIDO' ? 'Enviado em' : 'Recebida em'}
          </label>
          <AppDateInput id={`${id}-data`} required value={data} max={hojeISO()} onValueChange={setData} />
        </div>
        <ActionButton action="salvar" label={tipo === 'PEDIDO' ? 'Marcar enviado' : 'Registrar e concluir'} type="submit" size="sm" disabled={isPending || lido.tipo === 'INVALIDO' || !data} isLoading={isPending} />
        <ActionButton action="cancelar" type="button" size="sm" onClick={onCancel} />
      </div>
      {lido.tipo !== 'VAZIO' && (
        <div style={{ fontSize: '0.75rem', color: lido.tipo === 'INVALIDO' ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>{descreverNumeroSei(lido)}</div>
      )}
      <MutationError error={error} />
    </form>
  );
};

/** Lista "O que pedir / O que conferir" e as notas da tarefa (só leitura, também para a consulta). */
export const RegraDetalhes: React.FC<{
  rotulo: string;
  lista?: string[];
  nota?: string;
  modeloSei?: string;
  esforco?: string;
  regraPrazo?: string;
  regraResposta?: string;
}> = ({ rotulo, lista, nota, modeloSei, esforco, regraPrazo, regraResposta }) => (
  <div
    data-testid="plan-regra-detalhes"
    style={{ marginTop: '0.5rem', padding: '0.6rem 0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8rem', color: '#334155', display: 'grid', gap: '0.4rem' }}
  >
    {lista && lista.length > 0 && (
      <div>
        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>{rotulo}</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.15rem' }}>
          {lista.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    )}
    {nota && <div style={{ whiteSpace: 'pre-wrap' }}>{nota}</div>}
    <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.75rem' }}>
      {regraPrazo && <span>Regra do prazo: {regraPrazo}</span>}
      {regraResposta && <span>Resposta: {regraResposta}</span>}
      {modeloSei && <span>Modelo no SEI: {modeloSei}</span>}
      {esforco && <span>Esforço estimado: {esforco}</span>}
    </div>
  </div>
);

/**
 * Módulo que entrou sozinho (plano automático, migration 225): quando e por quê, e o botão de
 * dispensar. Dispensado: quem, quando e a justificativa.
 */
export const ModuloOrigem: React.FC<{
  modulo: TaskPlanModuleRef;
  podeDispensar: boolean;
  onDispensar: () => void;
}> = ({ modulo, podeDispensar, onDispensar }) => {
  if (modulo.dispensadoEm) {
    return (
      <div data-testid="plan-modulo-dispensado" style={{ fontSize: '0.78rem', color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.85rem' }}>
        <strong>Dispensado</strong> em {formatDateBR(modulo.dispensadoEm.slice(0, 10))}
        {modulo.dispensadoPorNome && <> por {modulo.dispensadoPorNome}</>}
        {modulo.dispensaJustificativa && <>: {modulo.dispensaJustificativa}</>}
      </div>
    );
  }
  if (modulo.origem !== 'AUTO') return null;
  return (
    <div data-testid="plan-modulo-auto" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', color: '#475569', padding: '0 0.85rem' }}>
      <span style={{ fontWeight: 700, color: '#5b2a86', background: '#f4edfb', borderRadius: '4px', padding: '0.05rem 0.45rem' }}>
        Entrou sozinho{modulo.appliedAt ? ` em ${formatDateBR(modulo.appliedAt.slice(0, 10))}` : ''}
      </span>
      {modulo.motivoAuto && <span>{modulo.motivoAuto}</span>}
      {podeDispensar && (
        <AppButton type="button" variant="ghostDanger" size="sm" onClick={onDispensar}>
          Dispensar módulo
        </AppButton>
      )}
    </div>
  );
};

/** Janela da dispensa: justificativa obrigatória (10 letras ou mais). */
export const DispensarModuloModal: React.FC<{
  modulo: TaskPlanModuleRef | null;
  isPending: boolean;
  error: unknown;
  onConfirm: (justificativa: string) => void;
  onClose: () => void;
}> = ({ modulo, isPending, error, onConfirm, onClose }) => {
  const [texto, setTexto] = useState('');
  const curta = texto.trim().length < 10;
  return (
    <Modal
      isOpen={Boolean(modulo)}
      onClose={onClose}
      dismissible={!isPending}
      size="sm"
      title={modulo ? `Dispensar "${modulo.nome}"?` : 'Dispensar módulo'}
      testId="dispensar-modulo-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={isPending} />
          <ActionButton action="confirmar" type="button" onClick={() => onConfirm(texto.trim())} disabled={isPending || curta} isLoading={isPending} data-testid="dispensar-modulo-confirmar">
            Dispensar
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.85rem' }}>
        <p style={{ margin: 0, color: '#475569' }}>As tarefas abertas ficam como não se aplica e as concluídas continuam no histórico. O sistema não põe este módulo de novo.</p>
        <AppTextarea
          label="Justificativa"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          hint="Pelo menos 10 letras. Fica registrada com seu nome e a data."
          data-testid="dispensar-modulo-justificativa"
        />
        <MutationError error={error} />
      </div>
    </Modal>
  );
};

/** Tarefa fechada pela fonte: o dado achado e o botão de reabrir. */
export const FonteFechou: React.FC<{ texto: string; podeReabrir: boolean; isPending: boolean; onReabrir: () => void }> = ({ texto, podeReabrir, isPending, onReabrir }) => (
  <div data-testid="plan-fonte-fechou" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.35rem', background: 'var(--color-success-bg)', borderRadius: '6px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', color: '#1e293b', maxWidth: '640px' }}>
    <strong style={{ color: 'var(--color-success-text)' }}>Fechada pela fonte</strong>
    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{texto}</span>
    {podeReabrir && (
      <AppButton type="button" variant="link" size="sm" disabled={isPending} onClick={onReabrir}>
        Reabrir
      </AppButton>
    )}
  </div>
);

/**
 * Linha do módulo abaixo do cabeçalho: em que processo SEI corre e a data de partida das tarefas.
 * O gestor informa o processo uma vez e pode mudar a data de partida (as datas se recalculam).
 */
export const ModuloDados: React.FC<{
  modulo: TaskPlanModuleRef;
  somenteLeitura?: boolean;
  isPending: boolean;
  error: unknown;
  onSave: (vars: { processoSei: string | null; ancora: string | null }) => void;
}> = ({ modulo, somenteLeitura = false, isPending, error, onSave }) => {
  const [editando, setEditando] = useState(false);
  const [processo, setProcesso] = useState(modulo.processoSei ?? '');
  const [ancora, setAncora] = useState(modulo.ancoraData ?? '');
  const lido = lerNumeroSei(processo);
  const processoInvalido = lido.tipo === 'INVALIDO' || lido.tipo === 'DOCUMENTO';

  if (editando && !somenteLeitura) {
    return (
      <form
        aria-label={`Dados do módulo ${modulo.nome}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (processoInvalido) return;
          onSave({
            processoSei: lido.tipo === 'PROCESSO' && lido.valor !== modulo.processoSei ? lido.valor : null,
            ancora: ancora && ancora !== modulo.ancoraData ? ancora : null
          });
          setEditando(false);
        }}
        style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', padding: '0.6rem 0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}
      >
        <div>
          <label htmlFor={`proc-${modulo.id}`} className="form-label">
            Processo SEI{modulo.processoTipo ? ` (${modulo.processoTipo})` : ''}
          </label>
          <input
            id={`proc-${modulo.id}`}
            className="form-input"
            inputMode="numeric"
            value={processo}
            onChange={(e) => setProcesso(mascaraProcessoSei(e.target.value))}
            autoFocus
            placeholder="00000.000000/0000-00"
            aria-invalid={processoInvalido}
            style={{ width: '15rem', maxWidth: '100%', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
        <div>
          <label htmlFor={`ancora-${modulo.id}`} className="form-label">
            Data de partida
          </label>
          <AppDateInput id={`ancora-${modulo.id}`} value={ancora} onValueChange={setAncora} />
        </div>
        <ActionButton action="salvar" type="submit" size="sm" disabled={isPending || processoInvalido} isLoading={isPending} />
        <ActionButton action="cancelar" type="button" size="sm" onClick={() => setEditando(false)} />
        {processoInvalido && (
          <div role="alert" style={{ flexBasis: '100%', fontSize: '0.75rem', color: 'var(--color-danger-text)' }}>
            Informe o número do processo com os 17 dígitos (00000.000000/0000-00).
          </div>
        )}
      </form>
    );
  }

  return (
    <div data-testid="plan-modulo-dados" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', color: '#475569', padding: '0 0.85rem' }}>
      <span>
        {modulo.processoTipo ?? 'Processo SEI'}:{' '}
        {modulo.processoSei ? <NumeroSeiEtiqueta numero={modulo.processoSei} /> : <em style={{ color: '#94a3b8' }}>não informado</em>}
      </span>
      {modulo.ancoraData && <span>Partida: {formatDateBR(modulo.ancoraData)}</span>}
      {!somenteLeitura && (
        <AppButton
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setProcesso(modulo.processoSei ?? '');
            setAncora(modulo.ancoraData ?? '');
            setEditando(true);
          }}
        >
          {modulo.processoSei ? 'Alterar' : 'Informar processo'}
        </AppButton>
      )}
      <MutationError error={error} />
    </div>
  );
};

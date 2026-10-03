import React from 'react';
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import type { AtaTaskPlan } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { severityTokens } from '../../design-system/tokens';
import { AppButton } from '../../design-system/components/AppButton';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { formatDateBR } from '../../services/temporalEngineService';
import { useUpdateAtaTask } from '../../hooks/useUpdateAtaTask';
import { useReminderDismissals } from '../../hooks/useReminderDismissals';
import type { AtaActionItem, AtaActionQueue as AtaActionQueueData } from '../../services/ataActionQueueService';

export type Ata360Tab = 'acoes' | 'plano' | 'itens' | 'contratos';

interface AtaActionQueueProps {
  queue: AtaActionQueueData;
  ataKey: string;
  plan: AtaTaskPlan | null;
  isLoading?: boolean;
  onGoTo: (tab: Ata360Tab) => void;
}

const COUNT_LABELS: Record<SeverityLevel, [string, string]> = {
  CRITICA: ['crítica', 'críticas'],
  URGENTE: ['urgente', 'urgentes'],
  ATENCAO: ['em atenção', 'em atenção'],
  INFO: ['lembrete', 'lembretes']
};

const KIND_LABELS: Record<AtaActionItem['kind'], string> = {
  SALDO: 'Saldo do item',
  TAREFA: 'Tarefa',
  LEMBRETE: 'Planejamento da vigência'
};

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '0.4rem 0.75rem',
  backgroundColor: '#ffffff',
  color: '#0c326f',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

/** Fila única da Ata 360 — mesmo layout da ContractActionQueue do Contrato 360. */
export const AtaActionQueue: React.FC<AtaActionQueueProps> = ({ queue, ataKey, plan, isLoading = false, onGoTo }) => {
  const updateMutation = useUpdateAtaTask(ataKey);
  const { dismiss, restore } = useReminderDismissals('ATA', ataKey);

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando ações da ata...
      </div>
    );
  }

  const renderAction = (item: AtaActionItem) => {
    switch (item.kind) {
      case 'SALDO':
        return (
          <AppButton variant="outline" size="sm"  icon={<ArrowRight size={15} />} onClick={() => onGoTo('itens')} title="Ver itens" >
              <span className="payment-action-label">Ver itens</span>
            </AppButton>
        );
      case 'TAREFA':
        if (!item.taskId) return null;
        return (
          <AppButton
            variant="outline"
            size="sm"
            
            icon={<Check size={15} />}
            onClick={() => updateMutation.mutate({ taskId: item.taskId!, status: 'CONCLUIDA' })}
            disabled={updateMutation.isPending}
            title="Concluir"
          >
              <span className="payment-action-label">Concluir</span>
            </AppButton>
        );
      case 'LEMBRETE':
        return (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <AppButton
              variant="outline"
              size="sm"
              
              icon={<Check size={15} />}
              onClick={() => dismiss.mutate({ itemId: item.id })}
              disabled={dismiss.isPending}
              title="Resolvido: já resolvido ou não se aplica, o lembrete some deste ciclo de vigência"
            >
              <span className="payment-action-label">Resolvido</span>
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              
              icon={<ArrowRight size={15} />}
              onClick={() => onGoTo('plano')}
              title={plan ? 'Ver plano' : 'Aplicar modelo'}
            >
              <span className="payment-action-label">{plan ? 'Ver plano' : 'Aplicar modelo'}</span>
            </AppButton>
          </div>
        );
    }
  };

  const subtitle = (item: AtaActionItem) => {
    if (item.kind === 'TAREFA') {
      return [KIND_LABELS.TAREFA, item.macrotaskName].filter(Boolean).join(' · ');
    }
    return [KIND_LABELS[item.kind], item.description].filter(Boolean).join(' · ');
  };

  const severities = (Object.keys(COUNT_LABELS) as SeverityLevel[]).filter((s) => queue.counts[s] > 0);

  return (
    <div data-testid="ata-action-queue" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {queue.items.length === 0 ? (
        <div
          style={{
            background: '#f0fdf4',
            borderRadius: '10px',
            border: '1px solid #bbf7d0',
            padding: '1.25rem',
            textAlign: 'center',
            color: '#166534'
          }}
        >
          <CheckCircle2 size={22} style={{ color: '#15803d', margin: '0 auto 0.5rem auto', display: 'block' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#14532d' }}>
            Tudo em dia com esta ata
          </h4>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            Nenhum item com saldo crítico, tarefa ou prazo de planejamento pede ação agora.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {severities.map((s) => {
              const n = queue.counts[s];
              return <SeverityBadge key={s} severity={s} testId={`ata-queue-count-${s.toLowerCase()}`} customLabel={`${n} ${COUNT_LABELS[s][n === 1 ? 0 : 1]}`} />;
            })}
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
            {queue.items.map((item, idx) => (
              <div
                key={item.id}
                data-action-id={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.8rem 1rem',
                  borderTop: idx === 0 ? 'none' : '1px solid #e2e8f0',
                  borderLeft: `4px solid ${severityTokens[item.severity].borderLeft}`,
                  backgroundColor: '#ffffff',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '0 1 120px', minWidth: 0 }}>
                  <SeverityBadge severity={item.severity} customLabel={item.badgeLabel} />
                </div>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div title={item.title} style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{subtitle(item)}</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', flex: '0 1 80px', minWidth: 0 }}>
                  {item.dataAlvo ? formatDateBR(item.dataAlvo) : '—'}
                </div>
                <div>{renderAction(item)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {queue.dispensados.length > 0 && (
        <details data-testid="dismissed-reminders" style={{ fontSize: '0.8rem', color: '#475569' }}>
          <summary style={{ cursor: 'pointer' }}>
            {queue.dispensados.length === 1 ? '1 lembrete marcado como resolvido' : `${queue.dispensados.length} lembretes marcados como resolvidos`}
          </summary>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {queue.dispensados.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>{item.title}</span>
                <button
                  type="button"
                  onClick={() => restore.mutate({ itemId: item.id })}
                  disabled={restore.isPending}
                  style={secondaryButton}
                >
                  Reexibir
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {queue.tarefasSemPrazo > 0 && (
        <button
          type="button"
          onClick={() => onGoTo('plano')}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#475569',
            fontSize: '0.8rem',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          {queue.tarefasSemPrazo === 1
            ? '1 tarefa do plano está sem prazo definido — definir no plano'
            : `${queue.tarefasSemPrazo} tarefas do plano estão sem prazo definido — definir no plano`}
        </button>
      )}
    </div>
  );
};

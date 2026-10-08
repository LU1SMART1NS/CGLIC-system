import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { propsDeLinhaClicavel, SetaDaLinha } from '../carteira/CarteiraRowLink';
import type { ContractTaskPlan } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { severityTokens } from '../../design-system/tokens';
import { AppButton } from '../../design-system/components/AppButton';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { formatDateBR } from '../../services/temporalEngineService';
import { AvisosResolvidosLista, BotaoResolvido, EspacoResolvido, useResolverAviso, type AlvoResolucao } from '../avisos/ResolverAviso';
import type { ContractActionItem, ContractActionQueue as ActionQueueData } from '../../services/contractActionQueueService';

export type Contract360Tab = 'acoes' | 'plano' | 'itens' | 'financeiro' | 'pagamentos' | 'historico';

interface ContractActionQueueProps {
  queue: ActionQueueData;
  contractKey: string;
  plan: ContractTaskPlan | null;
  isLoading?: boolean;
  onGoTo: (tab: Contract360Tab) => void;
}

const COUNT_LABELS: Record<SeverityLevel, [string, string]> = {
  CRITICA: ['crítica', 'críticas'],
  URGENTE: ['urgente', 'urgentes'],
  ATENCAO: ['em atenção', 'em atenção'],
  INFO: ['lembrete', 'lembretes']
};

const KIND_LABELS: Record<ContractActionItem['kind'], string> = {
  TAREFA: 'Tarefa',
  PAGAMENTO: 'Pagamento',
  REAJUSTE: 'Reajuste / repactuação',
  LEMBRETE: 'Prazo legal'
};

export const ContractActionQueue: React.FC<ContractActionQueueProps> = ({ queue, plan, isLoading = false, onGoTo }) => {
  const { abrir, dialog, porChave, reexibir, podeResolver, podeResolverAlvo } = useResolverAviso();
  const [searchParams] = useSearchParams();
  const highlightedId = searchParams.get('item');

  React.useEffect(() => {
    if (!highlightedId) return;
    const el = document.querySelector(`[data-action-id="${CSS.escape(highlightedId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedId, queue.items]);

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando ações do contrato...
      </div>
    );
  }

  /** Itens que só levam a outra tela: a linha inteira é o clique (sem botão de seta). */
  const rowGo = (item: ContractActionItem): { label: string; go: () => void } | null => {
    switch (item.kind) {
      case 'PAGAMENTO': return { label: item.id.startsWith('AVISO-') ? 'Ver pagamentos do contrato' : 'Abrir ciclo', go: () => onGoTo('pagamentos') };
      case 'REAJUSTE': return { label: 'Ver histórico', go: () => onGoTo('historico') };
      default: return null;
    }
  };

  const alvoDe = (item: ContractActionItem): AlvoResolucao | null => {
    const contexto = KIND_LABELS[item.kind];
    if (item.kind === 'TAREFA') return item.taskId ? { tipo: 'TAREFA_CONTRATO', taskId: item.taskId, titulo: item.title, contexto } : null;
    return item.avisoChave ? { tipo: 'AVISO', chave: item.avisoChave, titulo: item.title, contexto } : null;
  };

  /** ✓ Resolvido em todo aviso, menos pagamento (some ao registrar a etapa); tarefa: conclui no plano. */
  const renderAction = (item: ContractActionItem) => {
    const alvo = alvoDe(item);
    const check = alvo && podeResolverAlvo(alvo) ? <BotaoResolvido onClick={() => abrir(alvo)} testId={`resolver-${item.id}`} /> : <EspacoResolvido />;
    switch (item.kind) {
      case 'TAREFA':
        return check;
      case 'PAGAMENTO':
      case 'REAJUSTE':
        return (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {check}
            {rowGo(item) ? <SetaDaLinha /> : null}
          </div>
        );
      case 'LEMBRETE':
        return (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {check}
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

  /** Linha de baixo: tipo, detalhe do nível (ex.: 100,0% consumido, vencida há 3 dias) e o resto. */
  const subtitle = (item: ContractActionItem) => {
    const [tipo, ...resto] = subtitleBase(item).split(' · ');
    return [tipo, item.badgeLabel, ...resto].filter(Boolean).join(' · ');
  };

  const subtitleBase = (item: ContractActionItem) => {
    if (item.kind === 'TAREFA') {
      const parts = [KIND_LABELS.TAREFA];
      if (item.macrotaskName) parts.push(item.macrotaskName);
      if (item.sistemaDestino) parts.push(item.sistemaDestino);
      return parts.join(' · ');
    }
    return [KIND_LABELS[item.kind], item.description].filter(Boolean).join(' · ');
  };

  const severities = (Object.keys(COUNT_LABELS) as SeverityLevel[]).filter((s) => queue.counts[s] > 0);

  return (
    <div data-testid="contract-action-queue" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {queue.items.length === 0 ? (
        <div
          style={{
            background: 'var(--color-success-bg)',
            borderRadius: '10px',
            border: '1px solid var(--color-success-border)',
            padding: '1.25rem',
            textAlign: 'center',
            color: 'var(--color-success-text-strong)'
          }}
        >
          <CheckCircle2 size={22} style={{ color: 'var(--color-success-text)', margin: '0 auto 0.5rem auto', display: 'block' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#14532d' }}>
            Tudo em dia com este contrato
          </h4>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            Nenhuma tarefa, pagamento, reajuste ou prazo legal pede ação agora.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {severities.map((s) => {
              const n = queue.counts[s];
              return <SeverityBadge key={s} severity={s} testId={`queue-count-${s.toLowerCase()}`} customLabel={`${n} ${COUNT_LABELS[s][n === 1 ? 0 : 1]}`} />;
            })}
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
            {queue.items.map((item, idx) => {
              const isHighlighted = item.id === highlightedId;
              const target = rowGo(item);
              return (
                <div
                  key={item.id}
                  data-action-id={item.id}
                  {...propsDeLinhaClicavel(target?.go, target?.label ?? '', { rotulo: target ? `${target.label}: ${item.title}` : undefined })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.8rem 1rem',
                    borderTop: idx === 0 ? 'none' : '1px solid #e2e8f0',
                    borderLeft: `4px solid ${isHighlighted ? 'var(--primary)' : severityTokens[item.severity].borderLeft}`,
                    backgroundColor: isHighlighted ? 'var(--color-info-bg)' : '#ffffff',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ flex: 'none' }}>
                    <SeverityBadge severity={item.severity} customLabel={item.badgeLabel} iconOnly />
                  </div>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{item.title}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{subtitle(item)}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', flex: '0 1 80px', minWidth: 0 }}>
                    {item.dataAlvo ? formatDateBR(item.dataAlvo) : '—'}
                  </div>
                  <div>{renderAction(item)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <AvisosResolvidosLista
        itens={queue.dispensados.filter((d) => d.avisoChave).map((d) => ({ chave: d.avisoChave!, titulo: d.title, contexto: KIND_LABELS[d.kind] }))}
        porChave={porChave}
        podeReexibir={podeResolver}
        onReexibir={(chave) => reexibir.mutate({ chave })}
        reexibindo={reexibir.isPending}
        testId="dismissed-reminders"
      />

      {queue.tarefasSemPrazo > 0 && (
        <AppButton
          type="button"
          variant="link"
          size="xs"
          onClick={() => onGoTo('plano')}
          style={{ alignSelf: 'flex-start' }}
        >
          {queue.tarefasSemPrazo === 1
            ? '1 tarefa do plano está sem prazo definido — definir no plano'
            : `${queue.tarefasSemPrazo} tarefas do plano estão sem prazo definido — definir no plano`}
        </AppButton>
      )}
      {dialog}
    </div>
  );
};

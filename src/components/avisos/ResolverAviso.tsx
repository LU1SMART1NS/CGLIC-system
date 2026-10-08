import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useAvisosResolvidos } from '../../hooks/useAvisosResolvidos';
import { updateAtaTaskRpc } from '../../adapters/ataManagementRpcAdapter';
import { updateContractTaskRpc } from '../../adapters/contractManagementRpcAdapter';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import {
  JUSTIFICATIVA_MAX,
  JUSTIFICATIVA_MIN,
  tipoDaChave,
  type AvisoResolvido,
  type AvisoResolvivelTipo
} from '../../services/avisosResolvidosService';

/** O que o ✓ resolve: um aviso com chave (saldo, reajuste, lembrete) ou uma tarefa do plano (concluir). */
export type AlvoResolucao =
  | { tipo: 'AVISO'; chave: string; titulo: string; contexto?: string }
  | { tipo: 'TAREFA_ATA' | 'TAREFA_CONTRATO'; taskId: string; titulo: string; contexto?: string };

const REGRA: Record<AvisoResolvivelTipo, string> = {
  SALDO: 'O aviso volta se a situação do saldo piorar.',
  REAJUSTE: 'O aviso não aparece mais neste ciclo de reajuste.',
  LEMBRETE: 'O lembrete não aparece mais nesta vigência.'
};
const REGRA_TAREFA = 'A tarefa será marcada como concluída no plano, com a justificativa na observação.';

/** Junta a justificativa à observação que a tarefa já tinha (o RPC substitui a observação). */
async function observacaoComJustificativa(tabela: 'ata_tasks' | 'contract_tasks', taskId: string, justificativa: string): Promise<string> {
  const linha = `Resolvido: ${justificativa}`;
  if (!isSupabaseConfigured || !supabase) return linha;
  const { data } = await supabase.from(tabela).select('observacao').eq('id', taskId).maybeSingle();
  const atual = (data as { observacao?: string | null } | null)?.observacao?.trim();
  return atual ? `${atual}\n${linha}` : linha;
}

/**
 * Botão ✓ e janela de justificativa, iguais na Visão Geral, na Ata 360 e no Contrato 360.
 * `abrir(alvo)` pede a justificativa; ao confirmar, grava o aviso resolvido ou conclui a tarefa.
 */
export function useResolverAviso() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { porChave, resolver, reexibir, podeResolver, podeConcluirTarefas } = useAvisosResolvidos();
  const [alvo, setAlvo] = React.useState<AlvoResolucao | null>(null);
  const [texto, setTexto] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);
  // Tarefas concluídas aqui: somem já, sem esperar a Visão Geral recarregar.
  const [tarefasConcluidas, setTarefasConcluidas] = React.useState<ReadonlySet<string>>(new Set());

  const abrir = React.useCallback((a: AlvoResolucao) => {
    setAlvo(a);
    setTexto('');
    setErro(null);
  }, []);
  const fechar = () => {
    if (!gravando) setAlvo(null);
  };

  /** O ✓ aparece para este alvo? (tarefa exige gestor ou coordenador). */
  const podeResolverAlvo = (a: { tipo: AlvoResolucao['tipo'] }) => (a.tipo === 'AVISO' ? podeResolver : podeConcluirTarefas);

  const confirmar = async () => {
    if (!alvo) return;
    const justificativa = texto.trim();
    if (justificativa.length < JUSTIFICATIVA_MIN) {
      setErro(`Escreva a justificativa com pelo menos ${JUSTIFICATIVA_MIN} caracteres.`);
      return;
    }
    setGravando(true);
    setErro(null);
    try {
      if (alvo.tipo === 'AVISO') {
        await resolver.mutateAsync({ chave: alvo.chave, tipo: tipoDaChave(alvo.chave), justificativa });
        toast.success('Aviso marcado como resolvido.');
      } else {
        const tabela = alvo.tipo === 'TAREFA_ATA' ? 'ata_tasks' : 'contract_tasks';
        const observacao = await observacaoComJustificativa(tabela, alvo.taskId, justificativa);
        if (alvo.tipo === 'TAREFA_ATA') {
          await updateAtaTaskRpc({ taskId: alvo.taskId, status: 'CONCLUIDA', observacao });
          void queryClient.invalidateQueries({ queryKey: ['ata-task-plan'] });
        } else {
          await updateContractTaskRpc({ taskId: alvo.taskId, status: 'CONCLUIDA', observacao });
          void queryClient.invalidateQueries({ queryKey: ['contract-task-plan'] });
        }
        void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
        const taskId = alvo.taskId;
        setTarefasConcluidas((atual) => new Set(atual).add(taskId));
        toast.success('Tarefa concluída.');
      }
      setAlvo(null);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível gravar. Tente de novo.');
    } finally {
      setGravando(false);
    }
  };

  const regra = alvo ? (alvo.tipo === 'AVISO' ? REGRA[tipoDaChave(alvo.chave)] : REGRA_TAREFA) : '';

  const dialog = (
    <Modal
      isOpen={Boolean(alvo)}
      onClose={fechar}
      dismissible={!gravando}
      size="sm"
      title={alvo?.tipo === 'AVISO' ? 'Marcar aviso como resolvido' : 'Concluir tarefa'}
      testId="resolver-aviso-dialog"
      footer={
        <>
          <ActionButton action="cancelar" size="sm" onClick={fechar} disabled={gravando} />
          <ActionButton action="confirmar" size="sm" onClick={() => void confirmar()} disabled={gravando} data-testid="resolver-aviso-confirmar">
            {gravando ? 'Gravando...' : alvo?.tipo === 'AVISO' ? 'Marcar como resolvido' : 'Concluir tarefa'}
          </ActionButton>
        </>
      }
    >
      {alvo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
            <strong>{alvo.titulo}</strong>
            {alvo.contexto && <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>{alvo.contexto}</div>}
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{regra}</p>
          <AppTextarea
            label="Justificativa (obrigatória)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={JUSTIFICATIVA_MAX}
            rows={4}
            placeholder="Ex.: remanejamento pedido à UASG gerenciadora (SEI 08020.000123/2026-11)"
            error={erro ?? undefined}
            autoFocus
            data-testid="resolver-aviso-justificativa"
          />
        </div>
      )}
    </Modal>
  );

  return { abrir, dialog, porChave, reexibir, podeResolver, podeResolverAlvo, tarefasConcluidas };
}

/** Botão ✓ (só o ícone, dica "Resolvido"). */
export const BotaoResolvido: React.FC<{ onClick: () => void; testId?: string }> = ({ onClick, testId }) => (
  <ActionButton
    action="resolvido"
    iconOnly
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    data-testid={testId}
  />
);

/** Espaço do ✓ quando o aviso não tem Resolvido (pagamento) ou o perfil não pode marcar: mantém os botões alinhados. */
export const EspacoResolvido: React.FC = () => <span aria-hidden="true" style={{ display: 'inline-block', width: '32px', flex: 'none' }} />;

export interface ItemResolvido {
  chave: string;
  titulo: string;
  contexto?: string;
}

/** "N avisos marcados como resolvidos": justificativa, quem e quando, e Reexibir. */
export const AvisosResolvidosLista: React.FC<{
  itens: ItemResolvido[];
  porChave: Map<string, AvisoResolvido>;
  podeReexibir: boolean;
  onReexibir: (chave: string) => void;
  reexibindo?: boolean;
  testId?: string;
}> = ({ itens, porChave, podeReexibir, onReexibir, reexibindo = false, testId = 'avisos-resolvidos' }) => {
  if (itens.length === 0) return null;
  return (
    <details data-testid={testId} style={{ fontSize: '0.82rem', color: '#475569' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#0c326f' }}>
        {itens.length === 1 ? '1 aviso marcado como resolvido' : `${itens.length} avisos marcados como resolvidos`}
      </summary>
      <div style={{ marginTop: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
        {itens.map((item, idx) => {
          const info = porChave.get(item.chave);
          const quando = info ? new Date(info.resolvidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
          return (
            <div
              key={item.chave}
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', borderTop: idx === 0 ? 'none' : '1px solid #e2e8f0', flexWrap: 'wrap' }}
            >
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.titulo}</div>
                {item.contexto && <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{item.contexto}</div>}
                {info && (
                  <>
                    <div style={{ marginTop: '0.25rem', fontStyle: 'italic', color: '#0f172a', whiteSpace: 'pre-wrap' }}>{info.justificativa}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Resolvido{info.resolvidoPorNome ? ` por ${info.resolvidoPorNome}` : ''} em {quando}
                    </div>
                  </>
                )}
              </div>
              {podeReexibir && (
                <ActionButton action="reexibir" size="sm" onClick={() => onReexibir(item.chave)} disabled={reexibindo} />
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};

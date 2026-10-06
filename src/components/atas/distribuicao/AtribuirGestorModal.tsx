import React from 'react';
import { Lightbulb } from 'lucide-react';
import { Modal } from '../../../design-system/components/Modal';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { useUsers } from '../../../hooks/useUsers';
import { useRoles } from '../../../hooks/useRoles';
import { useAssignManager } from '../../../hooks/useAssignManager';
import { resolveRoleLabel } from '../../../services/roleService';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import type { ArpItemContractLinkPair } from '../../../services/arpContractLinkService';
import type { ContractDashboardRecord } from '../../../types';
import type { DistribuicaoLinha } from './distribuicaoEquipe';
import { ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import { avaliarCandidatos, indexarItens, montarLote, type CandidatoAtribuicao } from './sugestaoAtribuicao';

const NIVEIS: NivelComplexidade[] = ['ALTA', 'MEDIA', 'BAIXA'];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface AtribuirGestorModalProps {
  targets: ManagerTarget[];
  /** Gestor de quem a carteira sai (`null` = "Sem gestor"); só para o título. */
  origem: string | null;
  linhas: DistribuicaoLinha[];
  links: ArpItemContractLinkPair[];
  contractsByKey?: Map<string, ContractDashboardRecord>;
  onClose: () => void;
  /** Depois de salvar sem falhas (ex.: limpar a seleção). */
  onDone?: () => void;
  /** Contratos prováveis da ata ainda não vinculados: virão para o gestor quando o servidor vincular. */
  provaveis?: number;
}

/**
 * "Para quem atribuo?": mostra o que muda de mãos (com os contratos que seguem a ata), a carga atual → depois de
 * cada candidato e a pressão de agora, com uma sugestão discreta. A escolha é sempre do coordenador.
 */
export const AtribuirGestorModal: React.FC<AtribuirGestorModalProps> = ({ targets, origem, linhas, links, contractsByKey, onClose, onDone, provaveis = 0 }) => {
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const assign = useAssignManager();
  const [escolhido, setEscolhido] = React.useState<{ nome: string; userId: string | null } | null>(null);

  const lote = React.useMemo(() => montarLote(targets, links, indexarItens(linhas)), [targets, links, linhas]);
  const candidatos = React.useMemo<CandidatoAtribuicao[]>(
    () =>
      users
        .filter((u) => u.ativo)
        .map((u) => ({ nome: u.nome, userId: u.id, ehGestor: u.perfil === 'gestor', perfilLabel: resolveRoleLabel(roles, u.perfil) })),
    [users, roles]
  );
  const { opcoes, sugestao } = React.useMemo(() => avaliarCandidatos(lote, candidatos, linhas), [lote, candidatos, linhas]);

  // Só servidores cadastrados: o gestor precisa da conta para ver a própria carteira (escopo pelo usuário).
  const nomeFinal = escolhido?.nome ?? '';
  const gestorUserId = escolhido?.userId ?? null;
  const falhas = assign.data?.falhas || [];

  const salvar = () => {
    if (!nomeFinal) return;
    assign.mutate(
      { targets, gestorNome: nomeFinal, gestorUserId, links, contractsByKey },
      {
        onSuccess: (result) => {
          if (result.falhas.length === 0) {
            onDone?.();
            onClose();
          }
        }
      }
    );
  };

  const titulo = origem === null ? 'Atribuir gestor' : `Transferir de ${origem}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!assign.isPending}
      size="lg"
      title={titulo}
      subtitle="Para quem atribuo? Compare a carga de cada um antes de decidir."
      testId="atribuir-gestor-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={assign.isPending} />
          <ActionButton
            action="salvar"
            type="button"
            onClick={salvar}
            disabled={assign.isPending || !nomeFinal}
            data-testid="atribuir-gestor-salvar"
            isLoading={assign.isPending}
          >
            {nomeFinal ? `Atribuir a ${nomeFinal}` : 'Escolha um gestor'}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <section
          data-testid="atribuir-gestor-lote"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
        >
          <div style={{ fontWeight: 800, color: '#0f172a' }}>
            {plural(lote.atas, 'ata', 'atas')} · {plural(lote.contratos, 'contrato', 'contratos')} vigentes
            {lote.vinculados > 0 && (
              <span style={{ fontWeight: 600, color: 'var(--color-info-text-strong)' }}>
                {' '}({lote.vinculados} {lote.vinculados === 1 ? 'vem junto' : 'vêm junto'} pelos vínculos com a ata)
              </span>
            )}
          </div>
          <div style={{ color: '#475569' }}>
            Complexidade: {NIVEIS.map((n) => `${lote.complexidade[n]} ${ROTULO_COMPLEXIDADE[n]}`).join(' · ')} — soma {lote.equivalente} de carga
          </div>
          {provaveis > 0 && (
            <div data-testid="atribuir-gestor-provaveis" style={{ color: 'var(--color-warning-text)', fontWeight: 600 }}>
              Mais {plural(provaveis, 'contrato provável', 'contratos prováveis')} {lote.atas > 1 ? 'destas atas' : 'desta ata'} {provaveis === 1 ? 'virá' : 'virão'} para o gestor quando o servidor vincular.
            </div>
          )}
        </section>

        <div role="radiogroup" aria-label="Gestor que vai receber" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {opcoes.map((o, i) => {
            const primeiroDoGrupo = i === 0 || opcoes[i - 1].ehGestor !== o.ehGestor;
            const selecionado = escolhido?.nome === o.nome;
            const pressao = [
              o.urgentes > 0 ? plural(o.urgentes, 'urgente', 'urgentes') : null,
              o.atrasadas > 0 ? plural(o.atrasadas, 'tarefa atrasada', 'tarefas atrasadas') : null
            ].filter(Boolean);
            return (
              <React.Fragment key={o.nome}>
                {primeiroDoGrupo && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', marginTop: i === 0 ? 0 : '0.5rem' }}>
                    {o.ehGestor ? 'Gestores' : 'Outros servidores'}
                  </div>
                )}
                <label
                  data-testid={`atribuir-candidato-${o.nome}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    padding: '0.55rem 0.75rem',
                    minHeight: '44px',
                    border: `1px solid ${selecionado ? 'var(--primary)' : '#e2e8f0'}`,
                    background: selecionado ? 'var(--color-info-bg)' : '#ffffff',
                    borderRadius: '8px',
                    cursor: o.jaEhGestor ? 'default' : 'pointer',
                    opacity: o.jaEhGestor ? 0.55 : 1
                  }}
                >
                  <input
                    type="radio"
                    name="atribuir-gestor"
                    checked={selecionado}
                    disabled={o.jaEhGestor}
                    onChange={() => setEscolhido({ nome: o.nome, userId: o.userId })}
                  />
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {o.nome}
                      {sugestao === o.nome && (
                        <span
                          data-testid="atribuir-sugestao"
                          title="Menor carga depois da atribuição entre os gestores (empate: menos urgentes). É só uma sugestão."
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success-text)', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: '4px', padding: '0 0.35rem' }}
                        >
                          <Lightbulb size={12} aria-hidden="true" /> Sugestão
                        </span>
                      )}
                    </div>
                    {o.perfilLabel && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{o.perfilLabel}</div>}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }} title="Carga equivalente: Baixa = 1, Média = 2, Alta = 3">
                    {o.jaEhGestor ? 'Já é o gestor' : <>Carga {o.cargaAtual} → <span style={{ color: 'var(--primary)', fontWeight: 900 }}>{o.cargaDepois}</span></>}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '120px', color: pressao.length ? 'var(--color-danger-text)' : '#94a3b8' }}>
                    {pressao.length ? pressao.join(' · ') : 'Sem urgências'}
                  </div>
                </label>
              </React.Fragment>
            );
          })}
        </div>

        {assign.isError && (
          <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
            Erro ao salvar: {assign.error.message}
          </div>
        )}
        {falhas.length > 0 && (
          <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
            {falhas.length === 1 ? 'Não foi possível salvar 1 item' : `Não foi possível salvar ${falhas.length} itens`}: {falhas.map((f) => f.chave).join(', ')}. {falhas[0].erro}
          </div>
        )}
      </div>
    </Modal>
  );
};

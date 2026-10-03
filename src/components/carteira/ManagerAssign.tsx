import React from 'react';
import { Check, Loader2, Pencil, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import { useRoles } from '../../hooks/useRoles';
import { useAssignManager } from '../../hooks/useAssignManager';
import { resolveRoleLabel } from '../../services/roleService';
import { resolveManagerPropagation, type ManagerTarget } from '../../services/managerAssignmentService';
import type { ArpItemContractLinkPair } from '../../services/arpContractLinkService';
import type { ContractDashboardRecord } from '../../types';
import { carteiraButton } from './carteiraStyles';
import { AnchoredPanel } from '../../design-system/components/AnchoredPanel';

/** Perfis que podem atribuir gestor (mesma regra das RPCs save_*_manager_atomic). */
export function canAssignManager(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor';
}

export interface ManagerAssignContext {
  links: ArpItemContractLinkPair[];
  contractsByKey?: Map<string, ContractDashboardRecord>;
}

interface ManagerAssignPanelProps extends ManagerAssignContext {
  targets: ManagerTarget[];
  /** Nome atual (só quando é um único alvo). */
  currentGestorNome?: string;
  anchorRect: DOMRect;
  onClose: () => void;
  onDone?: () => void;
}

function describePropagation(targets: ManagerTarget[], links: ArpItemContractLinkPair[]): string | null {
  const { ataKeys, contractKeys } = resolveManagerPropagation(targets, links);
  const alvoAtas = new Set(targets.filter((t) => t.tipo === 'ATA').map((t) => (t as { ataKey: string }).ataKey));
  const alvoContratos = new Set(targets.filter((t) => t.tipo === 'CONTRATO').map((t) => (t as { contractKey: string }).contractKey));
  const extraAtas = ataKeys.filter((k) => !alvoAtas.has(k));
  const extraContratos = contractKeys.filter((k) => !alvoContratos.has(k));
  if (extraAtas.length === 0 && extraContratos.length === 0) return null;

  const partes: string[] = [];
  if (extraAtas.length > 0) {
    partes.push(extraAtas.length === 1 ? `a Ata ${extraAtas[0]}` : `${extraAtas.length} atas vinculadas`);
  }
  if (extraContratos.length > 0) {
    partes.push(extraContratos.length === 1 ? '1 contrato vinculado' : `${extraContratos.length} contratos vinculados`);
  }
  return `O gestor da ata é o mesmo dos contratos vinculados: também será aplicado a ${partes.join(' e ')}.`;
}

/**
 * Painel de atribuição de gestor, ancorado ao botão que o abriu: popover no desktop e
 * bottom sheet no celular (ver AnchoredPanel).
 */
export const ManagerAssignPanel: React.FC<ManagerAssignPanelProps> = ({
  targets,
  currentGestorNome,
  anchorRect,
  links,
  contractsByKey,
  onClose,
  onDone
}) => {
  const { user, role } = useAuth();
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const assign = useAssignManager();

  const activeUsers = users.filter((u) => u.ativo);
  const [customMode, setCustomMode] = React.useState(false);
  const [gestorNome, setGestorNome] = React.useState(currentGestorNome || '');
  const [gestorUserId, setGestorUserId] = React.useState<string | null>(
    activeUsers.find((u) => u.nome === currentGestorNome)?.id ?? null
  );
  const propagacao = describePropagation(targets, links);
  const perdeAcesso = role === 'gestor' && Boolean(gestorNome.trim()) && gestorUserId !== user?.id;
  const quantidade = targets.length;

  const handleSave = () => {
    const nome = gestorNome.trim();
    if (!nome) return;
    assign.mutate(
      { targets, gestorNome: nome, gestorUserId: customMode ? null : gestorUserId, links, contractsByKey },
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

  const falhas = assign.data?.falhas || [];

  return (
    <AnchoredPanel
      anchorRect={anchorRect}
      onClose={onClose}
      ariaLabel="Atribuir gestor"
      testId="manager-assign-panel"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
          {quantidade > 1 ? `Atribuir gestor a ${quantidade} itens` : currentGestorNome ? 'Alterar gestor' : 'Atribuir gestor'}
        </strong>
        <button type="button" onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
          <X size={15} />
        </button>
      </div>

      {!customMode ? (
        <select
          autoFocus
          value={activeUsers.some((u) => u.nome === gestorNome) ? gestorNome : ''}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustomMode(true);
              setGestorNome('');
              setGestorUserId(null);
              return;
            }
            setGestorNome(e.target.value);
            setGestorUserId(activeUsers.find((u) => u.nome === e.target.value)?.id ?? null);
          }}
          data-testid="manager-assign-select"
          style={{ fontSize: '0.82rem', padding: '0.4rem 0.5rem', border: '1px solid #0c326f', borderRadius: '6px', fontWeight: 600, color: '#0f172a', background: '#ffffff' }}
        >
          <option value="">Selecione o servidor gestor...</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={u.nome}>
              {u.nome} ({resolveRoleLabel(roles, u.perfil)})
            </option>
          ))}
          <option value="__custom__">Digitar outro nome...</option>
        </select>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <input
            autoFocus
            type="text"
            value={gestorNome}
            onChange={(e) => setGestorNome(e.target.value)}
            placeholder="Nome completo do gestor"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.5rem', border: '1px solid #0c326f', borderRadius: '6px' }}
          />
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              setGestorNome(currentGestorNome || '');
            }}
            style={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: '#0284c7', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Selecionar da lista de servidores
          </button>
        </div>
      )}

      {propagacao && (
        <div data-testid="manager-assign-propagation" style={{ fontSize: '0.75rem', color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.45rem 0.55rem' }}>
          {propagacao}
        </div>
      )}

      {perdeAcesso && (
        <div data-testid="manager-assign-access-warning" style={{ fontSize: '0.75rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.45rem 0.55rem' }}>
          Ao atribuir a outra pessoa, você deixará de ver {quantidade > 1 || propagacao ? 'estes itens' : 'este item'} na sua carteira.
        </div>
      )}

      {assign.isError && (
        <div role="alert" style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
          Erro ao salvar: {assign.error.message}
        </div>
      )}
      {falhas.length > 0 && (
        <div role="alert" style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
          {falhas.length === 1 ? 'Não foi possível salvar 1 item' : `Não foi possível salvar ${falhas.length} itens`}: {falhas.map((f) => f.chave).join(', ')}. {falhas[0].erro}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
        <button type="button" onClick={onClose} style={{ ...carteiraButton, color: '#475569' }}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={assign.isPending || !gestorNome.trim()}
          data-testid="manager-assign-save"
          style={{
            ...carteiraButton,
            background: '#0c326f',
            borderColor: '#0c326f',
            color: '#ffffff',
            opacity: assign.isPending || !gestorNome.trim() ? 0.6 : 1,
            cursor: assign.isPending || !gestorNome.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {assign.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar
        </button>
      </div>
    </AnchoredPanel>
  );
};

interface ManagerCellProps extends ManagerAssignContext {
  target: ManagerTarget;
  gestorNome?: string;
  canAssign: boolean;
  testId: string;
}

/** Célula "Gestor" das carteiras: mostra o nome e, para quem pode, atribui ali mesmo. */
export const ManagerCell: React.FC<ManagerCellProps> = ({ target, gestorNome, canAssign, testId, links, contractsByKey }) => {
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const close = React.useCallback(() => setAnchor(null), []);

  if (!canAssign) {
    return gestorNome ? <span>{gestorNome}</span> : <span style={{ color: '#94a3b8' }}>—</span>;
  }

  const open = (e: React.MouseEvent<HTMLButtonElement>) => setAnchor(e.currentTarget.getBoundingClientRect());

  return (
    <>
      {gestorNome ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <span>{gestorNome}</span>
          <button
            type="button"
            onClick={open}
            aria-label={`Alterar gestor (${gestorNome})`}
            data-testid={testId}
            title="Alterar gestor"
            style={{ background: 'none', border: 'none', padding: '0.15rem', cursor: 'pointer', color: '#64748b', display: 'flex' }}
          >
            <Pencil size={13} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={open}
          data-testid={testId}
          style={{ ...carteiraButton, padding: '0.25rem 0.55rem', fontSize: '0.75rem', color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}
        >
          <UserPlus size={12} /> Atribuir
        </button>
      )}
      {anchor && (
        <ManagerAssignPanel
          targets={[target]}
          currentGestorNome={gestorNome}
          anchorRect={anchor}
          links={links}
          contractsByKey={contractsByKey}
          onClose={close}
        />
      )}
    </>
  );
};

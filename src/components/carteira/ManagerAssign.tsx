import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { carteiraButton } from './carteiraStyles';

/** Endereço da Central de Distribuição, único lugar onde se atribui gestor. */
export const CENTRAL_DISTRIBUICAO_PATH = '/atas/distribuicao';

/**
 * Só o coordenador (admin) atribui gestor, e só na Central de Distribuição
 * (mesma regra das RPCs save_*_manager_atomic desde a migration 69).
 */
export function canAssignManager(role: string | null | undefined): boolean {
  return role === 'admin';
}

interface ManagerCellProps {
  gestorNome?: string;
  /** Coordenador: sem gestor, a célula vira atalho para a Central de Distribuição. */
  canAssign: boolean;
  testId: string;
}

/**
 * Célula "Gestor" das carteiras: só mostra o nome. A atribuição foi centralizada na Central de
 * Distribuição; para o coordenador, "Sem gestor" leva até lá.
 */
export const ManagerCell: React.FC<ManagerCellProps> = ({ gestorNome, canAssign, testId }) => {
  const navigate = useNavigate();
  if (gestorNome) return <span data-testid={testId}>{gestorNome}</span>;
  if (!canAssign) return <span data-testid={testId} style={{ color: '#94a3b8' }}>—</span>;
  return (
    <button
      type="button"
      onClick={() => navigate(CENTRAL_DISTRIBUICAO_PATH)}
      data-testid={testId}
      title="A atribuição de gestor é feita na Central de Distribuição"
      style={{ ...carteiraButton, padding: '0.25rem 0.55rem', fontSize: '0.75rem', color: 'var(--color-warning-text)', borderColor: 'var(--color-warning-border)', background: 'var(--color-warning-bg)' }}
    >
      Sem gestor · atribuir na Central <ArrowRight size={12} />
    </button>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';

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
    <AppButton
      type="button"
      variant="outline"
      size="xs"
      onClick={() => navigate(CENTRAL_DISTRIBUICAO_PATH)}
      data-testid={testId}
      title="A atribuição de gestor é feita na Central de Distribuição"
    >
      Sem gestor · atribuir na Central <ArrowRight size={12} />
    </AppButton>
  );
};

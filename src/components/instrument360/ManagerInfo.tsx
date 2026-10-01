import React from 'react';
import { UserCheck, UserCircle2 } from 'lucide-react';

/**
 * Gestor titular no topo das telas 360 — só informação. A atribuição fica na
 * Carteira (de Contratos ou de Atas), onde dá para atribuir vários de uma vez.
 */
export const ManagerInfo: React.FC<{ label: string; gestorNome?: string; isLoading?: boolean; testId: string }> = ({
  label,
  gestorNome,
  isLoading = false,
  testId
}) => {
  const assigned = Boolean(gestorNome);
  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: assigned ? 'rgba(12, 50, 111, 0.08)' : '#f8fafc',
          border: `1px solid ${assigned ? 'rgba(12, 50, 111, 0.2)' : '#e2e8f0'}`,
          color: assigned ? '#0c326f' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {assigned ? <UserCheck size={16} /> : <UserCircle2 size={16} />}
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: '0.85rem', fontWeight: assigned ? 700 : 400, color: assigned ? '#0f172a' : '#94a3b8', fontStyle: assigned ? 'normal' : 'italic' }}>
          {isLoading ? 'Carregando...' : gestorNome || 'Não atribuído'}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Database, CheckCircle2, RefreshCw } from 'lucide-react';
import type { SyncMetadata } from '../../types';

interface SyncActivityCardProps {
  syncInfo?: SyncMetadata;
  uasg?: string;
  isSyncing?: boolean;
  onRefresh?: () => void;
}

export const SyncActivityCard: React.FC<SyncActivityCardProps> = ({
  syncInfo,
  uasg = '200331',
  isSyncing = false,
  onRefresh
}) => {
  const lastSyncStr = syncInfo?.ultimoSyncEm
    ? new Date(syncInfo.ultimoSyncEm).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Base local consolidada';

  return (
    <section aria-labelledby="sync-activity-title" style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ padding: '0.4rem', background: '#eff6ff', borderRadius: '8px', color: '#0c326f' }}>
            <Database size={20} />
          </div>
          <div>
            <h3 id="sync-activity-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Integração & Fontes Oficiais
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
              Conexão com os barramentos de dados do Governo Federal
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isSyncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#0c326f',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              opacity: isSyncing ? 0.6 : 1
            }}
          >
            <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
            {isSyncing ? 'Sincronizando...' : 'Atualizar Dados'}
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem'
      }}>
        {/* API Compras.gov.br */}
        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>Compras.gov.br</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#15803d',
              background: '#dcfce7',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px'
            }}>
              <CheckCircle2 size={12} /> Conectado
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: 0 }}>
            API de Atas, Itens e Contratos da UASG {uasg}.
          </p>
        </div>

        {/* PNCP */}
        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>PNCP Oficial</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#15803d',
              background: '#dcfce7',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px'
            }}>
              <CheckCircle2 size={12} /> Sincronizado
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: 0 }}>
            Portal Nacional de Contratações Públicas.
          </p>
        </div>

        {/* Cache / Metadados */}
        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>Status da Base</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0c326f' }}>
              {lastSyncStr}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: 0 }}>
            {syncInfo?.totalAtas ? `${syncInfo.totalAtas} atas registradas em base local.` : 'Base de dados consolidada.'}
          </p>
        </div>
      </div>
    </section>
  );
};

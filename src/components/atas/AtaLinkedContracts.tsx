import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { EmptyState } from '../../design-system/components/EmptyState';
import type { EnrichedArpItemContract } from '../../types/arpContractLinks';

interface AtaLinkedContractsProps {
  linkedContracts: EnrichedArpItemContract[];
  isLoading?: boolean;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const AtaLinkedContracts: React.FC<AtaLinkedContractsProps> = ({ linkedContracts, isLoading = false }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando contratos vinculados...
      </div>
    );
  }

  if (linkedContracts.length === 0) {
    return (
      <EmptyState
        title="Nenhum contrato vinculado."
        description="Ainda não há contratos oficiais vinculados a itens desta Ata."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {linkedContracts.map((link) => (
        <div
          key={link.linkId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.85rem 1.1rem',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flex: 1, minWidth: '260px' }}>
            <div style={{ padding: '0.3rem', background: '#eff6ff', borderRadius: '6px', color: '#0c326f', marginTop: '0.1rem' }}>
              <FileText size={15} />
            </div>
            <div>
              <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{link.numeroContratoFormatado}</strong>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
                {link.fornecedorNome} {link.valorGlobal ? `• ${formatCurrency(link.valorGlobal)}` : ''}
              </p>
            </div>
          </div>

          {link.isOficial && (
            <button
              type="button"
              onClick={() => navigate(`/contratos/${encodeURIComponent(link.contractKey)}`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.85rem',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0c326f',
                cursor: 'pointer'
              }}
            >
              Abrir 360° <ArrowRight size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

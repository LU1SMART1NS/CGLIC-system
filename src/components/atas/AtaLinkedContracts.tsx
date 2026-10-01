import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, Loader2, Unlink } from 'lucide-react';
import { EmptyState } from '../../design-system/components/EmptyState';
import type { EnrichedArpItemContract } from '../../types/arpContractLinks';

interface AtaLinkedContractsProps {
  linkedContracts: EnrichedArpItemContract[];
  isLoading?: boolean;
  /** Botão "Vincular contrato" exibido no estado vazio (quando o usuário pode editar). */
  emptyAction?: React.ReactNode;
  /** Desvincula o contrato do item; ausente = sem permissão de edição. */
  onUnlink?: (link: EnrichedArpItemContract) => void;
  /** linkId do vínculo sendo removido no momento. */
  unlinkingId?: string | null;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Número do item a partir do item_key ("00050/2024-200331-00002" → "00002"). */
function itemNumberFromKey(itemKey: string): string {
  return itemKey.split('-').pop() || itemKey;
}

export const AtaLinkedContracts: React.FC<AtaLinkedContractsProps> = ({
  linkedContracts,
  isLoading = false,
  emptyAction,
  onUnlink,
  unlinkingId
}) => {
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
        description={
          emptyAction
            ? 'Ainda não há contratos oficiais vinculados a itens desta Ata. Vincule um contrato indicando os itens que ele cobre e a quantidade contratada em cada um.'
            : 'Ainda não há contratos oficiais vinculados a itens desta Ata.'
        }
        action={emptyAction}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {linkedContracts.map((link) => (
        <div
          key={link.linkId}
          data-testid="ata-linked-contract"
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
              <p style={{ fontSize: '0.74rem', color: '#475569', margin: '0.15rem 0 0 0' }}>
                Item {itemNumberFromKey(link.itemKey)} • {link.quantidadeContratada.toLocaleString('pt-BR')} contratado(s)
                {link.observacoes ? ` • ${link.observacoes}` : ''}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {onUnlink && (
              <button
                type="button"
                onClick={() => onUnlink(link)}
                disabled={unlinkingId === link.linkId}
                title="Desvincular este contrato do item da ata"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.75rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#b91c1c',
                  cursor: unlinkingId === link.linkId ? 'wait' : 'pointer'
                }}
              >
                {unlinkingId === link.linkId ? (
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Unlink size={13} />
                )}
                Desvincular
              </button>
            )}

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
                Ver Detalhes <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

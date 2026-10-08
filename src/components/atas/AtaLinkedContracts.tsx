import React from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { FileText } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { OrigemVinculoBadge } from '../vinculos/OrigemVinculoBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { CarteiraIdLink, propsDeLinhaClicavel, SetaDaLinha } from '../carteira/CarteiraRowLink';
import type { EnrichedArpItemContract } from '../../types/arpContractLinks';

interface AtaLinkedContractsProps {
  linkedContracts: EnrichedArpItemContract[];
  isLoading?: boolean;
  /** Botão "Vincular Contrato" exibido no estado vazio (quando o usuário pode editar). */
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
  const navigate = useNavigateWithOrigin();

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
            ? 'Ainda não há contratos oficiais vinculados a itens desta Ata. Vincule um contrato indicando os itens que ele cobre.'
            : 'Ainda não há contratos oficiais vinculados a itens desta Ata.'
        }
        action={emptyAction}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {linkedContracts.map((link) => {
        const abrir = link.isOficial ? () => navigate(`/contratos/${encodeURIComponent(link.contractKey)}`) : null;
        return (
        <div
          key={link.linkId}
          data-testid="ata-linked-contract"
          // A linha tem o botão de desvincular; quem usa teclado chega pelo número do contrato.
          {...propsDeLinhaClicavel(abrir, 'Ver detalhes do contrato', { teclado: 'link' })}
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ padding: '0.3rem', background: 'var(--color-info-bg)', borderRadius: '6px', color: 'var(--primary)', marginTop: '0.1rem' }}>
              <FileText size={15} />
            </div>
            <div>
              {abrir ? (
                <CarteiraIdLink onClick={abrir} label={`Abrir o contrato ${link.numeroContratoFormatado}`} title="Ver detalhes do contrato" testId="ata-linked-contract-open">
                  {link.numeroContratoFormatado}
                </CarteiraIdLink>
              ) : (
                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{link.numeroContratoFormatado}</strong>
              )}
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
                {link.fornecedorNome?.toUpperCase()} {link.valorGlobal ? `• ${formatCurrency(link.valorGlobal)}` : ''}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#475569', margin: '0.15rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                Item {itemNumberFromKey(link.itemKey)}
                <OrigemVinculoBadge origem={link.origem} mostrarManual />
              </p>
              {link.observacoes && (
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.1rem 0 0 0' }}>Obs. {link.observacoes}</p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            {onUnlink && (
              <ActionButton
                action="desvincular"
                size="sm"
                iconOnly
                label="Desvincular contrato deste item da ata"
                onClick={() => onUnlink(link)}
                isLoading={unlinkingId === link.linkId}
              />
            )}
            {abrir && <SetaDaLinha />}
          </div>
        </div>
        );
      })}
    </div>
  );
};

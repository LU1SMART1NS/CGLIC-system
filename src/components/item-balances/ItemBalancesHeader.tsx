import React from 'react';
import {
  ChevronLeft,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  X,
  Package
} from 'lucide-react';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { formatCurrency, formatNumber } from './itemBalanceUtils';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import { useSyncItemEmpenhos } from '../../hooks/useSyncItemEmpenhos';
import type { ArpRecord, ArpItemRecord } from '../../types';
import type { OrchestrationStatus } from '../../types/empenhoSync';
import { AppCard, AppButton, PageHeader } from '../../design-system';

export interface ItemBalancesHeaderProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
  userRole?: string;
  canSync?: boolean;
}

export const ItemBalancesHeader: React.FC<ItemBalancesHeaderProps> = ({
  arp,
  item,
  onBack,
  userRole,
  canSync
}) => {
  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  const itemKey = normalizeItemKey(
    arp.numeroAtaRegistroPreco,
    arp.codigoUnidadeGerenciadora,
    item.numeroItem
  );

  const syncMutation = useSyncItemEmpenhos(itemKey);

  // RBAC: gestor, coordenador e admin possuem permissão
  const isAuthorized =
    userRole !== undefined
      ? ['gestor', 'coordenador', 'admin'].includes(userRole)
      : canSync !== undefined
      ? canSync
      : true;

  const handleSync = () => {
    if (!isAuthorized || syncMutation.isPending) return;
    syncMutation.mutate({
      unitPrice: item.valorUnitario ? Number(item.valorUnitario) : undefined
    });
  };

  // Mapeamento de Feedback Operacional (Focado no Consumo Físico / Quantitativo do Item)
  const getFeedbackConfig = (status?: OrchestrationStatus) => {
    switch (status) {
      case 'SUCESSO':
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          color: '#166534',
          icon: <CheckCircle2 size={16} color="#166534" />,
          message: `Sincronização concluída. ${
            syncMutation.data?.empenhos_persistidos ?? syncMutation.data?.empenhos_encontrados ?? 0
          } empenho(s) processado(s) e saldo quantitativo do item atualizado com sucesso.`
        };
      case 'SEM_DADOS':
        return {
          bg: '#f0fdf4',
          border: '#bae6fd',
          color: '#075985',
          icon: <Info size={16} color="#075985" />,
          message: 'Nenhum empenho de consumo localizado nas bases oficiais para este item da Ata.'
        };
      case 'SUCESSO_PARCIAL':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          color: '#92400e',
          icon: <AlertTriangle size={16} color="#92400e" />,
          message: 'Sincronização concluída parcialmente. Alguma base governamental estava temporariamente indisponível.'
        };
      case 'COM_DIVERGENCIAS':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          color: '#92400e',
          icon: <AlertTriangle size={16} color="#92400e" />,
          message: `Dados sincronizados com ${
            syncMutation.data?.divergencias?.length ?? 1
          } divergência(s) entre fontes.`
        };
      case 'ERRO':
      default:
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          color: '#991b1b',
          icon: <XCircle size={16} color="#991b1b" />,
          message:
            syncMutation.data?.erros?.[0]?.erro ||
            (syncMutation.error instanceof Error
              ? syncMutation.error.message
              : 'Não foi possível consultar as bases governamentais no momento. Tente novamente mais tarde.')
        };
    }
  };

  const showFeedback = Boolean(syncMutation.data || syncMutation.isError);
  const feedback = showFeedback
    ? getFeedbackConfig(syncMutation.data?.status || (syncMutation.isError ? 'ERRO' : undefined))
    : null;

  return (
    <>
      {/* Sovereign PageHeader */}
      <PageHeader
        title={`Item ${item.numeroItem} — ${item.descricaoItem}`}
        subtitle={`Ata nº ${arp.numeroAtaRegistroPreco} • UASG ${arp.codigoUnidadeGerenciadora} - ${arp.nomeUnidadeGerenciadora || 'SENASP'}`}
        icon={<Package size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AppButton
              variant="outline"
              size="sm"
              icon={<ChevronLeft size={14} />}
              onClick={onBack}
            >
              Voltar para Itens
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} className={syncMutation.isPending ? 'spin-animation' : ''} />}
              onClick={handleSync}
              disabled={!isAuthorized || syncMutation.isPending}
              isLoading={syncMutation.isPending}
              title={
                !isAuthorized
                  ? 'Você não possui permissão para sincronizar empenhos deste item.'
                  : 'Sincronizar empenhos deste item nas fontes oficiais (Compras.gov.br)'
              }
            >
              {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Empenhos'}
            </AppButton>
          </div>
        }
      />

      {/* Banner de Feedback Operacional da Sincronização */}
      {showFeedback && feedback && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.65rem 0.85rem',
            background: feedback.bg,
            border: `1px solid ${feedback.border}`,
            borderRadius: '6px',
            color: feedback.color,
            fontSize: '0.8rem',
            fontWeight: 600,
            marginBottom: '1rem',
            transition: 'all 0.15s ease-in-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {feedback.icon}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => syncMutation.reset()}
            aria-label="Fechar notificação"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: feedback.color,
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.75
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Modern Clean Item Info Overview */}
      <AppCard style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
            Item {item.numeroItem}
          </span>
          {item.tipoItem && (
            <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
              {item.tipoItem}
            </span>
          )}
          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
            Preço Unitário: {formatCurrency(item.valorUnitario)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', fontSize: '0.85rem' }}>
          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Fornecedor
            </span>
            <span className="meta-value" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {item.nomeRazaoSocialFornecedor}
              {item.niFornecedor && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400, marginTop: '2px' }}>
                  CNPJ/CPF: {item.niFornecedor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
                </div>
              )}
            </span>
          </div>
          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Quantidade Original
            </span>
            <span className="meta-value" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem' }}>
              {formatNumber(item.quantidadeHomologadaItem)} unidades
            </span>
          </div>
          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Valor Total do Item
            </span>
            <span className="meta-value" style={{ fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', fontSize: '1rem' }}>
              {formatCurrency(item.valorTotal)}
            </span>
          </div>
          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Situação Sicap / Adesão
            </span>
            <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}>
              {item.maximoAdesao > 0 ? (
                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Aceita Adesão ({formatNumber(item.maximoAdesao)} un)
                </span>
              ) : (
                <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Não Aceita Adesão
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Links externos para PNCP */}
        {(ataUrl || compraUrl) && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ataUrl && (
              <a 
                href={ataUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                style={{ textDecoration: 'none' }}
              >
                <AppButton variant="outline" size="sm" icon={<ExternalLink size={13} />}>
                  Ver Ata no PNCP
                </AppButton>
              </a>
            )}
            {compraUrl && (
              <a 
                href={compraUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                style={{ textDecoration: 'none' }}
              >
                <AppButton variant="outline" size="sm" icon={<ExternalLink size={13} />}>
                  Ver Edital / Contratação no PNCP
                </AppButton>
              </a>
            )}
          </div>
        )}
      </AppCard>
    </>
  );
};

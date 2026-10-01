import React from 'react';
import { ExternalLink, Package, RefreshCw, X } from 'lucide-react';
import { Instrument360Hero } from '../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { StatusBadge, AppButton, AlertCard } from '../../design-system';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import { formatCnpj, formatCurrency, formatCurrencyCompact, formatNumber } from '../../utils/format';
import { useSyncItemEmpenhos } from '../../hooks/useSyncItemEmpenhos';
import { pncpLinkStyle } from '../atas/Ata360Header';
import type { PrazoFaixa } from '../carteira/carteiraPrazo';
import type { ArpRecord, ArpItemRecord, ReconciliationReport } from '../../types';
import type { OrchestrationStatus } from '../../types/empenhoSync';

export type ItemTab = 'unidades' | 'empenhos' | 'contratos' | 'alocacao' | 'adesoes';

export interface ItemHeroMetrics {
  officialSaldo: number;
  itemTotalQty: number;
  totalEmpenhado: number;
  empenhoConsumidoPercent: number;
  rawEmpenhoPercentRestante: number;
  saldoAdesoes: number;
  limiteAdesao: number;
  valorFinanceiroDisponivel: number;
  valorFinanceiroConsumido: number;
}

export interface ItemHeroProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
  backLabel?: string;
  /** Gestor e admin sincronizam com as fontes oficiais; os demais só recarregam. */
  canSync: boolean;
  /** Recarrega empenhos, contratos e dados manuais da tela. */
  onRefresh: () => void;
  isRefreshing?: boolean;
  metrics: ItemHeroMetrics;
  report: ReconciliationReport;
  onGoTo: (tab: ItemTab) => void;
}

/** Situação do saldo na mesma escala de cores das barras de progresso (<20% crítico, <50% atenção). */
export function itemSaldoStatus(officialSaldo: number, restantePct: number): { faixa: PrazoFaixa; label: string } {
  if (officialSaldo <= 0) return { faixa: 'EXPIRADO', label: 'Saldo esgotado' };
  if (restantePct < 20) return { faixa: 'CRITICO', label: 'Saldo crítico' };
  if (restantePct < 50) return { faixa: 'ATENCAO', label: 'Saldo em atenção' };
  return { faixa: 'REGULAR', label: 'Saldo disponível' };
}

function syncNotice(
  status: OrchestrationStatus | undefined,
  data: ReturnType<typeof useSyncItemEmpenhos>['data'],
  error: unknown
): { severity: 'INFO' | 'ATENCAO' | 'CRITICA'; message: string } {
  switch (status) {
    case 'SUCESSO':
      return {
        severity: 'INFO',
        message: `Sincronização concluída. ${data?.empenhos_persistidos ?? data?.empenhos_encontrados ?? 0} empenho(s) processado(s) e saldo do item atualizado.`
      };
    case 'SEM_DADOS':
      return { severity: 'INFO', message: 'Nenhum empenho de consumo localizado nas bases oficiais para este item da Ata.' };
    case 'SUCESSO_PARCIAL':
      return { severity: 'ATENCAO', message: 'Sincronização parcial: alguma base governamental estava temporariamente indisponível.' };
    case 'COM_DIVERGENCIAS':
      return { severity: 'ATENCAO', message: `Dados sincronizados com ${data?.divergencias?.length ?? 1} divergência(s) entre fontes.` };
    default:
      return {
        severity: 'CRITICA',
        message:
          data?.erros?.[0]?.erro ||
          (error instanceof Error ? error.message : 'Não foi possível consultar as bases governamentais agora. Tente novamente mais tarde.')
      };
  }
}

/**
 * Topo da tela do Item (mesmo cartão das telas 360): identificação, fornecedor, indicadores de saldo e
 * conferência com o SIASG. Cada número aparece uma vez; o detalhe fica nas abas.
 */
export const ItemHero: React.FC<ItemHeroProps> = ({
  arp,
  item,
  onBack,
  backLabel = 'Voltar para a ata',
  canSync,
  onRefresh,
  isRefreshing = false,
  metrics,
  report,
  onGoTo
}) => {
  const itemKey = normalizeItemKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem);
  const syncMutation = useSyncItemEmpenhos(itemKey);
  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  const busy = syncMutation.isPending || isRefreshing;
  const handleAction = () => {
    if (busy) return;
    if (canSync) {
      syncMutation.mutate(
        { unitPrice: item.valorUnitario ? Number(item.valorUnitario) : undefined },
        { onSettled: onRefresh }
      );
    } else {
      onRefresh();
    }
  };

  const showNotice = Boolean(syncMutation.data || syncMutation.isError);
  const notice = showNotice
    ? syncNotice(syncMutation.data?.status || 'ERRO', syncMutation.data, syncMutation.error)
    : null;

  const aceitaAdesao = Number(item.maximoAdesao) > 0;
  const divergente = report.status === 'DIVERGENTE';
  const consistente = report.status === 'CONSISTENTE';
  const delta = report.divergencia > 0 ? `+${formatNumber(report.divergencia)}` : formatNumber(report.divergencia);

  const status = itemSaldoStatus(metrics.officialSaldo, metrics.rawEmpenhoPercentRestante);

  return (
    <Instrument360Hero
      backLabel={backLabel}
      onBack={onBack}
      backTestId="item-back-btn"
      actions={
        <>
          {ataUrl && (
            <a href={ataUrl} target="_blank" rel="noopener noreferrer" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Ata no PNCP
            </a>
          )}
          {compraUrl && (
            <a href={compraUrl} target="_blank" rel="noopener noreferrer" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Edital no PNCP
            </a>
          )}
          <AppButton
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} className={busy ? 'spin-animation' : ''} />}
            onClick={handleAction}
            disabled={busy}
            isLoading={busy}
            title={
              canSync
                ? 'Consulta os empenhos deste item nas fontes oficiais (Compras.gov.br) e recarrega a tela'
                : 'Recarrega os dados desta tela'
            }
          >
            {busy ? 'Atualizando...' : canSync ? 'Sincronizar empenhos' : 'Atualizar'}
          </AppButton>
        </>
      }
      notice={
        notice && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <AlertCard title={notice.message} severity={notice.severity} testId="item-sync-notice" />
            </div>
            <button
              type="button"
              onClick={() => syncMutation.reset()}
              aria-label="Fechar notificação"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
            >
              <X size={14} />
            </button>
          </div>
        )
      }
      icon={<Package size={26} color="#0c326f" aria-hidden="true" />}
      title={`Item ${item.numeroItem}`}
      status={status}
      subtitle={
        <>
          <strong>{item.nomeRazaoSocialFornecedor || 'Fornecedor não informado'}</strong>
          {item.niFornecedor && <span style={{ color: '#64748b' }}> · {formatCnpj(item.niFornecedor)}</span>}
        </>
      }
      objeto={item.descricaoItem}
      metaTestId="item-header-metadata"
      meta={[
        { label: 'Ata', value: arp.numeroAtaRegistroPreco },
        {
          label: 'Unidade gerenciadora',
          value: arp.nomeUnidadeGerenciadora
            ? `${arp.nomeUnidadeGerenciadora} (${arp.codigoUnidadeGerenciadora})`
            : arp.codigoUnidadeGerenciadora
        },
        { label: 'Tipo', value: item.tipoItem },
        { label: 'Preço unitário', value: formatCurrency(item.valorUnitario) },
        { label: 'Valor total do item', value: formatCurrency(item.valorTotal) }
      ]}
    >
      <div data-testid="item-health-strip">
        <HealthTileGrid>
          <HealthTile
            label="Saldo para empenho"
            value={`${formatNumber(metrics.officialSaldo)} un`}
            hint={`de ${formatNumber(metrics.itemTotalQty)} · consumido ${formatNumber(metrics.totalEmpenhado)} (${formatNumber(metrics.empenhoConsumidoPercent)}%)`}
            tone={status.faixa === 'CRITICO' || status.faixa === 'EXPIRADO' ? 'CRITICA' : status.faixa === 'ATENCAO' ? 'ATENCAO' : undefined}
            onClick={() => onGoTo('empenhos')}
            testId="item-health-saldo"
          />
          <HealthTile
            label="Saldo para adesões"
            value={aceitaAdesao ? `${formatNumber(metrics.saldoAdesoes)} un` : 'Não aceita'}
            hint={aceitaAdesao ? `de ${formatNumber(metrics.limiteAdesao)} · ver caronas` : 'adesão não prevista no item'}
            onClick={aceitaAdesao ? () => onGoTo('adesoes') : undefined}
            testId="item-health-adesoes"
          />
          <HealthTile
            label="Valor disponível"
            value={formatCurrencyCompact(metrics.valorFinanceiroDisponivel)}
            hint={`consumido ${formatCurrencyCompact(metrics.valorFinanceiroConsumido)}`}
            tone={metrics.valorFinanceiroDisponivel < 0 ? 'CRITICA' : undefined}
            testId="item-health-valor"
          />
          <HealthTile
            label="Conferência com o SIASG"
            value={consistente ? 'Consistente' : divergente ? `Divergência ${delta} un` : 'Sem dado da API'}
            hint={consistente ? 'empenhos batem com o saldo oficial' : divergente ? 'ver conferência do saldo' : 'saldo oficial indisponível'}
            positive={consistente}
            tone={divergente ? 'ATENCAO' : undefined}
            onClick={() => onGoTo('empenhos')}
            testId="item-health-reconciliacao"
          />
        </HealthTileGrid>
        <div style={{ marginTop: '0.75rem' }}>
          <StatusBadge
            label={aceitaAdesao ? `Aceita adesão (até ${formatNumber(item.maximoAdesao)} un)` : 'Não aceita adesão'}
            variant={aceitaAdesao ? 'success' : 'neutral'}
            size="sm"
          />
        </div>
      </div>
    </Instrument360Hero>
  );
};

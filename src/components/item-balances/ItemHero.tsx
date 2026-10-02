import { classifyArpItemSaldo } from '../../services/balanceService';
import React from 'react';
import { ExternalLink, Package, RefreshCw } from 'lucide-react';
import { Instrument360Hero } from '../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { AppButton } from '../../design-system';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { formatCnpj, formatCurrency, formatCurrencyCompact, formatNumber } from '../../utils/format';
import { pncpLinkStyle } from '../atas/Ata360Header';
import type { PrazoFaixa } from '../carteira/carteiraPrazo';
import type { ArpRecord, ArpItemRecord } from '../../types';
import type { ComprasGovReferencia } from './ItemExecutionSummaryStrip';

export type ItemTab = 'unidades' | 'contratos' | 'alocacao' | 'adesoes';

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
  /** Recarrega empenhos, contratos e dados manuais da tela. */
  onRefresh: () => void;
  isRefreshing?: boolean;
  metrics: ItemHeroMetrics;
  /** Consumo informado pelo Compras.gov comparado ao contratado (só referência). */
  referencia: ComprasGovReferencia;
  onGoTo: (tab: ItemTab) => void;
}

/** Situação do saldo pela régua única do sistema (balanceService.classifyArpItemSaldo): resta <20% crítico, <50% atenção. */
export function itemSaldoStatus(officialSaldo: number, restantePct: number): { faixa: PrazoFaixa; label: string } {
  if (officialSaldo <= 0) return { faixa: 'EXPIRADO', label: 'Saldo esgotado' };
  const { isCritico, isProximoLimite } = classifyArpItemSaldo(100 - restantePct);
  if (isCritico) return { faixa: 'CRITICO', label: 'Saldo crítico' };
  if (isProximoLimite) return { faixa: 'ATENCAO', label: 'Saldo em atenção' };
  return { faixa: 'REGULAR', label: 'Saldo disponível' };
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
  onRefresh,
  isRefreshing = false,
  metrics,
  referencia,
  onGoTo
}) => {
  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  const busy = isRefreshing;
  const handleAction = () => {
    if (!busy) onRefresh();
  };

  const aceitaAdesao = Number(item.maximoAdesao) > 0;
  const acima = referencia.status === 'ACIMA';
  const delta = referencia.delta > 0 ? `+${formatNumber(referencia.delta)}` : formatNumber(referencia.delta);

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
            title="Recarrega os dados desta tela e, para gestores, relê da API a quantidade e os empenhos dos contratos vinculados"
          >
            {busy ? 'Atualizando...' : 'Atualizar'}
          </AppButton>
        </>
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
            label="Saldo SENASP"
            value={`${formatNumber(metrics.officialSaldo)} un`}
            hint={`de ${formatNumber(metrics.itemTotalQty)} · contratado ${formatNumber(metrics.totalEmpenhado)} (${formatNumber(metrics.empenhoConsumidoPercent)}%)`}
            tone={status.faixa === 'CRITICO' || status.faixa === 'EXPIRADO' ? 'CRITICA' : status.faixa === 'ATENCAO' ? 'ATENCAO' : undefined}
            onClick={() => onGoTo('contratos')}
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
          {acima && (
            <HealthTile
              label="Referência Compras.gov"
              value={`Diferença ${delta} un`}
              hint="consumo sem contrato vinculado?"
              tone="ATENCAO"
              onClick={() => onGoTo('contratos')}
              testId="item-health-reconciliacao"
            />
          )}
        </HealthTileGrid>
      </div>
    </Instrument360Hero>
  );
};

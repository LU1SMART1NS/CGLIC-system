import { classifyArpItemSaldo } from '../../services/balanceService';
import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Instrument360Hero } from '../instrument360/Instrument360Hero';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { useAtaManager } from '../../hooks/useAtaManagers';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { AppButton } from '../../design-system';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { formatCnpj, formatCurrency, formatCurrencyCompact, formatNumber } from '../../utils/format';
import { differenceInDays, formatDateBR, parseDateBRT } from '../../services/temporalEngineService';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { pncpLinkStyle } from '../atas/Ata360Header';
import type { PrazoFaixa } from '../carteira/carteiraPrazo';
import type { SeverityLevel } from '../../design-system/tokens';
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
  /** Vínculos de empenho ainda sem quantidade confirmada. */
  empenhosPendentes?: number;
  /** Soma das alocações internas do quantitativo SENASP. */
  quantidadeAlocada?: number;
  /** Total registrado do item na ata, somando todos os órgãos. */
  quantidadeTotalAta?: number;
  /** Órgãos com quantidade registrada no item (gerenciador e participantes). */
  orgaosParticipantes?: number;
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
  /** Abre a Ata 360. Sem ele, o número da ata aparece como texto. */
  onOpenAta?: () => void;
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
  onGoTo,
  onOpenAta
}) => {
  // O item não tem gestor próprio: vale o da ata. Se a consulta falhar, o bloco some (não vira "Não atribuído").
  const { data: gestorAta, isLoading: carregandoGestor, isError: erroGestor } = useAtaManager(arp.numeroAtaRegistroPreco);

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
  const saldoTone: SeverityLevel | undefined =
    status.faixa === 'CRITICO' || status.faixa === 'EXPIRADO' ? 'CRITICA' : status.faixa === 'ATENCAO' ? 'ATENCAO' : undefined;
  const saldoBadge = status.faixa === 'EXPIRADO' ? 'Esgotado' : undefined;
  const empenhosPendentes = metrics.empenhosPendentes ?? 0;

  // Alocação interna: o quantitativo SENASP (`itemTotalQty`) menos o que já foi distribuído às unidades internas.
  const alocada = metrics.quantidadeAlocada ?? 0;
  const aAlocar = metrics.itemTotalQty - alocada;
  const alocadaAcima = aAlocar < 0;
  // Total registrado do item na ata, somando todos os órgãos (só quando conhecido).
  const totalAta = metrics.quantidadeTotalAta && metrics.quantidadeTotalAta > 0 ? metrics.quantidadeTotalAta : null;

  // O item não tem vigência própria: vale a da ata, com o fim corrigido pelo PNCP quando existir.
  const fimAta = arp.dataVigenciaFinalPncp || arp.dataVigenciaFinal;
  const fimAtaData = fimAta ? parseDateBRT(fimAta) : null;
  const diasAta = fimAtaData ? differenceInDays(fimAtaData) : null;
  const faixaAta = classifyPrazo(diasAta, Boolean(arp.isCanceladaPncp));
  const avisoAta =
    diasAta === null
      ? undefined
      : diasAta < 0
        ? `encerrada há ${Math.abs(diasAta)} ${Math.abs(diasAta) === 1 ? 'dia' : 'dias'}`
        : faixaAta === 'CRITICO'
          ? `vence em ${diasAta} ${diasAta === 1 ? 'dia' : 'dias'}`
          : undefined;

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
      eyebrow={[`UASG ${arp.codigoUnidadeGerenciadora}`, arp.nomeUnidadeGerenciadora].filter(Boolean).join(' · ')}
      title={`Item ${item.numeroItem}`}
      manager={
        erroGestor ? undefined : (
          <ManagerInfo label="Gestor da ata" gestorNome={gestorAta?.gestorNome} isLoading={carregandoGestor} testId="item-manager-info" />
        )
      }
      status={{ ...status, neutral: status.faixa === 'REGULAR' }}
      subtitle={
        <>
          <strong>{item.nomeRazaoSocialFornecedor || 'Fornecedor não informado'}</strong>
          {item.niFornecedor && <span style={{ color: '#64748b' }}> · CNPJ {formatCnpj(item.niFornecedor)}</span>}
        </>
      }
      objeto={item.descricaoItem}
      origin={{
        label: 'Ata de origem',
        value: onOpenAta ? (
          <button
            type="button"
            onClick={onOpenAta}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#075985', textDecoration: 'underline', cursor: 'pointer' }}
          >
            nº {arp.numeroAtaRegistroPreco}
          </button>
        ) : (
          <span>nº {arp.numeroAtaRegistroPreco}</span>
        )
      }}
      statusAlert={avisoAta ? `Ata ${avisoAta}` : undefined}
      dates={[
        ...(totalAta ? [{ label: 'Registrado na ata', value: `${formatNumber(totalAta)} un` }] : []),
        ...(metrics.orgaosParticipantes ? [{ label: 'Órgãos participantes', value: String(metrics.orgaosParticipantes) }] : []),
        ...(fimAtaData ? [{ label: 'Vigência da ata', value: `até ${formatDateBR(fimAta)}`, emphasis: true }] : [])
      ]}
      identifiersTestId="item-header-metadata"
      identifiers={[
        { label: 'Tipo', value: item.tipoItem },
        { label: 'Código do item', value: item.codigoItem ? String(item.codigoItem) : undefined },
        { label: 'Valor unitário', value: Number(item.valorUnitario) > 0 ? formatCurrency(item.valorUnitario) : undefined },
        { label: 'PDM', value: item.codigoPdm ? String(item.codigoPdm) : undefined }
      ]}
    >
      <div data-testid="item-health-strip">
        <HealthTileGrid columns={5}>
          <HealthTile
            label="Saldo SENASP"
            value={`${formatNumber(metrics.officialSaldo)} un`}
            hint={`de ${formatNumber(metrics.itemTotalQty)} · ${formatNumber(metrics.empenhoConsumidoPercent)}% contratado`}
            tooltip={`Saldo de ${formatNumber(metrics.officialSaldo)} un do quantitativo SENASP de ${formatNumber(metrics.itemTotalQty)} un · ${formatCurrencyCompact(metrics.valorFinanceiroDisponivel)} disponíveis · contratado ${formatNumber(metrics.totalEmpenhado)} un (${formatNumber(metrics.empenhoConsumidoPercent)}%)`}
            tone={saldoTone}
            badge={saldoBadge}
            onClick={() => onGoTo('contratos')}
            testId="item-health-saldo"
          />
          <HealthTile
            label="Saldo para adesões"
            value={aceitaAdesao ? `${formatNumber(metrics.saldoAdesoes)} un` : 'Não aceita'}
            hint={
              aceitaAdesao
                ? metrics.saldoAdesoes === metrics.limiteAdesao
                  ? 'ver caronas'
                  : `de ${formatNumber(metrics.limiteAdesao)} · ver caronas`
                : 'adesão não prevista no item'
            }
            onClick={aceitaAdesao ? () => onGoTo('adesoes') : undefined}
            testId="item-health-adesoes"
          />
          <HealthTile
            label="Alocação interna"
            value={`${formatNumber(alocada)} un`}
            hint={alocadaAcima ? `acima do SENASP em ${formatNumber(-aAlocar)} un` : `a alocar ${formatNumber(aAlocar)} un`}
            tone={alocadaAcima ? 'ATENCAO' : undefined}
            onClick={() => onGoTo('alocacao')}
            testId="item-health-alocacao"
          />
          <HealthTile
            label="Empenhos pendentes"
            value={String(empenhosPendentes)}
            hint="a confirmar"
            tooltip="Empenhos vinculados ao item que ainda aguardam confirmação de quantidade"
            tone={empenhosPendentes > 0 ? 'ATENCAO' : undefined}
            onClick={() => onGoTo('contratos')}
            testId="item-health-empenhos"
          />
          {acima ? (
            <HealthTile
              label="Pendências"
              value="1"
              hint={[`Diferença ${delta} un`, 'consumo sem contrato vinculado?']}
              tone="ATENCAO"
              onClick={() => onGoTo('contratos')}
              testId="item-health-reconciliacao"
            />
          ) : (
            <HealthTile
              label="Pendências"
              value="Nenhuma"
              hint="consumo confere"
              tooltip="O consumo informado pelo Compras.gov confere com o contratado"
              positive
              testId="item-health-pendencias"
            />
          )}
        </HealthTileGrid>
      </div>
    </Instrument360Hero>
  );
};

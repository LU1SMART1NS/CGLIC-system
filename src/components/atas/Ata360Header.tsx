import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Package } from 'lucide-react';
import type { ArpRecord, ArpItemRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { formatDateBR } from '../../services/temporalEngineService';
import { buildAtaLifeline } from '../../services/contractLifelineService';
import { classifyArpItemSaldo } from '../../services/balanceService';
import type { AtaItemSaldoInput } from '../../services/ataActionQueueService';
import { useAtaManager } from '../../hooks/useAtaManagers';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { Instrument360Hero, instrumentStatusLabel } from '../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid, LifelineBar, PendenciasTile } from '../instrument360/HealthStripParts';

interface Ata360HeaderProps {
  arp: ArpRecord;
  itens: ArpItemRecord[];
  saldos: AtaItemSaldoInput[];
  counts: Record<SeverityLevel, number>;
  linkedContractsCount: number;
  isLoadingSaldos?: boolean;
  onOpenActions: () => void;
  onOpenItens: () => void;
  onOpenContratos: () => void;
  onBack?: () => void;
}

export const pncpLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#0284c7',
  backgroundColor: 'rgba(2, 132, 199, 0.08)',
  padding: '0.25rem 0.65rem',
  borderRadius: '6px',
  textDecoration: 'none'
};

/**
 * Topo da Ata 360: identificação, situação, dados cadastrais, indicadores e
 * linha da vida num só cartão (mesmo Instrument360Hero do Contrato 360).
 *
 * Sem botão de sincronizar: vigência e itens das atas já são atualizados
 * automaticamente a cada 3 horas e pelo botão "Atualizar" da Carteira de Atas.
 */
export const Ata360Header: React.FC<Ata360HeaderProps> = ({
  arp,
  itens,
  saldos,
  counts,
  linkedContractsCount,
  isLoadingSaldos = false,
  onOpenActions,
  onOpenItens,
  onOpenContratos,
  onBack
}) => {
  const navigate = useNavigate();
  const lifeline = React.useMemo(() => buildAtaLifeline(arp), [arp]);
  const { data: manager, isLoading: loadingManager } = useAtaManager(arp.numeroAtaRegistroPreco);
  const cancelada = Boolean(arp.isCanceladaPncp);
  const dias = lifeline ? lifeline.diasParaFim : null;
  const faixa = classifyPrazo(dias, cancelada);

  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  const fornecedores = new Set(itens.map((i) => i.nomeRazaoSocialFornecedor).filter(Boolean)).size;

  // Maior consumo entre os itens: um item a 91% já é alerta, independente da média da Ata.
  const maiorConsumo = React.useMemo(() => {
    let best: { pct: number; numeroItem: string } | null = null;
    for (const s of saldos) {
      const homologada = Number(s.quantidade_homologada || 0);
      const raw = typeof s.percentual_consumido === 'number'
        ? s.percentual_consumido
        : homologada > 0 ? (Number(s.quantidade_consumida || 0) / homologada) * 100 : 0;
      const pct = classifyArpItemSaldo(raw).percentualConsumido;
      if (!best || pct > best.pct) best = { pct, numeroItem: String(s.numero_item ?? '') };
    }
    return best;
  }, [saldos]);
  const consumoClass = maiorConsumo ? classifyArpItemSaldo(maiorConsumo.pct) : null;
  const consumoTone: SeverityLevel | undefined =
    consumoClass && (consumoClass.isCritico || consumoClass.isProximoLimite) ? consumoClass.severity : undefined;

  // Órgão só aparece quando for diferente da unidade gerenciadora (evita "SENASP" repetido).
  const orgaoDiferente = arp.nomeOrgao && arp.nomeOrgao.trim().toUpperCase() !== (arp.nomeUnidadeGerenciadora || '').trim().toUpperCase();

  return (
    <Instrument360Hero
      backLabel="Voltar para Atas"
      onBack={onBack || (() => navigate('/atas'))}
      backTestId="ata-360-back-btn"
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
        </>
      }
      icon={<Package size={26} color="#0c326f" aria-hidden="true" />}
      title={`Ata ${arp.numeroAtaRegistroPreco}`}
      status={{ faixa, label: instrumentStatusLabel(faixa, dias, cancelada) }}
      manager={<ManagerInfo label="Gestor da ata" gestorNome={manager?.gestorNome} isLoading={loadingManager} testId="ata-manager-info" />}
      objeto={arp.objeto}
      metaTestId="ata-header-metadata"
      meta={[
        ...(orgaoDiferente ? [{ label: 'Órgão', value: arp.nomeOrgao }] : []),
        {
          label: 'Unidade gerenciadora',
          value: arp.nomeUnidadeGerenciadora
            ? `${arp.nomeUnidadeGerenciadora} (${arp.codigoUnidadeGerenciadora})`
            : arp.codigoUnidadeGerenciadora
        },
        { label: 'Modalidade', value: arp.nomeModalidadeCompra },
        { label: 'Compra', value: arp.numeroCompra && arp.anoCompra ? `${arp.numeroCompra}/${arp.anoCompra}` : undefined },
        { label: 'Nº PNCP', value: arp.numeroControlePncpAta },
        { label: 'Assinatura', value: arp.dataAssinatura ? formatDateBR(arp.dataAssinatura) : undefined }
      ]}
    >
      <div data-testid="ata-health-strip">
        <HealthTileGrid>
          <HealthTile
            label="Valor registrado"
            value={formatCurrencyCompact(Number(arp.valorTotal) || 0)}
            hint={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · ${fornecedores} ${fornecedores === 1 ? 'fornecedor' : 'fornecedores'}`}
            testId="ata-health-valor"
          />
          <HealthTile
            label="Maior consumo de saldo"
            value={isLoadingSaldos && !maiorConsumo ? '…' : maiorConsumo ? `${Math.round(maiorConsumo.pct)}%` : '—'}
            hint={maiorConsumo ? `item ${maiorConsumo.numeroItem}` : isLoadingSaldos ? 'Carregando saldos' : 'Sem saldo registrado'}
            tone={consumoTone}
            onClick={onOpenItens}
            testId="ata-health-consumo"
          />
          <HealthTile
            label="Contratos vinculados"
            value={String(linkedContractsCount)}
            hint={linkedContractsCount === 0 ? 'nenhum ainda' : 'usam itens desta ata'}
            onClick={onOpenContratos}
            testId="ata-health-contratos"
          />
          <PendenciasTile counts={counts} onClick={onOpenActions} testId="ata-health-pendencias" />
        </HealthTileGrid>

        <LifelineBar lifeline={lifeline} testId="ata-lifeline" cancelada={cancelada} />
      </div>
    </Instrument360Hero>
  );
};

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

  // Saldo ainda contratável, em valor (itens têm unidades diferentes, então não se somam quantidades).
  // O tom segue o item mais consumido: um item a 91% já é alerta, independente do conjunto da Ata.
  const saldoContratavel = React.useMemo(() => {
    const precoPorItem = new Map(itens.map((i) => [Number(i.numeroItem), Number(i.valorUnitario) || 0]));
    let total = 0;
    let livre = 0;
    let pior: { pct: number; numeroItem: string } | null = null;
    for (const s of saldos) {
      const preco = precoPorItem.get(Number(s.numero_item)) ?? 0;
      const homologada = Number(s.quantidade_homologada || 0);
      const consumida = Number(s.quantidade_consumida || 0);
      total += homologada * preco;
      livre += Math.max(homologada - consumida, 0) * preco;
      const raw = typeof s.percentual_consumido === 'number'
        ? s.percentual_consumido
        : homologada > 0 ? (consumida / homologada) * 100 : 0;
      const pct = classifyArpItemSaldo(raw).percentualConsumido;
      if (!pior || pct > pior.pct) pior = { pct, numeroItem: String(s.numero_item ?? '') };
    }
    return { total, livre, pior };
  }, [itens, saldos]);
  const piorClass = saldoContratavel.pior ? classifyArpItemSaldo(saldoContratavel.pior.pct) : null;
  const saldoTone: SeverityLevel | undefined =
    piorClass && (piorClass.isCritico || piorClass.isProximoLimite) ? piorClass.severity : undefined;
  const temSaldo = saldos.length > 0 && saldoContratavel.total > 0;
  const livrePct = temSaldo ? Math.round((saldoContratavel.livre / saldoContratavel.total) * 100) : 0;

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
            label="Saldo contratável"
            value={isLoadingSaldos && !temSaldo ? '…' : temSaldo ? formatCurrencyCompact(saldoContratavel.livre) : '—'}
            hint={
              temSaldo
                ? saldoTone && saldoContratavel.pior
                  ? `item ${saldoContratavel.pior.numeroItem} a ${Math.round(saldoContratavel.pior.pct)}% contratado`
                  : `${livrePct}% do valor registrado`
                : isLoadingSaldos ? 'Carregando saldos' : 'Sem saldo registrado'
            }
            tone={saldoTone}
            onClick={onOpenItens}
            testId="ata-health-saldo"
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

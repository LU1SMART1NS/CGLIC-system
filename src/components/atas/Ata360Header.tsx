import React from 'react';
import { useBackTarget } from '../../hooks/useDetailOrigin';
import { ExternalLink } from 'lucide-react';
import type { ArpRecord, ArpItemRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { formatDateBR } from '../../services/temporalEngineService';
import { buildAtaLifeline } from '../../services/contractLifelineService';
import { classifyArpItemSaldo } from '../../services/balanceService';
import type { AtaActionItem, AtaItemSaldoInput } from '../../services/ataActionQueueService';
import { SALDO_RULES } from '../../config/alertRules';
import { useAtaManager } from '../../hooks/useAtaManagers';
import { useAtaPncp } from '../../hooks/useAtaPncp';
import { useAtaAssinatura } from '../../hooks/useAtaAssinatura';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { MissingValue } from '../instrument360/MissingValue';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { classifyPrazo, type PrazoFaixa } from '../carteira/carteiraPrazo';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { Instrument360Hero, instrumentSituationLabel } from '../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid, LifelineRule } from '../instrument360/HealthStripParts';
import { quantidadeBaseSenasp } from '../../utils/quantitativoSenasp';

interface Ata360HeaderProps {
  arp: ArpRecord;
  itens: ArpItemRecord[];
  saldos: AtaItemSaldoInput[];
  /** Fila de ações da ata, já em ordem de prioridade. */
  actionItems?: AtaActionItem[];
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

/** Tom e selo do indicador de vigência: as faixas da Carteira (crítico ≤30 dias, atenção até 90) nos tokens de gravidade do sistema. */
export function vigenciaTile(faixa: PrazoFaixa, dias: number | null): { tone?: SeverityLevel; badge?: string; value: string } {
  if (dias === null) return { value: '—' };
  if (dias < 0) return { tone: 'CRITICA', badge: 'Encerrada', value: 'Encerrada' };
  const value = dias === 0 ? 'Vence hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  if (faixa === 'CRITICO') return { tone: 'CRITICA', badge: 'Crítico', value };
  if (faixa === 'ATENCAO') return { tone: 'ATENCAO', badge: 'Atenção', value };
  return { value };
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * Topo da Ata 360: UASG, título e situação, objeto, datas, quatro indicadores (vigência com a régua,
 * saldo contratável, itens em risco e ações) e os identificadores, num só cartão
 * (mesmo Instrument360Hero do Contrato 360 e do Item).
 *
 * Sem botão de sincronizar: vigência e itens das atas já são atualizados
 * automaticamente a cada 3 horas e pelo botão "Atualizar" da Carteira de Atas.
 */
export const Ata360Header: React.FC<Ata360HeaderProps> = ({
  arp,
  itens,
  saldos,
  actionItems = [],
  linkedContractsCount,
  isLoadingSaldos = false,
  onOpenActions,
  onOpenItens,
  onBack
}) => {
  const back = useBackTarget({ path: '/atas', label: 'Voltar para Atas' });
  const lifeline = React.useMemo(() => buildAtaLifeline(arp), [arp]);
  const { data: manager, isLoading: loadingManager } = useAtaManager(arp.numeroAtaRegistroPreco);
  // A divulgação no PNCP só aparece quando o PNCP responde; sem resposta, a linha de datas fica sem ela.
  const { data: pncp, isLoading: loadingPncp } = useAtaPncp(arp);
  // O banco local não guarda a assinatura (só o início da vigência): vem do Compras.gov.br.
  const { data: oficial, isLoading: loadingOficial } = useAtaAssinatura(arp);
  const dataAssinatura = arp.dataAssinatura || oficial?.dataAssinatura;
  const cancelada = Boolean(arp.isCanceladaPncp);
  const dias = lifeline ? lifeline.diasParaFim : null;
  const faixa = classifyPrazo(dias, cancelada);

  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  // Saldo ainda contratável, em valor (itens têm unidades diferentes, então não se somam quantidades).
  // O item mais consumido define o alerta: um item a 91% já pede atenção, independente do conjunto da Ata.
  const saldoContratavel = React.useMemo(() => {
    const precoPorItem = new Map(itens.map((i) => [Number(i.numeroItem), Number(i.valorUnitario) || 0]));
    let total = 0;
    let livre = 0;
    let emRisco = 0;
    let pior: { pct: number; numeroItem: string } | null = null;
    for (const s of saldos) {
      const preco = precoPorItem.get(Number(s.numero_item)) ?? 0;
      const homologada = quantidadeBaseSenasp(s);
      const consumida = Number(s.quantidade_consumida || 0);
      total += homologada * preco;
      livre += Math.max(homologada - consumida, 0) * preco;
      const raw = typeof s.percentual_consumido === 'number'
        ? s.percentual_consumido
        : homologada > 0 ? (consumida / homologada) * 100 : 0;
      const classificacao = classifyArpItemSaldo(raw);
      if (classificacao.isCritico) emRisco++;
      if (!pior || classificacao.percentualConsumido > pior.pct) {
        pior = { pct: classificacao.percentualConsumido, numeroItem: String(s.numero_item ?? '') };
      }
    }
    return { total, livre, pior, emRisco };
  }, [itens, saldos]);

  const piorClass = saldoContratavel.pior ? classifyArpItemSaldo(saldoContratavel.pior.pct) : null;
  const riscoTone: SeverityLevel | undefined =
    piorClass?.isCritico ? piorClass.severity : undefined;
  const temSaldo = saldos.length > 0 && saldoContratavel.total > 0;

  const vig = vigenciaTile(faixa, dias);
  const vigenciaHint = cancelada
    ? 'cancelada no PNCP'
    : dias !== null && dias < 0
      ? `encerrada há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`
      : !pncp && !loadingPncp
        ? 'prorrogação no PNCP: não verificada'
        : `prorrogada no PNCP: ${arp.prorrogadaPncp ? 'sim' : 'não'}`;

  const encerrada = cancelada || faixa === 'EXPIRADO';
  const primeiraAcao = actionItems[0];
  const acaoTone: SeverityLevel | undefined =
    primeiraAcao && primeiraAcao.severity !== 'INFO' ? primeiraAcao.severity : undefined;
  const contratadoHint = temSaldo ? `contratado ${formatCurrencyCompact(Math.max(saldoContratavel.total - saldoContratavel.livre, 0))}` : null;

  return (
    <Instrument360Hero
      backLabel={back.label}
      onBack={onBack || back.back}
      backTestId="ata-360-back-btn"
      actions={
        <>
          {ataUrl && (
            <a href={ataUrl} target="_blank" rel="noopener noreferrer" className="pncp-link" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Ata no PNCP
            </a>
          )}
          {compraUrl && (
            <a href={compraUrl} target="_blank" rel="noopener noreferrer" className="pncp-link" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Edital no PNCP
            </a>
          )}
        </>
      }
      eyebrow={[`UASG ${arp.codigoUnidadeGerenciadora}`, arp.nomeUnidadeGerenciadora].filter(Boolean).join(' · ')}
      title={`Ata nº ${arp.numeroAtaRegistroPreco}`}
      status={{ faixa: encerrada ? 'EXPIRADO' : 'REGULAR', label: instrumentSituationLabel(faixa, cancelada), neutral: !encerrada }}
      dockAlert={
        faixa === 'CRITICO' && dias !== null && dias >= 0
          ? dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
          : undefined
      }
      manager={<ManagerInfo label="Gestor da ata" gestorNome={manager?.gestorNome} isLoading={loadingManager} testId="ata-manager-info" />}
      objeto={arp.objeto}
      dates={[
        // Sem o dado, a linha continua e diz que não foi informado; só espera enquanto a fonte ainda responde.
        ...(dataAssinatura
          ? [{ label: 'Assinatura', value: formatDateBR(dataAssinatura) }]
          : loadingOficial ? [] : [{ label: 'Assinatura', value: <MissingValue />, title: 'O Compras.gov.br não informou a data de assinatura desta ata.' }]),
        ...(pncp?.dataPublicacaoPncp
          ? [{ label: 'Divulgação no PNCP', value: formatDateBR(pncp.dataPublicacaoPncp.slice(0, 10)) }]
          : loadingPncp ? [] : [{ label: 'Divulgação no PNCP', value: <MissingValue />, title: 'O PNCP não respondeu ou não localizou esta ata.' }]),
        ...(lifeline ? [{ label: 'Vigência', value: `${formatDateBR(lifeline.start)} a ${formatDateBR(lifeline.end)}`, emphasis: true }] : [])
      ]}
      identifiersTestId="ata-header-metadata"
      identifiers={[
        { label: 'Modalidade', value: arp.nomeModalidadeCompra },
        { label: 'Compra', value: arp.numeroCompra && arp.anoCompra ? `${arp.numeroCompra}/${arp.anoCompra}` : undefined },
        // Só aparece quando o PNCP informa: ausente não quer dizer que não aceita.
        ...(typeof pncp?.possibilidadeAdesao === 'boolean' ? [{ label: 'Aceita adesão', value: pncp.possibilidadeAdesao ? 'Sim' : 'Não' }] : []),
        ...(arp.numeroControlePncpAta ? [{ label: 'Id PNCP', value: arp.numeroControlePncpAta }] : [])
      ]}
    >
      <div data-testid="ata-health-strip">
        <HealthTileGrid columns={5}>
          <HealthTile
            wide
            label="Vigência"
            value={vig.value}
            hint={vigenciaHint}
            tone={vig.tone}
            badge={vig.badge}
            onClick={onOpenActions}
            testId="ata-health-vigencia"
          >
            <LifelineRule lifeline={lifeline} testId="ata-lifeline" tone={vig.tone} />
          </HealthTile>
          <HealthTile
            label="Saldo contratável"
            value={isLoadingSaldos && !temSaldo ? '…' : temSaldo ? formatCurrencyCompact(saldoContratavel.livre) : '—'}
            hint={
              temSaldo
                ? [contratadoHint as string, ...(linkedContractsCount > 0 ? [`${linkedContractsCount} ${linkedContractsCount === 1 ? 'contrato vinculado' : 'contratos vinculados'}`] : [])]
                : isLoadingSaldos ? 'Carregando saldos' : 'Sem saldo registrado'
            }
            onClick={onOpenItens}
            testId="ata-health-saldo"
          />
          <HealthTile
            label="Itens em risco"
            value={temSaldo || saldos.length > 0 ? `${saldoContratavel.emRisco} de ${saldos.length}` : '—'}
            hint={
              saldos.length === 0
                ? 'Sem saldo registrado'
                : saldoContratavel.emRisco > 0 && saldoContratavel.pior
                  ? `item ${saldoContratavel.pior.numeroItem} a ${Math.round(saldoContratavel.pior.pct)}% consumido`
                  : `nenhum acima de ${SALDO_RULES.criticoAcimaDePct}% consumido`
            }
            tone={saldoContratavel.emRisco > 0 ? riscoTone : undefined}
            onClick={onOpenItens}
            testId="ata-health-itens-risco"
          />
          {primeiraAcao ? (
            <HealthTile
              label="Ações"
              value={String(actionItems.length)}
              hint={[truncate(primeiraAcao.title, 44), ...(primeiraAcao.dataAlvo ? [`prazo ${formatDateBR(primeiraAcao.dataAlvo)}`] : [])]}
              tone={acaoTone}
              onClick={onOpenActions}
              testId="ata-health-acoes"
            />
          ) : (
            <HealthTile label="Ações" value="Nenhuma" hint="tudo em dia" positive onClick={onOpenActions} testId="ata-health-acoes" />
          )}
        </HealthTileGrid>
      </div>
    </Instrument360Hero>
  );
};

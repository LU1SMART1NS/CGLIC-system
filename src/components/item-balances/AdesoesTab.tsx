import React from 'react';
import { Share2 } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate } from './itemBalanceUtils';
import { formatDataHoraBR } from '../../utils/format';
import type { AdesaoItemRecord, ArpItemRecord } from '../../types';
import type { QuantitativosDoItem, RemanejamentoNaoParticipante } from '../../services/quantitativosService';
import { uasgDaAdesao, type AdesaoNoLimite, type SituacaoDaAdesao } from '../../utils/remanejamentoNaoParticipante';
import { AdesoesAConferirAviso } from './RemanejarNaoParticipanteModal';
import { isUasgCglic } from '../../config/unidadesGestoras';
import type { OrigemUnidadesItem } from '../../hooks/useItemUnidades';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';
import { DataTable, EmptyState, ErrorState, NoticeBar, ProgressBar, SectionHeader, StatusBadge, SummaryBar, type Column } from '../../design-system';

export interface AdesoesTabProps {
  adesoesLoading: boolean;
  adesoesError: string | null;
  adesoes: AdesaoItemRecord[];
  item: ArpItemRecord;
  /** Soma das quantidades aprovadas nas adesões. */
  totalAdesaoAprovada: number;
  /** Teto de adesões do item (maximoAdesao, limite da gerenciadora ou 2× o homologado). */
  limiteAdesao: number;
  /** De onde veio a lista: Compras.gov.br agora, cópia guardada ou nenhuma. */
  origem?: OrigemUnidadesItem;
  /** Quando a cópia foi lida do Compras.gov.br (origem COPIA). */
  copiadoEm?: string | null;
  /** Remanejamentos a não participantes e decisões sobre adesões a conferir (migration 219). */
  itemKey?: string;
  quantitativos?: QuantitativosDoItem;
  /** Situação de cada adesão no limite (CONTA, A_CONFERIR, MESMO); sem ela, todas contam. */
  adesoesNoLimite?: AdesaoNoLimite[];
  podeDecidir?: boolean;
}

/** Linha da tabela: adesão do Compras.gov.br ou remanejamento registrado aqui. */
type LinhaAdesao =
  | { tipo: 'ADESAO'; adesao: AdesaoItemRecord; situacao: SituacaoDaAdesao }
  | { tipo: 'REMANEJAMENTO'; remanejamento: RemanejamentoNaoParticipante };

/** Separa "929777 - SECRETARIA ..." em código da UASG e nome do órgão. */
export function splitUnidade(unidade: string): { codigo: string; nome: string } {
  const match = /^\s*(\d+)\s*-\s*(.+)$/.exec(unidade || '');
  return match ? { codigo: match[1], nome: match[2].trim() } : { codigo: '', nome: (unidade || '').trim() };
}

export const AdesoesTab: React.FC<AdesoesTabProps> = ({
  adesoesLoading,
  adesoesError,
  adesoes,
  item,
  totalAdesaoAprovada,
  limiteAdesao,
  origem = 'API',
  copiadoEm = null,
  itemKey = '',
  quantitativos,
  adesoesNoLimite,
  podeDecidir = false
}) => {
  const remanejamentos = quantitativos?.remanejamentosNaoParticipante ?? [];
  const totalRemanejado = remanejamentos.reduce((s, r) => s + r.quantidade, 0);
  const semDados = !adesoesLoading && origem === 'SEM_DADOS';
  const saldoAdesoes = Math.max(0, limiteAdesao - totalAdesaoAprovada);
  const semQuantidade = adesoes.filter((a) => a.quantidadeAprovadaAdesao == null).length;
  const quantidadeItem = Number(item.quantidadeHomologadaItem) || 0;

  const situacaoDe = (a: AdesaoItemRecord): SituacaoDaAdesao => adesoesNoLimite?.find((x) => x.adesao === a)?.situacao ?? 'CONTA';
  const linhas: LinhaAdesao[] = [
    ...[...adesoes]
      .sort((a, b) => (b.dataAprovacaoAnalise || '').localeCompare(a.dataAprovacaoAnalise || ''))
      .map((adesao) => ({ tipo: 'ADESAO' as const, adesao, situacao: situacaoDe(adesao) })),
    ...remanejamentos.map((remanejamento) => ({ tipo: 'REMANEJAMENTO' as const, remanejamento }))
  ];
  // Do item por UASG: adesões que contam + remanejamentos para ela.
  const usadoDaUasg = (uasg: string) =>
    (adesoesNoLimite
      ? adesoesNoLimite.filter((a) => a.uasg === uasg && a.situacao === 'CONTA').reduce((s, a) => s + a.quantidade, 0)
      : adesoes.filter((a) => uasgDaAdesao(a) === uasg).reduce((s, a) => s + (Number(a.quantidadeAprovadaAdesao) || 0), 0))
    + remanejamentos.filter((r) => r.uasgDestino === uasg).reduce((s, r) => s + r.quantidade, 0);

  // Nome, cidade e UF do cadastro de UASGs (o nome da adesão vem cortado da fonte); sem cadastro, o nome da adesão.
  const cadastro = useCadastroUasgs([...adesoes.map((a) => splitUnidade(a.unidadeNaoParticipante).codigo), ...remanejamentos.map((r) => r.uasgDestino)]);
  const orgaoDa = (ade: AdesaoItemRecord) => {
    const { codigo, nome } = splitUnidade(ade.unidadeNaoParticipante);
    const c = cadastro.get(codigo);
    return { codigo, nome: c?.nome ?? nome, nomeNaAdesao: nome, local: c ? localDaUasg(c) : null };
  };

  const orgaoDaLinha = (l: LinhaAdesao) => {
    if (l.tipo === 'ADESAO') return orgaoDa(l.adesao);
    const c = cadastro.get(l.remanejamento.uasgDestino);
    return { codigo: l.remanejamento.uasgDestino, nome: c?.nome ?? l.remanejamento.nomeDestino, nomeNaAdesao: l.remanejamento.nomeDestino, local: c ? localDaUasg(c) : null };
  };
  const quantidadeDa = (l: LinhaAdesao) => (l.tipo === 'ADESAO' ? l.adesao.quantidadeAprovadaAdesao : l.remanejamento.quantidade);
  const nomeDe = (uasg: string) => {
    const l = linhas.find((x) => orgaoDaLinha(x).codigo === uasg);
    return l ? orgaoDaLinha(l).nome : `UASG ${uasg}`;
  };

  const columns: Column<LinhaAdesao>[] = [
    {
      key: 'orgao',
      header: 'Órgão não participante',
      sortValue: (l) => orgaoDaLinha(l).nome,
      render: (l) => {
        const { codigo, nome, nomeNaAdesao, local } = orgaoDaLinha(l);
        return (
          <>
            <div style={{ fontWeight: 700, color: 'var(--primary)' }} title={nome !== nomeNaAdesao && nomeNaAdesao ? `Nome na adesão: ${nomeNaAdesao}` : undefined}>{nome || 'Órgão não informado'}</div>
            {codigo && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>UASG {codigo}{local ? ` · ${local}` : ''}</div>}
          </>
        );
      }
    },
    {
      key: 'aprovada',
      header: 'Qtd. aprovada',
      sortValue: (l) => quantidadeDa(l),
      sortFirstDir: 'desc',
      align: 'right',
      render: (l) => {
        const q = quantidadeDa(l);
        return q == null ? (
          <StatusBadge label="Não informada" variant="warning" size="sm" dot={false} />
        ) : (
          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatNumber(q)} un</span>
        );
      }
    },
    {
      // Art. 86, § 4º: cada órgão não participante pode aderir a até 50% do quantitativo do item.
      // A porcentagem soma tudo o que a UASG tem no item (adesões que contam e remanejamentos).
      key: 'percentual',
      header: 'Do item (máx. 50%)',
      sortValue: (l) => (quantidadeItem <= 0 ? null : usadoDaUasg(orgaoDaLinha(l).codigo) / quantidadeItem),
      sortFirstDir: 'desc',
      width: '200px',
      render: (l) => {
        if (quantidadeDa(l) == null || quantidadeItem <= 0) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
        const perc = (usadoDaUasg(orgaoDaLinha(l).codigo) / quantidadeItem) * 100;
        return (
          <>
            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '0.2rem', color: perc > 50 ? 'var(--danger)' : undefined }}>
              {formatNumber(perc)}%
            </div>
            <ProgressBar value={Math.min(perc * 2, 100)} showPercent={false} height="6px" testId="adesao-percentual-progress" />
          </>
        );
      }
    },
    {
      key: 'data',
      header: 'Aprovação',
      sortValue: (l) => (l.tipo === 'ADESAO' ? l.adesao.dataAprovacaoAnalise : l.remanejamento.registradoEm),
      sortFirstDir: 'desc',
      render: (l) => {
        if (l.tipo === 'REMANEJAMENTO') {
          const r = l.remanejamento;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
              <StatusBadge label="Remanejamento" variant="info" size="sm" dot={false} testId={`adesao-remanejamento-${r.id}`} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>de {isUasgCglic(r.uasgOrigem) ? 'SENASP' : quantitativos?.orgaos.find((o) => o.uasg === r.uasgOrigem)?.nomeOrgao ?? `UASG ${r.uasgOrigem}`} · SEI {r.documentoSei} · {formatDate(r.registradoEm)}</span>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{l.adesao.dataAprovacaoAnalise ? formatDate(l.adesao.dataAprovacaoAnalise) : '-'}</span>
            {l.situacao === 'A_CONFERIR' && <StatusBadge label="A conferir" variant="warning" size="sm" dot={false} />}
            {l.situacao === 'MESMO' && <StatusBadge label="Mesmo do remanejamento" variant="success" size="sm" dot={false} />}
          </div>
        );
      }
    }
  ];

  if (adesoesError) {
    return (
      <div>
        <ErrorState title="Não foi possível carregar as adesões" message={adesoesError} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} data-testid="adesoes-tab">
      {!adesoesLoading && origem === 'COPIA' && copiadoEm && (
        <NoticeBar tone="info" testId="adesoes-copia">
          O Compras.gov.br não respondeu agora.{' '}
          {adesoes.length > 0
            ? `A lista abaixo é a última cópia guardada, lida em ${formatDataHoraBR(copiadoEm)}.`
            : `Na última leitura, em ${formatDataHoraBR(copiadoEm)}, o item não tinha adesões.`}
        </NoticeBar>
      )}
      {semDados && (
        <NoticeBar tone="warning" testId="adesoes-sem-dados">
          O Compras.gov.br não respondeu e ainda não há cópia guardada das adesões deste item: não dá para saber se houve carona. Tente Atualizar mais tarde.
        </NoticeBar>
      )}
      {!semDados && <SummaryBar
        testId="adesoes-summary"
        loading={adesoesLoading}
        loadingLabel="Consultando adesões de carona no Compras.gov..."
        items={[
          { label: 'Aprovado', value: `${formatNumber(totalAdesaoAprovada)} de ${formatNumber(limiteAdesao)}` },
          ...(totalRemanejado > 0
            ? [{ label: 'Remanejado a não participantes', value: formatNumber(totalRemanejado), unit: 'incluído no aprovado' }]
            : []),
          {
            label: 'Saldo para adesões',
            value: `${formatNumber(saldoAdesoes)} (${formatCurrency(saldoAdesoes * item.valorUnitario)})`,
            tone: 'success'
          },
          ...(semQuantidade > 0
            ? [{ label: 'Sem quantidade informada', value: formatNumber(semQuantidade), unit: semQuantidade === 1 ? 'adesão' : 'adesões', tone: 'warning' as const }]
            : [])
        ]}
        progress={{ value: totalAdesaoAprovada, max: limiteAdesao || 1 }}
      />}

      {quantitativos && itemKey && <AdesoesAConferirAviso itemKey={itemKey} adesoes={adesoes} quantitativos={quantitativos} nomeDe={nomeDe} podeDecidir={podeDecidir} />}

      <div>
        <SectionHeader
          title="Adesões e caronas"
          subtitle="Órgãos não participantes que aderiram à ata ou receberam remanejamento (Art. 86 da Lei 14.133/2021): até 50% do quantitativo do item por órgão e 200% no total da ata."
          icon={<Share2 size={16} />}
          countBadge={semDados ? undefined : linhas.length}
        />
        {semDados ? (
          <EmptyState title="Nenhuma adesão para mostrar" description="" icon={<Share2 size={36} color="#94a3b8" />} />
        ) : !adesoesLoading && linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma carona externa registrada"
            description={`Nenhum órgão não participante teve adesão aprovada para o Item ${item.numeroItem} no Compras.gov.br.`}
            icon={<Share2 size={36} color="#94a3b8" />}
          />
        ) : (
          <DataTable
            columns={columns}
            data={linhas}
            keyExtractor={(l, idx) => (l.tipo === 'ADESAO' ? `ade-${l.adesao.unidadeNaoParticipante}-${idx}` : `rem-${l.remanejamento.id}`)}
            isLoading={adesoesLoading}
            testId="adesoes-table"
          />
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { Share2 } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate } from './itemBalanceUtils';
import type { AdesaoItemRecord, ArpItemRecord } from '../../types';
import { DataTable, EmptyState, ErrorState, ProgressBar, SectionHeader, StatusBadge, SummaryBar, type Column } from '../../design-system';

export interface AdesoesTabProps {
  adesoesLoading: boolean;
  adesoesError: string | null;
  adesoes: AdesaoItemRecord[];
  item: ArpItemRecord;
  /** Soma das quantidades aprovadas nas adesões. */
  totalAdesaoAprovada: number;
  /** Teto de adesões do item (maximoAdesao, limite da gerenciadora ou 2× o homologado). */
  limiteAdesao: number;
}

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
  limiteAdesao
}) => {
  const saldoAdesoes = Math.max(0, limiteAdesao - totalAdesaoAprovada);
  const semQuantidade = adesoes.filter((a) => a.quantidadeAprovadaAdesao == null).length;
  const quantidadeItem = Number(item.quantidadeHomologadaItem) || 0;

  const ordenadas = [...adesoes].sort((a, b) =>
    (b.dataAprovacaoAnalise || '').localeCompare(a.dataAprovacaoAnalise || '')
  );

  const columns: Column<AdesaoItemRecord>[] = [
    {
      key: 'orgao',
      header: 'Órgão não participante',
      sortValue: (ade) => splitUnidade(ade.unidadeNaoParticipante).nome,
      render: (ade) => {
        const { codigo, nome } = splitUnidade(ade.unidadeNaoParticipante);
        return (
          <>
            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{nome || 'Órgão não informado'}</div>
            {codigo && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>UASG: {codigo}</div>}
          </>
        );
      }
    },
    {
      key: 'aprovada',
      header: 'Qtd. aprovada',
      sortValue: (ade) => ade.quantidadeAprovadaAdesao,
      sortFirstDir: 'desc',
      align: 'right',
      render: (ade) =>
        ade.quantidadeAprovadaAdesao == null ? (
          <StatusBadge label="Não informada" variant="warning" size="sm" dot={false} />
        ) : (
          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatNumber(ade.quantidadeAprovadaAdesao)} un</span>
        )
    },
    {
      // Art. 86, § 4º: cada órgão não participante pode aderir a até 50% do quantitativo do item.
      key: 'percentual',
      header: 'Do item (máx. 50%)',
      sortValue: (ade) => (ade.quantidadeAprovadaAdesao == null || quantidadeItem <= 0 ? null : ade.quantidadeAprovadaAdesao / quantidadeItem),
      sortFirstDir: 'desc',
      width: '200px',
      render: (ade) => {
        if (ade.quantidadeAprovadaAdesao == null || quantidadeItem <= 0) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
        const perc = (ade.quantidadeAprovadaAdesao / quantidadeItem) * 100;
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
      sortValue: (ade) => ade.dataAprovacaoAnalise,
      sortFirstDir: 'desc',
      render: (ade) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {ade.dataAprovacaoAnalise ? formatDate(ade.dataAprovacaoAnalise) : '-'}
        </span>
      )
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
      <SummaryBar
        testId="adesoes-summary"
        loading={adesoesLoading}
        loadingLabel="Consultando adesões de carona no Compras.gov..."
        items={[
          { label: 'Aprovado', value: `${formatNumber(totalAdesaoAprovada)} de ${formatNumber(limiteAdesao)}` },
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
      />

      <div>
        <SectionHeader
          title="Adesões e caronas"
          subtitle="Órgãos não participantes que aderiram à ata (Art. 86 da Lei 14.133/2021): até 50% do quantitativo do item por órgão e 200% no total da ata."
          icon={<Share2 size={16} />}
          countBadge={adesoes.length}
        />
        {!adesoesLoading && adesoes.length === 0 ? (
          <EmptyState
            title="Nenhuma carona externa registrada"
            description={`Nenhum órgão não participante teve adesão aprovada para o Item ${item.numeroItem} no Compras.gov.br.`}
            icon={<Share2 size={36} color="#94a3b8" />}
          />
        ) : (
          <DataTable
            columns={columns}
            data={ordenadas}
            keyExtractor={(ade, idx) => `ade-${ade.unidadeNaoParticipante}-${idx}`}
            isLoading={adesoesLoading}
            testId="adesoes-table"
          />
        )}
      </div>
    </div>
  );
};

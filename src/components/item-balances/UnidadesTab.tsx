import React from 'react';
import { Users } from 'lucide-react';
import { DataTable, EmptyState, ErrorState, ProgressBar, SectionHeader, StatusBadge, SummaryBar, type Column } from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import { summarizeParticipantes, type ParticipanteRow } from '../../utils/participantesSummary';
import type { UnidadeItemRecord } from '../../types';

export interface UnidadesTabProps {
  loading: boolean;
  error: string | null;
  sortedUnidades: UnidadeItemRecord[];
  /** UASG gerenciadora da ata. */
  ugUasg: string;
  /** Contratado nos contratos vinculados ao item (consumo do órgão gerenciador). */
  contratadoUG: number;
}

const FONTE_LABEL = { CONTRATOS: 'contratos vinculados', COMPRASGOV: 'Compras.gov' } as const;

export const UnidadesTab: React.FC<UnidadesTabProps> = ({ loading, error, sortedUnidades, ugUasg, contratadoUG }) => {
  const summary = summarizeParticipantes(sortedUnidades, { ugUasg, contratadoUG });
  const { senasp } = summary;

  const columns: Column<ParticipanteRow>[] = [
    {
      key: 'orgao',
      header: 'Órgão',
      render: (r) => (
        <>
          <div style={{ fontWeight: 700 }}>{r.nome}</div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.15rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>UASG {r.codigo}</span>
            <StatusBadge label={r.gerenciadora ? 'Gerenciadora' : 'Participante'} variant={r.gerenciadora ? 'info' : 'neutral'} size="sm" dot={false} />
          </div>
        </>
      )
    },
    {
      key: 'registrado',
      header: 'Registrado',
      align: 'right',
      render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.registrado)}</span>
    },
    {
      key: 'consumido',
      header: 'Consumido',
      align: 'right',
      render: (r) => (
        <>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.consumido)}</span>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{FONTE_LABEL[r.fonte]}</div>
        </>
      )
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: r.saldo < 0 ? 'var(--danger)' : 'var(--success)' }}>
          {formatNumber(r.saldo)}
        </span>
      )
    },
    {
      key: 'consumo',
      header: 'Consumo',
      width: '180px',
      render: (r) => <ProgressBar value={r.consumido} max={r.registrado || 1} height="6px" testId={`consumo-${r.codigo}`} />
    }
  ];

  if (error) {
    return (
      <div>
        <ErrorState title="Não foi possível carregar os órgãos participantes" message={error} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} data-testid="unidades-tab">
      <SummaryBar
        testId="unidades-summary"
        loading={loading}
        loadingLabel="Buscando os órgãos participantes no Compras.gov..."
        items={[
          {
            label: 'Consumido SENASP',
            value: `${formatNumber(senasp.consumido)} de ${formatNumber(senasp.registrado)} (${formatNumber(senasp.registrado > 0 ? (senasp.consumido / senasp.registrado) * 100 : 0)}%)`
          },
          { label: 'Saldo SENASP', value: formatNumber(senasp.saldo), tone: senasp.saldo < 0 ? 'danger' : 'default' },
          { label: 'Ata completa', value: `${formatNumber(summary.registrado)} registrados` }
        ]}
        progress={{ value: senasp.consumido, max: senasp.registrado || 1 }}
      />

      <div>
        <SectionHeader
          title="Órgãos participantes"
          subtitle="Quantitativo registrado por órgão; a régua acima considera só o quantitativo SENASP (UASGs 200330 e 200331). O gerenciador consome o contratado nos contratos vinculados; os demais, o que o Compras.gov registra."
          icon={<Users size={16} />}
          countBadge={summary.rows.length}
        />
        {!loading && summary.rows.length === 0 ? (
          <EmptyState title="Nenhum órgão encontrado" description="O Compras.gov não devolveu os órgãos deste item." />
        ) : (
          <DataTable columns={columns} data={summary.rows} keyExtractor={(r) => r.codigo} isLoading={loading} testId="unidades-table" />
        )}
      </div>
    </div>
  );
};

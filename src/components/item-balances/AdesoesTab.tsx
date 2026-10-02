import React from 'react';
import { Share2 } from 'lucide-react';
import { formatNumber, formatCurrency, formatDate } from './itemBalanceUtils';
import type { AdesaoItemRecord, ArpItemRecord } from '../../types';
import { AppCard, DataTable, EmptyState, ProgressBar, SectionHeader, StatusBadge, type Column } from '../../design-system';

export interface AdesoesTabProps {
  adesoesLoading: boolean;
  adesoesError: string | null;
  adesoes: AdesaoItemRecord[];
  item: ArpItemRecord;
  totalAdesaoRegistrada: number;
  totalAdesaoEmpenhada: number;
  totalAdesaoSaldo: number;
  adesaoConsumidaPercent: number;
}

export const AdesoesTab: React.FC<AdesoesTabProps> = ({
  adesoesLoading,
  adesoesError,
  adesoes,
  item,
  totalAdesaoRegistrada,
  totalAdesaoEmpenhada,
  totalAdesaoSaldo,
  adesaoConsumidaPercent
}) => {
  const maximoAdesaoPermitido = item.maximoAdesao || (item.quantidadeHomologadaItem * 2);
  const percentAdesaoRegistrada = Math.min((totalAdesaoRegistrada / (maximoAdesaoPermitido || 1)) * 100, 100);
  const saldoNaoEmpenhado = totalAdesaoSaldo || (totalAdesaoRegistrada - totalAdesaoEmpenhada);

  const columns: Column<AdesaoItemRecord>[] = [
    {
      key: 'orgao',
      header: 'Órgão Não Participante (Carona)',
      render: (ade) => (
        <>
          <div style={{ fontWeight: 700, color: '#0c326f' }}>
            {ade.orgaoAdesao || (ade.unidade ? `UASG ${ade.unidade}` : 'Órgão Solicitante')}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{ade.unidade ? `UASG: ${ade.unidade}` : ''}</div>
        </>
      )
    },
    {
      key: 'tipo',
      header: 'Tipo de Vínculo',
      render: (ade) => <StatusBadge label={ade.tipo || 'NÃO PARTICIPANTE (CARONA)'} variant="info" size="sm" dot={false} />
    },
    {
      key: 'registrada',
      header: 'Qtd. Concedida / Registrada',
      render: (ade) => <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatNumber(ade.quantidadeRegistrada || 0)} un</span>
    },
    {
      key: 'empenhada',
      header: 'Qtd. Empenhada',
      width: '220px',
      render: (ade) => {
        const empQtd = ade.quantidadeEmpenhada || 0;
        const regQtd = ade.quantidadeRegistrada || 0;
        const consPerc = regQtd > 0 ? (empQtd / regQtd) * 100 : 0;
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '0.2rem' }}>
              <span style={{ fontWeight: 700 }}>{formatNumber(empQtd)}</span>
              <span style={{ color: 'var(--text-muted)' }}>{formatNumber(consPerc)}%</span>
            </div>
            <ProgressBar value={consPerc} showPercent={false} height="6px" testId="adesao-empenho-progress" />
          </>
        );
      }
    },
    {
      key: 'saldo',
      header: 'Saldo p/ Empenho',
      render: (ade) => {
        const saldoQtd = ade.saldoEmpenho ?? ((ade.quantidadeRegistrada || 0) - (ade.quantidadeEmpenhada || 0));
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: saldoQtd > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {formatNumber(saldoQtd)} un
          </span>
        );
      }
    },
    {
      key: 'data',
      header: 'Data do Registro',
      render: (ade) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {ade.dataHoraInclusao ? formatDate(ade.dataHoraInclusao) : ade.dataHoraAtualizacao ? formatDate(ade.dataHoraAtualizacao) : '-'}
        </span>
      )
    }
  ];

  const Resumo: React.FC<{ label: string; value: string; unit?: string; tone?: string }> = ({ label, value, unit = 'un', tone }) => (
    <span>
      {label} <strong style={{ color: tone }}>{value}</strong> <span style={{ color: 'var(--text-muted)' }}>{unit}</span>
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 1rem' }} data-testid="adesoes-tab">
      <div>
        <SectionHeader
          title="Adesões e caronas"
          subtitle="Órgãos não participantes que aderiram à ata (Art. 86 da Lei 14.133/2021): até 50% do quantitativo do item por órgão e 200% no total da ata."
          icon={<Share2 size={16} />}
          countBadge={adesoes.length}
          actions={<StatusBadge label="Compras.gov.br" variant="neutral" size="sm" dot={false} />}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', fontSize: '0.9rem' }} data-testid="adesoes-summary">
            <Resumo label="Autorizado" value={`${formatNumber(totalAdesaoRegistrada)} de ${formatNumber(maximoAdesaoPermitido)}`} />
            <Resumo label="Empenhado" value={`${formatNumber(totalAdesaoEmpenhada)} (${formatNumber(adesaoConsumidaPercent)}%)`} tone={totalAdesaoEmpenhada > 0 ? 'var(--warning)' : undefined} />
            <Resumo label="Saldo concedido" value={`${formatNumber(saldoNaoEmpenhado)} (${formatCurrency(saldoNaoEmpenhado * item.valorUnitario)})`} tone="var(--success)" unit="un" />
          </div>
          <ProgressBar value={percentAdesaoRegistrada} showPercent={false} height="6px" testId="adesao-total-progress" />
        </div>
      </div>

      {adesoesLoading ? (
        <div className="spinner-container" style={{ padding: '2rem' }}>
          <div className="spinner spinner-glow"></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Consultando adesões de carona no Compras.gov.br...</p>
        </div>
      ) : adesoes.length === 0 ? (
        <AppCard variant="default" padding="md">
          <EmptyState
            title="Nenhuma carona externa registrada"
            description={adesoesError || `Nenhum órgão não participante solicitou ou teve autorização de adesão registrada para o Item ${item.numeroItem} no módulo oficial do Compras.gov.br.`}
            icon={<Share2 size={36} color="#94a3b8" />}
          />
        </AppCard>
      ) : (
        <DataTable
          columns={columns}
          data={adesoes}
          keyExtractor={(ade, idx) => `ade-${ade.unidade}-${idx}`}
          testId="adesoes-table"
        />
      )}
    </div>
  );
};

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { fetchFaturasDoContrato, type FaturaDoContrato } from '../../services/faturasService';
import { DataTable, EmptyState, ErrorState, NoticeBar, StatusBadge, SummaryBar, type Column } from '../../design-system';

interface ContractFaturasSectionProps {
  contractKey: string;
}

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const dataBR = (v?: string | null) => {
  if (!v) return '—';
  const [a, m, d] = v.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : v;
};

const dataHora = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Etapa da fatura: cancelada, paga (OB válida ou "Pago"), liquidada aguardando OB ou em andamento. */
function etapa(f: FaturaDoContrato): { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' | 'danger' } {
  if (f.cancelada) return { label: 'Cancelada', variant: 'neutral' };
  if (f.paga) return { label: 'Paga', variant: 'success' };
  if (f.dataLiquidacao) return { label: 'Liquidada', variant: 'info' };
  if (f.situacao === 'Siafi Erro') return { label: 'Erro no SIAFI', variant: 'danger' };
  return { label: f.situacao || 'Em andamento', variant: 'warning' };
}

export const FATURAS_DO_CONTRATO_QUERY_KEY = (contractKey: string) => ['contrato-faturas', contractKey] as const;

/**
 * Faturas do contrato no Contratos.gov.br, com a liquidação no SIAFI e a ordem bancária da NP no Tesouro.
 * Lê só o que está gravado (migration 83); quem atualiza é a sincronização do servidor.
 */
export const ContractFaturasSection: React.FC<ContractFaturasSectionProps> = ({ contractKey }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: FATURAS_DO_CONTRATO_QUERY_KEY(contractKey),
    queryFn: () => fetchFaturasDoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  if (isLoading) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="contract-faturas-loading" />;
  }
  if (isError) {
    return (
      <ErrorState
        title="Não foi possível ler as faturas do contrato"
        message="A consulta ao banco falhou. Isto não indica ausência de faturas."
        onRetry={() => refetch()}
        testId="contract-faturas-error"
      />
    );
  }

  const faturas = data?.faturas ?? [];
  const resumo = data?.resumo;
  if (faturas.length === 0 || !resumo) {
    return (
      <EmptyState
        icon={<FileText size={28} />}
        title={data?.sincronizadoEm ? 'O Contratos.gov.br não tem fatura para este contrato' : 'As faturas deste contrato ainda não foram consultadas'}
        description={
          data?.sincronizadoEm
            ? `Consulta feita em ${dataHora(data.sincronizadoEm)}.`
            : 'A sincronização do servidor lê as faturas dos contratos vigentes e dos vencidos há até 24 meses, de hora em hora.'
        }
        testId="contract-faturas-empty"
      />
    );
  }

  const comNeSemVinculo = faturas.filter((f) => f.empenhosSemVinculo > 0);
  const nesSemVinculo = [...new Set(comNeSemVinculo.flatMap((f) => (f.empenhosSemVinculoNumeros ?? '').split(', ').filter(Boolean)))];
  const npCompartilhada = faturas.filter((f) => !f.cancelada && f.npContratos > 1).length;

  const columns: Column<FaturaDoContrato>[] = [
    {
      key: 'numero',
      header: 'Fatura',
      priority: 'primary',
      sortValue: (f) => f.numero,
      render: (f) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <strong>{f.numero || f.idFatura}</strong>
          {f.referencia && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ref. {f.referencia}</span>}
        </div>
      )
    },
    { key: 'valor', header: 'Valor', align: 'right', sortValue: (f) => f.valor, sortFirstDir: 'desc', render: (f) => moeda(f.valor) },
    { key: 'liquidacao', header: 'Liquidação', sortValue: (f) => f.dataLiquidacao, sortFirstDir: 'desc', render: (f) => dataBR(f.dataLiquidacao) },
    {
      key: 'etapa',
      header: 'Situação',
      sortValue: (f) => etapa(f).label,
      render: (f) => {
        const e = etapa(f);
        return <StatusBadge label={e.label} variant={e.variant} size="sm" dot={false} />;
      }
    },
    {
      key: 'np',
      header: 'NP',
      sortValue: (f) => f.np,
      render: (f) =>
        f.np ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span>{f.np}</span>
            {f.npContratos > 1 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>paga também outros {f.npContratos - 1} contrato(s)</span>
            )}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )
    },
    {
      key: 'ob',
      header: 'Ordem bancária',
      sortValue: (f) => f.obEmissao,
      sortFirstDir: 'desc',
      render: (f) =>
        f.ordensBancarias ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span>{f.ordensBancarias}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dataBR(f.obEmissao)}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>{f.dataLiquidacao && !f.cancelada ? 'aguardando' : '—'}</span>
        )
    },
    { key: 'empenhos', header: 'Empenho', render: (f) => f.empenhos || <span style={{ color: 'var(--text-muted)' }}>—</span> }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {data?.sincronizadoEm && (
        <span data-testid="contract-faturas-sincronizado" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Faturas consultadas no Contratos.gov.br em {dataHora(data.sincronizadoEm)}; ordens bancárias do Tesouro (STA).
        </span>
      )}
      {nesSemVinculo.length > 0 && (
        <NoticeBar tone="warning" testId="contract-faturas-ne-sem-vinculo">
          {comNeSemVinculo.length === 1 ? '1 fatura cita' : `${comNeSemVinculo.length} faturas citam`} empenho que não está vinculado a este
          contrato no sistema: <strong>{nesSemVinculo.join(', ')}</strong>. Use Atualizar empenhos, no topo, e confira o contrato no
          Contratos.gov.br.
        </NoticeBar>
      )}
      <SummaryBar
        testId="contract-faturas-resumo"
        items={[
          { label: 'Faturado', value: moeda(resumo.valorFaturado), unit: '' },
          { label: 'Liquidado', value: moeda(resumo.valorLiquidado), unit: '' },
          { label: 'Pago', value: moeda(resumo.valorPago), unit: '', tone: 'success' },
          { label: 'Liquidadas aguardando OB', value: String(resumo.liquidadasSemPagamento), unit: '', tone: resumo.liquidadasSemPagamento > 0 ? 'warning' : 'default' }
        ]}
        progress={{ value: resumo.valorPago, max: resumo.valorFaturado, label: 'Pago do faturado' }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Pago é a soma das faturas cuja nota de pagamento tem ordem bancária válida, não o valor da OB: uma OB pode pagar faturas de
          vários contratos{npCompartilhada > 0 ? ` (${npCompartilhada} fatura(s) deste contrato estão nesse caso)` : ''}.
        </span>
      </SummaryBar>
      <DataTable
        columns={columns}
        data={faturas}
        keyExtractor={(f) => String(f.idFatura)}
        testId="contract-faturas-table"
      />
    </div>
  );
};

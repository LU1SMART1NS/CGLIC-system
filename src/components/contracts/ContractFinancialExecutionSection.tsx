import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Receipt } from 'lucide-react';
import { useAutoSyncContractEmpenhos } from '../../hooks/useAutoSyncContractEmpenhos';
import { useContractEmpenhoItemLinks } from '../../hooks/useContractEmpenhoItemLinks';
import { buildAtaItemPath } from '../../hooks/useAta';
import { formatItemKeyLabel, parseItemKey } from '../../utils/itemKeyParts';
import type { ContractEmpenhoItemLink } from '../../services/contractEmpenhoItemLinksService';
import type { ContractDashboardRecord } from '../../types';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';
import { AppButton, DataTable, EmptyState, ErrorState, NoticeBar, SectionHeader, StatusBadge, SummaryBar, type Column } from '../../design-system';

interface ContractFinancialExecutionSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
}

const formatCurrency = (val?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const parts = val.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(val).toLocaleDateString('pt-BR');
  } catch {
    return val;
  }
};

type EmpenhoRow = ReturnType<typeof useContractFinancialSummary>['empenhosList'][number];

/** Situação da quantidade do empenho nos itens da ata: pendente se algum item ainda espera confirmação. */
function quantidadeEstado(links: ContractEmpenhoItemLink[]): { label: string; variant: 'success' | 'info' | 'warning' } {
  if (links.some((l) => l.quantidade == null)) return { label: 'Pendente', variant: 'warning' };
  if (links.every((l) => l.fonte !== 'USUARIO')) return { label: 'Oficial', variant: 'success' };
  return { label: 'Confirmada', variant: 'info' };
}

function itemPath(itemKey: string): string | null {
  const p = parseItemKey(itemKey);
  return p ? `${buildAtaItemPath(p.numeroAta, p.uasg, parseInt(p.numeroItem, 10))}?aba=contratos` : null;
}

export const ContractFinancialExecutionSection: React.FC<ContractFinancialExecutionSectionProps> = ({
  contract,
  contractKey
}) => {
  const navigate = useNavigate();
  const { data: itemLinks = [] } = useContractEmpenhoItemLinks(contractKey);
  const linksByEmpenho = new Map<string, ContractEmpenhoItemLink[]>();
  for (const l of itemLinks) linksByEmpenho.set(l.empenhoId, [...(linksByEmpenho.get(l.empenhoId) ?? []), l]);
  const pendentes = itemLinks.filter((l) => l.quantidade == null);
  const empenhosUrl = `/empenhos?contractKey=${encodeURIComponent(contractKey)}`;

  // Empenhos de Contratos.gov/Compras.gov + v_empenhos_resumo, deduplicados por canonical_key
  const { empenhosList, summary: financialSummary, isLoading, isError, refetch } = useContractFinancialSummary(contract, contractKey);

  const { isSyncing } = useAutoSyncContractEmpenhos(contract, contractKey, {
    isLoading,
    isError,
    empenhosCount: empenhosList.length
  });

  if ((isLoading || isSyncing) && empenhosList.length === 0) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="contract-financial-loading" />;
  }

  if (isError && empenhosList.length === 0) {
    return (
      <ErrorState
        title="Indisponibilidade na consulta de dados financeiros"
        message="Não foi possível conectar aos serviços de consulta de empenhos oficiais neste momento. Isto não indica ausência de empenhos, mas uma indisponibilidade temporária de consulta."
        onRetry={() => refetch()}
        testId="contract-financial-error"
      />
    );
  }

  if (empenhosList.length === 0 || !financialSummary) {
    return (
      <EmptyState
        icon={<Receipt size={28} />}
        title="Nenhum empenho vinculado a este contrato"
        description="Nenhum empenho deste contrato está gravado no sistema. Use Atualizar empenhos, no topo, para buscar nas bases oficiais."
        action={
          <AppButton variant="outline" size="sm" icon={<ArrowRight size={14} />} onClick={() => navigate(empenhosUrl)}>
            Consultar em Empenhos
          </AppButton>
        }
        testId="contract-financial-empty"
      />
    );
  }

  const summary = financialSummary;
  const totalEmpenhado = summary.totalValorEmpenhadoGlobal;
  const totalLiquidado = summary.totalValorLiquidadoGlobal;
  const totalPago = summary.totalValorPagoGlobal;
  const pctPago = totalEmpenhado > 0 ? (totalPago / totalEmpenhado) * 100 : 0;
  const pctLiquidado = totalEmpenhado > 0 ? (totalLiquidado / totalEmpenhado) * 100 : 0;

  const linksOf = (e: EmpenhoRow) => (e.empenho_id ? linksByEmpenho.get(e.empenho_id) ?? [] : []);

  const columns: Column<EmpenhoRow>[] = [
    { key: 'numero', header: 'Empenho', priority: 'primary', render: (e) => <strong style={{ color: '#0c326f' }}>{e.numero_oficial || 'N/A'}</strong> },
    { key: 'credor', header: 'Credor', render: (e) => e.credor_nome || '—' },
    { key: 'data', header: 'Emissão', render: (e) => formatDate(e.data_emissao) },
    { key: 'empenhado', header: 'Empenhado', align: 'right', render: (e) => formatCurrency(e.valor_empenhado) },
    { key: 'liquidado', header: 'Liquidado', align: 'right', render: (e) => formatCurrency(e.valor_liquidado) },
    { key: 'pago', header: 'Pago', align: 'right', render: (e) => formatCurrency(e.valor_pago) },
    { key: 'saldo', header: 'Saldo a executar', align: 'right', render: (e) => formatCurrency(Math.max(0, e.valor_empenhado - e.valor_pago)) },
    {
      key: 'item',
      header: 'Item da ata',
      render: (e) => {
        const links = linksOf(e);
        if (links.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {links.map((l) => (
              <span key={l.itemKey}>{formatItemKeyLabel(l.itemKey)}</span>
            ))}
          </div>
        );
      }
    },
    {
      key: 'quantidade',
      header: 'Quantidade',
      render: (e) => {
        const links = linksOf(e);
        if (links.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const estado = quantidadeEstado(links);
        return <StatusBadge label={estado.label} variant={estado.variant} size="sm" dot={false} />;
      }
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {pendentes.length > 0 && (
        <NoticeBar testId="contract-financial-pending">
          <strong>{pendentes.length}</strong>{' '}
          {pendentes.length === 1 ? 'empenho com quantidade pendente' : 'empenhos com quantidade pendente'} de confirmação no item da ata. Use a seta da linha para abrir o item.
        </NoticeBar>
      )}
      <SummaryBar
        testId="contract-financial-summary"
        items={[
          { label: 'Empenhado', value: formatCurrency(totalEmpenhado), unit: '' },
          { label: 'Liquidado', value: `${formatCurrency(totalLiquidado)} (${pctLiquidado.toFixed(1)}%)`, unit: '' },
          { label: 'Pago', value: `${formatCurrency(totalPago)} (${pctPago.toFixed(1)}%)`, unit: '', tone: 'success' },
          { label: 'Saldo não executado', value: formatCurrency(summary.saldoNaoExecutadoGlobal), unit: '', tone: 'warning' }
        ]}
        progress={{ value: totalPago, max: totalEmpenhado, label: 'Pago do empenhado' }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          A liquidar <strong>{formatCurrency(summary.saldoALiquidarGlobal)}</strong> · A pagar <strong>{formatCurrency(summary.saldoAPagarGlobal)}</strong>
        </span>
      </SummaryBar>

      <div>
        <SectionHeader
          title="Notas de empenho vinculadas"
          icon={<Layers size={16} />}
          countBadge={empenhosList.length}
        />
        <DataTable
          columns={columns}
          data={empenhosList}
          keyExtractor={(e, i) => e.canonical_key || e.numero_oficial || String(i)}
          testId="contract-financial-table"
          rowActionsHeader="Ação"
          rowActions={(e) => {
            const pendente = linksOf(e).find((l) => l.quantidade == null);
            const path = pendente ? itemPath(pendente.itemKey) : null;
            if (!path) return null;
            return (
              <AppButton
                variant="outline"
                size="sm"
                icon={<ArrowRight size={15} />}
                onClick={() => navigate(path)}
                title="Confirmar a quantidade no item da ata"
              >
                <span className="payment-action-label">Confirmar quantidade</span>
              </AppButton>
            );
          }}
        />
      </div>
    </div>
  );
};

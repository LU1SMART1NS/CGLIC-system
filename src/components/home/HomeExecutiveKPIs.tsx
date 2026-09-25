import React from 'react';
import { FileText, Coins, TrendingUp, CreditCard } from 'lucide-react';
import { KpiCard } from '../../design-system/components/KpiCard';
import type {
  ManagementDashboardExecutiveKPIs,
  ManagementDashboardFinancialSummary
} from '../../types/managementDashboard';

interface HomeExecutiveKPIsProps {
  executive?: ManagementDashboardExecutiveKPIs;
  financial?: ManagementDashboardFinancialSummary;
  loading?: boolean;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const HomeExecutiveKPIs: React.FC<HomeExecutiveKPIsProps> = ({
  executive,
  financial,
  loading = false
}) => {
  const totalContratos = executive?.totalContratos || 0;
  const contratosAtivos = executive?.contratosAtivos || 0;
  const valorVigente = executive?.valorVigenteTotal || 0;
  const deltaAcumulado = executive?.deltaAcumuladoTotal || 0;
  const varPercentual = executive?.percentualVariacaoAcumulada || 0;
  const taxaPagamento = financial?.taxaPagamentoPercentual || 0;
  const totalPago = financial?.totalPago || 0;

  const deltaFormatted = `${deltaAcumulado >= 0 ? '+' : ''}${formatCurrency(deltaAcumulado)}`;
  const varFormatted = `${varPercentual >= 0 ? '+' : ''}${varPercentual.toFixed(1)}%`;

  return (
    <section aria-label="KPIs Executivos da Gestão">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* KPI 1: Contratos Ativos */}
        <KpiCard
          title="Contratos Ativos"
          value={loading ? '—' : contratosAtivos}
          description={`de ${totalContratos} contratos cadastrados`}
          icon={<FileText size={20} />}
          isLoading={loading}
          variant="primary"
        />

        {/* KPI 2: Valor Vigente Global */}
        <KpiCard
          title="Valor Vigente Global"
          value={loading ? '—' : formatCurrency(valorVigente)}
          description="Volume financeiro sob gestão direta"
          icon={<Coins size={20} />}
          isLoading={loading}
          variant="default"
        />

        {/* KPI 3: Variação Contratual Acumulada */}
        <KpiCard
          title="Variação Contratual (Delta)"
          value={loading ? '—' : deltaFormatted}
          description={`${varFormatted} em aditivos e apostilamentos`}
          icon={<TrendingUp size={20} />}
          isLoading={loading}
          variant={deltaAcumulado > 0 ? 'info' : 'default'}
        />

        {/* KPI 4: Execução Financeira Oficial */}
        <KpiCard
          title="Execução Financeira (Pago)"
          value={loading ? '—' : `${taxaPagamento.toFixed(1)}%`}
          description={`${formatCurrency(totalPago)} pagos via SIAFI`}
          icon={<CreditCard size={20} />}
          isLoading={loading}
          variant="success"
        />
      </div>
    </section>
  );
};

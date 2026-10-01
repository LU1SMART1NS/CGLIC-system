import React from 'react';
import type { ContractDashboardRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { buildContractLifeline } from '../../services/contractLifelineService';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { HealthTile, HealthTileGrid, LifelineBar, PendenciasTile } from '../instrument360/HealthStripParts';

interface ContractHealthStripProps {
  contract: ContractDashboardRecord;
  contractKey: string;
  counts: Record<SeverityLevel, number>;
  onOpenActions: () => void;
  onOpenFinanceiro: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

function formatCnpj(cnpj?: string): string {
  const digits = (cnpj || '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return cnpj || '';
}

/**
 * Indicadores e linha da vida do Contrato 360 — conteúdo do cartão único do
 * topo (Instrument360Hero), com as mesmas peças da Ata 360.
 */
export const ContractHealthStrip: React.FC<ContractHealthStripProps> = ({ contract, contractKey, counts, onOpenActions, onOpenFinanceiro }) => {
  const lifeline = React.useMemo(() => buildContractLifeline(contract), [contract]);
  const financial = useContractFinancialSummary(contract, contractKey);

  const valorGlobal = contract.valorGlobal || contract.valorInicial || 0;
  const acrescimoPct =
    contract.valorInicial && contract.valorGlobal && contract.valorInicial > 0
      ? ((contract.valorGlobal - contract.valorInicial) / contract.valorInicial) * 100
      : 0;
  const valorHint =
    Math.abs(acrescimoPct) > 0.05
      ? `inicial ${formatCurrencyCompact(contract.valorInicial || 0)} · ${acrescimoPct > 0 ? '+' : ''}${acrescimoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em aditivos`
      : 'sem aditivos de valor';

  const totalPago = financial.summary?.totalValorPagoGlobal ?? 0;
  const pagoValue = financial.isLoading && !financial.summary
    ? '…'
    : financial.summary && valorGlobal > 0
    ? `${Math.round((totalPago / valorGlobal) * 100)}%`
    : '—';
  const pagoHint = financial.summary && valorGlobal > 0
    ? `${formatCurrency(totalPago)} de ${formatCurrency(valorGlobal)}`
    : financial.isLoading
    ? 'Carregando empenhos'
    : 'Sem empenhos vinculados';

  return (
    <div data-testid="contract-health-strip">
      <HealthTileGrid>
        <HealthTile label="Valor global" value={formatCurrencyCompact(valorGlobal)} hint={valorHint} testId="health-valor" />
        <HealthTile label="Pago do valor global" value={pagoValue} hint={pagoHint} onClick={onOpenFinanceiro} testId="health-pago" />
        <HealthTile
          label="Fornecedor"
          value={contract.fornecedorNome || 'Não informado'}
          hint={contract.fornecedorCnpjCpf ? `CNPJ ${formatCnpj(contract.fornecedorCnpjCpf)}` : undefined}
          compact
          testId="health-fornecedor"
        />
        <PendenciasTile counts={counts} onClick={onOpenActions} testId="health-pendencias" />
      </HealthTileGrid>

      <LifelineBar lifeline={lifeline} testId="contract-lifeline" />
    </div>
  );
};

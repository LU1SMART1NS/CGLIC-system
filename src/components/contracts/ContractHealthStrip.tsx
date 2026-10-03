import React from 'react';
import type { ContractDashboardRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { buildContractLifeline } from '../../services/contractLifelineService';
import { getContractDaysRemaining } from '../../services/dashboardService';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';
import { useContractEvents } from '../../hooks/useContractEvents';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { HealthTile, HealthTileGrid, LifelineRule, PendenciasTile } from '../instrument360/HealthStripParts';
import { vigenciaTile } from '../atas/Ata360Header';

interface ContractHealthStripProps {
  contract: ContractDashboardRecord;
  contractKey: string;
  counts: Record<SeverityLevel, number>;
  onOpenActions: () => void;
  onOpenFinanceiro: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

/** "Sim"/"Não" do Contratos.gov.br (`prorrogavel`); ausente ou diferente disso não vira dica. */
function prorrogavelHint(raw: unknown): string | null {
  const value = typeof (raw as { prorrogavel?: unknown } | undefined)?.prorrogavel === 'string' ? String((raw as { prorrogavel: string }).prorrogavel) : '';
  if (/^s/i.test(value)) return 'prorrogável: sim';
  if (/^n/i.test(value)) return 'prorrogável: não';
  return null;
}

/**
 * Indicadores do Contrato 360, dentro do cartão único do topo (Instrument360Hero): prazo com a régua
 * (e os termos do histórico), valor global, financeiro e pendências.
 */
export const ContractHealthStrip: React.FC<ContractHealthStripProps> = ({ contract, contractKey, counts, onOpenActions, onOpenFinanceiro }) => {
  const { data: eventos } = useContractEvents(contract);
  const lifeline = React.useMemo(() => buildContractLifeline(contract, undefined, eventos), [contract, eventos]);
  const financial = useContractFinancialSummary(contract, contractKey);

  const dias = getContractDaysRemaining(contract.dataVigenciaFim);
  const expirado = contract.statusVigencia === 'Expirado';
  const faixa = classifyPrazo(dias, expirado);
  const prazo = vigenciaTile(faixa, dias);
  const prazoHint =
    dias !== null && dias < 0 ? `encerrado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}` : prorrogavelHint(contract.raw);

  const valorGlobal = contract.valorGlobal || contract.valorInicial || 0;
  const variacaoPct =
    contract.valorInicial && contract.valorGlobal && contract.valorInicial > 0
      ? ((contract.valorGlobal - contract.valorInicial) / contract.valorInicial) * 100
      : 0;
  const valorHint =
    Math.abs(variacaoPct) > 0.05
      ? `inicial ${formatCurrencyCompact(contract.valorInicial || 0)} · ${variacaoPct > 0 ? '+' : ''}${variacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% desde o início`
      : 'igual ao valor inicial';

  const totalPago = financial.summary?.totalValorPagoGlobal ?? 0;
  const totalEmpenhado = financial.summary?.totalValorEmpenhadoGlobal ?? 0;
  const pagoValue = financial.isLoading && !financial.summary
    ? '…'
    : financial.summary && valorGlobal > 0
    ? `${Math.round((totalPago / valorGlobal) * 100)}% pago`
    : '—';
  const financeiroHint: string | string[] = financial.summary && valorGlobal > 0
    ? [`${formatCurrency(totalPago)} pagos`, `empenhado ${formatCurrencyCompact(totalEmpenhado)}`]
    : financial.isLoading
    ? 'Carregando empenhos'
    : 'Sem empenhos vinculados';

  return (
    <div data-testid="contract-health-strip">
      <HealthTileGrid columns={5}>
        <HealthTile
          wide
          label="Prazo"
          value={prazo.value}
          hint={prazoHint ?? undefined}
          tone={prazo.tone}
          badge={prazo.badge}
          onClick={onOpenActions}
          testId="health-prazo"
        >
          <LifelineRule lifeline={lifeline} testId="contract-lifeline" tone={prazo.tone} />
        </HealthTile>
        <HealthTile label="Valor global" value={formatCurrencyCompact(valorGlobal)} hint={valorHint} testId="health-valor" />
        <HealthTile label="Financeiro" value={pagoValue} hint={financeiroHint} onClick={onOpenFinanceiro} testId="health-pago" />
        <PendenciasTile counts={counts} onClick={onOpenActions} testId="health-pendencias" />
      </HealthTileGrid>
    </div>
  );
};

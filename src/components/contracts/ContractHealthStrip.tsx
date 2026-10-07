import React from 'react';
import type { ContractDashboardRecord } from '../../types';
import type { SeverityLevel } from '../../design-system/tokens';
import { contarTermosDeValor, parseValorBR } from '../../services/contractHistoricoService';
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
 * (e os termos do histórico), valor atual, financeiro e pendências.
 */
export const ContractHealthStrip: React.FC<ContractHealthStripProps> = ({ contract, contractKey, counts, onOpenActions, onOpenFinanceiro }) => {
  const { data: dadosEventos } = useContractEvents(contract);
  const eventos = dadosEventos?.eventos;
  const lifeline = React.useMemo(() => buildContractLifeline(contract, undefined, eventos), [contract, eventos]);
  const financial = useContractFinancialSummary(contract, contractKey);

  const dias = getContractDaysRemaining(contract.dataVigenciaFim);
  const expirado = contract.statusVigencia === 'Expirado';
  const faixa = classifyPrazo(dias, expirado);
  const prazo = vigenciaTile(faixa, dias);
  const prazoHint =
    dias !== null && dias < 0 ? `encerrado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}` : prorrogavelHint(contract.raw);

  // Valor atual = `valor_global` do contrato; inicial = `valor_inicial`. A API não traz o valor de cada aditivo.
  const valorGlobal = contract.valorGlobal || contract.valorInicial || 0;
  const variacaoPct =
    contract.valorInicial && contract.valorGlobal && contract.valorInicial > 0
      ? ((contract.valorGlobal - contract.valorInicial) / contract.valorInicial) * 100
      : 0;
  const valorHints: string[] = [];
  if (contract.valorInicial) {
    valorHints.push(
      Math.abs(variacaoPct) > 0.05
        ? `inicial ${formatCurrencyCompact(contract.valorInicial)} · ${variacaoPct > 0 ? '+' : ''}${variacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
        : 'igual ao valor inicial'
    );
  }
  const termosValor = contarTermosDeValor(eventos);
  const partesTermos = [
    termosValor.apostilamentoValor > 0 ? `${termosValor.apostilamentoValor} ${termosValor.apostilamentoValor === 1 ? 'apostilamento' : 'apostilamentos'} de valor` : '',
    termosValor.acrescimoSupressao > 0 ? `${termosValor.acrescimoSupressao} ${termosValor.acrescimoSupressao === 1 ? 'termo' : 'termos'} de acréscimo/supressão` : '',
    termosValor.reajuste > 0 ? `${termosValor.reajuste} ${termosValor.reajuste === 1 ? 'reajuste' : 'reajustes'}` : ''
  ].filter(Boolean);
  if (partesTermos.length > 0) valorHints.push(partesTermos.join(' · '));
  const valorAcumulado = parseValorBR((contract.raw as { valor_acumulado?: unknown } | undefined)?.valor_acumulado);
  const valorTooltip =
    valorAcumulado && valorAcumulado > 0
      ? [...valorHints, `valor acumulado nas vigências: ${formatCurrency(valorAcumulado)}`].join(' · ')
      : undefined;

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
        <HealthTile label="Valor atual" value={formatCurrencyCompact(valorGlobal)} hint={valorHints} tooltip={valorTooltip} testId="health-valor" />
        <HealthTile label="Empenhos" value={pagoValue} hint={financeiroHint} onClick={onOpenFinanceiro} testId="health-pago" />
        <PendenciasTile counts={counts} onClick={onOpenActions} testId="health-pendencias" />
      </HealthTileGrid>
    </div>
  );
};

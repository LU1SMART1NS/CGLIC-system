import { useMemo } from 'react';
import type { ContractDashboardRecord } from '../types';
import { useContractDetails } from './useContractDetails';
import { useManagementDashboard } from './useManagementDashboard';
import { aggregateContractFinancialExecution } from '../services/financialExecutionService';

export interface NormalizedContractEmpenho {
  canonical_key: string;
  numero_oficial: string;
  credor_nome: string;
  data_emissao: string;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_rpinscrito: number;
  situacao: string;
}

export function prepareContractEmpenhosList(
  contract: Partial<ContractDashboardRecord>,
  detailsEmpenhos: any[] = [],
  dashboardEmpenhos: any[] = []
): NormalizedContractEmpenho[] {
  const rawEmpenhosFromDetails = (detailsEmpenhos || []).map((e) => ({
    canonical_key: e.canonical_key || `${contract.uasg || '200331'}-${e.ano || '2026'}-${e.numero_empenho || e.numeroEmpenho || e.numero || ''}`,
    numero_oficial: e.numero_oficial || e.numero_empenho || e.numeroEmpenho || e.numero || '',
    credor_nome: e.credor_nome || e.credor || e.fornecedor_nome || '',
    data_emissao: e.data_emissao || e.dataEmissao || '',
    valor_empenhado: Number(e.valor_empenhado ?? e.valorEmpenhado ?? e.valor ?? 0),
    valor_liquidado: Number(e.valor_liquidado ?? e.valorLiquidado ?? 0),
    valor_pago: Number(e.valor_pago ?? e.valorPago ?? 0),
    valor_rpinscrito: Number(e.valor_rpinscrito ?? 0),
    situacao: e.situacao || 'EMITIDO'
  }));

  const rawEmpenhosFromDashboard = (dashboardEmpenhos || []).map((e: any) => ({
    canonical_key: e.canonical_key || e.id || `${e.uasg || contract.uasg || '200331'}-${e.ano || '2026'}-${e.numero || ''}`,
    numero_oficial: e.numero_oficial || e.numero || '',
    credor_nome: e.credor_nome || e.credor || '',
    data_emissao: e.data_emissao || e.dataEmissao || '',
    valor_empenhado: Number(e.valor_empenhado ?? e.valor ?? 0),
    valor_liquidado: Number(e.valor_liquidado ?? 0),
    valor_pago: Number(e.valor_pago ?? 0),
    valor_rpinscrito: Number(e.valor_rpinscrito ?? 0),
    situacao: e.situacao || 'EMITIDO'
  }));

  // Mescla e deduplica por canonical_key (prevenção rigorosa contra double counting)
  const empenhoMap = new Map<string, NormalizedContractEmpenho>();
  for (const emp of [...rawEmpenhosFromDashboard, ...rawEmpenhosFromDetails]) {
    const key = emp.canonical_key || emp.numero_oficial;
    if (key && !empenhoMap.has(key)) {
      empenhoMap.set(key, emp);
    }
  }
  return Array.from(empenhoMap.values());
}

export function useContractFinancialSummary(contract: ContractDashboardRecord, contractKey: string) {
  const details = useContractDetails(contract, true);
  const dashboard = useManagementDashboard({ uasg: contract.uasg || '200331', contractKey });

  const empenhosList = useMemo(
    () => prepareContractEmpenhosList(contract, details.data?.empenhos, dashboard.readModel?.financial?.topEmpenhos),
    [contract, details.data?.empenhos, dashboard.readModel?.financial?.topEmpenhos]
  );

  const summary = useMemo(
    () => (empenhosList.length > 0 ? aggregateContractFinancialExecution(contractKey, empenhosList) : null),
    [contractKey, empenhosList]
  );

  return {
    empenhosList,
    summary,
    isLoading: details.isLoading || dashboard.isLoading,
    isError: Boolean((details.isError || dashboard.isError) && empenhosList.length === 0),
    refetch: () => {
      details.refetch();
      dashboard.refetch();
    }
  };
}

import { useMemo } from 'react';
import type { ContractDashboardRecord } from '../types';
import { useQuery } from '@tanstack/react-query';
import { fetchContractEmpenhosFromDb } from '../services/contractEmpenhosDbService';
import { aggregateContractFinancialExecution } from '../services/financialExecutionService';
import { normalizeFromContratosGov } from '../services/empenhoNormalizationService';
import type { ContratosGovEmpenhoRecord } from '../types';

export interface NormalizedContractEmpenho {
  /** UUID do empenho no banco; presente quando a linha vem do banco. */
  empenho_id?: string;
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
  const rawEmpenhosFromDetails = (detailsEmpenhos || []).map((e): NormalizedContractEmpenho => {
    // Registro cru do Contratos.gov (valores em texto "2.788,00"): passa pelo mesmo normalizador
    // da gravação, para o Financeiro mostrar os mesmos números e a mesma chave canônica do banco.
    if (e && 'empenhado' in e && 'numero' in e) {
      const n = normalizeFromContratosGov(
        { ...(e as ContratosGovEmpenhoRecord), unidade_gestora: (e as ContratosGovEmpenhoRecord).unidade_gestora || contract.uasg },
        { contractKey: contract.id }
      );
      return {
        canonical_key: n.canonical_key,
        numero_oficial: n.numero_oficial,
        credor_nome: n.credor_nome || '',
        data_emissao: n.data_emissao || '',
        valor_empenhado: n.valor_empenhado ?? 0,
        valor_liquidado: n.valor_liquidado ?? 0,
        valor_pago: n.valor_pago ?? 0,
        valor_rpinscrito: n.valor_rpinscrito ?? 0,
        situacao: 'EMITIDO'
      };
    }
    return {
      canonical_key: e.canonical_key || `${contract.uasg || '200331'}-${e.ano || '2026'}-${e.numero_empenho || e.numeroEmpenho || e.numero || ''}`,
      numero_oficial: e.numero_oficial || e.numero_empenho || e.numeroEmpenho || e.numero || '',
      credor_nome: e.credor_nome || e.credor || e.fornecedor_nome || '',
      data_emissao: e.data_emissao || e.dataEmissao || '',
      valor_empenhado: Number(e.valor_empenhado ?? e.valorEmpenhado ?? e.valor ?? 0),
      valor_liquidado: Number(e.valor_liquidado ?? e.valorLiquidado ?? 0),
      valor_pago: Number(e.valor_pago ?? e.valorPago ?? 0),
      valor_rpinscrito: Number(e.valor_rpinscrito ?? 0),
      situacao: e.situacao || 'EMITIDO'
    };
  });

  const rawEmpenhosFromDashboard = (dashboardEmpenhos || []).map((e: any) => ({
    empenho_id: e.empenho_id ? String(e.empenho_id) : undefined,
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

/**
 * Execução financeira do contrato, lida só do que está gravado no sistema (empenhos vinculados ao contrato,
 * vindos do "Atualizar" do Contrato ou da sincronização do Item). Não consulta a API ao vivo: o que a tela
 * mostra é o mesmo registro que o Item usa.
 */
export function useContractFinancialSummary(contract: ContractDashboardRecord, contractKey: string) {
  const query = useQuery({
    queryKey: ['contract-empenhos', contractKey],
    queryFn: () => fetchContractEmpenhosFromDb(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });

  const empenhosList = useMemo(
    () => prepareContractEmpenhosList(contract, [], query.data ?? []),
    [contract, query.data]
  );

  const summary = useMemo(
    () => (empenhosList.length > 0 ? aggregateContractFinancialExecution(contractKey, empenhosList) : null),
    [contractKey, empenhosList]
  );

  return {
    empenhosList,
    summary,
    isLoading: query.isLoading,
    isError: Boolean(query.isError && empenhosList.length === 0),
    refetch: () => {
      query.refetch();
    }
  };
}

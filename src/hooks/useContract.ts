import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchContratoParaTela, persistirContratoCompletado } from '../services/contratosOficiaisService';
import { podeSincronizarContratos } from './useSincronizacaoContratos';
import { CONTRACTS_GC_TIME_MS, CONTRACTS_STALE_TIME_MS, getContractsDashboardQueryOptions } from './useContractsDashboard';
import { useContratoGov } from './useContractContratosGov';
import { mesclarContratosGov } from '../services/contratosGovContratoService';
import { getContractManagementKey } from '../services/contractManagementService';
import { sementeDaCarteira } from './sementeDaCarteira';
import type { ContractDashboardRecord } from '../types';

/** Contratos completados já gravados nesta sessão (uma gravação por contrato). */
const completadosGravados = new Set<string>();

/** O contrato da chave (pela chave do sistema, pelo id ou pelo número de controle do PNCP), na mesma regra de sempre. */
export function acharContrato(contracts: readonly ContractDashboardRecord[], contractKey?: string): ContractDashboardRecord | null {
  const alvo = (contractKey || '').trim().toUpperCase();
  if (!alvo) return null;
  return (
    contracts.find((c) => {
      const key = c.id || getContractManagementKey(c.uasg, c.numero, c.ano);
      return (
        key.toUpperCase() === alvo ||
        (c.id && c.id.toUpperCase() === alvo) ||
        (c.numeroControlePncp && c.numeroControlePncp.toUpperCase() === alvo)
      );
    }) || null
  );
}

/**
 * Consulta de um contrato só. Fica sob o prefixo ['contracts-dashboard', uasg]: a sincronização e o "Atualizar", que
 * invalidam a lista, invalidam também este contrato.
 */
export function getContratoQueryOptions(uasg: string, contractKey: string) {
  const cleanUasg = (uasg || '').trim();
  const chave = (contractKey || '').trim().toUpperCase();
  return {
    queryKey: ['contracts-dashboard', cleanUasg, 'contrato', chave] as const,
    queryFn: (): Promise<ContractDashboardRecord[]> => fetchContratoParaTela(cleanUasg, chave),
    enabled: Boolean(cleanUasg && chave),
    staleTime: CONTRACTS_STALE_TIME_MS,
    gcTime: CONTRACTS_GC_TIME_MS,
    refetchOnWindowFocus: false
  };
}

/**
 * Hook canônico para recuperar um único contrato por sua chave identificadora (contractKey).
 *
 * Lê só este contrato do banco (antes lia a carteira inteira da UASG, ~4 MB, para mostrar um). Quem vem da Carteira de
 * Contratos ou do Início já tem a lista ['contracts-dashboard', uasg] no navegador: o contrato sai dela, sem pedido.
 *
 * Quando o registro veio só do Compras.gov.br (sem o id do Contratos.gov.br), completa com o contrato
 * aberto no Contratos.gov.br: assinatura, valor inicial, categoria e o id que libera fiscais, garantia e termos.
 * `enriching` fica verdadeiro enquanto essa consulta roda.
 */
export function useContract(contractKey?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();
  const queryClient = useQueryClient();
  const query = useQuery<ContractDashboardRecord[], Error>({
    ...getContratoQueryOptions(cleanUasg, contractKey || ''),
    ...sementeDaCarteira<ContractDashboardRecord[], ContractDashboardRecord[]>(
      queryClient,
      getContractsDashboardQueryOptions(cleanUasg).queryKey,
      (lista) => {
        const achado = acharContrato(lista, contractKey);
        return achado ? [achado] : undefined;
      }
    )
  });
  const { data: contracts = [], isLoading, isError, error, refetch } = query;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getContratoQueryOptions(cleanUasg, contractKey || '').queryKey });
  };

  const base: ContractDashboardRecord | null = acharContrato(contracts, contractKey);

  const { data: gov, isLoading: enriching } = useContratoGov(base);
  const contract = useMemo(() => (base && gov ? mesclarContratosGov(base, gov) : base), [base, gov]);

  // Grava o contrato completado no banco (gestor/coordenador), para o próximo usuário não repetir a consulta.
  const { role } = useAuth();
  const podeGravar = podeSincronizarContratos(role);
  useEffect(() => {
    if (!podeGravar || !base || !gov || !contract || completadosGravados.has(base.id)) return;
    completadosGravados.add(base.id);
    void persistirContratoCompletado(contract);
  }, [podeGravar, base, gov, contract]);

  return {
    contract,
    enriching,
    isLoading,
    isError,
    error,
    refetch,
    refresh
  };
}

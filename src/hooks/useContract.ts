import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { persistirContratoCompletado } from '../services/contratosOficiaisService';
import { podeSincronizarContratos } from './useSincronizacaoContratos';
import { useContractsDashboard } from './useContractsDashboard';
import { useContratoGov } from './useContractContratosGov';
import { mesclarContratosGov } from '../services/contratosGovContratoService';
import { getContractManagementKey } from '../services/contractManagementService';
import type { ContractDashboardRecord } from '../types';

/** Contratos completados já gravados nesta sessão (uma gravação por contrato). */
const completadosGravados = new Set<string>();

/**
 * Hook canônico para recuperar um único contrato por sua chave identificadora (contractKey).
 *
 * Arquitetura ("Digite uma vez, use em todo lugar"):
 * Reutiliza a mesma query cacheada do Dashboard de Contratos ['contracts-dashboard', uasg]
 * sem disparar requisições duplicadas ou criar novas rotas de API.
 *
 * Quando o registro veio só do Compras.gov.br (sem o id do Contratos.gov.br), completa com o contrato
 * aberto no Contratos.gov.br: assinatura, valor inicial, categoria e o id que libera fiscais, garantia e termos.
 * `enriching` fica verdadeiro enquanto essa consulta roda.
 */
export function useContract(contractKey?: string, uasg?: string) {
  const cleanUasg = (uasg || '').trim();
  const {
    data: contracts = [],
    isLoading,
    isError,
    error,
    refetch,
    refresh
  } = useContractsDashboard(cleanUasg);

  const normalizedTargetKey = (contractKey || '').trim().toUpperCase();

  const base: ContractDashboardRecord | null = contracts.find((c) => {
    if (!normalizedTargetKey) return false;
    const key = c.id || getContractManagementKey(c.uasg, c.numero, c.ano);
    return (
      key.toUpperCase() === normalizedTargetKey ||
      (c.id && c.id.toUpperCase() === normalizedTargetKey) ||
      (c.numeroControlePncp && c.numeroControlePncp.toUpperCase() === normalizedTargetKey)
    );
  }) || null;

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

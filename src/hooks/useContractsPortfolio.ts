import { useMemo } from 'react';
import { useContractsDashboard } from './useContractsDashboard';
import { useSincronizacaoContratos } from './useSincronizacaoContratos';
import { useAssignedManagementScope } from './useAssignedManagementScope';
import { useAllContractManagers } from './useAllContractManagers';
import { useManagementDashboard } from './useManagementDashboard';
import { useArpItemContractLinks } from './useAtaManagers';
import { classifyPrazo } from '../components/carteira/carteiraPrazo';
import { getContractDaysRemaining } from '../services/dashboardService';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import type { ContractPortfolioRow } from '../components/contracts/portfolio/ContractsPortfolioTable';
import type { DashboardAttentionItem } from '../types/managementDashboard';
import { chaveDoContrato } from '../utils/contractKeyUtils';

/** UASGs consolidadas — mesmo escopo já usado no Início (/instrumentos), para que os painéis reportem os mesmos números. */
const UASGS = UASGS_CGLIC;

/**
 * Carteira de Contratos das UASGs da CGLIC, no escopo do usuário: contratos enriquecidos com prazo,
 * gestor e pendências (Funil Único de Atenção). Mesmas consultas e parâmetros do Início, logo
 * mesmo cache do React Query. Fonte única para a Carteira de Contratos e a Central de Distribuição.
 */
export function useContractsPortfolio() {
  const dash200330 = useContractsDashboard(UASGS[0]);
  const dash200331 = useContractsDashboard(UASGS[1]);

  const allContracts = useMemo(
    () => [...(dash200330.data || []), ...(dash200331.data || [])],
    [dash200330.data, dash200331.data]
  );
  const isLoading = dash200330.isLoading || dash200331.isLoading;
  const sincronizacao = useSincronizacaoContratos();
  const isFetching = dash200330.isFetching || dash200331.isFetching || sincronizacao.sincronizando;
  /** A última sincronização de alguma UASG saiu incompleta: os números podem estar abaixo do real. */
  const isPartial = sincronizacao.incompleta;
  const error = (dash200330.error || dash200331.error) as Error | null;
  /**
   * Alguma UASG falhou e não tem leitura anterior: a carteira sairia pela metade (só a outra UASG) ou vazia,
   * então a tela mostra o erro. Com leitura anterior, o React Query mantém a lista boa e a tela segue.
   */
  const carteiraIncompleta = [dash200330, dash200331].some((dash) => Boolean(dash.error) && !dash.data);
  /** "Tentar novamente" do erro: relê do banco só as UASGs que falharam (não pede sincronização às fontes). */
  const tentarDeNovo = async () => {
    await Promise.all([dash200330, dash200331].filter((dash) => dash.error).map((dash) => dash.refetch()));
  };
  /** Data da última sincronização com as fontes oficiais; antes da primeira, a hora da consulta. */
  const dataUpdatedAt =
    sincronizacao.ultimoSucessoEm ?? (Math.max(dash200330.dataUpdatedAt || 0, dash200331.dataUpdatedAt || 0) || undefined);
  /** Coordenador: atualiza com as fontes oficiais. Demais perfis: relê o banco. */
  const refresh = sincronizacao.atualizar;

  const scope200330 = useAssignedManagementScope(UASGS[0]);
  const scope200331 = useAssignedManagementScope(UASGS[1]);
  const isLoadingScope = scope200330.isLoading || scope200331.isLoading;
  const assignedContractKeys = useMemo(() => {
    if (!scope200330.contractKeys && !scope200331.contractKeys) return undefined;
    return [...(scope200330.contractKeys || []), ...(scope200331.contractKeys || [])];
  }, [scope200330.contractKeys, scope200331.contractKeys]);

  const contracts = useMemo(() => {
    if (!assignedContractKeys) return allContracts;
    const scopedKeys = new Set(assignedContractKeys);
    return allContracts.filter((contract) => scopedKeys.has(contract.id));
  }, [allContracts, assignedContractKeys]);

  const managers200330 = useAllContractManagers(UASGS[0]);
  const managers200331 = useAllContractManagers(UASGS[1]);
  // Só consulta depois do escopo do gestor: a chave inclui o escopo, e consultar antes carregava tudo duas vezes.
  const mgmt200330 = useManagementDashboard(
    { uasg: UASGS[0], assignedContractKeys: scope200330.contractKeys, assignedAtaKeys: scope200330.ataKeys },
    { enabled: !scope200330.isLoading }
  );
  const mgmt200331 = useManagementDashboard(
    { uasg: UASGS[1], assignedContractKeys: scope200331.contractKeys, assignedAtaKeys: scope200331.ataKeys },
    { enabled: !scope200331.isLoading }
  );

  const gestorByContractKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const managers of [managers200330.data, managers200331.data]) {
      for (const [key, manager] of Object.entries(managers || {})) {
        if (manager?.gestorNome) map.set(key, manager.gestorNome);
      }
    }
    return map;
  }, [managers200330.data, managers200331.data]);

  /** Todos os alertas do Funil Único de Atenção das duas UASGs (de contratos e de atas). */
  const attentionItems = useMemo<DashboardAttentionItem[]>(
    () => [...(mgmt200330.readModel?.attention?.items || []), ...(mgmt200331.readModel?.attention?.items || [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mgmt200330.readModel, mgmt200331.readModel]
  );

  const pendenciasByContractKey = useMemo(() => {
    const map = new Map<string, DashboardAttentionItem[]>();
    for (const item of attentionItems) {
      if (!item.contractKey) continue;
      const list = map.get(item.contractKey) || [];
      list.push(item);
      map.set(item.contractKey, list);
    }
    return map;
  }, [attentionItems]);

  const contractsByKey = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);

  // Atas de origem de cada contrato: o vínculo é por item, então um contrato pode vir de 0, 1 ou várias atas.
  // Mesma consulta (e cache) do escopo do perfil gestor.
  const { data: ataLinks } = useArpItemContractLinks();
  const atasByContractKey = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const { ataKey, contractKey } of ataLinks || []) {
      const atas = map.get(contractKey) || new Set<string>();
      atas.add(ataKey);
      map.set(contractKey, atas);
    }
    return new Map([...map].map(([key, atas]) => [key, [...atas].sort()]));
  }, [ataLinks]);

  // Contratos enriquecidos com prazo, gestor e pendências (base única para cards, filtros e tabela).
  const rows = useMemo<ContractPortfolioRow[]>(() => {
    return contracts.map((contract) => {
      const contractKey = chaveDoContrato(contract);
      const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
      const faixa = classifyPrazo(diasRestantes, contract.statusVigencia === 'Expirado');
      return {
        contract,
        contractKey,
        diasRestantes,
        faixa,
        gestorNome: gestorByContractKey.get(contractKey),
        pendencias: pendenciasByContractKey.get(contractKey) || [],
        atas: atasByContractKey.get(contractKey) || []
      };
    });
  }, [contracts, gestorByContractKey, pendenciasByContractKey, atasByContractKey]);

  return {
    /** Contratos no escopo do usuário, enriquecidos. */
    rows,
    contractsByKey,
    attentionItems,
    hasAnyData: allContracts.length > 0,
    isLoading,
    isLoadingScope,
    isFetching,
    isPartial,
    /** Fontes que falharam na última sincronização incompleta. */
    fontesComFalha: sincronizacao.fontesComFalha,
    /** Coordenador pode forçar a atualização com as fontes oficiais. */
    podeForcarAtualizacao: sincronizacao.podeForcar,
    error,
    carteiraIncompleta,
    tentarDeNovo,
    dataUpdatedAt,
    refresh
  };
}

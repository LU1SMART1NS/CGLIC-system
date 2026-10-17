import { useMemo } from 'react';
import { useContractsDashboard } from './useContractsDashboard';
import { useSincronizacaoContratos } from './useSincronizacaoContratos';
import { ROTULO_GESTORES_CONTRATOS, ROTULO_VINCULOS_ITEM_CONTRATO, useAssignedManagementScope } from './useAssignedManagementScope';
import type { LeituraDaTela } from '../components/fonte/useLeiturasComFalha';
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

/** Sem o painel: nenhuma pendência (constante, para não refazer as contas a cada render). */
const SEM_ALERTAS: DashboardAttentionItem[] = [];

/**
 * Carteira de Contratos das UASGs da CGLIC, no escopo do usuário: contratos enriquecidos com prazo,
 * gestor e pendências (Funil Único de Atenção). Mesmas consultas e parâmetros do Início, logo
 * mesmo cache do React Query. Fonte única para a Carteira de Contratos e a Central de Distribuição.
 *
 * `pendencias: false` é a versão leve: não lê o painel do Início (13 fontes por UASG, as duas UASGs), e as linhas
 * saem sem pendências. Serve às telas que só usam número, fornecedor, gestor e vigência (Financeiro, Vínculos e o
 * contador do menu).
 */
export function useContractsPortfolio({ pendencias: comPendencias = true, enabled = true }: { pendencias?: boolean; enabled?: boolean } = {}) {
  // enabled: false segura todas as leituras (os números do menu só leem os contratos depois que a tela enche).
  const dash200330 = useContractsDashboard(UASGS[0], { enabled });
  const dash200331 = useContractsDashboard(UASGS[1], { enabled });

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

  const scope200330 = useAssignedManagementScope(UASGS[0], { enabled });
  const scope200331 = useAssignedManagementScope(UASGS[1], { enabled });
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

  const managers200330 = useAllContractManagers(UASGS[0], { enabled });
  const managers200331 = useAllContractManagers(UASGS[1], { enabled });
  // Só consulta depois do escopo do gestor: a chave inclui o escopo, e consultar antes carregava tudo duas vezes.
  const mgmt200330 = useManagementDashboard(
    { uasg: UASGS[0], assignedContractKeys: scope200330.contractKeys, assignedAtaKeys: scope200330.ataKeys },
    { enabled: enabled && comPendencias && !scope200330.isLoading }
  );
  const mgmt200331 = useManagementDashboard(
    { uasg: UASGS[1], assignedContractKeys: scope200331.contractKeys, assignedAtaKeys: scope200331.ataKeys },
    { enabled: enabled && comPendencias && !scope200331.isLoading }
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
  // Na versão leve o painel não é lido; mesmo que outra tela o tenha posto no cache, as pendências ficam de fora.
  const attentionItems = useMemo<DashboardAttentionItem[]>(
    () =>
      comPendencias
        ? [...(mgmt200330.readModel?.attention?.items || []), ...(mgmt200331.readModel?.attention?.items || [])]
        : SEM_ALERTAS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comPendencias, mgmt200330.readModel, mgmt200331.readModel]
  );
  /** O painel (pendências) ainda não chegou: contas que dependem dele esperam. Na versão leve, nunca. */
  const pendenciasCarregando =
    comPendencias && (isLoadingScope || (!mgmt200330.readModel && !mgmt200330.isError) || (!mgmt200331.readModel && !mgmt200331.isError));
  /** O painel de alguma UASG falhou sem leitura anterior: as pendências sairiam pela metade. */
  const pendenciasComErro = comPendencias && ((mgmt200330.isError && !mgmt200330.readModel) || (mgmt200331.isError && !mgmt200331.readModel));
  const { refetch: relerPainel200330 } = mgmt200330;
  const { refetch: relerPainel200331 } = mgmt200331;
  const relerPendencias = async () => {
    await Promise.all([relerPainel200330(), relerPainel200331()]);
  };

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
  const ataLinksQuery = useArpItemContractLinks(enabled);
  const { data: ataLinks } = ataLinksQuery;
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

  /**
   * Leituras de que número, fornecedor, gestor e o recorte do perfil gestor dependem, para a faixa "não carregou"
   * das telas. Os vínculos com as atas (coluna Atas) ficam à parte: só as telas que mostram as atas os usam.
   */
  const leiturasDosContratos: LeituraDaTela[] = [
    { rotulo: `contratos da UASG ${UASGS[0]}`, query: dash200330 },
    { rotulo: `contratos da UASG ${UASGS[1]}`, query: dash200331 },
    { rotulo: ROTULO_GESTORES_CONTRATOS, query: managers200330 },
    { rotulo: ROTULO_GESTORES_CONTRATOS, query: managers200331 },
    ...(scope200330.leituras ?? []),
    ...(scope200331.leituras ?? [])
  ];
  const leituraDosVinculos: LeituraDaTela = { rotulo: ROTULO_VINCULOS_ITEM_CONTRATO, query: ataLinksQuery };

  return {
    /** Contratos no escopo do usuário, enriquecidos. */
    rows,
    leiturasDosContratos,
    leituraDosVinculos,
    contractsByKey,
    attentionItems,
    pendenciasCarregando,
    pendenciasComErro,
    relerPendencias,
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

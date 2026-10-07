import { useQuery } from '@tanstack/react-query';
import type { ContractDashboardRecord, ContractEvent } from '../types';
import { buildContractEventsFromOfficialData } from '../services/contractEventService';
import { buildContractEventsFromHistorico } from '../services/contractHistoricoService';
import { fetchContratosGovHistorico } from '../services/api';
import { getContractManagementKey } from '../services/contractManagementService';
import { lerComCopia, lerCopiaDetalheContrato } from '../services/contratoDetalhesCopiaService';
import type { ContratosGovHistoricoRecord } from '../types/contractHistorico';

/**
 * De onde veio o histórico (termos aditivos e apostilamentos) do Contratos.gov.br:
 * - NAO_CONSULTADO: o contrato não é de lá, ou os termos já vieram no registro;
 * - API: lido agora; COPIA: a consulta falhou e vale a cópia guardada (copiadoEm);
 * - FALHA: a consulta falhou e não há cópia (os eventos mostram só o que o registro do contrato tem).
 */
export interface OrigemHistoricoContrato {
  origem: 'NAO_CONSULTADO' | 'API' | 'COPIA' | 'FALHA';
  copiadoEm: string | null;
}

export interface EventosDoContrato {
  eventos: ContractEvent[];
  historico: OrigemHistoricoContrato;
}

/**
 * Constrói as opções canônicas de query para os Eventos Formais de um Contrato (Fase 5.3).
 *
 * Query Key Canônica: ['contract-events', contractKey]
 */
export function getContractEventsQueryOptions(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = true
) {
  const contractKey = contract
    ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)
    : '';

  const isEnabled = Boolean(enabled && contract && contractKey);

  return {
    queryKey: ['contract-events', contractKey] as const,
    queryFn: async (): Promise<EventosDoContrato> => {
      const naoConsultado: OrigemHistoricoContrato = { origem: 'NAO_CONSULTADO', copiadoEm: null };
      if (!contract) return { eventos: [], historico: naoConsultado };

      // Extrai aditivos oficiais quando disponíveis nos dados oficiais brutos do contrato
      const aditivosRaw = Array.isArray(contract.raw?.termos_aditivos)
        ? contract.raw.termos_aditivos
        : Array.isArray(contract.raw?.aditivos)
        ? contract.raw.aditivos
        : [];

      const baseEvents = buildContractEventsFromOfficialData(contract, aditivosRaw);

      // A lista de contratos não traz os termos: busca o histórico oficial do contrato.
      // Só para contratos do Contratos.gov.br e quando o `raw` não trouxe aditivos.
      const contratoId = contract.contratoId;
      const fromContratosGov = String(contract.fonteDados || '').includes('Contratos.gov');
      if (aditivosRaw.length > 0 || !fromContratosGov || contratoId === undefined || contratoId === '') {
        return { eventos: baseEvents, historico: naoConsultado };
      }

      try {
        const leitura = await lerComCopia(
          () => fetchContratosGovHistorico(contratoId, { falharSeErro: true }),
          () => lerCopiaDetalheContrato<ContratosGovHistoricoRecord[]>(contract.id ?? '', 'historico')
        );
        return {
          eventos: [...baseEvents, ...buildContractEventsFromHistorico(contract, leitura.dados)],
          historico: { origem: leitura.origem, copiadoEm: leitura.copiadoEm }
        };
      } catch (err) {
        console.warn(`Histórico do contrato ${contract.id} indisponível e sem cópia guardada.`, err);
        return { eventos: baseEvents, historico: { origem: 'FALHA', copiadoEm: null } };
      }
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000 // 5 minutos
  };
}

/**
 * Hook canônico do React Query para consulta dos eventos formais do contrato (Timeline 360°).
 */
export function useContractEvents(
  contract?: ContractDashboardRecord | null,
  enabled: boolean = true
) {
  return useQuery<EventosDoContrato, Error>(getContractEventsQueryOptions(contract, enabled));
}

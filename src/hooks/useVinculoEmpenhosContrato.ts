import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  buscarEmpenhosPorNumero,
  desvincularEmpenhoManual,
  fetchDescartesEmpenhoContrato,
  restaurarEmpenhoDoContrato,
  vincularEmpenhoManual,
  type DescarteEmpenhoContrato,
  type EmpenhoEncontrado
} from '../services/contratoEmpenhoVinculoService';

export const DESCARTES_EMPENHO_CONTRATO_KEY = (contractKey: string) => ['contract-empenho-descartes', contractKey] as const;

/** Empenhos que a equipe disse não serem do contrato. */
export function useDescartesEmpenhoContrato(contractKey: string) {
  return useQuery<DescarteEmpenhoContrato[], Error>({
    queryKey: DESCARTES_EMPENHO_CONTRATO_KEY(contractKey),
    queryFn: () => fetchDescartesEmpenhoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });
}

/** NE gravadas no sistema com esse número (as duas UGs podem ter o mesmo número). */
export function useBuscaEmpenhoPorNumero(numero: string, habilitado: boolean) {
  return useQuery<EmpenhoEncontrado[], Error>({
    queryKey: ['empenho-por-numero', numero.trim().toUpperCase()],
    queryFn: () => buscarEmpenhosPorNumero(numero),
    enabled: habilitado,
    staleTime: 30 * 1000
  });
}

/** Tudo que mostra os empenhos do contrato ou soma o valor deles. */
function invalidarEmpenhosDoContrato(queryClient: QueryClient, contractKey: string) {
  queryClient.invalidateQueries({ queryKey: ['contract-empenhos', contractKey] });
  queryClient.invalidateQueries({ queryKey: DESCARTES_EMPENHO_CONTRATO_KEY(contractKey) });
  queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', contractKey] });
  queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
  queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['contract-empenho-item-links', contractKey] });
  queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao', contractKey] });
  queryClient.invalidateQueries({ queryKey: ['contract-events', contractKey] });
  queryClient.invalidateQueries({ queryKey: ['empenho-por-numero'] });
}

/**
 * Restaurar, vincular à mão e desvincular. Vínculo errado vindo do Contratos.gov.br não se descarta mais
 * aqui: corrige-se na fonte e a sincronização traz a correção. Restaurar fica para os descartes antigos.
 */
export function useAcoesVinculoEmpenho(contractKey: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => invalidarEmpenhosDoContrato(queryClient, contractKey);
  const restaurar = useMutation({
    mutationFn: (empenhoId: string) => restaurarEmpenhoDoContrato({ contractKey, empenhoId }),
    retry: 0,
    onSettled: aoTerminar
  });
  const vincular = useMutation({
    mutationFn: (p: Omit<Parameters<typeof vincularEmpenhoManual>[0], 'contractKey'>) => vincularEmpenhoManual({ contractKey, ...p }),
    retry: 0,
    onSettled: aoTerminar
  });
  const desvincular = useMutation({
    mutationFn: (empenhoId: string) => desvincularEmpenhoManual({ contractKey, empenhoId }),
    retry: 0,
    onSettled: aoTerminar
  });
  return { restaurar, vincular, desvincular };
}

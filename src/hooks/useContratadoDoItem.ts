import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ajustarQuantidadeContratada,
  desfazerAjusteQuantidade,
  desfazerDivisaoContrato,
  dividirContratoNasUnidades,
  fetchAjustesDaQuantidade,
  fetchContratadoDoItem,
  type AjusteDaQuantidade,
  type ContratadoDoItem
} from '../services/contratadoUnidadeService';
import { CARTEIRA_ALOCACOES_KEY, CARTEIRA_VINCULOS_KEY } from './useCarteiraItens';

export const CONTRATADO_DO_ITEM_KEY = (itemKey: string) => ['contratado-do-item', itemKey] as const;
const AJUSTES_KEY = (itemKey: string, contractKey: string) => ['contratado-ajustes', itemKey, contractKey] as const;

const VAZIO: ContratadoDoItem = { contratos: [], unidades: [] };

/** Quantidade de cada contrato do item (fonte, ajuste, divisão) e o contratado de cada unidade interna (migration 103). */
export function useContratadoDoItem(itemKey: string) {
  const query = useQuery<ContratadoDoItem, Error>({
    queryKey: CONTRATADO_DO_ITEM_KEY(itemKey),
    queryFn: () => fetchContratadoDoItem(itemKey),
    enabled: Boolean(itemKey),
    staleTime: 60 * 1000
  });
  return { ...query, data: query.data ?? VAZIO };
}

/** Histórico dos ajustes de um contrato no item (janela Ajustar quantidade). */
export function useAjustesDaQuantidade(itemKey: string, contractKey: string | null) {
  return useQuery<AjusteDaQuantidade[], Error>({
    queryKey: AJUSTES_KEY(itemKey, contractKey ?? ''),
    queryFn: () => fetchAjustesDaQuantidade(itemKey, contractKey ?? ''),
    enabled: Boolean(itemKey && contractKey),
    staleTime: 30 * 1000
  });
}

/**
 * Ajustar e desfazer a quantidade contratada; dividir e desfazer a divisão entre as unidades. Depois de qualquer um,
 * relê o item (contratos, unidades e saldo), a Ata e a Carteira, que somam a quantidade contratada.
 */
export function useAcoesContratado(itemKey: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => {
    queryClient.invalidateQueries({ queryKey: CONTRATADO_DO_ITEM_KEY(itemKey) });
    queryClient.invalidateQueries({ queryKey: ['contratado-ajustes', itemKey] });
    queryClient.invalidateQueries({ queryKey: ['item-contract-links', itemKey] });
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    queryClient.invalidateQueries({ queryKey: ['ata-linked-contracts'] });
    queryClient.invalidateQueries({ queryKey: CARTEIRA_VINCULOS_KEY });
    queryClient.invalidateQueries({ queryKey: CARTEIRA_ALOCACOES_KEY });
  };
  const ajustar = useMutation({
    mutationFn: (p: Omit<Parameters<typeof ajustarQuantidadeContratada>[0], 'itemKey'>) => ajustarQuantidadeContratada({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazerAjuste = useMutation({
    mutationFn: (p: Omit<Parameters<typeof desfazerAjusteQuantidade>[0], 'itemKey'>) => desfazerAjusteQuantidade({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const dividir = useMutation({
    mutationFn: (p: Omit<Parameters<typeof dividirContratoNasUnidades>[0], 'itemKey'>) => dividirContratoNasUnidades({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazerDivisao = useMutation({
    mutationFn: (contractKey: string) => desfazerDivisaoContrato({ itemKey, contractKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  return { ajustar, desfazerAjuste, dividir, desfazerDivisao };
}

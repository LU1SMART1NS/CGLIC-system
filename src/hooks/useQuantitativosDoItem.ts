import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmarRemanejamento,
  desfazerContinuaDoOrgao,
  desfazerRemanejamentos,
  fetchQuantitativosDoItem,
  informarQuantidadeAdesao,
  informarQuantidadesAtaAssinada,
  marcarContinuaDoOrgao,
  vazioDoItem,
  type QuantitativosDoItem
} from '../services/quantitativosService';
import { CARTEIRA_ALOCACOES_KEY, CARTEIRA_VINCULOS_KEY } from './useCarteiraItens';

export const QUANTITATIVOS_DO_ITEM_KEY = (itemKey: string) => ['quantitativos-do-item', itemKey] as const;

const VAZIO = vazioDoItem();

/** Ata assinada, situação de cada órgão, cota própria e contratos dos participantes do item (migration 109). */
export function useQuantitativosDoItem(itemKey: string) {
  const query = useQuery<QuantitativosDoItem, Error>({
    queryKey: QUANTITATIVOS_DO_ITEM_KEY(itemKey),
    queryFn: () => fetchQuantitativosDoItem(itemKey),
    enabled: Boolean(itemKey),
    staleTime: 60 * 1000
  });
  // `consulta`: a leitura sem o vazio no lugar, para saber se ela falhou sem leitura anterior (faixa "não carregou").
  return { ...query, data: query.data ?? VAZIO, consulta: query };
}

/**
 * Informar a ata assinada (gestor da ata ou coordenador); confirmar e desfazer remanejamentos e marcar "continua do
 * órgão" (gestor de saldo ou coordenador). Depois de qualquer um, relê o item, o saldo da Ata e a Carteira: a cota
 * própria é a base do saldo.
 */
export function useAcoesQuantitativos(itemKey: string) {
  const queryClient = useQueryClient();
  const aoTerminar = () => {
    queryClient.invalidateQueries({ queryKey: QUANTITATIVOS_DO_ITEM_KEY(itemKey) });
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    queryClient.invalidateQueries({ queryKey: ['item-allocations'] });
    queryClient.invalidateQueries({ queryKey: CARTEIRA_ALOCACOES_KEY });
    queryClient.invalidateQueries({ queryKey: CARTEIRA_VINCULOS_KEY });
  };
  const informar = useMutation({
    mutationFn: (p: Omit<Parameters<typeof informarQuantidadesAtaAssinada>[0], 'itemKey'>) => informarQuantidadesAtaAssinada({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const confirmar = useMutation({
    mutationFn: (p: Omit<Parameters<typeof confirmarRemanejamento>[0], 'itemKey'>) => confirmarRemanejamento({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazerRemanejamento = useMutation({
    mutationFn: (uasgOrigem: string) => desfazerRemanejamentos({ itemKey, uasgOrigem }),
    retry: 0,
    onSettled: aoTerminar
  });
  const marcarContinua = useMutation({
    mutationFn: (p: Omit<Parameters<typeof marcarContinuaDoOrgao>[0], 'itemKey'>) => marcarContinuaDoOrgao({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  const desfazerContinua = useMutation({
    mutationFn: (uasg: string) => desfazerContinuaDoOrgao({ itemKey, uasg }),
    retry: 0,
    onSettled: aoTerminar
  });
  const informarAdesao = useMutation({
    mutationFn: (p: Omit<Parameters<typeof informarQuantidadeAdesao>[0], 'itemKey'>) => informarQuantidadeAdesao({ ...p, itemKey }),
    retry: 0,
    onSettled: aoTerminar
  });
  return { informar, confirmar, desfazerRemanejamento, marcarContinua, desfazerContinua, informarAdesao };
}

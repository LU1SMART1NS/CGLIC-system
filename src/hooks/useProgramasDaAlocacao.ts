import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXTRA_VAZIO, fetchAlocacaoExtraDoItem, fetchProgramasDaDivisao, fetchProgramasParaAlocacao, fetchReservasDaCarteira, ligarContratoAoPrograma, remanejarEntreUnidades, reservarParaPrograma
} from '../services/programasAlocacaoService';
import { CARTEIRA_ALOCACOES_KEY } from './useCarteiraItens';

export const PROGRAMAS_ALOCACAO_KEY = ['programas-para-alocacao'] as const;
export const ALOCACAO_EXTRA_KEY = (itemKey: string) => ['alocacao-extra-do-item', itemKey] as const;

export function useProgramasParaAlocacao() {
  return useQuery({ queryKey: PROGRAMAS_ALOCACAO_KEY, queryFn: fetchProgramasParaAlocacao, staleTime: 5 * 60_000 });
}

export const RESERVAS_CARTEIRA_KEY = ['reservas-da-carteira'] as const;

/** Por item: os programas com reserva e o reservado a parlamentares (ComprasSUSP), para a coluna Programas. */
export function useProgramasDosItens() {
  const programas = useProgramasParaAlocacao();
  const reservas = useQuery({ queryKey: RESERVAS_CARTEIRA_KEY, queryFn: fetchReservasDaCarteira, staleTime: 2 * 60_000 });
  const nomes = new Map((programas.data ?? []).map((p) => [p.id, p.nome]));
  const porItem = new Map<string, Array<{ nome: string; quantidade: number; emPedidos: boolean }>>();
  for (const r of reservas.data?.reservas ?? []) {
    const lista = porItem.get(r.itemKey) ?? [];
    lista.push({ nome: nomes.get(r.programaId) ?? 'Programa', quantidade: r.quantidade, emPedidos: false });
    porItem.set(r.itemKey, lista);
  }
  for (const [itemKey, q] of reservas.data?.parlamentares ?? new Map<string, number>()) {
    if (q <= 0) continue;
    porItem.set(itemKey, [...(porItem.get(itemKey) ?? []), { nome: 'ComprasSUSP', quantidade: q, emPedidos: true }]);
  }
  return porItem;
}

/** Reservas de programas, divisão da ata assinada e remanejamentos do item (migration 298). */
export function useAlocacaoExtraDoItem(itemKey: string) {
  const query = useQuery({ queryKey: ALOCACAO_EXTRA_KEY(itemKey), queryFn: () => fetchAlocacaoExtraDoItem(itemKey), enabled: Boolean(itemKey), staleTime: 60_000 });
  return { ...query, data: query.data ?? EXTRA_VAZIO };
}

/** Depois de reservar ou remanejar: relê o item, as alocações e a carteira. */
function useReleituraDoItem() {
  const qc = useQueryClient();
  return (itemKey: string) => {
    void qc.invalidateQueries({ queryKey: ALOCACAO_EXTRA_KEY(itemKey) });
    void qc.invalidateQueries({ queryKey: ['item-allocations', itemKey] });
    void qc.invalidateQueries({ queryKey: CARTEIRA_ALOCACOES_KEY });
    void qc.invalidateQueries({ queryKey: RESERVAS_CARTEIRA_KEY });
    void qc.invalidateQueries({ queryKey: ['contratado-do-item', itemKey] });
  };
}

export function useReservarParaPrograma() {
  const reler = useReleituraDoItem();
  return useMutation({
    mutationFn: (v: { itemKey: string; programaId: string; quantidade: number; expectedVersion?: number }) => reservarParaPrograma(v.itemKey, v.programaId, v.quantidade, v.expectedVersion),
    onSettled: (_d, _e, v) => reler(v.itemKey)
  });
}

export function useRemanejarEntreUnidades() {
  const reler = useReleituraDoItem();
  return useMutation({
    mutationFn: remanejarEntreUnidades,
    onSettled: (_d, _e, v) => reler(v.itemKey)
  });
}

export const PROGRAMAS_DA_DIVISAO_KEY = (itemKey: string, contractKey: string) => ['programas-da-divisao', itemKey, contractKey] as const;

/** Programa de cada unidade na divisão do contrato no item. */
export function useProgramasDaDivisao(itemKey: string, contractKey: string | null) {
  return useQuery({
    queryKey: PROGRAMAS_DA_DIVISAO_KEY(itemKey, contractKey ?? ''),
    queryFn: () => fetchProgramasDaDivisao(itemKey, contractKey!),
    enabled: Boolean(itemKey && contractKey),
    staleTime: 30_000
  });
}

/** Grava o programa de várias unidades do contrato (uma chamada por unidade) e relê o item. */
export function useLigarContratoAosProgramas() {
  const reler = useReleituraDoItem();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { itemKey: string; contractKey: string; ligacoes: Array<{ unidade: string; programaId: string | null }> }) => {
      for (const l of v.ligacoes) await ligarContratoAoPrograma(v.itemKey, v.contractKey, l.unidade, l.programaId);
    },
    onSettled: (_d, _e, v) => {
      reler(v.itemKey);
      void qc.invalidateQueries({ queryKey: PROGRAMAS_DA_DIVISAO_KEY(v.itemKey, v.contractKey) });
    }
  });
}

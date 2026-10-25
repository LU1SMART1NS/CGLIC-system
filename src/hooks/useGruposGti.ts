import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  definirGruposUasgs,
  fetchFatiasGti,
  fetchFatiasItensGti,
  fetchGruposDasUasgs,
  fetchUasgsParticipantesGti
} from '../services/gruposGtiService';
import { chaveAtaGti, type FatiasDaAta, type GrupoConfirmavel } from '../config/gruposGti';
import { sementeDaCarteira } from './sementeDaCarteira';

const FATIAS_KEY = ['gti-fatias'] as const;
const FATIAS_ITENS_KEY = ['gti-fatias-itens'] as const;
const PARTICIPANTES_KEY = ['gti-uasgs-participantes'] as const;
const GRUPOS_KEY = 'gti-grupos-uasgs';
const VAZIO_FATIAS = new Map<string, FatiasDaAta>();
const VAZIO_GRUPOS = new Map<string, GrupoConfirmavel>();

/** Rótulos das fatias de GTI na faixa "não carregou" (sem elas a coluna e o filtro GTI somem calados). */
export const ROTULO_GTI_ATAS = 'participação dos GTIs nas atas';
export const ROTULO_GTI_ITENS = 'participação dos GTIs nos itens';

/** Fatia de cada GTI por ata (chave "{numeroAta}-{uasg}"), com a consulta para a faixa "não carregou". */
export function useFatiasGtiLeitura() {
  const consulta = useQuery({ queryKey: FATIAS_KEY, queryFn: () => fetchFatiasGti(), staleTime: 10 * 60 * 1000 });
  return { fatias: consulta.data ?? VAZIO_FATIAS, consulta };
}

/**
 * Fatias de GTI de uma ata só (Ata 360), no mesmo formato de useFatiasGtiLeitura. Fica sob o prefixo ['gti-fatias']
 * (confirmar o grupo de uma UASG invalida as duas). Com as fatias de todas as atas no navegador (Carteira de Atas),
 * a da ata sai delas, sem pedido.
 */
export function useFatiasGtiDaAtaLeitura(numeroAta: string | undefined, uasg: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const numero = (numeroAta || '').trim();
  const cleanUasg = (uasg || '').trim();
  const consulta = useQuery({
    queryKey: [...FATIAS_KEY, 'ata', numero, cleanUasg] as const,
    queryFn: () => fetchFatiasGti({ numeroAta: numero, uasg: cleanUasg }),
    enabled: enabled && Boolean(numero && cleanUasg),
    staleTime: 10 * 60 * 1000,
    ...sementeDaCarteira<Map<string, FatiasDaAta>, Map<string, FatiasDaAta>>(qc, FATIAS_KEY, (todas) => {
      const chave = chaveAtaGti(numero, cleanUasg);
      const daAta = todas.get(chave);
      return new Map(daAta ? [[chave, daAta]] : []);
    })
  });
  return { fatias: consulta.data ?? VAZIO_FATIAS, consulta };
}

/** Fatia de cada GTI por item (chave "{numeroAta}-{uasg}-{00001}"), com a consulta para a faixa "não carregou". */
export function useFatiasItensGtiLeitura() {
  const consulta = useQuery({ queryKey: FATIAS_ITENS_KEY, queryFn: fetchFatiasItensGti, staleTime: 10 * 60 * 1000 });
  return { fatias: consulta.data ?? VAZIO_FATIAS, consulta };
}

/** Fatia de cada GTI por ata (chave "{numeroAta}-{uasg}"); vazio enquanto carrega ou sem a migration 139. */
export function useFatiasGti(): Map<string, FatiasDaAta> {
  return useFatiasGtiLeitura().fatias;
}

/** Fatia de cada GTI por item (chave "{numeroAta}-{uasg}-{00001}"); vazio enquanto carrega ou sem a migration 139. */
export function useFatiasItensGti(): Map<string, FatiasDaAta> {
  return useFatiasItensGtiLeitura().fatias;
}

export function useUasgsParticipantesGti({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: PARTICIPANTES_KEY, queryFn: fetchUasgsParticipantesGti, staleTime: 60 * 1000, enabled });
}

/** Rótulo dos grupos das UASGs na faixa "não carregou" (sem eles, todo órgão aparece "a confirmar"). */
export const ROTULO_GRUPOS_UASGS = 'grupo (GTI) dos órgãos';

/** Grupo confirmado das UASGs, com a consulta para a faixa "não carregou". */
export function useGruposDasUasgsLeitura(uasgs: string[]) {
  const codigos = [...new Set(uasgs.filter((u) => /^\d{6}$/.test(u)))].sort();
  const consulta = useQuery({
    queryKey: [GRUPOS_KEY, codigos.join(',')],
    queryFn: () => fetchGruposDasUasgs(codigos),
    enabled: codigos.length > 0,
    staleTime: 10 * 60 * 1000
  });
  return { grupos: consulta.data ?? VAZIO_GRUPOS, consulta };
}

/** Grupo confirmado das UASGs (aba Órgãos e quantitativos do item). */
export function useGruposDasUasgs(uasgs: string[]): Map<string, GrupoConfirmavel> {
  return useGruposDasUasgsLeitura(uasgs).grupos;
}

export function useDefinirGruposUasgs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: definirGruposUasgs,
    retry: 0,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PARTICIPANTES_KEY });
      void qc.invalidateQueries({ queryKey: FATIAS_KEY });
      void qc.invalidateQueries({ queryKey: FATIAS_ITENS_KEY });
      void qc.invalidateQueries({ queryKey: [GRUPOS_KEY] });
    }
  });
}

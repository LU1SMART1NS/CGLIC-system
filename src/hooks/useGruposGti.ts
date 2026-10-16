import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  definirGruposUasgs,
  fetchFatiasGti,
  fetchFatiasItensGti,
  fetchGruposDasUasgs,
  fetchUasgsParticipantesGti
} from '../services/gruposGtiService';
import type { FatiasDaAta, GrupoConfirmavel } from '../config/gruposGti';

const FATIAS_KEY = ['gti-fatias'] as const;
const FATIAS_ITENS_KEY = ['gti-fatias-itens'] as const;
const PARTICIPANTES_KEY = ['gti-uasgs-participantes'] as const;
const GRUPOS_KEY = 'gti-grupos-uasgs';
const VAZIO_FATIAS = new Map<string, FatiasDaAta>();
const VAZIO_GRUPOS = new Map<string, GrupoConfirmavel>();

/** Fatia de cada GTI por ata (chave "{numeroAta}-{uasg}"); vazio enquanto carrega ou sem a migration 139. */
export function useFatiasGti(): Map<string, FatiasDaAta> {
  const query = useQuery({ queryKey: FATIAS_KEY, queryFn: fetchFatiasGti, staleTime: 10 * 60 * 1000 });
  return query.data ?? VAZIO_FATIAS;
}

/** Fatia de cada GTI por item (chave "{numeroAta}-{uasg}-{00001}"); vazio enquanto carrega ou sem a migration 139. */
export function useFatiasItensGti(): Map<string, FatiasDaAta> {
  const query = useQuery({ queryKey: FATIAS_ITENS_KEY, queryFn: fetchFatiasItensGti, staleTime: 10 * 60 * 1000 });
  return query.data ?? VAZIO_FATIAS;
}

export function useUasgsParticipantesGti() {
  return useQuery({ queryKey: PARTICIPANTES_KEY, queryFn: fetchUasgsParticipantesGti, staleTime: 60 * 1000 });
}

/** Grupo confirmado das UASGs (aba Órgãos e quantitativos do item). */
export function useGruposDasUasgs(uasgs: string[]): Map<string, GrupoConfirmavel> {
  const codigos = [...new Set(uasgs.filter((u) => /^\d{6}$/.test(u)))].sort();
  const query = useQuery({
    queryKey: [GRUPOS_KEY, codigos.join(',')],
    queryFn: () => fetchGruposDasUasgs(codigos),
    enabled: codigos.length > 0,
    staleTime: 10 * 60 * 1000
  });
  return query.data ?? VAZIO_GRUPOS;
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

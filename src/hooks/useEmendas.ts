import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  fetchAutoresEmendas,
  fetchBeneficiariosEmendas,
  fetchItensCaep,
  fetchKitsEmendas,
  salvarBeneficiarioEmenda,
  salvarKitEmenda,
  type BeneficiarioParaSalvar,
  type KitParaSalvar
} from '../services/emendasService';

/** Mesma regra do banco (emendas.manage): coordenador e gestor de emendas alteram; a consulta só lê. */
export function usePodeGerirEmendas(): boolean {
  const { role } = useAuth();
  return role === 'admin' || role === 'gestor_emendas';
}

export const CHAVE_EMENDAS = ['emendas'] as const;

export function useAutoresEmendas() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'autores'], queryFn: fetchAutoresEmendas, staleTime: 10 * 60_000 });
}

export function useBeneficiariosEmendas() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'beneficiarios'], queryFn: fetchBeneficiariosEmendas });
}

export function useItensCaep() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'itens-caep'], queryFn: fetchItensCaep, staleTime: 5 * 60_000 });
}

export function useKitsEmendas() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'kits'], queryFn: fetchKitsEmendas });
}

export function useSalvarBeneficiario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BeneficiarioParaSalvar) => salvarBeneficiarioEmenda(b),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'beneficiarios'] })
  });
}

export function useSalvarKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (k: KitParaSalvar) => salvarKitEmenda(k),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'kits'] })
  });
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { semContratos } from '../types/rbac';
import {
  fetchAutoresEmendas,
  fetchBeneficiariosEmendas,
  fetchItensCaep,
  fetchKitsEmendas,
  salvarBeneficiarioEmenda,
  salvarKitEmenda,
  fetchPedidosEmendas,
  fetchReservadoPorItem,
  salvarPedidoEmenda,
  avancarPedidoEmenda,
  cancelarPedidoEmenda,
  type AcaoPedido,
  type BeneficiarioParaSalvar,
  type KitParaSalvar
} from '../services/emendasService';

/** Mesma regra do banco (emendas.manage): coordenador e gestor de emendas alteram; a consulta só lê. */
export function usePodeGerirEmendas(): boolean {
  const { role } = useAuth();
  return role === 'admin' || role === 'gestor_emendas';
}

/** O contrato citado no pedido só vira link para quem consulta contratos (o gestor de emendas não consulta). */
export function usePodeVerContratos(): boolean {
  const { role } = useAuth();
  return Boolean(role) && !semContratos(role);
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

export function usePedidosEmendas() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'pedidos'], queryFn: fetchPedidosEmendas });
}

export function useReservadoPorItem() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'reservado'], queryFn: fetchReservadoPorItem });
}

/** Pedido mexe no saldo: recarrega pedidos, reservado e kits (kits possíveis). */
function useInvalidarPedidos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS] });
}

export function useSalvarPedido() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: salvarPedidoEmenda, retry: 0, onSettled: invalidar });
}

export function useAvancarPedido() {
  const invalidar = useInvalidarPedidos();
  return useMutation({
    mutationFn: (v: { id: string; versao: number; acao: AcaoPedido; dados: Record<string, unknown> }) => avancarPedidoEmenda(v.id, v.versao, v.acao, v.dados),
    retry: 0,
    onSettled: invalidar
  });
}

export function useCancelarPedido() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: (v: { id: string; versao: number; motivo: string }) => cancelarPedidoEmenda(v.id, v.versao, v.motivo), retry: 0, onSettled: invalidar });
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

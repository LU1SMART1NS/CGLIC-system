import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAvisosResolvidos } from './useAvisosResolvidos';
import { conferenciaPorItem, diferencasPorPedido } from '../utils/emendasEmpenho';
import { credorPorPedido } from '../utils/emendasConferenciaNota';
import { useAuth } from '../context/AuthContext';
import { semContratos } from '../types/rbac';
import {
  fetchAutoresEmendas,
  fetchBeneficiariosEmendas,
  fetchBeneficiariosDiferentes,
  juntarBeneficiariosEmenda,
  marcarBeneficiariosDiferentes,
  fetchItensCaep,
  fetchKitsEmendas,
  salvarBeneficiarioEmenda,
  salvarKitEmenda,
  fetchPedidosEmendas,
  fetchReservadoPorItem,
  fetchNotasDasLinhas,
  fetchConferenciaEmpenho,
  fetchCredorDiferente,
  fetchNotasSemPedido,
  salvarPedidoEmenda,
  avancarPedidoEmenda,
  cancelarPedidoEmenda,
  informarSolicitacaoDaAta,
  registrarEnvioCgofi,
  type AcaoPedido,
  type CredorDiferente,
  type BeneficiarioEmenda,
  type BeneficiarioParaSalvar,
  type ConferenciaEmpenho,
  type KitParaSalvar
} from '../services/emendasService';

/** Mesma regra do banco (emendas.manage): coordenador e gestor de emendas alteram; a consulta só lê. */
export function usePodeGerirEmendas(): boolean {
  const { role } = useAuth();
  return role === 'admin' || role === 'gestor_emendas';
}

/**
 * Quem abre as telas do menu Emendas (rotas /emendas/*): coordenador, gestor de emendas e consulta. O gestor de atas e
 * contratos e o gestor de saldo leem as emendas só na aba do Item 360, sem ir a Pedidos (decisão de 25/10/2026).
 */
export function podeAbrirTelasDeEmendas(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor_emendas' || role === 'leitor';
}

export function usePodeAbrirTelasDeEmendas(): boolean {
  const { role } = useAuth();
  return podeAbrirTelasDeEmendas(role);
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

export function useBeneficiariosDiferentes() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'beneficiarios-diferentes'], queryFn: fetchBeneficiariosDiferentes });
}

/** Juntar mexe nas linhas dos pedidos também: recarrega os dois. */
export function useJuntarBeneficiarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { fica: BeneficiarioEmenda; sai: BeneficiarioEmenda; motivo: string }) => juntarBeneficiariosEmenda(p),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS] })
  });
}

export function useMarcarBeneficiariosDiferentes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { aId: string; bId: string; diferentes?: boolean }) => marcarBeneficiariosDiferentes(p.aId, p.bId, p.diferentes ?? true),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'beneficiarios-diferentes'] })
  });
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

/** Nota de empenho e execução de cada linha empenhada (migration 164; o banco refaz de hora em hora). */
export function useNotasDasLinhas() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'notas'], queryFn: fetchNotasDasLinhas, staleTime: 5 * 60_000 });
}

/** Empenhado × pedido por emenda e item (migration 187; acompanha as notas, refeitas de hora em hora). */
export function useConferenciaEmpenho() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'conferencia-empenho'], queryFn: fetchConferenciaEmpenho, staleTime: 5 * 60_000 });
}

const SEM_CONFERENCIA: ConferenciaEmpenho[] = [];
const SEM_CREDOR: CredorDiferente[] = [];

/** Conferência com as diferenças ainda não resolvidas por pedido e a conferência de cada item (etiqueta da linha). */
export function useDiferencasDeEmpenho() {
  const consulta = useConferenciaEmpenho();
  const { porChave } = useAvisosResolvidos();
  const conferencia = consulta.data ?? SEM_CONFERENCIA;
  const diferencas = useMemo(() => diferencasPorPedido(conferencia, porChave), [conferencia, porChave]);
  const porItem = useMemo(() => conferenciaPorItem(conferencia), [conferencia]);
  return { consulta, conferencia, diferencas, porItem, resolvidos: porChave };
}

/** Notas ligadas com credor diferente do fornecedor da ata (migration 190), por pedido, sem as já resolvidas. */
export function useCredorDiferente() {
  const consulta = useQuery({ queryKey: [...CHAVE_EMENDAS, 'credor-diferente'], queryFn: fetchCredorDiferente, staleTime: 5 * 60_000 });
  const { porChave } = useAvisosResolvidos();
  const lista = consulta.data ?? SEM_CREDOR;
  const porPedido = useMemo(() => credorPorPedido(lista, porChave), [lista, porChave]);
  const todosPorPedido = useMemo(() => credorPorPedido(lista), [lista]);
  return { consulta, porPedido, todosPorPedido, resolvidos: porChave };
}

/** Notas de emenda da UG 200330 cuja emenda nenhum pedido tem (migration 190). */
export function useNotasSemPedido() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'notas-sem-pedido'], queryFn: fetchNotasSemPedido, staleTime: 5 * 60_000 });
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

export function useInformarSolicitacaoDaAta() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: informarSolicitacaoDaAta, retry: 0, onSettled: invalidar });
}

export function useRegistrarEnvioCgofi() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: registrarEnvioCgofi, retry: 0, onSettled: invalidar });
}

export function useCancelarPedido() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: (v: { id: string; versao: number; motivo: string }) => cancelarPedidoEmenda(v.id, v.versao, v.motivo), retry: 0, onSettled: invalidar });
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

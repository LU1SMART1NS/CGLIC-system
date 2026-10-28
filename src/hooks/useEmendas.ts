import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAvisosResolvidos } from './useAvisosResolvidos';
import { conferenciaPorItem, diferencasPorPedido } from '../utils/emendasEmpenho';
import { credorPorPedido } from '../utils/emendasConferenciaNota';
import { useAuth } from '../context/AuthContext';
import { semContratos } from '../types/rbac';
import { definirGruposBeneficiarios, fetchGruposBeneficiarios } from '../services/captacaoEmendasService';
import { mapaDeGrupos, type GrupoBeneficiario } from '../config/captacaoEmendas';
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
  fetchReservadoDoItem,
  fetchNotasDasLinhas,
  fetchConferenciaEmpenho,
  fetchCredorDiferente,
  fetchNotasSemPedido,
  ligarEmendaAoPedido,
  removerEmendaDoPedido,
  salvarPedidoEmenda,
  avancarPedidoEmenda,
  conferirOficioPedido,
  cancelarPedidoEmenda,
  registrarAnulacaoEmpenho,
  fetchExecucaoEmendas,
  fetchDadosDaAtaParaAutorizacao,
  informarSolicitacaoDaAta,
  registrarEnvioCgofi,
  fetchEmendasSiop,
  fetchContatosDasEmendas,
  fetchAsparDosOrgaos,
  salvarEmendaSiop,
  apagarEmendaSiop,
  salvarValorOficioPedido,
  registrarContatoEmenda,
  salvarAsparEmenda,
  type AcaoPedido,
  type CredorDiferente,
  type BeneficiarioEmenda,
  type BeneficiarioParaSalvar,
  type ConferenciaEmpenho,
  type KitParaSalvar,
  type PedidoEmenda
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

export function useBeneficiariosEmendas({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'beneficiarios'], queryFn: fetchBeneficiariosEmendas, enabled });
}

/** Grupo confirmado de cada beneficiário (migration 218). `data` null: migration ainda não aplicada. */
export function useGruposBeneficiarios({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'grupos-beneficiarios'], queryFn: fetchGruposBeneficiarios, staleTime: 5 * 60_000, enabled });
}

const SEM_GRUPOS = new Map<string, GrupoBeneficiario>();

/** Mapa beneficiário → grupo confirmado (colunas de Captação principal); vazio enquanto carrega. */
export function useMapaGruposBeneficiarios(): Map<string, GrupoBeneficiario> {
  const { data } = useGruposBeneficiarios();
  return useMemo(() => (data ? mapaDeGrupos(data) : SEM_GRUPOS), [data]);
}

export function useDefinirGruposBeneficiarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: definirGruposBeneficiarios,
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'grupos-beneficiarios'] })
  });
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

/** `enabled`: o número do menu Emendas só lê depois que a tela aberta enche (useTelaCarregada). */
interface LeituraOpcional {
  enabled?: boolean;
}

export function useItensCaep({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'itens-caep'], queryFn: fetchItensCaep, staleTime: 5 * 60_000, enabled });
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

export function usePedidosEmendas({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'pedidos'], queryFn: fetchPedidosEmendas, enabled });
}

export function useReservadoPorItem() {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'reservado'], queryFn: fetchReservadoPorItem });
}

/** Reservado a parlamentares de um item: mínimo da CAEP na alocação e no remanejamento da cota SENASP. */
export function useReservadoDoItem(itemKey: string, { enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'reservado', itemKey], queryFn: () => fetchReservadoDoItem(itemKey), enabled: enabled && Boolean(itemKey) });
}

/** Nota de empenho e execução de cada linha empenhada (migration 164; o banco refaz de hora em hora). */
export function useNotasDasLinhas({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'notas'], queryFn: fetchNotasDasLinhas, staleTime: 5 * 60_000, enabled });
}

/** Empenhado × pedido por emenda e item (migration 187; acompanha as notas, refeitas de hora em hora). */
export function useConferenciaEmpenho({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'conferencia-empenho'], queryFn: fetchConferenciaEmpenho, staleTime: 5 * 60_000, enabled });
}

const SEM_CONFERENCIA: ConferenciaEmpenho[] = [];
const SEM_CREDOR: CredorDiferente[] = [];

/** Conferência com as diferenças ainda não resolvidas por pedido e a conferência de cada item (etiqueta da linha). */
export function useDiferencasDeEmpenho({ enabled = true }: LeituraOpcional = {}) {
  const consulta = useConferenciaEmpenho({ enabled });
  const { porChave } = useAvisosResolvidos();
  const conferencia = consulta.data ?? SEM_CONFERENCIA;
  const diferencas = useMemo(() => diferencasPorPedido(conferencia, porChave), [conferencia, porChave]);
  const porItem = useMemo(() => conferenciaPorItem(conferencia), [conferencia]);
  return { consulta, conferencia, diferencas, porItem, resolvidos: porChave };
}

/** Notas ligadas com credor diferente do fornecedor da ata (migration 190), por pedido, sem as já resolvidas. */
export function useCredorDiferente({ enabled = true }: LeituraOpcional = {}) {
  const consulta = useQuery({ queryKey: [...CHAVE_EMENDAS, 'credor-diferente'], queryFn: fetchCredorDiferente, staleTime: 5 * 60_000, enabled });
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

/** Ligar ou tirar uma emenda do pedido religa as notas: recarrega pedidos, notas e conferências (migration 211). */
export function useLigarEmendaAoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Parameters<typeof ligarEmendaAoPedido>[0]) => ligarEmendaAoPedido(p),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS] })
  });
}

export function useRemoverEmendaDoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; versao: number }) => removerEmendaDoPedido(p.id, p.versao),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS] })
  });
}

/**
 * Pedido mexe no saldo: recarrega pedidos, reservado e kits (kits possíveis). Os pedidos vêm primeiro e sozinhos (a
 * janela espera só por eles); o resto das Emendas recarrega depois, sem segurar a janela. Recarregar tudo junto
 * disparava umas 25 consultas de uma vez e, com o banco lento, a lista de pedidos podia ficar com a etapa antiga.
 */
function useInvalidarPedidos() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'pedidos'], exact: true });
    void qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS], predicate: (q) => q.queryKey[1] !== 'pedidos' });
  };
}

/** Se a lista de pedidos na tela já tem a versão que o banco devolveu ao gravar (senão, a tela ficou para trás). */
export function usePedidoEmDiaNaTela() {
  const qc = useQueryClient();
  return (id: string, versao: number): boolean =>
    (qc.getQueryData<PedidoEmenda[]>([...CHAVE_EMENDAS, 'pedidos'])?.find((p) => p.id === id)?.versao ?? 0) >= versao;
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

export function useConferirOficio() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: conferirOficioPedido, retry: 0, onSettled: invalidar });
}

export function useInformarSolicitacaoDaAta() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: informarSolicitacaoDaAta, retry: 0, onSettled: invalidar });
}

export function useRegistrarEnvioCgofi() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: registrarEnvioCgofi, retry: 0, onSettled: invalidar });
}

/** Execução de cada emenda pelo Portal da Transparência (migration 204), lida uma vez por dia pelo servidor. */
export function useExecucaoEmendas({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'execucao-portal'], queryFn: fetchExecucaoEmendas, staleTime: 30 * 60_000, enabled });
}

/** Dados da ata para os quadros da autorização de empenho (pregão, UASG, fornecedor, SEI da ata assinada). */
export function useDadosDaAtaParaAutorizacao(ataKey: string | null) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'ata-autorizacao', ataKey], queryFn: () => fetchDadosDaAtaParaAutorizacao(ataKey!), enabled: Boolean(ataKey), staleTime: 30 * 60_000 });
}

export function useRegistrarAnulacao() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: registrarAnulacaoEmpenho, retry: 0, onSettled: invalidar });
}

export function useCancelarPedido() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: (v: { id: string; versao: number; motivo: string }) => cancelarPedidoEmenda(v.id, v.versao, v.motivo), retry: 0, onSettled: invalidar });
}

/** Emendas vistas no SIOP (migration 205): todos os que leem as emendas. */
export function useEmendasSiop({ enabled = true }: LeituraOpcional = {}) {
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'emendas-siop'], queryFn: fetchEmendasSiop, enabled });
}

/** Contatos das emendas e ASPAR dos órgãos: só quem trata com eles, coordenador e gestor de emendas (o banco também). */
export function useContatosDasEmendas({ enabled = true }: LeituraOpcional = {}) {
  const podeGerir = usePodeGerirEmendas();
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'emendas-contatos'], queryFn: fetchContatosDasEmendas, enabled: enabled && podeGerir });
}

export function useAsparDosOrgaos() {
  const podeGerir = usePodeGerirEmendas();
  return useQuery({ queryKey: [...CHAVE_EMENDAS, 'aspar'], queryFn: fetchAsparDosOrgaos, enabled: podeGerir });
}

/** Emenda nova ou alterada mexe na lista e nos avisos: recarrega tudo de Emendas, como o pedido. */
export function useSalvarEmendaSiop() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: salvarEmendaSiop, retry: 0, onSettled: invalidar });
}

export function useSalvarValorOficio() {
  const invalidar = useInvalidarPedidos();
  return useMutation({
    mutationFn: (v: { id: string; versao: number; valor: number; documentoSei: string; retificador: boolean }) =>
      salvarValorOficioPedido(v.id, v.versao, { valor: v.valor, documentoSei: v.documentoSei, retificador: v.retificador }),
    retry: 0,
    onSettled: invalidar
  });
}

export function useApagarEmendaSiop() {
  const invalidar = useInvalidarPedidos();
  return useMutation({ mutationFn: (v: { id: string; versao: number }) => apagarEmendaSiop(v.id, v.versao), retry: 0, onSettled: invalidar });
}

export function useRegistrarContatoEmenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { emendaId: string; contato: Parameters<typeof registrarContatoEmenda>[1] }) => registrarContatoEmenda(v.emendaId, v.contato),
    retry: 0,
    onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'emendas-contatos'] })
  });
}

export function useSalvarAspar() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: salvarAsparEmenda, retry: 0, onSettled: () => qc.invalidateQueries({ queryKey: [...CHAVE_EMENDAS, 'aspar'] }) });
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

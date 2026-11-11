import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useUsers } from './useUsers';
import {
  definirFiscalizacaoContrato,
  definirPrevistaEntregas,
  definirResponsavelEntregas,
  dividirEntrega,
  fetchEntregasDoPedido,
  fetchEntregasFiscalizacao,
  fetchMovimentosDaEntrega,
  mudarEtapaEntregas,
  type EntregaDaLinha,
  type EntregaFiscalizacao,
  type MovimentoEntrega,
  fetchContratosFiscalizacao,
  registrarProcessoFiscalizacao,
  type ContratoFiscalizacao,
  type DefinirFiscalizacaoInput,
  desfazerTransferenciaFiscal,
  fetchTransferenciasFiscal,
  transferirContratosFiscal,
  transferirContratosFiscalTemporaria,
  type TransferenciaFiscal,
  definirProgramaDasEntregas,
  excluirProgramaFiscalizacao,
  fetchProgramasFiscalizacao,
  salvarProgramaFiscalizacao,
  type ProgramaFiscalizacao
} from '../services/fiscalizacaoService';

export const FISCALIZACAO_CONTRATOS_KEY = ['fiscalizacao', 'contratos'] as const;
export const FISCALIZACAO_ENTREGAS_KEY = ['fiscalizacao', 'entregas'] as const;
export const FISCALIZACAO_TRANSFERENCIAS_KEY = ['fiscalizacao', 'transferencias'] as const;
export const FISCALIZACAO_PROGRAMAS_KEY = ['fiscalizacao', 'programas'] as const;

/** Quem lê a fiscalização (fiscalizacao.view, migration 259). */
export function podeVerFiscalizacao(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor_fiscalizacao' || role === 'gestor' || role === 'leitor';
}

/** Contratos com a situação da fiscalização (decisão do coordenador ou padrão). */
export function useContratosFiscalizacao() {
  const { role } = useAuth();
  return useQuery<ContratoFiscalizacao[], Error>({
    queryKey: FISCALIZACAO_CONTRATOS_KEY,
    queryFn: fetchContratosFiscalizacao,
    enabled: podeVerFiscalizacao(role),
    staleTime: 60 * 1000
  });
}

/** A fiscalização de um contrato (mesma consulta e cache da lista). */
export function useFiscalizacaoDoContrato(contractKey: string | null | undefined) {
  const consulta = useContratosFiscalizacao();
  const contrato = useMemo(() => (contractKey ? (consulta.data ?? []).find((c) => c.contractKey === contractKey) ?? null : null), [consulta.data, contractKey]);
  return { consulta, contrato };
}

/** Servidores ativos com o perfil Gestor de Fiscalização (os que podem ser fiscal). */
export function useFiscaisAtivos() {
  const usuarios = useUsers();
  const fiscais = useMemo(
    () =>
      (usuarios.data ?? [])
        .filter((u) => u.ativo && u.perfil === 'gestor_fiscalizacao')
        .map((u) => ({ id: u.id, nome: u.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [usuarios.data]
  );
  return { fiscais, consulta: usuarios };
}

export function useDefinirFiscalizacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DefinirFiscalizacaoInput) => definirFiscalizacaoContrato(input),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY }), qc.invalidateQueries({ queryKey: FISCALIZACAO_ENTREGAS_KEY })])
  });
}

export function useRegistrarProcessoFiscalizacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contractKey: string; processoSei: string; autuadoEm: string }) => registrarProcessoFiscalizacao(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY })
  });
}

/** Entregas de um contrato (ou de todos, sem contrato). */
export function useEntregasFiscalizacao(contractKey?: string | null) {
  const { role } = useAuth();
  return useQuery<EntregaFiscalizacao[], Error>({
    queryKey: [...FISCALIZACAO_ENTREGAS_KEY, contractKey ?? 'todas'],
    queryFn: () => fetchEntregasFiscalizacao(contractKey ?? null),
    enabled: podeVerFiscalizacao(role),
    staleTime: 60 * 1000
  });
}

export function useMovimentosDaEntrega(entregaId: string | null) {
  return useQuery<MovimentoEntrega[], Error>({
    queryKey: [...FISCALIZACAO_ENTREGAS_KEY, 'movimentos', entregaId],
    queryFn: () => fetchMovimentosDaEntrega(entregaId as string),
    enabled: Boolean(entregaId)
  });
}

function useMutacaoDeEntregas<I>(fn: (input: I) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCALIZACAO_ENTREGAS_KEY })
  });
}

export const useMudarEtapaEntregas = () => useMutacaoDeEntregas(mudarEtapaEntregas);
export const useDividirEntrega = () => useMutacaoDeEntregas(dividirEntrega);
export const useDefinirPrevistaEntregas = () => useMutacaoDeEntregas(definirPrevistaEntregas);
export const useDefinirResponsavelEntregas = () => useMutacaoDeEntregas(definirResponsavelEntregas);

/** Ausências de fiscal em curso (migration 261). */
export function useTransferenciasFiscalizacao() {
  const { role } = useAuth();
  return useQuery<TransferenciaFiscal[], Error>({
    queryKey: FISCALIZACAO_TRANSFERENCIAS_KEY,
    queryFn: fetchTransferenciasFiscal,
    enabled: podeVerFiscalizacao(role),
    staleTime: 60 * 1000
  });
}

/** Transferir e desfazer mexem no fiscal dos contratos: recarrega contratos, entregas e ausências. */
function useMutacaoDeFiscal<I, R>(fn: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY }),
        qc.invalidateQueries({ queryKey: FISCALIZACAO_ENTREGAS_KEY }),
        qc.invalidateQueries({ queryKey: FISCALIZACAO_TRANSFERENCIAS_KEY })
      ])
  });
}

export const useTransferirContratosFiscal = () => useMutacaoDeFiscal(transferirContratosFiscal);
export const useTransferirFiscalTemporaria = () => useMutacaoDeFiscal(transferirContratosFiscalTemporaria);
export const useDesfazerTransferenciaFiscal = () => useMutacaoDeFiscal(desfazerTransferenciaFiscal);

/**
 * Entregas das linhas de um pedido de emenda, por linha (régua do Pedido 360). Lê quem tem fiscalizacao.view, inclusive
 * o gestor de emendas; sem permissão ou com falha, a régua segue pelas notas (o mapa vem vazio).
 */
export function useEntregasDoPedido(pedidoId: string | null | undefined) {
  const { role } = useAuth();
  const ler = role === 'admin' || role === 'gestor_emendas' || role === 'gestor_fiscalizacao' || role === 'gestor' || role === 'leitor';
  const consulta = useQuery<EntregaDaLinha[], Error>({
    queryKey: [...FISCALIZACAO_ENTREGAS_KEY, 'pedido', pedidoId],
    queryFn: () => fetchEntregasDoPedido(pedidoId as string),
    enabled: Boolean(pedidoId) && ler,
    staleTime: 60 * 1000
  });
  const porLinha = useMemo(() => {
    const m = new Map<string, EntregaDaLinha[]>();
    for (const e of consulta.data ?? []) m.set(e.linhaId, [...(m.get(e.linhaId) ?? []), e]);
    return m;
  }, [consulta.data]);
  return { consulta, porLinha };
}

/** Programas da Fiscalização (migration 265): cadastro em Ajustes › Gestão › Programas. */
export function useProgramasFiscalizacao() {
  const { role } = useAuth();
  return useQuery<ProgramaFiscalizacao[], Error>({
    queryKey: FISCALIZACAO_PROGRAMAS_KEY,
    queryFn: fetchProgramasFiscalizacao,
    enabled: podeVerFiscalizacao(role),
    staleTime: 60 * 1000
  });
}

function useMutacaoDePrograma<I, R>(fn: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: FISCALIZACAO_PROGRAMAS_KEY }), qc.invalidateQueries({ queryKey: FISCALIZACAO_ENTREGAS_KEY })])
  });
}

export const useSalvarProgramaFiscalizacao = () => useMutacaoDePrograma(salvarProgramaFiscalizacao);
export const useExcluirProgramaFiscalizacao = () => useMutacaoDePrograma(excluirProgramaFiscalizacao);
export const useDefinirProgramaDasEntregas = () => useMutacaoDePrograma(definirProgramaDasEntregas);

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ajustarPrazoTarefaRpc,
  atualizarModuloRpc,
  marcarPedidoTarefaRpc,
  registrarRespostaTarefaRpc,
  salvarDetalhesModeloRpc,
  salvarRegraTarefaModeloRpc,
  type AtualizarModuloInput,
  type DetalhesModeloInput,
  type MarcaTarefaInput,
  type RegraTarefaModeloInput,
  type TipoInstrumento
} from '../adapters/modeloGestaoRpcAdapter';
import type { AppMutationError } from '../types/rpc';

/** Hooks do modelo de gestão da CCGA: plano do gestor (Ata 360 e Contrato 360) e modelos do coordenador. */

const chavePlano = (tipo: TipoInstrumento, key: string) => [tipo === 'ata' ? 'ata-task-plan' : 'contract-task-plan', key];
const chaveModelos = (tipo: TipoInstrumento) => [tipo === 'ata' ? 'ata-task-templates' : 'contract-task-templates'];

function usePlano<V>(tipo: TipoInstrumento, key: string, fn: (tipo: TipoInstrumento, vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation<unknown, AppMutationError | Error, V>({
    mutationFn: (vars) => fn(tipo, vars),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chavePlano(tipo, key) });
    }
  });
}

function useModelos<V>(tipo: TipoInstrumento, fn: (tipo: TipoInstrumento, vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation<unknown, AppMutationError | Error, V>({
    mutationFn: (vars) => fn(tipo, vars),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chaveModelos(tipo) });
    }
  });
}

export const useMarcarPedidoTarefa = (tipo: TipoInstrumento, key: string) =>
  usePlano<MarcaTarefaInput>(tipo, key, marcarPedidoTarefaRpc);

export const useRegistrarRespostaTarefa = (tipo: TipoInstrumento, key: string) =>
  usePlano<MarcaTarefaInput>(tipo, key, registrarRespostaTarefaRpc);

export const useAjustarPrazoTarefa = (tipo: TipoInstrumento, key: string) =>
  usePlano<{ taskId: string; prazo: string | null }>(tipo, key, ajustarPrazoTarefaRpc);

export const useAtualizarModulo = (tipo: TipoInstrumento, key: string) =>
  usePlano<AtualizarModuloInput>(tipo, key, atualizarModuloRpc);

export const useSalvarRegraTarefaModelo = (tipo: TipoInstrumento) =>
  useModelos<RegraTarefaModeloInput>(tipo, salvarRegraTarefaModeloRpc);

export const useSalvarDetalhesModelo = (tipo: TipoInstrumento) =>
  useModelos<DetalhesModeloInput>(tipo, salvarDetalhesModeloRpc);

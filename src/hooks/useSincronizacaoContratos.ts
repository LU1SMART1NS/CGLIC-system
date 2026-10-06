import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import {
  RECURSO_CONTRATOS,
  sincronizarContratos,
  type ResultadoSincronizacao
} from '../services/contratosOficiaisService';
import {
  chaveStatusSincronizacao,
  podeForcarAtualizacao,
  podeSincronizar,
  useSituacaoSincronizacao
} from './useSituacaoSincronizacao';

export {
  INTERVALO_CONFERENCIA_STATUS_MS,
  podeForcarAtualizacao,
  resumirSincronizacao
} from './useSituacaoSincronizacao';

export const SINCRONIZACAO_STATUS_KEY = chaveStatusSincronizacao(RECURSO_CONTRATOS);

/** Gestor e coordenador gravam contratos no banco (sincronização e contrato completado no 360). */
export const podeSincronizarContratos = podeSincronizar;

/** Relê do banco tudo o que depende da lista de contratos. */
export async function invalidarDadosDeContratos(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['contracts-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: SINCRONIZACAO_STATUS_KEY })
  ]);
}

function relerContratos(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['contracts-dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
}

/**
 * Situação da sincronização dos contratos e o botão "Atualizar" das carteiras.
 * - Coordenador: `atualizar` força a sincronização com as fontes oficiais das duas UASGs.
 * - Demais perfis não têm o botão; `atualizar` só relê o banco (usado no "tentar de novo" de erros).
 * Quando uma sincronização (deste ou de outro navegador) termina, as telas são recarregadas do banco.
 */
export function useSincronizacaoContratos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const situacao = useSituacaoSincronizacao(RECURSO_CONTRATOS, relerContratos);

  const [isAtualizando, setIsAtualizando] = useState(false);
  const podeForcar = podeForcarAtualizacao(role);

  const atualizar = useCallback(async () => {
    setIsAtualizando(true);
    try {
      if (podeForcar) {
        const resultados = await Promise.all(UASGS_CGLIC.map((uasg) => sincronizarContratos(uasg, { forcar: true })));
        resultados
          .filter((r): r is Extract<ResultadoSincronizacao, { status: 'ERRO' }> => r.status === 'ERRO')
          .forEach((r) => console.warn('[sincronizacaoContratos] falha ao atualizar:', r.erro));
      }
      await invalidarDadosDeContratos(queryClient);
    } finally {
      setIsAtualizando(false);
    }
  }, [podeForcar, queryClient]);

  return {
    ...situacao,
    sincronizando: isAtualizando || situacao.sincronizando,
    podeForcar,
    atualizar,
    isAtualizando
  };
}

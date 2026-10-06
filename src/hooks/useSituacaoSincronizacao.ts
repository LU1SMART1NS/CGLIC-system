import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import {
  assinarSincronizacaoLocal,
  fetchSincronizacaoStatus,
  uasgsSincronizandoAgoraDe,
  type RecursoSincronizado,
  type SincronizacaoFonteStatus
} from '../services/sincronizacaoFontesService';
import type { AppRole } from '../types/rbac';

/** Perfis que sincronizam em segundo plano (as funções do banco exigem gestor ou coordenador). */
const PERFIS_QUE_SINCRONIZAM: readonly AppRole[] = ['gestor', 'admin'];
/** Só o coordenador (backend 'admin') força a atualização pelo botão. */
const PERFIL_QUE_FORCA: AppRole = 'admin';
/** Enquanto alguém sincroniza, a situação é relida para a tela saber quando terminou. */
const INTERVALO_DURANTE_SINCRONIZACAO_MS = 30 * 1000;
/**
 * Fora disso, a aba confere a situação no banco (consulta de poucos bytes, nunca as APIs do governo).
 * Se outra pessoa sincronizou, a tela relê os dados: ninguém precisa de botão para ver dados novos.
 * Aba em segundo plano não confere (padrão do React Query).
 */
export const INTERVALO_CONFERENCIA_STATUS_MS = 5 * 60 * 1000;

export function podeSincronizar(role: AppRole | null | undefined): boolean {
  return Boolean(role && PERFIS_QUE_SINCRONIZAM.includes(role));
}

export function podeForcarAtualizacao(role: AppRole | null | undefined): boolean {
  return role === PERFIL_QUE_FORCA;
}

export function chaveStatusSincronizacao(recurso: RecursoSincronizado) {
  return ['sincronizacao-fontes', recurso] as const;
}

/**
 * Resumo da situação das UASGs: "atualizado em" é o último sucesso mais antigo (os dados só estão
 * em dia quando todas estão), e o aviso aparece quando a última tentativa de alguma saiu incompleta.
 */
export function resumirSincronizacao(statuses: SincronizacaoFonteStatus[], uasgs: readonly string[] = UASGS_CGLIC) {
  const porUasg = uasgs.map((uasg) => statuses.find((s) => s.uasg === uasg) ?? null);
  const sucessos = porUasg.map((s) => s?.ultimoSucessoEm ?? null);
  const ultimoSucessoEm = sucessos.every(Boolean)
    ? sucessos.reduce<string | null>((maisAntigo, atual) => (!maisAntigo || (atual && atual < maisAntigo) ? atual : maisAntigo), null)
    : null;
  const comFalha = porUasg.filter((s): s is SincronizacaoFonteStatus => Boolean(s && (s.ultimoStatus === 'PARCIAL' || s.ultimoStatus === 'ERRO')));
  const fontesComFalha = Array.from(new Set(comFalha.flatMap((s) => s.fontesComFalha)));
  const limiteTrava = Date.now() - 10 * 60 * 1000;
  const emAndamentoNoBanco = porUasg.some((s) => s?.emAndamentoDesde && Date.parse(s.emAndamentoDesde) > limiteTrava);
  return {
    ultimoSucessoEm,
    nuncaSincronizado: porUasg.every((s) => !s?.ultimoSucessoEm),
    incompleta: comFalha.length > 0,
    fontesComFalha,
    /** Mensagem de erro da última tentativa que falhou (a primeira encontrada). */
    mensagemFalha: comFalha.find((s) => s.mensagem)?.mensagem ?? null,
    /** Hora da última tentativa que falhou. */
    falhaEm: comFalha.map((s) => s.ultimaTentativaEm).filter((t): t is string => Boolean(t)).sort().at(-1) ?? null,
    emAndamentoNoBanco
  };
}

/**
 * Situação da sincronização de um recurso, lida do banco. Quando uma sincronização (deste ou de outro
 * navegador) termina, chama `aoConcluirOutra` para as telas relerem os dados.
 */
export function useSituacaoSincronizacao(
  recurso: RecursoSincronizado,
  aoConcluirOutra: (queryClient: QueryClient) => void
) {
  const queryClient = useQueryClient();
  const sincronizandoAqui = useSyncExternalStore(
    assinarSincronizacaoLocal,
    () => uasgsSincronizandoAgoraDe(recurso),
    () => uasgsSincronizandoAgoraDe(recurso)
  );

  const statusQuery = useQuery({
    queryKey: chaveStatusSincronizacao(recurso),
    queryFn: () => fetchSincronizacaoStatus(recurso),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: (query: { state: { data?: SincronizacaoFonteStatus[] } }) =>
      resumirSincronizacao(query.state.data ?? []).emAndamentoNoBanco ? INTERVALO_DURANTE_SINCRONIZACAO_MS : INTERVALO_CONFERENCIA_STATUS_MS
  });

  const resumo = useMemo(() => resumirSincronizacao(statusQuery.data ?? []), [statusQuery.data]);

  // Uma sincronização terminou desde a última leitura: relê os dados do banco.
  const aoConcluirRef = useRef(aoConcluirOutra);
  aoConcluirRef.current = aoConcluirOutra;
  const assinaturaAnterior = useRef<string | null>(null);
  const assinatura = (statusQuery.data ?? []).map((s) => `${s.uasg}:${s.ultimaTentativaEm}:${s.emAndamentoDesde}`).sort().join('|');
  useEffect(() => {
    if (!statusQuery.data) return;
    const anterior = assinaturaAnterior.current;
    assinaturaAnterior.current = assinatura;
    if (anterior !== null && anterior !== assinatura && !resumo.emAndamentoNoBanco) {
      aoConcluirRef.current(queryClient);
    }
  }, [assinatura, statusQuery.data, resumo.emAndamentoNoBanco, queryClient]);

  return {
    ...resumo,
    /** Alguma UASG sincronizando agora, neste ou em outro navegador. */
    sincronizando: sincronizandoAqui.length > 0 || resumo.emAndamentoNoBanco
  };
}

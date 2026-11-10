import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useUsers } from './useUsers';
import {
  definirFiscalizacaoContrato,
  fetchContratosFiscalizacao,
  registrarProcessoFiscalizacao,
  type ContratoFiscalizacao,
  type DefinirFiscalizacaoInput
} from '../services/fiscalizacaoService';

export const FISCALIZACAO_CONTRATOS_KEY = ['fiscalizacao', 'contratos'] as const;

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

/** Servidores ativos com o perfil Gestor de Fiscalização (os que podem ser fiscal ou substituto). */
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
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY })
  });
}

export function useRegistrarProcessoFiscalizacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contractKey: string; processoSei: string; autuadoEm: string }) => registrarProcessoFiscalizacao(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCALIZACAO_CONTRATOS_KEY })
  });
}

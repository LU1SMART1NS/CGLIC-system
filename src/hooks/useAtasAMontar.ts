import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAtasAMontar,
  fetchCompraAMontar,
  fetchRascunhoDaAta,
  salvarRascunhoDaAta,
  type AtaAMontar
} from '../services/atasAMontarService';
import { consultarCnpj } from '../services/emendasService';
import { useAuth } from '../context/AuthContext';
import type { RascunhoDaAta } from '../utils/ataAMontarQuadros';

/** Quem monta a ata (D8): gestor da ata e coordenador. */
export function usePodeMontarAta(): boolean {
  const { role } = useAuth();
  return role === 'admin' || role === 'gestor';
}

export function useAtasAMontar(habilitado = true) {
  return useQuery<AtaAMontar[], Error>({ queryKey: ['atas-a-montar'], queryFn: fetchAtasAMontar, enabled: habilitado, staleTime: 60_000 });
}

export function useCompraAMontar(controle: string) {
  return useQuery({ queryKey: ['atas-a-montar', 'compra', controle], queryFn: () => fetchCompraAMontar(controle), staleTime: 60_000 });
}

export function useRascunhoDaAta(controle: string, fornecedorNi: string) {
  return useQuery({ queryKey: ['atas-a-montar', 'rascunho', controle, fornecedorNi], queryFn: () => fetchRascunhoDaAta(controle, fornecedorNi), staleTime: Infinity });
}

export function useSalvarRascunhoDaAta(controle: string, fornecedorNi: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: RascunhoDaAta) => salvarRascunhoDaAta(controle, fornecedorNi, dados),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['atas-a-montar'], exact: true })
  });
}

/** Cadastro do CNPJ na Receita (BrasilAPI), para os dados do fornecedor. Sem CNPJ válido, não consulta. */
export function useFornecedorNaReceita(cnpj: string | null) {
  const d = (cnpj ?? '').replace(/\D/g, '');
  return useQuery({ queryKey: ['receita-cnpj', d], queryFn: () => consultarCnpj(d), enabled: d.length === 14, staleTime: 24 * 60 * 60 * 1000, retry: false });
}

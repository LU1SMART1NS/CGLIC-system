import { useQuery } from '@tanstack/react-query';
import { fetchCadastroUasgs, type CadastroUasg } from '../services/cadastroUasgsSyncService';

const VAZIO = new Map<string, CadastroUasg>();

/** Nome, cidade e UF das UASGs no cadastro do Compras.gov.br (migration 111); vazio enquanto não lê. */
export function useCadastroUasgs(uasgs: string[]): Map<string, CadastroUasg> {
  const codigos = [...new Set(uasgs.filter((u) => /^\d{6}$/.test(u)))].sort();
  const query = useQuery({
    queryKey: ['cadastro-uasgs', codigos.join(',')],
    queryFn: () => fetchCadastroUasgs(codigos),
    enabled: codigos.length > 0,
    staleTime: 60 * 60 * 1000
  });
  return query.data ?? VAZIO;
}

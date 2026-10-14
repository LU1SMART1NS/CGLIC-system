import { useQuery } from '@tanstack/react-query';
import { fetchCadastroUasgs, localDaUasg, type CadastroUasg } from '../services/cadastroUasgsSyncService';

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

/**
 * Linha acima do título da Ata 360 e do Item 360: "UASG 200342 · <nome> · Cidade/UF". Nas atas de outros
 * órgãos o nome e o local vêm do cadastro de UASGs; nas da CGLIC fica o nome da ata (mantém o "- SENASP").
 */
export function useEyebrowDaGerenciadora(uasg: string, nomeNaAta: string | undefined, outroOrgao: boolean): string {
  const cadastro = useCadastroUasgs(outroOrgao ? [uasg] : []).get(uasg);
  const local = cadastro ? localDaUasg(cadastro) : null;
  return [`UASG ${uasg}`, cadastro?.nome ?? nomeNaAta, local].filter(Boolean).join(' · ');
}

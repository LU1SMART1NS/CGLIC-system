import { useQuery } from '@tanstack/react-query';
import { fetchNomesCurtosItens } from '../services/nomeCurtoItemService';

const VAZIO = new Map<string, string>();

/** Rótulo do nome curto na faixa "não carregou" (sem ele, os itens mostram só a descrição). */
export const ROTULO_NOMES_CURTOS = 'nome curto dos itens';

/** Nome curto por item (chave "{numeroAta}-{uasg}-{00001}"), com a consulta para a faixa "não carregou". */
export function useNomesCurtosItensLeitura() {
  const consulta = useQuery({ queryKey: ['itens-nomes-curtos'], queryFn: fetchNomesCurtosItens, staleTime: 10 * 60 * 1000 });
  return { nomes: consulta.data ?? VAZIO, consulta };
}

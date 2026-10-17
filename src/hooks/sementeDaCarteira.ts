import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Telas 360 que leem um instrumento só (contrato, ata, contratos vinculados, fatias de GTI) começam pelo que a
 * carteira já trouxe: se a lista está no navegador e ainda vale (não foi invalidada), o instrumento sai dela, com a
 * hora da lista. Assim quem vem da carteira abre na hora e sem pedido nenhum (o React Query só relê quando a lista
 * já estaria vencida). Sem a lista, ou sem o instrumento nela, a tela lê só ele do banco.
 *
 * Use em `initialData` e `initialDataUpdatedAt` (as duas como funções, calculadas uma vez ao criar a consulta).
 */
export function sementeDaCarteira<TLista, T>(
  client: QueryClient,
  chaveDaLista: QueryKey,
  extrair: (lista: TLista) => T | undefined
): { initialData: () => T | undefined; initialDataUpdatedAt: () => number | undefined } {
  const ler = () => {
    const estado = client.getQueryState<TLista>(chaveDaLista);
    if (!estado || estado.data === undefined || estado.isInvalidated) return undefined;
    const valor = extrair(estado.data);
    return valor === undefined ? undefined : { valor, em: estado.dataUpdatedAt };
  };
  return {
    initialData: () => ler()?.valor,
    initialDataUpdatedAt: () => ler()?.em
  };
}

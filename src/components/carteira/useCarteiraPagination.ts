import { useEffect, useMemo, useState } from 'react';

/**
 * Paginação das tabelas das carteiras. Volta à página 1 só quando o conjunto listado muda
 * (filtro/busca), não quando uma linha é recalculada (ex.: gestor atribuído).
 * `signature` muda junto com o conjunto, para a tabela também limpar o que tiver expandido.
 */
export function useCarteiraPagination<T>(items: T[], getKey: (item: T) => string, pageSize: number) {
  const [page, setPage] = useState(1);
  const signature = useMemo(() => items.map(getKey).join('|'), [items, getKey]);
  useEffect(() => {
    setPage(1);
  }, [signature]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)));
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return { currentPage, setPage, pageItems, signature };
}

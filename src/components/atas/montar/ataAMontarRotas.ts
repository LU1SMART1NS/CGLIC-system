import { useSearchParams } from 'react-router-dom';
import type { AtaAMontar } from '../../../services/atasAMontarService';

export const rotaDaAtaAMontar = (a: Pick<AtaAMontar, 'anoCompra' | 'sequencialCompra' | 'fornecedorNi'>) =>
  `/atas/montar/${a.anoCompra}/${a.sequencialCompra}/${encodeURIComponent(a.fornecedorNi)}`;
export const pregaoDaAta = (a: Pick<AtaAMontar, 'numeroCompra' | 'anoCompra'>) => `${a.numeroCompra ?? '—'}/${a.anoCompra}`;

export type VerAtas = 'registradas' | 'montar';

/** Visão da Carteira › Atas no endereço: ?ver=montar (D1, aprovada em 28/10/2026). */
export function useVerAtas(): [VerAtas, (v: VerAtas) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const ver: VerAtas = searchParams.get('ver') === 'montar' ? 'montar' : 'registradas';
  // Trocar de visão começa sem os filtros da outra (cada uma tem os seus).
  const ir = (v: VerAtas) => v !== ver && setSearchParams(v === 'montar' ? { ver: 'montar' } : {});
  return [ver, ir];
}

import type { AtaAMontar } from '../../../services/atasAMontarService';

export const rotaDaAtaAMontar = (a: Pick<AtaAMontar, 'anoCompra' | 'sequencialCompra' | 'fornecedorNi'>) =>
  `/atas/montar/${a.anoCompra}/${a.sequencialCompra}/${encodeURIComponent(a.fornecedorNi)}`;
export const pregaoDaAta = (a: Pick<AtaAMontar, 'numeroCompra' | 'anoCompra'>) => `${a.numeroCompra ?? '—'}/${a.anoCompra}`;

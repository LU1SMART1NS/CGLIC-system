import type { EmendaNaLista } from '../../../utils/emendasSemPedido';

/**
 * Endereço da Emenda 360: pelo ano e o nº (8 dígitos, como no SIOP), porque o número se repete entre anos. A emenda
 * que só existe num pedido da planilha antiga, sem o ano, fica em /emendas/emendas/sem-ano/:numero.
 */
export function rotaDaEmenda(e: Pick<EmendaNaLista, 'ano' | 'numero'>): string {
  return `/emendas/emendas/${e.ano ?? 'sem-ano'}/${encodeURIComponent(e.numero)}`;
}

/** Acha a emenda do endereço na lista (registradas e as que só existem nos pedidos). */
export function emendaDoEndereco<T extends Pick<EmendaNaLista, 'ano' | 'numero'>>(lista: T[], ano: string | undefined, numero: string | undefined): T | undefined {
  const n = (numero ?? '').replace(/\D/g, '');
  return lista.find((e) => e.numero === n && (ano === 'sem-ano' ? e.ano == null : e.ano === Number(ano)));
}

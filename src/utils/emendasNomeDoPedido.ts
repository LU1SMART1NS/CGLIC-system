/**
 * Nome do pedido nas telas (migration 217, decisão do usuário de 27/10/2026): o sequencial do banco é controle interno
 * e não aparece. O pedido é numerado dentro do parlamentar, por ano da emenda (1/2026, 2/2026, 1/2027...), e só ganha
 * número quando a emenda é informada com o ano. Antes disso é uma reserva; com o nº da emenda sem o ano (pedidos da
 * planilha antiga), aparece pela emenda até a CAEP informar o ano.
 *
 * Sem import do serviço: o serviço usa estas funções para dar nome ao pedido de origem e ao pedido novo da anulação.
 */
export interface IdentidadeDoPedido {
  id: string;
  autorId: string | null;
  numeroNoAno?: number | null;
  anoDoNumero?: number | null;
  siopEmenda: string | null;
  reservadoEm: string;
  origem: 'SISTEMA' | 'PLANILHA';
}

const dataCurta = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Nº da emenda em dois blocos de 4 (código do autor e nº da emenda), como no SIOP. */
const emendaEmTexto = (numero: string): string => (/^\d{8}$/.test(numero) ? `${numero.slice(0, 4)} ${numero.slice(4)}` : numero);

/** "1/2026", ou nulo enquanto o pedido não tem número. */
export function numeroDoPedido(p: Pick<IdentidadeDoPedido, 'numeroNoAno' | 'anoDoNumero'>): string | null {
  return p.numeroNoAno && p.anoDoNumero ? `${p.numeroNoAno}/${p.anoDoNumero}` : null;
}

/** Tem o nº da emenda, mas sem o ano: não dá para numerar (a CAEP informa o ano na conferência). */
export function faltaAnoDaEmenda(p: Pick<IdentidadeDoPedido, 'numeroNoAno' | 'anoDoNumero' | 'siopEmenda'>): boolean {
  return !numeroDoPedido(p) && Boolean(p.siopEmenda);
}

/** Como o pedido aparece numa frase: "Pedido 1/2026", "Pedido da emenda 4014 0004" ou "Reserva de 02/09/2026". */
export function nomeDoPedido(p: Pick<IdentidadeDoPedido, 'numeroNoAno' | 'anoDoNumero' | 'siopEmenda' | 'reservadoEm' | 'origem'>): string {
  const numero = numeroDoPedido(p);
  if (numero) return `Pedido ${numero}`;
  if (p.siopEmenda) return `Pedido da emenda ${emendaEmTexto(p.siopEmenda)}`;
  return p.origem === 'PLANILHA' ? 'Reserva da planilha' : `Reserva de ${dataCurta(p.reservadoEm)}`;
}

/**
 * O pedido no meio de uma frase, sempre começando por "pedido" (concorda com "o ... foi cancelado"): "pedido 1/2026",
 * "pedido da emenda 4014 0004", "pedido da planilha" ou "pedido reservado em 02/09/2026".
 */
export function pedidoEmTexto(p: Pick<IdentidadeDoPedido, 'numeroNoAno' | 'anoDoNumero' | 'siopEmenda' | 'reservadoEm' | 'origem'>): string {
  const numero = numeroDoPedido(p);
  if (numero) return `pedido ${numero}`;
  if (p.siopEmenda) return `pedido da emenda ${emendaEmTexto(p.siopEmenda)}`;
  return p.origem === 'PLANILHA' ? 'pedido da planilha' : `pedido reservado em ${dataCurta(p.reservadoEm)}`;
}

/**
 * Endereço do Pedido 360: com número, pelo parlamentar, o ano e a ordem (o mesmo que a tela mostra); sem número, pelo
 * identificador interno, que só aparece no endereço e muda para o de número quando a emenda for informada.
 */
export function rotaDoPedido(p: Pick<IdentidadeDoPedido, 'id' | 'autorId' | 'numeroNoAno' | 'anoDoNumero'>): string {
  if (p.autorId && p.numeroNoAno && p.anoDoNumero) {
    return `/emendas/parlamentares/${encodeURIComponent(p.autorId)}/pedidos/${p.anoDoNumero}/${p.numeroNoAno}`;
  }
  return `/emendas/pedidos/id/${encodeURIComponent(p.id)}`;
}

/**
 * Ano da emenda nas telas de Emendas (protótipo aprovado em 28/10/2026). O ano escolhido vai no endereço (?ano=):
 * um ano ("2024"), 'sem' (pedidos com o nº da emenda, mas sem o ano) ou 'todos'. Sem ?ano=, vale o ano corrente.
 * - Ano do pedido: o da emenda principal (o mesmo do número 1/2026). A reserva sem emenda entra no ano em que foi feita.
 * - Ano encerrado: o que não foi empenhado até 31/12 perdeu o crédito; a sobra vira "Não empenhado" e não há pedido novo.
 * - A lista mostra o ano corrente e os anos que têm emenda no sistema.
 */
import type { PedidoEmenda } from '../services/emendasService';

export const ANO_SEM = 'sem';
export const ANO_TODOS = 'todos';

/** Ano em que o pedido entra no filtro: o da emenda; 'sem' com nº e sem ano; reserva sem emenda = ano da reserva. */
export function anoDoPedido(p: Pick<PedidoEmenda, 'siopEmenda' | 'siopEmendaAno' | 'reservadoEm'>): number | typeof ANO_SEM {
  if (p.siopEmendaAno != null) return p.siopEmendaAno;
  if (p.siopEmenda) return ANO_SEM;
  return Number(p.reservadoEm.slice(0, 4));
}

/** O filtro do endereço, validado: ano de 4 dígitos, 'sem', ou 'todos' (só onde a tela aceita). Fora disso, o corrente. */
export function lerAnoDaUrl(valor: string | null, anoCorrente: number, aceitaTodos: boolean): string {
  if (valor === ANO_SEM) return ANO_SEM;
  if (valor === ANO_TODOS && aceitaTodos) return ANO_TODOS;
  if (valor && /^\d{4}$/.test(valor)) return valor;
  return String(anoCorrente);
}

/** O pedido entra no filtro escolhido? */
export function pedidoNoAno(p: Pick<PedidoEmenda, 'siopEmenda' | 'siopEmendaAno' | 'reservadoEm'>, filtro: string): boolean {
  return filtro === ANO_TODOS || String(anoDoPedido(p)) === filtro;
}

/** O filtro é um ano já encerrado (antes do corrente)? */
export const anoEncerrado = (filtro: string, anoCorrente: number) => /^\d{4}$/.test(filtro) && Number(filtro) < anoCorrente;

/** O filtro é um ano (e não 'sem' nem 'todos')? */
export const filtroEhAno = (filtro: string) => /^\d{4}$/.test(filtro);

/** Anos da lista, do mais novo ao mais antigo: o corrente e os que aparecem (anos das emendas e dos pedidos). */
export function anosDaLista(anos: Iterable<number | typeof ANO_SEM | null | undefined>, anoCorrente: number): number[] {
  const s = new Set<number>([anoCorrente]);
  for (const a of anos) if (typeof a === 'number' && Number.isFinite(a)) s.add(a);
  return [...s].sort((a, b) => b - a);
}

/** Ano do filtro em texto, no meio da frase: "de 2024", "sem o ano", "de todos os anos". */
export function anoEmTexto(filtro: string): string {
  if (filtro === ANO_SEM) return 'sem o ano';
  if (filtro === ANO_TODOS) return 'de todos os anos';
  return `de ${filtro}`;
}

/** Pedidos não cancelados por ano, para o botão de ano: os anos da lista com a contagem, os sem ano e o total. */
export function contagemPorAno(pedidos: Array<Pick<PedidoEmenda, 'etapa' | 'siopEmenda' | 'siopEmendaAno' | 'reservadoEm'>>, anoCorrente: number) {
  const ativos = pedidos.filter((p) => p.etapa !== 'CANCELADO');
  const porAno = new Map<string, number>();
  for (const p of ativos) {
    const k = String(anoDoPedido(p));
    porAno.set(k, (porAno.get(k) ?? 0) + 1);
  }
  return {
    anos: anosDaLista(ativos.map(anoDoPedido), anoCorrente).map((ano) => ({ ano, count: porAno.get(String(ano)) ?? 0 })),
    semAno: porAno.get(ANO_SEM) ?? 0,
    todos: ativos.length
  };
}

/**
 * Parlamentar 360 (protótipo aprovado em 27/10/2026): o que se soma por parlamentar além da sobra das emendas
 * (emendasSobra.ts). Cada nota conta uma vez, mesmo que pague linhas de vários pedidos do mesmo parlamentar.
 */
import type { NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import { linhasAtivas } from './emendasPedidos';

export interface ExecucaoDoParlamentar {
  notas: number;
  empenhado: number;
  liquidado: number;
  pago: number;
}

/** Execução das notas dos pedidos (sem os cancelados), pelas notas que o sistema achou para as linhas. */
export function execucaoDosPedidos(pedidos: PedidoEmenda[], notas: Map<string, NotaDaLinha>): ExecucaoDoParlamentar {
  const porNota = new Map<string, NotaDaLinha>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO') continue;
    for (const l of linhasAtivas(p)) {
      const n = notas.get(l.id);
      if (n?.empenhoId) porNota.set(n.empenhoId, n);
    }
  }
  const soma = (f: (n: NotaDaLinha) => number | null) => [...porNota.values()].reduce((s, n) => s + (f(n) ?? 0), 0);
  return { notas: porNota.size, empenhado: soma((n) => n.valorEmpenhado), liquidado: soma((n) => n.valorLiquidado), pago: soma((n) => n.valorPago) };
}

/** Pago por parlamentar, para a coluna da lista (uma leitura das notas para todos). */
export function pagoPorParlamentar(pedidos: PedidoEmenda[], notas: Map<string, NotaDaLinha>): Map<string, ExecucaoDoParlamentar> {
  const porAutor = new Map<string, PedidoEmenda[]>();
  for (const p of pedidos) if (p.autorId) porAutor.set(p.autorId, [...(porAutor.get(p.autorId) ?? []), p]);
  return new Map([...porAutor.entries()].map(([autor, ps]) => [autor, execucaoDosPedidos(ps, notas)]));
}

/** Pedidos do parlamentar: as reservas (ainda sem número) primeiro, depois do mais novo ao mais antigo pelo ano e o número. */
export function pedidosDoParlamentar(pedidos: PedidoEmenda[], autorId: string): PedidoEmenda[] {
  const chave = (p: PedidoEmenda) => (p.anoDoNumero && p.numeroNoAno ? `${p.anoDoNumero}-${String(p.numeroNoAno).padStart(4, '0')}` : `9999-${p.reservadoEm}`);
  return pedidos.filter((p) => p.autorId === autorId).sort((a, b) => chave(b).localeCompare(chave(a)));
}

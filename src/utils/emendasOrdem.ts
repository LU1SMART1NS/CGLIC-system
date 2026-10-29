/**
 * Informação e Ordem de Fornecimento por contrato (migration 250). Leitura do SEI em 29/10/2026: a ComprasSUSP junta ao
 * processo do contrato uma Informação (item, emenda, beneficiário, CNPJ, local de entrega, quantidade) e o Setor de
 * Fiscalização de Contratos (SFC) emite uma Ordem por contrato, com todos os beneficiários. Contrato cujos itens do
 * pedido já têm fatura e nada registrado fica comprovado pela entrega e não pede nada.
 */
import type { NotaDaLinha, OrdemDoContrato, PedidoEmenda } from '../services/emendasService';
import { numeroDaChave } from './contractKeyUtils';
import { linhasAtivas } from './emendasPedidos';

/** A_INFORMAR: com a ComprasSUSP; NA_SFC: Informação feita, a Ordem é com a SFC; EMITIDA; COMPROVADO: já entregue. */
export type EstadoDaOrdem = 'A_INFORMAR' | 'NA_SFC' | 'EMITIDA' | 'COMPROVADO';

export interface OrdemDoContratoNoPedido {
  contractKey: string;
  /** "00057/2026". */
  numero: string;
  /** Itens (linhas ativas) do pedido neste contrato. */
  itens: number;
  registro: OrdemDoContrato | null;
  estado: EstadoDaOrdem;
}

/** A situação da Informação e da Ordem de cada contrato do pedido. Só na contratação. */
export function ordensDoPedido(p: Pick<PedidoEmenda, 'etapa' | 'linhas' | 'ordens'>, notas: Map<string, NotaDaLinha>): OrdemDoContratoNoPedido[] {
  if (p.etapa !== 'CONTRATACAO') return [];
  const porContrato = new Map<string, { itens: number; faturado: boolean }>();
  for (const l of linhasAtivas(p as PedidoEmenda)) {
    const n = notas.get(l.id);
    if (!n?.contractKey) continue;
    const c = porContrato.get(n.contractKey) ?? { itens: 0, faturado: true };
    c.itens += 1;
    c.faturado = c.faturado && Boolean(n.faturas || n.faturadoEm);
    porContrato.set(n.contractKey, c);
  }
  return [...porContrato]
    .map(([contractKey, c]) => {
      const registro = (p.ordens ?? []).find((o) => o.contractKey === contractKey) ?? null;
      const estado: EstadoDaOrdem = registro?.ordemEm ? 'EMITIDA' : registro?.informacaoEm ? 'NA_SFC' : c.faturado ? 'COMPROVADO' : 'A_INFORMAR';
      return { contractKey, numero: numeroDaChave(contractKey), itens: c.itens, registro, estado };
    })
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

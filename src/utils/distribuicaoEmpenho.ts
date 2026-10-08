import type { ItemDoContrato } from '../services/itensContratoService';
import type { DistribuicaoDoEmpenho, SugestaoDeItem, TipoSugestao } from '../services/distribuicaoEmpenhoService';

/** Item do contrato pelo número da compra, como a view v_contrato_itens_numerados agrupa. */
export interface ItemNumerado {
  numeroItem: number;
  descricao: string | null;
  tipo: string | null;
  quantidade: number | null;
  /** Preço unitário; nulo quando as linhas do mesmo número têm preços diferentes. */
  valorUnitario: number | null;
  valorTotal: number | null;
}

/** Junta as linhas do contrato com o mesmo número de item (mesma regra da migration 94). */
export function itensNumerados(itens: ItemDoContrato[]): ItemNumerado[] {
  const grupos = new Map<number, ItemDoContrato[]>();
  for (const i of itens) {
    if (i.numeroItem == null) continue;
    grupos.set(i.numeroItem, [...(grupos.get(i.numeroItem) ?? []), i]);
  }
  const soma = (l: ItemDoContrato[], f: (i: ItemDoContrato) => number | null) =>
    l.some((i) => f(i) != null) ? l.reduce((s, i) => s + (f(i) ?? 0), 0) : null;
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numeroItem, l]) => {
      const precos = new Set(l.map((i) => i.valorUnitario));
      return {
        numeroItem,
        descricao: l.find((i) => i.descricao)?.descricao ?? null,
        tipo: l.find((i) => i.tipo)?.tipo ?? null,
        quantidade: soma(l, (i) => i.quantidade),
        valorUnitario: precos.size === 1 && !precos.has(null) ? l[0].valorUnitario : null,
        valorTotal: soma(l, (i) => i.valorTotal)
      };
    });
}

/** Empenhado por item: soma das parcelas das notas com distribuição fechada (como v_contrato_itens_execucao). */
export function empenhadoPorItem(distribuicoes: DistribuicaoDoEmpenho[], ignorar?: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of distribuicoes) {
    if (d.situacao !== 'DISTRIBUIDA' || d.contratoEmpenhoId === ignorar) continue;
    for (const p of d.parcelas) m.set(p.numeroItem, (m.get(p.numeroItem) ?? 0) + p.valor);
  }
  return m;
}

const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Texto curto da sugestão ("igual ao total do item 43", "26 un do item 13 ou 7 un do item 45"). */
export function textoDaSugestao(tipo: TipoSugestao | null, sugestao: SugestaoDeItem[]): string | null {
  if (!tipo || tipo === 'SEM_SUGESTAO' || sugestao.length === 0) return null;
  if (tipo === 'TOTAL_DO_ITEM') return `igual ao total do item ${sugestao[0].numeroItem}`;
  return sugestao.map((s) => `${qtd(s.quantidade)} un do item ${s.numeroItem}`).join(' ou ');
}

/** Sugestão curta para a coluna da tabela (a completa fica nos detalhes da nota). */
export function sugestaoCurta(tipo: TipoSugestao | null, sugestao: SugestaoDeItem[]): string | null {
  if (!tipo || tipo === 'SEM_SUGESTAO' || sugestao.length === 0) return null;
  if (tipo === 'VARIAS_POSSIBILIDADES') return `${sugestao.length} sugestões`;
  if (tipo === 'TOTAL_DO_ITEM') return `sugestão: item ${sugestao[0].numeroItem} inteiro`;
  return `sugestão: ${qtd(sugestao[0].quantidade)} un do item ${sugestao[0].numeroItem}`;
}

/** Rótulo e cor da situação da nota na coluna "Itens do contrato". */
export function rotuloDaSituacao(d: DistribuicaoDoEmpenho): { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (d.situacao) {
    case 'DISTRIBUIDA':
      return { label: d.origem === 'AUTO' ? 'Vinculada automaticamente' : 'Vinculada', variant: 'success' };
    case 'A_DISTRIBUIR':
      return { label: 'A vincular', variant: 'warning' };
    case 'REVISAR':
      return { label: 'Revisar', variant: 'danger' };
    case 'SEM_ITENS':
      return { label: 'Contrato sem itens', variant: 'neutral' };
    default:
      return { label: 'Sem valor', variant: 'neutral' };
  }
}

/** Por que a distribuição precisa ser revista, em uma frase. */
export function motivoDaRevisao(d: DistribuicaoDoEmpenho): string | null {
  if (d.motivoRevisao === 'VALOR_MUDOU') {
    const antes = d.valorNaDistribuicao ?? d.valorDistribuido;
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `O valor da nota mudou de ${brl(antes)} para ${brl(d.valorNota)} depois do vínculo aos itens. Vincule de novo.`;
  }
  if (d.motivoRevisao === 'ITEM_FORA_DO_CONTRATO') return 'O vínculo usa um item que o contrato não tem mais. Vincule de novo.';
  return null;
}

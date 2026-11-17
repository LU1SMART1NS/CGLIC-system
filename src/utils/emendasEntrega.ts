import type { LinhaPedido, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import { COR_DA_SITUACAO } from '../design-system/coresDaSituacao';
import type { StatusBadgeVariant } from '../design-system/components/StatusBadge';
import type { EntregaDaLinha } from '../services/fiscalizacaoService';
import { linhasAtivas, ORDEM_ETAPA, passoNaContratacao, type PassoNaContratacao } from './emendasPedidos';
import { PASSO, passosDaLinha } from './emendasMesa';
import { dataBR } from './fiscalizacao';

/**
 * Entrega do pedido contratado, pela mesma régua do item da aba Andamento (passosDaLinha): com a Fiscalização da
 * SFC/CGLIC, as etapas dela; sem ela, as notas (faturado = entregue, liquidado = recebido, pago). O pedido fica no passo
 * do item mais atrasado, contado em itens ("3 de 5 itens entregues").
 */
export type PassoDeEntrega = 'CONTRATADO' | 'EM_FORNECIMENTO' | 'ENTREGUE_PARTE' | 'ENTREGUE' | 'RECEBIDO' | 'PAGO' | 'CONCLUIDO';

/** Filtro de etapa na aba Contratação: antes do contrato e, depois, a entrega. */
export type PassoDaContratacao = Exclude<PassoNaContratacao, 'CONTRATADO' | 'EM_EXECUCAO' | 'PAGO'> | PassoDeEntrega;

export const OPCOES_DA_CONTRATACAO: ReadonlyArray<{ value: PassoDaContratacao; label: string }> = [
  { value: 'AGUARDANDO_CONTRATO', label: 'Aguardando contrato' },
  { value: 'PARTE_CONTRATADA', label: 'Contratado em parte' },
  { value: 'CONTRATADO', label: 'Contratado' },
  { value: 'EM_FORNECIMENTO', label: 'Em fornecimento' },
  { value: 'ENTREGUE_PARTE', label: 'Entregue em parte' },
  { value: 'ENTREGUE', label: 'Entregue' },
  { value: 'RECEBIDO', label: 'Recebido' },
  { value: 'PAGO', label: 'Pago' },
  { value: 'CONCLUIDO', label: 'Concluído' }
];

/**
 * Cor da etiqueta por fase (parecer de UX, 13/11/2026): verde no contrato, azul enquanto o fornecedor trabalha,
 * roxo no recebimento, verde quando pago. Amarelo e vermelho ficam só para os avisos.
 */
export const VARIANTE_DA_ENTREGA: Record<PassoDeEntrega, StatusBadgeVariant> = {
  CONTRATADO: COR_DA_SITUACAO.CONCLUIDO,
  EM_FORNECIMENTO: COR_DA_SITUACAO.ANDAMENTO,
  ENTREGUE_PARTE: COR_DA_SITUACAO.CONFERENCIA,
  ENTREGUE: COR_DA_SITUACAO.CONFERENCIA,
  RECEBIDO: COR_DA_SITUACAO.CONFERENCIA,
  PAGO: COR_DA_SITUACAO.CONCLUIDO,
  CONCLUIDO: COR_DA_SITUACAO.CONCLUIDO
};

export interface EntregaDoPedido {
  passo: PassoDeEntrega;
  /** Etiqueta da etapa nas listas e no cartão: "Em produção", "Entregue em parte", "Recebido"... */
  rotulo: string;
  /** Itens do pedido (não unidades). */
  total: number;
  entregues: number;
  /** "40 de 222 entregues" ou "entrega prevista em 08/12/2026"; null quando não há o que dizer. */
  progresso: string | null;
  /** Itens parados no Exército (produto controlado) e com o prazo da Ordem vencido. */
  noExercito: number;
  atrasados: number;
  /** Data prevista mais antiga entre as vencidas (para o aviso). */
  vencidaDesde: string | null;
  /** Com a SFC/CGLIC acompanhando alguma entrega do pedido; sem ela, a entrega vem das notas. */
  pelaFiscalizacao: boolean;
  /** Posição no caminho do pedido (Pedido 360, indicador Etapa), de TOTAL_ETAPAS_PEDIDO. */
  posicao: number;
}

const ANTES_DA_ENTREGA = new Set(['INFO_PEDIDA', 'INFO_ENVIADA', 'ORDEM', 'PRODUCAO', 'CONTROLADO', 'TRANSITO', 'RETIRADA']);

/**
 * Etapa pelo menor passo (o item ou a parte mais atrasada), com o mesmo nome no pedido e no item. Sem a Fiscalização
 * (D3 de 13/11/2026), a etiqueta diz o que a nota mostra: uma fatura parcial não prova que o item foi entregue.
 */
function etapaPeloPasso(minimo: number, algumaEntregue: boolean, todasNoExercito: boolean, pelasNotas: boolean): [PassoDeEntrega, string] {
  if (minimo >= PASSO.SAL) return ['CONCLUIDO', 'Concluído'];
  if (minimo >= PASSO.PAGO) return ['PAGO', 'Pago'];
  if (minimo >= PASSO.RECEBIDO) return ['RECEBIDO', pelasNotas ? 'Liquidado' : 'Recebido'];
  if (minimo >= PASSO.ENTREGUE) return ['ENTREGUE', pelasNotas ? 'Faturado' : 'Entregue'];
  if (algumaEntregue) return ['ENTREGUE_PARTE', pelasNotas ? 'Faturado em parte' : 'Entregue em parte'];
  if (todasNoExercito) return ['EM_FORNECIMENTO', 'Aguardando o Exército'];
  if (minimo >= PASSO.PRODUCAO) return ['EM_FORNECIMENTO', 'Em produção'];
  if (minimo >= PASSO.ORDEM) return ['EM_FORNECIMENTO', 'Ordem enviada'];
  if (minimo >= PASSO.INFORMACOES) return ['EM_FORNECIMENTO', 'Informações enviadas'];
  return ['CONTRATADO', 'Contratado'];
}

const ehAntesDaEntrega = (e: EntregaDaLinha) => e.responsavel === 'SFC' && ANTES_DA_ENTREGA.has(e.etapa);

export function entregaDoPedido(
  p: PedidoEmenda,
  notas: Map<string, NotaDaLinha>,
  entregas: Map<string, EntregaDaLinha[]> | undefined,
  hoje: string
): EntregaDoPedido | null {
  const passoNotas = passoNaContratacao(p, notas);
  if (!passoNotas || passoNotas.passo === 'AGUARDANDO_CONTRATO' || passoNotas.passo === 'PARTE_CONTRATADA') return null;
  const linhas = linhasAtivas(p);
  const porLinha = linhas.map((l) => passosDaLinha(p, l, notas, entregas?.get(l.id)));
  const partes = porLinha.flat();
  if (!partes.length) return null;
  // Contagem por itens (parecer de 13/11/2026): somar unidades misturava cartuchos e viaturas.
  const total = linhas.length;
  const entregues = porLinha.filter((ps) => ps.every((x) => x.passo >= PASSO.ENTREGUE)).length;
  const algumaEntregue = partes.some((x) => x.passo >= PASSO.ENTREGUE);
  const noExercito = porLinha.filter((ps) => ps.some((x) => x.parado)).length;
  const minimo = Math.min(...partes.map((x) => x.passo));

  const daSfc = linhas.flatMap((l) => entregas?.get(l.id) ?? []).filter((e) => e.responsavel === 'SFC');
  const vencidas = daSfc.filter((e) => ehAntesDaEntrega(e) && e.prevista && e.prevista < hoje);
  const atrasados = new Set(vencidas.map((e) => e.linhaId)).size;
  const vencidaDesde = vencidas.map((e) => e.prevista!).sort()[0] ?? null;
  const proxima = daSfc.filter((e) => ehAntesDaEntrega(e) && e.prevista && e.prevista >= hoje).map((e) => e.prevista!).sort()[0] ?? null;

  const pelasNotas = daSfc.length === 0;
  const [passo, rotulo] = etapaPeloPasso(minimo, algumaEntregue, noExercito === total, pelasNotas);
  const progresso =
    passo === 'ENTREGUE_PARTE'
      ? entregues > 0
        ? `${entregues} de ${total} ${total === 1 ? 'item' : 'itens'} ${pelasNotas ? (total === 1 ? 'faturado' : 'faturados') : total === 1 ? 'entregue' : 'entregues'}`
        : pelasNotas ? 'fatura parcial' : 'entrega parcial'
      : !algumaEntregue && proxima
        ? `entrega prevista em ${dataBR(proxima)}`
        : null;
  // Depois do contrato, a posição anda com a régua do item (contrato, entregue, recebido, pago).
  const base = ORDEM_ETAPA.CONTRATACAO + 1;
  const posicao = base + ({ CONTRATADO: 1, EM_FORNECIMENTO: 1, ENTREGUE_PARTE: 2, ENTREGUE: 2, RECEBIDO: 3, PAGO: 4, CONCLUIDO: 4 } as const)[passo];
  return { passo, rotulo, total, entregues, progresso, noExercito, atrasados, vencidaDesde, pelaFiscalizacao: !pelasNotas, posicao };
}

/**
 * Entrega de um item do pedido (aba Itens do Pedido 360 e Item 360): a etiqueta da etapa e uma linha de detalhe só
 * ("entrega prevista em 08/12/2026", "40 de 120 entregues", "recebimento definitivo em 06/11/2026"). Null antes do
 * contrato: a célula segue com a situação de sempre.
 */
export function entregaDoItem(
  p: PedidoEmenda,
  l: LinhaPedido,
  notas: Map<string, NotaDaLinha>,
  entregas: EntregaDaLinha[] | undefined,
  hoje: string
): { passo: PassoDeEntrega; rotulo: string; detalhe: string | null; atrasadaDesde: string | null } | null {
  if (p.etapa !== 'CONTRATACAO' || !notas.get(l.id)?.contractKey) return null;
  const partes = passosDaLinha(p, l, notas, entregas);
  if (!partes.length || partes.some((x) => x.passo < PASSO.CONTRATO)) return null;
  const minimo = Math.min(...partes.map((x) => x.passo));
  const entregue = partes.filter((x) => x.passo >= PASSO.ENTREGUE).reduce((s, x) => s + x.quantidade, 0);
  const pelasNotas = !(entregas ?? []).some((e) => e.responsavel === 'SFC');
  const [passo, rotulo] = etapaPeloPasso(minimo, entregue > 0, partes.every((x) => x.parado), pelasNotas);
  const sfc = (entregas ?? []).filter(ehAntesDaEntrega);
  const vencida = sfc.filter((e) => e.prevista && e.prevista < hoje).map((e) => e.prevista!).sort()[0] ?? null;
  const prevista = sfc.filter((e) => e.prevista && e.prevista >= hoje).map((e) => e.prevista!).sort()[0] ?? null;
  // O detalhe da parte mais atrasada vem da régua ("recebimento definitivo em …"), sem o "parte de N" e sem o contrato.
  const maisAtrasada = partes.find((x) => x.passo === minimo);
  const onde = maisAtrasada?.onde?.split(' · ').filter((t) => !t.startsWith('parte de') && !t.startsWith('Contrato')).join(' · ') || null;
  const detalhe =
    passo === 'ENTREGUE_PARTE'
      ? `${entregue} de ${l.quantidade} entregues`
      : !entregue && prevista
        ? `entrega prevista em ${dataBR(prevista)}`
        : passo === 'CONTRATADO'
          ? null
          : onde;
  return { passo, rotulo, detalhe, atrasadaDesde: vencida };
}

/** Passo do pedido no filtro da aba Contratação: antes do contrato, pelas notas; depois, pela entrega. */
export function passoDaContratacao(p: PedidoEmenda, notas: Map<string, NotaDaLinha>, entrega: EntregaDoPedido | null): PassoDaContratacao | null {
  const n = passoNaContratacao(p, notas);
  if (!n) return null;
  return entrega?.passo ?? (n.passo === 'AGUARDANDO_CONTRATO' || n.passo === 'PARTE_CONTRATADA' ? n.passo : 'CONTRATADO');
}

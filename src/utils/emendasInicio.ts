/**
 * Início do gestor de emendas (protótipo aprovado em 23/10/2026): o que pede atenção nos pedidos e no saldo da CAEP.
 * Usa os mesmos avisos da lista de Pedidos (avisosDoPedido); as contas novas são o saldo livre perto do fim da ata e os
 * itens que chegaram à CAEP sem o nome da ata assinada (no quadro do parlamentar sai o começo da descrição do catálogo).
 */
import type { ConferenciaEmpenho, EtapaPedido, ItemCaep, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import { avisoIndicacaoDias, dataBR, diasEntre, limiteDaIndicacao, passouDoCorte } from './emendasKits';
import {
  ANTES_DO_EMPENHO,
  jaEmpenhado,
  avisoGrave,
  avisosDoPedido,
  GRAVIDADE_DO_AVISO,
  itensDaLinha,
  linhasAtivas,
  notaDaLinha,
  reservadoPorItem,
  TIPOS_AVISO,
  type AvisoPedido,
  type TipoAviso
} from './emendasPedidos';
import type { CredorNoPedido } from './emendasConferenciaNota';

export interface PedidoComAviso {
  pedido: PedidoEmenda;
  avisos: AvisoPedido[];
  /** Item da ata que gerou o aviso de ata (o mais urgente do pedido), para a coluna Item. */
  itemDoAviso: ItemCaep | null;
}

export interface ItemLivrePertoDoFim {
  item: ItemCaep;
  livre: number;
  diasParaVencer: number;
  /** Último dia para receber indicação (fim da ata menos o corte). */
  indicarAte: string;
  passouDoCorte: boolean;
}

export interface ResumoInicioEmendas {
  pedidosComAviso: PedidoComAviso[];
  /** Pedidos com cada tipo de aviso (um pedido pode contar em mais de um). */
  porTipo: Record<TipoAviso, number>;
  /** Pedidos com pelo menos um aviso vermelho. */
  graves: number;
  antesDoEmpenho: number;
  porEtapa: Partial<Record<EtapaPedido, number>>;
  empenhados: number;
  linhasEmpenhadas: number;
  linhasComNota: number;
  /** Saldo da CAEP nas atas vigentes. */
  itensVigentes: number;
  alocado: number;
  reservado: number;
  livre: number;
  livrePertoDoFim: ItemLivrePertoDoFim[];
  /** Itens com alocação para a CAEP em ata vigente e sem o nome da ata assinada: a CAEP cadastra antes de oferecer ao parlamentar. */
  semNomeCurto: ItemCaep[];
}

/** Item da linha a que o aviso de ata se refere: o que tem a ata mais perto do fim. */
function itemDoAviso(p: PedidoEmenda, aviso: AvisoPedido | undefined, itens: Map<string, ItemCaep>): ItemCaep | null {
  if (!aviso?.linhaId) return null;
  const linha = p.linhas.find((l) => l.id === aviso.linhaId);
  if (!linha) return null;
  const doItem = itensDaLinha(linha)
    .map((x) => itens.get(x.itemKey))
    .filter((i): i is ItemCaep => Boolean(i?.vigenciaFinal));
  return doItem.sort((a, b) => a.vigenciaFinal!.localeCompare(b.vigenciaFinal!))[0] ?? null;
}

/** Quantas linhas o aviso cita ("181 sem nota"), para pôr os pedidos maiores primeiro. */
const linhasDoAviso = (a: AvisoPedido): number => Number(a.curto.match(/^\d+/)?.[0] ?? 0);

/** Ordem da lista: aviso mais grave, depois a ata que acaba antes, depois o pedido com mais linhas pendentes. */
function comparar(a: PedidoComAviso, b: PedidoComAviso): number {
  const ga = GRAVIDADE_DO_AVISO[a.avisos[0].tipo];
  const gb = GRAVIDADE_DO_AVISO[b.avisos[0].tipo];
  if (ga !== gb) return ga - gb;
  const fa = a.itemDoAviso?.vigenciaFinal ?? '9999-12-31';
  const fb = b.itemDoAviso?.vigenciaFinal ?? '9999-12-31';
  if (fa !== fb) return fa.localeCompare(fb);
  return linhasDoAviso(b.avisos[0]) - linhasDoAviso(a.avisos[0]);
}

/**
 * Número do menu Emendas, no padrão do Financeiro: os pedidos com algum aviso (o "Com algum aviso" de Pedidos e o "Todas"
 * das pendências do Início), vermelho quando algum tem aviso vermelho (o "Pedem ação já" do Início). Mesmos dados da lista
 * de Pedidos: notas das linhas, empenhado × pedido e credor diferente ainda não resolvidos.
 */
export function avisosDosPedidosParaOMenu(
  pedidos: PedidoEmenda[],
  itensLista: ItemCaep[],
  hoje: string,
  notas: Map<string, NotaDaLinha>,
  empenho?: Map<string, ConferenciaEmpenho[]>,
  credor?: Map<string, CredorNoPedido[]>
): { comAviso: number; urgentes: number } {
  const itens = new Map(itensLista.map((i) => [i.itemKey, i]));
  let comAviso = 0;
  let urgentes = 0;
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO') continue;
    const avisos = avisosDoPedido(p, itens, hoje, notas, empenho?.get(p.id), credor?.get(p.id));
    if (avisos.length === 0) continue;
    comAviso++;
    if (avisos.some(avisoGrave)) urgentes++;
  }
  return { comAviso, urgentes };
}

/** `empenho`: diferenças entre pedido e notas ainda não resolvidas, por pedido (diferencasPorPedido, migration 187). */
export function resumoInicioEmendas(
  pedidos: PedidoEmenda[],
  itensLista: ItemCaep[],
  notas: Map<string, NotaDaLinha>,
  hoje: string,
  empenho?: Map<string, ConferenciaEmpenho[]>,
  credor?: Map<string, CredorNoPedido[]>
): ResumoInicioEmendas {
  const itens = new Map(itensLista.map((i) => [i.itemKey, i]));
  const porTipo = Object.fromEntries(TIPOS_AVISO.map((t) => [t, 0])) as Record<TipoAviso, number>;
  const porEtapa: Partial<Record<EtapaPedido, number>> = {};
  const pedidosComAviso: PedidoComAviso[] = [];
  let graves = 0;
  let antesDoEmpenho = 0;
  let empenhados = 0;
  let linhasEmpenhadas = 0;
  let linhasComNota = 0;

  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO') continue;
    porEtapa[p.etapa] = (porEtapa[p.etapa] ?? 0) + 1;
    if (ANTES_DO_EMPENHO.has(p.etapa)) antesDoEmpenho++;
    if (jaEmpenhado(p.etapa)) {
      empenhados++;
      for (const l of linhasAtivas(p)) {
        linhasEmpenhadas++;
        if (notaDaLinha(l, notas)) linhasComNota++;
      }
    }
    const avisos = avisosDoPedido(p, itens, hoje, notas, empenho?.get(p.id), credor?.get(p.id));
    if (avisos.length === 0) continue;
    for (const t of new Set(avisos.map((a) => a.tipo))) porTipo[t]++;
    if (avisos.some(avisoGrave)) graves++;
    const deAta = avisos.find((a) => a.linhaId);
    pedidosComAviso.push({ pedido: p, avisos, itemDoAviso: itemDoAviso(p, deAta, itens) });
  }
  pedidosComAviso.sort(comparar);

  const reservadoMap = reservadoPorItem(pedidos);
  const vigentes = itensLista.filter((i) => !i.ataEncerrada);
  let alocado = 0;
  let reservado = 0;
  let livre = 0;
  const livrePertoDoFim: ItemLivrePertoDoFim[] = [];
  for (const i of vigentes) {
    const r = reservadoMap.get(i.itemKey) ?? 0;
    const sobra = Math.max(0, i.alocado - r);
    alocado += i.alocado;
    reservado += Math.min(r, i.alocado);
    livre += sobra;
    if (sobra <= 0 || !i.vigenciaFinal) continue;
    const dias = diasEntre(hoje, i.vigenciaFinal);
    if (dias > avisoIndicacaoDias()) continue;
    livrePertoDoFim.push({ item: i, livre: sobra, diasParaVencer: dias, indicarAte: limiteDaIndicacao(i.vigenciaFinal), passouDoCorte: passouDoCorte(dias) });
  }
  livrePertoDoFim.sort((a, b) => a.diasParaVencer - b.diasParaVencer || b.livre - a.livre);
  const semNomeCurto = vigentes
    .filter((i) => i.alocado > 0 && !i.nomeCurto?.trim())
    .sort((a, b) => (a.vigenciaFinal ?? '9999-12-31').localeCompare(b.vigenciaFinal ?? '9999-12-31') || a.descricao.localeCompare(b.descricao, 'pt-BR'));

  return {
    pedidosComAviso,
    porTipo,
    graves,
    antesDoEmpenho,
    porEtapa,
    empenhados,
    linhasEmpenhadas,
    linhasComNota,
    itensVigentes: vigentes.length,
    alocado,
    reservado,
    livre,
    livrePertoDoFim,
    semNomeCurto
  };
}

/** Frase curta da coluna Prazo: o que o aviso pede e até quando. */
export function prazoDoAviso(a: AvisoPedido, item: ItemCaep | null, hoje: string): string {
  const fim = item?.vigenciaFinal;
  switch (a.tipo) {
    case 'ataVencida':
      return fim ? `encerrou em ${dataBR(fim)}` : 'trocar o item ou tirá-lo do pedido';
    case 'ataNoCorte':
      return fim ? `ata termina em ${diasEntre(hoje, fim)} dias` : 'confirmar com a CCGA';
    case 'ataVencendo':
      return fim ? `indicar até ${dataBR(limiteDaIndicacao(fim))}` : 'ata perto do fim';
    case 'semOficio':
      return 'cobrar o ofício do parlamentar';
    case 'divergencia':
      return 'fazer a nova minuta';
    case 'semAutorizacao':
      return 'informar a solicitação ou a assinatura de cada item';
    case 'empenhoAMais':
      return 'corrigir o pedido ou a reserva';
    case 'empenhoAMenos':
      return 'conferir as notas no SEI';
    case 'semEnvioCgofi':
      return 'registrar o envio à CGOFI';
    case 'notaEmitida':
      return 'registrar o empenho';
    case 'credorDiferente':
      return 'conferir a nota e o item';
    case 'semNota':
    default:
      return 'procurar a nota pelo contrato';
  }
}

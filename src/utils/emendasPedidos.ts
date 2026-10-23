/**
 * Regras dos pedidos das emendas (migration 157), fora das telas para poder testar: etapas, valor, itens que cada
 * linha ocupa e avisos (30 dias sem ofício, divergência com o SIOP, ata vencendo ou vencida antes do empenho).
 */
import type { AcaoPedido, EtapaPedido, ItemCaep, ItemDoKit, LinhaPedido, PedidoEmenda } from '../services/emendasService';
import { AVISO_VENCIMENTO_DIAS, dataBR, diasEntre } from './emendasKits';
import { chaveDoContrato } from './contractKeyUtils';

/** Dias de reserva sem ofício até o aviso (decisão de 23/10/2026). */
export const AVISO_SEM_OFICIO_DIAS = 30;

export const ETAPAS: ReadonlyArray<{ etapa: Exclude<EtapaPedido, 'CANCELADO'>; rotulo: string; curto: string; descricao: string }> = [
  { etapa: 'RESERVADO', rotulo: 'Reservado', curto: 'Reservados', descricao: 'A CAEP combinou com o parlamentar e separou a quantidade.' },
  { etapa: 'MINUTA', rotulo: 'Minuta enviada', curto: 'Minuta', descricao: 'A CAEP mandou a minuta do ofício ao gabinete.' },
  { etapa: 'OFICIO', rotulo: 'Ofício recebido', curto: 'Ofício', descricao: 'O ofício chegou ao MJSP e virou processo SEI na CAEP.' },
  { etapa: 'CONFERIDO', rotulo: 'Conferido no SIOP', curto: 'Conferidos', descricao: 'Nº da emenda, autor, valor, GND, beneficiário e objeto batem.' },
  { etapa: 'AUTORIZADO', rotulo: 'Empenho autorizado', curto: 'Autorizados', descricao: 'Autorização de empenho assinada.' },
  { etapa: 'EMPENHADO', rotulo: 'Empenhado · com a CCGA', curto: 'Empenhados', descricao: 'Nota emitida e processo com a CCGA; a CAEP acompanha a execução.' }
];

export const ROTULO_ETAPA: Record<EtapaPedido, string> = {
  ...(Object.fromEntries(ETAPAS.map((e) => [e.etapa, e.rotulo])) as Record<Exclude<EtapaPedido, 'CANCELADO'>, string>),
  CANCELADO: 'Cancelado'
};

export const ORDEM_ETAPA: Record<EtapaPedido, number> = { RESERVADO: 0, MINUTA: 1, OFICIO: 2, CONFERIDO: 3, AUTORIZADO: 4, EMPENHADO: 5, CANCELADO: -1 };

/** Etapas em que ainda dá para empenhar (e por isso a ata vencendo importa). */
export const ANTES_DO_EMPENHO: ReadonlySet<EtapaPedido> = new Set(['RESERVADO', 'MINUTA', 'OFICIO', 'CONFERIDO', 'AUTORIZADO']);

/** Próximo passo do pedido: a ação e o rótulo do botão. */
export function proximaAcao(etapa: EtapaPedido): { acao: AcaoPedido; rotulo: string } | null {
  switch (etapa) {
    case 'RESERVADO':
      return { acao: 'MINUTA', rotulo: 'Registrar a minuta' };
    case 'MINUTA':
      return { acao: 'OFICIO', rotulo: 'Registrar o ofício' };
    case 'OFICIO':
      return { acao: 'CONFERIDO', rotulo: 'Conferir com o SIOP' };
    case 'CONFERIDO':
      return { acao: 'AUTORIZADO', rotulo: 'Registrar a autorização' };
    case 'AUTORIZADO':
      return { acao: 'EMPENHADO', rotulo: 'Registrar o empenho' };
    default:
      return null;
  }
}

/** Itens e quantidades que a linha ocupa (kit aberto pela composição do dia do pedido). */
export function itensDaLinha(l: Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitComposicao' | 'quantidade'>): ItemDoKit[] {
  if (l.tipo === 'ITEM') return l.itemKey ? [{ itemKey: l.itemKey, quantidade: l.quantidade }] : [];
  return (l.kitComposicao ?? []).map((c) => ({ itemKey: c.itemKey, quantidade: c.quantidade * l.quantidade }));
}

export const linhasAtivas = (p: PedidoEmenda): LinhaPedido[] => p.linhas.filter((l) => !l.cancelada);

/** Reservado por item somando pedidos e linhas não cancelados (a mesma conta da view do banco). */
export function reservadoPorItem(pedidos: PedidoEmenda[], excluirPedidoId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO' || p.id === excluirPedidoId) continue;
    for (const l of linhasAtivas(p)) for (const x of itensDaLinha(l)) m.set(x.itemKey, (m.get(x.itemKey) ?? 0) + x.quantidade);
  }
  return m;
}

export function valorDaLinha(l: Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitComposicao' | 'quantidade'>, itens: Map<string, ItemCaep>): number {
  return itensDaLinha(l).reduce((s, x) => s + x.quantidade * (itens.get(x.itemKey)?.valorUnitario ?? 0), 0);
}

export function valorDoPedido(p: PedidoEmenda, itens: Map<string, ItemCaep>): number {
  return linhasAtivas(p).reduce((s, l) => s + valorDaLinha(l, itens), 0);
}

/**
 * Como a pessoa reconhece o pedido: pelo ofício, quando já chegou; antes disso, pela data da reserva. A reserva é uma
 * conversa com a assessoria, não um documento: o número interno do banco não aparece nas telas. Pedido que veio das
 * planilhas da CAEP (migration 160) não tem o número do ofício: vale o da emenda; a reserva da planilha não tem data.
 */
export function identificacaoDoPedido(p: Pick<PedidoEmenda, 'oficioNumero' | 'reservadoEm'> & Partial<Pick<PedidoEmenda, 'siopEmenda' | 'origem'>>): string {
  if (p.oficioNumero) return p.oficioNumero;
  if (p.siopEmenda) return `Emenda ${p.siopEmenda}`;
  return p.origem === 'PLANILHA' ? 'Reserva da planilha' : `Reserva de ${dataBR(p.reservadoEm)}`;
}

/** UASG dos contratos citados na planilha de execução da CAEP (os 130 achados em 23/10/2026 eram todos da 200331). */
const UASG_DOS_CONTRATOS_DAS_EMENDAS = '200331';

/** Chave do contrato no sistema a partir do número da planilha ('00138/2026' → '200331-00138-2026'). */
export function chaveDoContratoDaEmenda(numero: string | null): string | null {
  const m = numero?.match(/^(\d{5})\/(\d{4})$/);
  return m ? chaveDoContrato({ uasg: UASG_DOS_CONTRATOS_DAS_EMENDAS, numero: m[1], ano: m[2] }) || null : null;
}

/** Último contato da assessoria usado com cada autor (para sugerir na próxima reserva). */
export function ultimoContatoPorAutor(pedidos: PedidoEmenda[]): Map<string, Pick<PedidoEmenda, 'contatoNome' | 'contatoTelefone' | 'contatoEmail'>> {
  const m = new Map<string, Pick<PedidoEmenda, 'contatoNome' | 'contatoTelefone' | 'contatoEmail'>>();
  for (const p of [...pedidos].sort((a, b) => (a.atualizadoEm ?? a.reservadoEm).localeCompare(b.atualizadoEm ?? b.reservadoEm))) {
    if (p.contatoNome || p.contatoTelefone || p.contatoEmail) m.set(p.autorId, { contatoNome: p.contatoNome, contatoTelefone: p.contatoTelefone, contatoEmail: p.contatoEmail });
  }
  return m;
}

export type TipoAviso = 'semOficio' | 'divergencia' | 'ataVencida' | 'ataVencendo' | 'aConferir';

export interface AvisoPedido {
  tipo: TipoAviso;
  texto: string;
  /** Linha a que o aviso se refere (ata), quando houver. */
  linhaId?: string;
}

/** Situação da ata de cada item da linha, só antes do empenho: vencida ou vencendo em até 60 dias. */
export function ataDaLinha(p: PedidoEmenda, l: LinhaPedido, itens: Map<string, ItemCaep>, hoje: string): AvisoPedido | null {
  if (!ANTES_DO_EMPENHO.has(p.etapa) || l.cancelada) return null;
  const doItem = itensDaLinha(l)
    .map((x) => itens.get(x.itemKey))
    .filter((i): i is ItemCaep => Boolean(i?.vigenciaFinal));
  const vencida = doItem.find((i) => i.ataEncerrada);
  if (vencida) return { tipo: 'ataVencida', texto: `Ata ${vencida.numeroAta} encerrada em ${dataBR(vencida.vigenciaFinal)}: não dá para empenhar`, linhaId: l.id };
  const vencendo = doItem
    .map((i) => ({ i, d: diasEntre(hoje, i.vigenciaFinal!) }))
    .filter((x) => x.d <= AVISO_VENCIMENTO_DIAS)
    .sort((a, b) => a.d - b.d)[0];
  if (vencendo) return { tipo: 'ataVencendo', texto: `Ata ${vencendo.i.numeroAta} vence em ${vencendo.d} dias (${dataBR(vencendo.i.vigenciaFinal)}): empenhar até lá`, linhaId: l.id };
  return null;
}

export function avisosDoPedido(p: PedidoEmenda, itens: Map<string, ItemCaep>, hoje: string): AvisoPedido[] {
  const avisos: AvisoPedido[] = [];
  if (p.etapa === 'RESERVADO' || p.etapa === 'MINUTA') {
    const dias = diasEntre(p.reservadoEm, hoje);
    if (dias > AVISO_SEM_OFICIO_DIAS) avisos.push({ tipo: 'semOficio', texto: `${dias} dias sem ofício` });
  }
  if (p.etapa === 'OFICIO' && p.divergencia) avisos.push({ tipo: 'divergencia', texto: 'Divergência com o SIOP' });
  const aConferir = linhasAtivas(p).filter((l) => l.aConferir).length;
  if (aConferir) avisos.push({ tipo: 'aConferir', texto: `${aConferir} ${aConferir === 1 ? 'linha' : 'linhas'} a conferir` });
  const atas = linhasAtivas(p)
    .map((l) => ataDaLinha(p, l, itens, hoje))
    .filter((a): a is AvisoPedido => Boolean(a));
  const vencida = atas.find((a) => a.tipo === 'ataVencida');
  if (vencida) avisos.push({ ...vencida, texto: `${vencida.texto.split(':')[0]}: trocar o item ou tirar a linha` });
  else if (atas.length) avisos.push(atas.sort((a, b) => a.texto.localeCompare(b.texto))[0]);
  return avisos;
}

/** Data em que o pedido entrou em cada etapa (para a linha do tempo). */
export function dataDaEtapa(p: PedidoEmenda, etapa: EtapaPedido): string | null {
  switch (etapa) {
    case 'RESERVADO':
      return p.reservadoEm;
    case 'MINUTA':
      return p.minutaEm;
    case 'OFICIO':
      return p.oficioEm;
    case 'CONFERIDO':
      return p.conferidoEm;
    case 'AUTORIZADO':
      return p.autorizadoEm;
    case 'EMPENHADO':
      return p.empenhadoEm;
    default:
      return p.canceladoEm;
  }
}

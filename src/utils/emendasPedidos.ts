/**
 * Regras dos pedidos das emendas (migration 157), fora das telas para poder testar: etapas, valor, itens que cada
 * linha ocupa e avisos (30 dias sem ofício, divergência com o SIOP, ata vencendo ou vencida antes do empenho).
 */
import type { AcaoPedido, EtapaPedido, ItemCaep, ItemDoKit, LinhaPedido, MotivoSemNota, NotaDaLinha, PedidoEmenda, RegraDaNota } from '../services/emendasService';
import { avisoIndicacaoDias, corteIndicacaoDias, dataBR, diasEntre, passouDoCorte } from './emendasKits';
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
    if (p.autorId && (p.contatoNome || p.contatoTelefone || p.contatoEmail)) m.set(p.autorId, { contatoNome: p.contatoNome, contatoTelefone: p.contatoTelefone, contatoEmail: p.contatoEmail });
  }
  return m;
}

/** Nome mostrado no lugar do autor na reserva para um órgão (migration 163). */
export const AUTOR_A_DEFINIR = 'Parlamentar a definir';

/** Reserva feita a pedido de um órgão (o beneficiário final), ainda sem parlamentar. */
export const eReservaParaOrgao = (p: Pick<PedidoEmenda, 'autorId'>): boolean => !p.autorId;

/** Órgão(s) para quem a reserva sem autor foi feita: os beneficiários das linhas. */
export function orgaoDoPedido(p: PedidoEmenda, nomeDoBeneficiario: (id: string) => string | undefined): string | null {
  const nomes = [...new Set(linhasAtivas(p).map((l) => (l.beneficiarioId ? nomeDoBeneficiario(l.beneficiarioId) : null)).filter((n): n is string => Boolean(n)))];
  if (nomes.length === 0) return null;
  return nomes.length === 1 ? nomes[0] : `${nomes[0]} e mais ${nomes.length - 1}`;
}

export type TipoAviso = 'semOficio' | 'divergencia' | 'ataVencida' | 'ataNoCorte' | 'ataVencendo' | 'aConferir' | 'semNota';

export interface AvisoPedido {
  tipo: TipoAviso;
  /** Frase completa: no detalhe da linha e ao parar o mouse na etiqueta. */
  texto: string;
  /** Etiqueta da lista, de até 3 palavras, para a coluna não crescer. */
  curto: string;
  /** Linha a que o aviso se refere (ata), quando houver. */
  linhaId?: string;
}

/** Do mais grave ao mais leve: na lista aparece só o primeiro, com "+N" para os outros. */
export const GRAVIDADE_DO_AVISO: Record<TipoAviso, number> = { ataVencida: 0, ataNoCorte: 1, divergencia: 2, semOficio: 3, ataVencendo: 4, semNota: 5, aConferir: 6 };

/** Avisos que pedem ação já (vermelho); os demais são de atenção (amarelo). */
export const avisoGrave = (a: Pick<AvisoPedido, 'tipo'>) => GRAVIDADE_DO_AVISO[a.tipo] <= GRAVIDADE_DO_AVISO.semOficio;

/** Situação da ata de cada item da linha, só antes do empenho: vencida ou vencendo em até 60 dias. */
export function ataDaLinha(p: PedidoEmenda, l: LinhaPedido, itens: Map<string, ItemCaep>, hoje: string): AvisoPedido | null {
  if (!ANTES_DO_EMPENHO.has(p.etapa) || l.cancelada) return null;
  const doItem = itensDaLinha(l)
    .map((x) => itens.get(x.itemKey))
    .filter((i): i is ItemCaep => Boolean(i?.vigenciaFinal));
  const vencida = doItem.find((i) => i.ataEncerrada);
  if (vencida) return { tipo: 'ataVencida', curto: 'Ata encerrada', texto: `Ata ${vencida.numeroAta} encerrada em ${dataBR(vencida.vigenciaFinal)}: não dá para empenhar`, linhaId: l.id };
  const prazos = doItem.map((i) => ({ i, d: diasEntre(hoje, i.vigenciaFinal!) })).sort((a, b) => a.d - b.d);
  // O limite é o contrato assinado antes do fim da ata (decisão de 23/10/2026), não o empenho.
  const noCorte = prazos.find((x) => passouDoCorte(x.d));
  if (noCorte) {
    return {
      tipo: 'ataNoCorte',
      curto: 'Prazo de indicação vencido',
      texto: `Ata ${noCorte.i.numeroAta} termina em ${noCorte.d} dias (${dataBR(noCorte.i.vigenciaFinal)}): passou do prazo de indicação (${corteIndicacaoDias()} dias); confirmar com a CCGA se ainda dá para contratar`,
      linhaId: l.id
    };
  }
  const vencendo = prazos.find((x) => x.d <= avisoIndicacaoDias());
  if (vencendo) return { tipo: 'ataVencendo', curto: `Ata vence em ${vencendo.d} dias`, texto: `Ata ${vencendo.i.numeroAta} vence em ${vencendo.d} dias (${dataBR(vencendo.i.vigenciaFinal)}): contrato assinado até lá`, linhaId: l.id };
  return null;
}

export function avisosDoPedido(p: PedidoEmenda, itens: Map<string, ItemCaep>, hoje: string, notas?: Map<string, NotaDaLinha>): AvisoPedido[] {
  const avisos: AvisoPedido[] = [];
  if (p.etapa === 'RESERVADO' || p.etapa === 'MINUTA') {
    const dias = diasEntre(p.reservadoEm, hoje);
    if (dias > AVISO_SEM_OFICIO_DIAS) {
      const texto = p.autorId ? `${dias} dias sem ofício` : `${dias} dias sem parlamentar`;
      avisos.push({ tipo: 'semOficio', curto: texto, texto: `${texto} desde a reserva (${dataBR(p.reservadoEm)})` });
    }
  }
  if (p.etapa === 'OFICIO' && p.divergencia) avisos.push({ tipo: 'divergencia', curto: 'Divergência no SIOP', texto: `Divergência com o SIOP: ${p.divergencia}` });
  if (notas && p.etapa === 'EMPENHADO') {
    const semNota = linhasSemNota(p, notas).length;
    if (semNota) avisos.push({ tipo: 'semNota', curto: `${semNota} sem nota`, texto: `${semNota} ${semNota === 1 ? 'linha' : 'linhas'} sem nota de empenho` });
  }
  const aConferir = linhasAtivas(p).filter((l) => l.aConferir).length;
  if (aConferir) {
    avisos.push({ tipo: 'aConferir', curto: `${aConferir} a conferir`, texto: `${aConferir} ${aConferir === 1 ? 'linha' : 'linhas'} a conferir entre as planilhas da CAEP` });
  }
  const atas = linhasAtivas(p)
    .map((l) => ataDaLinha(p, l, itens, hoje))
    .filter((a): a is AvisoPedido => Boolean(a));
  const vencida = atas.find((a) => a.tipo === 'ataVencida');
  if (vencida) avisos.push({ ...vencida, texto: `${vencida.texto.split(':')[0]}: trocar o item ou tirar a linha` });
  else if (atas.length) {
    const prioridade = (a: AvisoPedido) => (a.tipo === 'ataNoCorte' ? 0 : 1);
    avisos.push(atas.sort((a, b) => prioridade(a) - prioridade(b) || a.texto.localeCompare(b.texto))[0]);
  }
  return avisos.sort((a, b) => GRAVIDADE_DO_AVISO[a.tipo] - GRAVIDADE_DO_AVISO[b.tipo]);
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

/** Como a nota foi achada (migration 164), para mostrar embaixo do número. */
export const ROTULO_REGRA_DA_NOTA: Record<RegraDaNota, string> = {
  CONTRATO: 'achada pelo contrato',
  ITEM: 'achada pelo item da ata',
  AUTOR: 'achada pelo autor'
};

/** Por que a linha empenhada ainda não tem nota. */
export const ROTULO_MOTIVO_SEM_NOTA: Record<MotivoSemNota, string> = {
  SEM_CONTRATO: 'a planilha não traz o contrato',
  CONTRATO_FORA: 'o contrato não está no sistema',
  CONTRATO_SEM_NOTA: 'o contrato ainda não tem nota no sistema',
  OUTRAS_EMENDAS: 'o contrato só tem notas de outras emendas',
  VARIAS: 'há mais de uma nota possível',
  SEM_EMENDA: 'o pedido não tem o número da emenda'
};

/** Nota da linha: a digitada pela CAEP no empenho vale mais que a achada pelo sistema. */
export function notaDaLinha(l: Pick<LinhaPedido, 'id' | 'notaEmpenho'>, notas: Map<string, NotaDaLinha>): string | null {
  return l.notaEmpenho ?? notas.get(l.id)?.nota ?? null;
}

export const linhasSemNota = (p: PedidoEmenda, notas: Map<string, NotaDaLinha>): LinhaPedido[] => linhasAtivas(p).filter((l) => !notaDaLinha(l, notas));

export interface ExecucaoDoPedido {
  notas: number;
  empenhado: number;
  liquidado: number;
  pago: number;
  /** Próxima entrega prevista nos contratos das notas (informada pelo gestor do contrato). */
  proximaEntrega: { data: string; valor: number | null } | null;
  linhasSemNota: number;
}

/**
 * Execução do pedido pelas notas achadas: cada nota conta uma vez (várias linhas podem estar na mesma nota). Os valores
 * são os da nota inteira, que pode ter também outros itens da mesma emenda no contrato.
 */
export function execucaoDoPedido(p: PedidoEmenda, notas: Map<string, NotaDaLinha>): ExecucaoDoPedido {
  const porNota = new Map<string, NotaDaLinha>();
  let proximaEntrega: ExecucaoDoPedido['proximaEntrega'] = null;
  for (const l of linhasAtivas(p)) {
    const n = notas.get(l.id);
    if (!n) continue;
    if (n.empenhoId) porNota.set(n.empenhoId, n);
    if (n.entregaPrevista && (!proximaEntrega || n.entregaPrevista < proximaEntrega.data)) proximaEntrega = { data: n.entregaPrevista, valor: n.entregaPrevistaValor };
  }
  const soma = (f: (n: NotaDaLinha) => number | null) => [...porNota.values()].reduce((s, n) => s + (f(n) ?? 0), 0);
  return {
    notas: porNota.size,
    empenhado: soma((n) => n.valorEmpenhado),
    liquidado: soma((n) => n.valorLiquidado),
    pago: soma((n) => n.valorPago),
    proximaEntrega,
    linhasSemNota: linhasSemNota(p, notas).length
  };
}

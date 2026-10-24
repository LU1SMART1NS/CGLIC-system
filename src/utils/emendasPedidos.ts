/**
 * Regras dos pedidos das emendas (migration 157), fora das telas para poder testar: etapas, valor, itens que cada
 * linha ocupa e avisos (30 dias sem ofício, divergência com o SIOP, ata vencendo ou vencida antes do empenho).
 */
import type { AcaoPedido, EtapaPedido, ItemCaep, ItemDoKit, LinhaPedido, MotivoSemNota, NotaDaLinha, PedidoEmenda, RegraDaNota } from '../services/emendasService';
import { avisoIndicacaoDias, corteIndicacaoDias, dataBR, diasEntre, passouDoCorte } from './emendasKits';
import { chaveDoContrato } from './contractKeyUtils';
import { formatCurrency } from './format';
import type { PrecoPrevisto } from '../services/emendasQuadroService';

/** Dias de reserva sem ofício até o aviso (decisão de 23/10/2026). */
export const AVISO_SEM_OFICIO_DIAS = 30;

export const ETAPAS: ReadonlyArray<{ etapa: Exclude<EtapaPedido, 'CANCELADO'>; rotulo: string; curto: string; descricao: string }> = [
  { etapa: 'RESERVADO', rotulo: 'Itens reservados', curto: 'Reservados', descricao: 'A CAEP combinou com o parlamentar e separou a quantidade.' },
  { etapa: 'MINUTA', rotulo: 'Minuta enviada ao parlamentar', curto: 'Minuta', descricao: 'A CAEP mandou a minuta do ofício ao parlamentar.' },
  { etapa: 'OFICIO', rotulo: 'Ofício recebido', curto: 'Ofício', descricao: 'O ofício chegou ao MJSP e virou processo SEI na CAEP.' },
  { etapa: 'CONFERIDO', rotulo: 'Emenda conferida no SIOP', curto: 'Conferidos', descricao: 'Nº da emenda, autor, valor, GND, beneficiário e objeto batem.' },
  { etapa: 'SOLICITADO', rotulo: 'Empenho solicitado', curto: 'Solicitados', descricao: 'A CAEP elaborou a solicitação de empenho e enviou à DGFNSP.' },
  { etapa: 'AUTORIZADO', rotulo: 'Empenho autorizado', curto: 'Autorizados', descricao: 'A DGFNSP assinou a solicitação de empenho.' },
  { etapa: 'CGOFI', rotulo: 'Processo enviado à CGOFI', curto: 'Na CGOFI', descricao: 'A CAEP enviou à CGOFI para fazer o empenho.' },
  { etapa: 'EMPENHADO', rotulo: 'Nota de empenho emitida', curto: 'Empenhados', descricao: 'A CGOFI emitiu as notas de empenho (uma por fornecedor).' },
  { etapa: 'CONTRATACAO', rotulo: 'Processo enviado à CCGA', curto: 'Na CCGA', descricao: 'Despacho para contratação à CCGA; a CAEP acompanha a execução.' }
];

/**
 * Fases da linha do tempo do pedido. A última etapa, Contratado, não é gravada: vem do contrato das notas no
 * Contratos.gov.br (ver contratosDoPedido).
 */
export type FasePedido = 'INTERLOCUCAO' | 'EMPENHO' | 'CONTRATACAO';
export const FASES_PEDIDO: ReadonlyArray<{ id: FasePedido; nome: string; etapas: ReadonlyArray<Exclude<EtapaPedido, 'CANCELADO'>> }> = [
  { id: 'INTERLOCUCAO', nome: 'Interlocução', etapas: ['RESERVADO', 'MINUTA', 'OFICIO'] },
  { id: 'EMPENHO', nome: 'Empenho', etapas: ['CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO'] },
  { id: 'CONTRATACAO', nome: 'Contratação', etapas: ['CONTRATACAO'] }
];

/** Fase de uma etapa (o cancelado não tem fase). */
export const faseDaEtapa = (etapa: EtapaPedido): FasePedido | null => FASES_PEDIDO.find((f) => (f.etapas as readonly EtapaPedido[]).includes(etapa))?.id ?? null;

/** Etapas da linha do tempo: as 9 gravadas e Contratado. */
export const TOTAL_ETAPAS_PEDIDO = ETAPAS.length + 1;

export const ROTULO_ETAPA: Record<EtapaPedido, string> = {
  ...(Object.fromEntries(ETAPAS.map((e) => [e.etapa, e.rotulo])) as Record<Exclude<EtapaPedido, 'CANCELADO'>, string>),
  CANCELADO: 'Cancelado'
};

export const ORDEM_ETAPA: Record<EtapaPedido, number> = {
  RESERVADO: 0, MINUTA: 1, OFICIO: 2, CONFERIDO: 3, SOLICITADO: 4, AUTORIZADO: 5, CGOFI: 6, EMPENHADO: 7, CONTRATACAO: 8, CANCELADO: -1
};

/** Etapas em que ainda dá para empenhar (e por isso a ata vencendo importa). */
export const ANTES_DO_EMPENHO: ReadonlySet<EtapaPedido> = new Set(['RESERVADO', 'MINUTA', 'OFICIO', 'CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI']);

/** Pedido já empenhado (com ou sem o envio para contratação): tem notas e execução. */
export const jaEmpenhado = (etapa: EtapaPedido): boolean => etapa === 'EMPENHADO' || etapa === 'CONTRATACAO';

/** Etapas em que alterar itens ou quantidades volta o pedido para "Ofício recebido" (migration 174). */
export const VOLTA_AO_OFICIO: ReadonlySet<EtapaPedido> = new Set(['CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI']);

/** Etapas cujo SEI aceita vários números, um por nota (o empenho sai por fornecedor). */
export const ETAPAS_COM_VARIOS_SEI: ReadonlySet<EtapaPedido> = new Set(['EMPENHADO', 'CONTRATACAO']);

/** Próximo passo do pedido: a ação e o rótulo do botão. Depois de uma devolução, a minuta e o ofício são da nova rodada. */
export function proximaAcao(etapa: EtapaPedido, rodada = 1): { acao: Exclude<AcaoPedido, 'ACRESCENTAR_SEI' | 'DIVERGENCIA'>; rotulo: string } | null {
  switch (etapa) {
    case 'RESERVADO':
      return { acao: 'MINUTA', rotulo: rodada > 1 ? `Registrar a ${rodada}ª minuta` : 'Registrar a minuta' };
    case 'MINUTA':
      return { acao: 'OFICIO', rotulo: rodada > 1 ? `Registrar o ${rodada}º ofício` : 'Registrar o ofício' };
    case 'OFICIO':
      return { acao: 'CONFERIDO', rotulo: 'Conferir com o SIOP' };
    case 'CONFERIDO':
      return { acao: 'SOLICITADO', rotulo: 'Registrar a solicitação de empenho' };
    case 'SOLICITADO':
      return { acao: 'AUTORIZADO', rotulo: 'Registrar a autorização' };
    case 'AUTORIZADO':
      return { acao: 'CGOFI', rotulo: 'Registrar o envio à CGOFI' };
    case 'CGOFI':
      return { acao: 'EMPENHADO', rotulo: 'Registrar o empenho' };
    case 'EMPENHADO':
      return { acao: 'CONTRATACAO', rotulo: 'Registrar o envio à CCGA' };
    default:
      return null;
  }
}

/** Rodada da minuta e do ofício: 1 + o número de ofícios devolvidos (migration 174). */
export const rodadaDoPedido = (p: Pick<PedidoEmenda, 'devolucoes'>): number => (p.devolucoes?.length ?? 0) + 1;

/** Documento SEI: só números, 7 a 10 dígitos (a mesma regra das tarefas do plano). */
export const documentoSeiDaEtapaValido = (v: string): boolean => /^\d{7,10}$/.test(v.replace(/\D/g, ''));

/** Números SEI digitados num campo, separados por vírgula, ponto e vírgula ou espaço; sem repetir. */
export const numerosSei = (texto: string): string[] => [...new Set(texto.split(/[,;\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean))];

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

const centavos = (v: number): number => Math.round(v * 100) / 100;

/**
 * Preço unitário de hoje e o previsto para a emenda (o mesmo do quadro do parlamentar: reajuste da ata pelo empenho
 * provável, ver aplicarPrazoDoEmpenho). Sem os preços previstos, vale o de hoje.
 */
export function precoParaEmenda(itemKey: string, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): { previsto: number; hoje: number; preco: PrecoPrevisto | undefined } {
  const preco = precos?.get(itemKey);
  const hoje = preco?.precoAtual ?? itens.get(itemKey)?.valorUnitario ?? 0;
  return { previsto: preco?.precoPrevisto ?? hoje, hoje, preco };
}

/** Valor da linha: pelo preço previsto para a emenda quando vêm os preços; sem eles, pelo preço de hoje. */
export function valorDaLinha(l: Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitComposicao' | 'quantidade'>, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): number {
  return centavos(itensDaLinha(l).reduce((s, x) => s + centavos(x.quantidade * precoParaEmenda(x.itemKey, itens, precos).previsto), 0));
}

export function valorDoPedido(p: PedidoEmenda, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): number {
  return centavos(linhasAtivas(p).reduce((s, l) => s + valorDaLinha(l, itens, precos), 0));
}

/** O preço em texto corrido: "R$ 1.093.706,02 previsto (hoje R$ 1.051.438,15)", ou só o valor quando não muda. */
export const textoDoPreco = (previsto: number, hoje: number, unidade = ''): string =>
  Math.abs(previsto - hoje) > 0.004 ? `${formatCurrency(previsto)}${unidade} previsto (hoje ${formatCurrency(hoje)})` : `${formatCurrency(previsto)}${unidade}`;

/**
 * O valor que as telas mostram do pedido: o da emenda no SIOP, quando já foi conferida; antes disso, o previsto pelos
 * itens. O empenhado das notas não entra: a nota inteira pode ter outros itens da mesma emenda.
 */
export function valorDoPedidoNaEtapa(p: PedidoEmenda, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): { valor: number; fonte: 'EMENDA' | 'PREVISTO' } {
  if (p.siopValor != null && p.etapa !== 'CANCELADO') return { valor: p.siopValor, fonte: 'EMENDA' };
  return { valor: valorDoPedido(p, itens, precos), fonte: 'PREVISTO' };
}

/**
 * Como a pessoa reconhece o pedido: pelo processo SEI, quando o ofício já chegou (o número do ofício saiu na migration
 * 174); senão, pelo número da emenda; antes disso, pela data da reserva. A reserva é uma conversa com a assessoria, não
 * um documento: o número interno do banco não aparece nas telas. A reserva da planilha não tem data.
 */
export function identificacaoDoPedido(p: Pick<PedidoEmenda, 'reservadoEm'> & Partial<Pick<PedidoEmenda, 'oficioProcessoSei' | 'siopEmenda' | 'origem'>>): string {
  if (p.oficioProcessoSei) return `Processo ${p.oficioProcessoSei}`;
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
    // Depois de uma devolução, conta da devolução: contar da reserva faria o pedido devolvido já nascer atrasado.
    const desde = p.devolvidoEm ?? p.reservadoEm;
    const dias = diasEntre(desde, hoje);
    if (dias > AVISO_SEM_OFICIO_DIAS) {
      const texto = p.autorId ? `${dias} dias sem ofício` : `${dias} dias sem parlamentar`;
      avisos.push({ tipo: 'semOficio', curto: texto, texto: `${texto} desde ${p.devolvidoEm ? 'a devolução' : 'a reserva'} (${dataBR(desde)})` });
    }
    if (p.divergencia && p.devolvidoEm) {
      avisos.push({ tipo: 'divergencia', curto: 'Ofício devolvido', texto: `Ofício devolvido em ${dataBR(p.devolvidoEm)}: ${p.divergencia}` });
    }
  }
  if (notas && jaEmpenhado(p.etapa)) {
    const semNota = linhasSemNota(p, notas).length;
    if (semNota) avisos.push({ tipo: 'semNota', curto: `${semNota} sem nota`, texto: `${semNota} ${semNota === 1 ? 'linha' : 'linhas'} sem nota de empenho` });
  }
  const aConferir = linhasAtivas(p).filter((l) => l.aConferir).length;
  if (aConferir) {
    avisos.push({ tipo: 'aConferir', curto: `${aConferir} a conferir`, texto: `${aConferir} ${aConferir === 1 ? 'linha' : 'linhas'} a conferir com o controle anterior da CAEP` });
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
    case 'SOLICITADO':
      return p.solicitadoEm;
    case 'AUTORIZADO':
      return p.autorizadoEm;
    case 'CGOFI':
      return p.cgofiEm;
    case 'EMPENHADO':
      return p.empenhadoEm;
    case 'CONTRATACAO':
      return p.contratacaoEm;
    default:
      return p.canceladoEm;
  }
}

/** Como a nota foi achada (migrations 164 e 177), para mostrar embaixo do número. */
export const ROTULO_REGRA_DA_NOTA: Record<RegraDaNota, string> = {
  SEI: 'achada pelo SEI',
  CONTRATO: 'achada pelo contrato',
  ITEM: 'achada pelo item da ata',
  AUTOR: 'achada pelo autor'
};

/** Por que a linha empenhada ainda não tem nota. */
export const ROTULO_MOTIVO_SEM_NOTA: Record<MotivoSemNota, string> = {
  SEM_CONTRATO: 'falta o número do contrato',
  CONTRATO_FORA: 'o contrato não está no sistema',
  CONTRATO_SEM_NOTA: 'o contrato ainda não tem nota no sistema',
  OUTRAS_EMENDAS: 'o contrato só tem notas de outras emendas',
  VARIAS: 'há mais de uma nota possível',
  SEM_EMENDA: 'o pedido não tem o número da emenda'
};

/** Nota da linha: a achada pelo sistema (a nota não é mais digitada; migrations 174 e 177). */
export function notaDaLinha(l: Pick<LinhaPedido, 'id'>, notas: Map<string, NotaDaLinha>): string | null {
  return notas.get(l.id)?.nota ?? null;
}

export const linhasSemNota = (p: PedidoEmenda, notas: Map<string, NotaDaLinha>): LinhaPedido[] => linhasAtivas(p).filter((l) => !notaDaLinha(l, notas));

export interface ContratosDoPedido {
  /** Notas do pedido (sem nota ainda, conta o documento SEI do empenho ou a linha). */
  notas: number;
  comContrato: number;
  /** Chaves dos contratos achados no sistema, sem repetir. */
  contratos: string[];
  /** Todas as notas já têm contrato no Contratos.gov.br. */
  contratado: boolean;
}

/**
 * Contratos das notas do pedido, pelo contrato achado no sistema (Contratos.gov.br, refeito de hora em hora). O pedido
 * está Contratado quando foi enviado à CCGA e toda nota tem contrato; o número da planilha sem contrato no sistema não conta.
 */
export function contratosDoPedido(p: PedidoEmenda, notas: Map<string, NotaDaLinha>): ContratosDoPedido {
  const porNota = new Map<string, string | null>();
  for (const l of linhasAtivas(p)) {
    const chaveNota = notaDaLinha(l, notas) ?? l.empenhoDocumentoSei ?? l.id;
    const contrato = notas.get(l.id)?.contractKey ?? null;
    if (!porNota.has(chaveNota) || contrato) porNota.set(chaveNota, contrato ?? porNota.get(chaveNota) ?? null);
  }
  const contratos = [...new Set([...porNota.values()].filter((c): c is string => Boolean(c)))].sort();
  const comContrato = [...porNota.values()].filter(Boolean).length;
  return { notas: porNota.size, comContrato, contratos, contratado: p.etapa === 'CONTRATACAO' && porNota.size > 0 && comContrato === porNota.size };
}

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

/**
 * Documentos SEI da etapa, para o controle. No empenho e no envio para contratação junta os do pedido com os das
 * linhas (a planilha da CAEP traz um documento por nota, linha a linha).
 */
export function seiDaEtapa(p: PedidoEmenda, etapa: EtapaPedido): string[] {
  const dasLinhas = (f: (l: LinhaPedido) => string | null) => linhasAtivas(p).map(f).filter((x): x is string => Boolean(x));
  const unicos = (xs: string[]) => [...new Set(xs)].sort();
  switch (etapa) {
    case 'OFICIO':
      return p.oficioDocumentoSei ? [p.oficioDocumentoSei] : [];
    case 'SOLICITADO':
      return p.solicitadoDocumentoSei ? [p.solicitadoDocumentoSei] : [];
    case 'CGOFI':
      return p.cgofiDocumentoSei ? [p.cgofiDocumentoSei] : [];
    case 'EMPENHADO':
      return unicos([...p.empenhadoDocumentosSei, ...dasLinhas((l) => l.empenhoDocumentoSei)]);
    case 'CONTRATACAO':
      return unicos([...p.contratacaoDocumentosSei, ...dasLinhas((l) => l.despachoDocumentoSei)]);
    default:
      return [];
  }
}

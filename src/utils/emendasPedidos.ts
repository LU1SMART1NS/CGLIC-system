/**
 * Regras dos pedidos das emendas (migration 157), fora das telas para poder testar: etapas, valor, itens que cada
 * linha ocupa e avisos (30 dias sem ofício, divergência com o SIOP, ata vencendo ou vencida antes do empenho).
 */
import type { AcaoPedido, DocumentoSeiDoPedido, EtapaDoDocumento, EtapaPedido, ItemCaep, ItemDoKit, LinhaPedido, MotivoSemNota, NotaDaLinha, PedidoEmenda, RegraDaNota } from '../services/emendasService';
import { avisoIndicacaoDias, corteIndicacaoDias, curto, dataBR, diasEntre, passouDoCorte } from './emendasKits';
import { chaveDoContrato, numeroDaChave } from './contractKeyUtils';
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

export type TipoAviso = 'semOficio' | 'divergencia' | 'ataVencida' | 'ataNoCorte' | 'ataVencendo' | 'semNota' | 'semAutorizacao';

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
export const GRAVIDADE_DO_AVISO: Record<TipoAviso, number> = { ataVencida: 0, ataNoCorte: 1, divergencia: 2, semOficio: 3, ataVencendo: 4, semAutorizacao: 5, semNota: 6 };

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
  const semAutorizacao = atasSemAutorizacao(p);
  if (semAutorizacao) avisos.push(semAutorizacao);
  if (notas && jaEmpenhado(p.etapa)) {
    const semNota = linhasSemNota(p, notas).length;
    if (semNota) avisos.push({ tipo: 'semNota', curto: `${semNota} sem nota`, texto: `${semNota} ${semNota === 1 ? 'linha' : 'linhas'} sem nota de empenho` });
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

/** Ata da chave do item (numero_ata-uasg-item → numero_ata-uasg), como no banco (migration 178). */
export const ataDoItem = (itemKey: string): string => itemKey.split('-').slice(0, 2).join('-');

/** Solicitação de autorização de empenho da ata: falta o número, aguarda a assinatura da Diretora do FNSP ou assinada. */
export type SituacaoDaSolicitacao = 'falta' | 'aguardando' | 'assinada';

export interface AtaDoPedido {
  ataKey: string;
  numeroAta: string;
  /** Fornecedores dos itens do pedido nesta ata (normalmente um). */
  fornecedor: string | null;
  itens: Array<{ itemKey: string; numeroItem: number; nome: string; quantidade: number }>;
  /** Solicitações da ata, uma por rodada (migration 179), da mais antiga à mais nova. */
  solicitacoes: Array<{ numero: string; assinadaEm: string | null }>;
  /** Dia da última assinatura, quando todas estão assinadas. */
  assinadaEm: string | null;
  situacao: SituacaoDaSolicitacao;
}

/**
 * Atas das linhas ativas do pedido (itens e itens dos kits), cada uma com as suas solicitações de autorização de
 * empenho (uma por rodada, migrations 178 e 179). A ata está assinada quando todas as suas solicitações estão.
 * Na ordem: as que faltam, as que aguardam a assinatura, as assinadas.
 */
export function atasDoPedido(p: PedidoEmenda, itens?: Map<string, ItemCaep>): AtaDoPedido[] {
  const porAta = new Map<string, AtaDoPedido>();
  for (const l of linhasAtivas(p)) {
    for (const x of itensDaLinha(l)) {
      const chave = ataDoItem(x.itemKey);
      const item = itens?.get(x.itemKey);
      const ata = porAta.get(chave) ?? {
        ataKey: chave,
        numeroAta: chave.split('-')[0],
        fornecedor: null,
        itens: [],
        solicitacoes: [],
        assinadaEm: null,
        situacao: 'falta' as SituacaoDaSolicitacao
      };
      const doItem = ata.itens.find((i) => i.itemKey === x.itemKey);
      if (doItem) doItem.quantidade += x.quantidade;
      else ata.itens.push({ itemKey: x.itemKey, numeroItem: Number(x.itemKey.split('-')[2]), nome: item ? item.nomeCurto?.trim() || curto(item.descricao) : `item ${x.itemKey}`, quantidade: x.quantidade });
      const fornecedor = item?.fornecedor?.trim();
      if (fornecedor && !(ata.fornecedor ?? '').split(' · ').includes(fornecedor)) ata.fornecedor = ata.fornecedor ? `${ata.fornecedor} · ${fornecedor}` : fornecedor;
      porAta.set(chave, ata);
    }
  }
  for (const d of p.documentos) {
    const ata = d.etapa === 'AUTORIZACAO' && d.ataKey ? porAta.get(d.ataKey) : undefined;
    if (ata) ata.solicitacoes.push({ numero: d.numero, assinadaEm: d.assinadaEm });
  }
  for (const ata of porAta.values()) {
    if (!ata.solicitacoes.length) continue;
    ata.solicitacoes.sort((a, b) => (a.assinadaEm ?? '9999').localeCompare(b.assinadaEm ?? '9999') || a.numero.localeCompare(b.numero));
    const todas = ata.solicitacoes.every((x) => x.assinadaEm);
    ata.situacao = todas ? 'assinada' : 'aguardando';
    ata.assinadaEm = todas ? ata.solicitacoes[ata.solicitacoes.length - 1].assinadaEm : null;
  }
  const ordem: Record<SituacaoDaSolicitacao, number> = { falta: 0, aguardando: 1, assinada: 2 };
  return [...porAta.values()]
    .map((a) => ({ ...a, itens: a.itens.sort((x, y) => x.numeroItem - y.numeroItem) }))
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.numeroAta.localeCompare(b.numeroAta));
}

/** Solicitações do pedido que ainda não dizem qual ata cobrem (o gestor liga cada uma à sua ata). */
export const solicitacoesSemAta = (p: PedidoEmenda): string[] =>
  p.documentos.filter((d) => d.etapa === 'AUTORIZACAO' && !d.ataKey).map((d) => d.numero);

/**
 * Aviso de ata sem solicitação assinada, depois da autorização. Pedido sem nenhuma solicitação informada não avisa:
 * são os do controle anterior da CAEP, que ainda não têm as solicitações (decisão de 24/10/2026).
 */
export function atasSemAutorizacao(p: PedidoEmenda): AvisoPedido | null {
  if (ORDEM_ETAPA[p.etapa] < ORDEM_ETAPA.AUTORIZADO || !p.documentos.some((d) => d.etapa === 'AUTORIZACAO')) return null;
  const atas = atasDoPedido(p);
  const n = atas.filter((a) => a.situacao !== 'assinada').length;
  if (!n) return null;
  return {
    tipo: 'semAutorizacao',
    curto: n === 1 ? '1 ata sem autorização' : `${n} atas sem autorização`,
    texto: `${n} de ${atas.length} ${atas.length === 1 ? 'ata' : 'atas'} sem solicitação de empenho assinada pela Diretora do FNSP`
  };
}

/** Etapa dos documentos SEI de cada etapa do pedido (a solicitação e a autorização são o mesmo documento). */
const DOCUMENTO_DA_ETAPA: Partial<Record<EtapaPedido, EtapaDoDocumento>> = {
  OFICIO: 'OFICIO',
  SOLICITADO: 'AUTORIZACAO',
  AUTORIZADO: 'AUTORIZACAO',
  CGOFI: 'CGOFI',
  EMPENHADO: 'EMPENHO',
  CONTRATACAO: 'CONTRATACAO'
};

/**
 * Documentos SEI da etapa com a data de cada um: os da tabela de documentos (migration 177) e os das colunas que
 * ainda não estão nela (os das linhas da planilha, sem data própria).
 */
export function documentosDaEtapa(p: PedidoEmenda, etapa: EtapaPedido): Array<{ numero: string; data: string | null }> {
  const tipo = DOCUMENTO_DA_ETAPA[etapa];
  if (!tipo) return [];
  const docs = p.documentos.filter((d) => d.etapa === tipo).map((d) => ({ numero: d.numero, data: d.data }));
  const tem = new Set(docs.map((d) => d.numero));
  for (const n of seiDaEtapa(p, etapa === 'AUTORIZADO' ? 'SOLICITADO' : etapa)) if (!tem.has(n)) docs.push({ numero: n, data: dataDaEtapa(p, etapa) });
  return docs;
}

/** Data de uma etapa com vários documentos: o intervalo quando os dias são diferentes ("15/10 a 20/10/2026"). */
export function intervaloDeDatas(datas: Array<string | null>): string | null {
  const dias = [...new Set(datas.filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10)))].sort();
  if (dias.length === 0) return null;
  if (dias.length === 1) return dataBR(dias[0]);
  const [ini, fim] = [dias[0], dias[dias.length - 1]];
  return `${ini.slice(0, 4) === fim.slice(0, 4) ? dataBR(ini).slice(0, 5) : dataBR(ini)} a ${dataBR(fim)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Situação de cada linha do pedido (migration 180): a solicitação de autorização de empenho cobre um ou mais itens
// de uma ata, e os itens do mesmo pedido andam em ritmos diferentes. A linha sabe qual solicitação a cobre; a nota
// (emenda_linha_notas), o despacho à CCGA e o contrato já são por linha. Na tela só entra o que o gestor informa
// (número SEI, data, ata, linhas cobertas) e o que o sistema acha no Contratos.gov.br.
// ---------------------------------------------------------------------------------------------------------------

export type SituacaoLinha = 'CANCELADO' | 'ANTES' | 'SOLICITACAO_A_INFORMAR' | 'AGUARDANDO_ASSINATURA' | 'AUTORIZADO' | 'NA_CGOFI' | 'EMPENHADO' | 'NA_CCGA' | 'CONTRATADO';

export const ORDEM_SITUACAO_LINHA: Record<SituacaoLinha, number> = {
  CANCELADO: -1,
  ANTES: 0,
  SOLICITACAO_A_INFORMAR: 1,
  AGUARDANDO_ASSINATURA: 2,
  AUTORIZADO: 3,
  NA_CGOFI: 4,
  EMPENHADO: 5,
  NA_CCGA: 6,
  CONTRATADO: 7
};

/** Etiqueta da linha e a forma em texto corrido, no singular e no plural ("3 na CCGA · 6 contratadas"). */
export const ROTULO_SITUACAO_LINHA: Record<Exclude<SituacaoLinha, 'ANTES' | 'CANCELADO'>, { etiqueta: string; uma: string; varias: string }> = {
  SOLICITACAO_A_INFORMAR: { etiqueta: 'Solicitação a informar', uma: 'com solicitação a informar', varias: 'com solicitação a informar' },
  AGUARDANDO_ASSINATURA: { etiqueta: 'Aguardando a assinatura', uma: 'aguardando a assinatura', varias: 'aguardando a assinatura' },
  AUTORIZADO: { etiqueta: 'Autorizado', uma: 'autorizada', varias: 'autorizadas' },
  NA_CGOFI: { etiqueta: 'Na CGOFI', uma: 'na CGOFI', varias: 'na CGOFI' },
  EMPENHADO: { etiqueta: 'Empenhado', uma: 'empenhada', varias: 'empenhadas' },
  NA_CCGA: { etiqueta: 'Na CCGA', uma: 'na CCGA', varias: 'na CCGA' },
  CONTRATADO: { etiqueta: 'Contratado', uma: 'contratada', varias: 'contratadas' }
};

export interface SituacaoDaLinha {
  situacao: SituacaoLinha;
  /** Texto da etiqueta: nas etapas antes da solicitação, a etapa do pedido. */
  rotulo: string;
  /** Linha embaixo da etiqueta: a solicitação, a nota ligada, o contrato ou o que falta. */
  detalhe: string | null;
  /** Pede atenção: sem solicitação, aguardando a assinatura, ou empenhada sem nota ligada no sistema. */
  pendente: boolean;
  /** A solicitação de autorização de empenho que cobre a linha, quando há. */
  solicitacao: DocumentoSeiDoPedido | null;
}

/** Solicitações do pedido que já dizem qual ata cobrem. */
const solicitacoesComAta = (p: PedidoEmenda): DocumentoSeiDoPedido[] => p.documentos.filter((d) => d.etapa === 'AUTORIZACAO' && Boolean(d.ataKey));

/**
 * A solicitação de autorização de empenho que cobre a linha: a que a tem nas suas linhas (migration 180) ou, sem
 * ligação gravada (pedidos de antes da migration, ou a segunda solicitação da ata ainda sem linhas marcadas), a
 * solicitação única da ata do item. Ata com mais de uma solicitação e linha sem ligação: nenhuma.
 */
export function solicitacaoDaLinha(p: PedidoEmenda, l: LinhaPedido): DocumentoSeiDoPedido | null {
  const sols = solicitacoesComAta(p);
  const direta = sols.find((d) => d.linhas.some((x) => x.linhaId === l.id));
  if (direta) return direta;
  for (const ata of [...new Set(itensDaLinha(l).map((x) => ataDoItem(x.itemKey)))]) {
    const daAta = sols.filter((d) => d.ataKey === ata);
    if (daAta.length === 1) return daAta[0];
  }
  return null;
}

/** Onde cada linha do pedido está, da solicitação de empenho ao contrato. Antes da solicitação, a etapa do pedido. */
export function situacaoDaLinha(p: PedidoEmenda, l: LinhaPedido, notas: Map<string, NotaDaLinha>): SituacaoDaLinha {
  if (l.cancelada || p.etapa === 'CANCELADO') return { situacao: 'CANCELADO', rotulo: 'Cancelado', detalhe: l.canceladaMotivo ?? p.canceladoMotivo, pendente: false, solicitacao: null };
  if (ORDEM_ETAPA[p.etapa] < ORDEM_ETAPA.SOLICITADO) return { situacao: 'ANTES', rotulo: ROTULO_ETAPA[p.etapa], detalhe: null, pendente: false, solicitacao: null };
  const nota = notas.get(l.id);
  const temNota = Boolean(nota?.nota);
  const notaLigada = temNota ? `NE ${nota!.nota} ligada` : 'sem nota ligada no sistema';
  const solicitacao = solicitacaoDaLinha(p, l);
  if (!solicitacao) {
    return { situacao: 'SOLICITACAO_A_INFORMAR', rotulo: ROTULO_SITUACAO_LINHA.SOLICITACAO_A_INFORMAR.etiqueta, detalhe: 'nenhuma solicitação de empenho cobre esta linha', pendente: true, solicitacao: null };
  }
  if (!solicitacao.assinadaEm) {
    return { situacao: 'AGUARDANDO_ASSINATURA', rotulo: ROTULO_SITUACAO_LINHA.AGUARDANDO_ASSINATURA.etiqueta, detalhe: `solicitação ${solicitacao.numero} na DGFNSP`, pendente: true, solicitacao };
  }
  if (p.etapa === 'CONTRATACAO') {
    if (nota?.contractKey) {
      return { situacao: 'CONTRATADO', rotulo: `Contratado · ${numeroDaChave(nota.contractKey)}`, detalhe: notaLigada, pendente: !temNota, solicitacao };
    }
    return { situacao: 'NA_CCGA', rotulo: ROTULO_SITUACAO_LINHA.NA_CCGA.etiqueta, detalhe: `aguarda o contrato no Contratos.gov.br${temNota ? '' : ' · sem nota ligada'}`, pendente: !temNota, solicitacao };
  }
  if (p.etapa === 'EMPENHADO' || temNota || l.empenhoDocumentoSei) {
    return { situacao: 'EMPENHADO', rotulo: ROTULO_SITUACAO_LINHA.EMPENHADO.etiqueta, detalhe: temNota ? `${notaLigada} · aguarda o envio à CCGA` : 'sem nota ligada · o sistema procura de hora em hora', pendente: !temNota, solicitacao };
  }
  if (p.etapa === 'CGOFI') return { situacao: 'NA_CGOFI', rotulo: ROTULO_SITUACAO_LINHA.NA_CGOFI.etiqueta, detalhe: 'aguarda a nota de empenho', pendente: false, solicitacao };
  return { situacao: 'AUTORIZADO', rotulo: `Autorizado · ${dataBR(solicitacao.assinadaEm)}`, detalhe: 'aguarda o envio à CGOFI', pendente: false, solicitacao };
}

export interface ResumoDasLinhas {
  /** Quantas linhas em cada situação, da mais atrasada à mais adiantada. */
  porSituacao: Array<{ situacao: SituacaoLinha; quantidade: number }>;
  /** Em texto: "3 na CCGA · 6 contratadas". Vazio antes da solicitação (todas iguais à etapa do pedido). */
  texto: string;
  /** A situação da linha mais atrasada (a que segura o pedido). */
  maisAtrasada: SituacaoLinha | null;
  /** As linhas estão em mais de uma situação. */
  divergem: boolean;
}

/** As linhas ativas do pedido contadas por situação. */
export function resumoDasLinhas(p: PedidoEmenda, notas: Map<string, NotaDaLinha>): ResumoDasLinhas {
  const conta = new Map<SituacaoLinha, number>();
  for (const l of linhasAtivas(p)) {
    const s = situacaoDaLinha(p, l, notas).situacao;
    conta.set(s, (conta.get(s) ?? 0) + 1);
  }
  const porSituacao = [...conta.entries()].map(([situacao, quantidade]) => ({ situacao, quantidade })).sort((a, b) => ORDEM_SITUACAO_LINHA[a.situacao] - ORDEM_SITUACAO_LINHA[b.situacao]);
  const texto = porSituacao
    .filter((x) => x.situacao !== 'ANTES' && x.situacao !== 'CANCELADO')
    .map((x) => `${x.quantidade} ${x.quantidade === 1 ? ROTULO_SITUACAO_LINHA[x.situacao as keyof typeof ROTULO_SITUACAO_LINHA].uma : ROTULO_SITUACAO_LINHA[x.situacao as keyof typeof ROTULO_SITUACAO_LINHA].varias}`)
    .join(' · ');
  return { porSituacao, texto, maisAtrasada: porSituacao[0]?.situacao ?? null, divergem: porSituacao.length > 1 };
}

/** Linhas ativas do pedido agrupadas por ata (os kits, que podem ter itens de mais de uma ata, ficam num grupo à parte). */
export interface GrupoDeLinhas {
  /** Chave da ata (numero_ata-uasg) ou 'KITS'. */
  chave: string;
  numeroAta: string | null;
  codigoUasg: string | null;
  fornecedor: string | null;
  vigenciaFinal: string | null;
  ataEncerrada: boolean;
  linhas: LinhaPedido[];
  /** Solicitações de empenho da ata, uma por rodada (vazio nos kits). */
  solicitacoes: AtaDoPedido['solicitacoes'];
  situacao: SituacaoDaSolicitacao | null;
}

export function linhasPorAta(p: PedidoEmenda, itens: Map<string, ItemCaep>): GrupoDeLinhas[] {
  const atas = new Map(atasDoPedido(p, itens).map((a) => [a.ataKey, a]));
  const grupos = new Map<string, GrupoDeLinhas>();
  for (const l of linhasAtivas(p)) {
    const chave = l.tipo === 'ITEM' && l.itemKey ? ataDoItem(l.itemKey) : 'KITS';
    const ata = atas.get(chave);
    const item = l.itemKey ? itens.get(l.itemKey) : undefined;
    const g = grupos.get(chave) ?? {
      chave,
      numeroAta: ata?.numeroAta ?? (chave === 'KITS' ? null : chave.split('-')[0]),
      codigoUasg: chave === 'KITS' ? null : chave.split('-')[1] ?? null,
      fornecedor: ata?.fornecedor ?? null,
      vigenciaFinal: item?.vigenciaFinal ?? null,
      ataEncerrada: Boolean(item?.ataEncerrada),
      linhas: [],
      solicitacoes: ata?.solicitacoes ?? [],
      situacao: ata?.situacao ?? null
    };
    if (!g.vigenciaFinal && item?.vigenciaFinal) g.vigenciaFinal = item.vigenciaFinal;
    g.linhas.push(l);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => Number(a.chave === 'KITS') - Number(b.chave === 'KITS') || (a.numeroAta ?? '').localeCompare(b.numeroAta ?? ''));
}

/** Tarefa da lista "O que falta" do pedido: com botão (a janela de hoje) ou só aviso. */
export interface TarefaDoPedido {
  chave: string;
  titulo: string;
  detalhe: string;
  /** acao: pede um botão; atencao: aviso que o gestor resolve de outro jeito; espera: depende de outro setor ou do sistema. */
  tom: 'acao' | 'atencao' | 'espera';
  /** O botão: o próximo passo do pedido, a solicitação de uma ata (informar, assinatura ou linhas) ou alterar as linhas. */
  botao?: { tipo: 'proxima'; rotulo: string } | { tipo: 'solicitacao'; rotulo: string; ataKey: string; numero?: string; troca?: boolean } | { tipo: 'alterar'; rotulo: string };
}

const nomeDaLinha = (l: LinhaPedido, itens: Map<string, ItemCaep>): string =>
  l.tipo === 'KIT' ? `${l.quantidade} ${l.kitNome ?? 'kit'}` : `${l.quantidade} ${itens.get(l.itemKey ?? '')?.nomeCurto?.trim() || curto(itens.get(l.itemKey ?? '')?.descricao ?? l.itemKey ?? '', 28)}`;
const plural = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`;

/**
 * O que falta no pedido, do que o gestor faz agora ao que só depende de outros: o próximo passo do pedido, a
 * solicitação e a assinatura de cada ata, as linhas sem solicitação marcada, os beneficiários a informar, as notas
 * que o sistema ainda não ligou, os contratos que a CCGA ainda não gerou e os avisos das atas.
 */
export function tarefasDoPedido(p: PedidoEmenda, itens: Map<string, ItemCaep>, notas: Map<string, NotaDaLinha>, hoje: string, podeGerir: boolean): TarefaDoPedido[] {
  const t: TarefaDoPedido[] = [];
  if (p.etapa === 'CANCELADO') return t;
  const linhas = linhasAtivas(p);
  const situacoes = new Map(linhas.map((l) => [l.id, situacaoDaLinha(p, l, notas)]));
  const das = (s: SituacaoLinha) => linhas.filter((l) => situacoes.get(l.id)!.situacao === s);
  const nomes = (ls: LinhaPedido[]) => ls.map((l) => nomeDaLinha(l, itens)).join(', ');
  const semAutor = !p.autorId;
  const depoisDaSolicitacao = ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.SOLICITADO;
  const autorizado = ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.AUTORIZADO;

  // 1) O próximo passo do pedido (o mesmo botão de sempre).
  if (semAutor && (p.etapa === 'RESERVADO' || p.etapa === 'MINUTA')) {
    t.push({ chave: 'autor', titulo: 'Indicar o parlamentar', detalhe: 'Reserva feita a pedido do órgão. Quando um parlamentar ou bancada assumir, indique para seguir com a minuta.', tom: 'acao', botao: { tipo: 'alterar', rotulo: 'Indicar o parlamentar' } });
  } else {
    const prox = proximaAcao(p.etapa, rodadaDoPedido(p));
    if (prox) {
      const detalhe =
        p.etapa === 'AUTORIZADO'
          ? `${plural(das('AUTORIZADO').length, 'linha autorizada', 'linhas autorizadas')} ${das('AUTORIZADO').length === 1 ? 'pode' : 'podem'} ir${das('AUTORIZADO').length < linhas.length ? '; as outras ficam para o próximo lote' : ''}.`
          : p.etapa === 'CGOFI'
            ? 'A CGOFI emite uma nota por fornecedor.'
            : p.etapa === 'EMPENHADO'
              ? 'Despacho para contratação, um por nota.'
              : p.etapa === 'CONFERIDO'
                ? 'Uma solicitação para cada ata do pedido.'
                : p.etapa === 'OFICIO'
                  ? 'Nº da emenda, autor, valor, GND, beneficiário e objeto.'
                  : 'Próximo passo do pedido.';
      t.push({ chave: 'proxima', titulo: prox.rotulo, detalhe, tom: 'acao', botao: { tipo: 'proxima', rotulo: prox.rotulo } });
    }
  }

  // 2) As solicitações de cada ata: a que falta, a que aguarda a assinatura e as linhas sem solicitação marcada.
  if (depoisDaSolicitacao) {
    const nenhumaInformada = !p.documentos.some((d) => d.etapa === 'AUTORIZACAO');
    for (const a of atasDoPedido(p, itens)) {
      const daAta = linhas.filter((l) => itensDaLinha(l).some((x) => ataDoItem(x.itemKey) === a.ataKey));
      if (a.situacao === 'falta' && !nenhumaInformada) {
        t.push({
          chave: `sol-${a.ataKey}`,
          titulo: `Informar a solicitação de empenho da ata ${a.numeroAta}`,
          detalhe: `${nomes(daAta)}. Ao informar, marque as linhas que o documento cobre.`,
          tom: 'acao',
          botao: { tipo: 'solicitacao', rotulo: 'Informar a solicitação', ataKey: a.ataKey }
        });
      }
      for (const s of a.solicitacoes) {
        if (s.assinadaEm) continue;
        const cobre = daAta.filter((l) => situacoes.get(l.id)!.solicitacao?.numero === s.numero);
        t.push({
          chave: `ass-${s.numero}`,
          titulo: `Informar a assinatura da solicitação ${s.numero} · ata ${a.numeroAta}`,
          detalhe: `${cobre.length ? `Cobre ${nomes(cobre)}. ` : ''}A Diretora do FNSP assina; sem isso a CGOFI não empenha esses itens.`,
          tom: autorizado ? 'acao' : 'espera',
          botao: autorizado ? { tipo: 'solicitacao', rotulo: 'Informar a assinatura', ataKey: a.ataKey, numero: s.numero, troca: true } : undefined
        });
      }
      const semSolicitacao = daAta.filter((l) => situacoes.get(l.id)!.situacao === 'SOLICITACAO_A_INFORMAR');
      if (semSolicitacao.length && a.solicitacoes.length > 1) {
        const ultima = a.solicitacoes[a.solicitacoes.length - 1];
        t.push({
          chave: `marcar-${a.ataKey}`,
          titulo: `Marcar as linhas que cada solicitação da ata ${a.numeroAta} cobre`,
          detalhe: `${nomes(semSolicitacao)} sem solicitação marcada. A ata tem ${a.solicitacoes.length} solicitações: abra uma delas e marque as linhas.`,
          tom: 'acao',
          botao: { tipo: 'solicitacao', rotulo: 'Marcar as linhas', ataKey: a.ataKey, numero: ultima.numero, troca: true }
        });
      }
    }
  }

  // 3) Beneficiário a informar (sem ele o quadro e o ofício saem incompletos).
  const semBeneficiario = linhas.filter((l) => !l.beneficiarioId);
  if (semBeneficiario.length) {
    const podeAlterar = podeGerir && !jaEmpenhado(p.etapa);
    t.push({
      chave: 'beneficiario',
      titulo: `Informar o beneficiário de ${plural(semBeneficiario.length, 'linha', 'linhas')}`,
      detalhe: `${nomes(semBeneficiario)}. Sem isso o quadro e o ofício saem incompletos.`,
      tom: podeAlterar ? 'acao' : 'atencao',
      botao: podeAlterar ? { tipo: 'alterar', rotulo: 'Alterar linhas' } : undefined
    });
  }

  // 4) Depende do sistema ou de outro setor: nota a ligar e contrato na CCGA.
  const semNota = linhas.filter((l) => ['EMPENHADO', 'NA_CCGA', 'CONTRATADO'].includes(situacoes.get(l.id)!.situacao) && !notas.get(l.id)?.nota);
  if (semNota.length) {
    t.push({
      chave: 'semNota',
      titulo: `${plural(semNota.length, 'linha empenhada', 'linhas empenhadas')} sem nota ligada no sistema`,
      detalhe: `${nomes(semNota)}. O sistema procura a nota de hora em hora pelo contrato e pelo plano interno; se o contrato não tem a nota, o gestor do contrato vincula em Vínculos.`,
      tom: 'espera'
    });
  }
  const naCcga = das('NA_CCGA');
  if (naCcga.length) {
    t.push({ chave: 'ccga', titulo: `${plural(naCcga.length, 'linha aguarda', 'linhas aguardam')} o contrato na CCGA`, detalhe: `${nomes(naCcga)}. Atualiza sozinho quando o contrato entra no Contratos.gov.br.`, tom: 'espera' });
  }

  // 5) Avisos das atas e do pedido (os mesmos da lista), menos os que já viraram tarefa acima.
  for (const a of avisosDoPedido(p, itens, hoje, notas)) {
    if (a.tipo === 'semNota' || a.tipo === 'semAutorizacao') continue;
    t.push({ chave: `aviso-${a.tipo}`, titulo: a.curto, detalhe: a.texto, tom: 'atencao' });
  }
  // Depois do empenho a ata ainda importa: o contrato precisa estar assinado antes do fim.
  if (jaEmpenhado(p.etapa)) {
    for (const g of linhasPorAta(p, itens)) {
      if (!g.vigenciaFinal || g.chave === 'KITS') continue;
      const semContrato = g.linhas.filter((l) => situacoes.get(l.id)!.situacao !== 'CONTRATADO');
      const dias = diasEntre(hoje, g.vigenciaFinal);
      if (!semContrato.length || dias > avisoIndicacaoDias()) continue;
      t.push({
        chave: `vence-${g.chave}`,
        titulo: dias < 0 ? `Ata ${g.numeroAta} encerrada com ${plural(semContrato.length, 'linha sem contrato', 'linhas sem contrato')}` : `Ata ${g.numeroAta} vence em ${plural(dias, 'dia', 'dias')} e ${plural(semContrato.length, 'linha ainda não tem', 'linhas ainda não têm')} contrato`,
        detalhe: `${nomes(semContrato)}. O contrato precisa estar assinado antes do fim da ata (${dataBR(g.vigenciaFinal)}).`,
        tom: 'atencao'
      });
    }
  }
  const ordem: Record<TarefaDoPedido['tom'], number> = { acao: 0, atencao: 1, espera: 2 };
  return t.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

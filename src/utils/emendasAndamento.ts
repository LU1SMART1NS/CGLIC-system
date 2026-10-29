/**
 * Andamento do pedido (Pedido 360, protótipo aprovado em 27/10/2026): as etapas do pedido como tarefas, no mesmo
 * desenho do Plano de gestão das atas (ação do gestor, com quem, contadores Comigo agora · Cobrar resposta ·
 * Aguardando resposta · Fecha sozinha). Não é um plano editável: as tarefas saem das etapas, que alimentam avisos,
 * Início e somas. Concluir uma tarefa abre a mesma janela da etapa de hoje.
 *
 * Quatro fases: Interlocução, Empenho, Contratação e Execução (informações para a Ordem de Fornecimento, registradas
 * pela CAEP; entrega, liquidação e pagamento pelas notas).
 */
import type { AcaoGestor } from '../types';
import type { GrupoTarefa } from './modeloGestao';
import type { EtapaPedido, ItemCaep, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import { corteIndicacaoDias, dataBR, diasEntre } from './emendasKits';
import {
  AVISO_SEM_OFICIO_DIAS,
  atasDoPedido,
  contratosDoPedido,
  dataDaEtapa,
  execucaoDoPedido,
  jaEmpenhado,
  linhasPorAta,
  ORDEM_ETAPA,
  prazoDaEtapa,
  proximaAcao,
  rodadaDoPedido,
  tarefasDoPedido,
  type TarefaDoPedido
} from './emendasPedidos';

export type FaseDoAndamento = 'INTERLOCUCAO' | 'EMPENHO' | 'CONTRATACAO' | 'EXECUCAO';

/**
 * FEITA; COMIGO (é com a CAEP); AGUARDANDO (pedido feito, dentro do prazo); COBRAR (prazo da resposta vencido);
 * FONTE (outra unidade faz e o sistema vê sozinho); SEM_FONTE (outra unidade faz e nada informa); DEPOIS (depende de
 * tarefa anterior); NAO_HOUVE (pedido cancelado antes de chegar aqui).
 */
export type EstadoDaTarefa = 'FEITA' | 'COMIGO' | 'AGUARDANDO' | 'COBRAR' | 'FONTE' | 'SEM_FONTE' | 'DEPOIS' | 'NAO_HOUVE';

export type ChaveDaTarefa =
  | 'reservar'
  | 'minuta'
  | 'conferir'
  | 'solicitacao'
  | 'assinatura'
  | 'cgofi'
  | 'empenho'
  | 'despacho'
  | 'contrato'
  | 'ordem'
  | 'entrega'
  | 'liquidacao'
  | 'pagamento';

export interface TarefaDoAndamento {
  chave: ChaveDaTarefa;
  fase: FaseDoAndamento;
  /** Etapa gravada que a tarefa conclui (as da execução não são gravadas). */
  etapa: EtapaPedido | null;
  nome: string;
  acao: AcaoGestor;
  comQuem: string;
  estado: EstadoDaTarefa;
  /** Quando feita: data ou resumo curto. */
  feito: string | null;
  /** Prazo da tarefa aberta (dd/mm/aaaa) e se já venceu. */
  prazo: string | null;
  vencido: boolean;
  /** Regra do prazo ou do fechamento, em uma frase. */
  regra: string | null;
  /** Andamento dentro da tarefa ("1 de 2 atas", "R$ 0,00 de R$ 888.285,90"). */
  progresso: string | null;
  /** Rótulo do botão da próxima etapa, quando esta tarefa é o próximo passo e o perfil pode gravar. */
  proxima: string | null;
  /** Pendências de "O que falta" que pertencem a esta tarefa (com o botão da janela de hoje). */
  pendencias: TarefaDoPedido[];
}

export interface FaseDoPedido {
  id: FaseDoAndamento;
  nome: string;
  tarefas: TarefaDoAndamento[];
}

export interface AndamentoDoPedido {
  fases: FaseDoPedido[];
  /** Avisos que não são tarefa (ata vencendo, empenhado a mais...): vão no alto da aba. */
  avisos: TarefaDoPedido[];
  contagem: Record<Exclude<GrupoTarefa, 'FEITA'>, number>;
  feitas: number;
  total: number;
}

const NOME_DA_FASE: Record<FaseDoAndamento, string> = {
  INTERLOCUCAO: 'Interlocução',
  EMPENHO: 'Empenho',
  CONTRATACAO: 'Contratação',
  EXECUCAO: 'Execução'
};

/** A tarefa entra num contador? (DEPOIS, SEM_FONTE e NAO_HOUVE não.) */
export function grupoDaTarefaDoPedido(t: Pick<TarefaDoAndamento, 'estado'>): Exclude<GrupoTarefa, 'FEITA'> | null {
  switch (t.estado) {
    case 'COMIGO':
      return 'COMIGO';
    case 'COBRAR':
      return 'COBRAR';
    case 'AGUARDANDO':
      return 'AGUARDANDO';
    case 'FONTE':
      return 'FONTE';
    default:
      return null;
  }
}

const somaDias = (iso: string, dias: number): string => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plural = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`;

/** De qual tarefa é cada pendência de "O que falta"; o que não é tarefa vira aviso. */
function tarefaDaPendencia(t: TarefaDoPedido, etapa: EtapaPedido): ChaveDaTarefa | null {
  if (t.chave === 'autor' || t.chave === 'beneficiario') return 'reservar';
  if (t.chave === 'proxima') {
    switch (etapa) {
      case 'RESERVADO':
      case 'MINUTA':
        return 'minuta';
      case 'OFICIO':
        return 'conferir';
      case 'CONFERIDO':
        return 'solicitacao';
      case 'SOLICITADO':
        return 'assinatura';
      case 'AUTORIZADO':
        return 'cgofi';
      case 'CGOFI':
        return 'empenho';
      case 'EMPENHADO':
        return 'despacho';
      default:
        return null;
    }
  }
  if (t.chave.startsWith('sol-') || t.chave.startsWith('marcar-')) return 'solicitacao';
  if (t.chave.startsWith('ass-')) return 'assinatura';
  if (t.chave === 'envio-cgofi') return 'cgofi';
  if (t.chave === 'semNota') return 'empenho';
  if (t.chave === 'ccga') return 'contrato';
  return null;
}

/**
 * Monta o andamento do pedido. `hoje` em Brasília (aaaa-mm-dd). Sem `podeGerir` as tarefas são as mesmas, sem botões.
 */
export function andamentoDoPedido(
  p: PedidoEmenda,
  itens: Map<string, ItemCaep>,
  notas: Map<string, NotaDaLinha>,
  hoje: string,
  podeGerir: boolean
): AndamentoDoPedido {
  const cancelado = p.etapa === 'CANCELADO';
  const o = ORDEM_ETAPA[p.etapa];
  const passou = (e: EtapaPedido) => !cancelado && o >= ORDEM_ETAPA[e];
  const esta = (e: EtapaPedido) => !cancelado && p.etapa === e;
  const houve = (e: EtapaPedido) => Boolean(dataDaEtapa(p, e));
  const semAutor = !p.autorId;
  const doPlanilha = p.origem === 'PLANILHA';

  // Pendências de hoje ("O que falta"), distribuídas pelas tarefas; o resto é aviso.
  const pendentes = tarefasDoPedido(p, itens, notas, hoje, podeGerir);
  const porTarefa = new Map<ChaveDaTarefa, TarefaDoPedido[]>();
  const avisos: TarefaDoPedido[] = [];
  for (const t of pendentes) {
    const chave = tarefaDaPendencia(t, p.etapa);
    if (!chave) {
      avisos.push(t);
      continue;
    }
    // O botão da próxima etapa vira o botão da própria tarefa (não repete como pendência).
    if (t.chave === 'proxima') continue;
    porTarefa.set(chave, [...(porTarefa.get(chave) ?? []), t]);
  }
  const prox = !cancelado && podeGerir && !semAutor ? proximaAcao(p.etapa, rodadaDoPedido(p)) : null;
  const proximaEm = (chave: ChaveDaTarefa) => (prox && tarefaDaPendencia({ chave: 'proxima' } as TarefaDoPedido, p.etapa) === chave ? prox.rotulo : null);
  const com = (chave: ChaveDaTarefa) => porTarefa.get(chave) ?? [];
  const comAcao = (chave: ChaveDaTarefa) => com(chave).some((t) => t.tom === 'acao');

  const base = (chave: ChaveDaTarefa, fase: FaseDoAndamento, etapa: EtapaPedido | null, nome: string, acao: AcaoGestor, comQuem: string): TarefaDoAndamento => ({
    chave,
    fase,
    etapa,
    nome,
    acao,
    comQuem,
    estado: 'DEPOIS',
    feito: null,
    prazo: null,
    vencido: false,
    regra: null,
    progresso: null,
    proxima: proximaEm(chave),
    pendencias: com(chave)
  });
  // Cancelado: feita o que tinha acontecido; o resto não houve.
  const fechada = (t: TarefaDoAndamento, aconteceu: boolean, feito: string | null): TarefaDoAndamento =>
    cancelado ? { ...t, estado: aconteceu ? 'FEITA' : 'NAO_HOUVE', feito: aconteceu ? feito : null, proxima: null, pendencias: [] } : t;

  // ---------- Interlocução ----------
  const reservar = base('reservar', 'INTERLOCUCAO', 'RESERVADO', semAutor ? 'Reservar os itens e indicar o parlamentar' : 'Reservar os itens com o parlamentar', 'FAZER', 'CAEP');
  reservar.feito = doPlanilha ? 'carga da planilha' : dataBR(p.reservadoEm);
  reservar.estado = comAcao('reservar') ? 'COMIGO' : 'FEITA';

  const minuta = base('minuta', 'INTERLOCUCAO', 'OFICIO', 'Enviar a minuta e receber o ofício', 'ORIENTAR', 'gabinete do parlamentar');
  minuta.regra = `ofício em até ${AVISO_SEM_OFICIO_DIAS} dias da minuta`;
  if (passou('OFICIO')) {
    minuta.estado = 'FEITA';
    minuta.feito = p.oficioEm ? dataBR(p.oficioEm) : doPlanilha ? 'sem data na planilha' : null;
  } else if (esta('MINUTA')) {
    const desde = p.devolvidoEm ?? p.minutaEm;
    const ate = desde ? somaDias(desde, AVISO_SEM_OFICIO_DIAS) : null;
    minuta.prazo = ate ? dataBR(ate) : null;
    minuta.vencido = Boolean(ate && diasEntre(hoje, ate) < 0);
    minuta.estado = minuta.vencido ? 'COBRAR' : 'AGUARDANDO';
  } else if (esta('RESERVADO')) {
    minuta.estado = semAutor ? 'DEPOIS' : 'COMIGO';
  }

  // ---------- Empenho ----------
  const conferir = base('conferir', 'EMPENHO', 'CONFERIDO', 'Conferir o ofício e a emenda no SIOP', 'CONFERIR', 'CAEP');
  conferir.regra = 'nº, autor, valor, GND, beneficiário e objeto; se não bater, o ofício volta à minuta';
  if (passou('CONFERIDO')) {
    conferir.estado = 'FEITA';
    conferir.feito = p.conferidoEm ? dataBR(p.conferidoEm) : null;
  } else if (esta('OFICIO')) conferir.estado = 'COMIGO';

  const atas = atasDoPedido(p, itens);
  const grupos = linhasPorAta(p, itens).filter((g) => g.chave !== 'KITS');
  const solicitacao = base('solicitacao', 'EMPENHO', 'SOLICITADO', 'Elaborar a solicitação de empenho, uma por ata', 'FAZER', 'CAEP');
  solicitacao.regra = `até ${corteIndicacaoDias()} dias antes do fim de cada ata`;
  if (passou('SOLICITADO') || esta('CONFERIDO')) {
    const comSolicitacao = atas.filter((a) => a.solicitacoes.length > 0).length;
    solicitacao.progresso = atas.length > 0 ? `${comSolicitacao} de ${plural(atas.length, 'ata', 'atas')}` : null;
    const pendente = esta('CONFERIDO') || comAcao('solicitacao');
    solicitacao.estado = pendente ? 'COMIGO' : 'FEITA';
    if (!pendente) solicitacao.feito = plural(atas.reduce((n, a) => n + a.solicitacoes.length, 0), 'solicitação', 'solicitações');
    if (pendente) {
      // O prazo é o corte da ata que vence primeiro entre as que ainda não têm solicitação.
      const fins = grupos
        .filter((g) => g.vigenciaFinal && !(atas.find((a) => a.ataKey === g.chave)?.solicitacoes.length ?? 0))
        .map((g) => somaDias(g.vigenciaFinal!, -corteIndicacaoDias()))
        .sort();
      if (fins[0]) {
        solicitacao.prazo = dataBR(fins[0]);
        solicitacao.vencido = diasEntre(hoje, fins[0]) < 0;
      }
    }
  }

  const assinatura = base('assinatura', 'EMPENHO', 'AUTORIZADO', 'Disponibilizar a solicitação para assinatura', 'ASSINAR', 'Diretora do FNSP');
  if (passou('AUTORIZADO')) {
    const pend = com('assinatura');
    assinatura.estado = pend.some((t) => t.tom === 'acao') ? 'COMIGO' : pend.length ? 'AGUARDANDO' : 'FEITA';
    const assinadas = atas.flatMap((a) => a.solicitacoes.map((s) => s.assinadaEm)).filter((d): d is string => Boolean(d));
    if (assinatura.estado === 'FEITA') assinatura.feito = assinadas.length ? [...new Set(assinadas.map(dataBR))].join(', ') : p.autorizadoEm ? dataBR(p.autorizadoEm) : null;
  } else if (esta('SOLICITADO')) assinatura.estado = 'AGUARDANDO';

  const cgofi = base('cgofi', 'EMPENHO', 'CGOFI', 'Enviar o processo à CGOFI', 'FAZER', 'CAEP');
  if (passou('CGOFI')) {
    cgofi.estado = comAcao('cgofi') ? 'COMIGO' : 'FEITA';
    // Migration 230: com o empenho registrado pelo sistema, o envio sem registro fica comprovado pela nota.
    if (cgofi.estado === 'FEITA') cgofi.feito = p.cgofiEm ? dataBR(p.cgofiEm) : p.empenhadoPelaFonte && !p.cgofiDocumentoSei ? 'comprovado pela nota' : null;
  } else if (esta('AUTORIZADO')) cgofi.estado = 'COMIGO';

  const empenho = base('empenho', 'EMPENHO', 'EMPENHADO', 'Nota de empenho emitida', 'ACOMPANHAR', 'CGOFI');
  empenho.regra = 'a CGOFI emite uma nota por fornecedor; com nota em todos os itens o sistema registra sozinho, e a CAEP completa o número SEI';
  if (jaEmpenhado(p.etapa)) {
    empenho.estado = 'FEITA';
    const n = execucaoDoPedido(p, notas).notas;
    empenho.feito = [p.empenhadoEm ? dataBR(p.empenhadoEm) : null, p.empenhadoPelaFonte ? 'pela nota no Tesouro' : null, n ? plural(n, 'nota', 'notas') : null].filter(Boolean).join(' · ') || null;
  } else if (esta('CGOFI')) empenho.estado = 'AGUARDANDO';

  // ---------- Contratação ----------
  const despacho = base('despacho', 'CONTRATACAO', 'CONTRATACAO', 'Despacho para contratação, um por nota', 'FAZER', 'CCGA');
  if (esta('CONTRATACAO')) {
    despacho.estado = 'FEITA';
    despacho.feito = p.contratacaoEm ? dataBR(p.contratacaoEm) : p.contratacaoPelaFonte ? 'comprovado pelo contrato' : null;
  } else if (esta('EMPENHADO')) despacho.estado = 'COMIGO';

  const contrato = base('contrato', 'CONTRATACAO', null, 'Contrato assinado', 'ACOMPANHAR', 'CCGA');
  contrato.regra = 'fecha quando o contrato entra no Contratos.gov.br (já assinado), em qualquer etapa; precisa ser assinado antes do fim da ata';
  const contratos = esta('CONTRATACAO') ? contratosDoPedido(p, notas) : null;
  if (contratos) {
    contrato.progresso = `${contratos.itensContratados} de ${plural(contratos.itens, 'item', 'itens')} com contrato`;
    contrato.estado = contratos.contratado ? 'FEITA' : 'FONTE';
    if (contratos.contratado)
      contrato.feito = [contratos.assinadoEm ? `assinado em ${dataBR(contratos.assinadoEm)}` : null, plural(contratos.contratos.length, 'contrato', 'contratos')].filter(Boolean).join(' · ');
    if (!contratos.contratado) {
      const fim = grupos.map((g) => g.vigenciaFinal).filter((d): d is string => Boolean(d)).sort()[0];
      if (fim) {
        contrato.prazo = dataBR(fim);
        contrato.vencido = diasEntre(hoje, fim) < 0;
      }
    }
  }

  // ---------- Execução ----------
  const execucao = jaEmpenhado(p.etapa) ? execucaoDoPedido(p, notas) : null;
  const temNotas = Boolean(execucao && execucao.notas > 0);
  const contratado = Boolean(contratos?.contratado);
  // Migration 245 (29/10/2026): a CAEP reúne as informações para a Ordem de Fornecimento depois do contrato e registra
  // a data e o SEI. Pedido que já tem fatura sem esse registro fica comprovado pela entrega.
  const ordem = base('ordem', 'EXECUCAO', null, 'Reunir as informações para a Ordem de Fornecimento', 'FAZER', 'CAEP');
  ordem.regra = 'abre com o contrato assinado; fecha quando a CAEP registra a data e o documento SEI';
  if (p.ordemFornecimentoEm) {
    ordem.estado = 'FEITA';
    ordem.feito = dataBR(p.ordemFornecimentoEm);
  } else if (contratado && execucao) {
    const entregue = execucao.notasFaturadas > 0;
    ordem.estado = entregue ? 'FEITA' : 'COMIGO';
    if (entregue) ordem.feito = 'comprovado pela entrega';
  }
  // Migration 231: a fatura no Contratos.gov.br mostra que o fornecedor entregou e o fiscal atestou.
  const entrega = base('entrega', 'EXECUCAO', null, 'Entrega e fatura', 'ACOMPANHAR', 'fornecedor e fiscal do contrato');
  entrega.regra = 'fecha quando cada nota tem fatura no Contratos.gov.br (o fornecedor entregou e o fiscal atestou)';
  if (contratado && execucao) {
    const todas = execucao.notas > 0 && execucao.notasFaturadas >= execucao.notas;
    entrega.estado = todas ? 'FEITA' : 'FONTE';
    entrega.progresso = `${execucao.notasFaturadas} de ${plural(execucao.notas, 'nota', 'notas')} com fatura`;
    if (todas) entrega.feito = execucao.faturadoEm ? `1ª fatura em ${dataBR(execucao.faturadoEm)}` : plural(execucao.notasFaturadas, 'nota faturada', 'notas faturadas');
    else if (execucao.proximaEntrega) entrega.prazo = dataBR(execucao.proximaEntrega.data);
  }
  const liquidacao = base('liquidacao', 'EXECUCAO', null, 'Liquidação', 'ACOMPANHAR', 'gestor do contrato e CGOFI');
  liquidacao.regra = 'fecha quando o liquidado das notas chega ao empenhado';
  const pagamento = base('pagamento', 'EXECUCAO', null, 'Pagamento', 'ACOMPANHAR', 'Tesouro (ordem bancária)');
  pagamento.regra = 'fecha quando o pago chega ao empenhado; o pedido termina aqui';
  if (execucao && temNotas) {
    const quase = (a: number, b: number) => b > 0 && a >= b - 0.01;
    liquidacao.progresso = `${reais(execucao.liquidado)} de ${reais(execucao.empenhado)}`;
    liquidacao.estado = quase(execucao.liquidado, execucao.empenhado) ? 'FEITA' : 'FONTE';
    pagamento.progresso = `${reais(execucao.pago)} de ${reais(execucao.empenhado)}`;
    pagamento.estado = quase(execucao.pago, execucao.empenhado) ? 'FEITA' : 'FONTE';
    if (liquidacao.estado === 'FEITA') liquidacao.feito = [reais(execucao.liquidado), execucao.liquidadoEm ? `em ${dataBR(execucao.liquidadoEm)}` : null].filter(Boolean).join(' ');
    if (pagamento.estado === 'FEITA') pagamento.feito = [reais(execucao.pago), execucao.pagoEm ? `em ${dataBR(execucao.pagoEm)}` : null].filter(Boolean).join(' ');
  }

  // Prazo medido da etapa atual (D5, 28/10/2026) na tarefa que a fecha; a que já tem prazo próprio (corte da ata,
  // fim da ata para o contrato) fica com o dela. Pedido aguardando outra unidade com o prazo vencido: cobrar.
  const prazo = cancelado ? null : prazoDaEtapa(p, notas, hoje);
  const daEtapa: Partial<Record<EtapaPedido, TarefaDoAndamento>> = { OFICIO: conferir, SOLICITADO: assinatura, AUTORIZADO: cgofi, CGOFI: empenho, EMPENHADO: despacho };
  const tarefaDoPrazo = daEtapa[p.etapa];
  if (prazo && tarefaDoPrazo && !tarefaDoPrazo.prazo && tarefaDoPrazo.estado !== 'FEITA') {
    tarefaDoPrazo.prazo = dataBR(prazo.ate);
    tarefaDoPrazo.vencido = prazo.vencido;
    tarefaDoPrazo.regra ??= `${prazo.prazo} dias da etapa anterior (tempo medido em 80% dos pedidos)`;
    if (prazo.vencido && tarefaDoPrazo.estado === 'AGUARDANDO') tarefaDoPrazo.estado = 'COBRAR';
  }

  const lista: TarefaDoAndamento[] = [
    fechada(reservar, true, reservar.feito),
    fechada(minuta, houve('OFICIO'), p.oficioEm ? dataBR(p.oficioEm) : null),
    fechada(conferir, houve('CONFERIDO'), p.conferidoEm ? dataBR(p.conferidoEm) : null),
    fechada(solicitacao, houve('SOLICITADO'), p.solicitadoEm ? dataBR(p.solicitadoEm) : null),
    fechada(assinatura, houve('AUTORIZADO'), p.autorizadoEm ? dataBR(p.autorizadoEm) : null),
    fechada(cgofi, houve('CGOFI'), p.cgofiEm ? dataBR(p.cgofiEm) : null),
    fechada(empenho, houve('EMPENHADO'), p.empenhadoEm ? dataBR(p.empenhadoEm) : null),
    fechada(despacho, houve('CONTRATACAO'), p.contratacaoEm ? dataBR(p.contratacaoEm) : null),
    fechada(contrato, false, null),
    fechada(ordem, Boolean(p.ordemFornecimentoEm), p.ordemFornecimentoEm ? dataBR(p.ordemFornecimentoEm) : null),
    fechada(entrega, false, null),
    fechada(liquidacao, false, null),
    fechada(pagamento, false, null)
  ];

  const fases: FaseDoPedido[] = (['INTERLOCUCAO', 'EMPENHO', 'CONTRATACAO', 'EXECUCAO'] as const).map((id) => ({
    id,
    nome: NOME_DA_FASE[id],
    tarefas: lista.filter((t) => t.fase === id)
  }));
  const contagem = { COMIGO: 0, COBRAR: 0, AGUARDANDO: 0, FONTE: 0 };
  for (const t of lista) {
    const g = grupoDaTarefaDoPedido(t);
    if (g) contagem[g]++;
  }
  const contaveis = lista.filter((t) => t.estado !== 'NAO_HOUVE');
  return { fases, avisos, contagem, feitas: contaveis.filter((t) => t.estado === 'FEITA').length, total: contaveis.length };
}

import type { EntregaFiscalizacao, EtapaEntrega } from '../services/fiscalizacaoService';
import { NOME_SFC, dataBR, hojeEmBrasilia } from './fiscalizacao';
import { cobrancaDaComissao, prazoDoRecebimento } from './fiscalizacaoRecebimento';
import { situacaoDaCobranca, situacaoDaNotificacao, situacaoDaSubstituicao, textoDoVencimento, type TipoOcorrencia } from './fiscalizacaoOcorrencias';
import { itemConcluido, prazoDaEntrega, rotuloDoBeneficiario, textoDoAviso } from './fiscalizacaoEntregas';
import { gruposALigar } from './fiscalizacaoLigacao';
import { gruposSemCadastro } from './fiscalizacaoBeneficiarioLigacao';

/* Regras da mesa do Contrato 360 › Fiscalização (Com você · Com outros) e de "com quem está o item", usadas também nas abas Contratos e Itens. */

export type Tom = 'vencido' | 'eu' | 'espera';
export interface Linha { chave: string; tom: Tom; quem?: string; titulo: string; detalhe?: string; prazo?: string; vencido?: boolean; /** Data (AAAA-MM-DD) que dá o prazo do passo, para a lista de contratos. */ limite?: string | null; acoes: Array<{ rotulo: string; principal?: boolean; faz: () => void }> }
export const COR: Record<Tom, string> = { vencido: 'var(--color-danger)', eu: 'var(--primary)', espera: 'var(--color-warning)' };

export const itens = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
const quem = (es: EntregaFiscalizacao[]) => {
  const nomes = [...new Set(es.map((e) => rotuloDoBeneficiario(e).principal))];
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}` : nomes.join(', ');
};
const menorData = (es: EntregaFiscalizacao[]) => es.map((e) => e.prevista).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
export const EM_EXECUCAO = new Set(['ORDEM', 'PRODUCAO', 'TRANSITO', 'RETIRADA']);

type Abrir = (tipo: 'etapa' | 'encerrar' | 'recebimento' | 'prorrogar' | 'comissao' | 'cobranca' | 'ocorrencia', itens: EntregaFiscalizacao[], inicial?: EtapaEntrega | TipoOcorrencia) => void;

/** O que fazer agora no contrato, juntando os itens que estão no mesmo passo (o status anda em bloco). */
export function linhasDoContrato(es: EntregaFiscalizacao[], semProcesso: boolean, abrir: Abrir, processo: () => void): { comVoce: Linha[]; comOutros: Linha[] } {
  // Item que mudou no pedido de emenda (migration 274): só o aviso e o encerramento; os outros passos não o contam.
  const sfc = es.filter((e) => e.responsavel === 'SFC' && !e.aviso);
  const comAviso = es.filter((e) => e.responsavel === 'SFC' && e.aviso);
  const de = (f: (e: EntregaFiscalizacao) => boolean) => sfc.filter(f);
  const mudar = (rotulo: string, x: EntregaFiscalizacao[]) => ({ rotulo, principal: true, faz: () => abrir('etapa', x) });
  const comVoce: Linha[] = [];
  const comOutros: Linha[] = [];
  const encerrar = (x: EntregaFiscalizacao[]) => ({ rotulo: x.length === 1 ? 'Encerrar entrega' : 'Encerrar entregas', principal: true, faz: () => abrir('encerrar', x) });
  const cancelados = comAviso.filter((e) => e.aviso?.tipo === 'ITEM_CANCELADO');
  if (cancelados.length) comVoce.push({ chave: 'anulado', tom: 'vencido', titulo: `Empenho anulado · ${itens(cancelados.length)} cancelado${cancelados.length === 1 ? '' : 's'} no pedido`, detalhe: `${quem(cancelados)} · ${textoDoAviso(cancelados[0].aviso!)}`, acoes: [encerrar(cancelados)] });
  const outroContrato = comAviso.filter((e) => e.aviso?.tipo === 'OUTRO_CONTRATO');
  if (outroContrato.length) comVoce.push({ chave: 'outro-contrato', tom: 'eu', titulo: `A nota passou a outro contrato · ${itens(outroContrato.length)}`, detalhe: `${quem(outroContrato)} · ${textoDoAviso(outroContrato[0].aviso!)}`, acoes: [encerrar(outroContrato)] });
  if (semProcesso) comVoce.push({ chave: 'processo', tom: 'eu', titulo: 'Registrar a autuação', detalhe: 'NUP e data da autuação.', acoes: [{ rotulo: 'Registrar NUP', principal: true, faz: processo }] });
  const hoje = hojeEmBrasilia();
  const ocorrencia = (rotulo: string, tipo: TipoOcorrencia, x: EntregaFiscalizacao[], principal = false) => ({ rotulo, principal, faz: () => abrir('ocorrencia', x, tipo) });
  const atrasados = (x: EntregaFiscalizacao[]) => `${itens(x.length)} atrasado${x.length === 1 ? '' : 's'}`;
  // Ocorrências em aberto (entrega B): notificação sem resposta e pedido de prorrogação sem decisão vêm antes da cobrança.
  const notificados = de((e) => Boolean(situacaoDaNotificacao(e.ocorrencias, hoje)));
  const notifVencida = notificados.filter((e) => situacaoDaNotificacao(e.ocorrencias, hoje)!.vencida);
  const notifAberta = notificados.filter((e) => !situacaoDaNotificacao(e.ocorrencias, hoje)!.vencida);
  if (notifVencida.length) {
    const n = notifVencida.map((e) => situacaoDaNotificacao(e.ocorrencias, hoje)!).sort((a, b) => a.ate.localeCompare(b.ate))[0];
    comVoce.push({ chave: 'notificacao', tom: 'vencido', titulo: `Notificação sem resposta · ${itens(notifVencida.length)} · ${textoDoVencimento(n.dias)}`, detalhe: `${quem(notifVencida)} · notificado em ${dataBR(n.em)}`, prazo: dataBR(n.ate), vencido: true, limite: n.ate, acoes: [ocorrencia('Registrar a resposta', 'RESPOSTA', notifVencida, true), { rotulo: 'Prorrogar o prazo', faz: () => abrir('prorrogar', notifVencida) }] });
  }
  const pedidos = de((e) => Boolean(e.ocorrencias?.pedido) && !notificados.includes(e));
  if (pedidos.length) {
    const p = pedidos.map((e) => e.ocorrencias!.pedido!).sort((a, b) => a.em.localeCompare(b.em))[0];
    comVoce.push({ chave: 'pedido', tom: 'eu', titulo: `Decidir o pedido de prorrogação · ${itens(pedidos.length)}`, detalhe: `${quem(pedidos)} · pedido em ${dataBR(p.em)}${p.novaData ? `, para ${dataBR(p.novaData)}` : ''}`, acoes: [{ rotulo: 'Prorrogar o prazo', principal: true, faz: () => abrir('prorrogar', pedidos) }, ocorrencia('Negar o pedido', 'PEDIDO_NEGADO', pedidos)] });
  }
  // Atraso: sem cobrança, com o fiscal; cobrado há menos de N dias, espera o fornecedor; depois, cobrar de novo.
  const vencidos = de((e) => EM_EXECUCAO.has(e.etapa) && prazoDaEntrega(e).tom === 'danger' && !notificados.includes(e) && !pedidos.includes(e));
  const acoesDoAtraso = (x: EntregaFiscalizacao[]) => [ocorrencia('Registrar a cobrança', 'COBRANCA', x, true), ocorrencia('Notificar', 'NOTIFICACAO', x), ocorrencia('Pedido de prorrogação', 'PEDIDO_PRORROGACAO', x)];
  const semCobranca = vencidos.filter((e) => situacaoDaCobranca(e, hoje).estado === 'SEM_COBRANCA');
  const deNovo = vencidos.filter((e) => situacaoDaCobranca(e, hoje).estado === 'COBRAR_DE_NOVO');
  const cobrados = vencidos.filter((e) => situacaoDaCobranca(e, hoje).estado === 'COBRADO');
  if (semCobranca.length) comVoce.push({ chave: 'cobrar', tom: 'vencido', titulo: `Cobrar o fornecedor · ${atrasados(semCobranca)} sem cobrança`, detalhe: quem(semCobranca), prazo: dataBR(menorData(semCobranca)), vencido: true, limite: menorData(semCobranca), acoes: acoesDoAtraso(semCobranca) });
  if (deNovo.length) {
    const ultima = deNovo.map((e) => situacaoDaCobranca(e, hoje).desde!).sort()[0];
    const n = Math.max(...deNovo.map((e) => e.ocorrencias?.cobrancas ?? 0));
    comVoce.push({ chave: 'cobrar-de-novo', tom: 'vencido', titulo: `Cobrar de novo o fornecedor · ${atrasados(deNovo)}`, detalhe: `${quem(deNovo)} · cobrado em ${dataBR(ultima)}${n > 1 ? ` · ${n} cobranças` : ''} e ainda não entregou`, prazo: dataBR(menorData(deNovo)), vencido: true, limite: menorData(deNovo), acoes: acoesDoAtraso(deNovo) });
  }
  if (cobrados.length) {
    const prox = cobrados.map((e) => situacaoDaCobranca(e, hoje).cobrarEm!).sort()[0];
    comOutros.push({ chave: 'cobrado', tom: 'espera', quem: 'Fornecedor', titulo: `Entregar · ${atrasados(cobrados)}, já cobrado${cobrados.length === 1 ? '' : 's'}`, detalhe: `${quem(cobrados)} · cobrar de novo em ${dataBR(prox)}`, prazo: dataBR(prox), limite: prox, acoes: [mudar('Registrar a entrega', cobrados), ocorrencia('Notificar', 'NOTIFICACAO', cobrados)] });
  }
  if (notifAberta.length) {
    const n = notifAberta.map((e) => situacaoDaNotificacao(e.ocorrencias, hoje)!).sort((a, b) => a.ate.localeCompare(b.ate))[0];
    comOutros.push({ chave: 'notificado', tom: 'espera', quem: 'Fornecedor', titulo: `Responder à notificação · ${itens(notifAberta.length)}`, detalhe: `${quem(notifAberta)} · notificado em ${dataBR(n.em)}`, prazo: dataBR(n.ate), limite: n.ate, acoes: [ocorrencia('Registrar a resposta', 'RESPOSTA', notifAberta)] });
  }
  // Recusa no recebimento: o fornecedor substitui no prazo do TR, contado da notificação.
  const substituir = de((e) => Boolean(situacaoDaSubstituicao(e.ocorrencias, hoje)));
  const substVencida = substituir.filter((e) => situacaoDaSubstituicao(e.ocorrencias, hoje)!.vencida);
  const substAberta = substituir.filter((e) => !situacaoDaSubstituicao(e.ocorrencias, hoje)!.vencida);
  if (substVencida.length) {
    const s0 = substVencida.map((e) => situacaoDaSubstituicao(e.ocorrencias, hoje)!).sort((a, b) => a.ate.localeCompare(b.ate))[0];
    comVoce.push({ chave: 'substituicao', tom: 'vencido', titulo: `Substituição vencida · ${itens(substVencida.length)} · ${textoDoVencimento(s0.dias)}`, detalhe: `${quem(substVencida)} · recusado: ${s0.motivo}`, prazo: dataBR(s0.ate), vencido: true, limite: s0.ate, acoes: [ocorrencia('Registrar a substituição', 'SUBSTITUICAO', substVencida, true), ocorrencia('Notificar', 'NOTIFICACAO', substVencida)] });
  }
  if (substAberta.length) {
    const s0 = substAberta.map((e) => situacaoDaSubstituicao(e.ocorrencias, hoje)!).sort((a, b) => a.ate.localeCompare(b.ate))[0];
    comOutros.push({ chave: 'substituir', tom: 'espera', quem: 'Fornecedor', titulo: `Substituir · ${itens(substAberta.length)} recusado${substAberta.length === 1 ? '' : 's'}`, detalhe: `${quem(substAberta)} · ${s0.motivo}`, prazo: dataBR(s0.ate), limite: s0.ate, acoes: [ocorrencia('Registrar a substituição', 'SUBSTITUICAO', substAberta)] });
  }
  const ordem = de((e) => e.etapa === 'INFO_ENVIADA');
  if (ordem.length) comVoce.push({ chave: 'ordem', tom: 'eu', titulo: `Emitir a Ordem de Fornecimento · ${itens(ordem.length)}`, detalhe: `${quem(ordem)} · as informações já chegaram`, acoes: [mudar('Registrar a Ordem', ordem)] });
  // Prazo pela Ordem (migration 294): sem o recebimento da Ordem pelo fornecedor, não há prazo pela regra.
  const semData = de((e) => EM_EXECUCAO.has(e.etapa) && !e.prevista && e.prazoInicio !== 'EXERCITO');
  if (semData.length) comVoce.push({ chave: 'data', tom: 'eu', titulo: `Informar o recebimento da Ordem · ${itens(semData.length)} sem prazo`, detalhe: `${quem(semData)} · o prazo corre do dia em que o fornecedor recebeu a Ordem`, acoes: [{ rotulo: 'Informar o recebimento', principal: true, faz: () => abrir('recebimento', semData) }] });
  // Recebimento (TRP, TRD) e envio para pagamento: prazo pela regra do TR (ou do contrato); a menor data do grupo.
  const semEntrega = de((e) => e.etapa === 'ENTREGUE' && !e.entregueEm);
  if (semEntrega.length) comVoce.push({ chave: 'entrega', tom: 'eu', titulo: `Registrar a data da entrega · ${itens(semEntrega.length)}`, detalhe: `${quem(semEntrega)} · o prazo do TRP e do TRD conta dela`, acoes: [mudar('Registrar a entrega', semEntrega)] });
  const recebimento: Array<[string, (e: EntregaFiscalizacao) => boolean, string, string]> = [
    ['provisorio', (e) => e.etapa === 'ENTREGUE' && Boolean(e.entregueEm) && !e.comissaoEnviadaEm, 'Enviar à comissão de recebimento', 'Registrar o envio à comissão'],
    // Com a comissão (enviado a ela para o TRP), o TRD também é dela: vai para as linhas da comissão abaixo.
    ['definitivo', (e) => e.etapa === 'TRP' && !cobrancaDaComissao(e, hoje), 'Emitir o TRD', 'Registrar o TRD'],
    ['pagamento', (e) => e.etapa === 'TRD', 'Enviar para pagamento e doação', 'Registrar o envio']
  ];
  for (const [chave, f, titulo, botao] of recebimento) {
    // Item recusado à espera da troca sai do recebimento até a substituição chegar.
    const x = de(f).filter((e) => !substituir.includes(e));
    if (!x.length) continue;
    const prazos = x.map((e) => prazoDoRecebimento(e, hoje)).filter((p) => p?.limite).sort((a, b) => a!.limite!.localeCompare(b!.limite!));
    const p = prazos[0];
    const vencidos = prazos.filter((q) => q!.tom === 'danger').length;
    const semRegra = !p && x.some((e) => e.regraDeRecebimento === false);
    comVoce.push({
      chave,
      tom: p?.tom === 'danger' ? 'vencido' : 'eu',
      titulo: `${titulo} · ${itens(x.length)}${p?.tom === 'danger' ? ` · vencido há ${-p.dias!} ${p.dias === -1 ? 'dia' : 'dias'}` : p?.dias === 0 ? ' · vence hoje' : ''}`,
      detalhe: `${quem(x)}${vencidos && vencidos < x.length ? ` · ${vencidos} vencido${vencidos === 1 ? '' : 's'}` : ''}${semRegra ? ' · prazo de recebimento a informar' : ''}`,
      prazo: p ? dataBR(p.limite) : undefined,
      vencido: p?.tom === 'danger',
      limite: p?.limite ?? null,
      acoes:
        chave === 'provisorio'
          ? [{ rotulo: botao, principal: true, faz: () => abrir('comissao', x) }, { rotulo: 'Registrar o TRP', faz: () => abrir('etapa', x) }, ocorrencia('Recusar', 'RECUSA', x)]
          : chave === 'definitivo'
            ? [mudar(botao, x), ocorrencia('Recusar', 'RECUSA', x)]
            : [mudar(botao, x)]
    });
  }
  // Com a comissão de recebimento: espera o TRP e depois o TRD; passados os dias da regra sem o termo, volta ao fiscal
  // para cobrar (a conta recomeça no TRP e a cada cobrança).
  for (const passo of ['TRP', 'TRD'] as const) {
    const naComissao = de((e) => cobrancaDaComissao(e, hoje)?.passo === passo && !substituir.includes(e));
    const cobrar = naComissao.filter((e) => cobrancaDaComissao(e, hoje)!.vencida);
    const aguardando = naComissao.filter((e) => !cobrancaDaComissao(e, hoje)!.vencida);
    const registrar = { rotulo: `Registrar o ${passo}` };
    if (cobrar.length) {
      const cs = cobrar.map((e) => cobrancaDaComissao(e, hoje)!);
      const maisAntigo = Math.max(...cs.map((c) => c.dias));
      const cobrados = Math.max(...cs.map((c) => c.cobrancas));
      const limite = cs.map((c) => c.cobrarEm).sort()[0];
      comVoce.push({
        chave: `cobrar-comissao-${passo.toLowerCase()}`,
        tom: 'vencido',
        titulo: `Cobrar a comissão de recebimento · ${itens(cobrar.length)} sem ${passo}`,
        detalhe: `${quem(cobrar)} · ${passo === 'TRP' ? `enviado${cobrar.length === 1 ? '' : 's'}` : 'TRP'} há ${maisAntigo} dias${cobrados ? ` · já cobrada ${cobrados === 1 ? '1 vez' : `${cobrados} vezes`}` : ''}`,
        prazo: dataBR(limite),
        vencido: true,
        limite,
        acoes: [{ rotulo: 'Registrar a cobrança', principal: true, faz: () => abrir('cobranca', cobrar) }, { ...registrar, faz: () => abrir('etapa', cobrar) }]
      });
    }
    if (aguardando.length) {
      const limite = aguardando.map((e) => cobrancaDaComissao(e, hoje)!.cobrarEm).sort()[0];
      comOutros.push({ chave: `comissao-${passo.toLowerCase()}`, tom: 'espera', quem: 'Comissão de recebimento', titulo: `Emitir o ${passo} · ${itens(aguardando.length)}`, detalhe: `${quem(aguardando)} · cobrar em ${dataBR(limite)} se não vier`, prazo: dataBR(limite), limite, acoes: [{ ...registrar, faz: () => abrir('etapa', aguardando) }] });
    }
  }
  const passos: Array<[string, (e: EntregaFiscalizacao) => boolean, string, string]> = [
    ['sal', (e) => e.etapa === 'PAGAMENTO' && Boolean(e.pagoEm) && e.origem === 'EMENDA', 'Enviar o Ofício à SAL', 'Registrar o ofício'],
    ['finalizar', (e) => e.etapa === 'PAGAMENTO' && Boolean(e.pagoEm) && e.origem !== 'EMENDA', 'Finalizar a fiscalização', 'Finalizar']
  ];
  for (const [chave, f, titulo, botao] of passos) {
    const x = de(f);
    if (x.length) comVoce.push({ chave, tom: 'eu', titulo: `${titulo} · ${itens(x.length)}`, detalhe: quem(x), acoes: [mudar(botao, x)] });
  }
  const info = de((e) => e.etapa === 'INFO_PEDIDA');
  if (info.length) comOutros.push({ chave: 'info', tom: 'espera', quem: 'CAEP', titulo: `Enviar as informações · ${itens(info.length)}`, detalhe: quem(info), acoes: [{ rotulo: 'Registrar as informações', faz: () => abrir('etapa', info) }] });
  const exercito = de((e) => e.etapa === 'CONTROLADO');
  if (exercito.length) comOutros.push({ chave: 'exercito', tom: 'espera', quem: 'Exército (DFPC)', titulo: `Autorizar os controlados · ${itens(exercito.length)}`, detalhe: `${quem(exercito)} · a DFPC pede o termo de doação`, acoes: [{ rotulo: 'Registrar a autorização', faz: () => abrir('etapa', exercito) }] });
  const fornecedor = de((e) => EM_EXECUCAO.has(e.etapa) && prazoDaEntrega(e).tom !== 'danger' && (Boolean(e.prevista) || e.prazoInicio === 'EXERCITO'));
  if (fornecedor.length) comOutros.push({ chave: 'fornecedor', tom: 'espera', quem: 'Fornecedor', titulo: `Entregar · ${itens(fornecedor.length)}`, detalhe: quem(fornecedor), prazo: dataBR(menorData(fornecedor)), limite: menorData(fornecedor), acoes: [{ rotulo: 'Registrar a entrega', faz: () => abrir('etapa', fornecedor, 'ENTREGUE') }] });
  const pagar = de((e) => e.etapa === 'PAGAMENTO' && !e.pagoEm);
  if (pagar.length) comOutros.push({ chave: 'pagar', tom: 'espera', quem: 'Financeiro', titulo: `Pagar a nota · ${itens(pagar.length)}`, detalhe: quem(pagar), acoes: [] });
  const area = es.filter((e) => e.responsavel === 'AREA');
  if (area.length) comOutros.push({ chave: 'area', tom: 'espera', quem: 'Área requisitante', titulo: `Fiscaliza ${itens(area.length)}`, detalhe: `${quem(area)} · sem acompanhamento da ${NOME_SFC}`, acoes: [] });
  return { comVoce, comOutros };
}

/** Com quem está o item (a mesma regra da mesa do contrato): o passo é do fiscal, de outros, ou acabou. */
export function comQuemEstaOItem(e: EntregaFiscalizacao): 'VOCE' | 'OUTROS' | 'FIM' {
  if (e.responsavel === 'AREA') return 'OUTROS';
  if (e.aviso) return 'VOCE';
  if (itemConcluido(e)) return 'FIM';
  // Ocorrências em aberto (entrega B): com o fornecedor até vencer; pedido de prorrogação é do fiscal.
  const hoje = hojeEmBrasilia();
  const notif = situacaoDaNotificacao(e.ocorrencias, hoje);
  if (notif) return notif.vencida ? 'VOCE' : 'OUTROS';
  if (e.ocorrencias?.pedido) return 'VOCE';
  const subst = situacaoDaSubstituicao(e.ocorrencias, hoje);
  if (subst) return subst.vencida ? 'VOCE' : 'OUTROS';
  if (e.etapa === 'INFO_PEDIDA' || e.etapa === 'CONTROLADO') return 'OUTROS';
  if (EM_EXECUCAO.has(e.etapa)) {
    if (!e.prevista && e.prazoInicio !== 'EXERCITO') return 'VOCE';
    if (prazoDaEntrega(e).tom !== 'danger') return 'OUTROS';
    return situacaoDaCobranca(e, hoje).estado === 'COBRADO' ? 'OUTROS' : 'VOCE';
  }
  if (e.etapa === 'PAGAMENTO') return e.pagoEm ? 'VOCE' : 'OUTROS';
  const comissao = cobrancaDaComissao(e, hojeEmBrasilia());
  if (comissao) return comissao.vencida ? 'VOCE' : 'OUTROS';
  return 'VOCE';
}

/**
 * Itens da planilha sem item da ata (migration 268): uma linha só, com quantos itens e quantos nomes escritos. Com o
 * fiscal quando o contrato tem itens de ata para escolher; senão, espera a Vinculação (Contratos à ata).
 */
export function linhaDeLigacao(es: EntregaFiscalizacao[], temItensDaAta: boolean, ligar: () => void): Linha | null {
  const gs = gruposALigar(es);
  if (!gs.length) return null;
  const n = gs.reduce((t, g) => t + g.es.length, 0);
  const nomes = gs.length === 1 ? `"${gs[0].texto}"` : `${gs.length} nomes de item`;
  if (!temItensDaAta) return { chave: 'ligar', tom: 'espera', quem: 'Vinculação', titulo: `Ligar o contrato à ata · ${itens(n)} esperam`, detalhe: `${nomes} · depois os itens se ligam pelo nome`, acoes: [] };
  return { chave: 'ligar', tom: 'eu', titulo: `Ligar ao item da ata · ${itens(n)}`, detalhe: `${nomes} · uma escolha por nome`, acoes: [{ rotulo: 'Ligar ao item da ata', principal: true, faz: ligar }] };
}

/** Itens da planilha com o beneficiário escrito à mão (migration 272): um passo só, com quantos itens e quantos nomes. */
export function linhaDeCadastro(es: EntregaFiscalizacao[], ligar: () => void): Linha | null {
  const gs = gruposSemCadastro(es);
  if (!gs.length) return null;
  const n = gs.reduce((t, g) => t + g.es.length, 0);
  const nomes = gs.length === 1 ? `"${gs[0].texto}"` : `${gs.length} nomes sem cadastro`;
  return { chave: 'cadastro', tom: 'eu', titulo: `Ligar ao cadastro de beneficiários · ${itens(n)}`, detalhe: `${nomes} · sem endereço de entrega até ligar`, acoes: [{ rotulo: 'Ligar ao cadastro', principal: true, faz: ligar }] };
}

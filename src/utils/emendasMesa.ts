/**
 * Aba Andamento do Pedido 360 como mesa de trabalho (protótipo v7 aprovado em 29/10/2026, D1–D15): quatro blocos
 * sempre na mesma ordem — Com você · Com outros · Onde está cada item · Caminho do pedido.
 *
 * Não cria regra nova: lê as tarefas de `andamentoDoPedido` (estado, prazo, regra), as pendências de
 * `tarefasDoPedido`, a situação na CCGA por item (migration 248) e a execução de cada nota (migration 231), e só
 * redistribui. Cada ação aparece numa linha só (D1, D3); o cartão do topo fica sem botão de passo.
 */
import type { BeneficiarioEmenda, EtapaPedido, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import type { PrecoDoItem } from '../services/emendasQuadroService';
import { numeroDaChave } from './contractKeyUtils';
import { dataBR, diasEntre, nomeDaLinhaDoPedido } from './emendasKits';
import {
  ataDoItem,
  avisoGrave,
  documentosDaEtapa,
  jaEmpenhado,
  linhasAtivas,
  linhasPorAta,
  notaZerada,
  rotuloDaEtapaDoPedido,
  seiDaEtapa,
  solicitacoesSemAta,
  type AvisoPedido,
  type TarefaDoPedido
} from './emendasPedidos';
import { andamentoDoPedido, type FaseDoAndamento, type TarefaDoAndamento } from './emendasAndamento';
import { ordensDoPedido } from './emendasOrdem';
import { atasParaDesfazer, atasParaEnviar, linhaContratada, linhasDevolvidas, temSituacaoNaCcga, textoDoMovimento } from './emendasCcga';

/** O que um botão da mesa faz; a tela traduz cada um para a janela de hoje. */
export type FazDaMesa =
  | { tipo: 'proxima' }
  | {
      tipo: 'janela';
      acao: 'OFICIO' | 'DIVERGENCIA' | 'ORDEM_FORNECIMENTO' | 'MAIS_CGOFI' | 'MAIS_EMPENHADO' | 'MAIS_CONTRATACAO' | 'SOLICITACAO_ATA';
      numero?: string;
    }
  | { tipo: 'pendencia'; tarefa: TarefaDoPedido }
  | { tipo: 'ccgaEnviar' }
  | { tipo: 'ccgaDesfazer' }
  | { tipo: 'anular' }
  /** Informação da ComprasSUSP ou Ordem emitida pela SFC, para os contratos (migration 250). */
  | { tipo: 'ordem'; modo: 'INFORMACAO' | 'ORDEM'; contratos: string[] };

export interface AcaoDaMesa {
  rotulo: string;
  /** botao: azul; link: discreto; perigo: link vermelho (anulação). */
  jeito: 'botao' | 'link' | 'perigo';
  faz: FazDaMesa;
  testId: string;
}

export interface LinhaDaMesa {
  chave: string;
  /** vencido: vermelho; eu: com a CAEP; espera: com outra unidade. */
  tom: 'vencido' | 'eu' | 'espera';
  /** Com outros: quem faz o próximo movimento (D15). */
  quem?: string;
  titulo: string;
  detalhe: string | null;
  prazo: string | null;
  vencido: boolean;
  /** Regra do prazo, no ⓘ (D13). */
  regra: string | null;
  acoes: AcaoDaMesa[];
}

/** Os 6 passos de cada item depois da nota (D5): Nota · Na CCGA · Contrato · Faturado · Liquidado · Pago. */
export const PASSOS_DO_ITEM = ['Nota', 'Na CCGA', 'Contrato', 'Faturado', 'Liquidado', 'Pago'] as const;
const PASSO_NO_TEXTO: Array<[string, string]> = [
  ['com nota', 'com nota'],
  ['na CCGA', 'na CCGA'],
  ['com contrato', 'com contrato'],
  ['faturado', 'faturados'],
  ['liquidado', 'liquidados'],
  ['pago', 'pagos']
];

export interface ItemDaMesa {
  chave: string;
  quantidade: number;
  nome: string;
  /** "00068/2025"; null para kit. */
  ata: string | null;
  /** -1: ainda sem nota (empenho anulado, rodada nova); 0..5: PASSOS_DO_ITEM. */
  passo: number;
  devolvido: boolean;
  /** Texto curto depois do passo: data, contrato ou motivo. */
  onde: string | null;
  /** Espera a CAEP: devolvido ou a enviar à CCGA. */
  comVoce: boolean;
}

export interface GrupoDaMesa {
  chave: string;
  /** Sigla ou nome curto; null quando o item não tem beneficiário. */
  nome: string;
  nomeLongo: string | null;
  itens: ItemDaMesa[];
  pendente: boolean;
  /** "5 pagos · 1 na CCGA" (D8). */
  resumo: string;
}

export interface ItensDaMesa {
  /** Todos no mesmo passo: uma frase só (D5). */
  uma: { texto: string; passo: number } | null;
  grupos: GrupoDaMesa[];
  /** Um beneficiário só: o título do grupo não aparece (D6). */
  unico: boolean;
  /** Mais de LIMITE_ABERTO linhas: grupos fechados e o filtro Com pendência · Todos (D8). */
  grande: boolean;
  total: number;
}

export interface FaseDaMesa {
  id: FaseDoAndamento;
  nome: string;
  estado: 'feita' | 'atual' | 'vem';
  texto: string;
}

export interface RegistroDaMesa {
  chave: string;
  texto: string;
  data: string | null;
  sei: string[];
  /** Linha sem número SEI onde ele cabe (D11: "sem SEI", sem link). */
  semSei: boolean;
  /** Devolução ou envio desfeito: em vermelho. */
  volta?: boolean;
  /** Etapa que aceita mais de um SEI (empenho, despacho): link "+ número SEI". */
  maisSei?: 'MAIS_EMPENHADO' | 'MAIS_CONTRATACAO';
}

export interface MesaDoPedido {
  comVoce: LinhaDaMesa[];
  comOutros: LinhaDaMesa[];
  itens: ItensDaMesa | null;
  fases: FaseDaMesa[];
  /** Passos da fase atual (D12). */
  passos: Array<{ nome: string; feito: boolean; atual: boolean }>;
  historico: Array<{ fase: string; registros: RegistroDaMesa[] }>;
}

/** Até 10 linhas, o quadro dos itens abre inteiro (71 de 97 pedidos em 29/10/2026). */
export const LIMITE_ABERTO = 10;
/** Mais de 5 linhas em Com você: o resto em "e mais N" (D3). */
export const LIMITE_COM_VOCE = 5;

const plural = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`;
const quase = (a: number | null | undefined, b: number | null | undefined) => b != null && b > 0 && (a ?? 0) >= b - 0.01;

/** Passo do item pela situação na CCGA e pela execução da nota (D5, D7). */
export function passoDoItem(p: PedidoEmenda, l: LinhaPedido, notas: Map<string, NotaDaLinha>): { passo: number; devolvido: boolean; onde: string | null } {
  const n = notas.get(l.id);
  if (!n?.nota || notaZerada(n))
    return {
      passo: -1,
      devolvido: false,
      onde: notaZerada(n) ? 'empenho anulado' : null
    };
  if (linhaContratada(l, notas)) {
    if (quase(n.valorPago, n.valorEmpenhado))
      return {
        passo: 5,
        devolvido: false,
        onde: n.pagoEm ? `em ${dataBR(n.pagoEm)}` : null
      };
    if (quase(n.valorLiquidado, n.valorEmpenhado))
      return {
        passo: 4,
        devolvido: false,
        onde: n.liquidadoEm ? `em ${dataBR(n.liquidadoEm)}` : null
      };
    if (n.faturas || n.faturadoEm)
      return {
        passo: 3,
        devolvido: false,
        onde: n.faturadoEm ? `em ${dataBR(n.faturadoEm)}` : null
      };
    return {
      passo: 2,
      devolvido: false,
      // Com a Ordem de Fornecimento emitida (migration 250), o item espera a entrega a partir dela.
      onde: [
        `Contrato ${numeroDaChave(n.contractKey!)}`,
        n.contratoAssinadoEm ? `assinado em ${dataBR(n.contratoAssinadoEm)}` : null,
        (() => {
          const o = p.ordens?.find((x) => x.contractKey === n.contractKey);
          return o?.ordemEm ? `Ordem de Fornecimento em ${dataBR(o.ordemEm)}` : null;
        })()
      ]
        .filter(Boolean)
        .join(' · ')
    };
  }
  if (l.ccgaSituacao === 'DEVOLVIDA')
    return {
      passo: 1,
      devolvido: true,
      onde: [l.ccgaEm ? `em ${dataBR(l.ccgaEm)}` : null, l.ccgaMotivo].filter(Boolean).join(' · ') || null
    };
  // Pedido enviado inteiro antes da migration 248: a contratação é a CCGA.
  if (l.ccgaSituacao === 'ENVIADA' || (p.etapa === 'CONTRATACAO' && !temSituacaoNaCcga(p)))
    return {
      passo: 1,
      devolvido: false,
      onde: l.ccgaEm ? `desde ${dataBR(l.ccgaEm)}` : null
    };
  return {
    passo: 0,
    devolvido: false,
    onde: jaEmpenhado(p.etapa) ? 'a enviar à CCGA' : null
  };
}

/** O quadro "Onde está cada item" (D5–D8): só a partir da nota de empenho. */
export function itensDaMesa(p: PedidoEmenda, itens: Map<string, ItemCaep>, notas: Map<string, NotaDaLinha>, beneficiarios: Map<string, BeneficiarioEmenda>): ItensDaMesa | null {
  const linhas = linhasAtivas(p);
  if (p.etapa === 'CANCELADO' || linhas.length === 0) return null;
  if (!jaEmpenhado(p.etapa) && !linhas.some((l) => notas.get(l.id)?.nota)) return null;

  const grupos = new Map<string, GrupoDaMesa>();
  for (const l of linhas) {
    const b = l.beneficiarioId ? beneficiarios.get(l.beneficiarioId) : undefined;
    const chaveB = l.beneficiarioId ?? `nome:${l.beneficiarioNome ?? ''}`;
    const g = grupos.get(chaveB) ?? {
      chave: chaveB,
      nome: b?.sigla?.trim() || b?.nome || l.beneficiarioNome || 'Sem beneficiário',
      nomeLongo: b?.sigla?.trim() ? b.nome : null,
      itens: [],
      pendente: false,
      resumo: ''
    };
    const s = passoDoItem(p, l, notas);
    const nome = nomeDaLinhaDoPedido({ ...l, quantidade: 1 }, itens, 40).replace(/^1×?\s+/, '');
    const ata = l.tipo === 'ITEM' && l.itemKey ? ataDoItem(l.itemKey).split('-')[0] : null;
    // Linhas iguais se juntam: mesmo item, mesmo beneficiário, mesmo passo (D5).
    const chaveI = `${nome}|${ata}|${s.passo}|${s.devolvido}|${s.onde}`;
    const igual = g.itens.find((x) => x.chave === chaveI);
    if (igual) igual.quantidade += l.quantidade;
    else
      g.itens.push({
        chave: chaveI,
        quantidade: l.quantidade,
        nome,
        ata,
        passo: s.passo,
        devolvido: s.devolvido,
        onde: s.onde,
        comVoce: s.devolvido || (s.passo === 0 && jaEmpenhado(p.etapa))
      });
    grupos.set(chaveB, g);
  }
  const ordem = (x: ItemDaMesa) => (x.devolvido ? -2 : x.passo);
  const lista = [...grupos.values()].map((g) => {
    g.itens.sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    g.pendente = g.itens.some((x) => x.comVoce || x.passo < 0);
    g.resumo = resumoDosItens(g.itens);
    return g;
  });
  lista.sort((a, b) => Number(b.pendente) - Number(a.pendente) || Math.min(...a.itens.map(ordem)) - Math.min(...b.itens.map(ordem)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const todos = lista.flatMap((g) => g.itens);
  const total = todos.length;
  const passos = new Set(todos.map((x) => `${x.passo}|${x.devolvido}`));
  const uma =
    passos.size === 1 && !todos[0].devolvido && todos[0].passo >= 0
      ? {
          // Do contrato em diante, o mesmo detalhe da linha do item (contrato, assinatura, Ordem, data) quando é um só.
          texto: `${linhas.length === 1 ? 'O item está' : `Os ${linhas.length} itens estão`} ${PASSO_NO_TEXTO[todos[0].passo][linhas.length === 1 ? 0 : 1]}${todos[0].passo === 0 && jaEmpenhado(p.etapa) && p.etapa === 'EMPENHADO' ? ', a enviar à CCGA' : ''}${todos[0].passo >= 2 && new Set(todos.map((x) => x.onde)).size === 1 && todos[0].onde ? ` · ${todos[0].onde}` : ''}.`,
          passo: todos[0].passo
        }
      : null;
  return {
    uma,
    grupos: lista,
    unico: lista.length === 1,
    grande: total > LIMITE_ABERTO,
    total
  };
}

/** "1 devolvido · 5 pagos · 1 na CCGA". */
export function resumoDosItens(xs: ItemDaMesa[]): string {
  const dev = xs.filter((x) => x.devolvido).reduce((n, x) => n + x.quantidade, 0);
  const sem = xs.filter((x) => x.passo < 0).reduce((n, x) => n + x.quantidade, 0);
  const partes: string[] = [];
  if (dev) partes.push(`${dev} ${dev === 1 ? 'devolvido' : 'devolvidos'}`);
  if (sem) partes.push(`${sem} sem nota`);
  for (let i = 0; i < PASSOS_DO_ITEM.length; i++) {
    const n = xs.filter((x) => !x.devolvido && x.passo === i).reduce((s, x) => s + x.quantidade, 0);
    if (n) partes.push(`${n} ${PASSO_NO_TEXTO[i][n === 1 ? 0 : 1]}`);
  }
  return partes.join(' · ');
}

/** A fase em que a etapa gravada do pedido está. */
const FASE_DA_ETAPA: Partial<Record<EtapaPedido, FaseDoAndamento>> = {
  RESERVADO: 'INTERLOCUCAO',
  MINUTA: 'INTERLOCUCAO',
  OFICIO: 'EMPENHO',
  CONFERIDO: 'EMPENHO',
  SOLICITADO: 'EMPENHO',
  AUTORIZADO: 'EMPENHO',
  CGOFI: 'EMPENHO',
  EMPENHADO: 'CONTRATACAO',
  CONTRATACAO: 'CONTRATACAO'
};

const NOME_FASE: Record<FaseDoAndamento, string> = {
  INTERLOCUCAO: 'Interlocução',
  EMPENHO: 'Empenho',
  CONTRATACAO: 'Contratação',
  EXECUCAO: 'Execução'
};

/** Data em "dd/mm/aaaa" de volta para ISO, para ordenar o vencido primeiro. */
const isoDe = (br: string | null): string | null => (br && /^\d{2}\/\d{2}\/\d{4}$/.test(br) ? `${br.slice(6)}-${br.slice(3, 5)}-${br.slice(0, 2)}` : null);

/** Monta a mesa do pedido. `hoje` em Brasília (aaaa-mm-dd). Sem `podeGerir`, as mesmas linhas, sem botões. */
export function mesaDoPedido(
  p: PedidoEmenda,
  itens: Map<string, ItemCaep>,
  notas: Map<string, NotaDaLinha>,
  avisos: AvisoPedido[],
  hoje: string,
  podeGerir: boolean,
  beneficiarios: Map<string, BeneficiarioEmenda>,
  precos?: Map<string, PrecoDoItem>
): MesaDoPedido {
  const cancelado = p.etapa === 'CANCELADO';
  const andamento = andamentoDoPedido(p, itens, notas, hoje, podeGerir, precos);
  const tarefas = andamento.fases.flatMap((f) => f.tarefas);
  const tarefa = (chave: TarefaDoAndamento['chave']) => tarefas.find((t) => t.chave === chave)!;
  const porAta = temSituacaoNaCcga(p);
  const comVoce: LinhaDaMesa[] = [];
  const comOutros: LinhaDaMesa[] = [];
  const se = (cond: boolean, a: AcaoDaMesa): AcaoDaMesa[] => (podeGerir && cond ? [a] : []);

  if (!cancelado) {
    // Anulação de empenho (D14): uma linha, na nota zerada.
    for (const a of avisos.filter((x) => x.tipo === 'empenhoAnulado')) {
      comVoce.push({
        chave: 'anulacao',
        tom: 'vencido',
        titulo: 'Empenho anulado',
        detalhe: `${a.texto}. Se a nota foi refeita, o aviso some quando o sistema ligar a nota nova.`,
        prazo: null,
        vencido: true,
        regra: null,
        acoes: se(true, {
          rotulo: 'Registrar anulação',
          jeito: 'botao',
          faz: { tipo: 'anular' },
          testId: `emendas-pedido-registrar-anulacao-${p.id}`
        })
      });
    }

    // Itens devolvidos pela CCGA (D10): reenviar ou anular, na mesma linha.
    const devolvidas = linhasDevolvidas(p, notas);
    if (devolvidas.length) {
      const atas = [...new Set(devolvidas.map((l) => (l.itemKey ? ataDoItem(l.itemKey).split('-')[0] : '?')))];
      const d = devolvidas[0];
      comVoce.push({
        chave: 'devolvido-ccga',
        tom: 'vencido',
        titulo: `${plural(devolvidas.length, 'item devolvido', 'itens devolvidos')} pela CCGA · ${atas.length === 1 ? `Ata ${atas[0]}` : `atas ${atas.join(', ')}`}`,
        detalhe: `Em ${dataBR(d.ccgaEm)} · ${d.ccgaMotivo ?? 'sem motivo'}${d.ccgaExplicacao ? `: ${d.ccgaExplicacao.replace(/\.$/, '')}` : ''}`,
        prazo: null,
        vencido: true,
        regra: null,
        acoes: [
          ...se(true, {
            rotulo: 'Registrar anulação',
            jeito: 'perigo',
            faz: { tipo: 'anular' },
            testId: `emendas-pedido-devolvido-anular-${p.id}`
          }),
          ...se(true, {
            rotulo: 'Reenviar à CCGA',
            jeito: 'botao',
            faz: { tipo: 'ccgaEnviar' },
            testId: `emendas-pedido-reenviar-ccga-${p.id}`
          })
        ]
      });
    }

    // Tarefas com a CAEP: a linha da tarefa com o botão do próximo passo e as pendências que pedem botão.
    for (const t of tarefas) {
      if (t.estado === 'COMIGO') {
        // Despacho com envio por ata: uma linha "Enviar à CCGA" com as atas (D3, D10).
        if (t.chave === 'despacho' && porAta) continue;
        // Informação e Ordem por contrato: linhas próprias abaixo (migration 250).
        if (t.chave === 'ordem' && !p.ordemFornecimentoEm) continue;
        const acoes: AcaoDaMesa[] = [];
        if (t.chave === 'minuta' && p.etapa === 'RESERVADO' && p.autorId)
          acoes.push(
            ...se(true, {
              rotulo: 'Já chegou o ofício',
              jeito: 'link',
              faz: { tipo: 'janela', acao: 'OFICIO' },
              testId: `emendas-pedido-ja-chegou-oficio-${p.id}`
            })
          );
        if (t.chave === 'conferir' && p.etapa === 'OFICIO')
          acoes.push(
            ...se(true, {
              rotulo: 'Ofício com divergência',
              jeito: 'perigo',
              faz: { tipo: 'janela', acao: 'DIVERGENCIA' },
              testId: `emendas-pedido-divergencia-${p.id}`
            })
          );
        if (t.proxima)
          acoes.push({
            rotulo: t.proxima,
            jeito: 'botao',
            faz: { tipo: 'proxima' },
            testId: `emendas-pedido-proximo-${p.id}`
          });
        if (t.chave === 'ordem')
          acoes.push(
            ...se(true, {
              rotulo: 'Registrar as informações',
              jeito: 'botao',
              faz: { tipo: 'janela', acao: 'ORDEM_FORNECIMENTO' },
              testId: 'emendas-pedido-ordem-fornecimento'
            })
          );
        const pendentes = t.pendencias.filter((x) => x.botao);
        // A tarefa só com pendências (assinatura de uma ata, beneficiário): cada pendência é a linha.
        if (acoes.length || !pendentes.length) {
          comVoce.push({
            chave: `tarefa-${t.chave}`,
            tom: t.vencido ? 'vencido' : 'eu',
            titulo: t.nome,
            detalhe:
              [
                t.progresso,
                t.pendencias
                  .filter((x) => !x.botao)
                  .map((x) => x.titulo)
                  .join('; ') || null
              ]
                .filter(Boolean)
                .join(' · ') || null,
            prazo: t.prazo,
            vencido: t.vencido,
            regra: t.regra,
            acoes
          });
        }
        for (const x of pendentes) {
          comVoce.push({
            chave: `pend-${x.chave}`,
            tom: 'eu',
            titulo: x.titulo,
            detalhe: x.detalhe,
            prazo: null,
            vencido: false,
            regra: null,
            acoes: se(true, {
              rotulo: x.botao!.rotulo,
              jeito: 'botao',
              faz: { tipo: 'pendencia', tarefa: x },
              testId: `emendas-pedido-tarefa-${x.chave}`
            })
          });
        }
      } else if (t.estado !== 'FEITA') {
        // Pendência com botão numa tarefa que espera outra unidade (rodada nova: envio à CGOFI).
        for (const x of t.pendencias.filter((y) => y.botao && y.tom === 'acao'))
          comVoce.push({
            chave: `pend-${x.chave}`,
            tom: 'eu',
            titulo: x.titulo,
            detalhe: x.detalhe,
            prazo: null,
            vencido: false,
            regra: null,
            acoes: se(true, {
              rotulo: x.botao!.rotulo,
              jeito: 'botao',
              faz: { tipo: 'pendencia', tarefa: x },
              testId: `emendas-pedido-tarefa-${x.chave}`
            })
          });
      }
    }

    // Envio à CCGA por ata (D10): as atas a enviar numa linha só; o devolvido já tem a sua.
    if (porAta) {
      const devolvidaIds = new Set(devolvidas.map((l) => l.id));
      const aEnviar = atasParaEnviar(p, notas).filter((a) => a.linhas.some((l) => !devolvidaIds.has(l.id)));
      if (aEnviar.length) {
        const despacho = tarefa('despacho');
        const n = aEnviar.reduce((s, a) => s + a.linhas.filter((l) => !devolvidaIds.has(l.id)).length, 0);
        comVoce.push({
          chave: 'ccga-enviar',
          tom: despacho.vencido ? 'vencido' : 'eu',
          titulo: `Enviar à CCGA · ${aEnviar.length === 1 ? `Ata ${aEnviar[0].numeroAta}` : `${aEnviar.length} atas (${aEnviar.map((a) => a.numeroAta).join(', ')})`}`,
          detalhe: `${plural(n, 'item com nota', 'itens com nota')}. Um despacho por ata; o gestor de cada ata recebe o alerta.`,
          prazo: despacho.estado === 'COMIGO' ? despacho.prazo : null,
          vencido: despacho.estado === 'COMIGO' && despacho.vencido,
          regra: despacho.estado === 'COMIGO' ? despacho.regra : null,
          acoes: se(true, {
            rotulo: 'Enviar à CCGA',
            jeito: 'botao',
            faz: { tipo: 'ccgaEnviar' },
            testId: `emendas-pedido-enviar-ccga-${p.id}`
          })
        });
      }
    }

    // Informação e Ordem de Fornecimento por contrato (migration 250): a Informação é com a ComprasSUSP; a Ordem, com a SFC.
    if (!p.ordemFornecimentoEm) {
      const ordens = ordensDoPedido(p, notas);
      const aInformar = ordens.filter((o) => o.estado === 'A_INFORMAR');
      if (aInformar.length)
        comVoce.push({
          chave: 'ordem-informacao',
          tom: 'eu',
          titulo: `Fazer a Informação para a Ordem de Fornecimento · ${aInformar.length === 1 ? `Contrato ${aInformar[0].numero}` : `${aInformar.length} contratos (${aInformar.map((o) => o.numero).join(', ')})`}`,
          detalhe: 'No processo do contrato: item, emenda, beneficiário, CNPJ e local de entrega. Depois o Setor de Fiscalização de Contratos emite a Ordem.',
          prazo: null,
          vencido: false,
          regra: null,
          acoes: se(true, {
            rotulo: 'Registrar a Informação',
            jeito: 'botao',
            faz: { tipo: 'ordem', modo: 'INFORMACAO', contratos: aInformar.map((o) => o.contractKey) },
            testId: `emendas-pedido-ordem-informacao-${p.id}`
          })
        });
      for (const o of ordens.filter((x) => x.estado === 'NA_SFC'))
        comOutros.push({
          chave: `ordem-sfc-${o.contractKey}`,
          tom: 'espera',
          quem: 'SFC',
          titulo: `Emitir a Ordem de Fornecimento · Contrato ${o.numero}`,
          detalhe: `Informação de ${dataBR(o.registro!.informacaoEm)}.`,
          prazo: null,
          vencido: false,
          regra: null,
          acoes: se(true, {
            rotulo: 'Registrar a Ordem',
            jeito: 'link',
            faz: { tipo: 'ordem', modo: 'ORDEM', contratos: [o.contractKey] },
            testId: `emendas-pedido-ordem-emitida-${o.contractKey}`
          })
        });
    }

    // Solicitação sem ata: ligar a uma ata.
    const soltas = solicitacoesSemAta(p);
    if (soltas.length && jaEmpenhado(p.etapa) === false && podeGerir) {
      comVoce.push({
        chave: 'solicitacao-sem-ata',
        tom: 'eu',
        titulo: soltas.length === 1 ? 'Solicitação sem ata' : `${soltas.length} solicitações sem ata`,
        detalhe: soltas.join(', '),
        prazo: null,
        vencido: false,
        regra: null,
        acoes: [
          {
            rotulo: 'Ligar a uma ata',
            jeito: 'link',
            faz: { tipo: 'janela', acao: 'SOLICITACAO_ATA', numero: soltas[0] },
            testId: `emendas-pedido-ligar-ata-${p.id}`
          }
        ]
      });
    }

    // Números SEI que faltam (D11): uma linha só, um link para cada.
    const faltaSei: AcaoDaMesa[] = [];
    if (jaEmpenhado(p.etapa) && !p.cgofiDocumentoSei)
      faltaSei.push({
        rotulo: 'envio à CGOFI',
        jeito: 'link',
        faz: { tipo: 'janela', acao: 'MAIS_CGOFI' },
        testId: 'emendas-pedido-mais-sei-CGOFI'
      });
    if (jaEmpenhado(p.etapa) && seiDaEtapa(p, 'EMPENHADO').length === 0)
      faltaSei.push({
        rotulo: 'nota de empenho',
        jeito: 'link',
        faz: { tipo: 'janela', acao: 'MAIS_EMPENHADO' },
        testId: 'emendas-pedido-mais-sei-EMPENHADO'
      });
    if (p.etapa === 'CONTRATACAO' && !porAta && seiDaEtapa(p, 'CONTRATACAO').length === 0)
      faltaSei.push({
        rotulo: 'despacho à CCGA',
        jeito: 'link',
        faz: { tipo: 'janela', acao: 'MAIS_CONTRATACAO' },
        testId: 'emendas-pedido-mais-sei-CONTRATACAO'
      });
    // Pedido do controle anterior da CAEP: o SEI que faltou lá não vira tarefa (35 de 81 pedidos empenhados em
    // 30/10/2026); o histórico continua mostrando "sem SEI".
    if (faltaSei.length && podeGerir && p.origem !== 'PLANILHA') {
      comVoce.push({
        chave: 'falta-sei',
        tom: 'eu',
        titulo: `Completar ${faltaSei.length === 1 ? '1 número SEI' : `${faltaSei.length} números SEI`}`,
        detalhe: 'O sistema registrou a etapa pela fonte; falta o documento no SEI.',
        prazo: null,
        vencido: false,
        regra: null,
        acoes: faltaSei
      });
    }

    // Avisos do pedido que não são tarefa (ata vencendo, empenhado a mais...): na mesa, sem faixa solta (D2).
    // A ata que vence com itens na CCGA: o aviso entra na linha da CCGA daquela ata, que já tem o fim da ata como prazo.
    const naCcga = new Set(
      porAta
        ? atasParaDesfazer(p, notas)
            .filter((a) => a.linhas.some((l) => l.ccgaSituacao === 'ENVIADA'))
            .map((a) => a.ataKey)
        : []
    );
    const venceNaCcga = new Map<string, string>();
    for (const a of andamento.avisos) {
      // Anulação e devolução já têm a sua linha acima.
      if (a.chave === 'aviso-empenhoAnulado' || a.chave === 'aviso-devolvidoCcga') continue;
      if (a.chave.startsWith('vence-') && naCcga.has(a.chave.slice(6))) {
        venceNaCcga.set(a.chave.slice(6), a.titulo);
        continue;
      }
      const grave = avisos.some((x) => avisoGrave(x) && a.titulo === x.curto);
      const linha: LinhaDaMesa = {
        chave: `aviso-${a.chave}`,
        tom: grave ? 'vencido' : a.tom === 'espera' ? 'espera' : 'eu',
        titulo: a.titulo,
        detalhe: a.detalhe,
        prazo: null,
        vencido: grave,
        regra: null,
        acoes: []
      };
      if (a.botao)
        linha.acoes = se(true, {
          rotulo: a.botao.rotulo,
          jeito: 'botao',
          faz: { tipo: 'pendencia', tarefa: a },
          testId: `emendas-pedido-tarefa-${a.chave}`
        });
      if (a.tom === 'espera') comOutros.push({ ...linha, quem: 'Sistema' });
      else comVoce.push(linha);
    }

    // Com outros (D4): a tarefa que espera outra unidade, com prazo. O que vem das fontes fica no trilho dos itens.
    for (const t of tarefas) {
      if (t.estado !== 'AGUARDANDO' && t.estado !== 'COBRAR') continue;
      if (t.chave === 'ordem') continue;
      comOutros.push({
        chave: `tarefa-${t.chave}`,
        tom: t.estado === 'COBRAR' ? 'vencido' : 'espera',
        quem: t.comQuem,
        titulo: t.nome,
        detalhe: t.progresso,
        prazo: t.prazo,
        vencido: t.vencido,
        regra: t.regra,
        acoes: []
      });
    }
    // CCGA de cada ata, com o prazo do fim da ata e o "Desfazer envio" da própria linha.
    const vigencias = new Map(linhasPorAta(p, itens).map((g) => [g.chave, g.vigenciaFinal]));
    if (porAta) {
      for (const a of atasParaDesfazer(p, notas)) {
        const na = a.linhas.filter((l) => l.ccgaSituacao === 'ENVIADA');
        if (!na.length) continue;
        const desde =
          na
            .map((l) => l.ccgaEm)
            .filter((d): d is string => Boolean(d))
            .sort()[0] ?? null;
        const fim = vigencias.get(a.ataKey) ?? null;
        comOutros.push({
          chave: `ccga-${a.ataKey}`,
          tom: fim && diasEntre(hoje, fim) < 0 ? 'vencido' : 'espera',
          quem: 'CCGA',
          titulo: `Contrato de ${plural(na.length, 'item', 'itens')} · Ata ${a.numeroAta}`,
          detalhe:
            [desde ? `Na CCGA desde ${dataBR(desde)} (${diasEntre(desde, hoje)} dias).` : null, venceNaCcga.has(a.ataKey) ? `${venceNaCcga.get(a.ataKey)}.` : null].filter(Boolean).join(' ') || null,
          prazo: fim ? dataBR(fim) : null,
          vencido: Boolean(fim && diasEntre(hoje, fim) < 0),
          regra: 'O contrato precisa ser assinado antes do fim da ata. O sistema atualiza pelo Contratos.gov.br.',
          acoes: se(true, {
            rotulo: 'Desfazer envio',
            jeito: 'link',
            faz: { tipo: 'ccgaDesfazer' },
            testId: `emendas-pedido-desfazer-ccga-${a.ataKey}`
          })
        });
      }
    } else {
      const contrato = tarefa('contrato');
      if (contrato.estado === 'FONTE')
        comOutros.push({
          chave: 'tarefa-contrato',
          tom: contrato.vencido ? 'vencido' : 'espera',
          quem: 'CCGA',
          titulo: contrato.nome,
          detalhe: contrato.progresso,
          prazo: contrato.prazo,
          vencido: contrato.vencido,
          regra: contrato.regra,
          acoes: []
        });
    }
  }

  // O vencido primeiro, depois o que vence logo, por fim o que não tem prazo (D3).
  const peso = (l: LinhaDaMesa) => (l.vencido ? 0 : l.prazo ? 1 : 2);
  const ordenar = (xs: LinhaDaMesa[]) => xs.sort((a, b) => peso(a) - peso(b) || (isoDe(a.prazo) ?? '9').localeCompare(isoDe(b.prazo) ?? '9'));

  // Caminho do pedido (D12): 4 fases; a Execução acende com o primeiro item com contrato.
  const comContrato = linhasAtivas(p).some((l) => linhaContratada(l, notas));
  const ORDEM_FASE: FaseDoAndamento[] = ['INTERLOCUCAO', 'EMPENHO', 'CONTRATACAO', 'EXECUCAO'];
  const daEtapa = FASE_DA_ETAPA[p.etapa];
  const fases: FaseDaMesa[] = andamento.fases.map((f) => {
    const contaveis = f.tarefas.filter((t) => t.estado !== 'NAO_HOUVE');
    const todasFeitas = contaveis.length > 0 && contaveis.every((t) => t.estado === 'FEITA');
    let estado: FaseDaMesa['estado'];
    if (cancelado || !daEtapa) estado = f.tarefas.some((t) => t.estado === 'FEITA') ? 'feita' : 'vem';
    else if (f.id === 'EXECUCAO') estado = todasFeitas ? 'feita' : comContrato || p.ordemFornecimentoEm ? 'atual' : 'vem';
    else if (f.id === 'CONTRATACAO' && daEtapa === 'CONTRATACAO') estado = todasFeitas ? 'feita' : 'atual';
    else {
      const d = ORDEM_FASE.indexOf(f.id) - ORDEM_FASE.indexOf(daEtapa);
      estado = d < 0 ? 'feita' : d === 0 ? 'atual' : 'vem';
    }
    const texto = estado === 'feita' ? (f.id === 'EMPENHO' ? 'concluído' : 'concluída') : estado === 'vem' ? 'ainda não' : f.id === 'EXECUCAO' ? 'já começou' : rotuloDaEtapaDoPedido(p, notas);
    return { id: f.id, nome: NOME_FASE[f.id], estado, texto };
  });
  // Os passos da fase do pedido (na contratação concluída, os da execução).
  const idAtual = fases.find((f) => f.id === daEtapa && f.estado === 'atual')?.id ?? fases.find((f) => f.estado === 'atual')?.id;
  const atual = andamento.fases.find((f) => f.id === idAtual);
  // Só o primeiro passo ainda aberto é o atual; os seguintes ficam como "ainda não".
  const daFase = atual ? atual.tarefas.filter((t) => t.estado !== 'NAO_HOUVE') : [];
  const primeiroAberto = daFase.findIndex((t) => t.estado !== 'FEITA');
  const passos = daFase.map((t, i) => ({ nome: t.nome, feito: t.estado === 'FEITA', atual: i === primeiroAberto }));

  // Histórico (D12): o que foi feito, por fase, com data e SEI; envios e devoluções da CCGA na Contratação.
  const docs = (e: EtapaPedido) => documentosDaEtapa(p, e);
  const registro = (t: TarefaDoAndamento): RegistroDaMesa | null => {
    if (t.estado !== 'FEITA') return null;
    // Informação e Ordem por contrato: registros próprios na Execução (migration 250).
    if (t.chave === 'ordem' && !p.ordemFornecimentoEm) return null;
    const e = t.etapa;
    const sei = e ? docs(e).map((d) => d.numero) : t.chave === 'ordem' && p.ordemFornecimentoDocumentoSei ? [p.ordemFornecimentoDocumentoSei] : [];
    const temDocumento = e === 'SOLICITADO' || e === 'CGOFI' || e === 'EMPENHADO' || (e === 'CONTRATACAO' && !porAta) || t.chave === 'ordem';
    return {
      chave: t.chave,
      texto: t.nome,
      // Pedido do controle anterior da CAEP: a falta de data se explica na própria linha (antes, uma frase no rodapé).
      data: t.feito ?? (p.origem === 'PLANILHA' ? 'sem data no controle anterior' : null),
      sei,
      semSei: temDocumento && sei.length === 0,
      maisSei: podeGerir && sei.length > 0 && (e === 'EMPENHADO' || (e === 'CONTRATACAO' && !porAta)) ? (e === 'EMPENHADO' ? 'MAIS_EMPENHADO' : 'MAIS_CONTRATACAO') : undefined
    };
  };
  const historico = andamento.fases
    .map((f) => {
      const registros = f.tarefas.map(registro).filter((r): r is RegistroDaMesa => Boolean(r));
      if (f.id === 'INTERLOCUCAO') {
        if (p.oficioProcessoSei)
          registros.push({
            chave: 'processo',
            texto: 'Processo do ofício',
            data: null,
            sei: [p.oficioProcessoSei],
            semSei: false
          });
        for (const d of p.devolucoes)
          registros.push({
            chave: `devolucao-${d.rodada}`,
            texto: `Ofício devolvido (${d.rodada}ª minuta): ${d.motivo}`,
            data: dataBR(d.devolvidoEm),
            sei: d.oficioDocumentoSei ? [d.oficioDocumentoSei] : [],
            semSei: false,
            volta: true
          });
        // Ofício retificador (migration 249): substitui o ofício anterior, que fica aqui.
        for (const m of (p.movimentos ?? []).filter((x) => x.acao === 'RETIFICADOR')) {
          const t = textoDoMovimento(m, m.linhaIds.length);
          registros.push({
            chave: `mov-${m.id}`,
            texto: [t.titulo, t.detalhe].filter(Boolean).join(' · '),
            data: dataBR(m.data),
            sei: m.documentoSei ? [m.documentoSei] : [],
            semSei: false
          });
        }
      }
      if (f.id === 'EXECUCAO')
        for (const o of p.ordens ?? []) {
          const numero = numeroDaChave(o.contractKey);
          if (o.informacaoEm)
            registros.push({ chave: `informacao-${o.contractKey}`, texto: `Informação para a Ordem de Fornecimento · Contrato ${numero}`, data: dataBR(o.informacaoEm), sei: o.informacaoDocumentoSei ? [o.informacaoDocumentoSei] : [], semSei: false });
          if (o.ordemEm)
            registros.push({ chave: `ordem-${o.contractKey}`, texto: `Ordem de Fornecimento · Contrato ${numero}`, data: dataBR(o.ordemEm), sei: o.ordemDocumentoSei ? [o.ordemDocumentoSei] : [], semSei: false });
        }
      if (f.id === 'CONTRATACAO')
        for (const m of p.movimentos ?? []) {
          if (m.acao === 'VOLTOU_ETAPA' || m.acao === 'RETIFICADOR') continue;
          const t = textoDoMovimento(m, m.linhaIds.length);
          registros.push({
            chave: `mov-${m.id}`,
            texto: [t.titulo, t.detalhe].filter(Boolean).join(' · '),
            data: dataBR(m.data),
            sei: m.documentoSei ? [m.documentoSei] : [],
            semSei: false,
            volta: m.acao !== 'ENVIO_CCGA'
          });
        }
      return { fase: NOME_FASE[f.id], registros };
    })
    .filter((f) => f.registros.length > 0);
  // A observação do pedido (quase sempre anotação das cargas: ofício, valor, pedidos juntados) é histórico: vai no
  // alto do Histórico, com o texto inteiro, em vez de um ⓘ solto no rodapé da aba.
  if (p.observacao?.trim()) historico.unshift({ fase: 'Observação do pedido', registros: [{ chave: 'observacao', texto: p.observacao.trim(), data: null, sei: [], semSei: false }] });
  const voltas = (p.movimentos ?? []).filter((m) => m.acao === 'VOLTOU_ETAPA');
  if (voltas.length)
    historico.push({
      fase: 'Etapas voltadas',
      registros: voltas.map((m) => {
        const t = textoDoMovimento(m, m.linhaIds.length);
        return {
          chave: `mov-${m.id}`,
          texto: [t.titulo, t.detalhe].filter(Boolean).join(' · '),
          data: dataBR(m.data),
          sei: [],
          semSei: false,
          volta: true
        };
      })
    });

  return {
    comVoce: ordenar(comVoce),
    comOutros: ordenar(comOutros),
    itens: itensDaMesa(p, itens, notas, beneficiarios),
    fases,
    passos,
    historico
  };
}

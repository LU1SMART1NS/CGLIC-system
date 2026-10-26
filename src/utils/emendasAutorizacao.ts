/**
 * Quadros da autorização de empenho (protótipo aprovado em 26/10/2026; modelo: SEI 37098929, "Autorização – Emissão de
 * DDO e NE"). A autorização é por ata e tem dois quadros, que a CAEP cola no SEI:
 *   - item 5, "pretensões do Parlamentar": ARP · ITEM · OBJETO · BENEFICIÁRIO · QUANT. · PARLAMENTAR · EMENDA ·
 *     VALOR UNT. · VALOR TOTAL, uma linha por beneficiário, mesclando o item e, dentro dele, o pedido;
 *   - item 6, "unidade requisitante": a caixa da Senasp (gerenciador ou participante), modalidade, certame e UASG, e a
 *     tabela ITEM · DESCRIÇÃO · QUANT. · VALOR UNITÁRIO · VALOR TOTAL com a quantidade somada por item.
 * Podem entrar vários pedidos (de parlamentares diferentes) da mesma ata. O preço é o da ata hoje, como no documento.
 * Só monta os quadros: nada é gravado aqui.
 */
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, LinhaPedido, PedidoEmenda } from '../services/emendasService';
import { localDoBeneficiario, nomeESigla } from '../services/emendasService';
import { ataDoItem, itensDaLinha, linhasAtivas, ORDEM_ETAPA, solicitacaoDaLinha } from './emendasPedidos';

/** Etapas em que o pedido ainda recebe a autorização de uma ata: da conferência no SIOP até a autorização. */
const ETAPAS_DA_AUTORIZACAO = new Set<PedidoEmenda['etapa']>(['CONFERIDO', 'SOLICITADO', 'AUTORIZADO']);

/** Linhas do pedido com item da ata que ainda não estão numa solicitação assinada. */
export function linhasDaAtaParaAutorizar(p: PedidoEmenda, ataKey: string): LinhaPedido[] {
  return linhasAtivas(p).filter((l) => itensDaLinha(l).some((x) => ataDoItem(x.itemKey) === ataKey) && !solicitacaoDaLinha(p, l)?.assinadaEm);
}

/** O pedido pode entrar numa autorização da ata: etapa entre a conferência e a autorização e linhas ainda sem solicitação assinada. */
export const pedidoEntraNaAutorizacao = (p: PedidoEmenda, ataKey: string): boolean =>
  ETAPAS_DA_AUTORIZACAO.has(p.etapa) && linhasDaAtaParaAutorizar(p, ataKey).length > 0;

/** A janela abre a partir da conferência no SIOP (nas etapas seguintes serve para refazer os quadros). */
export const podeMontarQuadros = (p: PedidoEmenda): boolean => p.etapa !== 'CANCELADO' && ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.CONFERIDO;

/** "Deputado Federal Giovani Cherini - RS", "Senadora Fulana - DF", "Bancada SP". */
export function parlamentarDoQuadro(autor: AutorEmenda | undefined): string {
  if (!autor) return 'Parlamentar a definir';
  const f = autor.sexo === 'F';
  if (autor.tipo === 'BANCADA') return autor.nome;
  const titulo = autor.tipo === 'SENADOR' ? (f ? 'Senadora' : 'Senador') : f ? 'Deputada Federal' : 'Deputado Federal';
  return `${titulo} ${autor.nome}${autor.uf ? ` - ${autor.uf}` : ''}`;
}

/** Beneficiário como no quadro do parlamentar: nome · sigla e, entre parênteses, o local de entrega. */
export function beneficiarioDoQuadro(l: Pick<LinhaPedido, 'beneficiarioId' | 'beneficiarioNome'>, beneficiarios: Map<string, BeneficiarioEmenda>): string {
  const b = l.beneficiarioId ? beneficiarios.get(l.beneficiarioId) : undefined;
  if (!b) return l.beneficiarioNome?.trim() || 'A informar';
  const local = localDoBeneficiario(b);
  return `${nomeESigla(b)}${local ? ` (${local})` : ''}`;
}

export interface LinhaDoQuadro {
  beneficiario: string;
  quantidade: number;
  total: number;
}
export interface PedidoNoItem {
  pedidoId: string;
  numero: number;
  parlamentar: string;
  emenda: string;
  linhas: LinhaDoQuadro[];
}
export interface ItemDoQuadro {
  itemKey: string;
  numeroItem: number;
  objeto: string;
  preco: number;
  pedidos: PedidoNoItem[];
  quantidade: number;
  total: number;
}
export interface QuadrosDaAutorizacao {
  itens: ItemDoQuadro[];
  total: number;
}

/** Pedidos e as linhas escolhidas de cada um → itens da ata, com os pedidos e os beneficiários (kits abertos nos itens). */
export function montarQuadros(opts: {
  ataKey: string;
  pedidos: Array<{ pedido: PedidoEmenda; linhas: LinhaPedido[] }>;
  itens: Map<string, ItemCaep>;
  autores: Map<string, AutorEmenda>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
}): QuadrosDaAutorizacao {
  const { ataKey, pedidos, itens, autores, beneficiarios } = opts;
  const porItem = new Map<string, ItemDoQuadro>();
  for (const { pedido, linhas } of pedidos) {
    for (const l of linhas) {
      for (const x of itensDaLinha(l)) {
        if (ataDoItem(x.itemKey) !== ataKey || x.quantidade <= 0) continue;
        const it = itens.get(x.itemKey);
        let item = porItem.get(x.itemKey);
        if (!item) {
          item = {
            itemKey: x.itemKey,
            numeroItem: Number(x.itemKey.split('-')[2]),
            objeto: it?.nomeCurto?.trim() || it?.descricao || x.itemKey,
            preco: it?.valorUnitario ?? 0,
            pedidos: [],
            quantidade: 0,
            total: 0
          };
          porItem.set(x.itemKey, item);
        }
        let noItem = item.pedidos.find((y) => y.pedidoId === pedido.id);
        if (!noItem) {
          noItem = {
            pedidoId: pedido.id,
            numero: pedido.numero,
            parlamentar: parlamentarDoQuadro(pedido.autorId ? autores.get(pedido.autorId) : undefined),
            emenda: pedido.siopEmenda ?? '',
            linhas: []
          };
          item.pedidos.push(noItem);
        }
        const beneficiario = beneficiarioDoQuadro(l, beneficiarios);
        const total = arredondar(x.quantidade * item.preco);
        // O mesmo beneficiário no mesmo item do mesmo pedido (ex.: avulso e kit) soma numa linha só.
        const mesma = noItem.linhas.find((y) => y.beneficiario === beneficiario);
        if (mesma) {
          mesma.quantidade += x.quantidade;
          mesma.total = arredondar(mesma.total + total);
        } else noItem.linhas.push({ beneficiario, quantidade: x.quantidade, total });
        item.quantidade += x.quantidade;
        item.total = arredondar(item.total + total);
      }
    }
  }
  const lista = [...porItem.values()].sort((a, b) => a.numeroItem - b.numeroItem);
  return { itens: lista, total: arredondar(lista.reduce((s, i) => s + i.total, 0)) };
}

const arredondar = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "Ata nº 31/2025 (31805339)": a ata sem os zeros à esquerda e o SEI da ata assinada, quando há. */
export function instrumentoDaAta(numeroAta: string, documentoSei: string | null): string {
  const [n, ano] = numeroAta.split('/');
  return `Ata nº ${Number(n)}/${ano}${documentoSei ? ` (${documentoSei})` : ''}`;
}

/** "MARCELO SILVEIRA DA COSTA (CPF 404.379.061-91)" ou "EMPRESA LTDA (CNPJ 00.000.000/0000-00)". */
export function fornecedorDaAta(nome: string | null, documento: string | null): string {
  const d = (documento ?? '').replace(/\D/g, '');
  const doc =
    d.length === 11
      ? `CPF ${d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}`
      : d.length === 14
        ? `CNPJ ${d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`
        : '';
  return `${(nome ?? '').trim()}${doc ? ` (${doc})` : ''}`.trim();
}

// Estilo do documento no SEI: bordas pretas finas, texto centralizado, cabeçalho em negrito.
const TAB = 'border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000';
const CEL = 'border:1px solid #000;padding:3px 5px;text-align:center;vertical-align:middle';
const th = (t: string, extra = '') => `<th style="${CEL};font-weight:bold"${extra}>${t}</th>`;
const td = (t: string, extra = '', estilo = '') => `<td style="${CEL}${estilo}"${extra}>${t}</td>`;

/** Quadro do item 5 ("Detalha-se as pretensões do Parlamentar"). */
export function htmlQuadroPretensoes(q: QuadrosDaAutorizacao, instrumento: string): string {
  const linhas: string[] = [];
  for (const it of q.itens) {
    const nItem = it.pedidos.reduce((s, p) => s + p.linhas.length, 0);
    let primeiraDoItem = true;
    for (const p of it.pedidos) {
      p.linhas.forEach((l, k) => {
        let tr = '<tr>';
        if (primeiraDoItem) tr += td(`<b>${esc(instrumento)}</b>`, ` rowspan="${nItem}"`) + td(String(it.numeroItem), ` rowspan="${nItem}"`) + td(esc(it.objeto), ` rowspan="${nItem}"`);
        tr += td(esc(l.beneficiario)) + td(String(l.quantidade));
        if (k === 0) tr += td(esc(p.parlamentar), ` rowspan="${p.linhas.length}"`) + td(esc(p.emenda), ` rowspan="${p.linhas.length}"`);
        if (primeiraDoItem) tr += td(brl(it.preco), ` rowspan="${nItem}"`);
        tr += td(brl(l.total)) + '</tr>';
        linhas.push(tr);
        primeiraDoItem = false;
      });
    }
  }
  const cab = ['ARP', 'ITEM', 'OBJETO', 'BENEFICIÁRIO', 'QUANT.', 'PARLAMENTAR', 'EMENDA PARLAMENTAR', 'VALOR UNT. (R$)', 'VALOR TOTAL (R$)'].map((t) => th(t)).join('');
  const total = `<tr>${td('<b>VALOR TOTAL (R$)</b>', ' colspan="8"', ';text-align:right')}${td(`<b>${brl(q.total)}</b>`)}</tr>`;
  return `<table style="${TAB}"><thead><tr>${cab}</tr></thead><tbody>${linhas.join('')}${total}</tbody></table>`;
}

export interface CabecalhoDaUnidade {
  /** "Secretaria Nacional de Segurança Pública - Senasp (Gerenciador)". */
  unidade: string;
  modalidade: string;
  certame: string;
  uasg: string;
  instrumento: string;
  fornecedor: string;
}

/** Quadro do item 6 (unidade administrativa requisitante): a caixa cinza com a tabela somada por item. */
export function htmlQuadroUnidade(q: QuadrosDaAutorizacao, c: CabecalhoDaUnidade): string {
  const linhas = q.itens
    .map((it) => `<tr>${td(String(it.numeroItem))}${td(esc(it.objeto))}${td(String(it.quantidade))}${td(brl(it.preco))}${td(`<b>${brl(it.total)}</b>`)}</tr>`)
    .join('');
  const tabela =
    `<table style="${TAB};background:#fff"><thead><tr>${th(`<b>${esc(c.instrumento)}</b> ${esc(c.fornecedor)}`, ' colspan="5"')}</tr>` +
    `<tr>${['ITEM', 'DESCRIÇÃO/ESPECIFICAÇÃO', 'QUANT.', 'VALOR UNITÁRIO (R$)', 'VALOR TOTAL (R$)'].map((t) => th(t)).join('')}</tr></thead>` +
    `<tbody>${linhas}<tr>${td('<b>VALOR TOTAL (R$)</b>', ' colspan="4"')}${td(`<b>${brl(q.total)}</b>`)}</tr></tbody></table>`;
  return (
    `<div style="background:#f2f2f2;border:1px solid #000;padding:6px 8px;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000">` +
    `<p style="text-align:center;margin:0 0 4px"><b>${esc(c.unidade)}</b></p>` +
    `<p style="margin:0"><b>Modalidade:</b> ${esc(c.modalidade)}<br><b>Identificação do Certame:</b> ${esc(c.certame)}<br><b>UASG</b>: ${esc(c.uasg)}</p>` +
    `${tabela}</div>`
  );
}

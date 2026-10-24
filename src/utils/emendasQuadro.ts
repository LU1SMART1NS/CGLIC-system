/**
 * Quadro da reserva para o parlamentar (migration 165), fora da tela para poder testar.
 *
 * Formato do Anexo que a CAEP já usa, em 6 colunas: ITEM (nome, e embaixo a ata e o item) · BENEFICIÁRIO FINAL (nome e
 * sigla, e embaixo a razão social) · LOCAL DE ENTREGA (cidade, e embaixo o endereço) · QTD · VR UNITÁRIO · VR TOTAL, uma
 * linha por item e beneficiário, kit aberto nos seus itens, fechando com TOTAL A EMPENHAR. O mesmo item para vários
 * beneficiários sai junto, com o nome e o valor unitário uma vez só (células juntadas na tabela). O valor
 * unitário é o preço previsto pelo reajuste da ata (emendas_precos_previstos), para a emenda nascer com folga; cada
 * preço que não é o de hoje ganha uma nota (¹, ², ...). Quando o pedido mistura investimento e custeio, sai o total de
 * cada GND antes do TOTAL A EMPENHAR (no SIOP cada emenda tem um só GND).
 */
import { formatarCep, localDoBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type ItemCaep, type LinhaPedido } from '../services/emendasService';
import type { GndItem, IpcaDozeMeses, PrecoPrevisto } from '../services/emendasQuadroService';
import { descricaoItemEmFrase } from './textCase';
import { dataBR, limiteDaIndicacao } from './emendasKits';
import { AVISO_SEM_OFICIO_DIAS } from './emendasPedidos';

const MARCAS = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** "do Estado de São Paulo", como no título do Anexo das bancadas. */
const ESTADO: Record<string, string> = {
  AC: 'do Estado do Acre', AL: 'do Estado de Alagoas', AP: 'do Estado do Amapá', AM: 'do Estado do Amazonas',
  BA: 'do Estado da Bahia', CE: 'do Estado do Ceará', DF: 'do Distrito Federal', ES: 'do Estado do Espírito Santo',
  GO: 'do Estado de Goiás', MA: 'do Estado do Maranhão', MT: 'do Estado de Mato Grosso', MS: 'do Estado de Mato Grosso do Sul',
  MG: 'do Estado de Minas Gerais', PA: 'do Estado do Pará', PB: 'do Estado da Paraíba', PR: 'do Estado do Paraná',
  PE: 'do Estado de Pernambuco', PI: 'do Estado do Piauí', RJ: 'do Estado do Rio de Janeiro', RN: 'do Estado do Rio Grande do Norte',
  RS: 'do Estado do Rio Grande do Sul', RO: 'do Estado de Rondônia', RR: 'do Estado de Roraima', SC: 'do Estado de Santa Catarina',
  SP: 'do Estado de São Paulo', SE: 'do Estado de Sergipe', TO: 'do Estado do Tocantins'
};

export type LinhaDoPedidoNoQuadro = Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitNome' | 'kitComposicao' | 'quantidade' | 'beneficiarioId'>;

export interface EntradaQuadro {
  autor: AutorEmenda | null | undefined;
  linhas: LinhaDoPedidoNoQuadro[];
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  precos: Map<string, PrecoPrevisto>;
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  /** IPCA dos 12 últimos meses, só para o texto da nota da folga. */
  ipca?: IpcaDozeMeses | null;
}

export interface LinhaQuadro {
  /** Número da ata e do item na ata ("00043/2026", "00005"); null quando o item não está no catálogo da CAEP. */
  ata: string | null;
  item: string | null;
  descricao: string;
  /** Kit de onde o item veio, quando veio de um. */
  kit: string | null;
  /** Nome da unidade por extenso, sigla e razão social da Receita (só quando difere do nome). */
  beneficiario: string | null;
  sigla: string | null;
  razaoSocial: string | null;
  /** Cidade - UF da entrega e, quando cadastrado, o endereço. */
  entrega: string | null;
  endereco: string | null;
  quantidade: number;
  unitario: number;
  hoje: number;
  total: number;
  totalHoje: number;
  /** Nota do preço (¹, ², ...) ou vazio quando é o preço de hoje. */
  marca: string;
  gnd: GndItem | null;
  semNomeCurto: boolean;
  /**
   * Linhas do mesmo item (mesmo kit e mesmo preço) saem juntas: a primeira traz quantas são, para juntar as células do
   * item e do valor unitário; as seguintes trazem 0.
   */
  linhasDoItem: number;
}

export interface Quadro {
  titulo: string;
  subtitulo: string;
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  /**
   * Até quando o ofício deve chegar: o que vier primeiro entre a reserva + 30 dias (depois disso o pedido entra no aviso
   * "sem ofício") e o prazo de indicação da ata que termina antes (fim da ata − corte de Ajustes; o banco recusa depois).
   */
  prazoDoOficio: { data: string; pela: 'RESERVA' | 'ATA'; ata: string | null } | null;
  linhas: LinhaQuadro[];
  notas: string[];
  total: number;
  totalHoje: number;
  /** Total por GND, só quando o pedido mistura GND-3 e GND-4 (com a linha "sem GND" quando falta informar). */
  porGnd: { gnd: GndItem | null; rotulo: string; total: number }[];
  /** Linhas cujo item ainda não tem GND informado (o total por GND não sai completo). */
  semGnd: number;
  /** Linhas sem beneficiário escolhido. */
  semBeneficiario: number;
  /** Beneficiários (distintos) sem endereço de entrega: o quadro sai só com a cidade. */
  semEndereco: number;
  /** Itens sem nome curto da CAEP (sai o começo da descrição do catálogo). */
  semNomeCurto: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** "R$ 1.234,56" com espaço comum, para colar no Word, no SEI e no WhatsApp. */
export function brl(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Rua X, 100 · Sala 2 · Centro · CEP 63500-000"; null sem logradouro (bairro sozinho não serve de endereço). */
export function enderecoDeEntrega(b: BeneficiarioEmenda): string | null {
  if (!b.entregaLogradouro?.trim()) return null;
  const rua = `${b.entregaLogradouro.trim()}${b.entregaNumero ? `, ${b.entregaNumero}` : ''}`;
  return [rua, b.entregaComplemento, b.entregaBairro, b.entregaCep && `CEP ${formatarCep(b.entregaCep)}`].filter(Boolean).join(' · ');
}

const mesmoNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0;

const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
const mesAno = (iso: string) => dataBR(iso).slice(3);

/** Nome do item no quadro: o nome curto da CAEP; sem ele, o começo da descrição do catálogo. */
export function nomeDoItem(item: ItemCaep | undefined, itemKey: string): string {
  if (!item) return itemKey;
  if (item.nomeCurto?.trim()) return item.nomeCurto.trim();
  const frase = descricaoItemEmFrase(item.descricao);
  const antesDaVirgula = frase.split(',')[0].trim();
  return (antesDaVirgula.length >= 6 ? antesDaVirgula : frase).slice(0, 80);
}

export function tituloDoAnexo(autor: AutorEmenda | null | undefined): string {
  if (!autor) return 'Anexo I – Reserva de itens (parlamentar a definir)';
  if (autor.tipo === 'BANCADA') return `Anexo I – Indicação da Bancada ${ESTADO[autor.uf ?? ''] ?? autor.uf ?? ''}`.trim();
  const casa = autor.tipo === 'SENADOR' ? 'Senado Federal' : 'Câmara dos Deputados';
  return `Anexo I – Indicação de ${autor.nome} (${casa}${autor.uf ? ` · ${autor.uf}` : ''})`;
}

/** Dias entre o quadro e o empenho provável (estimativa da CAEP): reajuste depois disso não entra no preço. */
export const PRAZO_ATE_O_EMPENHO_DIAS = 90;

const somarDias = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Preço do quadro pelo empenho provável (hoje + prazo), para a emenda não ficar abaixo do preço do dia do empenho:
 * - reajuste devido: sempre o preço reajustado;
 * - próximo reajuste até o empenho provável: o preço projetado; depois dele: o preço de hoje (FORA_DO_PRAZO);
 * - sem base para calcular: preço de hoje mais o IPCA dos últimos 12 meses (FOLGA_IPCA), porque o reajuste pode cair
 *   antes do empenho.
 */
export function aplicarPrazoDoEmpenho(
  precos: Map<string, PrecoPrevisto>,
  hoje: string,
  ipca: IpcaDozeMeses | null | undefined,
  prazoDias = PRAZO_ATE_O_EMPENHO_DIAS
): Map<string, PrecoPrevisto> {
  const limite = somarDias(hoje, prazoDias);
  const m = new Map<string, PrecoPrevisto>();
  for (const [k, p] of precos) {
    if ((p.motivo === 'PREVISTO' || p.motivo === 'SE_PRORROGAR') && p.efeito && p.efeito > limite && !p.devido) {
      m.set(k, { ...p, precoPrevisto: p.precoAtual, motivo: 'FORA_DO_PRAZO' });
    } else if (p.motivo === 'SEM_PREVISAO' && ipca) {
      m.set(k, { ...p, precoPrevisto: centavos(p.precoAtual * (1 + ipca.percentual / 100)), motivo: 'FOLGA_IPCA', percentual: ipca.percentual, efeito: null, mesesEstimados: null });
    } else m.set(k, p);
  }
  return m;
}

/** Texto da nota de um preço que não é o de hoje; null quando vale o preço de hoje. */
export function notaDoPreco(p: PrecoPrevisto | undefined, ipca?: IpcaDozeMeses | null): string | null {
  if (!p) return null;
  const focus = p.mesesEstimados ? `, ${p.mesesEstimados} ${p.mesesEstimados === 1 ? 'mês' : 'meses'} pela projeção do Focus` : '';
  const junto = p.devido ? '; inclui o reajuste já devido' : '';
  switch (p.motivo) {
    case 'DEVIDO':
      return 'Reajuste do IPCA já devido, ainda não aplicado na ata.';
    case 'PREVISTO':
      return `Reajuste previsto a partir de ${p.efeito ? mesAno(p.efeito) : 'a próxima data-base'} (IPCA de ${pct(p.percentual ?? 0)}${focus})${junto}.`;
    case 'SE_PRORROGAR':
      return `Se a ata for prorrogada em ${p.efeito ? mesAno(p.efeito) : 'seu vencimento'} (IPCA previsto de ${pct(p.percentual ?? 0)}${focus})${junto}.`;
    case 'SEM_PREVISAO':
      return 'Sem previsão de reajuste (falta base para o cálculo): considerar folga.';
    case 'FOLGA_IPCA':
      return `Ata sem data-base de reajuste informada: folga do IPCA dos últimos 12 meses (${pct(p.percentual ?? 0)}${ipca ? `, ${mesAno(ipca.de)} a ${mesAno(ipca.ate)}` : ''}).`;
    default:
      return null;
  }
}

/** Prazo do ofício do quadro (ver Quadro.prazoDoOficio). */
function prazoDoOficio(e: EntradaQuadro): Quadro['prazoDoOficio'] {
  if (!e.data) return null;
  let prazo: NonNullable<Quadro['prazoDoOficio']> = { data: somarDias(e.data, AVISO_SEM_OFICIO_DIAS), pela: 'RESERVA', ata: null };
  for (const l of e.linhas) {
    const chaves = l.tipo === 'KIT' ? (l.kitComposicao ?? []).map((c) => c.itemKey) : l.itemKey ? [l.itemKey] : [];
    for (const k of chaves) {
      const item = e.itens.get(k);
      if (!item?.vigenciaFinal) continue;
      const limite = limiteDaIndicacao(item.vigenciaFinal);
      if (limite < prazo.data) prazo = { data: limite, pela: 'ATA', ata: item.numeroAta };
    }
  }
  return prazo;
}

export function montarQuadro(e: EntradaQuadro): Quadro {
  const notas: string[] = [];
  const marcaDe = (texto: string | null): string => {
    if (!texto) return '';
    let i = notas.indexOf(texto);
    if (i < 0) {
      notas.push(texto);
      i = notas.length - 1;
    }
    return MARCAS[i] ?? `(${i + 1})`;
  };

  // Linhas por grupo (item, kit e preço), na ordem em que o item aparece pela primeira vez no pedido.
  const grupos = new Map<string, LinhaQuadro[]>();
  for (const l of e.linhas) {
    const partes =
      l.tipo === 'KIT'
        ? (l.kitComposicao ?? []).map((c) => ({ itemKey: c.itemKey, quantidade: c.quantidade * l.quantidade, kit: l.kitNome ?? 'Kit' }))
        : l.itemKey
          ? [{ itemKey: l.itemKey, quantidade: l.quantidade, kit: null }]
          : [];
    const ben = l.beneficiarioId ? e.beneficiarios.get(l.beneficiarioId) : undefined;
    for (const p of partes) {
      const item = e.itens.get(p.itemKey);
      const preco = e.precos.get(p.itemKey);
      const hoje = preco?.precoAtual ?? item?.valorUnitario ?? 0;
      const unitario = preco?.precoPrevisto ?? hoje;
      const marca = marcaDe(notaDoPreco(preco, e.ipca));
      const chave = [p.itemKey, p.kit ?? '', unitario, hoje, marca].join('|');
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push({
        ata: item?.numeroAta ?? null,
        item: item ? String(item.numeroItem).padStart(5, '0') : null,
        descricao: nomeDoItem(item, p.itemKey),
        kit: p.kit,
        beneficiario: ben ? ben.nome || ben.razaoSocial : null,
        sigla: ben?.sigla?.trim() || null,
        razaoSocial: ben?.nome && ben.razaoSocial && !mesmoNome(ben.nome, ben.razaoSocial) ? ben.razaoSocial : null,
        entrega: ben ? localDoBeneficiario(ben) : null,
        endereco: ben ? enderecoDeEntrega(ben) : null,
        quantidade: p.quantidade,
        unitario,
        hoje,
        total: centavos(p.quantidade * unitario),
        totalHoje: centavos(p.quantidade * hoje),
        marca,
        gnd: item?.gnd ?? null,
        semNomeCurto: !item?.nomeCurto?.trim(),
        linhasDoItem: 0
      });
    }
  }
  const linhas: LinhaQuadro[] = [...grupos.values()].flatMap((g) => g.map((l, i) => ({ ...l, linhasDoItem: i === 0 ? g.length : 0 })));

  const soma = (xs: LinhaQuadro[], k: 'total' | 'totalHoje') => centavos(xs.reduce((s, x) => s + x[k], 0));
  const total = soma(linhas, 'total');
  const totalHoje = soma(linhas, 'totalHoje');
  const gnds = new Set(linhas.map((l) => l.gnd).filter((g): g is GndItem => Boolean(g)));
  const semGnd = linhas.filter((l) => !l.gnd);
  const porGnd: Quadro['porGnd'] =
    gnds.size > 1
      ? [
          ...(['GND-4', 'GND-3'] as const).map((g) => ({
            gnd: g,
            rotulo: g === 'GND-4' ? 'Total GND-4 · Investimento' : 'Total GND-3 · Custeio',
            total: soma(linhas.filter((l) => l.gnd === g), 'total')
          })),
          ...(semGnd.length ? [{ gnd: null, rotulo: 'Total sem GND informado', total: soma(semGnd, 'total') }] : [])
        ]
      : [];
  const rodape = total !== totalHoje ? [`Valores com previsão de reajuste pelo IPCA, conforme a regra de cada ata. Pelo preço de hoje o total seria ${brl(totalHoje)}.`] : [];

  return {
    titulo: tituloDoAnexo(e.autor),
    subtitulo: `CAEP/SENASP · reserva de ${dataBR(e.data)}`,
    data: e.data,
    prazoDoOficio: prazoDoOficio(e),
    linhas,
    notas: [...notas.map((n, i) => `${MARCAS[i] ?? `(${i + 1})`} ${n}`), ...rodape],
    total,
    totalHoje,
    porGnd,
    semGnd: semGnd.length,
    semBeneficiario: linhas.filter((l) => !l.beneficiario).length,
    semEndereco: new Set(linhas.filter((l) => l.beneficiario && !l.endereco).map((l) => `${l.beneficiario}|${l.entrega}`)).size,
    semNomeCurto: new Set(linhas.filter((l) => l.semNomeCurto).map((l) => l.descricao)).size
  };
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const A_DEFINIR = 'a definir';
export const COLUNAS = ['ITEM', 'BENEFICIÁRIO FINAL', 'LOCAL DE ENTREGA', 'QTD', 'VR UNITÁRIO', 'VR TOTAL'];

/** "Ata 00043/2026 · item 00005", a linha de baixo da coluna ITEM. */
export const ataEItem = (l: Pick<LinhaQuadro, 'ata' | 'item'>): string | null => (l.ata ? `Ata ${l.ata} · item ${l.item}` : null);

/** "10º Batalhão de Polícia Militar · 10º BPM" em texto corrido (WhatsApp). */
const nomeComSigla = (l: Pick<LinhaQuadro, 'beneficiario' | 'sigla'>): string | null => (l.beneficiario ? (l.sigla ? `${l.beneficiario} · ${l.sigla}` : l.beneficiario) : null);

/** Tabela para colar no Word ou no editor do SEI (HTML com bordas e estilos na própria célula). */
export function htmlDaTabela(q: Quadro): string {
  const td = 'border:1px solid #000;padding:4px 6px;text-align:center;';
  const th = td + 'font-weight:bold;';
  // Valores em reais numa linha só ("R$" não fica sozinho em cima).
  const tdValor = td + 'white-space:nowrap;';
  // Linha de baixo da célula, menor (ata e item, razão social, endereço).
  const abaixo = (s: string | null) => (s ? `<br><span style="font-size:8pt">${escapar(s)}</span>` : '');
  // O item e o valor unitário só na primeira linha do grupo, ocupando as linhas dos outros beneficiários.
  const juntar = (l: LinhaQuadro) => (l.linhasDoItem > 1 ? ` rowspan="${l.linhasDoItem}"` : '');
  const linha = (l: LinhaQuadro) =>
    '<tr>' +
    (l.linhasDoItem ? `<td${juntar(l)} style="${td}"><b>${escapar(l.descricao)}</b>${abaixo(ataEItem(l))}${abaixo(l.kit && `(${l.kit})`)}</td>` : '') +
    `<td style="${td}">${l.beneficiario ? `<b>${escapar(l.beneficiario)}</b>${l.sigla ? ` · <span style="white-space:nowrap">${escapar(l.sigla)}</span>` : ''}${abaixo(l.razaoSocial)}` : A_DEFINIR}</td>` +
    `<td style="${td}">${l.entrega ? `<b>${escapar(l.entrega)}</b>` : A_DEFINIR}${abaixo(l.endereco)}</td>` +
    `<td style="${td}">${l.quantidade}</td>` +
    (l.linhasDoItem ? `<td${juntar(l)} style="${tdValor}">${brl(l.unitario)}${l.marca ? `<sup>${l.marca}</sup>` : ''}</td>` : '') +
    `<td style="${tdValor}">${brl(l.total)}</td>` +
    '</tr>';
  const subtotal = (rotulo: string, v: number) => `<tr><td colspan="${COLUNAS.length - 1}" style="${td}text-align:right"><b>${rotulo}</b></td><td style="${tdValor}"><b>${brl(v)}</b></td></tr>`;
  return (
    `<p style="text-align:center"><b>${escapar(q.titulo)}</b></p>` +
    '<table style="border-collapse:collapse;width:100%"><thead><tr>' +
    COLUNAS.map((h) => `<th style="${th}">${h}</th>`).join('') +
    '</tr></thead><tbody>' +
    q.linhas.map(linha).join('') +
    q.porGnd.map((g) => subtotal(g.rotulo, g.total)).join('') +
    `<tr><td colspan="${COLUNAS.length - 1}" style="${td}background:#d9d9d9;padding:10px 6px"><b>TOTAL A EMPENHAR</b></td><td style="${tdValor}background:#d9d9d9"><b>${brl(q.total)}</b></td></tr>` +
    '</tbody></table>' +
    (q.notas.length ? `<p style="font-size:9pt">${q.notas.map(escapar).join('<br>')}</p>` : '')
  );
}

/** Número em emoji (1️⃣, 1️⃣2️⃣): cada algarismo vira a tecla do WhatsApp. */
export const numeroEmEmoji = (n: number): string => [...String(n)].map((d) => `${d}\uFE0F\u20E3`).join('');

/**
 * Texto para o WhatsApp do parlamentar, organizado por beneficiário: número, nome, cidade e o valor do beneficiário
 * (soma dos itens) na primeira linha; os itens embaixo, com o valor de cada um só quando há mais de um. No fim, o
 * total (por GND quando mistura investimento e custeio). Fica de fora o que só serve à CAEP: título do Anexo, ata,
 * item, endereço e notas de preço.
 */
export function textoParaWhatsapp(q: Quadro): string {
  const porBeneficiario = new Map<string, LinhaQuadro[]>();
  for (const l of q.linhas) {
    const chave = l.beneficiario ? `${l.beneficiario}|${l.sigla ?? ''}|${l.entrega ?? ''}` : '';
    if (!porBeneficiario.has(chave)) porBeneficiario.set(chave, []);
    porBeneficiario.get(chave)!.push(l);
  }
  // Quem ainda não tem beneficiário vai por último.
  const grupos = [...porBeneficiario.entries()].sort(([a], [b]) => Number(a === '') - Number(b === ''));
  const blocos = grupos.map(([chave, ls], i) => {
    const l0 = ls[0];
    const total = brl(centavos(ls.reduce((s, l) => s + l.total, 0)));
    // Nome e cidade na mesma linha: vários beneficiários têm o mesmo nome (Guarda Municipal) e só a cidade separa.
    const quem = chave ? `*${nomeComSigla(l0)}* · ${l0.entrega ?? 'entrega a definir'}` : '*Beneficiário a definir*';
    const itens = ls.map((l) => `• ${l.quantidade} ${l.descricao}${l.kit ? ` (${l.kit})` : ''}${ls.length > 1 ? `: ${brl(l.total)}` : ''}`);
    return [`${numeroEmEmoji(i + 1)} ${quem}: *${total}*`, ...itens].join('\n');
  });
  const cabecalho = [`📋 *Reserva de itens · ComprasSUSP/Senasp/MJSP · ${dataBR(q.data)}*`, ...(q.prazoDoOficio ? [`⏳ *Enviar o ofício até ${dataBR(q.prazoDoOficio.data)}*`] : [])];
  return [
    ...cabecalho,
    '',
    blocos.join('\n\n'),
    '',
    ...q.porGnd.map((g) => `${g.rotulo}: ${brl(g.total)}`),
    `💰 *Total: ${brl(q.total)}*`
  ].join('\n');
}

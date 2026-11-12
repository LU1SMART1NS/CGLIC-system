/**
 * Quadro da reserva para o parlamentar (migration 165), fora da tela para poder testar.
 *
 * Formato do Anexo no modelo da CAEP (migration 243, 29/10/2026), em 6 colunas: EMENDA (o nº, uma vez só para todas as
 * linhas) · BENEFICIÁRIO (nome e sigla, e embaixo a razão social) · QUANT. · ITEM (OBJETO) (nome, e embaixo a ata e o
 * item) · VALOR UNIT. (R$) · VALOR TOTAL (R$), uma linha por item e beneficiário, kit aberto nos seus itens e somado ao
 * mesmo item avulso, fechando com TOTAL A EMPENHAR (R$). O local de entrega saiu do quadro. O mesmo item para vários
 * beneficiários sai junto, com o nome e o valor unitário uma vez só (células juntadas na tabela). O valor
 * unitário é o preço de hoje da ata, o mesmo que vai ao ofício e ao empenho, centavo a centavo (decisão de 29/10/2026,
 * migration 246: sem projeção do reajuste e sem notas de preço). Quando o pedido mistura investimento e custeio, sai o
 * total de cada GND antes do TOTAL A EMPENHAR (no SIOP cada emenda tem um só GND).
 */
import { formatarCep, localDoBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type ItemCaep, type LinhaPedido } from '../services/emendasService';
import type { GndItem, PrecoDoItem } from '../services/emendasQuadroService';
import { descricaoItemEmFrase } from './textCase';
import { dataBR, limiteDaIndicacao } from './emendasKits';
import { prazoDoOficioPelaMinuta } from './emendasReajuste';

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
  precos: Map<string, PrecoDoItem>;
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  /** Dia em que a minuta sai (hoje): o prazo do ofício conta daqui. */
  hoje: string;
  /** Prazo do ofício gravado quando a minuta foi registrada (minuta_valida_ate); vale no lugar da conta. */
  prazoGravado?: string | null;
  /** Emenda do pedido (8 dígitos e o ano): sai na coluna EMENDA e no texto do WhatsApp. */
  emenda?: { numero: string; ano: number } | null;
}

export interface LinhaQuadro {
  /** Número da ata e do item na ata ("00043/2026", "00005"); null quando o item não está no catálogo da CAEP. */
  ata: string | null;
  item: string | null;
  descricao: string;
  /** Nome da unidade por extenso, sigla e razão social da Receita (só quando difere do nome). */
  beneficiario: string | null;
  sigla: string | null;
  razaoSocial: string | null;
  /** Cidade - UF da entrega e, quando cadastrado, o endereço. */
  entrega: string | null;
  endereco: string | null;
  quantidade: number;
  unitario: number;
  total: number;
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
  /** Nº da emenda (8 dígitos) e o ano; nulo no pedido antigo ainda sem emenda. */
  emenda: { numero: string; ano: number } | null;
  subtitulo: string;
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
  /**
   * Até quando o ofício deve chegar (migration 246): o que vier primeiro entre os dias úteis de validade da minuta, o
   * reajuste da ata menos o tempo até o contrato e o prazo de indicação da ata que termina antes (fim da ata − corte de
   * Ajustes), menos 5 dias para a CAEP registrar o ofício. Com a minuta registrada, vale o prazo gravado.
   */
  prazoDoOficio: { data: string; pela: 'MINUTA' | 'REAJUSTE' | 'ATA'; ata: string | null } | null;
  linhas: LinhaQuadro[];
  total: number;
  /** Total por GND, só quando o pedido mistura GND-3 e GND-4 (com a linha "sem GND" quando falta informar). */
  porGnd: { gnd: GndItem | null; rotulo: string; total: number }[];
  /** Linhas cujo item ainda não tem GND informado (o total por GND não sai completo). */
  semGnd: number;
  /** Linhas sem beneficiário escolhido. */
  semBeneficiario: number;
  /** Itens sem o nome da ata assinada (sai o começo da descrição do catálogo). */
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

const somarDias = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Nome do item no quadro: o nome na ata assinada; sem ele, o começo da descrição do catálogo. */
export function nomeDoItem(item: ItemCaep | undefined, itemKey: string): string {
  if (!item) return itemKey;
  if (item.nomeCurto?.trim()) return item.nomeCurto.trim();
  const frase = descricaoItemEmFrase(item.descricao);
  const antesDaVirgula = frase.split(',')[0].trim();
  return (antesDaVirgula.length >= 6 ? antesDaVirgula : frase).slice(0, 80);
}

export function tituloDoAnexo(autor: AutorEmenda | null | undefined): string {
  if (!autor) return 'Tabela 1 – Reserva de itens (parlamentar a definir)';
  if (autor.tipo === 'BANCADA') return `Tabela 1 – Indicação da Bancada ${ESTADO[autor.uf ?? ''] ?? autor.uf ?? ''}`.trim();
  // Sexo das fontes (Câmara e Senado, migration 176); sem ele, "do(a) Deputado(a)".
  const senador = autor.tipo === 'SENADOR';
  const cargo =
    autor.sexo === 'F' ? `da ${senador ? 'Senadora' : 'Deputada'}` : autor.sexo === 'M' ? `do ${senador ? 'Senador' : 'Deputado'}` : `do(a) ${senador ? 'Senador(a)' : 'Deputado(a)'}`;
  return `Tabela 1 – Indicação ${cargo} ${autor.nome}${autor.uf ? ` (${autor.uf})` : ''}`;
}

/** Dias a menos no prazo da ata da mensagem: a CAEP precisa de tempo para registrar o ofício antes de o banco recusar. */
export const FOLGA_PARA_REGISTRAR_OFICIO_DIAS = 5;

const chavesDasLinhas = (linhas: LinhaDoPedidoNoQuadro[]): string[] =>
  linhas.flatMap((l) => (l.tipo === 'KIT' ? (l.kitComposicao ?? []).map((c) => c.itemKey) : l.itemKey ? [l.itemKey] : []));

/** Prazo do ofício do quadro (ver Quadro.prazoDoOficio). */
function prazoDoOficio(e: EntradaQuadro): Quadro['prazoDoOficio'] {
  if (e.prazoGravado) return { data: e.prazoGravado, pela: 'MINUTA', ata: null };
  if (!e.hoje) return null;
  const chaves = chavesDasLinhas(e.linhas);
  const pelaMinuta = prazoDoOficioPelaMinuta(e.hoje, chaves, e.precos);
  let prazo: NonNullable<Quadro['prazoDoOficio']> = { data: pelaMinuta.data, pela: pelaMinuta.pela === 'REAJUSTE' ? 'REAJUSTE' : 'MINUTA', ata: pelaMinuta.ata };
  for (const k of chaves) {
    const item = e.itens.get(k);
    if (!item?.vigenciaFinal) continue;
    const limite = somarDias(limiteDaIndicacao(item.vigenciaFinal), -FOLGA_PARA_REGISTRAR_OFICIO_DIAS);
    if (limite < prazo.data) prazo = { data: limite, pela: 'ATA', ata: item.numeroAta };
  }
  return prazo;
}

export function montarQuadro(e: EntradaQuadro): Quadro {
  // Um grupo por item (e preço), na ordem em que o item aparece pela primeira vez no pedido; dentro dele, uma linha por
  // beneficiário. O item que vem de kit soma com o mesmo item avulso: o Anexo e o empenho são por item da ata.
  const grupos = new Map<string, Map<string, LinhaQuadro>>();
  for (const l of e.linhas) {
    const partes =
      l.tipo === 'KIT'
        ? (l.kitComposicao ?? []).map((c) => ({ itemKey: c.itemKey, quantidade: c.quantidade * l.quantidade }))
        : l.itemKey
          ? [{ itemKey: l.itemKey, quantidade: l.quantidade }]
          : [];
    const ben = l.beneficiarioId ? e.beneficiarios.get(l.beneficiarioId) : undefined;
    for (const p of partes) {
      const item = e.itens.get(p.itemKey);
      const unitario = e.precos.get(p.itemKey)?.precoAtual ?? item?.valorUnitario ?? 0;
      const chave = [p.itemKey, unitario].join('|');
      if (!grupos.has(chave)) grupos.set(chave, new Map());
      const doItem = grupos.get(chave)!;
      const jaTem = doItem.get(l.beneficiarioId ?? '');
      if (jaTem) {
        jaTem.quantidade += p.quantidade;
        jaTem.total = centavos(jaTem.quantidade * unitario);
        continue;
      }
      doItem.set(l.beneficiarioId ?? '', {
        ata: item?.numeroAta ?? null,
        item: item ? String(item.numeroItem).padStart(5, '0') : null,
        descricao: nomeDoItem(item, p.itemKey),
        beneficiario: ben ? ben.nome || ben.razaoSocial : null,
        sigla: ben?.sigla?.trim() || null,
        razaoSocial: ben?.nome && ben.razaoSocial && !mesmoNome(ben.nome, ben.razaoSocial) ? ben.razaoSocial : null,
        entrega: ben ? localDoBeneficiario(ben) : null,
        endereco: ben ? enderecoDeEntrega(ben) : null,
        quantidade: p.quantidade,
        unitario,
        total: centavos(p.quantidade * unitario),
        gnd: item?.gnd ?? null,
        semNomeCurto: !item?.nomeCurto?.trim(),
        linhasDoItem: 0
      });
    }
  }
  const linhas: LinhaQuadro[] = [...grupos.values()].flatMap((g) => [...g.values()].map((l, i, todos) => ({ ...l, linhasDoItem: i === 0 ? todos.length : 0 })));

  const soma = (xs: LinhaQuadro[]) => centavos(xs.reduce((s, x) => s + x.total, 0));
  const total = soma(linhas);
  const gnds = new Set(linhas.map((l) => l.gnd).filter((g): g is GndItem => Boolean(g)));
  const semGnd = linhas.filter((l) => !l.gnd);
  const porGnd: Quadro['porGnd'] =
    gnds.size > 1
      ? [
          ...(['GND-4', 'GND-3'] as const).map((g) => ({
            gnd: g,
            rotulo: g === 'GND-4' ? 'Total GND-4 · Investimento' : 'Total GND-3 · Custeio',
            total: soma(linhas.filter((l) => l.gnd === g))
          })),
          ...(semGnd.length ? [{ gnd: null, rotulo: 'Total sem GND informado', total: soma(semGnd) }] : [])
        ]
      : [];

  return {
    titulo: tituloDoAnexo(e.autor),
    emenda: e.emenda ?? null,
    subtitulo: `CAEP/SENASP · reserva de ${dataBR(e.data)}`,
    data: e.data,
    prazoDoOficio: prazoDoOficio(e),
    linhas,
    total,
    porGnd,
    semGnd: semGnd.length,
    semBeneficiario: linhas.filter((l) => !l.beneficiario).length,
    semNomeCurto: new Set(linhas.filter((l) => l.semNomeCurto).map((l) => l.descricao)).size
  };
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const A_DEFINIR = 'a definir';
export const COLUNAS = ['EMENDA', 'BENEFICIÁRIO', 'QUANT.', 'ITEM (OBJETO)', 'VALOR UNIT. (R$)', 'VALOR TOTAL (R$)'];

/** Valor nas colunas em R$ do quadro: "5.578,90" (o "R$" está no cabeçalho). */
export const reais = (v: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Emenda do pedido para o quadro: o nº e o ano gravados; nulo sem eles. */
export const emendaDoPedidoNoQuadro = (p: { siopEmenda: string | null; siopEmendaAno: number | null } | null | undefined): { numero: string; ano: number } | null =>
  p?.siopEmenda && p.siopEmendaAno ? { numero: p.siopEmenda, ano: p.siopEmendaAno } : null;

/** Célula EMENDA: os 8 dígitos, como no SIOP; sem emenda, "a informar". */
export const emendaNoQuadro = (q: Pick<Quadro, 'emenda'>): string => q.emenda?.numero ?? 'a informar';

/** "Ata 00043/2026 · item 00005", a linha de baixo da coluna OBJETO. */
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
  // A emenda numa célula só, ocupando todas as linhas dos itens.
  const linha = (l: LinhaQuadro, i: number) =>
    '<tr>' +
    (i === 0 ? `<td rowspan="${q.linhas.length}" style="${td}"><b>${escapar(emendaNoQuadro(q))}</b></td>` : '') +
    `<td style="${td}">${l.beneficiario ? `<b>${escapar(l.beneficiario)}</b>${l.sigla ? ` · <span style="white-space:nowrap">${escapar(l.sigla)}</span>` : ''}${abaixo(l.razaoSocial)}` : A_DEFINIR}</td>` +
    `<td style="${td}">${l.quantidade}</td>` +
    (l.linhasDoItem ? `<td${juntar(l)} style="${td}"><b>${escapar(l.descricao)}</b>${abaixo(ataEItem(l))}</td>` : '') +
    (l.linhasDoItem ? `<td${juntar(l)} style="${tdValor}">${reais(l.unitario)}</td>` : '') +
    `<td style="${tdValor}">${reais(l.total)}</td>` +
    '</tr>';
  const subtotal = (rotulo: string, v: number) => `<tr><td colspan="${COLUNAS.length - 1}" style="${td}text-align:right"><b>${rotulo}</b></td><td style="${tdValor}"><b>${reais(v)}</b></td></tr>`;
  return (
    '<table style="border-collapse:collapse;width:100%"><thead><tr>' +
    COLUNAS.map((h) => `<th style="${th}">${h}</th>`).join('') +
    '</tr></thead><tbody>' +
    q.linhas.map(linha).join('') +
    q.porGnd.map((g) => subtotal(g.rotulo, g.total)).join('') +
    `<tr><td colspan="${COLUNAS.length - 1}" style="${td}background:#d9d9d9;padding:10px 6px;text-align:right"><b>TOTAL A EMPENHAR (R$)</b></td><td style="${tdValor}background:#d9d9d9"><b>${reais(q.total)}</b></td></tr>` +
    '</tbody></table>' +
    // O título vai embaixo da tabela.
    `<p style="text-align:left;font-size:9pt;margin:2px 0 0">${escapar(q.titulo)}</p>`
  );
}

/** Número em emoji (1️⃣, 1️⃣2️⃣): cada algarismo vira a tecla do WhatsApp. */
export const numeroEmEmoji = (n: number): string => [...String(n)].map((d) => `${d}\uFE0F\u20E3`).join('');

/**
 * Texto para o WhatsApp do parlamentar, organizado por beneficiário: número, nome, cidade e o valor do beneficiário
 * (soma dos itens) na primeira linha; os itens embaixo, cada um com o seu valor total. No fim, o
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
    const itens = ls.map((l) => `• ${l.quantidade} ${l.descricao}: ${brl(l.total)}`);
    return [`${numeroEmEmoji(i + 1)} ${quem}: *${total}*`, ...itens].join('\n');
  });
  const cabecalho = [
    `📋 *Reserva de itens · ComprasSUSP/Senasp/MJSP · ${dataBR(q.data)}*`,
    ...(q.emenda ? [`🏷️ *Emenda ${q.emenda.numero.slice(0, 4)} ${q.emenda.numero.slice(4)} / ${q.emenda.ano}*`] : []),
    ...(q.prazoDoOficio ? [`⏳ *Enviar o ofício até ${dataBR(q.prazoDoOficio.data)}*`] : [])];
  return [
    ...cabecalho,
    '',
    blocos.join('\n\n'),
    '',
    ...q.porGnd.map((g) => `${g.rotulo}: ${brl(g.total)}`),
    `💰 *Total: ${brl(q.total)}*`
  ].join('\n');
}

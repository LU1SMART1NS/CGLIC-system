/**
 * Quadro da reserva para o gabinete (migration 165), fora da tela para poder testar.
 *
 * Formato do Anexo que a CAEP já usa, com a ata e o item na frente: ATA · ITEM · DESCRIÇÃO ITEM · ÓRGÃO · BENEFICIÁRIO FINAL · MUNICÍPIO · QTD · VR UNITÁRIO ·
 * VR TOTAL, uma linha por item e beneficiário, kit aberto nos seus itens, fechando com TOTAL A EMPENHAR. O valor
 * unitário é o preço previsto pelo reajuste da ata (emendas_precos_previstos), para a emenda nascer com folga; cada
 * preço que não é o de hoje ganha uma nota (¹, ², ...). Quando o pedido mistura investimento e custeio, sai o total de
 * cada GND antes do TOTAL A EMPENHAR (no SIOP cada emenda tem um só GND).
 */
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, LinhaPedido } from '../services/emendasService';
import type { GndItem, PrecoPrevisto } from '../services/emendasQuadroService';
import { descricaoItemEmFrase } from './textCase';
import { dataBR } from './emendasKits';

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

export type LinhaDoPedidoNoQuadro = Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitNome' | 'kitComposicao' | 'quantidade' | 'beneficiarioId'> & {
  beneficiarioNome?: string | null;
};

export interface EntradaQuadro {
  autor: AutorEmenda | null | undefined;
  linhas: LinhaDoPedidoNoQuadro[];
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  precos: Map<string, PrecoPrevisto>;
  /** Data da reserva (AAAA-MM-DD). */
  data: string;
}

export interface LinhaQuadro {
  /** Número da ata e do item na ata ("00043/2026", "00005"); null quando o item não está no catálogo da CAEP. */
  ata: string | null;
  item: string | null;
  descricao: string;
  /** Kit de onde o item veio, quando veio de um. */
  kit: string | null;
  orgao: string | null;
  beneficiario: string | null;
  municipio: string | null;
  quantidade: number;
  unitario: number;
  hoje: number;
  total: number;
  totalHoje: number;
  /** Nota do preço (¹, ², ...) ou vazio quando é o preço de hoje. */
  marca: string;
  gnd: GndItem | null;
  semNomeCurto: boolean;
}

export interface Quadro {
  titulo: string;
  subtitulo: string;
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
  /** Linhas com beneficiário cadastrado que ainda não tem o órgão (coluna ÓRGÃO sai "a definir"). */
  semOrgao: number;
  /** Itens sem nome curto da CAEP (sai o começo da descrição do catálogo). */
  semNomeCurto: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** "R$ 1.234,56" com espaço comum, para colar no SEI e no WhatsApp. */
export function brl(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

/** Texto da nota de um preço que não é o de hoje; null quando vale o preço de hoje. */
export function notaDoPreco(p: PrecoPrevisto | undefined): string | null {
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
    default:
      return null;
  }
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

  const linhas: LinhaQuadro[] = [];
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
      linhas.push({
        ata: item?.numeroAta ?? null,
        item: item ? String(item.numeroItem).padStart(5, '0') : null,
        descricao: nomeDoItem(item, p.itemKey),
        kit: p.kit,
        orgao: ben?.orgao ?? null,
        beneficiario: ben?.razaoSocial ?? l.beneficiarioNome ?? null,
        municipio: ben ? `${ben.entregaMunicipio} - ${ben.entregaUf}` : null,
        quantidade: p.quantidade,
        unitario,
        hoje,
        total: centavos(p.quantidade * unitario),
        totalHoje: centavos(p.quantidade * hoje),
        marca: marcaDe(notaDoPreco(preco)),
        gnd: item?.gnd ?? null,
        semNomeCurto: !item?.nomeCurto?.trim()
      });
    }
  }

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
    linhas,
    notas: [...notas.map((n, i) => `${MARCAS[i] ?? `(${i + 1})`} ${n}`), ...rodape],
    total,
    totalHoje,
    porGnd,
    semGnd: semGnd.length,
    semBeneficiario: linhas.filter((l) => !l.beneficiario).length,
    semOrgao: linhas.filter((l) => l.municipio && !l.orgao).length,
    semNomeCurto: new Set(linhas.filter((l) => l.semNomeCurto).map((l) => l.descricao)).size
  };
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const A_DEFINIR = 'a definir';
export const COLUNAS = ['ATA', 'ITEM', 'DESCRIÇÃO ITEM', 'ÓRGÃO', 'BENEFICIÁRIO FINAL', 'MUNICÍPIO', 'QTD', 'VR UNITÁRIO', 'VR TOTAL'];

/** Tabela para colar no editor do SEI (HTML com bordas e estilos na própria célula). */
export function htmlParaSei(q: Quadro): string {
  const td = 'border:1px solid #000;padding:4px 6px;text-align:center;';
  const th = td + 'font-weight:bold;';
  const linha = (l: LinhaQuadro) =>
    '<tr>' +
    `<td style="${td}">${escapar(l.ata ?? '—')}</td>` +
    `<td style="${td}">${escapar(l.item ?? '—')}</td>` +
    `<td style="${td}"><b>${escapar(l.descricao)}</b>${l.kit ? `<br>(${escapar(l.kit)})` : ''}</td>` +
    `<td style="${td}">${escapar(l.orgao ?? A_DEFINIR)}</td>` +
    `<td style="${td}">${escapar(l.beneficiario ?? A_DEFINIR)}</td>` +
    `<td style="${td}">${escapar(l.municipio ?? A_DEFINIR)}</td>` +
    `<td style="${td}">${l.quantidade}</td>` +
    `<td style="${td}">${brl(l.unitario)}${l.marca ? `<sup>${l.marca}</sup>` : ''}</td>` +
    `<td style="${td}">${brl(l.total)}</td>` +
    '</tr>';
  const subtotal = (rotulo: string, v: number) => `<tr><td colspan="8" style="${td}text-align:right"><b>${rotulo}</b></td><td style="${td}"><b>${brl(v)}</b></td></tr>`;
  return (
    `<p style="text-align:center"><b>${escapar(q.titulo)}</b></p>` +
    '<table style="border-collapse:collapse;width:100%"><thead><tr>' +
    COLUNAS.map((h) => `<th style="${th}">${h}</th>`).join('') +
    '</tr></thead><tbody>' +
    q.linhas.map(linha).join('') +
    q.porGnd.map((g) => subtotal(g.rotulo, g.total)).join('') +
    `<tr><td colspan="8" style="${td}background:#d9d9d9;padding:10px 6px"><b>TOTAL A EMPENHAR</b></td><td style="${td}background:#d9d9d9"><b>${brl(q.total)}</b></td></tr>` +
    '</tbody></table>' +
    (q.notas.length ? `<p style="font-size:9pt">${q.notas.map(escapar).join('<br>')}</p>` : '')
  );
}

/** Mesmo conteúdo em texto (WhatsApp não tem tabela): *negrito* no total de cada linha e no TOTAL A EMPENHAR. */
export function textoParaWhatsapp(q: Quadro): string {
  const linhas = q.linhas.map(
    (l) =>
      `• ${l.quantidade} × ${l.descricao}${l.kit ? ` (${l.kit})` : ''}\n` +
      (l.ata ? `  Ata ${l.ata} · item ${l.item}\n` : '') +
      `  ${l.beneficiario ? `${l.beneficiario}${l.municipio ? ` — ${l.municipio}` : ''}` : 'beneficiário a definir'}\n` +
      `  ${brl(l.unitario)}${l.marca ? ` ${l.marca}` : ''} = *${brl(l.total)}*`
  );
  return [
    `*${q.titulo}*`,
    q.subtitulo,
    '',
    ...linhas,
    '',
    ...q.porGnd.map((g) => `${g.rotulo}: ${brl(g.total)}`),
    `*TOTAL A EMPENHAR: ${brl(q.total)}*`,
    ...(q.notas.length ? ['', ...q.notas] : [])
  ].join('\n');
}

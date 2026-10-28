import { resumirCelulaGti, textoDaFatia } from '../config/gruposGti';
import { descricaoItemEmFrase } from '../utils/textCase';
import { dataBR, diasEntre, rotuloItemDaAta, ROTULO_SITUACAO_KIT } from '../utils/emendasKits';
import { itemComSaldo, kitComSaldo, type LinhaItemCaep, type LinhaKitCaep } from '../utils/emendasItensSaldo';

type Celula = string | number | null;
export interface ColunaDoExcel<L> {
  id: string;
  titulo: string;
  largura: number;
  formato?: 'inteiro' | 'reais';
  valor: (l: L, hoje: string) => Celula;
}
interface Coluna {
  titulo: string;
  largura: number;
  formato?: 'inteiro' | 'reais';
}
export interface PlanilhaDeSaldo {
  nome: string;
  colunas: Coluna[];
  linhas: Celula[][];
}
/** Colunas escolhidas na janela de exportação, pelo id; sem escolha, saem todas. */
export interface EscolhaDeColunas {
  itens: string[];
  kits: string[];
}

const gnd = (g: LinhaItemCaep['gnd']) => (g === 'GND-4' ? 'GND-4 · Investimento' : g === 'GND-3' ? 'GND-3 · Custeio' : 'GND a informar');
const interesse = (l: LinhaItemCaep) => {
  const { destaque, secundaria } = resumirCelulaGti(l.fatias);
  return destaque ? [destaque, secundaria].filter((f) => f !== null).map(textoDaFatia).join(' · ') : 'Sem dados dos órgãos';
};
const porDescricao = (a: LinhaItemCaep, b: LinhaItemCaep) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR');

export const COLUNAS_ITENS: ColunaDoExcel<LinhaItemCaep>[] = [
  { id: 'ata', titulo: 'Ata', largura: 14, valor: (l) => l.numeroAta },
  { id: 'item', titulo: 'Item', largura: 8, valor: (l) => Number(l.numeroItem) },
  { id: 'descricao', titulo: 'Descrição', largura: 60, valor: (l) => descricaoItemEmFrase(l.descricao) },
  { id: 'quadro', titulo: 'Nome no quadro', largura: 40, valor: (l) => l.nomeCurto ?? '' },
  { id: 'gnd', titulo: 'GND', largura: 20, valor: (l) => gnd(l.gnd) },
  { id: 'gti', titulo: 'Interesse principal', largura: 26, valor: interesse },
  { id: 'vigencia', titulo: 'Vigência até', largura: 13, valor: (l) => (l.vigenciaFinal ? dataBR(l.vigenciaFinal) : '') },
  { id: 'dias', titulo: 'Dias para vencer', largura: 10, formato: 'inteiro', valor: (l, hoje) => (l.vigenciaFinal ? diasEntre(hoje, l.vigenciaFinal) : null) },
  { id: 'alocado', titulo: 'Alocado à CAEP', largura: 12, formato: 'inteiro', valor: (l) => l.alocado },
  { id: 'reservado', titulo: 'Reservado', largura: 12, formato: 'inteiro', valor: (l) => l.reservado },
  { id: 'pedidos', titulo: 'Pedidos', largura: 9, formato: 'inteiro', valor: (l) => l.pedidos },
  { id: 'saldo', titulo: 'Saldo', largura: 12, formato: 'inteiro', valor: (l) => l.saldo },
  { id: 'preco', titulo: 'Valor unitário previsto', largura: 16, formato: 'reais', valor: (l) => l.previsto },
  { id: 'valorSaldo', titulo: 'Valor do saldo', largura: 18, formato: 'reais', valor: (l) => Math.round(l.saldo * l.previsto * 100) / 100 }
];

const comItem = (i: NonNullable<LinhaKitCaep['calculo']['componentes'][number]['item']>) => `${rotuloItemDaAta(i)} · ${descricaoItemEmFrase(i.descricao)}`;

export const COLUNAS_KITS: ColunaDoExcel<LinhaKitCaep>[] = [
  { id: 'kit', titulo: 'Kit', largura: 32, valor: (k) => k.nome },
  { id: 'descricao', titulo: 'Descrição', largura: 40, valor: (k) => k.descricao ?? '' },
  { id: 'situacao', titulo: 'Situação', largura: 16, valor: (k) => ROTULO_SITUACAO_KIT[k.calculo.situacao] },
  { id: 'possiveis', titulo: 'Kits possíveis', largura: 10, formato: 'inteiro', valor: (k) => k.calculo.kitsPossiveis },
  { id: 'valor', titulo: 'Valor por kit', largura: 16, formato: 'reais', valor: (k) => k.calculo.valorPorKit },
  { id: 'limite', titulo: 'Item que limita', largura: 40, valor: (k) => (k.calculo.itemLimitante?.item ? comItem(k.calculo.itemLimitante.item) : '') },
  {
    id: 'composicao',
    titulo: 'Composição (quantidade por kit)',
    largura: 80,
    valor: (k) => k.calculo.componentes.map((c) => `${c.quantidade} × ${c.item ? comItem(c.item) : `${c.itemKey} (sem alocação da CAEP)`}`).join('; ')
  }
];

function planilha<L>(nome: string, colunas: ColunaDoExcel<L>[], ids: string[] | undefined, linhas: L[], hoje: string): PlanilhaDeSaldo | null {
  const escolhidas = ids ? colunas.filter((c) => ids.includes(c.id)) : colunas;
  if (escolhidas.length === 0) return null;
  return {
    nome,
    colunas: escolhidas.map(({ titulo, largura, formato }) => ({ titulo, largura, formato })),
    linhas: linhas.map((l) => escolhidas.map((c) => c.valor(l, hoje)))
  };
}

/** Itens e kits que entram no Excel, na ordem da tela. */
export function comSaldo(itens: LinhaItemCaep[], kits: LinhaKitCaep[]): { itens: LinhaItemCaep[]; kits: LinhaKitCaep[] } {
  return {
    itens: itens.filter(itemComSaldo).sort(porDescricao),
    kits: kits.filter(kitComSaldo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  };
}

/**
 * As abas do Excel de Emendas › Itens: itens com saldo (o trilho "Com saldo" de Por item) e kits com saldo (ativos e que
 * ainda cabem ao menos uma vez), só com as colunas escolhidas. Aba sem nenhuma coluna escolhida fica de fora.
 */
export function planilhasDeSaldo(itens: LinhaItemCaep[], kits: LinhaKitCaep[], hoje: string, escolha?: EscolhaDeColunas): PlanilhaDeSaldo[] {
  const linhas = comSaldo(itens, kits);
  return [planilha('Itens com saldo', COLUNAS_ITENS, escolha?.itens, linhas.itens, hoje), planilha('Kits com saldo', COLUNAS_KITS, escolha?.kits, linhas.kits, hoje)].filter(
    (p): p is PlanilhaDeSaldo => p !== null
  );
}

/** Monta o .xlsx (o exceljs só carrega no clique, fora do pacote da tela). */
export async function gerarExcelDeSaldo(planilhas: PlanilhaDeSaldo[], hoje: string): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CGLIC';
  wb.created = new Date();
  for (const p of planilhas) {
    const ws = wb.addWorksheet(p.nome, { views: [{ state: 'frozen', ySplit: 2 }] });
    ws.columns = p.colunas.map((c) => ({ width: c.largura }));
    ws.mergeCells(1, 1, 1, p.colunas.length);
    const titulo = ws.getCell(1, 1);
    titulo.value = `Emendas › Itens · ${p.nome} em ${dataBR(hoje)}`;
    titulo.font = { bold: true, size: 12, color: { argb: 'FF0C326F' } };
    const cab = ws.getRow(2);
    cab.values = p.colunas.map((c) => c.titulo);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.alignment = { vertical: 'middle', wrapText: true };
    cab.height = 30;
    cab.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C326F' } };
    });
    if (p.linhas.length === 0) ws.getCell(3, 1).value = p.nome === 'Kits com saldo' ? 'Nenhum kit com saldo.' : 'Nenhum item com saldo.';
    for (const linha of p.linhas) ws.addRow(linha);
    p.colunas.forEach((c, i) => {
      if (!c.formato) return;
      ws.getColumn(i + 1).numFmt = c.formato === 'reais' ? '"R$" #,##0.00' : '#,##0';
    });
    if (p.linhas.length > 0) ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: p.colunas.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Baixa o arquivo no navegador (sem importar o serviço de relatórios, que carrega o exceljs junto). */
export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

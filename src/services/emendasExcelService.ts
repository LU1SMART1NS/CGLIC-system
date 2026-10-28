import { resumirCelulaGti, textoDaFatia } from '../config/gruposGti';
import { descricaoItemEmFrase } from '../utils/textCase';
import { dataBR, diasEntre, rotuloItemDaAta, ROTULO_SITUACAO_KIT } from '../utils/emendasKits';
import { itemComSaldo, kitComSaldo, type LinhaItemCaep, type LinhaKitCaep } from '../utils/emendasItensSaldo';

type Celula = string | number | null;
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

const ITENS: Coluna[] = [
  { titulo: 'Ata', largura: 14 },
  { titulo: 'Item', largura: 8 },
  { titulo: 'Descrição', largura: 60 },
  { titulo: 'Nome no quadro', largura: 40 },
  { titulo: 'GND', largura: 20 },
  { titulo: 'Interesse principal', largura: 26 },
  { titulo: 'Vigência até', largura: 13 },
  { titulo: 'Dias para vencer', largura: 10, formato: 'inteiro' },
  { titulo: 'Alocado à CAEP', largura: 12, formato: 'inteiro' },
  { titulo: 'Reservado', largura: 12, formato: 'inteiro' },
  { titulo: 'Pedidos', largura: 9, formato: 'inteiro' },
  { titulo: 'Saldo', largura: 12, formato: 'inteiro' },
  { titulo: 'Valor unitário previsto', largura: 16, formato: 'reais' },
  { titulo: 'Valor do saldo', largura: 18, formato: 'reais' }
];

const KITS: Coluna[] = [
  { titulo: 'Kit', largura: 32 },
  { titulo: 'Descrição', largura: 40 },
  { titulo: 'Situação', largura: 16 },
  { titulo: 'Kits possíveis', largura: 10, formato: 'inteiro' },
  { titulo: 'Valor por kit', largura: 16, formato: 'reais' },
  { titulo: 'Item que limita', largura: 40 },
  { titulo: 'Composição (quantidade por kit)', largura: 80 }
];

const gnd = (g: LinhaItemCaep['gnd']) => (g === 'GND-4' ? 'GND-4 · Investimento' : g === 'GND-3' ? 'GND-3 · Custeio' : 'GND a informar');
const interesse = (l: LinhaItemCaep) => {
  const { destaque, secundaria } = resumirCelulaGti(l.fatias);
  return destaque ? [destaque, secundaria].filter((f) => f !== null).map(textoDaFatia).join(' · ') : 'Sem dados dos órgãos';
};
const porDescricao = (a: LinhaItemCaep, b: LinhaItemCaep) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR');

/**
 * As duas abas do Excel de Emendas › Itens: itens com saldo (o trilho "Com saldo" de Por item) e kits com saldo (ativos e
 * que ainda cabem ao menos uma vez). As mesmas contas da tela, já com o preço previsto para a emenda.
 */
export function planilhasDeSaldo(itens: LinhaItemCaep[], kits: LinhaKitCaep[], hoje: string): PlanilhaDeSaldo[] {
  const linhasItens = itens
    .filter(itemComSaldo)
    .sort(porDescricao)
    .map((l): Celula[] => [
      l.numeroAta,
      Number(l.numeroItem),
      descricaoItemEmFrase(l.descricao),
      l.nomeCurto ?? '',
      gnd(l.gnd),
      interesse(l),
      l.vigenciaFinal ? dataBR(l.vigenciaFinal) : '',
      l.vigenciaFinal ? diasEntre(hoje, l.vigenciaFinal) : null,
      l.alocado,
      l.reservado,
      l.pedidos,
      l.saldo,
      l.previsto,
      Math.round(l.saldo * l.previsto * 100) / 100
    ]);
  const linhasKits = kits
    .filter(kitComSaldo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((k): Celula[] => {
      const limite = k.calculo.itemLimitante?.item;
      return [
        k.nome,
        k.descricao ?? '',
        ROTULO_SITUACAO_KIT[k.calculo.situacao],
        k.calculo.kitsPossiveis,
        k.calculo.valorPorKit,
        limite ? `${rotuloItemDaAta(limite)} · ${descricaoItemEmFrase(limite.descricao)}` : '',
        k.calculo.componentes
          .map((c) => `${c.quantidade} × ${c.item ? `${rotuloItemDaAta(c.item)} · ${descricaoItemEmFrase(c.item.descricao)}` : `${c.itemKey} (sem alocação da CAEP)`}`)
          .join('; ')
      ];
    });
  return [
    { nome: 'Itens com saldo', colunas: ITENS, linhas: linhasItens },
    { nome: 'Kits com saldo', colunas: KITS, linhas: linhasKits }
  ];
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

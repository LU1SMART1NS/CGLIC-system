/**
 * Excel simples das telas (Carteira › Itens, Emendas › Itens): uma lista de colunas com id e valor, a pessoa escolhe
 * quais saem, e cada aba tem título, cabeçalho azul gov.br, filtro e números formatados. O exceljs só carrega no clique.
 */
export type Celula = string | number | null;

export interface ColunaDoExcel<L, C = void> {
  id: string;
  titulo: string;
  largura: number;
  formato?: 'inteiro' | 'reais' | 'percentual';
  valor: (linha: L, ctx: C) => Celula;
}

export interface PlanilhaSimples {
  nome: string;
  /** Primeira linha da aba (ex.: "Carteira de Itens em 28/10/2026"). */
  titulo: string;
  /** Texto da aba sem linhas. */
  vazio: string;
  colunas: Array<Pick<ColunaDoExcel<unknown>, 'titulo' | 'largura' | 'formato'>>;
  linhas: Celula[][];
}

/** Aba com as colunas escolhidas (na ordem da lista, não na do clique); sem nenhuma coluna, nula (a aba fica de fora). */
export function montarPlanilha<L, C>(
  aba: Pick<PlanilhaSimples, 'nome' | 'titulo' | 'vazio'>,
  colunas: ReadonlyArray<ColunaDoExcel<L, C>>,
  ids: readonly string[] | undefined,
  linhas: readonly L[],
  ctx: C
): PlanilhaSimples | null {
  const escolhidas = ids ? colunas.filter((c) => ids.includes(c.id)) : [...colunas];
  if (escolhidas.length === 0) return null;
  return {
    ...aba,
    colunas: escolhidas.map(({ titulo, largura, formato }) => ({ titulo, largura, formato })),
    linhas: linhas.map((l) => escolhidas.map((c) => c.valor(l, ctx)))
  };
}

const FORMATO = { inteiro: '#,##0', reais: '"R$" #,##0.00', percentual: '0.0"%"' } as const;

export async function gerarExcel(planilhas: PlanilhaSimples[]): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CGLIC';
  wb.created = new Date();
  for (const p of planilhas) {
    const ws = wb.addWorksheet(p.nome, { views: [{ state: 'frozen', ySplit: 2 }] });
    ws.columns = p.colunas.map((c) => ({ width: c.largura }));
    ws.mergeCells(1, 1, 1, p.colunas.length);
    const titulo = ws.getCell(1, 1);
    titulo.value = p.titulo;
    titulo.font = { bold: true, size: 12, color: { argb: 'FF0C326F' } };
    const cab = ws.getRow(2);
    cab.values = p.colunas.map((c) => c.titulo);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.alignment = { vertical: 'middle', wrapText: true };
    cab.height = 30;
    cab.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C326F' } };
    });
    if (p.linhas.length === 0) ws.getCell(3, 1).value = p.vazio;
    for (const linha of p.linhas) ws.addRow(linha);
    p.colunas.forEach((c, i) => {
      if (c.formato) ws.getColumn(i + 1).numFmt = FORMATO[c.formato];
    });
    if (p.linhas.length > 0) ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: p.colunas.length } };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Baixa o arquivo no navegador. */
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

// A última escolha de colunas fica no navegador de quem exporta (só conveniência: sem ela, a escolha padrão).
export function lerColunasGuardadas<K extends string>(chave: string, padrao: Record<K, string[]>): Record<K, string[]> {
  try {
    const salva = JSON.parse(localStorage.getItem(chave) ?? 'null') as Partial<Record<K, unknown>> | null;
    if (!salva) return padrao;
    const lida = {} as Record<K, string[]>;
    for (const k of Object.keys(padrao) as K[]) {
      const ids = salva[k];
      if (!Array.isArray(ids)) return padrao;
      lida[k] = ids.filter((id): id is string => typeof id === 'string');
    }
    return lida;
  } catch {
    return padrao;
  }
}

export function guardarColunas(chave: string, escolha: Record<string, string[]>): void {
  try {
    localStorage.setItem(chave, JSON.stringify(escolha));
  } catch {
    // Sem armazenamento (janela anônima): a escolha vale só agora.
  }
}

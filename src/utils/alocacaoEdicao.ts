import type { InternalAllocation } from '../types';
import type { AllocationExecution } from './allocationExecution';

/**
 * Edição das alocações internas de um item na janela "Alocação do item" (fila Itens às unidades e Item 360).
 * Tudo é editado em memória e gravado de uma vez; as regras ficam aqui para valerem nas duas telas:
 * - a soma não passa do quantitativo SENASP;
 * - a unidade não fica com menos do que já empenhou;
 * - a unidade com empenho vinculado não pode ser removida (antes é preciso desvincular os empenhos).
 */
export interface LinhaAlocacao {
  id: string;
  unitName: string;
  /** Quantidade gravada (0 nas unidades adicionadas nesta edição). */
  original: number;
  /** Quantidade digitada; vazio enquanto o campo está em branco. */
  qtd: number | '';
  empenhado: number;
  /** Empenhos do item vinculados à unidade (confirmados ou não). */
  vinculados: number;
  removida: boolean;
  adicionada: boolean;
}

export interface AvaliacaoLinha {
  alterada: boolean;
  /** Mínimo que a unidade aceita: o empenhado (e pelo menos 1). */
  minimo: number;
  abaixoDoMinimo: boolean;
  podeRemover: boolean;
}

export interface AvaliacaoEdicao {
  totalAlocado: number;
  aAlocar: number;
  porLinha: Map<string, AvaliacaoLinha>;
  erros: string[];
  /** Mudanças em texto curto, para o resumo do rodapé (ex.: "CAEP 20.000 → 50.000", "+ DPSP 10.000", "− CGPE"). */
  mudancas: string[];
  podeSalvar: boolean;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const num = (q: number | '') => (q === '' ? 0 : Number(q) || 0);
export const normUnidade = (s: string) => s.trim().toLowerCase();

export function linhasIniciais(alocacoes: InternalAllocation[], execucao: Map<string, AllocationExecution>): LinhaAlocacao[] {
  return alocacoes.map((a) => {
    const exec = execucao.get(a.id);
    return {
      id: a.id,
      unitName: a.unitName,
      original: a.allocatedQty,
      qtd: a.allocatedQty,
      empenhado: exec?.empenhado ?? 0,
      vinculados: exec?.vinculados ?? 0,
      removida: false,
      adicionada: false
    };
  });
}

export function avaliarEdicao(linhas: LinhaAlocacao[], quantitativoSenasp: number): AvaliacaoEdicao {
  const ativas = linhas.filter((l) => !l.removida);
  const totalAlocado = ativas.reduce((s, l) => s + num(l.qtd), 0);
  const porLinha = new Map<string, AvaliacaoLinha>();
  const mudancas: string[] = [];
  let algumaAbaixo = false;

  for (const l of linhas) {
    const minimo = Math.max(1, l.empenhado);
    const abaixoDoMinimo = !l.removida && num(l.qtd) < minimo;
    if (abaixoDoMinimo) algumaAbaixo = true;
    const alterada = !l.adicionada && !l.removida && num(l.qtd) !== l.original;
    porLinha.set(l.id, { alterada, minimo, abaixoDoMinimo, podeRemover: l.vinculados === 0 });
    if (l.adicionada && !l.removida) mudancas.push(`+ ${l.unitName} ${fmt(num(l.qtd))}`);
    else if (l.removida && !l.adicionada) mudancas.push(`− ${l.unitName}`);
    else if (alterada) mudancas.push(`${l.unitName} ${fmt(l.original)} → ${fmt(num(l.qtd))}`);
  }

  const erros: string[] = [];
  if (totalAlocado > quantitativoSenasp) {
    erros.push(`A soma das alocações (${fmt(totalAlocado)}) passa do quantitativo SENASP (${fmt(quantitativoSenasp)}) em ${fmt(totalAlocado - quantitativoSenasp)}. Reduza alguma unidade.`);
  }
  if (algumaAbaixo) erros.push('Há unidade abaixo do mínimo: a quantidade deve ser maior que zero e não pode ficar abaixo do que a unidade já empenhou.');
  if (linhas.some((l) => l.removida && l.vinculados > 0)) erros.push('Unidade com empenho vinculado não pode ser removida. Desvincule os empenhos antes.');

  return {
    totalAlocado,
    aAlocar: quantitativoSenasp - totalAlocado,
    porLinha,
    erros,
    mudancas,
    podeSalvar: mudancas.length > 0 && erros.length === 0
  };
}

/** Lista completa a gravar (save_allocations_atomic recebe todas as alocações do item). */
export function listaParaGravar(linhas: LinhaAlocacao[], gravadas: InternalAllocation[]): InternalAllocation[] {
  const porId = new Map(gravadas.map((a) => [a.id, a]));
  return linhas
    .filter((l) => !l.removida)
    .map((l) => {
      const antes = porId.get(l.id);
      return antes ? { ...antes, allocatedQty: num(l.qtd) } : { id: l.id, unitName: l.unitName.trim(), allocatedQty: num(l.qtd), empenhadaQty: 0 };
    });
}

/** Vínculos empenho → unidade sem as unidades removidas; nulo quando nada muda. */
export function vinculosSemRemovidas(links: Record<string, string>, linhas: LinhaAlocacao[]): Record<string, string> | null {
  const removidas = new Set(linhas.filter((l) => l.removida && !l.adicionada).map((l) => l.id));
  if (removidas.size === 0) return null;
  const restantes = Object.fromEntries(Object.entries(links).filter(([, id]) => !removidas.has(id)));
  return Object.keys(restantes).length === Object.keys(links).length ? null : restantes;
}

import type { ContratadoDaUnidade, FonteItensContrato, QuantidadeDoContrato } from '../services/contratadoUnidadeService';

/**
 * Regras das telas do contratado por unidade interna (migration 103, protótipo aprovado em 09/10/2026):
 * - texto embaixo da quantidade contratada, com o nome do site onde o número está;
 * - conferência da janela "Ajustar quantidade contratada";
 * - conferência da janela "Unidades do contrato no item";
 * - unidade que a nota herda do contrato.
 * As mesmas travas existem no banco; aqui elas avisam antes de gravar.
 */

export const JUSTIFICATIVA_MIN = 15;
export const JUSTIFICATIVA_MAX = 500;

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Nome do site onde a quantidade está. Sem itens na leitura, aponta para onde os itens são cadastrados. */
export function nomeDaFonte(fonte: FonteItensContrato): string {
  return fonte === 'COMPRAS_GOV' ? 'Compras.gov.br' : 'Contratos.gov.br';
}

export interface LegendaDaQuantidade {
  /** Linha embaixo do número: "do Contratos.gov.br", "No Contratos.gov.br: 480", "No Compras.gov.br: sem o item". */
  linha: string;
  /** A fonte mudou depois do ajuste: "Mudou de 470 para 480. Confira." */
  aviso: string | null;
}

type ParaLegenda = Pick<QuantidadeDoContrato, 'ajustada' | 'quantidadeFonte' | 'fonte' | 'fonteMudouAposAjuste' | 'ajusteQuantidadeFonte'>;

export function legendaDaQuantidade(q: ParaLegenda): LegendaDaQuantidade {
  const nome = nomeDaFonte(q.fonte);
  if (!q.ajustada) {
    return { linha: q.quantidadeFonte != null ? `do ${nome}` : `No ${nome}: sem o item`, aviso: null };
  }
  const linha = `No ${nome}: ${q.quantidadeFonte != null ? fmt(q.quantidadeFonte) : 'sem o item'}`;
  if (!q.fonteMudouAposAjuste) return { linha, aviso: null };
  const antes = q.ajusteQuantidadeFonte;
  const agora = q.quantidadeFonte;
  let aviso: string;
  if (antes == null && agora != null) aviso = `Passou a informar ${fmt(agora)}. Confira.`;
  else if (antes != null && agora == null) aviso = `Deixou de informar o item (era ${fmt(antes)}). Confira.`;
  else aviso = `Mudou de ${fmt(antes ?? 0)} para ${fmt(agora ?? 0)}. Confira.`;
  return { linha, aviso };
}

/** Texto do campo de número: inteiro ≥ 0, ou nulo quando vazio ou inválido. */
export function lerInteiro(texto: string): { valor: number | null; valido: boolean } {
  const t = texto.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return { valor: null, valido: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return { valor: null, valido: false };
  return { valor: n, valido: true };
}

export interface AvaliacaoAjuste {
  quantidade: number | null;
  erroQuantidade: string | null;
  erroJustificativa: string | null;
  /** Avisos amarelos: não impedem gravar. */
  avisos: string[];
  /** A quantidade digitada é igual à da fonte (melhor desfazer o ajuste). */
  igualAFonte: boolean;
  podeSalvar: boolean;
  podeDesfazer: boolean;
}

export function avaliarAjuste(p: {
  texto: string;
  justificativa: string;
  /** Quantidade ajustada hoje (nula sem ajuste). */
  ajustadaAtual: number | null;
  quantidadeFonte: number | null;
  /** Quantidade deste contrato já dividida entre as unidades. */
  dividido: number;
  /** Contratado no item pelos outros contratos. */
  consumoOutros: number;
  /** Quantitativo SENASP do item. */
  cota: number;
}): AvaliacaoAjuste {
  const { valor, valido } = lerInteiro(p.texto);
  const just = p.justificativa.trim();
  const erroQuantidade = valido ? null : 'Informe um número inteiro, zero ou maior.';
  const erroJustificativa =
    just.length < JUSTIFICATIVA_MIN
      ? `A justificativa é obrigatória: escreva ao menos ${JUSTIFICATIVA_MIN} caracteres.`
      : just.length > JUSTIFICATIVA_MAX
        ? `A justificativa tem no máximo ${JUSTIFICATIVA_MAX} caracteres.`
        : null;
  const avisos: string[] = [];
  const igualAFonte = valido && p.quantidadeFonte != null && valor === p.quantidadeFonte;
  if (valido && valor != null) {
    const consumo = p.consumoOutros + valor;
    if (consumo > p.cota) {
      avisos.push(`O consumo do item vai a ${fmt(consumo)}, acima do quantitativo SENASP (${fmt(p.cota)}). Pode salvar; o item passa a mostrar alerta de saldo.`);
    }
    if (valor < p.dividido) {
      avisos.push(`Já há ${fmt(p.dividido)} deste contrato divididos entre as unidades. A divisão fica para conferir e ${fmt(p.dividido - valor)} ficam acima do contrato.`);
    }
  }
  const mudou = valido && valor !== p.ajustadaAtual;
  return {
    quantidade: valido ? valor : null,
    erroQuantidade,
    erroJustificativa,
    avisos,
    igualAFonte,
    podeSalvar: valido && mudou && erroJustificativa === null,
    podeDesfazer: p.ajustadaAtual != null && erroJustificativa === null
  };
}

/** Uma unidade na janela "Unidades do contrato no item". */
export interface LinhaDivisao {
  unidade: string;
  /** Alocado da unidade no item. */
  alocado: number;
  /** Contratado da unidade no item pelos OUTROS contratos. */
  contratadoOutros: number;
  /** Quantidade gravada deste contrato para a unidade (0 quando não tem). */
  original: number;
  /** Texto digitado. */
  texto: string;
}

export interface AvaliacaoLinhaDivisao {
  quantidade: number;
  /** Alocado − contratado nos outros contratos. */
  livre: number;
  invalida: boolean;
  naoCabe: boolean;
  alterada: boolean;
}

export interface AvaliacaoDivisao {
  porLinha: Map<string, AvaliacaoLinhaDivisao>;
  soma: number;
  semUnidade: number;
  erros: string[];
  avisos: string[];
  /** "DFNSP 50", "DGFNSP 150 → 100", "− CGLIC". */
  mudancas: string[];
  podeSalvar: boolean;
}

export function avaliarDivisao(linhas: LinhaDivisao[], quantidadeContrato: number): AvaliacaoDivisao {
  const porLinha = new Map<string, AvaliacaoLinhaDivisao>();
  const erros: string[] = [];
  const mudancas: string[] = [];
  let soma = 0;
  for (const l of linhas) {
    const vazio = l.texto.trim() === '';
    const { valor, valido } = vazio ? { valor: 0, valido: true } : lerInteiro(l.texto);
    const quantidade = valido ? (valor ?? 0) : 0;
    const livre = l.alocado - l.contratadoOutros;
    const naoCabe = valido && quantidade > 0 && quantidade > livre;
    const alterada = valido && quantidade !== l.original;
    porLinha.set(l.unidade, { quantidade, livre, invalida: !valido, naoCabe, alterada });
    soma += quantidade;
    if (!valido) erros.push(`A quantidade de ${l.unidade} deve ser um número inteiro.`);
    if (naoCabe) {
      erros.push(`${l.unidade} não tem alocação livre para ${fmt(quantidade)}: cabem no máximo ${fmt(Math.max(livre, 0))}. Aumente a alocação da unidade ou reduza a quantidade.`);
    }
    if (alterada) {
      if (l.original === 0) mudancas.push(`${l.unidade} ${fmt(quantidade)}`);
      else if (quantidade === 0) mudancas.push(`− ${l.unidade}`);
      else mudancas.push(`${l.unidade} ${fmt(l.original)} → ${fmt(quantidade)}`);
    }
  }
  if (soma > quantidadeContrato) {
    erros.push(`A soma das unidades (${fmt(soma)}) passa do contratado no item (${fmt(quantidadeContrato)}).`);
  }
  const avisos: string[] = [];
  const semUnidade = Math.max(quantidadeContrato - soma, 0);
  if (soma > 0 && semUnidade > 0 && erros.length === 0) {
    avisos.push(`${fmt(semUnidade)} ficam sem unidade. Pode salvar assim; o item continua mostrando "contratado sem unidade" até completar.`);
  }
  return {
    porLinha,
    soma,
    semUnidade,
    erros,
    avisos,
    mudancas,
    podeSalvar: erros.length === 0 && soma > 0 && mudancas.length > 0
  };
}

/** Unidades (ainda alocadas) que receberam parte do contrato neste item. */
export function unidadesDoContrato(q: Pick<QuantidadeDoContrato, 'unidades'> | undefined): string[] {
  return (q?.unidades ?? []).filter((u) => u.alocada && u.quantidade > 0).map((u) => u.unidade);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Unidades de cada contrato, em ids de alocação: a nota de um contrato com uma unidade só herda essa unidade; com
 * várias, o gestor escolhe entre elas. Contrato sem divisão fica de fora (a nota escolhe entre todas as unidades).
 */
export function alocacoesPorContrato(
  contratos: Array<Pick<QuantidadeDoContrato, 'contractKey' | 'unidades'>>,
  allocations: Array<{ id: string; unitName: string }>
): Map<string, string[]> {
  const idPorNome = new Map(allocations.map((a) => [norm(a.unitName), a.id]));
  const mapa = new Map<string, string[]>();
  for (const c of contratos) {
    const ids = unidadesDoContrato(c).map((u) => idPorNome.get(norm(u))).filter((id): id is string => Boolean(id));
    if (ids.length > 0) mapa.set(c.contractKey, ids);
  }
  return mapa;
}

/** Contratado de cada unidade (pelo nome normalizado). */
export function contratadoPorNomeDaUnidade(unidades: Array<{ unitName: string; quantidadeContratada: number }>): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const u of unidades) mapa.set(norm(u.unitName), (mapa.get(norm(u.unitName)) ?? 0) + u.quantidadeContratada);
  return mapa;
}

/** Linhas da janela: as unidades alocadas no item e, se houver, as da divisão que perderam a alocação. */
export function linhasDaDivisao(contrato: QuantidadeDoContrato, allocations: Array<{ unitName: string; allocatedQty: number }>, unidades: ContratadoDaUnidade[]): LinhaDivisao[] {
  const desteContrato = new Map(contrato.unidades.map((u) => [norm(u.unidade), u.quantidade]));
  const contratadoTotal = new Map(unidades.map((u) => [norm(u.unitName), u.quantidadeContratada]));
  const linhas: LinhaDivisao[] = allocations.map((a) => {
    const original = desteContrato.get(norm(a.unitName)) ?? 0;
    return {
      unidade: a.unitName,
      alocado: a.allocatedQty,
      contratadoOutros: (contratadoTotal.get(norm(a.unitName)) ?? 0) - original,
      original,
      texto: original > 0 ? String(original) : ''
    };
  });
  for (const u of contrato.unidades) {
    if (!linhas.some((l) => norm(l.unidade) === norm(u.unidade))) {
      linhas.push({ unidade: u.unidade, alocado: 0, contratadoOutros: 0, original: u.quantidade, texto: String(u.quantidade) });
    }
  }
  return linhas;
}

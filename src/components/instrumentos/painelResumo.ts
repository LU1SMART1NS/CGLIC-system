import type { PrazoFaixa } from '../carteira/carteiraPrazo';
import type { DashboardAttentionItem } from '../../types/managementDashboard';
import { chaveGestaoAta, chaveGestaoDaChave } from '../../utils/ataIdentidade';
import type { EscopoDoGestor, GestorDaCarteira } from '../../utils/escopoDoGestor';
import { getInstrumentoInfo } from './gestaoInstrumentosRowHelpers';

/** Instrumento já classificado pela faixa de prazo das carteiras (classifyPrazo). */
export interface InstrumentoNoPainel {
  /** Chave de gestão da ata ou chave do contrato (as mesmas de ata_managers e contract_managers). */
  chave: string;
  /** UASG da carteira da CGLIC. */
  uasg: string;
  faixa: PrazoFaixa;
}

export interface FaixasDePrazo {
  regular: number;
  atencao: number;
  critico: number;
  /** Regular + atenção + crítico: o segmento "Vigentes" das carteiras. */
  vigentes: number;
}

/** Mesmas contas do trilho das carteiras: vigente é quem não está encerrado nem sem data. */
export function contarFaixas(instrumentos: Pick<InstrumentoNoPainel, 'faixa'>[]): FaixasDePrazo {
  const r: FaixasDePrazo = { regular: 0, atencao: 0, critico: 0, vigentes: 0 };
  for (const { faixa } of instrumentos) {
    if (faixa === 'REGULAR') r.regular++;
    else if (faixa === 'ATENCAO') r.atencao++;
    else if (faixa === 'CRITICO') r.critico++;
    else continue;
    r.vigentes++;
  }
  return r;
}

/** Pendência crítica atribuída ao instrumento a que pertence (saldo de item conta para a ata). */
export interface CriticaDoInstrumento {
  tipo: 'ATA' | 'CONTRATO';
  chave: string;
}

export function criticasPorInstrumento(itens: DashboardAttentionItem[]): CriticaDoInstrumento[] {
  const r: CriticaDoInstrumento[] = [];
  for (const item of itens) {
    if (item.severity !== 'CRITICA') continue;
    const tipo = getInstrumentoInfo(item).tipo;
    if (tipo === 'ARP') {
      const chave = item.arpKey ? chaveGestaoDaChave(item.arpKey) : chaveGestaoAta(item.numeroAta || '');
      if (chave) r.push({ tipo: 'ATA', chave });
    } else if (tipo === 'Contrato' && item.contractKey) {
      r.push({ tipo: 'CONTRATO', chave: item.contractKey });
    }
  }
  return r;
}

export interface ResumoDoLado {
  /** Vigentes. */
  total: number;
  /** Vigentes que terminam em até 90 dias (atenção + crítico). */
  vencem90: number;
  criticas: number;
}

export interface ResumoDoGestor {
  /** Ausente na linha "Sem gestor". */
  gestor?: GestorDaCarteira;
  atas: ResumoDoLado;
  contratos: ResumoDoLado;
}

function resumirLado(instrumentos: InstrumentoNoPainel[], criticas: CriticaDoInstrumento[], tipo: CriticaDoInstrumento['tipo'], dentro: (chave: string) => boolean): ResumoDoLado {
  const r: ResumoDoLado = { total: 0, vencem90: 0, criticas: 0 };
  for (const i of instrumentos) {
    if (!dentro(i.chave)) continue;
    const f = i.faixa;
    if (f !== 'REGULAR' && f !== 'ATENCAO' && f !== 'CRITICO') continue;
    r.total++;
    if (f !== 'REGULAR') r.vencem90++;
  }
  for (const c of criticas) if (c.tipo === tipo && dentro(c.chave)) r.criticas++;
  return r;
}

/**
 * Atas e contratos vigentes de cada gestor (com o recorte que ele vê no próprio painel), quantos vencem em 90 dias e
 * quantas pendências críticas cada lado tem. A última linha, sem gestor, junta o que não cai em carteira nenhuma.
 */
export function resumoPorGestor(
  gestores: Array<{ gestor: GestorDaCarteira; escopo: EscopoDoGestor }>,
  atas: InstrumentoNoPainel[],
  contratos: InstrumentoNoPainel[],
  criticas: CriticaDoInstrumento[]
): ResumoDoGestor[] {
  const comGestorAtas = new Set<string>();
  const comGestorContratos = new Set<string>();
  const linhas: ResumoDoGestor[] = gestores.map(({ gestor, escopo }) => {
    escopo.ataKeys.forEach((k) => comGestorAtas.add(k));
    escopo.contractKeys.forEach((k) => comGestorContratos.add(k));
    return {
      gestor,
      atas: resumirLado(atas, criticas, 'ATA', (k) => escopo.ataKeys.has(k)),
      contratos: resumirLado(contratos, criticas, 'CONTRATO', (k) => escopo.contractKeys.has(k))
    };
  });
  linhas.push({
    atas: resumirLado(atas, criticas, 'ATA', (k) => !comGestorAtas.has(k)),
    contratos: resumirLado(contratos, criticas, 'CONTRATO', (k) => !comGestorContratos.has(k))
  });
  return linhas;
}

export interface CartaoDoGestor extends ResumoDoGestor {
  gestor: GestorDaCarteira;
  /** Atas + contratos vigentes. */
  carga: number;
  /** Pendências críticas somadas dos dois lados. */
  criticas: number;
  /** Carga em relação à maior carteira (0 a 100): a barra do cartão. */
  pctDaMaior: number;
  maiorCarteira: boolean;
}

export interface CartoesDaDistribuicao {
  /** "Sem gestor" vem primeiro (é o único cartão que pede ação); ausente quando não sobra nada sem gestor. */
  semGestor: ResumoDoGestor | null;
  /** Gestores com carteira: mais pendências críticas primeiro, depois a maior carteira, depois o nome. */
  gestores: CartaoDoGestor[];
  /** Gestores sem nenhuma ata nem contrato vigente: uma linha no rodapé, em vez de um cartão zerado. */
  semCarteira: string[];
}

/** Organiza as linhas de resumoPorGestor para os cartões da gaveta Distribuição. */
export function organizarCartoesDistribuicao(linhas: ResumoDoGestor[]): CartoesDaDistribuicao {
  const sem = linhas.find((l) => !l.gestor) ?? null;
  const comGestor = linhas.filter((l): l is ResumoDoGestor & { gestor: GestorDaCarteira } => Boolean(l.gestor));
  const carga = (l: ResumoDoGestor) => l.atas.total + l.contratos.total;
  const comCarteira = comGestor.filter((l) => carga(l) > 0);
  const maior = Math.max(0, ...comCarteira.map(carga));
  const gestores = comCarteira
    .map((l) => ({
      ...l,
      carga: carga(l),
      criticas: l.atas.criticas + l.contratos.criticas,
      pctDaMaior: maior > 0 ? Math.round((100 * carga(l)) / maior) : 0,
      maiorCarteira: carga(l) === maior
    }))
    .sort((a, b) => b.criticas - a.criticas || b.carga - a.carga || a.gestor.nome.localeCompare(b.gestor.nome, 'pt-BR'));
  return {
    semGestor: sem && carga(sem) > 0 ? sem : null,
    gestores,
    semCarteira: comGestor.filter((l) => carga(l) === 0).map((l) => l.gestor.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  };
}

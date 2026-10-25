/**
 * Rótulos e contas pequenas da aba Reajuste da Ata 360 (protótipo aprovado em 23/10/2026). A conta dos ciclos e dos
 * itens vem pronta do banco; aqui só ficam os textos, as cores e o impacto em R$ sobre o saldo.
 */
import type { StatusBadgeVariant } from '../../../design-system';
import type {
  CicloReajuste,
  ItemReajuste,
  ParametrosReajuste,
  ReajusteDaAta,
  ReajustePublicado,
  SituacaoAtaReajuste,
  SituacaoCiclo,
  SituacaoItemReajuste
} from '../../../services/reajusteAtasService';
import { formatCurrencyCompact } from '../../../utils/format';
import { formatDateBR } from '../../../services/temporalEngineService';

export const ROTULO_SITUACAO_ITEM: Record<SituacaoItemReajuste, string> = {
  SEM_REAJUSTE: 'Sem cláusula de reajuste',
  SEM_BASE: 'Termo de Conformidade a informar',
  PERCENTUAL_A_INFORMAR: 'Informe o percentual',
  INDICE_INDISPONIVEL: 'Índice sem dados',
  PRECO_DESATUALIZADO: 'Preço sem o reajuste',
  DEVIDO: 'Reajuste devido',
  PREVISTO: 'Reajuste previsto',
  SE_PRORROGAR: 'Na prorrogação, se houver',
  EM_DIA: 'Em dia'
};

export const VARIANTE_SITUACAO_ITEM: Record<SituacaoItemReajuste, StatusBadgeVariant> = {
  SEM_REAJUSTE: 'neutral',
  SEM_BASE: 'warning',
  PERCENTUAL_A_INFORMAR: 'warning',
  INDICE_INDISPONIVEL: 'neutral',
  PRECO_DESATUALIZADO: 'warning',
  DEVIDO: 'danger',
  PREVISTO: 'info',
  SE_PRORROGAR: 'neutral',
  EM_DIA: 'success'
};

export const ROTULO_SITUACAO_ATA: Record<SituacaoAtaReajuste, string> = {
  ...ROTULO_SITUACAO_ITEM,
  TERMO_A_INFORMAR: 'Termo de Conformidade a informar'
};

export const ROTULO_SITUACAO_CICLO: Record<SituacaoCiclo, string> = {
  APLICADO: 'Aplicado',
  PUBLICADO_SEM_PERCENTUAL: 'Publicado sem percentual',
  DEVIDO: 'Reajuste devido',
  PREVISTO: 'Previsto',
  SE_PRORROGAR: 'Na prorrogação, se houver'
};

export const VARIANTE_SITUACAO_CICLO: Record<SituacaoCiclo, StatusBadgeVariant> = {
  APLICADO: 'success',
  PUBLICADO_SEM_PERCENTUAL: 'warning',
  DEVIDO: 'danger',
  PREVISTO: 'info',
  SE_PRORROGAR: 'neutral'
};

/** Ordem de gravidade da situação do item (a pior manda no cartão e no contador da aba). */
const ORDEM_ITEM: SituacaoItemReajuste[] = ['PERCENTUAL_A_INFORMAR', 'DEVIDO', 'PRECO_DESATUALIZADO', 'INDICE_INDISPONIVEL', 'SEM_BASE', 'PREVISTO', 'SE_PRORROGAR', 'EM_DIA', 'SEM_REAJUSTE'];
/** Situações que pedem ação do gestor (contador da aba). */
export const SITUACOES_COM_ACAO: ReadonlySet<SituacaoItemReajuste> = new Set(['PERCENTUAL_A_INFORMAR', 'DEVIDO', 'PRECO_DESATUALIZADO']);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2025-02-01" → "fev/2025". */
export function mesPorExtenso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m] = iso.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MESES[m - 1]}/${y}` : '—';
}

/** 4,44% (duas casas, como nos apostilamentos). */
export function percentual(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—';
}

export function diasAte(iso: string, hoje: Date = new Date()): number {
  const alvo = Date.parse(`${iso}T00:00:00-03:00`);
  const base = Date.parse(`${hoje.toISOString().slice(0, 10)}T00:00:00-03:00`);
  return Math.round((alvo - base) / 86_400_000);
}

export function piorSituacao(itens: ItemReajuste[]): SituacaoItemReajuste | null {
  if (itens.length === 0) return null;
  return [...itens].sort((a, b) => ORDEM_ITEM.indexOf(a.situacao) - ORDEM_ITEM.indexOf(b.situacao))[0].situacao;
}

export function contarComAcao(itens: ItemReajuste[]): number {
  return itens.filter((i) => SITUACOES_COM_ACAO.has(i.situacao)).length;
}

/** Saldo do item ainda não contratado (negativo conta zero). */
export interface SaldoDoItem {
  numeroItem: string;
  saldo: number;
}

export interface ImpactoDoItem {
  /** R$ que falta aplicar sobre o saldo (reajuste devido ou preço do banco sem o reajuste). */
  devido: number;
  /** R$ do próximo reajuste sobre o saldo. */
  proximo: number;
  saldo: number;
}

const numeroCanonico = (n: string) => (/^\d+$/.test(n.trim()) ? String(Number(n)) : n.trim());

export function impactoDoItem(item: ItemReajuste, saldos: SaldoDoItem[]): ImpactoDoItem {
  const s = saldos.find((x) => numeroCanonico(x.numeroItem) === numeroCanonico(item.numeroItem));
  const saldo = Math.max(s?.saldo ?? 0, 0);
  const base = Math.max(item.precoDevido, item.precoAtual);
  const devido = saldo * Math.max(item.precoDevido - item.precoAtual, 0);
  const proximo = item.precoProjetado != null ? saldo * Math.max(item.precoProjetado - base, 0) : 0;
  return { devido, proximo, saldo };
}

export function totaisDaAta(itens: ItemReajuste[], saldos: SaldoDoItem[]): { devido: number; proximo: number } {
  return itens.reduce(
    (acc, i) => {
      const imp = impactoDoItem(i, saldos);
      return { devido: acc.devido + imp.devido, proximo: acc.proximo + imp.proximo };
    },
    { devido: 0, proximo: 0 }
  );
}

export type OrigemDaBase = 'INFORMADO' | 'APOSTILAMENTO' | 'EDITAL' | null;

export function origemDaBase(p: ParametrosReajuste | null): OrigemDaBase {
  if (!p) return null;
  if (p.termoData) return 'INFORMADO';
  if (p.termoMesApostilamento) return 'APOSTILAMENTO';
  if (p.dataOrcamentoEdital) return 'EDITAL';
  return null;
}

/** Data-base como a tela mostra: dia informado, ou só o mês quando vem do apostilamento. */
export function dataBaseNaTela(p: ParametrosReajuste | null): string {
  const origem = origemDaBase(p);
  if (!p || !origem) return '—';
  if (origem === 'INFORMADO') return formatDateBR(p.termoData as string);
  if (origem === 'APOSTILAMENTO') return mesPorExtenso(p.termoMesApostilamento);
  return formatDateBR(p.dataOrcamentoEdital as string);
}

export function ultimoReajuste(ciclos: CicloReajuste[]): CicloReajuste | null {
  const feitos = ciclos.filter((c) => c.situacao === 'APLICADO' || c.situacao === 'PUBLICADO_SEM_PERCENTUAL');
  return feitos.length ? feitos[feitos.length - 1] : null;
}

export function proximoCiclo(ciclos: CicloReajuste[], hoje: Date = new Date()): CicloReajuste | null {
  const h = hoje.toISOString().slice(0, 10);
  return ciclos.find((c) => c.efeitoInicio > h) ?? null;
}

export function publicadoDoCiclo(c: CicloReajuste, publicados: ReajustePublicado[]): ReajustePublicado | null {
  return c.reajusteId ? publicados.find((p) => p.id === c.reajusteId) ?? null : null;
}

export interface AvisoDaAba {
  tone: 'danger' | 'warning' | 'info' | 'success';
  texto: string;
  /** Ação principal sugerida pelo aviso. */
  acao?: 'INFORMAR_PERCENTUAL' | 'INFORMAR_TERMO';
}

/** Frase do topo da aba: a situação mais urgente da ata, em linguagem da CGLIC. */
export function avisoDaAba(dados: ReajusteDaAta, saldos: SaldoDoItem[], hoje: Date = new Date()): AvisoDaAba {
  const pior = piorSituacao(dados.itens);
  const totais = totaisDaAta(dados.itens, saldos);
  const semPercentual = dados.ciclos.find((c) => c.situacao === 'PUBLICADO_SEM_PERCENTUAL');
  const devido = dados.ciclos.find((c) => c.situacao === 'DEVIDO');
  const prox = proximoCiclo(dados.ciclos, hoje);
  const estimados = (c: CicloReajuste) => (c.mesesEstimados > 0 ? `, com ${c.mesesEstimados} dos 12 meses ainda estimados pelo Focus` : '');

  if (dados.parametros?.clausula === 'SEM_REAJUSTE') {
    return { tone: 'info', texto: 'O edital desta ata não tem cláusula de reajuste. Na prorrogação, os preços só se mantêm com a concordância formal do fornecedor (ON AGU nº 100/2025).' };
  }
  if (!origemDaBase(dados.parametros)) {
    return { tone: 'warning', texto: 'Falta a data-base do reajuste. Informe a data e o número SEI do Termo de Conformidade da pesquisa de preços.', acao: 'INFORMAR_TERMO' };
  }
  if (pior === 'PERCENTUAL_A_INFORMAR' && semPercentual) {
    return {
      tone: 'warning',
      texto: `Há um reajuste publicado no PNCP sem percentual legível${semPercentual.efeitoInicio ? `, com efeitos em ${formatDateBR(semPercentual.efeitoInicio)}` : ''}. Pela conta do sistema, seria ${percentual(semPercentual.percentualCalculado)}. Informe o percentual do apostilamento.`,
      acao: 'INFORMAR_PERCENTUAL'
    };
  }
  if (pior === 'DEVIDO' && devido) {
    return {
      tone: 'danger',
      texto: `O reajuste venceu em ${formatDateBR(devido.efeitoInicio)} e não há apostilamento publicado. Aplicar ${percentual(devido.percentual)} aumenta em ${formatCurrencyCompact(totais.devido)} o valor do saldo ainda não contratado.`
    };
  }
  if (pior === 'PRECO_DESATUALIZADO') {
    const ap = ultimoReajuste(dados.ciclos);
    return {
      tone: 'warning',
      texto: `O reajuste${ap?.percentual != null ? ` de ${percentual(ap.percentual)}` : ''} está publicado no PNCP, mas o preço da ata no Compras.gov.br ainda é o homologado. Confira se o reajuste foi registrado na ata do Compras.gov.br; até lá, a conta usa o preço reajustado.`
    };
  }
  if (pior === 'INDICE_INDISPONIVEL') {
    return { tone: 'info', texto: `O índice desta ata (${dados.parametros?.indice ?? '—'}) ainda não tem dados no sistema. A projeção aparece quando a série for lida.` };
  }
  if (prox && prox.situacao === 'SE_PRORROGAR') {
    return { tone: 'info', texto: `Se a ata for prorrogada em ${formatDateBR(prox.efeitoInicio)}, o reajuste estimado é de ${percentual(prox.percentual)}${estimados(prox)}. O reajuste entra no termo aditivo de prorrogação, para o novo ciclo de vigência.` };
  }
  if (prox) {
    const d = diasAte(prox.efeitoInicio, hoje);
    return { tone: 'info', texto: `Próximo reajuste em ${formatDateBR(prox.efeitoInicio)}, daqui a ${d} ${d === 1 ? 'dia' : 'dias'}: ${percentual(prox.percentual)}${estimados(prox)}.` };
  }
  return { tone: 'success', texto: 'Os preços estão em dia e não há novo reajuste até o fim da vigência possível da ata.' };
}

/** Quadro "Reajuste" do cartão da Ata 360. */
export function quadroDoCartao(dados: ReajusteDaAta, saldos: SaldoDoItem[], hoje: Date = new Date()): { valor: string; hint: string; tone?: 'danger' | 'warning' } | null {
  if (!dados.parametros) return null;
  const pior = piorSituacao(dados.itens);
  const prox = proximoCiclo(dados.ciclos, hoje);
  if (dados.parametros.clausula === 'SEM_REAJUSTE') return { valor: 'Sem cláusula', hint: 'Edital sem reajuste' };
  if (!origemDaBase(dados.parametros)) return { valor: 'Informar termo', hint: 'Falta a data-base', tone: 'warning' };
  if (pior === 'DEVIDO') return { valor: 'Devido', hint: `${formatCurrencyCompact(totaisDaAta(dados.itens, saldos).devido)} no saldo`, tone: 'danger' };
  if (pior === 'PERCENTUAL_A_INFORMAR') return { valor: 'Informar %', hint: 'Apostilamento sem percentual', tone: 'warning' };
  if (pior === 'PRECO_DESATUALIZADO') return { valor: 'Conferir preço', hint: 'Reajuste publicado, preço antigo', tone: 'warning' };
  if (prox) return { valor: formatDateBR(prox.efeitoInicio), hint: `${percentual(prox.percentual)}${prox.mesesEstimados > 0 ? ' estimado' : ''}${prox.situacao === 'SE_PRORROGAR' ? ' · se prorrogar' : ''}` };
  return { valor: 'Em dia', hint: 'Sem novo reajuste na vigência' };
}

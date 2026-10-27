import type { InternalAllocation } from '../types';
import type { AllocationExecution } from './allocationExecution';

/**
 * Edição das alocações internas de um item na janela "Alocação do item" (fila Itens às unidades e Item 360).
 * Tudo é editado em memória e gravado de uma vez; as regras ficam aqui para valerem nas duas telas:
 * - a soma não passa do quantitativo SENASP;
 * - a unidade não fica com menos do que já contratou nem do que já empenhou (migration 103), e a CAEP não fica com
 *   menos do que o contratado (ou empenhado) mais a reserva a parlamentares ainda sem empenho, nem menos que a
 *   reserva toda (a trava do banco é da migration 157);
 * - a unidade com contrato, empenho vinculado ou reserva não pode ser removida (antes é preciso tirá-la das divisões dos
 *   contratos e desvincular os empenhos);
 * - a unidade desativada fica como está ou diminui, mas não aumenta (migration 108).
 */
export interface LinhaAlocacao {
  id: string;
  unitName: string;
  /** Quantidade gravada (0 nas unidades adicionadas nesta edição). */
  original: number;
  /** Quantidade digitada; vazio enquanto o campo está em branco. */
  qtd: number | '';
  empenhado: number;
  /** Contratado da unidade no item: soma das divisões dos contratos (migration 103). */
  contratado: number;
  /** Empenhos do item vinculados à unidade (confirmados ou não). */
  vinculados: number;
  /** Reservado a parlamentares no menu Emendas (só a CAEP; 0 nas outras) e a parte ainda sem empenho. */
  reservado?: number;
  reservadoAEmpenhar?: number;
  removida: boolean;
  adicionada: boolean;
  /** Unidade desativada no catálogo: só mantém ou diminui (migration 108). */
  inativa?: boolean;
}

export interface AvaliacaoLinha {
  alterada: boolean;
  /** Mínimo que a unidade aceita (presoDaUnidade, e pelo menos 1). */
  minimo: number;
  /** O que segura o mínimo, para a mensagem da linha. */
  motivoDoMinimo: MotivoDoMinimo | null;
  abaixoDoMinimo: boolean;
  /** Unidade desativada com quantidade acima da gravada. */
  acimaDoGravado: boolean;
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

/** Unidade interna das emendas (unidade_das_emendas() no banco): a reserva a parlamentares fica nela. */
export const UNIDADE_DAS_EMENDAS = 'CAEP';

export type MotivoDoMinimo = 'reservado' | 'contratado' | 'empenhado' | 'contratado_e_reserva' | 'empenhado_e_reserva';
export const ROTULO_MOTIVO_DO_MINIMO: Record<MotivoDoMinimo, string> = {
  reservado: 'reservado a parlamentares',
  contratado: 'contratado',
  empenhado: 'empenhado',
  contratado_e_reserva: 'contratado + reservado sem empenho',
  empenhado_e_reserva: 'empenhado + reservado sem empenho'
};

/** O que segura a alocação da unidade. Na CAEP, a reserva a parlamentares: o total e a parte ainda sem empenho. */
export interface ExecucaoDaUnidade {
  contratado: number;
  empenhado: number;
  reservado?: number;
  reservadoAEmpenhar?: number;
}

/**
 * Quanto da alocação está preso (não pode sair) e por quê. A reserva já empenhada ou contratada está dentro do
 * empenhado ou do contratado; só a reserva ainda sem empenho soma por cima deles. E nunca menos que a reserva toda
 * (a trava do banco, migration 157).
 */
export function presoDaUnidade(u: ExecucaoDaUnidade): { preso: number; motivo: MotivoDoMinimo | null; explicacao: string | null } {
  const reservado = u.reservado ?? 0;
  const aEmpenhar = Math.min(u.reservadoAEmpenhar ?? 0, reservado);
  const base = Math.max(0, u.contratado, u.empenhado);
  const pelaBase: 'contratado' | 'empenhado' = u.contratado >= u.empenhado ? 'contratado' : 'empenhado';
  const comReserva = base + aEmpenhar;
  const preso = Math.max(comReserva, reservado);
  if (preso === 0) return { preso, motivo: null, explicacao: null };
  if (aEmpenhar > 0 && base > 0 && comReserva >= reservado) {
    return { preso, motivo: `${pelaBase}_e_reserva`, explicacao: `${fmt(base)} ${pelaBase === 'contratado' ? 'contratados' : 'empenhados'} + ${fmt(aEmpenhar)} reservados a parlamentares ainda sem empenho` };
  }
  if (reservado > 0 && reservado >= comReserva) return { preso, motivo: 'reservado', explicacao: `${fmt(reservado)} reservados a parlamentares` };
  return { preso, motivo: pelaBase, explicacao: `${fmt(base)} ${pelaBase === 'contratado' ? 'contratados' : 'empenhados'}` };
}

const temReserva = (motivo: MotivoDoMinimo | null) => motivo === 'reservado' || motivo === 'contratado_e_reserva' || motivo === 'empenhado_e_reserva';

export interface FolgaDaUnidade {
  unitName: string;
  alocado: number;
  preso: number;
  motivo: MotivoDoMinimo | null;
  /** Quanto pode sair da alocação sem passar do que está preso. */
  podeDiminuir: number;
}

/** Reserva a parlamentares do item: o total e a parte ainda sem empenho (vai para a linha da CAEP). */
export interface ReservaDasEmendas {
  total: number;
  aEmpenhar: number;
}
const SEM_RESERVA: ReservaDasEmendas = { total: 0, aEmpenhar: 0 };
const reservaDaUnidade = (unitName: string, r: ReservaDasEmendas) =>
  normUnidade(unitName) === normUnidade(UNIDADE_DAS_EMENDAS) ? { reservado: r.total, reservadoAEmpenhar: r.aEmpenhar } : { reservado: 0, reservadoAEmpenhar: 0 };

/** Onde dá para diminuir a alocação (remanejamento da cota SENASP sem livre): as unidades com folga primeiro. */
export function folgaDasUnidades(
  unidades: ReadonlyArray<{ unitName: string; allocatedQty: number; contratado: number; empenhado: number }>,
  reserva: ReservaDasEmendas
): FolgaDaUnidade[] {
  return unidades
    .map((u) => {
      const { preso, motivo } = presoDaUnidade({ ...u, ...reservaDaUnidade(u.unitName, reserva) });
      return { unitName: u.unitName, alocado: u.allocatedQty, preso, motivo, podeDiminuir: Math.max(0, u.allocatedQty - preso) };
    })
    .sort((a, b) => b.podeDiminuir - a.podeDiminuir || a.unitName.localeCompare(b.unitName));
}
const num = (q: number | '') => (q === '' ? 0 : Number(q) || 0);
export const normUnidade = (s: string) => s.trim().toLowerCase();

export function linhasIniciais(
  alocacoes: InternalAllocation[],
  execucao: Map<string, AllocationExecution>,
  /** Contratado de cada unidade, pelo nome normalizado (normUnidade). */
  contratadoPorUnidade?: ReadonlyMap<string, number>,
  /** Reserva a parlamentares no item (vai para a linha da CAEP). */
  reserva: ReservaDasEmendas = SEM_RESERVA
): LinhaAlocacao[] {
  return alocacoes.map((a) => {
    const exec = execucao.get(a.id);
    return {
      id: a.id,
      unitName: a.unitName,
      original: a.allocatedQty,
      qtd: a.allocatedQty,
      empenhado: exec?.empenhado ?? 0,
      contratado: contratadoPorUnidade?.get(normUnidade(a.unitName)) ?? 0,
      vinculados: exec?.vinculados ?? 0,
      ...reservaDaUnidade(a.unitName, reserva),
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
  let reservaAbaixo: { unidade: string; minimo: number; explicacao: string } | null = null;
  const inativasAcima: string[] = [];

  for (const l of linhas) {
    const { preso, motivo, explicacao } = presoDaUnidade(l);
    const minimo = Math.max(1, preso);
    const abaixoDoMinimo = !l.removida && num(l.qtd) < minimo;
    if (abaixoDoMinimo && temReserva(motivo)) reservaAbaixo = { unidade: l.unitName, minimo, explicacao: explicacao ?? '' };
    else if (abaixoDoMinimo) algumaAbaixo = true;
    const acimaDoGravado = !!l.inativa && !l.removida && num(l.qtd) > l.original;
    if (acimaDoGravado) inativasAcima.push(l.unitName);
    const alterada = !l.adicionada && !l.removida && num(l.qtd) !== l.original;
    porLinha.set(l.id, { alterada, minimo, motivoDoMinimo: preso > 0 ? motivo : null, abaixoDoMinimo, acimaDoGravado, podeRemover: l.vinculados === 0 && !(l.contratado > 0) && !((l.reservado ?? 0) > 0) });
    if (l.adicionada && !l.removida) mudancas.push(`+ ${l.unitName} ${fmt(num(l.qtd))}`);
    else if (l.removida && !l.adicionada) mudancas.push(`− ${l.unitName}`);
    else if (alterada) mudancas.push(`${l.unitName} ${fmt(l.original)} → ${fmt(num(l.qtd))}`);
  }

  const erros: string[] = [];
  if (totalAlocado > quantitativoSenasp) {
    erros.push(`A soma das alocações (${fmt(totalAlocado)}) passa do quantitativo SENASP (${fmt(quantitativoSenasp)}) em ${fmt(totalAlocado - quantitativoSenasp)}. Reduza alguma unidade.`);
  }
  if (reservaAbaixo) {
    const r: { unidade: string; minimo: number; explicacao: string } = reservaAbaixo;
    erros.push(`A ${r.unidade} não pode ficar com menos de ${fmt(r.minimo)}: ${r.explicacao}. Para diminuir, peça à ${r.unidade} para liberar a reserva em Emendas › Pedidos.`);
  }
  if (algumaAbaixo) erros.push('Há unidade abaixo do mínimo: a quantidade deve ser maior que zero e não pode ficar abaixo do que a unidade já contratou nem do que já empenhou.');
  if (inativasAcima.length > 0) {
    erros.push(`${inativasAcima.join(', ')} ${inativasAcima.length === 1 ? 'está desativada' : 'estão desativadas'}: a alocação pode ficar como está ou diminuir, mas não aumentar.`);
  }
  if (linhas.some((l) => l.removida && l.contratado > 0)) erros.push('Unidade com contrato não pode ser removida. Tire a unidade das divisões dos contratos antes, na aba Contratos e empenhos.');
  if (linhas.some((l) => l.removida && (l.reservado ?? 0) > 0)) erros.push('A unidade com reserva a parlamentares não pode ser removida. A reserva precisa ser liberada antes, em Emendas › Pedidos.');
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

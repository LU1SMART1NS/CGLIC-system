import type { NivelComplexidade } from './complexidade';

/**
 * Nível do gestor (migration 140): define quanto da carga cheia a pessoa aguenta. A Central compara os gestores pela
 * ocupação (carga ÷ capacidade), e não pela carga crua: um iniciante com carga 22 está mais cheio que um avançado com 31.
 */
export type NivelGestor = 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO';

export const NIVEIS_GESTOR: NivelGestor[] = ['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'];

export const ROTULO_NIVEL: Record<NivelGestor, string> = { INICIANTE: 'Iniciante', INTERMEDIARIO: 'Intermediário', AVANCADO: 'Avançado' };

/** Parte da carga cheia que cada nível aguenta. */
export const CAPACIDADE_NIVEL: Record<NivelGestor, number> = { INICIANTE: 0.6, INTERMEDIARIO: 0.85, AVANCADO: 1 };

/** Sem nível informado, vale a capacidade de Intermediário até o coordenador informar. */
export const CAPACIDADE_SEM_NIVEL = CAPACIDADE_NIVEL.INTERMEDIARIO;

export const PROXIMO_NIVEL: Record<NivelGestor, NivelGestor | null> = { INICIANTE: 'INTERMEDIARIO', INTERMEDIARIO: 'AVANCADO', AVANCADO: null };

/** O que muda na prática em cada nível (texto da janela "Alterar nível"). */
export const DESCRICAO_NIVEL: Record<NivelGestor, string> = {
  INICIANTE: 'Recebe Alta só com aviso; fica fora da sugestão quando o lote tem Alta',
  INTERMEDIARIO: 'Recebe qualquer complexidade',
  AVANCADO: 'Recebe qualquer complexidade, carga cheia'
};

/** Motivos rápidos da mudança de nível (o coordenador pode escrever outro). */
export const MOTIVOS_NIVEL = ['Cumpriu os critérios de subida', 'Experiência anterior', 'Voltou de afastamento', 'Mudou de função'] as const;

/** Nível gravado de um servidor (public.gestor_niveis). */
export interface NivelRegistrado {
  userId: string;
  nivel: NivelGestor;
  /** Quando entrou no nível atual (conta para a subida). */
  desde: string;
  motivo: string;
  definidoPorNome?: string;
}

export const capacidadeDe = (nivel: NivelGestor | null | undefined): number => (nivel ? CAPACIDADE_NIVEL[nivel] : CAPACIDADE_SEM_NIVEL);

export const percentual = (capacidade: number): string => `${Math.round(capacidade * 100)}%`;

/** Carga ajustada ao nível. */
export const ocupacao = (carga: number, capacidade: number): number => (capacidade > 0 ? carga / capacidade : carga);

/** Critérios para subir a partir de cada nível: tempo no nível, experiência com a complexidade e tarefas em dia. */
export interface RegraSubida {
  mesesNoNivel: number;
  complexidade: NivelComplexidade;
  mesesComComplexidade: number;
  maxAtrasadas: number;
}

export const REGRAS_SUBIDA: Record<'INICIANTE' | 'INTERMEDIARIO', RegraSubida> = {
  INICIANTE: { mesesNoNivel: 6, complexidade: 'MEDIA', mesesComComplexidade: 3, maxAtrasadas: 2 },
  INTERMEDIARIO: { mesesNoNivel: 12, complexidade: 'ALTA', mesesComComplexidade: 6, maxAtrasadas: 2 }
};

const MS_MES = 30.44 * 24 * 60 * 60 * 1000;

/** Meses completos entre a data e hoje (`null` sem data válida). */
export function mesesDesde(data: string | undefined | null, hoje: Date = new Date()): number | null {
  if (!data) return null;
  const ms = hoje.getTime() - new Date(data).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / MS_MES));
}

const txtMeses = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

export interface CriterioSubida {
  ok: boolean;
  texto: string;
  detalhe: string;
}

export interface AvaliacaoSubida {
  proximo: NivelGestor;
  criterios: CriterioSubida[];
  pronto: boolean;
}

/** Instrumento vigente do gestor, com a data em que ele passou a cuidar dele (atualização em ata_managers/contract_managers). */
export interface ItemDoGestor {
  rotulo: string;
  complexidade: NivelComplexidade;
  gestorDesde?: string;
}

const ORDEM_COMPLEXIDADE: Record<NivelComplexidade, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2 };

/**
 * Critérios de subida de um gestor com nível gravado. `null` quando já está no topo ou sem nível (o coordenador
 * informa o nível de partida). Só sugere: quem sobe é o coordenador.
 */
export function avaliarSubida(input: {
  nivel: NivelRegistrado | null | undefined;
  itens: ItemDoGestor[];
  atrasadas: number;
  hoje?: Date;
}): AvaliacaoSubida | null {
  const { nivel, itens, atrasadas, hoje = new Date() } = input;
  if (!nivel) return null;
  const proximo = PROXIMO_NIVEL[nivel.nivel];
  if (!proximo || nivel.nivel === 'AVANCADO') return null;
  const regra = REGRAS_SUBIDA[nivel.nivel];

  const noNivel = mesesDesde(nivel.desde, hoje) ?? 0;
  const tempo: CriterioSubida = {
    ok: noNivel >= regra.mesesNoNivel,
    texto: `Pelo menos ${txtMeses(regra.mesesNoNivel)} como ${ROTULO_NIVEL[nivel.nivel]}`,
    detalhe: txtMeses(noNivel)
  };

  // O instrumento da complexidade pedida (ou acima) que ele cuida há mais tempo.
  let melhor: { rotulo: string; meses: number } | null = null;
  for (const item of itens) {
    if (ORDEM_COMPLEXIDADE[item.complexidade] < ORDEM_COMPLEXIDADE[regra.complexidade]) continue;
    const meses = mesesDesde(item.gestorDesde, hoje);
    if (meses === null) continue;
    if (!melhor || meses > melhor.meses) melhor = { rotulo: item.rotulo, meses };
  }
  const nomeComplexidade = regra.complexidade === 'ALTA' ? 'Alto' : 'Médio';
  const experiencia: CriterioSubida = {
    ok: melhor !== null && melhor.meses >= regra.mesesComComplexidade,
    texto: `Cuida de 1 instrumento ${nomeComplexidade}${regra.complexidade === 'MEDIA' ? ' ou Alto' : ''} há ${txtMeses(regra.mesesComComplexidade)} ou mais`,
    detalhe: melhor ? `${melhor.rotulo}, há ${txtMeses(melhor.meses)}` : `Nenhum na carteira vigente`
  };

  const emDia: CriterioSubida = {
    ok: atrasadas <= regra.maxAtrasadas,
    texto: `No máximo ${regra.maxAtrasadas} tarefas atrasadas hoje`,
    detalhe: atrasadas === 0 ? 'Nenhuma' : `${atrasadas} ${atrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`
  };

  const criterios = [tempo, experiencia, emDia];
  return { proximo, criterios, pronto: criterios.every((c) => c.ok) };
}

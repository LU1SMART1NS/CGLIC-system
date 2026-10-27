import type {
  AcaoGestor,
  AndamentoTarefaGestao,
  DetalhesModeloGestao,
  PrazoAncora,
  RegraTarefaGestao,
  TaskPlanModuleRef
} from '../types';
import { differenceInBusinessDays, parseDateBRT } from '../services/temporalEngineService';

/**
 * Modelo de gestão da CCGA (migrations 210 e 215): leitura das colunas novas, rótulos das
 * ações do gestor, texto da regra de prazo e o grupo da tarefa nos contadores do plano.
 */

export const ACOES_GESTOR: AcaoGestor[] = ['FAZER', 'ORIENTAR', 'CONFERIR', 'ASSINAR', 'LANCAR', 'ACOMPANHAR'];

export interface AcaoInfo {
  rotulo: string;
  /** Frase curta do que o gestor faz, para a legenda e o seletor do modelo. */
  descricao: string;
  /** Cor do texto e da borda; o fundo é a mesma cor clara. */
  cor: string;
  fundo: string;
}

export const ACAO_INFO: Record<AcaoGestor, AcaoInfo> = {
  FAZER: { rotulo: 'Fazer', descricao: 'o gestor elabora o documento ou faz a providência', cor: '#0c326f', fundo: '#eef3fb' },
  ORIENTAR: { rotulo: 'Orientar', descricao: 'o gestor pede a outra pessoa ou unidade e acompanha a resposta', cor: '#7a4b00', fundo: '#fff4e0' },
  CONFERIR: { rotulo: 'Conferir', descricao: 'o gestor confere o que recebeu e pode devolver', cor: '#5b2a86', fundo: '#f4edfb' },
  ASSINAR: { rotulo: 'Disponibilizar para assinatura', descricao: 'o gestor disponibiliza no SEI para quem assina', cor: '#0f5c4d', fundo: '#e7f6f2' },
  LANCAR: { rotulo: 'Lançar', descricao: 'o gestor lança no sistema estruturante (Contratos.gov.br, PNCP e outros)', cor: '#1d4f91', fundo: '#e8f1fd' },
  ACOMPANHAR: { rotulo: 'Acompanhar', descricao: 'outra unidade faz no sistema dela; a tarefa fecha quando o dado chega', cor: '#475569', fundo: '#f1f5f9' }
};

export const ANCORA_INFO: Record<PrazoAncora, string> = {
  VIGENCIA_FIM: 'do fim da vigência',
  INICIO: 'da assinatura',
  APLICACAO: 'da data de partida do módulo',
  ANTERIOR: 'após a tarefa anterior',
  FIXO: 'data informada pelo gestor'
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const lista = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length > 0 ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : undefined;
/** Datas do Postgres chegam como 'AAAA-MM-DD'; guarda só a data. */
const data = (v: unknown): string | undefined => (typeof v === 'string' && v ? v.slice(0, 10) : undefined);

/** Colunas da regra (modelo e plano). */
export function lerRegraTarefa(row: any): RegraTarefaGestao {
  const acao = str(row?.acao) as AcaoGestor | undefined;
  const ancora = str(row?.prazo_ancora) as PrazoAncora | undefined;
  return {
    acao: acao && ACOES_GESTOR.includes(acao) ? acao : undefined,
    comQuem: str(row?.com_quem),
    lista: lista(row?.lista),
    nota: str(row?.nota),
    modeloSei: str(row?.modelo_sei),
    prazoTexto: str(row?.prazo_texto),
    prazoAncora: ancora && ancora in ANCORA_INFO ? ancora : undefined,
    prazoDias: num(row?.prazo_dias),
    prazoUteis: bool(row?.prazo_uteis),
    respostaTexto: str(row?.resposta_texto),
    respostaDias: num(row?.resposta_dias),
    respostaUteis: bool(row?.resposta_uteis),
    esforcoMin: num(row?.esforco_min),
    doPregao: row?.do_pregao === true ? true : undefined
  };
}

/** Colunas do andamento (só no plano). */
export function lerAndamentoTarefa(row: any): AndamentoTarefaGestao {
  return {
    templateTaskId: str(row?.template_task_id),
    prazoAjustado: row?.prazo_ajustado === true ? true : undefined,
    prazoMinimo: data(row?.prazo_minimo),
    prazoResposta: data(row?.prazo_resposta),
    pedidoEnviadoEm: data(row?.pedido_enviado_em),
    pedidoSei: str(row?.pedido_sei),
    respostaEm: data(row?.resposta_em),
    respostaSei: str(row?.resposta_sei)
  };
}

/** Colunas do módulo no modelo. */
export function lerDetalhesModelo(row: any): DetalhesModeloGestao {
  return {
    gatilho: str(row?.gatilho),
    gatilhoDias: num(row?.gatilho_dias),
    quando: str(row?.quando),
    base: str(row?.base),
    processoTipo: str(row?.processo_tipo),
    variantes: lista(row?.variantes),
    origemModelo: str(row?.origem_modelo)
  };
}

/** Junta a linha da tabela de módulos (processo SEI, data de partida) ao módulo lido da etapa. */
export function completarModulo(modulo: TaskPlanModuleRef | undefined, linhas: Map<string, any>): TaskPlanModuleRef | undefined {
  if (!modulo) return modulo;
  const row = linhas.get(modulo.id);
  if (!row) return modulo;
  return {
    ...modulo,
    processoTipo: str(row.processo_tipo),
    processoSei: str(row.processo_sei),
    variante: str(row.variante),
    ancoraData: data(row.ancora_data)
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Texto da regra de prazo a partir dos campos (quando o modelo não traz o texto pronto). */
export function descreverRegraPrazo(regra: Pick<RegraTarefaGestao, 'prazoAncora' | 'prazoDias' | 'prazoUteis'>): string {
  const { prazoAncora: ancora, prazoDias: dias, prazoUteis } = regra;
  if (!ancora || ancora === 'FIXO') return 'Data informada pelo gestor';
  if (dias === undefined) return 'Sem regra de prazo';
  const unidade = prazoUteis ? ['dia útil', 'dias úteis'] : ['dia', 'dias'];
  if (ancora === 'VIGENCIA_FIM') {
    if (dias === 0) return 'No fim da vigência';
    return dias < 0 ? `D−${Math.abs(dias)} (${plural(Math.abs(dias), unidade[0], unidade[1])} antes do fim da vigência)` : `${plural(dias, unidade[0], unidade[1])} após o fim da vigência`;
  }
  if (dias === 0) return ancora === 'ANTERIOR' ? 'Junto com a tarefa anterior' : ancora === 'INICIO' ? 'Na assinatura' : 'Na data de partida';
  const sufixo = ancora === 'ANTERIOR' ? 'após a tarefa anterior' : ancora === 'INICIO' ? 'após a assinatura' : 'após a data de partida';
  return `${plural(dias, unidade[0], unidade[1])} ${sufixo}`;
}

/** Texto da regra mostrado ao gestor: o do modelo, se houver; senão, montado dos campos. */
export function textoRegraPrazo(regra: RegraTarefaGestao): string | undefined {
  if (regra.prazoTexto) return regra.prazoTexto;
  if (!regra.prazoAncora) return undefined;
  return descreverRegraPrazo(regra);
}

/** Texto do prazo de resposta (orientar). */
export function textoRegraResposta(regra: RegraTarefaGestao): string | undefined {
  if (regra.acao !== 'ORIENTAR') return undefined;
  if (regra.respostaTexto) return regra.respostaTexto;
  if (regra.respostaDias === undefined) return undefined;
  return `resposta em ${plural(regra.respostaDias, regra.respostaUteis === false ? 'dia' : 'dia útil', regra.respostaUteis === false ? 'dias' : 'dias úteis')}`;
}

export function formatarEsforco(min?: number): string | undefined {
  if (!min) return undefined;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h}h${String(resto).padStart(2, '0')}` : `${h}h`;
}

interface TarefaComAndamento extends RegraTarefaGestao, AndamentoTarefaGestao {
  status: string;
  prazo?: string;
}

const aberta = (status: string) => status !== 'CONCLUIDA' && status !== 'NAO_APLICAVEL';

/** Pedido enviado e resposta ainda não registrada (orientar). */
export function aguardandoResposta(t: TarefaComAndamento): boolean {
  return aberta(t.status) && !!t.pedidoEnviadoEm && !t.respostaEm;
}

/**
 * Data que vale para os avisos: depois que o pedido sai, o que importa é a resposta esperada,
 * não a data de envio (senão a tarefa aparece atrasada com o pedido já feito).
 */
export function prazoEfetivo(t: TarefaComAndamento): string | undefined {
  if (aguardandoResposta(t) && t.prazoResposta) return t.prazoResposta;
  return t.prazo;
}

/** Grupos dos contadores do plano (protótipo aprovado, D10). */
export type GrupoTarefa = 'COMIGO' | 'COBRAR' | 'AGUARDANDO' | 'FONTE' | 'FEITA';

export const GRUPO_INFO: Record<Exclude<GrupoTarefa, 'FEITA'>, { rotulo: string; descricao: string }> = {
  COMIGO: { rotulo: 'Comigo agora', descricao: 'fazer, orientar, conferir, disponibilizar ou lançar' },
  COBRAR: { rotulo: 'Cobrar resposta', descricao: 'pedido com prazo de resposta vencido' },
  AGUARDANDO: { rotulo: 'Aguardando resposta', descricao: 'pedido enviado, dentro do prazo' },
  FONTE: { rotulo: 'Fecha sozinha', descricao: 'outra unidade faz: nota de empenho, pagamento' }
};

export function grupoDaTarefa(t: TarefaComAndamento): GrupoTarefa {
  if (!aberta(t.status)) return 'FEITA';
  if (aguardandoResposta(t)) {
    const resposta = t.prazoResposta ? parseDateBRT(t.prazoResposta) : null;
    return resposta && differenceInBusinessDays(resposta) < 0 ? 'COBRAR' : 'AGUARDANDO';
  }
  if (t.acao === 'ACOMPANHAR') return 'FONTE';
  return 'COMIGO';
}

/** Rótulo da lista conforme a ação. */
export function rotuloLista(acao?: AcaoGestor): string {
  if (acao === 'ORIENTAR') return 'O que pedir';
  if (acao === 'CONFERIR') return 'O que conferir';
  if (acao === 'LANCAR') return 'O que lançar';
  return 'Itens';
}

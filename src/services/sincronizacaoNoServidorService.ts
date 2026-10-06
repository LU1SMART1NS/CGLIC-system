/**
 * Pedido de atualização ao servidor: o botão "Atualizar" do coordenador chama a Edge Function
 * sincronizar-fontes (a mesma que o agendamento do banco chama de hora em hora) em vez de sincronizar no
 * navegador. A função responde na hora ("aceito") e continua em segundo plano; este módulo então espera,
 * lendo a situação em sincronizacao_fontes, até a execução terminar.
 *
 * Só o coordenador consegue: a função confere o perfil do token da sessão e recusa os demais (403).
 */
import { supabase } from './supabaseClient';
import { fetchSincronizacaoStatus, type RecursoSincronizado } from './sincronizacaoFontesService';

export const FUNCAO_DE_SINCRONIZACAO = 'sincronizar-fontes';

/** Intervalo entre as leituras da situação enquanto espera a execução terminar. */
export const INTERVALO_DA_ESPERA_MS = 3000;
/** Se nada começou em tanto tempo, a trava estava com outra execução (ou o pedido não foi aceito): para de esperar. */
export const ESPERA_PARA_COMECAR_MS = 30_000;
/** Limite da espera total (a função tem no máximo 150 s por execução). */
export const ESPERA_MAXIMA_MS = 170_000;

export interface ResultadoDaAtualizacao {
  /** A execução começou e terminou enquanto esperávamos. */
  concluiu: boolean;
  /** Por que parou de esperar sem concluir. */
  motivo?: 'nao-iniciou' | 'tempo';
}

interface DependenciasDaEspera {
  esperar: (ms: number) => Promise<void>;
  lerSituacao: typeof fetchSincronizacaoStatus;
  pedir: (recurso: RecursoSincronizado, uasg: string) => Promise<void>;
  agora: () => number;
}

/** Mensagem legível do erro da função (a resposta HTTP traz { erro } no corpo). */
export async function mensagemDoErroDaFuncao(erro: unknown): Promise<string> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (contexto instanceof Response) {
    if (contexto.status === 403) return 'Só o coordenador pode atualizar os dados com as fontes oficiais.';
    if (contexto.status === 401) return 'Sessão expirada. Entre de novo para atualizar.';
    try {
      const corpo = (await contexto.clone().json()) as { erro?: string };
      if (corpo?.erro) return corpo.erro;
    } catch {
      /* corpo que não é JSON: cai na mensagem genérica */
    }
    return `A função de sincronização respondeu ${contexto.status}.`;
  }
  const texto = erro instanceof Error ? erro.message : String(erro);
  return /failed to fetch|network|load failed/i.test(texto)
    ? 'Sem conexão com o servidor de sincronização. Tente novamente em instantes.'
    : texto;
}

/** Pede à função uma sincronização forçada. Lança Error com mensagem legível se ela recusar. */
export async function pedirSincronizacaoForcada(recurso: RecursoSincronizado, uasg: string): Promise<void> {
  if (!supabase) throw new Error('Banco de dados não configurado.');
  const { error } = await supabase.functions.invoke(FUNCAO_DE_SINCRONIZACAO, {
    body: { recurso, ...(recurso === 'saldos_itens' ? {} : { uasg }), forcar: true }
  });
  if (error) throw new Error(await mensagemDoErroDaFuncao(error));
}

const DEPENDENCIAS_PADRAO: DependenciasDaEspera = {
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  lerSituacao: fetchSincronizacaoStatus,
  pedir: pedirSincronizacaoForcada,
  agora: () => Date.now()
};

/**
 * Pede a atualização forçada do recurso nas UASGs informadas e espera terminar.
 * Terminou = a última tentativa da UASG mudou desde o pedido e não há execução em andamento. Compara a
 * própria tentativa gravada no banco, sem usar o relógio do navegador.
 * Lança Error se a função recusar o pedido (por exemplo, quem chamou não é o coordenador).
 */
export async function atualizarNoServidor(
  recurso: RecursoSincronizado,
  uasgs: readonly string[],
  deps: DependenciasDaEspera = DEPENDENCIAS_PADRAO
): Promise<ResultadoDaAtualizacao> {
  const antes = new Map((await deps.lerSituacao(recurso)).map((s) => [s.uasg, s.ultimaTentativaEm]));
  await Promise.all(uasgs.map((uasg) => deps.pedir(recurso, uasg)));

  const inicio = deps.agora();
  let algumaComecou = false;
  for (;;) {
    await deps.esperar(INTERVALO_DA_ESPERA_MS);
    const situacao = new Map((await deps.lerSituacao(recurso)).map((s) => [s.uasg, s]));
    const estados = uasgs.map((uasg) => {
      const atual = situacao.get(uasg);
      const mudou = (atual?.ultimaTentativaEm ?? null) !== (antes.get(uasg) ?? null);
      return { emAndamento: Boolean(atual?.emAndamentoDesde), mudou };
    });
    if (estados.some((e) => e.emAndamento || e.mudou)) algumaComecou = true;
    if (estados.every((e) => e.mudou && !e.emAndamento)) return { concluiu: true };

    const decorrido = deps.agora() - inicio;
    if (!algumaComecou && decorrido >= ESPERA_PARA_COMECAR_MS) return { concluiu: false, motivo: 'nao-iniciou' };
    if (decorrido >= ESPERA_MAXIMA_MS) return { concluiu: false, motivo: 'tempo' };
  }
}

/**
 * Executa um pedido de sincronização no servidor, reaproveitando os mesmos serviços que o app usa:
 * a lógica de consulta, junção e gravação é única (src/services), e este módulo só escolhe qual rodar.
 */
import { UASGS_CGLIC } from '../../src/config/unidadesGestoras';
import { buscarContratosNasFontes } from '../../src/services/contractService';
import { sincronizarContratos } from '../../src/services/contratosOficiaisService';
import { fetchArpsDasFontes } from '../../src/services/api';
import { JANELA_VIGENCIA_ATAS, sincronizarAtas } from '../../src/services/syncService';
import { sincronizarSaldosItens } from '../../src/services/saldosItensSyncService';
import type { ResultadoSincronizacao } from '../../src/services/sincronizacaoFontesService';

/**
 * Tempo máximo para consultar itens de atas numa execução. A Edge Function tem no máximo 150 s (plano
 * gratuito) e precisa de folga para gravar e concluir a sincronização; o que não couber fica para a próxima.
 */
export const ORCAMENTO_DE_TEMPO_MS = 100_000;

export const RECURSOS_DO_SERVIDOR = ['contratos', 'atas', 'saldos_itens'] as const;
export type RecursoDoServidor = (typeof RECURSOS_DO_SERVIDOR)[number];

export interface PedidoDeSincronizacao {
  recurso: RecursoDoServidor;
  /** Obrigatória para contratos e atas; saldos_itens vale para todas as carteiras. */
  uasg?: string;
  /** Ignora a validade (só o coordenador). */
  forcar?: boolean;
  /** Só consulta as fontes e conta, sem gravar nada: serve para testar o acesso do servidor às fontes. */
  dry?: boolean;
}

export type ResultadoDaExecucao =
  | { dry: false; recurso: RecursoDoServidor; uasg?: string; duracaoMs: number; resultado: ResultadoSincronizacao }
  | { dry: true; recurso: RecursoDoServidor; uasg?: string; duracaoMs: number; consulta: Record<string, unknown> };

export interface DependenciasDeExecucao {
  sincronizarContratos: typeof sincronizarContratos;
  sincronizarAtas: typeof sincronizarAtas;
  sincronizarSaldosItens: typeof sincronizarSaldosItens;
  buscarContratosNasFontes: typeof buscarContratosNasFontes;
  fetchArpsDasFontes: typeof fetchArpsDasFontes;
  agora: () => number;
}

const PADRAO: DependenciasDeExecucao = {
  sincronizarContratos,
  sincronizarAtas,
  sincronizarSaldosItens,
  buscarContratosNasFontes,
  fetchArpsDasFontes,
  agora: () => Date.now()
};

/** Valida o corpo recebido. Devolve o pedido ou o motivo da recusa. */
export function validarPedido(corpo: unknown): { ok: true; pedido: PedidoDeSincronizacao } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== 'object') return { ok: false, erro: 'Corpo da requisição ausente ou inválido.' };
  const { recurso, uasg, forcar, dry } = corpo as Record<string, unknown>;
  if (typeof recurso !== 'string' || !(RECURSOS_DO_SERVIDOR as readonly string[]).includes(recurso)) {
    return { ok: false, erro: `Recurso inválido. Use: ${RECURSOS_DO_SERVIDOR.join(', ')}.` };
  }
  if (recurso !== 'saldos_itens') {
    if (typeof uasg !== 'string' || !UASGS_CGLIC.includes(uasg.trim())) {
      return { ok: false, erro: `UASG inválida. Use: ${UASGS_CGLIC.join(', ')}.` };
    }
  }
  return {
    ok: true,
    pedido: {
      recurso: recurso as RecursoDoServidor,
      uasg: typeof uasg === 'string' ? uasg.trim() : undefined,
      forcar: forcar === true,
      dry: dry === true
    }
  };
}

export async function executarPedido(
  pedido: PedidoDeSincronizacao,
  deps: DependenciasDeExecucao = PADRAO
): Promise<ResultadoDaExecucao> {
  const inicio = deps.agora();
  const uasg = pedido.uasg;
  const base = { recurso: pedido.recurso, uasg };

  if (pedido.dry) {
    let consulta: Record<string, unknown>;
    if (pedido.recurso === 'contratos') {
      const { contracts, fontesComFalha } = await deps.buscarContratosNasFontes(uasg as string);
      consulta = { contratos: contracts.length, fontesComFalha };
    } else if (pedido.recurso === 'atas') {
      const atas = await deps.fetchArpsDasFontes({
        ...JANELA_VIGENCIA_ATAS,
        codigoUnidadeGerenciadora: uasg as string,
        numeroAtaRegistroPreco: ''
      });
      consulta = { atas: atas.length };
    } else {
      consulta = { observacao: 'saldos_itens não tem consulta de teste; usa os contratos e as atas já gravados.' };
    }
    return { ...base, dry: true, duracaoMs: deps.agora() - inicio, consulta };
  }

  let resultado: ResultadoSincronizacao;
  if (pedido.recurso === 'contratos') resultado = await deps.sincronizarContratos(uasg as string, { forcar: pedido.forcar });
  else if (pedido.recurso === 'atas') resultado = await deps.sincronizarAtas(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  else resultado = await deps.sincronizarSaldosItens({ forcar: pedido.forcar });
  return { ...base, dry: false, duracaoMs: deps.agora() - inicio, resultado };
}

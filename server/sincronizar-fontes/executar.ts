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
import { sincronizarEmpenhosDaCarteira, selecionarContratos, contratosComEmpenhoAPagar } from '../../src/services/empenhosCarteiraService';
import { fetchContratosOficiaisDoBanco } from '../../src/services/contratosOficiaisService';
import { fetchContratosGovEmpenhos, fetchContratosGovFaturas, fetchOrdensBancariasDaNp } from '../../src/services/api';
import { sincronizarFaturasDaCarteira, sincronizarOrdensBancariasDaCarteira } from '../../src/services/faturasService';
import {
  contarItensContratosPendentes,
  ORCAMENTO_ITENS_CONTRATOS_MS,
  sincronizarItensContratos
} from '../../src/services/itensContratosSyncService';
import {
  contarUnidadesItensPendentes,
  ORCAMENTO_UNIDADES_ITENS_MS,
  sincronizarUnidadesItens
} from '../../src/services/unidadesItensSyncService';
import type { ResultadoSincronizacao } from '../../src/services/sincronizacaoFontesService';

/**
 * Tempo máximo para consultar itens de atas numa execução. A Edge Function tem no máximo 150 s (plano
 * gratuito) e precisa de folga para gravar e concluir a sincronização; o que não couber fica para a próxima.
 */
export const ORCAMENTO_DE_TEMPO_MS = 100_000;

export const RECURSOS_DO_SERVIDOR = ['contratos', 'atas', 'saldos_itens', 'itens_contratos', 'unidades_itens', 'empenhos', 'faturas', 'ordens_bancarias'] as const;
export type RecursoDoServidor = (typeof RECURSOS_DO_SERVIDOR)[number];

export interface PedidoDeSincronizacao {
  recurso: RecursoDoServidor;
  /** Obrigatória para todos os recursos, exceto saldos_itens, que vale para todas as carteiras. */
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
  sincronizarEmpenhosDaCarteira: typeof sincronizarEmpenhosDaCarteira;
  /** Teste de acesso (dry) dos empenhos: contratos elegíveis da carteira e a lista de um deles. */
  consultarEmpenhosDeTeste: (uasg: string) => Promise<Record<string, unknown>>;
  sincronizarFaturasDaCarteira: typeof sincronizarFaturasDaCarteira;
  sincronizarOrdensBancariasDaCarteira: typeof sincronizarOrdensBancariasDaCarteira;
  /** Teste de acesso (dry) de faturas e ordens bancárias: lê um contrato e uma NP, sem gravar. */
  consultarFaturasDeTeste: (uasg: string) => Promise<Record<string, unknown>>;
  sincronizarItensContratos: typeof sincronizarItensContratos;
  contarItensContratosPendentes: typeof contarItensContratosPendentes;
  sincronizarUnidadesItens: typeof sincronizarUnidadesItens;
  contarUnidadesItensPendentes: typeof contarUnidadesItensPendentes;
  buscarContratosNasFontes: typeof buscarContratosNasFontes;
  fetchArpsDasFontes: typeof fetchArpsDasFontes;
  agora: () => number;
}

/** Teste de acesso dos empenhos, sem gravar: quantos contratos entram e se o Contratos.gov.br responde. */
async function consultarEmpenhosDeTeste(uasg: string): Promise<Record<string, unknown>> {
  const carteira = await fetchContratosOficiaisDoBanco(uasg);
  const elegiveis = selecionarContratos([carteira], {
    hoje: new Date().toISOString().slice(0, 10),
    comEmpenhoAPagar: await contratosComEmpenhoAPagar()
  });
  const amostra = elegiveis.find((c) => /^\d+$/.test(String(c.contratoId ?? '')));
  const empenhosDaAmostra = amostra ? (await fetchContratosGovEmpenhos(amostra.contratoId as string | number)).length : null;
  return { carteira: carteira.length, elegiveis: elegiveis.length, amostra: amostra?.id ?? null, empenhosDaAmostra };
}

/** Teste de acesso de faturas e OBs, sem gravar: faturas de um contrato elegível e as OBs de uma NP delas. */
async function consultarFaturasDeTeste(uasg: string): Promise<Record<string, unknown>> {
  const carteira = await fetchContratosOficiaisDoBanco(uasg);
  const elegiveis = selecionarContratos([carteira], {
    hoje: new Date().toISOString().slice(0, 10),
    comEmpenhoAPagar: await contratosComEmpenhoAPagar()
  });
  for (const c of elegiveis.slice(0, 20)) {
    if (!/^\d+$/.test(String(c.contratoId ?? ''))) continue;
    const faturas = await fetchContratosGovFaturas(c.contratoId as string | number);
    const np = faturas.map((f) => String(f?.sfadrao_id ?? '')).find((n) => /^\d{4}NP\d{6}$/.test(n));
    if (!np) continue;
    const obs = await fetchOrdensBancariasDaNp(uasg, np);
    return { elegiveis: elegiveis.length, amostra: c.id, faturas: faturas.length, np, ordensBancarias: obs.length };
  }
  return { elegiveis: elegiveis.length, amostra: null, observacao: 'Nenhum dos 20 primeiros contratos tem fatura com NP.' };
}

const PADRAO: DependenciasDeExecucao = {
  sincronizarContratos,
  sincronizarAtas,
  sincronizarSaldosItens,
  sincronizarEmpenhosDaCarteira,
  consultarEmpenhosDeTeste,
  sincronizarFaturasDaCarteira,
  sincronizarOrdensBancariasDaCarteira,
  consultarFaturasDeTeste,
  sincronizarItensContratos,
  contarItensContratosPendentes,
  sincronizarUnidadesItens,
  contarUnidadesItensPendentes,
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
    } else if (pedido.recurso === 'itens_contratos') {
      consulta = { ...(await deps.contarItensContratosPendentes(uasg as string)) };
    } else if (pedido.recurso === 'unidades_itens') {
      consulta = { ...(await deps.contarUnidadesItensPendentes(uasg as string)) };
    } else if (pedido.recurso === 'empenhos') {
      consulta = await deps.consultarEmpenhosDeTeste(uasg as string);
    } else if (pedido.recurso === 'faturas' || pedido.recurso === 'ordens_bancarias') {
      consulta = await deps.consultarFaturasDeTeste(uasg as string);
    } else {
      consulta = { observacao: 'saldos_itens não tem consulta de teste; usa os contratos e as atas já gravados.' };
    }
    return { ...base, dry: true, duracaoMs: deps.agora() - inicio, consulta };
  }

  let resultado: ResultadoSincronizacao;
  if (pedido.recurso === 'contratos') resultado = await deps.sincronizarContratos(uasg as string, { forcar: pedido.forcar });
  else if (pedido.recurso === 'atas') resultado = await deps.sincronizarAtas(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  else if (pedido.recurso === 'itens_contratos') {
    resultado = await deps.sincronizarItensContratos(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_ITENS_CONTRATOS_MS });
  } else if (pedido.recurso === 'unidades_itens') {
    resultado = await deps.sincronizarUnidadesItens(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_UNIDADES_ITENS_MS });
  } else if (pedido.recurso === 'empenhos') {
    resultado = await deps.sincronizarEmpenhosDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else if (pedido.recurso === 'faturas') {
    resultado = await deps.sincronizarFaturasDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else if (pedido.recurso === 'ordens_bancarias') {
    resultado = await deps.sincronizarOrdensBancariasDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else resultado = await deps.sincronizarSaldosItens({ forcar: pedido.forcar });
  return { ...base, dry: false, duracaoMs: deps.agora() - inicio, resultado };
}

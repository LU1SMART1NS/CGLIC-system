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
import {
  ORCAMENTO_ATAS_PARTICIPACAO_MS,
  sincronizarAtasParticipacao,
  testarAtasParticipacao
} from '../../src/services/atasParticipacaoSyncService';
import {
  contarContratosParticipantesPendentes,
  ORCAMENTO_CONTRATOS_PARTICIPANTES_MS,
  sincronizarContratosParticipantes
} from '../../src/services/contratosParticipantesSyncService';
import {
  contarCadastroUasgsPendentes,
  ORCAMENTO_CADASTRO_UASGS_MS,
  sincronizarCadastroUasgs
} from '../../src/services/cadastroUasgsSyncService';
import {
  contarItensNotasSiafiPendentes,
  ORCAMENTO_ITENS_NOTAS_SIAFI_MS,
  sincronizarItensNotasSiafi
} from '../../src/services/itensNotasSiafiSyncService';
import {
  contarSaldoContabilPendentes,
  ORCAMENTO_SALDO_CONTABIL_MS,
  sincronizarSaldoContabil
} from '../../src/services/saldoContabilSyncService';
import { contarAutoresEmendas, sincronizarAutoresEmendas } from '../../src/services/autoresEmendasSyncService';
import {
  contarNotasEmendasTesouroPendentes,
  ORCAMENTO_NOTAS_EMENDAS_TESOURO_MS,
  sincronizarNotasDasEmendasDoTesouro
} from '../../src/services/notasEmendasTesouroSyncService';
import {
  contarExecucaoEmendasPendentes,
  ORCAMENTO_EXECUCAO_EMENDAS_MS,
  sincronizarExecucaoDasEmendas
} from '../../src/services/execucaoEmendasPortalSyncService';
import {
  contarReajusteAtasPendentes,
  ORCAMENTO_REAJUSTE_ATAS_MS,
  sincronizarReajusteAtas
} from '../../src/services/reajusteAtasSyncService';
import { criarLeitorDeArquivos } from './leitorDeArquivos';
import { medirEmendasDoPortal } from '../../src/services/emendasPortalService';
import type { ResultadoSincronizacao } from '../../src/services/sincronizacaoFontesService';
import { lerAmbiente } from './ambiente';

/**
 * Tempo máximo para consultar itens de atas numa execução. A Edge Function tem no máximo 150 s (plano
 * gratuito) e precisa de folga para gravar e concluir a sincronização; o que não couber fica para a próxima.
 */
export const ORCAMENTO_DE_TEMPO_MS = 100_000;

export const RECURSOS_DO_SERVIDOR = ['contratos', 'atas', 'saldos_itens', 'itens_contratos', 'unidades_itens', 'atas_participacao', 'contratos_participantes', 'empenhos', 'faturas', 'ordens_bancarias', 'cadastro_uasgs', 'itens_notas_siafi', 'saldo_contabil', 'autores_emendas', 'emendas_portal', 'reajuste_atas', 'notas_emendas_tesouro', 'execucao_emendas'] as const;
export type RecursoDoServidor = (typeof RECURSOS_DO_SERVIDOR)[number];

export interface PedidoDeSincronizacao {
  recurso: RecursoDoServidor;
  /** Obrigatória para todos os recursos, exceto saldos_itens, cadastro_uasgs, autores_emendas, reajuste_atas, notas_emendas_tesouro e execucao_emendas, que valem para todas as carteiras. */
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
  sincronizarAtasParticipacao: typeof sincronizarAtasParticipacao;
  /** Teste sem gravar das atas em que a SENASP participa: faz a descoberta inteira dentro do orçamento. */
  testarAtasParticipacao: typeof testarAtasParticipacao;
  sincronizarContratosParticipantes: typeof sincronizarContratosParticipantes;
  contarContratosParticipantesPendentes: typeof contarContratosParticipantesPendentes;
  sincronizarCadastroUasgs: typeof sincronizarCadastroUasgs;
  contarCadastroUasgsPendentes: typeof contarCadastroUasgsPendentes;
  sincronizarItensNotasSiafi: typeof sincronizarItensNotasSiafi;
  contarItensNotasSiafiPendentes: typeof contarItensNotasSiafiPendentes;
  sincronizarSaldoContabil: typeof sincronizarSaldoContabil;
  contarSaldoContabilPendentes: typeof contarSaldoContabilPendentes;
  /** Deputados e senadores das emendas (Câmara e Senado), uma vez por semana. */
  sincronizarAutoresEmendas: typeof sincronizarAutoresEmendas;
  contarAutoresEmendas: typeof contarAutoresEmendas;
  /** Reajuste das atas: índices, editais, apostilamentos e preço homologado (migrations 158 e 159). */
  sincronizarReajusteAtas: typeof sincronizarReajusteAtas;
  contarReajusteAtasPendentes: typeof contarReajusteAtasPendentes;
  /** Notas das emendas citadas no SEI que só o Tesouro tem (migration 184), uma vez por dia. */
  sincronizarNotasDasEmendasDoTesouro: typeof sincronizarNotasDasEmendasDoTesouro;
  contarNotasEmendasTesouroPendentes: typeof contarNotasEmendasTesouroPendentes;
  /** Medição da API de emendas do Portal da Transparência (só em modo de teste: não grava nada). */
  medirEmendasDoPortal: typeof medirEmendasDoPortal;
  /** Execução de cada emenda dos pedidos pelo Portal da Transparência (migration 204), uma vez por dia. */
  sincronizarExecucaoDasEmendas: typeof sincronizarExecucaoDasEmendas;
  contarExecucaoEmendasPendentes: typeof contarExecucaoEmendasPendentes;
  /** Chave da API do Portal da Transparência (segredo PORTAL_TRANSPARENCIA_CHAVE da Edge Function). */
  chaveDoPortal: () => string | undefined;
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
  sincronizarAtasParticipacao,
  testarAtasParticipacao,
  sincronizarContratosParticipantes,
  contarContratosParticipantesPendentes,
  sincronizarCadastroUasgs,
  contarCadastroUasgsPendentes,
  sincronizarItensNotasSiafi,
  contarItensNotasSiafiPendentes,
  sincronizarSaldoContabil,
  contarSaldoContabilPendentes,
  sincronizarAutoresEmendas,
  contarAutoresEmendas,
  sincronizarReajusteAtas,
  contarReajusteAtasPendentes,
  sincronizarNotasDasEmendasDoTesouro,
  contarNotasEmendasTesouroPendentes,
  medirEmendasDoPortal,
  sincronizarExecucaoDasEmendas,
  contarExecucaoEmendasPendentes,
  chaveDoPortal: () => lerAmbiente('PORTAL_TRANSPARENCIA_CHAVE')?.trim() || undefined,
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
  if (recurso !== 'saldos_itens' && recurso !== 'cadastro_uasgs' && recurso !== 'autores_emendas' && recurso !== 'emendas_portal' && recurso !== 'reajuste_atas' && recurso !== 'notas_emendas_tesouro' && recurso !== 'execucao_emendas') {
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
    } else if (pedido.recurso === 'atas_participacao') {
      consulta = { ...(await deps.testarAtasParticipacao(uasg as string, { orcamentoMs: ORCAMENTO_ATAS_PARTICIPACAO_MS })) };
    } else if (pedido.recurso === 'contratos_participantes') {
      consulta = { ...(await deps.contarContratosParticipantesPendentes(uasg as string)) };
    } else if (pedido.recurso === 'cadastro_uasgs') {
      consulta = { ...(await deps.contarCadastroUasgsPendentes()) };
    } else if (pedido.recurso === 'autores_emendas') {
      consulta = await deps.contarAutoresEmendas();
    } else if (pedido.recurso === 'reajuste_atas') {
      consulta = await deps.contarReajusteAtasPendentes();
    } else if (pedido.recurso === 'notas_emendas_tesouro') {
      consulta = await deps.contarNotasEmendasTesouroPendentes(deps.chaveDoPortal());
    } else if (pedido.recurso === 'execucao_emendas') {
      consulta = await deps.contarExecucaoEmendasPendentes(deps.chaveDoPortal());
    } else if (pedido.recurso === 'emendas_portal') {
      consulta = await deps.medirEmendasDoPortal({ chave: deps.chaveDoPortal(), orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
    } else if (pedido.recurso === 'itens_notas_siafi') {
      consulta = { ...(await deps.contarItensNotasSiafiPendentes(uasg as string, deps.chaveDoPortal())) };
    } else if (pedido.recurso === 'saldo_contabil') {
      consulta = await deps.contarSaldoContabilPendentes(uasg as string);
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
  } else if (pedido.recurso === 'atas_participacao') {
    resultado = await deps.sincronizarAtasParticipacao(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_ATAS_PARTICIPACAO_MS });
  } else if (pedido.recurso === 'contratos_participantes') {
    resultado = await deps.sincronizarContratosParticipantes(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_CONTRATOS_PARTICIPANTES_MS });
  } else if (pedido.recurso === 'autores_emendas') {
    resultado = await deps.sincronizarAutoresEmendas({ forcar: pedido.forcar });
  } else if (pedido.recurso === 'reajuste_atas') {
    resultado = await deps.sincronizarReajusteAtas({ forcar: pedido.forcar, orcamentoMs: ORCAMENTO_REAJUSTE_ATAS_MS, leitor: criarLeitorDeArquivos() });
  } else if (pedido.recurso === 'notas_emendas_tesouro') {
    resultado = await deps.sincronizarNotasDasEmendasDoTesouro({ forcar: pedido.forcar, orcamentoMs: ORCAMENTO_NOTAS_EMENDAS_TESOURO_MS, chave: deps.chaveDoPortal() });
  } else if (pedido.recurso === 'execucao_emendas') {
    resultado = await deps.sincronizarExecucaoDasEmendas({ forcar: pedido.forcar, orcamentoMs: ORCAMENTO_EXECUCAO_EMENDAS_MS, chave: deps.chaveDoPortal() });
  } else if (pedido.recurso === 'emendas_portal') {
    // Medição: só existe em modo de teste (dry); não há o que gravar.
    resultado = { status: 'ERRO', erro: 'emendas_portal só roda em modo de teste (dry).' };
  } else if (pedido.recurso === 'cadastro_uasgs') {
    resultado = await deps.sincronizarCadastroUasgs({ forcar: pedido.forcar, orcamentoMs: ORCAMENTO_CADASTRO_UASGS_MS });
  } else if (pedido.recurso === 'itens_notas_siafi') {
    resultado = await deps.sincronizarItensNotasSiafi(uasg as string, {
      chave: deps.chaveDoPortal(),
      forcar: pedido.forcar,
      orcamentoMs: ORCAMENTO_ITENS_NOTAS_SIAFI_MS
    });
  } else if (pedido.recurso === 'saldo_contabil') {
    resultado = await deps.sincronizarSaldoContabil(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_SALDO_CONTABIL_MS });
  } else if (pedido.recurso === 'empenhos') {
    resultado = await deps.sincronizarEmpenhosDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else if (pedido.recurso === 'faturas') {
    resultado = await deps.sincronizarFaturasDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else if (pedido.recurso === 'ordens_bancarias') {
    resultado = await deps.sincronizarOrdensBancariasDaCarteira(uasg as string, { forcar: pedido.forcar, orcamentoMs: ORCAMENTO_DE_TEMPO_MS });
  } else resultado = await deps.sincronizarSaldosItens({ forcar: pedido.forcar });
  return { ...base, dry: false, duracaoMs: deps.agora() - inicio, resultado };
}

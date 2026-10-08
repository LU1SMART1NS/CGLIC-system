/**
 * Situação da sincronização dos empenhos de cada contrato (tabela contrato_empenhos_sincronizacao,
 * migration 80).
 *
 * Separa, para quem olha o contrato, "a fonte respondeu que não há empenho" de "a consulta falhou"
 * e de "nunca foi consultado". A sincronização em si continua em empenhoOrchestrationService; este
 * módulo só a executa, traduz o resultado e o registra.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { orchestrateContractEmpenhoSync, contratoIdValido } from './empenhoOrchestrationService';
import { parseNumeroControlePncpContrato } from './pncpContratoService';
import { fetchContratoContratosGov, mesclarContratosGov } from './contratosGovContratoService';
import { persistirContratoCompletado } from './contratosOficiaisService';
import { chaveDoContrato } from '../utils/contractKeyUtils';
import type { ContractTarget, OrchestrationResult } from '../types/empenhoSync';
import type { ContractDashboardRecord } from '../types';

export type SituacaoSincronizacaoEmpenhos = 'OK' | 'SEM_EMPENHOS' | 'PARCIAL' | 'ERRO';

export interface SincronizacaoEmpenhosContrato {
  contractKey: string;
  situacao: SituacaoSincronizacaoEmpenhos;
  mensagem: string | null;
  empenhosLidos: number;
  empenhosGravados: number;
  vinculosGravados: number;
  /** Última tentativa, com qualquer resultado. */
  tentativaEm: string;
  /** Última vez em que a fonte respondeu e tudo foi gravado (OK ou SEM_EMPENHOS). */
  ultimoSucessoEm: string | null;
}

/** Traduz o status da orquestração para a situação gravada no banco. */
export function situacaoDoResultado(result: Pick<OrchestrationResult, 'status'>): SituacaoSincronizacaoEmpenhos {
  switch (result.status) {
    case 'SUCESSO':
    case 'COM_DIVERGENCIAS':
      return 'OK';
    case 'SEM_DADOS':
      return 'SEM_EMPENHOS';
    case 'SUCESSO_PARCIAL':
      return 'PARCIAL';
    case 'ERRO':
    default:
      return 'ERRO';
  }
}

/** Primeira mensagem de erro do resultado: da consulta às fontes, depois da gravação. */
export function mensagemDoResultado(result: Pick<OrchestrationResult, 'erros' | 'resumo_sync'>): string | undefined {
  const daFonte = result.erros?.find((e) => e.erro)?.erro;
  if (daFonte) return daFonte;
  return result.resumo_sync?.erros?.find((e) => e.erro)?.erro;
}

/** Pendências da conferência com o PNCP (empenho no PNCP e não no Contratos.gov.br, ou conferência não feita). */
export function pendenciasPncp(result: Pick<OrchestrationResult, 'pendencias'>): string[] {
  return (result.pendencias ?? []).filter((p) => p.contexto?.fonte === 'PNCP').map((p) => p.motivo);
}

/** Aviso dos vínculos removidos porque o Contratos.gov.br não lista mais as NEs no contrato. */
export function avisoVinculosRemovidos(result: Pick<OrchestrationResult, 'vinculos_contrato_removidos' | 'vinculos_removidos_numeros'>): string | undefined {
  const n = result.vinculos_contrato_removidos ?? 0;
  if (n <= 0) return undefined;
  const numeros = (result.vinculos_removidos_numeros ?? []).join(', ');
  return `${n} empenho(s) desvinculado(s) porque o Contratos.gov.br não os lista mais neste contrato${numeros ? `: ${numeros}` : ''}.`;
}

/** Aviso das NEs que a fonte lista no contrato, mas a equipe descartou (não foram vinculadas). */
export function avisoEmpenhosDescartados(result: Pick<OrchestrationResult, 'vinculos_ignorados_numeros'>): string | undefined {
  const numeros = result.vinculos_ignorados_numeros ?? [];
  if (numeros.length === 0) return undefined;
  return numeros.length === 1
    ? `O Contratos.gov.br lista ${numeros[0]} neste contrato, mas a equipe a descartou; ela continua fora do contrato.`
    : `O Contratos.gov.br lista ${numeros.length} empenhos neste contrato que a equipe descartou (${numeros.join(', ')}); eles continuam fora do contrato.`;
}

/**
 * Mensagem gravada com a situação: o erro, se houver; senão, os avisos (vínculos removidos, empenhos
 * descartados pela equipe e conferência com o PNCP).
 */
export function mensagemParaRegistro(
  result: Pick<OrchestrationResult, 'erros' | 'resumo_sync' | 'pendencias' | 'vinculos_contrato_removidos' | 'vinculos_removidos_numeros' | 'vinculos_ignorados_numeros'>
): string | undefined {
  const erro = mensagemDoResultado(result);
  if (erro) return erro;
  const avisos = [avisoVinculosRemovidos(result), avisoEmpenhosDescartados(result), ...pendenciasPncp(result)].filter(Boolean);
  return avisos.length > 0 ? avisos.join(' ') : undefined;
}

/**
 * Erro que vale tentar de novo: a fonte não respondeu, respondeu com limite de requisições ou erro
 * do servidor, ou a rede falhou. Contrato sem id do Contratos.gov.br não muda numa nova tentativa.
 */
export function falhaTransitoria(result: Pick<OrchestrationResult, 'erros'>): boolean {
  return (result.erros ?? []).some(
    (e) =>
      (e.origem === 'CONTRATOSNET' || e.origem === 'PNCP') &&
      /não respondeu em|falha de rede|respondeu (429|5\d\d)/i.test(e.erro || '')
  );
}

/**
 * Grava a situação da sincronização do contrato. Nunca lança: a sincronização já aconteceu e não
 * deve ser apresentada como falha só porque o registro não foi gravado (ex.: migration 80 ainda não
 * aplicada). Devolve se gravou.
 */
export async function registrarSincronizacaoEmpenhos(contractKey: string, result: OrchestrationResult): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return false;
  const { error } = await supabase.rpc('registrar_sincronizacao_empenhos_contrato', {
    p_contract_key: contractKey,
    p_situacao: situacaoDoResultado(result),
    p_mensagem: mensagemParaRegistro(result) ?? null,
    p_empenhos_lidos: result.empenhos_encontrados ?? 0,
    p_empenhos_gravados: result.empenhos_persistidos ?? 0,
    p_vinculos_gravados: result.vinculos_contrato_criados ?? 0
  });
  if (error) {
    console.warn(`[contratoEmpenhosSincronizacao] Situação da sincronização de ${contractKey} não registrada:`, error);
    return false;
  }
  return true;
}

/** Resultado de erro para uma falha inesperada da orquestração (nada foi gravado). */
function resultadoDeErro(target: ContractTarget, erro: string): OrchestrationResult {
  return {
    alvo: target,
    status: 'ERRO',
    fontes_consultadas: [],
    fontes_nao_aplicaveis: [],
    empenhos_encontrados: 0,
    empenhos_persistidos: 0,
    empenhos_atualizados: 0,
    vinculos_item_criados: 0,
    vinculos_contrato_criados: 0,
    divergencias: [],
    pendencias: [],
    erros: [{ origem: 'ORCHESTRATOR', erro }],
    resumo_sync: {
      total_processados: 0,
      total_salvos: 0,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [],
      reconciliados: []
    },
    executado_em: new Date().toISOString()
  };
}

/**
 * Sincroniza os empenhos do contrato com as fontes oficiais e registra o resultado.
 * Não lança: uma falha inesperada vira resultado ERRO, também registrado.
 */
export async function sincronizarEmpenhosDoContrato(target: ContractTarget): Promise<OrchestrationResult> {
  let result: OrchestrationResult;
  try {
    result = await orchestrateContractEmpenhoSync(target);
  } catch (err: any) {
    result = resultadoDeErro(target, err?.message || 'Falha inesperada ao sincronizar os empenhos do contrato.');
  }
  await registrarSincronizacaoEmpenhos(target.contractKey, result);
  return result;
}

/** Parâmetros do PNCP a partir do id do contrato no PNCP ("cnpj-2-sequencial/ano"); sem ele, nenhum. */
export function pncpParamsDoContrato(numeroControlePncp?: string | null): ContractTarget['pncpParams'] {
  const p = parseNumeroControlePncpContrato(numeroControlePncp);
  return p ? { cnpj: p.cnpj, ano: p.ano, sequencialContrato: p.sequencial } : undefined;
}

/**
 * Alvo da sincronização a partir do registro do contrato: chave canônica, id do Contratos.gov.br (só
 * ele, nunca a chave no lugar), UASG do contrato (para o empenho sem UASG emitente) e PNCP pelo id do PNCP.
 */
export function alvoDoContrato(contract: ContractDashboardRecord, numeroControlePncp?: string | null): ContractTarget {
  return {
    tipo: 'CONTRATO',
    contractKey: chaveDoContrato(contract),
    contratoId: contratoIdValido(contract.contratoId) ? contract.contratoId : undefined,
    uasg: contract.uasg,
    pncpParams: pncpParamsDoContrato(numeroControlePncp ?? contract.numeroControlePncp)
  };
}

/**
 * Garante o id do Contratos.gov.br: se o registro não tem, busca o contrato avulso
 * (`/contrato/ugorigem/{uasg}/numeroano/{NNNNNAAAA}`) e grava o registro completado no banco, para a
 * próxima sincronização já ter o id. Lança se o Contratos.gov.br falhar; devolve o registro como
 * veio se o contrato não for encontrado (ou houver mais de um com o mesmo número).
 */
export async function completarIdContratosGov(contract: ContractDashboardRecord): Promise<ContractDashboardRecord> {
  if (contratoIdValido(contract.contratoId)) return contract;
  const gov = await fetchContratoContratosGov(contract);
  if (!gov || !contratoIdValido(gov.contratoId)) return contract;
  const completo = mesclarContratosGov(contract, gov);
  await persistirContratoCompletado(completo);
  return completo;
}

/**
 * Sincroniza os empenhos de um contrato a partir do registro dele: completa o id do Contratos.gov.br
 * se faltar, monta o alvo e registra o resultado. Não lança.
 */
export async function sincronizarEmpenhosDoRegistro(
  contract: ContractDashboardRecord,
  opts: { numeroControlePncp?: string | null } = {}
): Promise<{ target: ContractTarget; result: OrchestrationResult }> {
  let completo = contract;
  try {
    completo = await completarIdContratosGov(contract);
  } catch (err: any) {
    const target = alvoDoContrato(contract, opts.numeroControlePncp);
    const result = resultadoDeErro(
      target,
      `O id do contrato no Contratos.gov.br não pôde ser obtido: ${err?.message || 'a fonte não respondeu.'}`
    );
    result.erros[0].origem = 'CONTRATOSNET';
    await registrarSincronizacaoEmpenhos(target.contractKey, result);
    return { target, result };
  }
  const target = alvoDoContrato(completo, opts.numeroControlePncp);
  return { target, result: await sincronizarEmpenhosDoContrato(target) };
}

function mapRow(row: any): SincronizacaoEmpenhosContrato {
  return {
    contractKey: String(row.contract_key),
    situacao: row.situacao as SituacaoSincronizacaoEmpenhos,
    mensagem: row.mensagem ?? null,
    empenhosLidos: Number(row.empenhos_lidos ?? 0),
    empenhosGravados: Number(row.empenhos_gravados ?? 0),
    vinculosGravados: Number(row.vinculos_gravados ?? 0),
    tentativaEm: String(row.tentativa_em),
    ultimoSucessoEm: row.ultimo_sucesso_em ?? null
  };
}

/** Situação gravada para o contrato; null quando nunca foi sincronizado (ou a tabela não existe ainda). */
/** Contratos cujos empenhos já foram consultados com sucesso ao menos uma vez (ultimo_sucesso_em). */
export async function fetchContratosComEmpenhosConsultados(): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set();
  const { data, error } = await supabase.from('contrato_empenhos_sincronizacao').select('contract_key').not('ultimo_sucesso_em', 'is', null);
  if (error) {
    console.warn('[contratoEmpenhosSincronizacao] Lista de contratos consultados não lida:', error);
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => String(r.contract_key)));
}

export async function fetchSincronizacaoEmpenhos(contractKey: string): Promise<SincronizacaoEmpenhosContrato | null> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return null;
  const { data, error } = await supabase
    .from('contrato_empenhos_sincronizacao')
    .select('*')
    .eq('contract_key', contractKey)
    .maybeSingle();
  if (error) {
    console.warn(`[contratoEmpenhosSincronizacao] Situação de ${contractKey} não lida:`, error);
    return null;
  }
  return data ? mapRow(data) : null;
}

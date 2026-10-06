/**
 * Situação da sincronização dos empenhos de cada contrato (tabela contrato_empenhos_sincronizacao,
 * migration 80).
 *
 * Separa, para quem olha o contrato, "a fonte respondeu que não há empenho" de "a consulta falhou"
 * e de "nunca foi consultado". A sincronização em si continua em empenhoOrchestrationService; este
 * módulo só a executa, traduz o resultado e o registra.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { orchestrateContractEmpenhoSync } from './empenhoOrchestrationService';
import type { ContractTarget, OrchestrationResult } from '../types/empenhoSync';

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
    p_mensagem: mensagemDoResultado(result) ?? null,
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

/**
 * Contratos oficiais persistidos no Supabase (migration 72).
 *
 * As telas leem a lista de contratos do banco (`contratos_oficiais`), e não mais das APIs do governo
 * a cada carga. A sincronização com o Contratos.gov.br e o Compras.gov.br roda em segundo plano, uma
 * vez para todos os usuários: a trava em `sincronizacao_fontes` garante que só um navegador sincroniza
 * por vez e só quando os dados passaram da validade. O coordenador força a atualização pelo botão.
 *
 * Provisório: a sincronização roda no navegador de quem tem perfil de gravação (gestor/coordenador).
 * Ela vai para uma Edge Function agendada no item 2 do PLANO_PERSISTENCIA_CONTRATOS_E_CACHE.md.
 */

import type { ContractDashboardRecord } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  buscarContratosNasFontes,
  calculateStatusVigencia,
  fetchContractsForDashboard,
  ordenarContratos
} from './contractService';
import {
  executarComReserva,
  uasgsSincronizandoAgoraDe,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';

export {
  assinarSincronizacaoLocal,
  fetchSincronizacaoStatus,
  type ResultadoSincronizacao,
  type SincronizacaoFonteStatus
} from './sincronizacaoFontesService';

export const RECURSO_CONTRATOS = 'contratos' as const;
/** Validade da lista no banco: passado isso, a próxima abertura de quem pode gravar sincroniza. */
export const VALIDADE_CONTRATOS = VALIDADE_PADRAO;
/** O Supabase devolve no máximo 1000 linhas por consulta e corta o resto sem avisar. */
const PAGINA_LEITURA = 1000;
/** Contratos por chamada de gravação (a função aceita até 500). */
const LOTE_GRAVACAO = 100;

// ------------------------------------------------------------------------------
// Leitura
// ------------------------------------------------------------------------------

/** Registro gravado -> registro da tela. O status de vigência depende de hoje e é recalculado. */
export function registroParaContrato(registro: Record<string, any>): ContractDashboardRecord {
  return {
    ...(registro as ContractDashboardRecord),
    statusVigencia: calculateStatusVigencia(registro.dataVigenciaFim)
  };
}

/** Contratos da carteira (UASG) gravados no banco, em páginas. Lista vazia quando nada foi sincronizado. */
export async function fetchContratosOficiaisDoBanco(uasg: string): Promise<ContractDashboardRecord[]> {
  if (!supabase) return [];
  const cleanUasg = (uasg || '').trim();
  const contratos: ContractDashboardRecord[] = [];
  for (let from = 0; ; from += PAGINA_LEITURA) {
    const { data, error } = await supabase
      .from('contratos_oficiais')
      .select('registro')
      .eq('uasg', cleanUasg)
      .order('contract_key', { ascending: true })
      .range(from, from + PAGINA_LEITURA - 1);
    if (error) throw error;
    for (const row of data ?? []) contratos.push(registroParaContrato(row.registro));
    if (!data || data.length < PAGINA_LEITURA) break;
  }
  return ordenarContratos(contratos);
}

/**
 * Lista de contratos para as telas (queryFn de ['contracts-dashboard', uasg]).
 * Lê do banco. Só consulta as APIs do governo quando o banco ainda não tem a carteira (antes da
 * primeira sincronização) ou não respondeu.
 */
export async function fetchContratosParaTela(uasg: string): Promise<ContractDashboardRecord[]> {
  const cleanUasg = (uasg || '').trim();
  if (!isSupabaseConfigured || !supabase) return fetchContractsForDashboard(cleanUasg, false);
  try {
    const doBanco = await fetchContratosOficiaisDoBanco(cleanUasg);
    if (doBanco.length > 0) return doBanco;
  } catch (err) {
    console.warn(`[contratosOficiais] leitura do banco falhou para a UASG ${cleanUasg}; consultando as fontes oficiais.`, err);
  }
  return fetchContractsForDashboard(cleanUasg, false);
}

// ------------------------------------------------------------------------------
// Sincronização
// ------------------------------------------------------------------------------

/** UASGs sincronizando contratos neste navegador agora. */
export function uasgsSincronizandoAgora(): readonly string[] {
  return uasgsSincronizandoAgoraDe(RECURSO_CONTRATOS);
}

/** Corta o registro para gravação: o status de vigência não é gravado (recalculado na leitura). */
function registroParaGravar(contract: ContractDashboardRecord): Record<string, unknown> {
  const { statusVigencia: _status, ...resto } = contract;
  return resto;
}

/**
 * Sincroniza os contratos da UASG com as fontes oficiais e grava no banco.
 * Devolve NAO_RESERVADO quando outra pessoa já está sincronizando ou os dados ainda estão na validade
 * (sem forçar). `forcar` é só para o coordenador; a função do banco recusa para os outros perfis.
 */
export async function sincronizarContratos(
  uasg: string,
  opts: { forcar?: boolean } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  return executarComReserva(RECURSO_CONTRATOS, cleanUasg, { forcar: opts.forcar, validade: VALIDADE_CONTRATOS }, async () => {
    const db = supabase!;
    // A base é o que já está no banco: uma fonte fora do ar não empobrece os contratos conhecidos,
    // e o que o Contrato 360 já completou (id do Contratos.gov.br) não se perde.
    const base = await fetchContratosOficiaisDoBanco(cleanUasg);
    const { contracts, fontesComFalha } = await buscarContratosNasFontes(cleanUasg, base);

    if (contracts.length === 0) {
      return { status: 'ERRO', erro: 'As fontes oficiais não devolveram contratos.' };
    }

    let total = 0;
    for (let i = 0; i < contracts.length; i += LOTE_GRAVACAO) {
      const lote = contracts.slice(i, i + LOTE_GRAVACAO).map(registroParaGravar);
      const { data: gravados, error } = await db.rpc('gravar_contratos_oficiais', {
        p_uasg: cleanUasg,
        p_registros: lote
      });
      if (error) throw error;
      total += Number(gravados) || 0;
    }

    return { status: fontesComFalha.length > 0 ? 'PARCIAL' : 'SUCESSO', total, fontesComFalha };
  });
}

/**
 * Grava o contrato completado pelo Contrato 360 (consulta avulsa ao Contratos.gov.br), para o próximo
 * usuário já abrir o contrato completo. Só atualiza contrato que já está no banco. Falha não interrompe a tela.
 */
export async function persistirContratoCompletado(contract: ContractDashboardRecord): Promise<void> {
  if (!supabase || !contract?.id) return;
  const { error } = await supabase.rpc('atualizar_contrato_oficial', {
    p_contract_key: contract.id,
    p_registro: registroParaGravar(contract)
  });
  if (error) console.warn(`[contratosOficiais] não foi possível gravar o contrato completado ${contract.id}:`, error);
}

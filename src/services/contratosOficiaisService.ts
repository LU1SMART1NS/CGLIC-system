/**
 * Contratos oficiais persistidos no Supabase (migration 72).
 *
 * As telas leem a lista de contratos do banco (`contratos_oficiais`) e nunca as APIs do governo: quem
 * consulta o Contratos.gov.br e o Compras.gov.br é a sincronização no servidor (server/sincronizar-fontes,
 * que usa `sincronizarContratos` daqui). A trava em `sincronizacao_fontes` garante uma sincronização por vez.
 */

import type { ContractDashboardRecord } from '../types';
import { supabase } from './supabaseClient';
import {
  buscarContratosNasFontes,
  calculateStatusVigencia,
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
/**
 * Contratos por página na leitura. O Supabase devolve no máximo 1000 linhas e corta o resto sem avisar, mas a página
 * de 1000 da UASG 200331 tem ~4 MB de `registro` e estourou o tempo limite de 8 s do usuário logado com o banco
 * cheio (17/10/2026). Com 250 cada página tem ~1 MB e um quarto do trabalho.
 */
export const PAGINA_LEITURA = 250;
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

/**
 * Coluna lida: `registro` é o registro completo (com o `raw` inteiro da fonte); `registro_tela` é o mesmo registro
 * com só as partes do `raw` que as telas usam (migration 150: ~2/3 menos dados na UASG 200331).
 */
type ColunaRegistro = 'registro' | 'registro_tela';

/**
 * Contratos da carteira (UASG) gravados no banco, em páginas. Lista vazia quando nada foi sincronizado.
 * A ordem é fixa (contract_key, único na UASG), para nenhuma linha pular ou repetir entre as páginas. Falha em
 * qualquer página vira erro: nunca devolve a carteira pela metade.
 * Lê o registro completo: é a base da sincronização do servidor.
 */
export async function fetchContratosOficiaisDoBanco(uasg: string): Promise<ContractDashboardRecord[]> {
  return lerContratosDoBanco(uasg, 'registro');
}

async function lerContratosDoBanco(uasg: string, coluna: ColunaRegistro): Promise<ContractDashboardRecord[]> {
  if (!supabase) return [];
  const cleanUasg = (uasg || '').trim();
  const contratos: ContractDashboardRecord[] = [];
  for (let from = 0, pagina = 1; ; from += PAGINA_LEITURA, pagina++) {
    const { data, error } = await supabase
      .from('contratos_oficiais')
      .select(coluna === 'registro' ? 'registro' : 'registro:registro_tela')
      .eq('uasg', cleanUasg)
      .order('contract_key', { ascending: true })
      .range(from, from + PAGINA_LEITURA - 1);
    if (error) {
      throw new Error(`Não foi possível ler os contratos da UASG ${cleanUasg} no banco (página ${pagina}): ${error.message}`, {
        cause: error
      });
    }
    for (const row of data ?? []) contratos.push(registroParaContrato(row.registro));
    if (!data || data.length < PAGINA_LEITURA) break;
  }
  return ordenarContratos(contratos);
}

/**
 * Lista de contratos para as telas (queryFn de ['contracts-dashboard', uasg]). Só lê o banco.
 * Leitura que falha vira erro, e cada tela o trata: o painel do Início usa a última leitura boa ou avisa que não
 * carregou; a Carteira de Contratos mostra o erro com "tentar novamente". O navegador não consulta as fontes oficiais
 * nem quando o banco falha nem quando ainda não tem a carteira (devolve lista vazia).
 *
 * Lê `registro_tela`: o `raw` vem resumido (categoria, prorrogável, valor acumulado, publicação, termos aditivos e
 * UASG de origem) e marcado com `_resumido`. Quem regrava este registro (Contrato 360, sincronização de empenhos)
 * pode mandá-lo como está: o banco mantém o `raw` inteiro já gravado e só junta o que mudou (migration 150).
 */
export async function fetchContratosParaTela(uasg: string): Promise<ContractDashboardRecord[]> {
  return lerContratosDoBanco(uasg, 'registro_tela');
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

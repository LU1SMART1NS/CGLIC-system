/**
 * Histórico, responsáveis e garantias dos contratos guardados no banco (contratos_detalhes_copia, migration 93).
 *
 * - No servidor, a leitura dos itens dos contratos (recurso 'itens_contratos') lê também estes três dados dos
 *   contratos vigentes do Contratos.gov.br e grava a última leitura válida de cada um.
 * - Na tela, o Contrato 360 consulta ao vivo; se a consulta falhar, usa a cópia (com a data). Sem cópia, a
 *   falha aparece como falha, nunca como "não há".
 *
 * Diferente do Compras.gov.br, o Contratos.gov.br responde erro quando falha: resposta bem-sucedida e vazia é
 * "não há" de verdade e também é gravada.
 */
import { supabase } from './supabaseClient';
import { fetchContratosGovGarantias, fetchContratosGovHistorico, fetchContratosGovResponsaveis } from './api';
import { parseResponsavelNome } from './contractResponsaveisService';
import type { ContratosGovHistoricoRecord } from '../types/contractHistorico';
import type { ContratosGovGarantiaRecord, ContratosGovResponsavelRecord } from '../types/contractResponsaveis';

export type DetalheDoContrato = 'historico' | 'responsaveis' | 'garantias';

export interface DetalhesLidos {
  historico?: ContratosGovHistoricoRecord[];
  responsaveis?: ContratosGovResponsavelRecord[];
  garantias?: ContratosGovGarantiaRecord[];
}

/** Linha da gravação (formato que gravar_detalhes_contratos espera); lista ausente = a leitura dela falhou. */
export type DetalhesParaGravar = DetalhesLidos & { contract_key: string; contrato_id_gov: string };

/** Responsável sem o CPF mascarado que a API manda junto do nome ("***.550.961-** - NOME" → "NOME"). */
export function responsavelParaGravar(r: ContratosGovResponsavelRecord): ContratosGovResponsavelRecord {
  return { ...r, usuario: r.usuario == null ? r.usuario : parseResponsavelNome(r.usuario) };
}

type Fontes = {
  historico: typeof fetchContratosGovHistorico;
  responsaveis: typeof fetchContratosGovResponsaveis;
  garantias: typeof fetchContratosGovGarantias;
};

const FONTES_PADRAO: Fontes = {
  historico: fetchContratosGovHistorico,
  responsaveis: fetchContratosGovResponsaveis,
  garantias: fetchContratosGovGarantias
};

/**
 * Lê os três dados de um contrato no Contratos.gov.br. Cada leitura que falha fica fora da linha (a cópia
 * dela não muda) e entra em `falhas`.
 */
export async function lerDetalhesDoContrato(
  contractKey: string,
  contratoIdGov: string | number,
  fontes: Fontes = FONTES_PADRAO
): Promise<{ linha: DetalhesParaGravar; falhas: DetalheDoContrato[] }> {
  const opts = { falharSeErro: true };
  const [historico, responsaveis, garantias] = await Promise.allSettled([
    fontes.historico(contratoIdGov, opts),
    fontes.responsaveis(contratoIdGov, opts),
    fontes.garantias(contratoIdGov, opts)
  ]);
  const linha: DetalhesParaGravar = { contract_key: contractKey, contrato_id_gov: String(contratoIdGov) };
  const falhas: DetalheDoContrato[] = [];
  if (historico.status === 'fulfilled') linha.historico = historico.value;
  else falhas.push('historico');
  if (responsaveis.status === 'fulfilled') linha.responsaveis = responsaveis.value.map(responsavelParaGravar);
  else falhas.push('responsaveis');
  if (garantias.status === 'fulfilled') linha.garantias = garantias.value;
  else falhas.push('garantias');
  return { linha, falhas };
}

/** Grava um lote (até 100) com a trava do recurso 'itens_contratos' da UASG. Devolve quantos tiveram algo gravado. */
export async function gravarDetalhesContratos(uasg: string, lote: DetalhesParaGravar[]): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_detalhes_contratos', { p_uasg: uasg, p_contratos: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Última tentativa de leitura dos detalhes de cada contrato (chave em maiúsculas). */
export async function fetchLeiturasDetalhes(): Promise<Map<string, string>> {
  const leituras = new Map<string, string>();
  if (!supabase) return leituras;
  const PAGINA = 1000;
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase
      .from('contratos_detalhes_copia')
      .select('contract_key, lido_em')
      .order('contract_key', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    for (const row of data ?? []) leituras.set(String(row.contract_key).toUpperCase(), row.lido_em);
    if (!data || data.length < PAGINA) break;
  }
  return leituras;
}

// ------------------------------------------------------------------------------
// Leitura na tela: ao vivo, com a cópia como reserva
// ------------------------------------------------------------------------------

export interface LeituraComCopia<T> {
  dados: T;
  /** API: lido agora no Contratos.gov.br; COPIA: a consulta falhou e vale a última leitura guardada. */
  origem: 'API' | 'COPIA';
  /** Quando a cópia foi lida (só na origem COPIA). */
  copiadoEm: string | null;
}

/** Última leitura guardada de um dos detalhes do contrato; nula quando ainda não há. */
export async function lerCopiaDetalheContrato<T>(contractKey: string, detalhe: DetalheDoContrato): Promise<{ dados: T; copiadoEm: string } | null> {
  if (!supabase || !contractKey) return null;
  const { data, error } = await supabase
    .from('contratos_detalhes_copia')
    .select(`${detalhe}, ${detalhe}_copiado_em`)
    .eq('contract_key', contractKey)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  const copiadoEm = row?.[`${detalhe}_copiado_em`];
  const dados = row?.[detalhe];
  if (typeof copiadoEm !== 'string' || !Array.isArray(dados)) return null;
  return { dados: dados as T, copiadoEm };
}

/**
 * Consulta ao vivo; se falhar, usa a cópia guardada. Sem cópia, repassa o erro da consulta (a tela mostra a
 * falha, e não "não há").
 */
export async function lerComCopia<T>(
  aoVivo: () => Promise<T>,
  copia: () => Promise<{ dados: T; copiadoEm: string } | null>
): Promise<LeituraComCopia<T>> {
  try {
    return { dados: await aoVivo(), origem: 'API', copiadoEm: null };
  } catch (err) {
    let guardada: { dados: T; copiadoEm: string } | null = null;
    try {
      guardada = await copia();
    } catch (errCopia) {
      console.warn('Falha ao ler a cópia guardada do contrato.', errCopia);
    }
    if (guardada) return { dados: guardada.dados, origem: 'COPIA', copiadoEm: guardada.copiadoEm };
    throw err;
  }
}

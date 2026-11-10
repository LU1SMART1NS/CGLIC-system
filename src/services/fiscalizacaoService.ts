import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/**
 * Fiscalização de contratos pela SFC/CGLIC (migration 259). O coordenador decide, por contrato, quem fiscaliza:
 * toda a SFC/CGLIC, mista (parte das entregas com a área requisitante) ou toda a área requisitante.
 * Sem decisão: contrato de emenda fica "a definir"; sem emenda, com a área requisitante (padrão).
 */
export type DecisaoFiscalizacao = 'SFC' | 'MISTA' | 'AREA';
export type SituacaoFiscalizacao = DecisaoFiscalizacao | 'A_DEFINIR' | 'AREA_PADRAO';

export interface ContratoFiscalizacao {
  contractKey: string;
  uasg: string;
  numero: string;
  fornecedor: string | null;
  objeto: string | null;
  /** AAAA-MM-DD. */
  assinatura: string | null;
  vigenciaFim: string | null;
  emendas: string[];
  situacao: SituacaoFiscalizacao;
  motivo: string | null;
  fiscalUserId: string | null;
  fiscalNome: string | null;
  substitutoUserId: string | null;
  substitutoNome: string | null;
  portariaSei: string | null;
  processoSei: string | null;
  autuadoEm: string | null;
  definidoPorNome: string | null;
  definidoEm: string | null;
}

function cliente() {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaContrato(r: any): ContratoFiscalizacao {
  return {
    contractKey: r.contract_key,
    uasg: r.uasg,
    numero: r.numero || '',
    fornecedor: r.fornecedor || null,
    objeto: r.objeto || null,
    assinatura: r.assinatura || null,
    vigenciaFim: r.vigencia_fim || null,
    emendas: Array.isArray(r.emendas) ? r.emendas.filter(Boolean) : [],
    situacao: r.situacao,
    motivo: r.motivo || null,
    fiscalUserId: r.fiscal_user_id || null,
    fiscalNome: r.fiscal_nome || null,
    substitutoUserId: r.substituto_user_id || null,
    substitutoNome: r.substituto_nome || null,
    portariaSei: r.portaria_sei || null,
    processoSei: r.processo_sei || null,
    autuadoEm: r.autuado_em || null,
    definidoPorNome: r.definido_por_nome || null,
    definidoEm: r.definido_em || null
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Contratos vigentes e os que já têm decisão, com a situação da fiscalização (RPC fisc_contratos_para_distribuicao). */
export async function fetchContratosFiscalizacao(): Promise<ContratoFiscalizacao[]> {
  const { data, error } = await cliente().rpc('fisc_contratos_para_distribuicao');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data || []) as unknown[]).map(linhaParaContrato);
}

export interface DefinirFiscalizacaoInput {
  contractKey: string;
  fiscalizacao: DecisaoFiscalizacao;
  fiscalUserId: string | null;
  substitutoUserId: string | null;
  portariaSei: string | null;
  motivo: string | null;
}

/** Decisão do coordenador: quem fiscaliza, fiscal e substituto da SFC/CGLIC e a portaria. */
export async function definirFiscalizacaoContrato(input: DefinirFiscalizacaoInput): Promise<void> {
  const { error } = await cliente().rpc('definir_fiscalizacao_contrato', {
    p_contract_key: input.contractKey,
    p_fiscalizacao: input.fiscalizacao,
    p_fiscal_user_id: input.fiscalizacao === 'AREA' ? null : input.fiscalUserId,
    p_substituto_user_id: input.fiscalizacao === 'AREA' ? null : input.substitutoUserId,
    p_portaria_sei: (input.portariaSei || '').replace(/\D/g, '') || null,
    p_motivo: (input.motivo || '').trim() || null
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Autuação do processo de fiscalização (fiscal, substituto ou coordenador). */
export async function registrarProcessoFiscalizacao(input: { contractKey: string; processoSei: string; autuadoEm: string }): Promise<void> {
  const { error } = await cliente().rpc('registrar_processo_fiscalizacao', {
    p_contract_key: input.contractKey,
    p_processo_sei: input.processoSei.replace(/\D/g, ''),
    p_autuado_em: input.autuadoEm
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

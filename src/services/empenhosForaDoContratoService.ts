import { supabase, isSupabaseConfigured } from './supabaseClient';
import { rpcInexistente } from './empenhoSyncService';

/**
 * Notas que uma fatura cita fora do contrato da fatura (migration 117, v_empenhos_citados_fora_do_contrato).
 * Tudo se corrige no Contratos.gov.br pelo próprio gestor; o sistema confere, guarda a marca "Vou corrigir"
 * e tira a linha da fila quando a sincronização trouxer a correção.
 */

export type VereditoForaDoContrato = 'EM_OUTRO_CONTRATO' | 'NOTA_EM_DOBRO' | 'FORA_DOS_CONTRATOS';
export type SituacaoForaDoContrato = 'A_CONFERIR' | 'CORRIGINDO' | 'CORRECAO_NAO_CHEGOU';
export type TipoDeCorrecao =
  | 'MUDAR_FATURA_DE_CONTRATO'
  | 'TROCAR_REGISTRO_DA_NOTA'
  | 'CORRIGIR_NUMERO_NA_FATURA'
  | 'INCLUIR_NOTA_NO_CONTRATO'
  | 'OUTRO';

export interface NotaHomonima {
  uasgEmitente: string;
  credorNome: string | null;
  contratos: string[];
}

export interface OutraNotaDaFatura {
  numeroEmpenho: string | null;
  noContrato: boolean;
}

export interface EmpenhoForaDoContrato {
  /** Chave da linha: fatura + registro da nota na fonte. */
  chave: string;
  idFatura: number;
  contractKey: string;
  fatura: {
    numero: string | null;
    emissao: string | null;
    referencia: string | null;
    vencimento: string | null;
    valorLiquido: number;
  };
  idEmpenhoGov: string;
  numeroEmpenho: string;
  /** O registro que a fatura cita, quando o sistema o tem. */
  nota: {
    numeroOficial: string;
    uasgEmitente: string;
    dataEmissao: string | null;
    valorEmpenhado: number;
    credorNome: string | null;
    credorCnpjCpf: string | null;
  } | null;
  outrosContratos: string[];
  /** Outro registro com o mesmo número, já neste contrato (veredito NOTA_EM_DOBRO). */
  registroNoContrato: { numeroOficial: string; uasgEmitente: string; dataEmissao: string | null; valorEmpenhado: number } | null;
  homonimas: NotaHomonima[];
  outrasNotasDaFatura: OutraNotaDaFatura[];
  veredito: VereditoForaDoContrato;
  situacao: SituacaoForaDoContrato;
  correcao: { tipo: TipoDeCorrecao; observacao: string | null; porNome: string | null; em: string } | null;
}

export const ROTULO_DO_VEREDITO: Record<VereditoForaDoContrato, string> = {
  EM_OUTRO_CONTRATO: 'Em outro contrato',
  NOTA_EM_DOBRO: 'Nota em dobro na fonte',
  FORA_DOS_CONTRATOS: 'Fora dos contratos'
};

export const ROTULO_DO_TIPO: Record<TipoDeCorrecao, string> = {
  MUDAR_FATURA_DE_CONTRATO: 'Lançar a fatura no contrato certo e cancelar esta',
  TROCAR_REGISTRO_DA_NOTA: 'Trocar na fatura o registro duplicado da nota',
  CORRIGIR_NUMERO_NA_FATURA: 'Corrigir o número da nota na fatura',
  INCLUIR_NOTA_NO_CONTRATO: 'Incluir a nota também neste contrato',
  OUTRO: 'Outro'
};

/** Tipo já escolhido na janela, conforme o veredito. */
export const TIPO_SUGERIDO: Record<VereditoForaDoContrato, TipoDeCorrecao> = {
  EM_OUTRO_CONTRATO: 'MUDAR_FATURA_DE_CONTRATO',
  NOTA_EM_DOBRO: 'TROCAR_REGISTRO_DA_NOTA',
  FORA_DOS_CONTRATOS: 'INCLUIR_NOTA_NO_CONTRATO'
};

const PAGINA = 1000;
const COLUNAS =
  'id_fatura, contract_key, fatura_numero, fatura_emissao, fatura_referencia, fatura_vencimento, fatura_valor_liquido, id_empenho_gov, numero_empenho, empenho_id, numero_oficial, uasg_emitente, data_emissao, valor_empenhado, credor_nome, credor_cnpj_cpf, outros_contratos, registro_no_contrato, homonimas, outras_notas_da_fatura, veredito, correcao_tipo, correcao_observacao, correcao_por_nome, correcao_em, situacao';

export function linhaForaDoContrato(r: any): EmpenhoForaDoContrato {
  const reg = r.registro_no_contrato;
  return {
    chave: `${r.id_fatura}|${r.id_empenho_gov}`,
    idFatura: Number(r.id_fatura),
    contractKey: String(r.contract_key),
    fatura: {
      numero: r.fatura_numero ?? null,
      emissao: r.fatura_emissao ?? null,
      referencia: r.fatura_referencia ?? null,
      vencimento: r.fatura_vencimento ?? null,
      valorLiquido: Number(r.fatura_valor_liquido ?? 0)
    },
    idEmpenhoGov: String(r.id_empenho_gov),
    numeroEmpenho: String(r.numero_empenho ?? r.id_empenho_gov),
    nota: r.empenho_id
      ? {
          numeroOficial: String(r.numero_oficial),
          uasgEmitente: String(r.uasg_emitente),
          dataEmissao: r.data_emissao ?? null,
          valorEmpenhado: Number(r.valor_empenhado ?? 0),
          credorNome: r.credor_nome ?? null,
          credorCnpjCpf: r.credor_cnpj_cpf ?? null
        }
      : null,
    outrosContratos: Array.isArray(r.outros_contratos) ? r.outros_contratos.map(String) : [],
    registroNoContrato: reg
      ? { numeroOficial: String(reg.numero_oficial), uasgEmitente: String(reg.uasg_emitente), dataEmissao: reg.data_emissao ?? null, valorEmpenhado: Number(reg.valor_empenhado ?? 0) }
      : null,
    homonimas: (Array.isArray(r.homonimas) ? r.homonimas : []).map((h: any) => ({
      uasgEmitente: String(h.uasg_emitente),
      credorNome: h.credor_nome ?? null,
      contratos: Array.isArray(h.contratos) ? h.contratos.map(String) : []
    })),
    outrasNotasDaFatura: (Array.isArray(r.outras_notas_da_fatura) ? r.outras_notas_da_fatura : []).map((n: any) => ({
      numeroEmpenho: n.numero_empenho ?? null,
      noContrato: Boolean(n.no_contrato)
    })),
    veredito: r.veredito as VereditoForaDoContrato,
    situacao: r.situacao as SituacaoForaDoContrato,
    correcao: r.correcao_tipo
      ? { tipo: r.correcao_tipo as TipoDeCorrecao, observacao: r.correcao_observacao ?? null, porNome: r.correcao_por_nome ?? null, em: String(r.correcao_em) }
      : null
  };
}

/** Linhas da fila. Sem a migration 117 aplicada, a fila fica vazia (e não quebra a tela). */
export async function fetchEmpenhosForaDoContrato(): Promise<EmpenhoForaDoContrato[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const linhas: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('v_empenhos_citados_fora_do_contrato')
      .select(COLUNAS)
      .order('id_fatura', { ascending: true })
      .order('id_empenho_gov', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find/i.test(error.message ?? '')) return [];
      throw error;
    }
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return linhas.map(linhaForaDoContrato);
}

export function mensagemDoErroDeCorrecao(error: any): string {
  if (rpcInexistente(error)) return 'O banco ainda não tem a marca de correção (migration 117).';
  const bruta = String(error?.message ?? error ?? '');
  if (/UNAUTHORIZED/.test(bruta) || error?.code === '42501') return 'Só gestor ou coordenador marca a correção no Contratos.gov.br.';
  if (/JA_RESOLVIDA/.test(bruta)) return 'A fatura não cita mais esta nota fora do contrato. A lista foi atualizada.';
  if (/SEM_MARCA/.test(bruta)) return 'Esta nota já não estava marcada como em correção.';
  if (/INVALID_OBSERVACAO/.test(bruta)) return 'A observação tem no máximo 500 caracteres.';
  if (/INVALID_TIPO/.test(bruta)) return 'Escolha o que vai ser corrigido.';
  return bruta.replace(/^[A-Z_]+:\s*/, '') || 'Não foi possível gravar.';
}

async function chamar(rpc: string, params: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase) throw new Error('O banco não está configurado.');
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) throw new Error(mensagemDoErroDeCorrecao(error));
  return data;
}

export async function marcarCorrecaoNaFonte(input: { idFatura: number; idEmpenhoGov: string; tipo: TipoDeCorrecao; observacao?: string }) {
  return chamar('marcar_correcao_empenho_na_fonte', {
    p_id_fatura: input.idFatura,
    p_id_empenho_gov: input.idEmpenhoGov,
    p_tipo: input.tipo,
    p_observacao: input.observacao?.trim() || null
  });
}

export async function desfazerCorrecaoNaFonte(input: { idFatura: number; idEmpenhoGov: string }) {
  return chamar('desfazer_correcao_empenho_na_fonte', { p_id_fatura: input.idFatura, p_id_empenho_gov: input.idEmpenhoGov });
}

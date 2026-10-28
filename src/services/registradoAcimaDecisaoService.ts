import { supabase } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

/** Decisão do gestor da ata no aviso "registrado acima do homologado" (migration 223). */
export type DecisaoRegistradoAcima = 'MANTER' | 'ACEITAR';

export interface DecisaoDoAviso {
  chave: string;
  itemKey: string;
  decisao: DecisaoRegistradoAcima;
  /** Aceitar: número SEI do termo aditivo que renova os quantitativos. */
  documentoSei: string | null;
  /** Manter: protocolo do chamado de correção no suporte do MGI. */
  protocoloMgi: string | null;
  justificativa: string;
  decididoPorNome: string | null;
  decididoEm: string;
}

/** Todas as decisões (poucas): o Item 360 acha a do aviso pela chave e o Painel tira os decididos da fila. */
export async function fetchDecisoesRegistradoAcima(): Promise<DecisaoDoAviso[]> {
  if (!supabase) return [];
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    supabase!.from('registrado_acima_decisoes').select('chave, item_key, decisao, documento_sei, protocolo_mgi, justificativa, decidido_por_nome, decidido_em').order('chave').range(de, ate)
  );
  return linhas.map((r) => ({
    chave: r.chave,
    itemKey: r.item_key,
    decisao: r.decisao,
    documentoSei: r.documento_sei ?? null,
    protocoloMgi: r.protocolo_mgi ?? null,
    justificativa: r.justificativa,
    decididoPorNome: r.decidido_por_nome ?? null,
    decididoEm: r.decidido_em
  }));
}

export interface DecidirRegistradoAcimaInput {
  chave: string;
  decisao: DecisaoRegistradoAcima;
  /** Aceitar: SEI do termo aditivo. Manter: protocolo do chamado no suporte do MGI (opcional). */
  documento: string | null;
  justificativa: string;
  condicoesParecer: boolean;
}

const semPrefixo = (m: string) => m.replace(/^(UNAUTHORIZED|INVALID_PAYLOAD):\s*/, '');

export async function decidirRegistradoAcima(i: DecidirRegistradoAcimaInput): Promise<void> {
  if (!supabase) throw new Error('Sem conexão com o banco.');
  const { error } = await supabase.rpc('decidir_registrado_acima', {
    p_chave: i.chave, p_decisao: i.decisao, p_documento: i.documento, p_justificativa: i.justificativa, p_condicoes_parecer: i.condicoesParecer
  });
  if (error) throw new Error(semPrefixo(error.message || 'Não foi possível gravar a decisão.'));
}

export async function desfazerDecisaoRegistradoAcima(chave: string): Promise<void> {
  if (!supabase) throw new Error('Sem conexão com o banco.');
  const { error } = await supabase.rpc('desfazer_decisao_registrado_acima', { p_chave: chave });
  if (error) throw new Error(semPrefixo(error.message || 'Não foi possível desfazer.'));
}

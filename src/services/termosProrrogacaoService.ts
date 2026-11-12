import { supabase } from './supabaseClient';

/** O que o termo aditivo de prorrogação diz sobre o saldo (migration 222). */
export type CoberturaDaProrrogacao = 'SALDO' | 'RENOVA' | 'A_CONFERIR';

export interface TermoDeProrrogacao {
  sequencialDocumento: number;
  titulo: string | null;
  publicadoEm: string | null;
  cobertura: CoberturaDaProrrogacao;
  trecho: string | null;
  /** Endereço do documento no PNCP. */
  url: string;
}

/** Endereço de um documento da ata no PNCP (o 1 é a própria ata). */
export function urlDoDocumentoDaAta(numeroControlePncpAta: string | null | undefined, sequencial: number): string {
  const m = (numeroControlePncpAta || '').trim().match(/^(\d{14})-1-0*(\d+)\/(\d{4})-0*(\d+)$/);
  if (!m) return '';
  const [, cnpj, seqCompra, ano, seqAta] = m;
  return `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seqCompra}/atas/${seqAta}/arquivos/${sequencial}`;
}

/** Termos de prorrogação da ata, do mais recente ao mais antigo (lidos do PNCP pelo servidor). */
export async function fetchTermosDeProrrogacao(numeroAta: string, uasg: string): Promise<TermoDeProrrogacao[]> {
  if (!supabase || !numeroAta || !uasg) return [];
  const { data, error } = await supabase
    .from('v_ata_termos_prorrogacao')
    .select('numero_controle_pncp, documento_pncp_sequencial, documento_titulo, documento_publicado_em, cobertura, trecho')
    .eq('numero_ata', numeroAta)
    .eq('codigo_uasg', uasg)
    .order('documento_publicado_em', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    sequencialDocumento: Number(r.documento_pncp_sequencial),
    titulo: r.documento_titulo ?? null,
    publicadoEm: r.documento_publicado_em ?? null,
    cobertura: r.cobertura as CoberturaDaProrrogacao,
    trecho: r.trecho ?? null,
    url: urlDoDocumentoDaAta(r.numero_controle_pncp, Number(r.documento_pncp_sequencial))
  }));
}

/** Chave "número da ata-UASG" das atas cujo termo de prorrogação cobre só o saldo não contratado. */
export const chaveDaAtaDoTermo = (numeroAta: string, uasg: string) => `${numeroAta}-${uasg}`;

/**
 * Atas prorrogadas cujo termo aditivo diz que a prorrogação cobre só o saldo não contratado: o aviso "registrado
 * acima do homologado" delas já está explicado pelo termo e sai da fila do Painel (o desconto continua).
 */
export async function fetchAtasComProrrogacaoSoSaldo(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from('v_ata_termos_prorrogacao').select('numero_ata, codigo_uasg').eq('cobertura', 'SALDO');
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => chaveDaAtaDoTermo(String(r.numero_ata), String(r.codigo_uasg))));
}

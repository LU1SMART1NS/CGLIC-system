import { supabase } from './supabaseClient';
import { mensagemDeErro } from './sincronizacaoFontesService';
import type { SituacaoDivisao } from './divisaoNaAtaService';

/** Programa para a Alocação (migration 298): o ComprasSUSP é o programa das emendas (resto da CAEP, sem reserva digitada). */
export interface ProgramaDaAlocacao {
  id: string;
  nome: string;
  /** Sigla da área responsável (a reserva fica na cota dela). */
  area: string;
  ativo: boolean;
  emendas: boolean;
}

/** Reserva de um programa no item, com o contratado ligado a ele (migration 297). */
export interface ReservaDePrograma {
  programaId: string;
  nome: string;
  area: string;
  quantidade: number;
  contratado: number;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

export interface RemanejamentoEntreUnidades {
  de: string;
  para: string;
  quantidade: number;
  sei: string;
  observacao: string | null;
  feitoPorNome: string | null;
  feitoEm: string;
}

export interface AlocacaoExtraDoItem {
  divisao: SituacaoDivisao;
  reservas: ReservaDePrograma[];
  /** Divisão por unidade que a ata assinada traz (só nas atas que dividem). */
  divisaoAssinada: Record<string, number>;
  remanejamentos: RemanejamentoEntreUnidades[];
}

export const EXTRA_VAZIO: AlocacaoExtraDoItem = { divisao: 'A_CONFERIR', reservas: [], divisaoAssinada: {}, remanejamentos: [] };

const banco = () => {
  if (!supabase) throw new Error('Banco indisponível.');
  return supabase;
};
const semPrefixo = (m: string) => m.replace(/^[A-Z_]+:\s*/, '');
const naoAplicada = (code?: string) => code === '42883' || code === 'PGRST202';

export async function fetchProgramasParaAlocacao(): Promise<ProgramaDaAlocacao[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('programas_para_alocacao');
  if (error) {
    if (naoAplicada(error.code)) return [];
    throw new Error(semPrefixo(mensagemDeErro(error)));
  }
  return ((data ?? []) as Array<Record<string, any>>).map((r) => ({ id: r.id, nome: r.nome, area: r.area, ativo: !!r.ativo, emendas: !!r.emendas }));
}

export async function fetchAlocacaoExtraDoItem(itemKey: string): Promise<AlocacaoExtraDoItem> {
  if (!supabase) return EXTRA_VAZIO;
  const { data, error } = await supabase.rpc('alocacao_extra_do_item', { p_item_key: itemKey });
  if (error) {
    if (naoAplicada(error.code)) return EXTRA_VAZIO;
    throw new Error(semPrefixo(mensagemDeErro(error)));
  }
  const d = (data ?? {}) as Record<string, any>;
  return {
    divisao: (d.divisao as SituacaoDivisao) ?? 'A_CONFERIR',
    reservas: ((d.reservas ?? []) as Array<Record<string, any>>).map((r) => ({
      programaId: r.programa_id,
      nome: r.nome,
      area: r.area,
      quantidade: Number(r.quantidade) || 0,
      contratado: Number(r.contratado) || 0,
      atualizadoPorNome: r.atualizado_por_nome ?? null,
      atualizadoEm: r.atualizado_em ?? null
    })),
    divisaoAssinada: Object.fromEntries(Object.entries((d.divisao_assinada ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0])),
    remanejamentos: ((d.remanejamentos ?? []) as Array<Record<string, any>>).map((m) => ({
      de: m.de,
      para: m.para,
      quantidade: Number(m.quantidade) || 0,
      sei: m.sei,
      observacao: m.observacao ?? null,
      feitoPorNome: m.feito_por_nome ?? null,
      feitoEm: m.feito_em
    }))
  };
}

/** Reservas de programas e reservado a parlamentares de todos os itens, para a coluna Programas da Alocação. */
export async function fetchReservasDaCarteira(): Promise<{ reservas: Array<{ itemKey: string; programaId: string; quantidade: number }>; parlamentares: Map<string, number> }> {
  if (!supabase) return { reservas: [], parlamentares: new Map() };
  const [res, emd] = await Promise.all([
    supabase.from('arp_item_reservas_programa').select('item_key, programa_id, quantidade'),
    supabase.from('v_emendas_reservado_por_item').select('item_key, reservado')
  ]);
  if (res.error && !['42P01', 'PGRST205'].includes(res.error.code)) throw new Error(semPrefixo(mensagemDeErro(res.error)));
  if (emd.error) throw new Error(semPrefixo(mensagemDeErro(emd.error)));
  return {
    reservas: ((res.data ?? []) as Array<Record<string, any>>).map((r) => ({ itemKey: r.item_key, programaId: r.programa_id, quantidade: Number(r.quantidade) || 0 })),
    parlamentares: new Map(((emd.data ?? []) as Array<Record<string, any>>).map((r) => [String(r.item_key), Number(r.reservado) || 0]))
  };
}

/** Define a reserva do programa no item (0 retira). Na ata sem divisão, lança na área a cota que faltar. */
export async function reservarParaPrograma(itemKey: string, programaId: string, quantidade: number, expectedVersion?: number): Promise<void> {
  const { error } = await banco().rpc('reservar_para_programa', { p_item_key: itemKey, p_programa: programaId, p_quantidade: quantidade, p_expected_version: expectedVersion ?? null });
  if (error) throw Object.assign(new Error(semPrefixo(mensagemDeErro(error))), { sqlState: error.code });
}

/** Passa quantidade de uma unidade a outra, com o nº SEI da autorização da unidade interna. */
export async function remanejarEntreUnidades(v: { itemKey: string; de: string; para: string; quantidade: number; sei: string; observacao?: string; expectedVersion?: number }): Promise<void> {
  const { error } = await banco().rpc('remanejar_entre_unidades', {
    p_item_key: v.itemKey, p_de: v.de, p_para: v.para, p_quantidade: v.quantidade, p_sei: v.sei, p_observacao: v.observacao ?? null, p_expected_version: v.expectedVersion ?? null
  });
  if (error) throw Object.assign(new Error(semPrefixo(mensagemDeErro(error))), { sqlState: error.code });
}

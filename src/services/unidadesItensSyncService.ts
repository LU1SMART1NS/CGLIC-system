/**
 * Órgãos participantes e adesões de cada item das atas guardados no banco (itens_ata_unidades_copia,
 * migrations 91 e 92), em segundo plano e sob a trava do banco (recurso 'unidades_itens', por UASG).
 *
 * Lê a lista de unidades de cada item no Compras.gov.br (3_consultarUnidadesItem) e grava a última lista
 * válida. A tela do Item consulta a API ao vivo e, quando ela volta vazia, mostra esta cópia com a data.
 * Leitura vazia não apaga a cópia.
 *
 * Adesões (5_consultarAdesoesItem): item sem carona devolve vazio de verdade, então elas só são lidas e
 * gravadas quando a consulta de órgãos do mesmo item respondeu (API de pé); aí a lista vazia também vale. Incremental: lê o item nunca lido, o de ata vigente lido há mais de
 * 24 horas, o de ata encerrada lido há mais de 30 dias e o que ainda não tem cópia a cada 6 horas, a menos
 * que o coordenador force. Um item por vez e dentro de um orçamento de tempo: o que não couber fica para a
 * próxima execução (PARCIAL).
 */
import { supabase } from './supabaseClient';
import { fetchAdesoesItem, fetchUnidadesItem } from './api';
import {
  executarComReserva,
  mensagemDeErro,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import { SINCRONIZACAO_RULES } from '../config/alertRules';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { AdesaoItemRecord, UnidadeItemRecord } from '../types';

export const RECURSO_UNIDADES_ITENS = 'unidades_itens' as const;
export const FONTE_UNIDADES_ITENS = 'Órgãos participantes dos itens';
export const FONTE_ADESOES_ITENS = 'Adesões dos itens';

/** Tempo máximo consultando a API numa execução (a Edge Function tem 150 s; a trava vale 10 minutos). */
export const ORCAMENTO_UNIDADES_ITENS_MS = 100_000;

/** Itens por chamada de gravação (a função aceita até 100). */
const LOTE_GRAVACAO = 25;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

export interface ItemDaCarteira {
  itemKey: string;
  numeroAta: string;
  uasg: string;
  numeroItem: string;
  /** Fim da vigência da ata (AAAA-MM-DD); nulo quando a fonte não informou. */
  vigenciaFinal: string | null;
}

export interface LeituraDaCopia {
  lidoEm: string;
  /** Já há cópia dos órgãos e das adesões; faltando uma delas, o item é relido mais cedo. */
  temCopia: boolean;
}

/** Campos da unidade que a tela usa: o resto da resposta da API não entra na cópia. */
const CAMPOS_DA_UNIDADE: ReadonlyArray<keyof UnidadeItemRecord> = [
  'numeroAta', 'unidadeGerenciadora', 'numeroItem', 'codigoPdm', 'descricaoItem', 'fornecedor',
  'codigoUnidade', 'nomeUnidade', 'tipoUnidade', 'quantidadeRegistrada', 'saldoRemanejamentoEmpenho',
  'saldoAdesoes', 'qtdLimiteAdesao', 'qtdLimiteInformadoCompra', 'aceitaAdesao',
  'dataHoraInclusao', 'dataHoraAtualizacao', 'dataHoraExclusao'
];

/** Campos da adesão que a tela usa. */
const CAMPOS_DA_ADESAO: ReadonlyArray<keyof AdesaoItemRecord> = [
  'numeroAta', 'unidadeGerenciadora', 'unidadeNaoParticipante', 'dataAprovacaoAnalise', 'quantidadeAprovadaAdesao'
];

export function adesaoParaGravar(a: AdesaoItemRecord): Partial<AdesaoItemRecord> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_DA_ADESAO) {
    if (a[campo] !== undefined) out[campo] = a[campo];
  }
  return out as Partial<AdesaoItemRecord>;
}

export function unidadeParaGravar(u: UnidadeItemRecord): Partial<UnidadeItemRecord> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_DA_UNIDADE) {
    if (u[campo] !== undefined) out[campo] = u[campo];
  }
  return out as Partial<UnidadeItemRecord>;
}

function ataVigente(item: ItemDaCarteira, agora: number): boolean {
  const fim = item.vigenciaFinal ? Date.parse(item.vigenciaFinal.slice(0, 10)) : NaN;
  return Number.isNaN(fim) || fim >= agora - DIA_MS;
}

/**
 * Itens cujos órgãos precisam ser lidos, em ordem: os nunca lidos primeiro, depois os de leitura mais antiga.
 * `leituras`: item_key -> última tentativa e se já há cópia.
 */
export function itensParaLer(
  itens: ItemDaCarteira[],
  leituras: Map<string, LeituraDaCopia>,
  opts: { agora: number; forcar?: boolean }
): ItemDaCarteira[] {
  const vistos = new Set<string>();
  const fila: Array<{ item: ItemDaCarteira; lidoEm: number }> = [];
  for (const item of itens) {
    if (!item.itemKey || vistos.has(item.itemKey)) continue;
    vistos.add(item.itemKey);
    const leitura = leituras.get(item.itemKey);
    const lido = leitura ? Date.parse(leitura.lidoEm) : NaN;
    const lidoEm = Number.isNaN(lido) ? -Infinity : lido;
    if (!opts.forcar && leitura && lidoEm !== -Infinity) {
      const validade = !leitura.temCopia
        ? SINCRONIZACAO_RULES.unidadesItemSemCopiaRelidasEmHoras * HORA_MS
        : ataVigente(item, opts.agora)
          ? SINCRONIZACAO_RULES.unidadesItemVigenteRelidasEmHoras * HORA_MS
          : SINCRONIZACAO_RULES.unidadesItemEncerradoRelidasEmDias * DIA_MS;
      if (opts.agora - lidoEm < validade) continue;
    }
    fila.push({ item, lidoEm });
  }
  return fila.sort((a, b) => a.lidoEm - b.lidoEm).map((f) => f.item);
}

/** Itens das atas da UASG gravados no banco. */
async function fetchItensDaCarteira(uasg: string): Promise<ItemDaCarteira[]> {
  const itens: ItemDaCarteira[] = [];
  if (!supabase) return itens;
  const PAGINA = 1000;
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase
      .from('itens_ata')
      .select('id, numero_item, atas_registro_preco!inner(numero_ata, codigo_uasg, data_vigencia_final)')
      .eq('atas_registro_preco.codigo_uasg', uasg)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const ata = Array.isArray(row.atas_registro_preco) ? row.atas_registro_preco[0] : row.atas_registro_preco;
      if (!ata?.numero_ata || row.numero_item == null) continue;
      itens.push({
        itemKey: normalizeItemKey(ata.numero_ata, ata.codigo_uasg, row.numero_item),
        numeroAta: String(ata.numero_ata),
        uasg: String(ata.codigo_uasg),
        numeroItem: String(row.numero_item),
        vigenciaFinal: ata.data_vigencia_final ?? null
      });
    }
    if (!data || data.length < PAGINA) break;
  }
  return itens;
}

async function fetchLeituras(): Promise<Map<string, LeituraDaCopia>> {
  const leituras = new Map<string, LeituraDaCopia>();
  if (!supabase) return leituras;
  const PAGINA = 1000;
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase
      .from('itens_ata_unidades_copia')
      .select('item_key, lido_em, copiado_em, adesoes_copiado_em')
      .order('item_key', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      leituras.set(String(row.item_key), {
        lidoEm: row.lido_em,
        temCopia: row.copiado_em != null && row.adesoes_copiado_em != null
      });
    }
    if (!data || data.length < PAGINA) break;
  }
  return leituras;
}

type LinhaParaGravar = {
  item_key: string;
  unidades: Array<Partial<UnidadeItemRecord>>;
  /** Ausente quando as adesões não puderam ser lidas com confiança (a cópia delas fica como está). */
  adesoes?: Array<Partial<AdesaoItemRecord>>;
};

/**
 * Lê órgãos e adesões de um item. As adesões só entram quando os órgãos vieram (API de pé) e a consulta
 * delas não falhou; `falhaAdesoes` conta essa falha à parte.
 */
export async function lerItemNasFontes(
  item: ItemDaCarteira,
  fontes: { unidades: typeof fetchUnidadesItem; adesoes: typeof fetchAdesoesItem } = { unidades: fetchUnidadesItem, adesoes: fetchAdesoesItem }
): Promise<{ linha: LinhaParaGravar; falhaAdesoes: boolean }> {
  const resposta = await fontes.unidades(item.numeroAta, item.uasg, item.numeroItem);
  const unidades = (resposta.resultado || []).map(unidadeParaGravar);
  const linha: LinhaParaGravar = { item_key: item.itemKey, unidades };
  if (unidades.length === 0) return { linha, falhaAdesoes: false };
  try {
    const adesoes = await fontes.adesoes(item.numeroAta, item.uasg, item.numeroItem, { falharSeErro: true });
    linha.adesoes = (adesoes.resultado || []).map(adesaoParaGravar);
    return { linha, falhaAdesoes: false };
  } catch (err) {
    console.warn(`[unidadesItens] adesões do item ${item.itemKey} não puderam ser lidas:`, mensagemDeErro(err));
    return { linha, falhaAdesoes: true };
  }
}

async function gravar(uasg: string, lote: LinhaParaGravar[]): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_unidades_itens', { p_uasg: uasg, p_itens: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Quantos itens da UASG estão na fila de leitura (modo de teste do servidor; não grava nada). */
export async function contarUnidadesItensPendentes(uasg: string, agora: number = Date.now()): Promise<{ itens: number; pendentes: number }> {
  const itens = await fetchItensDaCarteira((uasg || '').trim());
  const fila = itensParaLer(itens, await fetchLeituras(), { agora });
  return { itens: itens.length, pendentes: fila.length };
}

export async function sincronizarUnidadesItens(
  uasg: string,
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_UNIDADES_ITENS_MS;

  return executarComReserva(
    RECURSO_UNIDADES_ITENS,
    cleanUasg,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      const inicio = agora();
      const itens = await fetchItensDaCarteira(cleanUasg);
      const fila = itensParaLer(itens, await fetchLeituras(), { agora: inicio, forcar: opts.forcar });

      let copiados = 0;
      let vazios = 0;
      let falhas = 0;
      let falhasAdesoes = 0;
      let pendentes = 0;
      let lote: LinhaParaGravar[] = [];

      for (let i = 0; i < fila.length; i++) {
        if (agora() - inicio > orcamento) {
          pendentes = fila.length - i;
          break;
        }
        const item = fila[i];
        try {
          const { linha, falhaAdesoes } = await lerItemNasFontes(item);
          if (linha.unidades.length === 0) vazios++;
          if (falhaAdesoes) falhasAdesoes++;
          lote.push(linha);
        } catch (err) {
          falhas++;
          console.warn(`[unidadesItens] órgãos do item ${item.itemKey} não puderam ser lidos:`, mensagemDeErro(err));
        }
        if (lote.length >= LOTE_GRAVACAO) {
          copiados += await gravar(cleanUasg, lote);
          lote = [];
        }
      }
      copiados += await gravar(cleanUasg, lote);

      const problemas: string[] = [];
      if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'item não teve os órgãos lidos' : 'itens não tiveram os órgãos lidos'}`);
      if (falhasAdesoes > 0) problemas.push(`${falhasAdesoes} ${falhasAdesoes === 1 ? 'item não teve as adesões lidas' : 'itens não tiveram as adesões lidas'}`);
      if (vazios > 0) problemas.push(`o Compras.gov.br não devolveu órgãos para ${vazios} ${vazios === 1 ? 'item' : 'itens'}`);
      if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'item ficou' : 'itens ficaram'} para a próxima execução`);
      const fontesComFalha = [
        ...(falhas > 0 || vazios > 0 ? [FONTE_UNIDADES_ITENS] : []),
        ...(falhasAdesoes > 0 ? [FONTE_ADESOES_ITENS] : [])
      ];
      return problemas.length > 0
        ? { status: 'PARCIAL', total: copiados, fontesComFalha, mensagem: `${problemas.join(' e ')}.` }
        : { status: 'SUCESSO', total: copiados, fontesComFalha: [] };
    }
  );
}

// ------------------------------------------------------------------------------
// Leitura da cópia (tela do Item)
// ------------------------------------------------------------------------------

export interface CopiaUnidadesItem {
  unidades: UnidadeItemRecord[];
  /** Quando a lista guardada foi lida do Compras.gov.br. */
  copiadoEm: string;
}

/** Última lista válida de órgãos do item guardada no banco; nula quando ainda não há cópia. */
export async function lerCopiaUnidadesItem(itemKey: string): Promise<CopiaUnidadesItem | null> {
  if (!supabase || !itemKey) return null;
  const { data, error } = await supabase
    .from('itens_ata_unidades_copia')
    .select('unidades, copiado_em')
    .eq('item_key', itemKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.copiado_em || !Array.isArray(data.unidades) || data.unidades.length === 0) return null;
  return { unidades: data.unidades as UnidadeItemRecord[], copiadoEm: data.copiado_em };
}

export interface CopiaAdesoesItem {
  /** Lista lida com a API de pé; vazia quando o item não tinha adesão naquele momento. */
  adesoes: AdesaoItemRecord[];
  copiadoEm: string;
}

/** Última lista de adesões do item guardada no banco; nula quando ainda não há leitura confiável. */
export async function lerCopiaAdesoesItem(itemKey: string): Promise<CopiaAdesoesItem | null> {
  if (!supabase || !itemKey) return null;
  const { data, error } = await supabase
    .from('itens_ata_unidades_copia')
    .select('adesoes, adesoes_copiado_em')
    .eq('item_key', itemKey)
    .maybeSingle();
  if (error) throw error;
  if (!data?.adesoes_copiado_em || !Array.isArray(data.adesoes)) return null;
  return { adesoes: data.adesoes as AdesaoItemRecord[], copiadoEm: data.adesoes_copiado_em };
}

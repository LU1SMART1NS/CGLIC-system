/**
 * Atas de outros órgãos em que a SENASP (UASGs 200330/200331) é participante ou fez adesão, guardadas no banco
 * (atas_participacao e itens_ata_participacao, migration 105), em segundo plano e sob a trava do banco
 * (recurso 'atas_participacao', por UASG da carteira).
 *
 * Nenhuma API pública filtra atas por órgão participante: o Compras.gov.br (1_consultarARP) e o PNCP só filtram
 * pela gerenciadora. A descoberta parte dos contratos já sincronizados: o idCompra de cada contrato começa com a
 * UASG que fez a licitação. Para cada compra de outra UASG:
 *   1. lista as atas da gerenciadora (1_consultarARP) e fica com as da compra;
 *   2. lê os itens de cada ata (2.1_consultarARPItem_Id);
 *   3. confere em cada item se 200330/200331 está entre as unidades (3_consultarUnidadesItem) — PARTICIPANTE,
 *      com a quantidade registrada — ou, se não estiver, se tem adesão aprovada (5_consultarAdesoesItem) — ADESAO.
 * Só entra no banco o que a fonte confirmou. Item com lista de unidades vazia é tratado como "sem resposta"
 * (todo item tem ao menos a gerenciadora), e a compra é relida mais cedo. Nada é apagado.
 *
 * Incremental: compra nunca lida primeiro; depois as de leitura mais antiga, conforme a validade
 * (comprasParaLer). Uma consulta por vez, dentro de um orçamento de tempo; o que não couber fica para a próxima
 * execução (PARCIAL). Cada compra é gravada assim que termina, então o progresso não se perde.
 */
import { supabase } from './supabaseClient';
import { buildQueryString, enrichArpWithPncpVigencia, fetchComNovaTentativa, fetchPncpAtaVigencia, splitDateRange } from './api';
import {
  executarComReserva,
  mensagemDeErro,
  VALIDADE_PADRAO,
  type ResultadoConcluido,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import type { AdesaoItemRecord, ArpRecord, UnidadeItemRecord } from '../types';

export const RECURSO_ATAS_PARTICIPACAO = 'atas_participacao' as const;
export const FONTE_ATAS_PARTICIPACAO = 'Atas em que a SENASP participa';

/**
 * Tempo máximo consultando as fontes numa execução. A Edge Function tem 150 s e uma consulta em andamento não é
 * interrompida: no ensaio de 09/10/2026 consultas isoladas do Compras.gov.br levaram até 26 s, daí a folga maior
 * que a dos outros recursos (100 s).
 */
export const ORCAMENTO_ATAS_PARTICIPACAO_MS = 75_000;

/**
 * Compras mais antigas que isto ficam de fora: a ata dura no máximo dois anos (com prorrogação) e o módulo de atas
 * do Compras.gov.br não tem as de compras antigas (as de 2016 a 2021 vieram sem ata no ensaio de 09/10/2026).
 */
export const ANOS_DE_COMPRA = 4;

const BASE_ARP = '/api-arp/modulo-arp';
const FONTE = 'Compras.gov.br';
/** O módulo ARP recusa (429) com três consultas em paralelo; com uma por vez e esperas crescentes, passa. */
const TENTATIVAS = 3;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Validade de cada leitura de compra. */
export const RELEITURA_PARTICIPACAO = {
  /** Compra com ata vigente: a quantidade e o saldo mudam; relê uma vez por dia. */
  comAtaVigenteEmHoras: 24,
  /** Compra recente ainda sem ata no Compras.gov.br (que atrasa semanas): relê uma vez por dia. */
  recenteSemAtaEmHoras: 24,
  /** Leitura incompleta (falha ou unidades vazias): tenta de novo depois de 6 horas. */
  incompletaEmHoras: 6,
  /** Demais (atas encerradas, compras antigas sem ata): uma vez por mês. */
  demaisEmDias: 30,
  /** Compra deste ano ou do anterior conta como recente. */
  anosRecentes: 1
};

export type PapelDaSenasp = 'PARTICIPANTE' | 'ADESAO';

export interface CompraDeOutraUasg {
  /** 17 dígitos: UASG da compra (6) + modalidade (2) + número (5) + ano (4). */
  idCompra: string;
  uasgCompra: string;
  modalidade: string;
  numero: string;
  ano: string;
  /** Contratos da carteira que citam esta compra. */
  contratos: number;
}

export interface LeituraDaCompra {
  lidoEm: string;
  leituraCompleta: boolean;
  temAtaVigente: boolean;
  atasEncontradas: number;
}

export interface ItemDaParticipacao {
  numeroItem: string;
  descricao: string;
  fornecedorCnpjCpf: string | null;
  fornecedorNome: string | null;
  quantidadeHomologada: number | null;
  valorUnitario: number | null;
  maximoAdesao: number | null;
  papel: PapelDaSenasp;
  /** Participante: quantidade registrada para a UASG. Adesão: soma das quantidades aprovadas. */
  quantidadeSenasp: number | null;
  /** Participante: registro da UASG na consulta 3 (com saldos). Adesão: as adesões aprovadas. */
  unidade: Partial<UnidadeItemRecord> | null;
  adesoes: AdesaoItemRecord[];
}

export interface AtaDaParticipacao {
  numeroAta: string;
  uasgGerenciadora: string;
  nomeGerenciadora: string;
  /** UASG da SENASP que participa ou aderiu (200330 ou 200331). */
  uasgSenasp: string;
  /** PARTICIPANTE se algum item tem a SENASP como participante; senão ADESAO. */
  papel: PapelDaSenasp;
  idCompra: string;
  numeroCompra: string;
  anoCompra: string;
  modalidade: string;
  objeto: string;
  dataVigenciaInicial: string | null;
  dataVigenciaFinal: string | null;
  statusAta: string;
  numeroControlePncp: string;
  quantidadeItensAta: number;
  itens: ItemDaParticipacao[];
}

export interface ResultadoDaCompra {
  compra: CompraDeOutraUasg;
  /** Atas da compra achadas na gerenciadora (com ou sem SENASP). */
  atasDaCompra: number;
  /** Atas com a SENASP (uma por UASG da SENASP envolvida). */
  atas: AtaDaParticipacao[];
  /** Atas da compra sem a SENASP, confirmadas pela consulta de unidades. */
  atasSemSenasp: number;
  /** Itens sem resposta da consulta de unidades ou com falha; a compra é relida mais cedo. */
  itensSemResposta: number;
  leituraCompleta: boolean;
  temAtaVigente: boolean;
}

// ------------------------------------------------------------------------------
// Regras (sem rede)
// ------------------------------------------------------------------------------


/** Decompõe um idCompra de 17 dígitos; nulo se não tiver o formato. */
export function decomporIdCompra(idCompra: string | null | undefined): Omit<CompraDeOutraUasg, 'contratos'> | null {
  const id = String(idCompra ?? '').replace(/\D/g, '');
  if (id.length !== 17) return null;
  const ano = id.slice(13, 17);
  if (!/^(19|20)\d{2}$/.test(ano)) return null;
  return { idCompra: id, uasgCompra: id.slice(0, 6), modalidade: id.slice(6, 8), numero: id.slice(8, 13), ano };
}

/** Compras de outras UASGs citadas nos contratos, com quantos contratos citam cada uma. */
export function comprasDeOutrasUasgs(idsCompra: Array<string | null | undefined>, uasgsCglic: readonly string[] = UASGS_CGLIC): CompraDeOutraUasg[] {
  const porId = new Map<string, CompraDeOutraUasg>();
  for (const bruto of idsCompra) {
    const c = decomporIdCompra(bruto);
    if (!c || uasgsCglic.includes(c.uasgCompra)) continue;
    const atual = porId.get(c.idCompra);
    if (atual) atual.contratos++;
    else porId.set(c.idCompra, { ...c, contratos: 1 });
  }
  return [...porId.values()].sort((a, b) => a.idCompra.localeCompare(b.idCompra));
}

/** Compras que precisam ser lidas agora, das nunca lidas para as de leitura mais antiga. */
export function comprasParaLer(
  compras: CompraDeOutraUasg[],
  leituras: Map<string, LeituraDaCompra>,
  opts: { agora: number; forcar?: boolean }
): CompraDeOutraUasg[] {
  const anoAtual = new Date(opts.agora).getUTCFullYear();
  const fila: Array<{ compra: CompraDeOutraUasg; lidoEm: number }> = [];
  for (const compra of compras) {
    const leitura = leituras.get(compra.idCompra);
    const lido = leitura ? Date.parse(leitura.lidoEm) : NaN;
    const lidoEm = Number.isNaN(lido) ? -Infinity : lido;
    if (!opts.forcar && leitura && lidoEm !== -Infinity) {
      const recente = Number(compra.ano) >= anoAtual - RELEITURA_PARTICIPACAO.anosRecentes;
      const validade = !leitura.leituraCompleta
        ? RELEITURA_PARTICIPACAO.incompletaEmHoras * HORA_MS
        : leitura.temAtaVigente
          ? RELEITURA_PARTICIPACAO.comAtaVigenteEmHoras * HORA_MS
          : leitura.atasEncontradas === 0 && recente
            ? RELEITURA_PARTICIPACAO.recenteSemAtaEmHoras * HORA_MS
            : RELEITURA_PARTICIPACAO.demaisEmDias * DIA_MS;
      if (opts.agora - lidoEm < validade) continue;
    }
    fila.push({ compra, lidoEm });
  }
  return fila.sort((a, b) => a.lidoEm - b.lidoEm).map((f) => f.compra);
}

/** Atas da lista da gerenciadora que pertencem à compra (pelo idCompra ou por modalidade + número + ano). */
export function atasDaCompra(atas: ArpRecord[], compra: CompraDeOutraUasg): ArpRecord[] {
  const vistas = new Set<string>();
  return atas.filter((a) => {
    const mesmoId = String(a.idCompra ?? '').replace(/\D/g, '') === compra.idCompra;
    const mesmosCampos =
      String(a.anoCompra ?? '') === compra.ano &&
      Number(a.numeroCompra) === Number(compra.numero) &&
      String(a.codigoModalidadeCompra ?? '').padStart(2, '0') === compra.modalidade;
    if (!mesmoId && !mesmosCampos) return false;
    const chave = `${a.numeroAtaRegistroPreco}-${a.codigoUnidadeGerenciadora}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/** A consulta 2.1 pode repetir o mesmo item: fica um registro por número de item. */
export function deduplicarItens<T extends { numeroItem?: string | number | null }>(itens: T[]): T[] {
  const porNumero = new Map<string, T>();
  for (const it of itens) {
    const n = String(it.numeroItem ?? '').padStart(5, '0');
    if (n !== '00000' && !porNumero.has(n)) porNumero.set(n, it);
  }
  return [...porNumero.values()];
}

const codigoDaUnidade = (u: Partial<UnidadeItemRecord>) => String(u.codigoUnidade ?? '').replace(/\D/g, '');
const numeroOuNulo = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n;
};

/** Campos da unidade guardados (os mesmos da cópia dos órgãos, migration 91). */
const CAMPOS_DA_UNIDADE: ReadonlyArray<keyof UnidadeItemRecord> = [
  'codigoUnidade', 'nomeUnidade', 'tipoUnidade', 'quantidadeRegistrada', 'saldoRemanejamentoEmpenho',
  'saldoAdesoes', 'qtdLimiteAdesao', 'qtdLimiteInformadoCompra', 'aceitaAdesao', 'dataHoraAtualizacao'
];
function unidadeParaGravar(u: Partial<UnidadeItemRecord>): Partial<UnidadeItemRecord> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_DA_UNIDADE) if (u[campo] !== undefined) out[campo] = u[campo];
  return out as Partial<UnidadeItemRecord>;
}

/**
 * Papel de uma UASG da SENASP num item: PARTICIPANTE quando está na lista de unidades; ADESAO quando não está e
 * tem adesão aprovada; nulo quando não tem nenhum dos dois. Lista de unidades vazia não chega aqui (sem resposta).
 */
export function papelNoItem(
  uasgSenasp: string,
  unidades: Array<Partial<UnidadeItemRecord>>,
  adesoes: AdesaoItemRecord[]
): { papel: PapelDaSenasp; quantidade: number | null; unidade: Partial<UnidadeItemRecord> | null; adesoes: AdesaoItemRecord[] } | null {
  const unidade = unidades.find((u) => codigoDaUnidade(u) === uasgSenasp && String(u.tipoUnidade ?? '').toUpperCase() !== 'GERENCIADORA');
  if (unidade) {
    return { papel: 'PARTICIPANTE', quantidade: numeroOuNulo(unidade.quantidadeRegistrada), unidade: unidadeParaGravar(unidade), adesoes: [] };
  }
  const daUasg = adesoes.filter((a) => String(a.unidadeNaoParticipante ?? '').replace(/\D/g, '').startsWith(uasgSenasp));
  if (daUasg.length === 0) return null;
  const quantidades = daUasg.map((a) => numeroOuNulo(a.quantidadeAprovadaAdesao));
  const quantidade = quantidades.some((q) => q === null) ? null : quantidades.reduce<number>((s, q) => s + (q as number), 0);
  return { papel: 'ADESAO', quantidade, unidade: null, adesoes: daUasg };
}

// ------------------------------------------------------------------------------
// Consultas às fontes (estritas: falha da fonte vira erro, nunca "não há dados")
// ------------------------------------------------------------------------------

async function getJson<T>(caminho: string, params: Record<string, string | number | undefined>): Promise<T> {
  const response = await fetchComNovaTentativa(`${BASE_ARP}/${caminho}${buildQueryString(params)}`, FONTE, TENTATIVAS);
  if (!response.ok) throw new Error(`${FONTE} respondeu ${response.status} em ${caminho}.`);
  return (await response.json()) as T;
}

/** Interrompe a leitura de uma compra quando o tempo da execução acaba (a compra fica para a próxima). */
export class TempoEsgotadoError extends Error {
  constructor() {
    super('Tempo da execução esgotado.');
    this.name = 'TempoEsgotadoError';
  }
}

type Pagina<T> = { resultado?: T[]; paginasRestantes?: number };

export interface FontesDaParticipacao {
  /** Para entre as páginas quando `tempoEsgotado` responde sim (lança TempoEsgotadoError). */
  atasDaGerenciadora: (uasg: string, anoInicial: number, hoje: string, tempoEsgotado?: () => boolean) => Promise<ArpRecord[]>;
  itensDaAta: (numeroControlePncpAta: string) => Promise<Array<Record<string, unknown>>>;
  unidadesDoItem: (numeroAta: string, uasgGerenciadora: string, numeroItem: string) => Promise<UnidadeItemRecord[]>;
  adesoesDoItem: (numeroAta: string, uasgGerenciadora: string, numeroItem: string, unidade: string) => Promise<AdesaoItemRecord[]>;
  /**
   * Vigência atualizada (prorrogações e cancelamento) no PNCP; a ata cuja consulta falha fica como veio.
   * Só lê: não pode gravar nada (o teste sem gravar usa as mesmas fontes).
   */
  vigenciasPncp: (atas: ArpRecord[]) => Promise<ArpRecord[]>;
}

export const FONTES_PADRAO: FontesDaParticipacao = {
  async atasDaGerenciadora(uasg, anoInicial, hoje, tempoEsgotado) {
    const todas: ArpRecord[] = [];
    for (const faixa of splitDateRange(`${anoInicial}-01-01`, hoje)) {
      for (let pagina = 1; ; pagina++) {
        if (tempoEsgotado?.()) throw new TempoEsgotadoError();
        const d = await getJson<Pagina<ArpRecord>>('1_consultarARP', {
          pagina,
          tamanhoPagina: 500,
          codigoUnidadeGerenciadora: uasg,
          dataVigenciaInicialMin: faixa.start,
          dataVigenciaInicialMax: faixa.end
        });
        todas.push(...(d.resultado ?? []));
        if (!d.paginasRestantes || d.paginasRestantes <= 0) break;
      }
    }
    return todas;
  },
  async itensDaAta(numeroControlePncpAta) {
    const d = await getJson<Pagina<Record<string, unknown>> | Array<Record<string, unknown>>>('2.1_consultarARPItem_Id', { numeroControlePncpAta });
    return Array.isArray(d) ? d : d.resultado ?? [];
  },
  async unidadesDoItem(numeroAta, uasgGerenciadora, numeroItem) {
    const d = await getJson<Pagina<UnidadeItemRecord>>('3_consultarUnidadesItem', {
      pagina: 1, tamanhoPagina: 500, numeroAta, unidadeGerenciadora: uasgGerenciadora, numeroItem: numeroItem.padStart(5, '0')
    });
    return d.resultado ?? [];
  },
  async adesoesDoItem(numeroAta, uasgGerenciadora, numeroItem, unidade) {
    const d = await getJson<Pagina<AdesaoItemRecord>>('5_consultarAdesoesItem', {
      pagina: 1, tamanhoPagina: 500, numeroAta, unidadeGerenciadora: uasgGerenciadora, numeroItem: numeroItem.padStart(5, '0'), unidade
    });
    return d.resultado ?? [];
  },
  async vigenciasPncp(atas) {
    // Ata por ata e sem enrichArpsBatchWithPncpVigencia: aquela função grava a lista em atas_registro_preco quando
    // a vigência muda, e assim as atas de outros órgãos entravam na tabela das atas gerenciadas (09/10/2026).
    const lidas: ArpRecord[] = [];
    for (const arp of atas) {
      try {
        lidas.push(enrichArpWithPncpVigencia(arp, await fetchPncpAtaVigencia(arp.numeroControlePncpAta)));
      } catch (err) {
        console.warn(`[atasParticipacao] vigência do PNCP da ata ${arp.numeroAtaRegistroPreco} não lida; fica a do Compras.gov.br:`, mensagemDeErro(err));
        lidas.push(arp);
      }
    }
    return lidas;
  }
};

/**
 * Lê nas fontes uma compra de outra UASG e devolve as atas em que a SENASP aparece.
 * `atasDaGerenciadora` vem de fora porque várias compras da mesma UASG reaproveitam a mesma lista.
 */
export async function lerCompraNasFontes(
  compra: CompraDeOutraUasg,
  listaDaGerenciadora: ArpRecord[],
  opts: { fontes?: FontesDaParticipacao; hoje: string; tempoEsgotado?: () => boolean; uasgsSenasp?: readonly string[] }
): Promise<ResultadoDaCompra> {
  const fontes = opts.fontes ?? FONTES_PADRAO;
  const uasgsSenasp = opts.uasgsSenasp ?? UASGS_CGLIC;
  const daCompra = await fontes.vigenciasPncp(atasDaCompra(listaDaGerenciadora, compra));
  const atas: AtaDaParticipacao[] = [];
  let atasSemSenasp = 0;
  let itensSemResposta = 0;
  let temAtaVigente = false;

  for (const arp of daCompra) {
    if (opts.tempoEsgotado?.()) throw new TempoEsgotadoError();
    const vigenciaFinal = (arp.dataVigenciaFinalPncp || arp.dataVigenciaFinal || '').slice(0, 10) || null;
    const cancelada = Boolean(arp.isCanceladaPncp) || /cancelad/i.test(arp.statusAta || '');
    let itensBrutos: Array<Record<string, unknown>>;
    try {
      itensBrutos = deduplicarItens(await fontes.itensDaAta(arp.numeroControlePncpAta));
    } catch (err) {
      console.warn(`[atasParticipacao] itens da ata ${arp.numeroAtaRegistroPreco}/${arp.codigoUnidadeGerenciadora} não lidos:`, mensagemDeErro(err));
      itensSemResposta++;
      continue;
    }
    const porUasg = new Map<string, ItemDaParticipacao[]>();
    let semRespostaNaAta = 0;
    for (const bruto of itensBrutos) {
      if (opts.tempoEsgotado?.()) throw new TempoEsgotadoError();
      const numeroItem = String(bruto.numeroItem ?? '').padStart(5, '0');
      let unidades: UnidadeItemRecord[];
      try {
        unidades = await fontes.unidadesDoItem(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, numeroItem);
      } catch (err) {
        console.warn(`[atasParticipacao] unidades do item ${numeroItem} da ata ${arp.numeroAtaRegistroPreco} não lidas:`, mensagemDeErro(err));
        semRespostaNaAta++;
        continue;
      }
      if (unidades.length === 0) {
        semRespostaNaAta++;
        continue;
      }
      for (const uasgSenasp of uasgsSenasp) {
        let adesoes: AdesaoItemRecord[] = [];
        const participa = unidades.some((u) => codigoDaUnidade(u) === uasgSenasp);
        if (!participa) {
          try {
            adesoes = await fontes.adesoesDoItem(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, numeroItem, uasgSenasp);
          } catch (err) {
            console.warn(`[atasParticipacao] adesões do item ${numeroItem} da ata ${arp.numeroAtaRegistroPreco} não lidas:`, mensagemDeErro(err));
            semRespostaNaAta++;
            continue;
          }
        }
        const papel = papelNoItem(uasgSenasp, unidades, adesoes);
        if (!papel) continue;
        const lista = porUasg.get(uasgSenasp) ?? [];
        lista.push({
          numeroItem,
          descricao: String(bruto.descricaoItem ?? bruto.nomePdm ?? '').trim() || 'Descrição não informada pela fonte oficial',
          fornecedorCnpjCpf: String(bruto.niFornecedor ?? '').trim() || null,
          fornecedorNome: String(bruto.nomeRazaoSocialFornecedor ?? '').trim() || null,
          quantidadeHomologada: numeroOuNulo(bruto.quantidadeHomologadaVencedor ?? bruto.quantidadeHomologadaItem),
          valorUnitario: numeroOuNulo(bruto.valorUnitario),
          maximoAdesao: numeroOuNulo(bruto.maximoAdesao),
          papel: papel.papel,
          quantidadeSenasp: papel.quantidade,
          unidade: papel.unidade,
          adesoes: papel.adesoes
        });
        porUasg.set(uasgSenasp, lista);
      }
    }
    itensSemResposta += semRespostaNaAta;
    if (porUasg.size === 0) {
      if (semRespostaNaAta === 0) atasSemSenasp++;
      continue;
    }
    if (!cancelada && vigenciaFinal && vigenciaFinal >= opts.hoje) temAtaVigente = true;
    for (const [uasgSenasp, itens] of porUasg) {
      atas.push({
        numeroAta: arp.numeroAtaRegistroPreco,
        uasgGerenciadora: arp.codigoUnidadeGerenciadora,
        nomeGerenciadora: arp.nomeUnidadeGerenciadora || '',
        uasgSenasp,
        papel: itens.some((i) => i.papel === 'PARTICIPANTE') ? 'PARTICIPANTE' : 'ADESAO',
        idCompra: compra.idCompra,
        numeroCompra: compra.numero,
        anoCompra: compra.ano,
        modalidade: arp.nomeModalidadeCompra || '',
        objeto: arp.objeto || '',
        dataVigenciaInicial: (arp.dataVigenciaInicial || '').slice(0, 10) || null,
        dataVigenciaFinal: vigenciaFinal,
        statusAta: cancelada ? 'Cancelada' : arp.statusAta || 'Ata de Registro de Preços',
        numeroControlePncp: arp.numeroControlePncpAta || '',
        quantidadeItensAta: itensBrutos.length,
        itens
      });
    }
  }
  return {
    compra,
    atasDaCompra: daCompra.length,
    atas,
    atasSemSenasp,
    itensSemResposta,
    leituraCompleta: itensSemResposta === 0,
    temAtaVigente
  };
}

// ------------------------------------------------------------------------------
// Banco
// ------------------------------------------------------------------------------

/** idCompra dos contratos da carteira gravados no banco. */
async function fetchIdsCompraDaCarteira(uasg: string): Promise<string[]> {
  const ids: string[] = [];
  if (!supabase) return ids;
  const PAGINA = 1000;
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase
      .from('contratos_oficiais')
      .select('id_compra:registro->>idCompra')
      .eq('uasg', uasg)
      .order('contract_key', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id_compra: string | null }>) if (row.id_compra) ids.push(row.id_compra);
    if (!data || data.length < PAGINA) break;
  }
  return ids;
}

async function fetchLeituras(uasg: string): Promise<Map<string, LeituraDaCompra>> {
  const leituras = new Map<string, LeituraDaCompra>();
  if (!supabase) return leituras;
  const { data, error } = await supabase
    .from('participacao_compras_lidas')
    .select('id_compra, lido_em, leitura_completa, tem_ata_vigente, atas_encontradas')
    .eq('uasg_carteira', uasg);
  if (error) throw error;
  for (const row of data ?? []) {
    leituras.set(String(row.id_compra), {
      lidoEm: row.lido_em,
      leituraCompleta: Boolean(row.leitura_completa),
      temAtaVigente: Boolean(row.tem_ata_vigente),
      atasEncontradas: Number(row.atas_encontradas) || 0
    });
  }
  return leituras;
}

/** Corpo de gravar_atas_participacao (migration 105). */
export function compraParaGravar(r: ResultadoDaCompra): Record<string, unknown> {
  return {
    id_compra: r.compra.idCompra,
    uasg_compra: r.compra.uasgCompra,
    contratos: r.compra.contratos,
    atas_encontradas: r.atasDaCompra,
    leitura_completa: r.leituraCompleta,
    tem_ata_vigente: r.temAtaVigente,
    atas: r.atas.map((a) => ({
      numero_ata: a.numeroAta,
      uasg_gerenciadora: a.uasgGerenciadora,
      nome_gerenciadora: a.nomeGerenciadora,
      uasg_senasp: a.uasgSenasp,
      papel: a.papel,
      id_compra: a.idCompra,
      numero_compra: a.numeroCompra,
      ano_compra: a.anoCompra,
      modalidade: a.modalidade,
      objeto: a.objeto,
      data_vigencia_inicial: a.dataVigenciaInicial,
      data_vigencia_final: a.dataVigenciaFinal,
      status_ata: a.statusAta,
      numero_controle_pncp: a.numeroControlePncp,
      quantidade_itens_ata: a.quantidadeItensAta,
      itens: a.itens.map((i) => ({
        numero_item: i.numeroItem,
        descricao: i.descricao,
        fornecedor_cnpj_cpf: i.fornecedorCnpjCpf,
        fornecedor_razao_social: i.fornecedorNome,
        quantidade_homologada: i.quantidadeHomologada,
        valor_unitario: i.valorUnitario,
        maximo_adesao: i.maximoAdesao,
        papel: i.papel,
        quantidade_senasp: i.quantidadeSenasp,
        unidade: i.unidade,
        adesoes: i.adesoes
      }))
    }))
  };
}

async function gravar(uasg: string, r: ResultadoDaCompra): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('gravar_atas_participacao', { p_uasg: uasg, p_compra: compraParaGravar(r) });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

// ------------------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------------------

export interface ResumoDaDescoberta {
  compras: number;
  /** Compras de outras UASGs com mais de ANOS_DE_COMPRA anos, deixadas de fora. */
  antigas: number;
  pendentes: number;
  lidas: number;
  adiadas: number;
  atasDaCompra: number;
  participante: number;
  adesao: number;
  semSenasp: number;
  itensSemResposta: number;
  falhas: number;
  atas: Array<{ ata: string; gerenciadora: string; uasgSenasp: string; papel: PapelDaSenasp; vigenciaFinal: string | null; itens: number; quantidadeSenasp: number | null }>;
}

/**
 * Percorre a fila de compras dentro do orçamento. `aoLer` recebe cada compra lida por inteiro (grava no banco
 * na sincronização; no teste sem gravar, não faz nada). Compra interrompida pelo tempo não é entregue.
 */
export async function descobrirParticipacoes(
  uasg: string,
  opts: {
    forcar?: boolean;
    orcamentoMs?: number;
    agora?: () => number;
    fontes?: FontesDaParticipacao;
    idsCompra?: string[];
    leituras?: Map<string, LeituraDaCompra>;
    aoLer?: (r: ResultadoDaCompra) => Promise<void>;
  } = {}
): Promise<ResumoDaDescoberta> {
  const agora = opts.agora ?? (() => Date.now());
  const fontes = opts.fontes ?? FONTES_PADRAO;
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_ATAS_PARTICIPACAO_MS;
  const inicio = agora();
  const hoje = new Date(inicio).toISOString().slice(0, 10);
  const tempoEsgotado = () => agora() - inicio > orcamento;

  const todas = comprasDeOutrasUasgs(opts.idsCompra ?? (await fetchIdsCompraDaCarteira(uasg)));
  const anoMinimo = new Date(inicio).getUTCFullYear() - ANOS_DE_COMPRA;
  const compras = todas.filter((c) => Number(c.ano) >= anoMinimo);
  const fila = comprasParaLer(compras, opts.leituras ?? (await fetchLeituras(uasg)), { agora: inicio, forcar: opts.forcar });

  // A lista de atas de cada gerenciadora é lida uma vez, desde o ano da compra mais antiga dela na fila.
  const anoInicial = new Map<string, number>();
  for (const c of fila) anoInicial.set(c.uasgCompra, Math.min(anoInicial.get(c.uasgCompra) ?? Infinity, Number(c.ano)));
  const listas = new Map<string, ArpRecord[]>();

  const resumo: ResumoDaDescoberta = {
    compras: compras.length, antigas: todas.length - compras.length, pendentes: fila.length, lidas: 0, adiadas: 0, atasDaCompra: 0,
    participante: 0, adesao: 0, semSenasp: 0, itensSemResposta: 0, falhas: 0, atas: []
  };
  for (let i = 0; i < fila.length; i++) {
    if (tempoEsgotado()) {
      resumo.adiadas = fila.length - i;
      break;
    }
    const compra = fila[i];
    try {
      let lista = listas.get(compra.uasgCompra);
      if (!lista) {
        lista = await fontes.atasDaGerenciadora(compra.uasgCompra, anoInicial.get(compra.uasgCompra) ?? Number(compra.ano), hoje, tempoEsgotado);
        listas.set(compra.uasgCompra, lista);
      }
      const r = await lerCompraNasFontes(compra, lista, { fontes, hoje, tempoEsgotado });
      await opts.aoLer?.(r);
      resumo.lidas++;
      resumo.atasDaCompra += r.atasDaCompra;
      resumo.semSenasp += r.atasSemSenasp;
      resumo.itensSemResposta += r.itensSemResposta;
      for (const a of r.atas) {
        if (a.papel === 'PARTICIPANTE') resumo.participante++;
        else resumo.adesao++;
        const qtds = a.itens.map((it) => it.quantidadeSenasp);
        resumo.atas.push({
          ata: a.numeroAta,
          gerenciadora: a.uasgGerenciadora,
          uasgSenasp: a.uasgSenasp,
          papel: a.papel,
          vigenciaFinal: a.dataVigenciaFinal,
          itens: a.itens.length,
          quantidadeSenasp: qtds.some((q) => q === null) ? null : qtds.reduce<number>((s, q) => s + (q as number), 0)
        });
      }
    } catch (err) {
      if (err instanceof TempoEsgotadoError) {
        resumo.adiadas = fila.length - i;
        break;
      }
      resumo.falhas++;
      console.warn(`[atasParticipacao] compra ${compra.idCompra} não lida:`, mensagemDeErro(err));
    }
  }
  return resumo;
}

/** Mensagem e status da execução a partir do resumo. */
export function concluirDescoberta(resumo: ResumoDaDescoberta, gravadas: number): ResultadoConcluido {
  const problemas: string[] = [];
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (resumo.falhas > 0) problemas.push(`${plural(resumo.falhas, 'compra não foi lida', 'compras não foram lidas')} no Compras.gov.br`);
  if (resumo.itensSemResposta > 0) problemas.push(`o Compras.gov.br não devolveu as unidades de ${plural(resumo.itensSemResposta, 'item', 'itens')}`);
  if (resumo.adiadas > 0) problemas.push(`${plural(resumo.adiadas, 'compra ficou', 'compras ficaram')} para a próxima execução`);
  return problemas.length > 0
    ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [FONTE_ATAS_PARTICIPACAO], mensagem: `${problemas.join(' e ')}.` }
    : { status: 'SUCESSO', total: gravadas, fontesComFalha: [] };
}

/** Teste sem gravar (servidor, dry): faz a descoberta inteira dentro do orçamento e devolve o que acharia. */
export async function testarAtasParticipacao(uasg: string, opts: { orcamentoMs?: number } = {}): Promise<ResumoDaDescoberta> {
  // Não lê o registro de leituras: o teste vale antes de a migration 105 ser aplicada e lê a fila toda.
  return descobrirParticipacoes((uasg || '').trim(), { forcar: true, orcamentoMs: opts.orcamentoMs, leituras: new Map() });
}

export async function sincronizarAtasParticipacao(
  uasg: string,
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  return executarComReserva(
    RECURSO_ATAS_PARTICIPACAO,
    cleanUasg,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      let gravadas = 0;
      const resumo = await descobrirParticipacoes(cleanUasg, {
        forcar: opts.forcar,
        orcamentoMs: opts.orcamentoMs,
        agora: opts.agora,
        aoLer: async (r) => {
          gravadas += await gravar(cleanUasg, r);
        }
      });
      return concluirDescoberta(resumo, gravadas);
    }
  );
}

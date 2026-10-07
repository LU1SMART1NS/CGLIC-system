/**
 * Previsão mensal de pagamentos (Portaria DGFNSP 50/2025, art. 5º, § 2º, III): até o último dia útil de cada mês, a
 * CGLIC informa os pagamentos previstos para o mês seguinte (contrato, contratada, UG do empenho, nota de empenho,
 * subitem, valor). As linhas saem de:
 *   FATURA   faturas do Contratos.gov.br ainda não pagas (fora de ciclo em aberto);
 *   CICLO    ciclos de pagamento em aberto (um por nota fiscal do item "DO PAGAMENTO");
 *   MENSAL   contratos marcados como mensais sem fatura nem ciclo em aberto (valor mensal informado ou média de 3 meses);
 *   ENTREGA  entregas previstas para o mês da previsão;
 *   MANUAL   linhas incluídas à mão.
 * Os ajustes do mês (retirar, corrigir valor/subitem, marcar emenda) ficam em previsao_pagamentos_ajustes (migration 90).
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { isBusinessDay } from './temporalEngineService';
import type { FaturaCarteira, EmpenhoCarteiraRow } from './financeiroCarteiraService';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';
import type { EntregaPrevista, ExpectativaPagamento, HistoricoPagamentos } from './expectativaPagamentoService';

export type OrigemPrevisao = 'FATURA' | 'CICLO' | 'MENSAL' | 'ENTREGA' | 'MANUAL';

export interface LinhaPrevisao {
  chave: string;
  origem: OrigemPrevisao;
  contractKey: string;
  ug: string;
  /** Número da nota de empenho (ex.: 2026NE000412). */
  empenho: string | null;
  empenhoKey: string | null;
  subitem: string | null;
  valor: number;
  /** Valor antes do ajuste do usuário. */
  valorOriginal: number;
  emenda: boolean;
  /** O que o sistema concluiu sozinho pelo plano interno do empenho. */
  emendaAutomatica: boolean;
  retirada: boolean;
  ajustada: boolean;
  /** De onde veio o valor (ex.: "NF 231 · liquidada", "média de 3 meses"). */
  detalhe: string;
  /** Empenho sem saldo para todas as linhas dele. */
  semSaldo: boolean;
  /** Contrato mensal sem valor (sem pagamentos e sem valor mensal informado): precisa de ajuste. */
  semValor: boolean;
}

export interface AjustePrevisao {
  chave: string;
  retirada: boolean;
  valor: number | null;
  subitem: string | null;
  emenda: boolean | null;
  contractKey: string | null;
  empenhoKey: string | null;
  descricao: string | null;
  ajustadoPorNome: string | null;
}

export interface EnvioPrevisao {
  mes: string;
  sei: string;
  enviadoEm: string;
  total: number;
  linhas: Array<Record<string, unknown>>;
  enviadoPorNome: string | null;
}

export interface PrazoEmenda {
  ano: number;
  mes: number;
  dataLimite: string;
  portaria: string;
}

// -----------------------------------------------------------------------------------------------------
// Datas
// -----------------------------------------------------------------------------------------------------

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Último dia útil do mês (AAAA-MM), pelo calendário de feriados do sistema. */
export function ultimoDiaUtil(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m, 0);
  while (!isBusinessDay(d)) d.setDate(d.getDate() - 1);
  return iso(d);
}

/** Mês anterior / seguinte (AAAA-MM). */
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Prazo para informar a previsão de um mês: o último dia útil do mês anterior (Portaria 50, art. 5º, § 2º, III). */
export function prazoDaPrevisao(mesAlvo: string): string {
  return ultimoDiaUtil(somarMes(mesAlvo, -1));
}

/** Mês da próxima previsão a informar: o seguinte ao atual; depois do último dia útil, o seguinte a ele. */
export function mesDaProximaPrevisao(hoje: Date = new Date()): string {
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  return iso(hoje) > ultimoDiaUtil(atual) ? somarMes(atual, 2) : somarMes(atual, 1);
}

// -----------------------------------------------------------------------------------------------------
// Emendas (§ 3º): o plano interno do empenho costuma trazer o número da emenda (12 dígitos começando pelo ano) ou as
// palavras "emenda"/"bancada". É uma dedução: o usuário corrige na linha.
// -----------------------------------------------------------------------------------------------------
export function ehEmendaPeloPlanoInterno(planoInterno?: string | null): boolean {
  if (!planoInterno) return false;
  return /\b20\d{10}\b/.test(planoInterno) || /\b(emenda|bancada)\b/i.test(planoInterno);
}

// -----------------------------------------------------------------------------------------------------
// Montagem
// -----------------------------------------------------------------------------------------------------

export interface DadosDaPrevisao {
  mesAlvo: string;
  faturas: FaturaCarteira[];
  ciclos: PaymentFollowUpCycle[];
  ligacoes: Array<{ cycle_id: string; id_fatura: number }>;
  empenhos: EmpenhoCarteiraRow[];
  marcas: Map<string, ExpectativaPagamento>;
  entregas: EntregaPrevista[];
  historicos: Map<string, HistoricoPagamentos>;
  ajustes: AjustePrevisao[];
  /** Contratos vigentes no escopo (os mensais só entram se estiverem aqui). */
  contratosVigentes: Set<string>;
}

const numeroDaChave = (canonicalKey?: string | null) => (canonicalKey ? canonicalKey.split('-').pop() ?? canonicalKey : null);
const ugDaChave = (canonicalKey?: string | null) => (canonicalKey ? canonicalKey.split('-')[0] : null);
const moedaCurta = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function montarPrevisao(d: DadosDaPrevisao): LinhaPrevisao[] {
  const empenhosDoContrato = new Map<string, EmpenhoCarteiraRow[]>();
  const empenhoPorKey = new Map<string, EmpenhoCarteiraRow>();
  for (const e of d.empenhos) {
    for (const k of e.contractKeys) empenhosDoContrato.set(k, [...(empenhosDoContrato.get(k) ?? []), e]);
  }
  for (const e of d.empenhos) if (e.canonicalKey) empenhoPorKey.set(e.canonicalKey, e);
  const acharEmpenho = (contractKey: string, numero: string | null) =>
    numero ? (empenhosDoContrato.get(contractKey) ?? []).find((e) => e.numero === numero) : undefined;
  const emendaDe = (e?: EmpenhoCarteiraRow) => ehEmendaPeloPlanoInterno(e?.planoInterno);

  const base: Array<Omit<LinhaPrevisao, 'valor' | 'emenda' | 'retirada' | 'ajustada' | 'semSaldo'>> = [];
  const contratosComLinha = new Set<string>();

  // Ciclos em aberto (as faturas ligadas a eles saem da lista de faturas).
  const ciclosAbertos = d.ciclos.filter((c) => c.status !== 'PAGO' && c.status !== 'CANCELADO');
  const idsCiclos = new Set(ciclosAbertos.map((c) => c.id));
  const faturasEmCiclo = new Set(d.ligacoes.filter((l) => idsCiclos.has(l.cycle_id)).map((l) => Number(l.id_fatura)));
  for (const c of ciclosAbertos) {
    const itens = c.itens ?? [];
    const partes = itens.length > 0
      ? itens.map((i, n) => ({ n, empenhoKey: i.empenhoCanonicalKey, subitem: i.subelemento ?? null, valor: i.valorAPagar, nf: i.notaFiscal }))
      : [{ n: 0, empenhoKey: c.input.empenhoCanonicalKey ?? null, subitem: null, valor: c.input.valorAtesto, nf: null as string | null }];
    for (const p of partes) {
      const e = p.empenhoKey ? empenhoPorKey.get(p.empenhoKey) : undefined;
      base.push({
        chave: `ciclo-${c.cycleKey}-${p.n}`,
        origem: 'CICLO',
        contractKey: c.contractKey,
        ug: ugDaChave(p.empenhoKey) ?? c.contractKey.slice(0, 6),
        empenho: e?.numero ?? numeroDaChave(p.empenhoKey),
        empenhoKey: p.empenhoKey ?? null,
        subitem: p.subitem,
        valorOriginal: p.valor,
        emendaAutomatica: emendaDe(e),
        detalhe: `Ciclo ${p.nf ? `NF ${p.nf}` : `atesto ${c.input.documentoAtestoSei}`}`,
        semValor: false
      });
      contratosComLinha.add(c.contractKey);
    }
  }

  // Faturas ainda não pagas, fora de ciclo em aberto.
  for (const f of d.faturas) {
    if (f.paga || f.cancelada || faturasEmCiclo.has(f.idFatura)) continue;
    const numero = f.empenhos ? f.empenhos.split(',')[0].trim() : null;
    const e = acharEmpenho(f.contractKey, numero);
    base.push({
      chave: `fatura-${f.idFatura}`,
      origem: 'FATURA',
      contractKey: f.contractKey,
      ug: e?.uasgEmitente ?? f.contractKey.slice(0, 6),
      empenho: numero,
      empenhoKey: e?.canonicalKey ?? null,
      subitem: null,
      valorOriginal: f.valorLiquido,
      emendaAutomatica: emendaDe(e),
      detalhe: `NF ${f.numero ?? f.idFatura}${f.referencia ? ` · ref. ${f.referencia}` : ''} · ${f.dataLiquidacao ? 'liquidada' : f.situacao || 'em andamento'}`,
      semValor: false
    });
    contratosComLinha.add(f.contractKey);
  }

  // Contratos mensais ainda sem fatura nem ciclo em aberto.
  for (const [contractKey, marca] of d.marcas) {
    if (marca.tipo !== 'MENSAL' || !d.contratosVigentes.has(contractKey) || contratosComLinha.has(contractKey)) continue;
    const historico = d.historicos.get(contractKey);
    const valor = marca.valorMensal ?? historico?.media ?? 0;
    const e = [...(empenhosDoContrato.get(contractKey) ?? [])].sort((a, b) => (b.saldo ?? 0) - (a.saldo ?? 0))[0];
    base.push({
      chave: `mensal-${contractKey}`,
      origem: 'MENSAL',
      contractKey,
      ug: e?.uasgEmitente ?? contractKey.slice(0, 6),
      empenho: e?.numero ?? null,
      empenhoKey: e?.canonicalKey ?? null,
      subitem: null,
      valorOriginal: valor,
      emendaAutomatica: emendaDe(e),
      detalhe: marca.valorMensal
        ? 'valor mensal informado'
        : historico?.media
          ? `média de ${historico.mesesComPagamento} ${historico.mesesComPagamento === 1 ? 'mês' : 'meses'} (${moedaCurta(historico.menor ?? 0)} a ${moedaCurta(historico.maior ?? 0)})`
          : 'sem pagamentos para a média: informe o valor',
      semValor: valor <= 0
    });
  }

  // Entregas previstas no mês da previsão.
  for (const ent of d.entregas) {
    if (ent.situacao !== 'PREVISTA' || ent.dataPrevista.slice(0, 7) !== d.mesAlvo) continue;
    const e = ent.empenhoCanonicalKey ? empenhoPorKey.get(ent.empenhoCanonicalKey) : undefined;
    base.push({
      chave: `entrega-${ent.id}`,
      origem: 'ENTREGA',
      contractKey: ent.contractKey,
      ug: ugDaChave(ent.empenhoCanonicalKey) ?? ent.contractKey.slice(0, 6),
      empenho: e?.numero ?? numeroDaChave(ent.empenhoCanonicalKey),
      empenhoKey: ent.empenhoCanonicalKey,
      subitem: null,
      valorOriginal: ent.valor,
      emendaAutomatica: emendaDe(e),
      detalhe: `Entrega prevista: ${ent.descricao}`,
      semValor: false
    });
  }

  // Linhas incluídas à mão.
  for (const a of d.ajustes) {
    if (!a.chave.startsWith('manual-') || !a.contractKey) continue;
    const e = a.empenhoKey ? empenhoPorKey.get(a.empenhoKey) : undefined;
    base.push({
      chave: a.chave,
      origem: 'MANUAL',
      contractKey: a.contractKey,
      ug: ugDaChave(a.empenhoKey) ?? a.contractKey.slice(0, 6),
      empenho: e?.numero ?? numeroDaChave(a.empenhoKey),
      empenhoKey: a.empenhoKey,
      subitem: null,
      valorOriginal: a.valor ?? 0,
      emendaAutomatica: emendaDe(e),
      detalhe: a.descricao ? `Incluída: ${a.descricao}` : 'Incluída à mão',
      semValor: false
    });
  }

  // Ajustes do mês.
  const ajustePorChave = new Map(d.ajustes.map((a) => [a.chave, a]));
  const linhas: LinhaPrevisao[] = base.map((l) => {
    const a = ajustePorChave.get(l.chave);
    const valor = a?.valor ?? l.valorOriginal;
    return {
      ...l,
      valor,
      subitem: a?.subitem ?? l.subitem,
      emenda: a?.emenda ?? l.emendaAutomatica,
      retirada: Boolean(a?.retirada),
      ajustada: Boolean(a && l.origem !== 'MANUAL' && (a.valor != null || a.subitem != null || a.emenda != null)),
      semValor: l.semValor && valor <= 0,
      semSaldo: false
    };
  });

  // Saldo do empenho contra o que as linhas mantidas pedem.
  const pedidoPorEmpenho = new Map<string, number>();
  for (const l of linhas) if (!l.retirada && l.empenhoKey) pedidoPorEmpenho.set(l.empenhoKey, (pedidoPorEmpenho.get(l.empenhoKey) ?? 0) + l.valor);
  for (const l of linhas) {
    const e = l.empenhoKey ? empenhoPorKey.get(l.empenhoKey) : undefined;
    if (!l.retirada && e && e.saldo !== null && (pedidoPorEmpenho.get(l.empenhoKey!) ?? 0) - e.saldo > 0.005) l.semSaldo = true;
  }
  return linhas;
}

/** Tabela "previsão de pagamentos" para colar no documento do SEI (colunas da Portaria 50, § 2º, III). */
export function textoParaSei(
  linhas: LinhaPrevisao[],
  contrato: (contractKey: string) => { numero: string; fornecedorNome?: string; fornecedorCnpj?: string }
): string {
  const n = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cab = ['Contrato', 'Contratada', 'CNPJ', 'UG do empenho', 'Nota de empenho', 'Subitem', 'Valor'];
  const corpo = linhas.map((l) => {
    const c = contrato(l.contractKey);
    return [c.numero, c.fornecedorNome ?? '', c.fornecedorCnpj ?? '', l.ug, l.empenho ?? '', l.subitem ?? '', n(l.valor)];
  });
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return [cab, ...corpo, ['TOTAL', '', '', '', '', '', n(total)]].map((l) => l.join('\t')).join('\n');
}

// -----------------------------------------------------------------------------------------------------
// Banco
// -----------------------------------------------------------------------------------------------------

const primeiroDia = (mes: string) => `${mes}-01`;

export async function fetchAjustesPrevisao(mes: string): Promise<AjustePrevisao[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('previsao_pagamentos_ajustes').select('*').eq('mes', primeiroDia(mes));
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as any[]).map((a) => ({
    chave: a.chave_linha,
    retirada: Boolean(a.retirada),
    valor: a.valor == null ? null : Number(a.valor),
    subitem: a.subitem ?? null,
    emenda: a.emenda ?? null,
    contractKey: a.contract_key ?? null,
    empenhoKey: a.empenho_canonical_key ?? null,
    descricao: a.descricao ?? null,
    ajustadoPorNome: a.ajustado_por_nome ?? null
  }));
}

export async function fetchEnvioPrevisao(mes: string): Promise<EnvioPrevisao | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from('previsao_pagamentos').select('*').eq('mes', primeiroDia(mes)).maybeSingle();
  if (error) throw mapPostgresErrorToAppError(error);
  if (!data) return null;
  const r = data as any;
  return { mes, sei: r.sei, enviadoEm: r.enviado_em, total: Number(r.total), linhas: r.linhas ?? [], enviadoPorNome: r.enviado_por_nome ?? null };
}

export async function fetchPrazosEmendas(): Promise<PrazoEmenda[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('prazos_emendas').select('*').order('ano').order('mes');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as any[]).map((p) => ({ ano: Number(p.ano), mes: Number(p.mes), dataLimite: p.data_limite, portaria: p.portaria }));
}

async function rpc(nome: string, args: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  const { error } = await supabase.rpc(nome, args);
  if (error) throw mapPostgresErrorToAppError(error);
}

export function salvarAjustePrevisao(input: {
  mes: string;
  chave: string;
  retirada?: boolean;
  valor?: number | null;
  subitem?: string | null;
  emenda?: boolean | null;
  contractKey?: string | null;
  empenhoKey?: string | null;
  descricao?: string | null;
  remover?: boolean;
  registradoPorNome?: string;
}): Promise<void> {
  return rpc('salvar_ajuste_previsao', {
    p_mes: primeiroDia(input.mes),
    p_chave_linha: input.chave,
    p_retirada: input.retirada ?? false,
    p_valor: input.valor ?? null,
    p_subitem: input.subitem ?? null,
    p_emenda: input.emenda ?? null,
    p_contract_key: input.contractKey ?? null,
    p_empenho_canonical_key: input.empenhoKey ?? null,
    p_descricao: input.descricao ?? null,
    p_registrado_por_nome: input.registradoPorNome ?? null,
    p_remover: input.remover ?? false
  });
}

export function registrarEnvioPrevisao(input: {
  mes: string;
  sei: string;
  enviadoEm: string;
  linhas: Array<Record<string, unknown>>;
  registradoPorNome?: string;
}): Promise<void> {
  return rpc('registrar_envio_previsao', {
    p_mes: primeiroDia(input.mes),
    p_sei: input.sei,
    p_enviado_em: input.enviadoEm,
    p_linhas: input.linhas,
    p_registrado_por_nome: input.registradoPorNome ?? null
  });
}

export function salvarPrazoEmenda(p: PrazoEmenda): Promise<void> {
  return rpc('salvar_prazo_emenda', { p_ano: p.ano, p_mes: p.mes, p_data_limite: p.dataLimite, p_portaria: p.portaria });
}

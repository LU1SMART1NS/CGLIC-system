/**
 * Sincronização dos empenhos de uma carteira de contratos (UASG 200330 ou 200331), sob a trava do
 * banco (recurso 'empenhos', sincronizacao_fontes). Roda no servidor (Edge Function sincronizar-fontes,
 * agendada) e usa o mesmo serviço do botão do contrato e do lote da Execução Financeira.
 *
 * Quais contratos entram (entraNoLote):
 * - vigente (ou sem data de fim);
 * - vencido há até 24 meses: a execução continua depois do fim da vigência (em 06/10/2026, 106 dos 108
 *   contratos vencidos com fatura liquidada nos últimos 12 meses tinham vencido de 2025 para cá);
 * - com empenho vinculado ainda não pago por inteiro (pega os vencidos antigos depois da primeira
 *   sincronização, feita pelo botão do contrato).
 *
 * Execução incremental: começa pelos contratos consultados há mais tempo (os nunca consultados primeiro),
 * pula os consultados há menos de RECONSULTA_HORAS (salvo forçar) e para quando o orçamento de tempo
 * acaba; o restante fica para a próxima execução, e o resultado é PARCIAL.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { fetchContratosOficiaisDoBanco } from './contratosOficiaisService';
import { sincronizarEmpenhosDoRegistro, situacaoDoResultado, mensagemDoResultado } from './contratoEmpenhosSincronizacaoService';
import { executarComReserva, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { chaveDoContrato } from '../utils/contractKeyUtils';
import type { ContractDashboardRecord } from '../types';

export const RECURSO_EMPENHOS = 'empenhos' as const;
export const FONTE_EMPENHOS_CONTRATOS = 'Empenhos dos contratos (Contratos.gov.br)';
/** Uma execução bem-sucedida vale por 6 horas (mesma validade das demais fontes). */
export const VALIDADE_EMPENHOS = '6 hours';
/** Contrato consultado há menos disso não é consultado de novo numa execução sem forçar. */
export const RECONSULTA_HORAS = 20;
/**
 * Contrato cuja última tentativa falhou ou ficou incompleta (ERRO ou PARCIAL) volta a ser tentado depois
 * disto, e não depois de RECONSULTA_HORAS: o contrato 00065/2021 ficou PARCIAL por falha de comunicação e
 * esperaria 19 horas por uma nova leitura.
 */
export const RETENTATIVA_HORAS = 1;
/** Contrato vencido há até tantos meses continua entrando: a execução segue depois do fim da vigência. */
export const JANELA_VENCIDOS_MESES = 24;
const PAGINA = 1000;

/** Data ISO (AAAA-MM-DD) de `meses` antes de `hoje`. */
export function mesesAntes(hoje: string, meses: number): string {
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

/** O contrato entra na sincronização de empenhos? */
export function entraNoLote(
  contract: Pick<ContractDashboardRecord, 'dataVigenciaFim' | 'id' | 'uasg' | 'numero' | 'ano'>,
  ctx: { hoje: string; comEmpenhoAPagar: Set<string> }
): boolean {
  const fim = String(contract.dataVigenciaFim ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return true; // sem data de fim: não dá para dizer que acabou
  if (fim >= mesesAntes(ctx.hoje, JANELA_VENCIDOS_MESES)) return true;
  return ctx.comEmpenhoAPagar.has(chaveDoContrato(contract));
}

/**
 * Contratos das carteiras informadas que entram na sincronização, sem repetir a mesma chave.
 */
export function selecionarContratos(
  carteiras: Array<ContractDashboardRecord[] | undefined>,
  ctx: { hoje: string; comEmpenhoAPagar: Set<string> }
): ContractDashboardRecord[] {
  const vistos = new Set<string>();
  const lista: ContractDashboardRecord[] = [];
  for (const carteira of carteiras) {
    for (const contrato of carteira || []) {
      const chave = chaveDoContrato(contrato);
      if (!chave || vistos.has(chave) || !entraNoLote(contrato, ctx)) continue;
      vistos.add(chave);
      lista.push(contrato);
    }
  }
  return lista;
}

/**
 * Ordem da execução: nunca consultados primeiro, depois do mais antigo para o mais recente. Sem forçar,
 * tira os consultados há menos de RECONSULTA_HORAS.
 */
export function ordenarParaSincronizar(
  contratos: ContractDashboardRecord[],
  tentativas: Map<string, string>,
  ctx: { agora: number; forcar?: boolean }
): ContractDashboardRecord[] {
  const limite = ctx.agora - RECONSULTA_HORAS * 3600_000;
  const quando = (c: ContractDashboardRecord) => {
    const t = tentativas.get(chaveDoContrato(c));
    return t ? new Date(t).getTime() : -Infinity;
  };
  return contratos
    .filter((c) => ctx.forcar || quando(c) < limite)
    .sort((a, b) => quando(a) - quando(b));
}

async function lerPaginado<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase!.from(tabela).select(colunas).range(from, from + PAGINA - 1);
    if (error) throw error;
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return linhas;
}

/** Contratos com algum empenho vinculado cujo pago ainda é menor que o empenhado. */
export async function contratosComEmpenhoAPagar(): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set();
  const [vinculos, empenhos] = await Promise.all([
    lerPaginado<{ empenho_id: string; contract_key: string }>('contrato_empenhos', 'empenho_id, contract_key'),
    lerPaginado<{ empenho_id: string; valor_empenhado: number; valor_pago: number }>('v_empenhos_resumo', 'empenho_id, valor_empenhado, valor_pago')
  ]);
  const aPagar = new Set(
    empenhos.filter((e) => Number(e.valor_pago ?? 0) + 0.005 < Number(e.valor_empenhado ?? 0)).map((e) => String(e.empenho_id))
  );
  return new Set(vinculos.filter((v) => aPagar.has(String(v.empenho_id))).map((v) => String(v.contract_key)));
}

/**
 * Instante que a fila usa para cada contrato. Tentativa com sucesso conta pela data dela; ERRO ou PARCIAL
 * é recuado para que o contrato fique elegível RETENTATIVA_HORAS depois da tentativa (e passe à frente
 * dos consultados com sucesso, que esperam RECONSULTA_HORAS).
 */
export function instanteDaFila(tentativaEm: string, situacao?: string | null): string {
  if (situacao !== 'ERRO' && situacao !== 'PARCIAL') return tentativaEm;
  const t = new Date(tentativaEm).getTime();
  if (Number.isNaN(t)) return tentativaEm;
  return new Date(t - (RECONSULTA_HORAS - RETENTATIVA_HORAS) * 3600_000).toISOString();
}

/** Última tentativa de sincronização de cada contrato (tabela da migration 80; vazia se ela não existir). */
export async function fetchTentativasEmpenhos(): Promise<Map<string, string>> {
  if (!isSupabaseConfigured || !supabase) return new Map();
  try {
    const linhas = await lerPaginado<{ contract_key: string; tentativa_em: string; situacao: string | null }>(
      'contrato_empenhos_sincronizacao',
      'contract_key, tentativa_em, situacao'
    );
    return new Map(linhas.map((l) => [String(l.contract_key), instanteDaFila(String(l.tentativa_em), l.situacao)]));
  } catch (err) {
    console.warn('[empenhosCarteira] situação dos contratos não lida; todos contam como nunca consultados:', err);
    return new Map();
  }
}

export interface OpcoesCarteira {
  forcar?: boolean;
  /** Tempo máximo, em ms, para começar contratos novos. O que não começar fica para a próxima execução. */
  orcamentoMs?: number;
  concorrencia?: number;
  agora?: () => number;
  hoje?: () => string;
}

export interface ResumoCarteira {
  elegiveis: number;
  naFila: number;
  processados: number;
  atualizados: number;
  semEmpenhos: number;
  parciais: number;
  comErro: number;
  adiados: number;
  empenhosGravados: number;
  vinculosRemovidos: number;
  erros: Array<{ contractKey: string; erro: string }>;
}

/** Consulta e grava os empenhos dos contratos da fila, respeitando o orçamento de tempo. */
export async function processarFila(
  fila: ContractDashboardRecord[],
  opts: OpcoesCarteira & { sincronizar?: typeof sincronizarEmpenhosDoRegistro } = {}
): Promise<Omit<ResumoCarteira, 'elegiveis' | 'naFila'>> {
  const agora = opts.agora ?? (() => Date.now());
  const sincronizar = opts.sincronizar ?? sincronizarEmpenhosDoRegistro;
  const inicio = agora();
  const resumo: Omit<ResumoCarteira, 'elegiveis' | 'naFila'> = {
    processados: 0,
    atualizados: 0,
    semEmpenhos: 0,
    parciais: 0,
    comErro: 0,
    adiados: 0,
    empenhosGravados: 0,
    vinculosRemovidos: 0,
    erros: []
  };
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < fila.length) {
      if (opts.orcamentoMs !== undefined && agora() - inicio > opts.orcamentoMs) return;
      const contrato = fila[proximo++];
      const { target, result } = await sincronizar(contrato);
      resumo.processados++;
      resumo.empenhosGravados += result.empenhos_persistidos || 0;
      resumo.vinculosRemovidos += result.vinculos_contrato_removidos || 0;
      const situacao = situacaoDoResultado(result);
      if (situacao === 'OK') resumo.atualizados++;
      else if (situacao === 'SEM_EMPENHOS') resumo.semEmpenhos++;
      else {
        if (situacao === 'PARCIAL') resumo.parciais++;
        else resumo.comErro++;
        resumo.erros.push({ contractKey: target.contractKey, erro: mensagemDoResultado(result) || 'Falha sem mensagem da fonte.' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concorrencia ?? 3) }, trabalhador));
  resumo.adiados = fila.length - resumo.processados;
  return resumo;
}

/** Texto do resultado gravado em sincronizacao_fontes.mensagem. */
export function mensagemDaCarteira(r: ResumoCarteira): string {
  const partes = [
    `${r.processados} de ${r.naFila} contrato(s) consultado(s) (${r.elegiveis} na carteira de empenhos)`,
    `${r.atualizados} atualizado(s)`,
    `${r.semEmpenhos} sem empenho na fonte`
  ];
  if (r.parciais) partes.push(`${r.parciais} parcial(is)`);
  if (r.comErro) partes.push(`${r.comErro} com falha`);
  if (r.vinculosRemovidos) partes.push(`${r.vinculosRemovidos} vínculo(s) removido(s)`);
  if (r.adiados) partes.push(`o tempo da execução acabou e ${r.adiados} contrato(s) ficam para a próxima`);
  return `${partes.join(', ')}.`;
}

/** Sincroniza os empenhos da carteira da UASG, sob a trava do banco. */
export async function sincronizarEmpenhosDaCarteira(uasg: string, opts: OpcoesCarteira = {}): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const hoje = opts.hoje ?? (() => new Date(agora()).toISOString().slice(0, 10));
  return executarComReserva(RECURSO_EMPENHOS, uasg, { forcar: opts.forcar, validade: VALIDADE_EMPENHOS }, async () => {
    const [carteira, comEmpenhoAPagar, tentativas] = await Promise.all([
      fetchContratosOficiaisDoBanco(uasg),
      contratosComEmpenhoAPagar(),
      fetchTentativasEmpenhos()
    ]);
    if (carteira.length === 0) {
      return { status: 'ERRO', erro: 'A carteira de contratos da UASG está vazia no banco: sincronize os contratos antes.' };
    }
    const elegiveis = selecionarContratos([carteira], { hoje: hoje(), comEmpenhoAPagar });
    const fila = ordenarParaSincronizar(elegiveis, tentativas, { agora: agora(), forcar: opts.forcar });
    const parcial = await processarFila(fila, opts);
    const resumo: ResumoCarteira = { elegiveis: elegiveis.length, naFila: fila.length, ...parcial };
    const mensagem = mensagemDaCarteira(resumo);
    if (resumo.parciais || resumo.comErro || resumo.adiados) {
      return { status: 'PARCIAL', total: resumo.processados, fontesComFalha: [FONTE_EMPENHOS_CONTRATOS], mensagem };
    }
    return { status: 'SUCESSO', total: resumo.processados, fontesComFalha: [], mensagem };
  });
}

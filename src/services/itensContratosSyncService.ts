/**
 * Itens dos contratos gravados no banco (itens_contrato, migration 78), em segundo plano e sob a trava do
 * banco (recurso 'itens_contratos', por UASG).
 *
 * Lê os itens de cada contrato da carteira nas APIs oficiais (lerItensDoContrato) e grava a cópia que o
 * Contrato 360 mostra. Incremental: só lê o contrato nunca lido, o vigente lido há mais de 24 horas e o
 * encerrado lido há mais de 30 dias, a menos que o coordenador force. Um contrato por vez, para respeitar o
 * limite das APIs, e dentro de um orçamento de tempo: o que não couber fica para a próxima execução (PARCIAL),
 * como na sincronização das atas.
 */
import { supabase } from './supabaseClient';
import { fetchContratosOficiaisDoBanco } from './contratosOficiaisService';
import { lerItensDoContrato, type LeituraItensContrato } from './contractItemsService';
import {
  executarComReserva,
  mensagemDeErro,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import { SINCRONIZACAO_RULES } from '../config/alertRules';
import type { ContractDashboardRecord } from '../types';

export const RECURSO_ITENS_CONTRATOS = 'itens_contratos' as const;
export const FONTE_ITENS_CONTRATOS = 'Itens dos contratos';

/** Tempo máximo consultando APIs numa execução (a Edge Function tem 150 s; a trava vale 10 minutos). */
export const ORCAMENTO_ITENS_CONTRATOS_MS = 100_000;

/** Contratos por chamada de gravação (a função aceita até 100). */
const LOTE_GRAVACAO = 20;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** O contrato ainda está (ou acabou de deixar de estar) em vigor? Sem data de fim, conta como vigente. */
function estaVigente(contract: ContractDashboardRecord, agora: number): boolean {
  const fim = contract.dataVigenciaFim ? Date.parse(String(contract.dataVigenciaFim).slice(0, 10)) : NaN;
  return Number.isNaN(fim) || fim >= agora - DIA_MS;
}

/**
 * Contratos cujos itens precisam ser lidos, em ordem: os nunca lidos primeiro, depois os de leitura mais antiga.
 * `leituras`: chave do contrato (maiúsculas) -> data da última leitura.
 */
export function contratosParaLer(
  contratos: ContractDashboardRecord[],
  leituras: Map<string, string>,
  opts: { agora: number; forcar?: boolean }
): ContractDashboardRecord[] {
  const vistos = new Set<string>();
  const fila: Array<{ contract: ContractDashboardRecord; lidoEm: number }> = [];
  for (const contract of contratos) {
    const key = (contract.id || '').trim().toUpperCase();
    if (!key || vistos.has(key)) continue;
    vistos.add(key);
    const lido = leituras.has(key) ? Date.parse(leituras.get(key) as string) : NaN;
    const lidoEm = Number.isNaN(lido) ? -Infinity : lido;
    if (!opts.forcar && lidoEm !== -Infinity) {
      const validade = estaVigente(contract, opts.agora)
        ? SINCRONIZACAO_RULES.itensContratoVigenteRelidosEmHoras * HORA_MS
        : SINCRONIZACAO_RULES.itensContratoEncerradoRelidosEmDias * DIA_MS;
      if (opts.agora - lidoEm < validade) continue;
    }
    fila.push({ contract, lidoEm });
  }
  return fila.sort((a, b) => a.lidoEm - b.lidoEm).map((f) => f.contract);
}

/** Linha da gravação (formato que gravar_itens_contratos espera). */
export function leituraParaGravar(contractKey: string, leitura: LeituraItensContrato) {
  return {
    contract_key: contractKey,
    fonte: leitura.fonte,
    itens: leitura.itens.map((i) => ({
      numero_item: i.numeroItem,
      descricao: i.descricao,
      tipo: i.tipo,
      quantidade: i.quantidade,
      valor_unitario: i.valorUnitario,
      valor_total: i.valorTotal
    }))
  };
}

async function fetchLeituras(): Promise<Map<string, string>> {
  const leituras = new Map<string, string>();
  if (!supabase) return leituras;
  const PAGINA = 1000;
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabase
      .from('itens_contrato_leituras')
      .select('contract_key, lido_em')
      .order('contract_key', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    for (const row of data ?? []) leituras.set(String(row.contract_key).toUpperCase(), row.lido_em);
    if (!data || data.length < PAGINA) break;
  }
  return leituras;
}

async function gravar(uasg: string, lote: Array<ReturnType<typeof leituraParaGravar>>): Promise<number> {
  if (!supabase || lote.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_itens_contratos', { p_uasg: uasg, p_contratos: lote });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Quantos contratos da carteira estão na fila de leitura (modo de teste do servidor; não grava nada). */
export async function contarItensContratosPendentes(uasg: string, agora: number = Date.now()): Promise<{ contratos: number; pendentes: number }> {
  const contratos = await fetchContratosOficiaisDoBanco((uasg || '').trim());
  const fila = contratosParaLer(contratos, await fetchLeituras(), { agora });
  return { contratos: contratos.length, pendentes: fila.length };
}

export async function sincronizarItensContratos(
  uasg: string,
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_ITENS_CONTRATOS_MS;

  return executarComReserva(
    RECURSO_ITENS_CONTRATOS,
    cleanUasg,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      const inicio = agora();
      const contratos = await fetchContratosOficiaisDoBanco(cleanUasg);
      const fila = contratosParaLer(contratos, await fetchLeituras(), { agora: inicio, forcar: opts.forcar });

      let gravados = 0;
      let falhas = 0;
      let pendentes = 0;
      let lote: Array<ReturnType<typeof leituraParaGravar>> = [];

      for (let i = 0; i < fila.length; i++) {
        if (agora() - inicio > orcamento) {
          pendentes = fila.length - i;
          break;
        }
        const contract = fila[i];
        try {
          lote.push(leituraParaGravar(contract.id, await lerItensDoContrato(contract)));
        } catch (err) {
          falhas++;
          console.warn(`[itensContratos] itens do contrato ${contract.id} não puderam ser lidos:`, mensagemDeErro(err));
        }
        if (lote.length >= LOTE_GRAVACAO) {
          gravados += await gravar(cleanUasg, lote);
          lote = [];
        }
      }
      gravados += await gravar(cleanUasg, lote);

      const problemas: string[] = [];
      if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'contrato não teve os itens lidos' : 'contratos não tiveram os itens lidos'}`);
      if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'contrato ficou' : 'contratos ficaram'} para a próxima execução`);
      return problemas.length > 0
        ? { status: 'PARCIAL', total: gravados, fontesComFalha: falhas > 0 ? [FONTE_ITENS_CONTRATOS] : [], mensagem: `${problemas.join(' e ')}.` }
        : { status: 'SUCESSO', total: gravados, fontesComFalha: [] };
    }
  );
}

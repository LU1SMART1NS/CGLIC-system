/**
 * Contrato avulso no Contratos.gov.br (CGLIC)
 *
 * A lista de contratos da UG (`/contrato/ug/{uasg}`) pesa ~3 MB e o servidor leva de 18 a 37 s para
 * respondê-la, mais que o limite do painel (12 s): na prática ela quase sempre falha, e o contrato chega
 * só com os dados do Compras.gov.br, que não trazem o id do Contratos.gov.br, a assinatura, o valor
 * inicial nem a categoria do Contratos.gov.br. Sem o id, ficam de fora fiscais, garantia e termos.
 *
 * Esta consulta traz só o contrato aberto: `/contrato/ugorigem/{uasg de origem}/numeroano/{NNNNNAAAA}`
 * responde em cerca de 0,3 s e devolve cerca de 1 KB.
 */

import type { ContractDashboardRecord } from '../types';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { formatNumeroAnoContrato } from './api';
import { mapContratosGovRecord } from './contractService';

const TIMEOUT_MS = 10000;

/**
 * UASGs em que o Contratos.gov.br pode guardar o contrato, da mais provável para a menos: a de origem
 * (que o Compras.gov.br e o Contratos.gov.br informam no próprio registro), a do registro e as da CGLIC.
 */
export function uasgsCandidatasContratosGov(contract: Pick<ContractDashboardRecord, 'uasg' | 'raw'>): string[] {
  const raw = (contract.raw ?? {}) as Record<string, any>;
  const origem =
    raw.codigoUnidadeGestoraOrigemContrato ||
    raw.unidade_origem_codigo ||
    raw.contratante?.orgao_origem?.unidade_gestora_origem?.codigo;
  const todas = [origem, contract.uasg, ...UASGS_CGLIC].map((u) => String(u ?? '').trim()).filter(Boolean);
  return todas.filter((u, i) => todas.indexOf(u) === i);
}

/** Resposta da consulta: lista com o contrato; vazia quando a UASG não é a de origem. */
async function getLista(url: string): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    // 429 e erros do servidor não são "contrato não achado": quem chama não deve guardar isso como resposta.
    if (res.status === 429 || res.status >= 500) throw new Error(`Contratos.gov.br respondeu ${res.status}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Contrato do Contratos.gov.br pelo número e pela UASG de origem. Retorna null quando não acha ou quando
 * há mais de um com o mesmo número (não adivinha). Lança erro se o servidor falhar.
 */
export async function fetchContratoContratosGov(
  contract: Pick<ContractDashboardRecord, 'numero' | 'ano' | 'uasg' | 'raw'>
): Promise<ContractDashboardRecord | null> {
  const numeroAno = formatNumeroAnoContrato(contract.numero, contract.ano);
  if (!/^\d{9}$/.test(numeroAno)) return null;

  for (const uasg of uasgsCandidatasContratosGov(contract)) {
    const lista = await getLista(`/api-contratos-gov/api/contrato/ugorigem/${uasg}/numeroano/${numeroAno}`);
    const iguais = lista.filter((c) => formatNumeroAnoContrato(String(c?.numero ?? '')) === numeroAno);
    if (iguais.length === 1) return mapContratosGovRecord(iguais[0], contract.uasg);
    if (iguais.length > 1) return null;
  }
  return null;
}

const vazio = (v: unknown) => v === undefined || v === null || v === '';

/**
 * Junta o contrato do Contratos.gov.br ao registro que veio só do Compras.gov.br. O Contratos.gov.br
 * manda (mesma regra da lista da UG); o que ele não traz fica com o valor do registro de base.
 * Identidade (`id`, `uasg`) sempre a da base, para a tela não mudar de endereço.
 */
export function mesclarContratosGov(base: ContractDashboardRecord, gov: ContractDashboardRecord): ContractDashboardRecord {
  const definidos = Object.fromEntries(Object.entries(gov).filter(([, v]) => !vazio(v)));
  return {
    ...base,
    ...definidos,
    id: base.id,
    uasg: base.uasg,
    // 0 não é valor: o mapeamento devolve 0 quando o campo vem vazio.
    valorGlobal: gov.valorGlobal || base.valorGlobal,
    valorInicial: gov.valorInicial || base.valorInicial,
    raw: { ...(base.raw ?? {}), ...(gov.raw ?? {}) }
  };
}

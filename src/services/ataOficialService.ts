/**
 * Data de assinatura da ata, direto do Compras.gov.br (CGLIC)
 *
 * A Ata 360 lê as atas do banco local, que guarda só o início da vigência (e o sistema chegou a mostrar
 * essa data como assinatura). O Compras.gov.br traz a assinatura real: a ata 00059/2025, por exemplo,
 * foi assinada em 30/09/2025 e a vigência começa em 10/10/2025.
 *
 * Uma consulta pequena por ata: lista as atas da UASG que começam a vigir no mesmo dia e acha a ata pelo número.
 */

import type { ArpRecord } from '../types';

const BASE_URL = '/api-arp/modulo-arp';
const TIMEOUT_MS = 10000;

export interface AtaOficialInfo {
  /** YYYY-MM-DD */
  dataAssinatura: string;
}

/** Os dias de uma data ISO ("2025-10-10T00:00:00" → "2025-10-10"), ou '' se não for uma data. */
const dia = (valor?: string | null) => (/^\d{4}-\d{2}-\d{2}/.test(String(valor ?? '')) ? String(valor).slice(0, 10) : '');

export function montarConsultaAtaOficial(arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'dataVigenciaInicial'>): string | null {
  const inicio = dia(arp.dataVigenciaInicial);
  const uasg = String(arp.codigoUnidadeGerenciadora ?? '').trim();
  if (!inicio || !uasg) return null;
  return `${BASE_URL}/1_consultarARP?pagina=1&tamanhoPagina=500&codigoUnidadeGerenciadora=${uasg}&dataVigenciaInicialMin=${inicio}&dataVigenciaInicialMax=${inicio}`;
}

/** Acha a ata na lista pelo número e devolve a assinatura. Se houver mais de uma com o mesmo número, não adivinha. */
export function encontrarAssinaturaAta(lista: any[] | undefined, numeroAta: string): AtaOficialInfo | null {
  if (!Array.isArray(lista)) return null;
  const iguais = lista.filter((a) => String(a?.numeroAtaRegistroPreco ?? '').trim() === String(numeroAta).trim());
  if (iguais.length !== 1) return null;
  const dataAssinatura = dia(iguais[0].dataAssinatura);
  return dataAssinatura ? { dataAssinatura } : null;
}

/** Lança erro se o servidor falhar (429/5xx), para a falha não ser guardada como "sem assinatura". */
export async function fetchAssinaturaAta(arp: ArpRecord): Promise<AtaOficialInfo | null> {
  const url = montarConsultaAtaOficial(arp);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429 || res.status >= 500) throw new Error(`Compras.gov.br respondeu ${res.status}`);
    if (!res.ok) return null;
    const data = await res.json();
    return encontrarAssinaturaAta(data?.resultado, arp.numeroAtaRegistroPreco);
  } finally {
    clearTimeout(timer);
  }
}

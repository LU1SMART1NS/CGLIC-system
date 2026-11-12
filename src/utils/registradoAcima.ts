import type { OrgaoQuantitativo } from '../services/quantitativosService';
import { isUasgCglic } from '../config/unidadesGestoras';

/**
 * Registrado acima do homologado (migration 142): a soma do registrado por órgão no Compras.gov.br passa do homologado
 * do item. Remanejamento nunca muda essa soma; o excedente é quantidade sem lastro na licitação.
 */
export interface RegistradoAcima {
  homologado: number;
  somaRegistrado: number;
  excedente: number;
  /** Parte do excedente que está na SENASP (sem a ata assinada: todo o excedente, até o registrado da SENASP). */
  excedenteSenasp: number;
  /** O que sai da base do saldo agora: a parte da SENASP com o aviso aberto; zero depois de resolvido. */
  desconto: number;
  chave: string;
  resolvido: boolean;
  ataAssinadaInformada: boolean;
}

/** Lê as colunas da migration 142 numa linha de v_arp_item_saldo_detalhado. Sem aviso (ou sem a migration), null. */
export function registradoAcimaDoSaldo(row: any): RegistradoAcima | null {
  const chave = row?.registrado_acima_chave;
  if (!chave) return null;
  const n = (v: unknown) => Number(v) || 0;
  return {
    homologado: n(row.quantidade_homologada),
    somaRegistrado: n(row.soma_registrado),
    excedente: n(row.excedente_registrado),
    excedenteSenasp: n(row.excedente_registrado_senasp),
    desconto: n(row.desconto_registrado_acima),
    chave: String(chave),
    resolvido: Boolean(row.registrado_acima_resolvido),
    ataAssinadaInformada: Boolean(row.ata_assinada_informada)
  };
}

export interface OrgaoAcimaDaAta {
  uasg: string;
  ehSenasp: boolean;
  assinada: number;
  registrado: number;
  acima: number;
}

/**
 * Órgãos com o registrado acima da ata assinada. Na SENASP conta o registrado líquido (registrado − gerenciado para os
 * participantes), igual à conta da cota própria.
 */
export function orgaosAcimaDaAtaAssinada(orgaos: OrgaoQuantitativo[], gerenciadoParticipantes: number): OrgaoAcimaDaAta[] {
  const lista: OrgaoAcimaDaAta[] = [];
  for (const o of orgaos) {
    if (o.quantidadeRegistrada == null) continue;
    const ehSenasp = o.ehSenasp || isUasgCglic(o.uasg);
    const registrado = ehSenasp ? o.quantidadeRegistrada - gerenciadoParticipantes : o.quantidadeRegistrada;
    const acima = registrado - o.quantidadeAssinada;
    if (acima > 0) lista.push({ uasg: o.uasg, ehSenasp, assinada: o.quantidadeAssinada, registrado, acima });
  }
  return lista.sort((a, b) => b.acima - a.acima);
}

/** Ata prorrogada: vigência de mais de um ano (a inicial é de 1 ano, Lei 14.133 art. 84). */
export function ataFoiProrrogada(inicio: string | null | undefined, fim: string | null | undefined): boolean {
  if (!inicio || !fim) return false;
  const dias = (Date.parse(fim.slice(0, 10)) - Date.parse(inicio.slice(0, 10))) / 86_400_000;
  return Number.isFinite(dias) && dias > 400;
}

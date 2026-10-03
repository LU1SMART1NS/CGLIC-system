/**
 * Divulgação do contrato no PNCP (CGLIC)
 *
 * O Contratos.gov.br não devolve o Id PNCP do contrato nem a data em que ele foi divulgado no PNCP
 * (o `data_publicacao` dele é outra data, em geral 1 dia depois). Esses dados vêm do PNCP:
 *
 * 1. Contrato que já tem o Id PNCP (`cnpj-2-sequencial/ano`): consulta direta.
 * 2. Contrato do Contratos.gov.br, sem Id: busca na lista de contratos do órgão numa janela curta de datas
 *    em volta da publicação, e acha o contrato pelo número e pelo ano.
 *
 * Se não achar, ou se o PNCP recusar (429 quando há muitas chamadas), nada é exibido: o dado não é inventado
 * e a falha não é repetida em laço.
 */

import type { ContractDashboardRecord } from '../types';
import { cnpjDaUasg } from '../config/unidadesGestoras';

export interface PncpContratoInfo {
  /** Id PNCP do contrato: cnpj-2-sequencial/ano */
  numeroControlePncp: string;
  /** YYYY-MM-DD */
  dataPublicacaoPncp: string;
  /** Id PNCP da ata de origem, quando o contrato decorre de uma. */
  numeroControlePncpAta?: string;
}

/** Janela de busca em volta da data de publicação do Contratos.gov.br: o PNCP chegou a divulgar de 2 dias antes a 3 depois. */
export const JANELA_ANTES_DIAS = 5;
export const JANELA_DEPOIS_DIAS = 5;
/** Quando só se conhece a assinatura, a divulgação vem depois dela. */
export const JANELA_ASSINATURA_ANTES_DIAS = 2;
export const JANELA_ASSINATURA_DEPOIS_DIAS = 15;
const MAX_PAGINAS = 3;

/** "00394494000136-2-001220/2026" → { cnpj, sequencial, ano } */
export function parseNumeroControlePncpContrato(valor?: string | null): { cnpj: string; sequencial: number; ano: string } | null {
  const match = String(valor ?? '').match(/^(\d{14})-2-(\d{6})\/(\d{4})$/);
  return match ? { cnpj: match[1], sequencial: parseInt(match[2], 10), ano: match[3] } : null;
}

/** Soma dias a uma data YYYY-MM-DD, sem depender do fuso. */
export function addDiasIso(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(y, m - 1, d + dias));
  return data.toISOString().slice(0, 10);
}

const compacta = (iso: string) => iso.replace(/-/g, '');

export interface BuscaPncpContrato {
  cnpj: string;
  /** YYYYMMDD */
  dataInicial: string;
  dataFinal: string;
  /** Número do contrato sem zeros à esquerda e sem o ano ("00230/2026" → "230") */
  numero: string;
  ano: number;
}

/**
 * Parâmetros da busca por janela de datas, ou null quando não há como buscar (UASG sem CNPJ
 * cadastrado, número ilegível ou nenhuma data de referência).
 */
export function montarBuscaPncpContrato(contract: ContractDashboardRecord): BuscaPncpContrato | null {
  const cnpj = cnpjDaUasg(contract.uasg);
  if (!cnpj) return null;

  const [parteNumero, parteAno] = String(contract.numero ?? '').split('/');
  const numero = String(parseInt(parteNumero, 10));
  const ano = parseInt(parteAno || String(contract.ano ?? ''), 10);
  if (!Number.isFinite(parseInt(parteNumero, 10)) || !Number.isFinite(ano)) return null;

  const rawPublicacao = typeof contract.raw?.data_publicacao === 'string' ? contract.raw.data_publicacao.slice(0, 10) : '';
  if (rawPublicacao) {
    return { cnpj, numero, ano, dataInicial: compacta(addDiasIso(rawPublicacao, -JANELA_ANTES_DIAS)), dataFinal: compacta(addDiasIso(rawPublicacao, JANELA_DEPOIS_DIAS)) };
  }
  const assinatura = (contract.dataAssinatura || contract.dataVigenciaInicio || '').slice(0, 10);
  if (!assinatura) return null;
  return {
    cnpj,
    numero,
    ano,
    dataInicial: compacta(addDiasIso(assinatura, -JANELA_ASSINATURA_ANTES_DIAS)),
    dataFinal: compacta(addDiasIso(assinatura, JANELA_ASSINATURA_DEPOIS_DIAS))
  };
}

interface RegistroPncp {
  numeroControlePNCP?: string;
  numeroContratoEmpenho?: string | number;
  anoContrato?: number | string;
  dataPublicacaoPncp?: string;
  numeroControlePncpAta?: string | null;
}

function paraInfo(registro: RegistroPncp): PncpContratoInfo | null {
  if (!registro.numeroControlePNCP || !registro.dataPublicacaoPncp) return null;
  return {
    numeroControlePncp: registro.numeroControlePNCP,
    dataPublicacaoPncp: String(registro.dataPublicacaoPncp).slice(0, 10),
    ...(registro.numeroControlePncpAta ? { numeroControlePncpAta: registro.numeroControlePncpAta } : {})
  };
}

/** Acha o contrato na lista do PNCP pelo número (sem zeros à esquerda) e pelo ano. Se houver mais de um, não adivinha. */
export function encontrarContratoPncp(lista: RegistroPncp[] | undefined, numero: string, ano: number): PncpContratoInfo | null {
  if (!Array.isArray(lista)) return null;
  const iguais = lista.filter(
    (r) => String(r.numeroContratoEmpenho ?? '').replace(/^0+/, '') === numero && Number(r.anoContrato) === ano
  );
  return iguais.length === 1 ? paraInfo(iguais[0]) : null;
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // inclui 429: sem nova tentativa
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Id PNCP e data de divulgação do contrato no PNCP. Retorna null quando não acha ou o PNCP não responde.
 */
export async function fetchPncpContrato(contract: ContractDashboardRecord): Promise<PncpContratoInfo | null> {
  const direto = parseNumeroControlePncpContrato(contract.numeroControlePncp);
  if (direto) {
    const data = await getJson(`/api-pncp/api/pncp/v1/orgaos/${direto.cnpj}/contratos/${direto.ano}/${direto.sequencial}`);
    return data ? paraInfo(data) : null;
  }

  const busca = montarBuscaPncpContrato(contract);
  if (!busca) return null;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url =
      `/api-pncp/api/consulta/v1/contratos?dataInicial=${busca.dataInicial}&dataFinal=${busca.dataFinal}` +
      `&cnpjOrgao=${busca.cnpj}&pagina=${pagina}&tamanhoPagina=500`;
    const data = await getJson(url);
    if (!data) return null;
    const achado = encontrarContratoPncp(data.data, busca.numero, busca.ano);
    if (achado) return achado;
    if (pagina >= Number(data.totalPaginas || 1)) return null;
  }
  return null;
}

/**
 * Ata de origem do contrato, a partir dos dados da ata no PNCP: número no formato do sistema ("00059/2025")
 * e a UASG da unidade gerenciadora (que, com o número, forma o endereço da Ata 360).
 */
export function ataDeOrigem(ata?: { numeroAtaRegistroPreco?: string; anoAta?: number | string; codigoUnidade?: string } | null): { numeroAta: string; uasg?: string } | null {
  if (!ata?.numeroAtaRegistroPreco || !ata.anoAta) return null;
  return { numeroAta: `${ata.numeroAtaRegistroPreco}/${ata.anoAta}`, ...(ata.codigoUnidade ? { uasg: String(ata.codigoUnidade) } : {}) };
}

/**
 * Responsáveis e garantia do contrato, a partir do Contratos.gov.br (CGLIC)
 *
 * Funções puras para o topo do Contrato 360:
 * - fiscais com designação ativa (o gestor mostrado na tela é o atribuído no sistema, não o da API);
 * - a garantia de vencimento mais longo, com o aviso de quando ela não cobre a vigência.
 */

import type { ContractDashboardRecord } from '../types';
import type { ContratosGovGarantiaRecord, ContratosGovResponsavelRecord } from '../types/contractResponsaveis';
import { parseValorBR } from './contractHistoricoService';
import { formatDateISO } from './temporalEngineService';

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Id do contrato no Contratos.gov.br, quando o registro veio de lá (só assim há o que consultar). */
export function contratosGovId(contract?: Pick<ContractDashboardRecord, 'contratoId' | 'fonteDados'> | null): string | number | undefined {
  if (!contract) return undefined;
  const fromContratosGov = String(contract.fonteDados || '').includes('Contratos.gov');
  const id = contract.contratoId;
  return fromContratosGov && id !== undefined && id !== '' ? id : undefined;
}

/** "***.550.961-** - MARIA SILVA" → "MARIA SILVA". O CPF mascarado não é exibido. */
export function parseResponsavelNome(usuario: string | null | undefined): string {
  const text = String(usuario ?? '').trim();
  return text.replace(/^[\d.*\-\s]+-\s+/, '').trim();
}

const capitalizeFirst = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text);

export interface FiscalGrupo {
  /** Ex.: "Fiscal técnico", "Fiscal técnico substituto" */
  label: string;
  nomes: string[];
}

const ORDEM_FUNCOES = [
  'fiscal tecnico',
  'fiscal tecnico substituto',
  'fiscal administrativo',
  'fiscal administrativo substituto',
  'fiscal setorial',
  'fiscal setorial substituto'
];

/**
 * Fiscais com designação ativa, agrupados por função. Gestor e gestor substituto ficam de fora.
 * Ativa = situação "Ativo" e sem data de fim (ou com fim hoje ou depois).
 */
export function fiscaisAtivos(rows: ContratosGovResponsavelRecord[] | undefined, today: string = formatDateISO(new Date())): FiscalGrupo[] {
  if (!Array.isArray(rows)) return [];
  const grupos = new Map<string, FiscalGrupo>();

  for (const row of rows) {
    const funcao = normalize(row.funcao_id);
    if (!funcao.startsWith('fiscal')) continue;
    if (normalize(row.situacao) !== 'ativo') continue;
    if (row.data_fim && String(row.data_fim).slice(0, 10) < today) continue;

    const nome = parseResponsavelNome(row.usuario);
    if (!nome) continue;
    const grupo = grupos.get(funcao) ?? { label: capitalizeFirst(String(row.funcao_id).trim()), nomes: [] };
    if (!grupo.nomes.includes(nome)) grupo.nomes.push(nome);
    grupos.set(funcao, grupo);
  }

  const posicao = (chave: string) => {
    const i = ORDEM_FUNCOES.indexOf(chave);
    return i === -1 ? ORDEM_FUNCOES.length : i;
  };
  return [...grupos.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b))
    .map(([, grupo]) => grupo);
}

export interface GarantiaItem {
  tipo: string;
  valor?: number;
  /** YYYY-MM-DD */
  vencimento: string;
}

export interface GarantiaResumo {
  /** A de vencimento mais longo. */
  principal: GarantiaItem;
  /** Todas, da de vencimento mais longo para a mais curta. */
  todas: GarantiaItem[];
}

/** Garantia de vencimento mais longo. Lista vazia não diz se o contrato exige garantia: nada é exibido. */
export function garantiaMaisLonga(rows: ContratosGovGarantiaRecord[] | undefined): GarantiaResumo | null {
  if (!Array.isArray(rows)) return null;
  const todas: GarantiaItem[] = rows
    .filter((row) => row.vencimento)
    .map((row) => ({
      tipo: String(row.tipo ?? 'Garantia').trim() || 'Garantia',
      valor: parseValorBR(row.valor),
      vencimento: String(row.vencimento).slice(0, 10)
    }))
    .sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  return todas.length > 0 ? { principal: todas[0], todas } : null;
}

/**
 * Aviso sobre a garantia: vencida, ou vence antes do fim da vigência. Sem aviso quando cobre a vigência.
 */
export function garantiaAviso(
  garantia: GarantiaResumo | null,
  fimVigencia: string | undefined,
  today: string = formatDateISO(new Date())
): string | undefined {
  if (!garantia) return undefined;
  const { vencimento } = garantia.principal;
  if (vencimento < today) return 'vencida';
  if (fimVigencia && vencimento < fimVigencia.slice(0, 10)) return 'vence antes do fim da vigência';
  return undefined;
}

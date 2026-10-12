/**
 * Identidade e carteira de uma ata.
 *
 * Desde 09/10/2026 a tabela de atas guarda também atas de OUTROS órgãos em que a SENASP é participante ou fez
 * adesão (migration 106). Nelas a UASG da ata (codigoUnidadeGerenciadora) é a gerenciadora (ex.: 200342), e a
 * ata pertence a uma carteira da CGLIC (uasgCarteira, ex.: 200331).
 *
 * - Identidade da ata (chave da ata e do item, consultas às fontes): número + UASG gerenciadora, como sempre.
 * - Carteira (listas, escopo do gestor, contratos da SENASP): uasgCarteira.
 * - Chave de gestão (gestor, plano de tarefas, avisos, ajuste de complexidade, que guardam só o número):
 *   ata da CGLIC = número ("00005/2025"); ata de outro órgão = número-UASG ("00005/2025-200342").
 *   Mesma regra de public.chave_gestao_ata() no banco.
 */
import { isUasgCglic } from '../config/unidadesGestoras';
import type { ArpRecord, PapelSenasp } from '../types';

const digitos = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

/** Chave de gestão da ata (gestor, plano, avisos). Sem UASG ou UASG da CGLIC: só o número. */
export function chaveGestaoAta(numeroAta: string, uasg?: string | number | null): string {
  const numero = (numeroAta || '').trim();
  const u = digitos(uasg);
  return !u || isUasgCglic(u) ? numero : `${numero}-${u}`;
}

/** Chave de gestão a partir de uma chave de item ("00005/2025-200342-00001") ou de ata ("00005/2025-200342"). */
export function chaveGestaoDaChave(chave: string | null | undefined): string {
  const m = String(chave ?? '').trim().match(/^(\d{5}\/\d{4})(?:-(\d{6}))?(?:-\d+)?$/);
  if (!m) return String(chave ?? '').trim();
  return chaveGestaoAta(m[1], m[2]);
}

/** Chave de gestão de uma ata carregada. */
export function chaveGestaoDaArp(arp: Pick<ArpRecord, 'numeroAtaRegistroPreco' | 'codigoUnidadeGerenciadora'>): string {
  return chaveGestaoAta(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora);
}

/** Carteira da CGLIC a que a ata pertence (nas gerenciadas, a própria UASG). */
export function carteiraDaAta(arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'uasgCarteira'>): string {
  return digitos(arp.uasgCarteira) || digitos(arp.codigoUnidadeGerenciadora);
}

/** Papel da SENASP na ata; sem a informação, a ata da CGLIC é gerenciadora. */
export function papelSenaspDaAta(arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'papelSenasp'>): PapelSenasp {
  if (arp.papelSenasp) return arp.papelSenasp;
  return isUasgCglic(arp.codigoUnidadeGerenciadora) ? 'GERENCIADORA' : 'PARTICIPANTE';
}

/** A ata é de outro órgão (a SENASP é participante ou fez adesão)? */
export function ataDeOutroOrgao(arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'papelSenasp'>): boolean {
  return papelSenaspDaAta(arp) !== 'GERENCIADORA';
}

/** Rótulo curto do papel, para selos. */
export function rotuloPapelSenasp(papel: PapelSenasp): string {
  return papel === 'PARTICIPANTE' ? 'SENASP participante' : papel === 'ADESAO' ? 'Adesão da SENASP' : 'Gerenciada pela CGLIC';
}

/** Chave de gestão para leitura: "00005/2025" ou "00005/2025 (UASG 200342)". */
export function rotuloChaveGestao(chave: string | null | undefined): string {
  const m = String(chave ?? '').trim().match(/^(\d{5}\/\d{4})-(\d{6})$/);
  return m ? `${m[1]} (UASG ${m[2]})` : String(chave ?? '').trim();
}

/** Filtro "Papel da SENASP" da Carteira de Atas. */
export type FiltroPapelSenasp = 'TODOS' | 'GERENCIADORA' | 'OUTROS' | 'PARTICIPANTE' | 'ADESAO';
export const FILTRO_PAPEL_VALUES: readonly FiltroPapelSenasp[] = ['TODOS', 'GERENCIADORA', 'OUTROS', 'PARTICIPANTE', 'ADESAO'];
export const FILTRO_PAPEL_LABEL: Record<Exclude<FiltroPapelSenasp, 'TODOS'>, string> = {
  GERENCIADORA: 'Gerenciada pela CGLIC',
  OUTROS: 'Outros órgãos (participante e adesão)',
  PARTICIPANTE: 'SENASP participante',
  ADESAO: 'Adesão da SENASP'
};

/** A ata passa no filtro de papel? */
export function passaFiltroPapel(arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'papelSenasp'>, filtro: FiltroPapelSenasp): boolean {
  if (filtro === 'TODOS') return true;
  const papel = papelSenaspDaAta(arp);
  if (filtro === 'OUTROS') return papel !== 'GERENCIADORA';
  return papel === filtro;
}

/** Quantas atas (ou itens, pela ata de cada um) cairiam em cada opção do filtro de papel. */
export function contarPorPapel(
  arps: Array<Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'papelSenasp'>>
): Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>> {
  const counts: Partial<Record<Exclude<FiltroPapelSenasp, 'TODOS'>, number>> = {};
  for (const arp of arps) {
    for (const p of ['GERENCIADORA', 'OUTROS', 'PARTICIPANTE', 'ADESAO'] as const) {
      if (passaFiltroPapel(arp, p)) counts[p] = (counts[p] ?? 0) + 1;
    }
  }
  return counts;
}

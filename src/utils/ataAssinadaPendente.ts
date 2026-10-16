import { isUasgCglic } from '../config/unidadesGestoras';
import { quantidadeBaseSenasp } from './quantitativoSenasp';

/**
 * Alocação antes da ata assinada (decisão de 13/10/2026: sem bloqueio, só aviso). Regras sobre uma linha de
 * v_arp_item_saldo_detalhado; as colunas total_alocado_unidades e outros_orgaos_registrados vêm da migration 116
 * (sem elas, nada é avisado).
 */
export interface SaldoParaAtaAssinada {
  codigo_uasg?: string | null;
  papel_senasp?: string | null;
  quantidade_base_senasp?: number | null;
  quantidade_senasp?: number | null;
  quantidade_homologada?: number | null;
  ata_assinada_informada?: boolean | null;
  assinada_senasp_participante?: number | string | null;
  total_alocado_unidades?: number | string | null;
  outros_orgaos_registrados?: number | string | null;
}

/** Situação da qtd. da ata assinada de um item; nula quando informar não muda nada (adesão, ou só a SENASP registrada). */
export type SituacaoAtaAssinada = 'A_INFORMAR' | 'INFORMADA';

const num = (v: unknown) => Number(v) || 0;

/** Ata gerenciada pela CGLIC (a SENASP é a gerenciadora). */
const daCglic = (s: SaldoParaAtaAssinada) =>
  s.papel_senasp ? s.papel_senasp === 'GERENCIADORA' : isUasgCglic(String(s.codigo_uasg ?? ''));

export function situacaoAtaAssinada(s: SaldoParaAtaAssinada): SituacaoAtaAssinada | null {
  if (s.papel_senasp === 'ADESAO') return null;
  if (daCglic(s)) {
    if (s.ata_assinada_informada) return 'INFORMADA';
    return num(s.outros_orgaos_registrados) > 0 ? 'A_INFORMAR' : null;
  }
  // SENASP participante: só a linha da SENASP é informada.
  return s.assinada_senasp_participante != null ? 'INFORMADA' : 'A_INFORMAR';
}

/**
 * Limite da alocação provisório: ata da CGLIC, ata assinada não informada e outros órgãos registrados no item.
 * Parte do registrado da SENASP pode ser de outro órgão; a cota própria só se sabe com a ata assinada.
 */
export function limiteProvisorio(s: SaldoParaAtaAssinada): boolean {
  return daCglic(s) && situacaoAtaAssinada(s) === 'A_INFORMAR';
}

/** Quanto a alocação às unidades passa da base do saldo (0 quando não passa). */
export function alocadoAcimaDoLimite(s: SaldoParaAtaAssinada): number {
  return Math.max(num(s.total_alocado_unidades) - Math.max(quantidadeBaseSenasp(s), 0), 0);
}

/** Limite do item com a preposição, para "acima …": "da cota própria da SENASP", "da quantidade aprovada …" ou "do registrado …". */
export function limiteComPreposicao(s: SaldoParaAtaAssinada): string {
  if (s.papel_senasp === 'ADESAO') return 'da quantidade aprovada da SENASP';
  if (daCglic(s) && s.ata_assinada_informada) return 'da cota própria da SENASP';
  return 'do registrado da SENASP';
}

/** Resumo da ata para o filtro "Qtd. assinada": itens em que informar importa e quantos já foram informados. */
export interface AtaAssinadaDaAta {
  situacao: SituacaoAtaAssinada;
  informados: number;
  total: number;
}

export function resumirAtaAssinada(situacoes: Array<SituacaoAtaAssinada | null>): AtaAssinadaDaAta | null {
  const validas = situacoes.filter((x): x is SituacaoAtaAssinada => x != null);
  if (validas.length === 0) return null;
  const informados = validas.filter((x) => x === 'INFORMADA').length;
  return { situacao: informados === validas.length ? 'INFORMADA' : 'A_INFORMAR', informados, total: validas.length };
}

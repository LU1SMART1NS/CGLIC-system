/**
 * Regras de exibição da aba Órgãos e quantitativos nas atas de OUTROS órgãos (migration 114, protótipo aprovado em
 * 13/10/2026: https://claude.ai/artifact/8UXkZrGneHn1dbrPhW1sov).
 *
 * - SENASP participante: só a linha da SENASP tem quantidade da ata assinada. A base do saldo e o limite da alocação
 *   continuam o registrado da SENASP; o que a ata assinada dá a mais fica com a gerenciadora.
 * - SENASP em adesão: a SENASP não está entre os órgãos da ata. A linha dela vem das adesões aprovadas (consulta 5);
 *   a adesão que vier sem quantidade da fonte usa a informada à mão.
 */
import { isUasgCglic } from '../config/unidadesGestoras';
import type { AdesaoItemRecord, PapelSenasp, UnidadeItemRecord } from '../types';
import type { AdesaoInformada, OrgaoQuantitativo } from '../services/quantitativosService';
import type { TextoDaSituacao } from './quantitativos';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** UASG de quem aderiu ("200331 - SECRETARIA ..." → "200331"). */
export const uasgDaAdesao = (a: Pick<AdesaoItemRecord, 'unidadeNaoParticipante'>) => String(a.unidadeNaoParticipante ?? '').match(/^\s*(\d{6})/)?.[1] ?? '';

/** Data de aprovação da adesão sem fuso nem frações, como a chave gravada no banco (ex.: 2026-10-02T09:57:35). */
export const dataDaAdesao = (iso: string | null | undefined) => String(iso ?? '').slice(0, 19);

/** Adesões da SENASP (200330/200331) no item, da mais antiga para a mais nova. */
export function adesoesDaSenasp(adesoes: AdesaoItemRecord[]): AdesaoItemRecord[] {
  return adesoes
    .filter((a) => isUasgCglic(uasgDaAdesao(a)))
    .sort((a, b) => dataDaAdesao(a.dataAprovacaoAnalise).localeCompare(dataDaAdesao(b.dataAprovacaoAnalise)));
}

/**
 * Papel da SENASP no item. Ata da SENASP: gerenciadora. Ata de outro órgão: participante quando a SENASP está entre
 * os órgãos do item; adesão quando não está e tem adesão aprovada; sem as duas listas, o papel da ata.
 */
export function papelDoItem(papelDaAta: PapelSenasp, unidades: Array<Pick<UnidadeItemRecord, 'codigoUnidade' | 'tipoUnidade'>>, adesoesSenasp: AdesaoItemRecord[]): PapelSenasp {
  if (papelDaAta === 'GERENCIADORA') return 'GERENCIADORA';
  if (unidades.some((u) => isUasgCglic(digitos(u.codigoUnidade)) && String(u.tipoUnidade ?? '').toUpperCase() !== 'GERENCIADORA')) return 'PARTICIPANTE';
  if (adesoesSenasp.length > 0) return 'ADESAO';
  return papelDaAta;
}

export interface AdesaoDaSenasp {
  uasg: string;
  aprovadaEm: string;
  /** Quantidade do Compras.gov.br; nula quando a fonte não informa. */
  quantidadeFonte: number | null;
  /** Informada à mão (só vale enquanto a fonte não traz o número). */
  informada: AdesaoInformada | null;
  /** A que vale: a da fonte ou, sem ela, a informada. Nula = falta informar. */
  quantidade: number | null;
}

/** Junta cada adesão da SENASP com a quantidade informada à mão, quando a fonte não traz o número. */
export function adesoesComInformadas(adesoes: AdesaoItemRecord[], informadas: AdesaoInformada[]): AdesaoDaSenasp[] {
  return adesoesDaSenasp(adesoes).map((a) => {
    const uasg = uasgDaAdesao(a);
    const aprovadaEm = dataDaAdesao(a.dataAprovacaoAnalise);
    const fonte = a.quantidadeAprovadaAdesao == null || !Number.isFinite(Number(a.quantidadeAprovadaAdesao)) ? null : Number(a.quantidadeAprovadaAdesao);
    const informada = fonte == null ? informadas.find((m) => m.uasg === uasg && m.aprovadaEm === aprovadaEm) ?? null : null;
    return { uasg, aprovadaEm, quantidadeFonte: fonte, informada, quantidade: fonte ?? informada?.quantidade ?? null };
  });
}

/** Órgãos do item que mudaram no Compras.gov.br no mesmo segundo que a SENASP (a mesma operação de remanejamento). */
export function mudaramComASenasp(unidades: UnidadeItemRecord[]): UnidadeItemRecord[] {
  const senasp = unidades.find((u) => isUasgCglic(digitos(u.codigoUnidade)));
  const quando = senasp?.dataHoraAtualizacao;
  if (!quando || quando === senasp?.dataHoraInclusao) return [];
  return unidades.filter((u) => !isUasgCglic(digitos(u.codigoUnidade)) && u.dataHoraAtualizacao === quando);
}

/** Rótulo, cor e detalhe da situação da SENASP como participante de ata de outro órgão. */
export function textoDaSituacaoSenasp(o: OrgaoQuantitativo, uasgGerenciadora: string): TextoDaSituacao {
  switch (o.situacao) {
    case 'IGUAL':
      return { rotulo: 'Igual à ata assinada', tom: 'neutral', detalhe: null };
    case 'GERENCIADO':
      return { rotulo: `Gerenciado pela UASG ${uasgGerenciadora} · ${fmt(o.gerenciado)}`, tom: 'info', detalhe: o.semRegistro ? 'a SENASP não tem registro no Compras.gov' : 'desde o registro da ata' };
    case 'REMANEJADO_A_MENOS':
      return {
        rotulo: `Remanejado · ${fmt(o.falta)} a menos`,
        tom: o.gerenciado > 0 ? 'info' : 'warning',
        detalhe: o.gerenciado > 0 ? `${fmt(o.gerenciado)} continuam da SENASP` : 'redução definitiva'
      };
    case 'REMANEJADO_A_MAIS':
      return { rotulo: `Remanejado · ${fmt(o.acima)} a mais`, tom: 'info', detalhe: 'a SENASP recebeu por remanejamento' };
    case 'ACIMA_DA_ATA':
      return { rotulo: `Acima da ata assinada · ${fmt(o.acima)}`, tom: 'danger', detalhe: 'sem mudança desde o registro: confira o número' };
    case 'FORA_DA_ATA':
      return { rotulo: 'Fora da ata assinada', tom: 'danger', detalhe: `registrado ${fmt(o.quantidadeRegistrada ?? 0)}, sem quantidade na ata` };
    case 'REMANEJAMENTO_CONFIRMADO':
      return { rotulo: 'Remanejamento confirmado', tom: 'neutral', detalhe: null };
    default:
      return { rotulo: '', tom: 'neutral', detalhe: null };
  }
}

/**
 * Minuta pelo preço de hoje (protótipo aprovado em 29/10/2026, migration 246). O ofício do parlamentar traz o preço de
 * hoje da ata, centavo a centavo, e é esse o valor empenhado. Para o preço não mudar antes do contrato assinado, cada item
 * da CAEP tem a data do próximo reajuste da ata (sem data-base, o fim da vigência):
 * - a 60 dias dela o item sai da reserva (esmaecido);
 * - a menos de 45 dias (o tempo do ofício ao contrato assinado) também não vai na minuta;
 * - com o reajuste devido e ainda não aplicado, fica fora até o apostilamento (o preço do banco é o antigo).
 * O banco confere as mesmas regras (trg_emendas_prazo_linha e trg_emendas_minuta_reajuste).
 */
import { EMENDAS_RULES } from '../config/alertRules';
import type { PrecoDoItem } from '../services/emendasQuadroService';
import { addBusinessDays, formatDateISO } from '../services/temporalEngineService';

/** Dias antes do reajuste em que o item sai da reserva (Ajustes; padrão 60). Lido na hora, nunca copiado. */
export const corteReajusteDias = (): number => EMENDAS_RULES.corteReajusteAntesDias;
/** Dias do ofício ao contrato assinado (Ajustes; padrão 45). */
export const tramiteAteContratoDias = (): number => EMENDAS_RULES.tramiteAteContratoDias;
/** Dias úteis para o ofício voltar depois da minuta (Ajustes; padrão 5). */
export const validadeMinutaDiasUteis = (): number => EMENDAS_RULES.validadeMinutaDiasUteis;

const UM_DIA = 86_400_000;
const dias = (de: string, ate: string): number => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / UM_DIA);
const somarDias = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * UM_DIA).toISOString().slice(0, 10);
const br = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const reais = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type SituacaoDoReajuste = 'LIVRE' | 'ESMAECIDO' | 'FORA_DA_MINUTA' | 'DEVIDO';

export interface ReajusteDoItem {
  situacao: SituacaoDoReajuste;
  /** Data do reajuste (ou do fim da vigência, na ata sem data-base). */
  data: string | null;
  /** Texto curto para a pílula: "Reajuste em 26/03/2027". Null quando o item está livre. */
  rotulo: string | null;
  /** O porquê, para a linha de baixo. */
  detalhe: string | null;
}

const LIVRE: ReajusteDoItem = { situacao: 'LIVRE', data: null, rotulo: null, detalhe: null };

/** "Reajuste em 26/03/2027", "Reajuste na prorrogação, 10/09/2027" ou "Ata sem data-base termina em 03/11/2026". */
export function rotuloDoReajuste(p: PrecoDoItem): string | null {
  return p.dataReajuste ? rotuloDaData(p, p.dataReajuste) : null;
}

function rotuloDaData(p: PrecoDoItem, data: string): string {
  if (p.origem === 'FIM_DA_VIGENCIA') return `Ata sem data-base termina em ${br(data)}`;
  if (p.origem === 'PRORROGACAO') return `Reajuste na prorrogação, ${br(data)}`;
  return `Reajuste em ${br(data)}`;
}

/** Situação do item pela data do reajuste da ata. Sem a leitura dos preços, o item fica livre (o banco ainda confere). */
export function reajusteDoItem(p: PrecoDoItem | undefined, hoje: string): ReajusteDoItem {
  if (!p) return LIVRE;
  if (p.devido) {
    return {
      situacao: 'DEVIDO',
      data: null,
      rotulo: 'Reajuste devido, aguarda o apostilamento',
      detalhe: `O preço do banco ainda é o antigo (${reais(p.precoAtual)}${p.precoDevido ? `; com o reajuste, ${reais(p.precoDevido)}` : ''}). O item volta com o preço novo quando o apostilamento for lido.`
    };
  }
  if (!p.dataReajuste) return LIVRE;
  const faltam = dias(hoje, p.dataReajuste);
  if (faltam >= corteReajusteDias()) return { ...LIVRE, data: p.dataReajuste };
  const rotulo = rotuloDaData(p, p.dataReajuste);
  if (faltam < tramiteAteContratoDias()) {
    return {
      situacao: 'FORA_DA_MINUTA',
      data: p.dataReajuste,
      rotulo,
      detalhe: `Faltam ${Math.max(faltam, 0)} dias, menos que os ${tramiteAteContratoDias()} até o contrato assinado: a minuta não sai com ele. Troque ou retire o item, ou espere o apostilamento.`
    };
  }
  return {
    situacao: 'ESMAECIDO',
    data: p.dataReajuste,
    rotulo,
    detalhe: `Saiu da reserva em ${br(somarDias(p.dataReajuste, -corteReajusteDias()))} (${corteReajusteDias()} dias antes). O pedido já reservado ainda vai na minuta até ${br(somarDias(p.dataReajuste, -tramiteAteContratoDias()))}, com o prazo do ofício mais curto.`
  };
}

/** Pode entrar em reserva nova (ou ter a quantidade aumentada). */
export const podeReservar = (r: ReajusteDoItem): boolean => r.situacao === 'LIVRE';
/** Pode sair na minuta: o item já reservado que esmaeceu ainda vai, com o prazo do ofício mais curto. */
export const podeIrNaMinuta = (r: ReajusteDoItem): boolean => r.situacao === 'LIVRE' || r.situacao === 'ESMAECIDO';

export interface PrazoDoOficioPelaMinuta {
  data: string;
  /** DIAS_UTEIS: a validade da minuta; REAJUSTE: o reajuste da ata menos o tempo até o contrato. */
  pela: 'DIAS_UTEIS' | 'REAJUSTE';
  ata: string | null;
}

/** Último dia para o ofício chegar: o menor entre os dias úteis da minuta e o reajuste menos o tempo até o contrato. */
export function prazoDoOficioPelaMinuta(dataMinuta: string, itemKeys: Iterable<string>, precos: Map<string, PrecoDoItem> | undefined): PrazoDoOficioPelaMinuta {
  const base = formatDateISO(addBusinessDays(new Date(`${dataMinuta}T12:00:00`), validadeMinutaDiasUteis()));
  let prazo: PrazoDoOficioPelaMinuta = { data: base, pela: 'DIAS_UTEIS', ata: null };
  for (const k of itemKeys) {
    const d = precos?.get(k)?.dataReajuste;
    if (!d) continue;
    const limite = somarDias(d, -tramiteAteContratoDias());
    if (limite < prazo.data) prazo = { data: limite, pela: 'REAJUSTE', ata: k.split('-')[0] || null };
  }
  return prazo;
}

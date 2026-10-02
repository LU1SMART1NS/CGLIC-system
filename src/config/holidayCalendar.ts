/**
 * Calendário de dias sem expediente usado por toda contagem em dias úteis.
 *
 * Duas camadas:
 *   1. Calendário calculado (plano B, sempre disponível): feriados nacionais fixos e móveis
 *      (Carnaval, Sexta-feira Santa e Corpus Christi derivados da Páscoa) e feriados distritais
 *      do DF. Vale mesmo sem banco ou sem a BrasilAPI.
 *   2. Cadastro da Administração > Feriados (tabela holidays), aplicado via `applyHolidayRecords`.
 *      Uma data cadastrada SEMPRE prevalece sobre o calendário calculado: ativa conta como dia sem
 *      expediente; desativada ou de meio expediente conta como dia útil.
 *
 * Módulo puro (sem imports), como alertRules.ts, para poder ser lido de qualquer camada.
 */

export type HolidayTipo = 'NACIONAL' | 'DISTRITAL' | 'PONTO_FACULTATIVO';
export type HolidayOrigem = 'API' | 'CALCULADO' | 'MANUAL';

export interface HolidaySuggestion {
  data: string; // YYYY-MM-DD
  nome: string;
  tipo: HolidayTipo;
  meioExpediente: boolean;
}

export interface HolidayRecord extends HolidaySuggestion {
  origem: HolidayOrigem;
  ativo: boolean;
}

export const HOLIDAY_TIPO_LABEL: Record<HolidayTipo, string> = {
  NACIONAL: 'Nacional',
  DISTRITAL: 'Distrital (DF)',
  PONTO_FACULTATIVO: 'Ponto facultativo'
};

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shift(year: number, month: number, day: number, offset: number): string {
  const d = new Date(year, month - 1, day + offset);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Feriados que o sistema conhece sozinho: nacionais (os mesmos que a BrasilAPI publica)
 * e distritais do DF. É o plano B quando nada foi cadastrado para a data.
 */
export function computeBaselineHolidays(year: number): HolidaySuggestion[] {
  const p = easterSunday(year);
  const nacional = (data: string, nome: string): HolidaySuggestion => ({ data, nome, tipo: 'NACIONAL', meioExpediente: false });
  const list: HolidaySuggestion[] = [
    nacional(iso(year, 1, 1), 'Confraternização Universal'),
    nacional(shift(year, p.month, p.day, -48), 'Carnaval'),
    nacional(shift(year, p.month, p.day, -47), 'Carnaval'),
    nacional(shift(year, p.month, p.day, -2), 'Sexta-feira Santa'),
    nacional(iso(year, 4, 21), 'Tiradentes / Fundação de Brasília'),
    nacional(iso(year, 5, 1), 'Dia do Trabalho'),
    nacional(shift(year, p.month, p.day, 60), 'Corpus Christi'),
    nacional(iso(year, 9, 7), 'Independência do Brasil'),
    nacional(iso(year, 10, 12), 'Nossa Senhora Aparecida'),
    nacional(iso(year, 11, 2), 'Finados'),
    nacional(iso(year, 11, 15), 'Proclamação da República'),
    nacional(iso(year, 12, 25), 'Natal'),
    { data: iso(year, 11, 30), nome: 'Dia do Evangélico (DF)', tipo: 'DISTRITAL', meioExpediente: false }
  ];
  // Consciência Negra é feriado nacional desde a Lei 14.759/2023.
  if (year >= 2024) list.push(nacional(iso(year, 11, 20), 'Dia da Consciência Negra'));
  return list.sort((x, y) => x.data.localeCompare(y.data));
}

/**
 * Pontos facultativos que costumam constar da portaria anual do MGI. São só sugestões para a
 * importação: o administrador confere com a portaria do ano. Os de meio expediente contam como
 * dia útil.
 */
export function computeUsualPontosFacultativos(year: number): HolidaySuggestion[] {
  const p = easterSunday(year);
  const pf = (data: string, nome: string, meioExpediente: boolean): HolidaySuggestion => ({ data, nome, tipo: 'PONTO_FACULTATIVO', meioExpediente });
  return [
    pf(shift(year, p.month, p.day, -46), 'Quarta-feira de Cinzas (até 14h)', true),
    pf(iso(year, 10, 28), 'Dia do Servidor Público', false),
    pf(iso(year, 12, 24), 'Véspera de Natal (após 14h)', true),
    pf(iso(year, 12, 31), 'Véspera de Ano Novo (após 14h)', true)
  ];
}

// -----------------------------------------------------------------------------
// Registro em memória consultado pelo motor temporal
// -----------------------------------------------------------------------------

/** Data cadastrada -> true se é dia sem expediente. */
let registered = new Map<string, boolean>();
const baselineCache = new Map<number, Set<string>>();

function baselineFor(year: number): Set<string> {
  let set = baselineCache.get(year);
  if (!set) {
    set = new Set(computeBaselineHolidays(year).map((h) => h.data));
    baselineCache.set(year, set);
  }
  return set;
}

/** Aplica o cadastro da Administração. Lista vazia = só o calendário calculado. */
export function applyHolidayRecords(records: Array<Pick<HolidayRecord, 'data' | 'ativo' | 'meioExpediente'>>): void {
  registered = new Map(records.map((r) => [r.data, r.ativo && !r.meioExpediente]));
}

/** A data (YYYY-MM-DD) é feriado ou ponto facultativo de dia inteiro? Não considera fim de semana. */
export function isHolidayISO(dateIso: string): boolean {
  const known = registered.get(dateIso);
  if (known !== undefined) return known;
  return baselineFor(Number(dateIso.slice(0, 4))).has(dateIso);
}

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import {
  applyHolidayRecords,
  computeBaselineHolidays,
  computeUsualPontosFacultativos,
  type HolidayOrigem,
  type HolidayRecord,
  type HolidaySuggestion,
  type HolidayTipo
} from '../config/holidayCalendar';

const BRASIL_API_URL = 'https://brasilapi.com.br/api/feriados/v1';

interface HolidayRow {
  data: string;
  nome: string;
  tipo: HolidayTipo;
  origem: HolidayOrigem;
  ativo: boolean;
  meio_expediente: boolean;
}

function toRecord(row: HolidayRow): HolidayRecord {
  return {
    data: row.data,
    nome: row.nome,
    tipo: row.tipo,
    origem: row.origem,
    ativo: row.ativo,
    meioExpediente: row.meio_expediente
  };
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  return supabase;
}

/** Todo o cadastro da Administração > Feriados, em ordem de data. */
export async function fetchHolidays(): Promise<HolidayRecord[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('holidays')
    .select('data, nome, tipo, origem, ativo, meio_expediente')
    .order('data', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as HolidayRow[]).map(toRecord);
}

/** Feriados nacionais do ano publicados pela BrasilAPI. Lança erro se a API não responder. */
export async function fetchBrasilApiHolidays(year: number, fetchImpl: typeof fetch = fetch): Promise<HolidaySuggestion[]> {
  const response = await fetchImpl(`${BRASIL_API_URL}/${year}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`BrasilAPI respondeu ${response.status}`);
  const body = (await response.json()) as Array<{ date: string; name: string }>;
  if (!Array.isArray(body)) throw new Error('Resposta inesperada da BrasilAPI');
  return body
    // Páscoa cai sempre no domingo e não é feriado em lei: não entra no calendário.
    .filter((h) => h.name !== 'Páscoa')
    .map((h) => ({ data: h.date, nome: h.name, tipo: 'NACIONAL' as const, meioExpediente: false }));
}

export interface HolidayImportResult {
  inserted: number;
  skipped: number;
  /** false = BrasilAPI fora do ar; os nacionais vieram do calendário calculado. */
  apiOk: boolean;
}

async function importRows(rows: HolidaySuggestion[], origem: HolidayOrigem): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const client = requireSupabase();
  const payload = rows.map((r) => ({ data: r.data, nome: r.nome, tipo: r.tipo, meio_expediente: r.meioExpediente }));
  const { data, error } = await client.rpc('import_holidays_atomic', { p_rows: payload, p_origem: origem });
  if (error) throw mapPostgresErrorToAppError(error);
  const result = (data ?? {}) as { inserted?: number; skipped?: number };
  return { inserted: result.inserted ?? 0, skipped: result.skipped ?? 0 };
}

/**
 * Importa o ano: nacionais da BrasilAPI (ou do calendário calculado, se a API falhar), distritais
 * do DF e pontos facultativos usuais. Datas já cadastradas não são tocadas.
 */
export async function importHolidaysForYear(year: number, fetchImpl: typeof fetch = fetch): Promise<HolidayImportResult> {
  const baseline = computeBaselineHolidays(year);
  let nacionais: HolidaySuggestion[] = [];
  let apiOk = true;
  try {
    nacionais = await fetchBrasilApiHolidays(year, fetchImpl);
  } catch (err) {
    console.warn('[holidays] BrasilAPI indisponível; usando o calendário calculado:', err);
    apiOk = false;
  }
  const nacionalDates = new Set(nacionais.map((h) => h.data));
  const calculados = [
    ...(apiOk ? baseline.filter((h) => h.tipo !== 'NACIONAL') : baseline),
    ...computeUsualPontosFacultativos(year)
  ].filter((h) => !nacionalDates.has(h.data));

  const fromApi = await importRows(nacionais, 'API');
  const fromCalc = await importRows(calculados, 'CALCULADO');
  return { inserted: fromApi.inserted + fromCalc.inserted, skipped: fromApi.skipped + fromCalc.skipped, apiOk };
}

/** Datas do ano anterior trazidas para o ano informado (mesmo dia e mês), sem as importadas. */
export function buildCopyFromPreviousYear(records: HolidayRecord[], year: number): HolidaySuggestion[] {
  const prefix = `${year - 1}-`;
  return records
    .filter((r) => r.data.startsWith(prefix) && r.origem === 'MANUAL' && r.data.slice(5) !== '02-29')
    .map((r) => ({ data: `${year}-${r.data.slice(5)}`, nome: r.nome, tipo: r.tipo, meioExpediente: r.meioExpediente }));
}

export async function copyHolidaysFromPreviousYear(records: HolidayRecord[], year: number): Promise<{ inserted: number; skipped: number }> {
  return importRows(buildCopyFromPreviousYear(records, year), 'MANUAL');
}

export async function saveHoliday(record: Omit<HolidayRecord, 'origem'>, dataOriginal?: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('save_holiday_atomic', {
    p_data: record.data,
    p_nome: record.nome,
    p_tipo: record.tipo,
    p_ativo: record.ativo,
    p_meio_expediente: record.meioExpediente,
    p_data_original: dataOriginal ?? null
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

export async function deleteHoliday(data: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('delete_holiday_atomic', { p_data: data });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Recarrega o cadastro e aplica ao motor temporal. Falha de leitura mantém o calendário calculado. */
export async function loadAndApplyHolidays(): Promise<HolidayRecord[]> {
  try {
    const records = await fetchHolidays();
    applyHolidayRecords(records);
    return records;
  } catch (err) {
    console.warn('[holidays] Calendário de feriados não carregado; usando o calendário calculado:', err);
    applyHolidayRecords([]);
    return [];
  }
}

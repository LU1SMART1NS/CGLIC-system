import { afterEach, describe, expect, it } from 'vitest';
import {
  applyHolidayRecords,
  computeBaselineHolidays,
  computeUsualPontosFacultativos,
  easterSunday,
  isHolidayISO
} from '../holidayCalendar';
import { addBusinessDays, differenceInBusinessDays, formatDateISO, parseDateBRT } from '../../services/temporalEngineService';

afterEach(() => applyHolidayRecords([]));

describe('holidayCalendar', () => {
  it('calcula a Páscoa e os feriados móveis (mesmas datas da BrasilAPI)', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    const dates = computeBaselineHolidays(2026).map((h) => h.data);
    expect(dates).toEqual(expect.arrayContaining(['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']));
  });

  it('inclui nacionais fixos, Consciência Negra a partir de 2024 e o feriado distrital do DF', () => {
    const y2026 = computeBaselineHolidays(2026);
    expect(y2026.map((h) => h.data)).toEqual(expect.arrayContaining(['2026-01-01', '2026-04-21', '2026-10-12', '2026-11-20', '2026-12-25']));
    expect(y2026.find((h) => h.data === '2026-11-30')).toMatchObject({ tipo: 'DISTRITAL' });
    expect(computeBaselineHolidays(2023).some((h) => h.data === '2023-11-20')).toBe(false);
  });

  it('sugere os pontos facultativos usuais, com meio expediente nos de horário reduzido', () => {
    const pf = computeUsualPontosFacultativos(2026);
    expect(pf.find((h) => h.data === '2026-02-18')).toMatchObject({ meioExpediente: true });
    expect(pf.find((h) => h.data === '2026-10-28')).toMatchObject({ meioExpediente: false });
  });

  it('sem cadastro, o calendário calculado já é descontado dos dias úteis', () => {
    // Sexta 09/10/2026 + 1 dia útil: segunda 12/10 é Nossa Senhora Aparecida -> terça 13/10.
    expect(formatDateISO(addBusinessDays(parseDateBRT('2026-10-09')!, 1))).toBe('2026-10-13');
    expect(differenceInBusinessDays(parseDateBRT('2026-10-13')!, parseDateBRT('2026-10-09')!)).toBe(1);
  });

  it('a data cadastrada prevalece: ponto facultativo manual conta, desativado e meio expediente não', () => {
    applyHolidayRecords([
      { data: '2026-10-28', ativo: true, meioExpediente: false },
      { data: '2026-10-12', ativo: false, meioExpediente: false },
      { data: '2026-02-18', ativo: true, meioExpediente: true }
    ]);
    expect(isHolidayISO('2026-10-28')).toBe(true);
    expect(isHolidayISO('2026-10-12')).toBe(false);
    expect(isHolidayISO('2026-02-18')).toBe(false);
    expect(isHolidayISO('2026-12-25')).toBe(true);
  });

  it('lista explícita de feriados substitui o calendário do sistema', () => {
    expect(formatDateISO(addBusinessDays(parseDateBRT('2026-10-09')!, 1, []))).toBe('2026-10-12');
  });
});

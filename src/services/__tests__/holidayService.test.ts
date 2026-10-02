import { describe, expect, it, vi } from 'vitest';
import { buildCopyFromPreviousYear, fetchBrasilApiHolidays } from '../holidayService';
import type { HolidayRecord } from '../../config/holidayCalendar';

describe('holidayService', () => {
  it('lê a BrasilAPI e descarta a Páscoa', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { date: '2026-04-03', name: 'Sexta-feira Santa', type: 'national' },
        { date: '2026-04-05', name: 'Páscoa', type: 'national' }
      ]
    });
    const result = await fetchBrasilApiHolidays(2026, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://brasilapi.com.br/api/feriados/v1/2026');
    expect(result).toEqual([{ data: '2026-04-03', nome: 'Sexta-feira Santa', tipo: 'NACIONAL', meioExpediente: false }]);
  });

  it('falha quando a BrasilAPI não responde 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchBrasilApiHolidays(2026, fetchImpl as unknown as typeof fetch)).rejects.toThrow('503');
  });

  it('copia do ano anterior só as datas manuais, mantendo dia e mês', () => {
    const records: HolidayRecord[] = [
      { data: '2025-10-28', nome: 'Dia do Servidor Público', tipo: 'PONTO_FACULTATIVO', origem: 'MANUAL', ativo: true, meioExpediente: false },
      { data: '2025-12-25', nome: 'Natal', tipo: 'NACIONAL', origem: 'API', ativo: true, meioExpediente: false },
      { data: '2024-02-29', nome: 'Bissexto', tipo: 'PONTO_FACULTATIVO', origem: 'MANUAL', ativo: true, meioExpediente: false },
      { data: '2026-01-02', nome: 'Outro ano', tipo: 'PONTO_FACULTATIVO', origem: 'MANUAL', ativo: true, meioExpediente: false }
    ];
    expect(buildCopyFromPreviousYear(records, 2026)).toEqual([
      { data: '2026-10-28', nome: 'Dia do Servidor Público', tipo: 'PONTO_FACULTATIVO', meioExpediente: false }
    ]);
    expect(buildCopyFromPreviousYear(records, 2025)).toEqual([]);
  });
});

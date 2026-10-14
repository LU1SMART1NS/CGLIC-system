import { describe, it, expect, vi, afterEach } from 'vitest';
import { esperarNoMaximo, ESPERA_MAXIMA_REGRAS_MS } from '../esperarNoMaximo';

describe('esperarNoMaximo (porta das regras de alertas)', () => {
  afterEach(() => vi.useRealTimers());

  it('abre assim que as regras chegam', async () => {
    let pronto = false;
    await esperarNoMaximo(Promise.resolve(), ESPERA_MAXIMA_REGRAS_MS).then(() => { pronto = true; });
    expect(pronto).toBe(true);
  });

  it('abre mesmo se a carga falhar', async () => {
    await expect(esperarNoMaximo(Promise.reject(new Error('rede')), ESPERA_MAXIMA_REGRAS_MS)).resolves.toBeUndefined();
  });

  it('abre depois de 8 s quando o banco não responde', async () => {
    vi.useFakeTimers();
    let pronto = false;
    void esperarNoMaximo(new Promise(() => {}), ESPERA_MAXIMA_REGRAS_MS).then(() => { pronto = true; });
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_REGRAS_MS - 1);
    expect(pronto).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(pronto).toBe(true);
  });
});

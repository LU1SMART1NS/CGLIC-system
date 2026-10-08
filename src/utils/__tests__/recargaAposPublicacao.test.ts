import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recarregarUmaVez, importarComRecarga } from '../recargaAposPublicacao';

describe('recarga após publicação', () => {
  const reload = vi.fn();
  let guardado: Record<string, string>;

  beforeEach(() => {
    guardado = {};
    reload.mockReset();
    vi.stubGlobal('window', { location: { reload } });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => guardado[k] ?? null,
      setItem: (k: string, v: string) => { guardado[k] = v; }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recarrega na primeira falha e não recarrega de novo logo em seguida (sem laço)', () => {
    expect(recarregarUmaVez()).toBe(true);
    expect(recarregarUmaVez()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('volta a recarregar depois de passada a janela de 30 s', () => {
    const agora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    recarregarUmaVez();
    agora.mockReturnValue(1_000_000 + 31_000);
    expect(recarregarUmaVez()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
    agora.mockRestore();
  });

  it('não recarrega quando a sessionStorage está bloqueada', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('bloqueado'); } });
    expect(recarregarUmaVez()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('repassa o erro de importação quando já recarregou há pouco', async () => {
    guardado['cglic:recarga-apos-publicacao'] = String(Date.now());
    const falha = new Error('Failed to fetch dynamically imported module');
    await expect(importarComRecarga(() => Promise.reject(falha))).rejects.toBe(falha);
    expect(reload).not.toHaveBeenCalled();
  });

  it('recarrega quando o arquivo da tela sumiu e devolve o módulo quando carrega', async () => {
    const pendente = importarComRecarga(() => Promise.reject(new Error('404')));
    await Promise.resolve(); await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    void pendente;
    await expect(importarComRecarga(() => Promise.resolve({ default: 1 }))).resolves.toEqual({ default: 1 });
  });
});

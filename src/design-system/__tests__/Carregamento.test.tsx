import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvisoCarregando, criarControleIndicador } from '../components/Carregamento';

describe('criarControleIndicador (barra do topo)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const montar = () => {
    const mudancas: boolean[] = [];
    const controle = criarControleIndicador({ atraso: 300, minimo: 500, aoMudar: (v) => mudancas.push(v) });
    return { controle, mudancas };
  };

  it('carregamento rápido (até 0,3 s) não acende nada', () => {
    const { controle, mudancas } = montar();
    controle.definirAtivo(true);
    vi.advanceTimersByTime(200);
    controle.definirAtivo(false);
    vi.advanceTimersByTime(1000);
    expect(mudancas).toEqual([]);
  });

  it('acende depois de 0,3 s e apaga ao terminar, se já passou o mínimo', () => {
    const { controle, mudancas } = montar();
    controle.definirAtivo(true);
    vi.advanceTimersByTime(300);
    expect(mudancas).toEqual([true]);
    vi.advanceTimersByTime(1000);
    controle.definirAtivo(false);
    expect(mudancas).toEqual([true, false]);
  });

  it('fica acesa no mínimo 0,5 s', () => {
    const { controle, mudancas } = montar();
    controle.definirAtivo(true);
    vi.advanceTimersByTime(350);
    controle.definirAtivo(false);
    expect(mudancas).toEqual([true]);
    vi.advanceTimersByTime(449);
    expect(mudancas).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(mudancas).toEqual([true, false]);
  });

  it('nova leitura durante o tempo mínimo mantém a barra acesa sem piscar', () => {
    const { controle, mudancas } = montar();
    controle.definirAtivo(true);
    vi.advanceTimersByTime(350);
    controle.definirAtivo(false);
    vi.advanceTimersByTime(100);
    controle.definirAtivo(true);
    vi.advanceTimersByTime(2000);
    expect(mudancas).toEqual([true]);
    controle.definirAtivo(false);
    expect(mudancas).toEqual([true, false]);
  });

  it('encerrar cancela o que estava agendado', () => {
    const { controle, mudancas } = montar();
    controle.definirAtivo(true);
    controle.encerrar();
    vi.advanceTimersByTime(1000);
    expect(mudancas).toEqual([]);
  });
});

describe('AvisoCarregando', () => {
  it('nasce vazio (o texto só aparece após 1 s) e já anuncia o status para leitores de tela', () => {
    const html = renderToStaticMarkup(<AvisoCarregando label="Carregando atas" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-fase="0"');
    expect(html).not.toContain('Carregando atas');
  });
});

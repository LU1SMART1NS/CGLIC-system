import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useBreakpoint, useMediaQuery } from '../hooks/useMediaQuery';
import { breakpoints, responsiveGrid } from '../tokens';

const Probe = () => <span>{String(useMediaQuery('(max-width: 767px)'))}|{useBreakpoint()}</span>;

describe('useMediaQuery / useBreakpoint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retorna false/xs quando matchMedia não existe (SSR e testes)', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('false|xs');
  });

  it('reflete matchMedia quando disponível', () => {
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({
        matches: q.includes(`min-width: ${breakpoints.md}px`) || q.includes(`min-width: ${breakpoints.sm}px`),
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    });
    expect(renderToStaticMarkup(<Probe />)).toContain('md');
  });

  it('breakpoints seguem a escala 480/768/1024/1280', () => {
    expect(breakpoints).toEqual({ sm: 480, md: 768, lg: 1024, xl: 1280 });
  });

  it('responsiveGrid limita a coluna mínima à largura do contêiner', () => {
    expect(responsiveGrid(220)).toBe('repeat(auto-fit, minmax(min(100%, 220px), 1fr))');
    expect(responsiveGrid(260, 'fill')).toBe('repeat(auto-fill, minmax(min(100%, 260px), 1fr))');
  });
});

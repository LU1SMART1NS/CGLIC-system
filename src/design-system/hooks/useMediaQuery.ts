import { useEffect, useState } from 'react';
import { breakpoints, type Breakpoint } from '../tokens';

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/** Retorna false quando matchMedia não existe (SSR, testes). */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState<boolean>(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return value;
}

/** xs (<480) | sm (480–767) | md (768–1023) | lg (1024–1279) | xl (≥1280). */
export function useBreakpoint(): Breakpoint {
  const xl = useMediaQuery(`(min-width: ${breakpoints.xl}px)`);
  const lg = useMediaQuery(`(min-width: ${breakpoints.lg}px)`);
  const md = useMediaQuery(`(min-width: ${breakpoints.md}px)`);
  const sm = useMediaQuery(`(min-width: ${breakpoints.sm}px)`);
  if (xl) return 'xl';
  if (lg) return 'lg';
  if (md) return 'md';
  if (sm) return 'sm';
  return 'xs';
}

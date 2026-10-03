import { describe, it, expect } from 'vitest';

/**
 * Convenções de interface (Fase 11): sem diálogos nativos do navegador e sem emojis na interface.
 * Confirmações usam `useConfirmDialog`, avisos usam `useToast` e janelas usam o `Modal` compartilhado.
 */
const modules = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const FILES = Object.entries(modules)
  .map(([path, text]) => ({ file: path.replace(/^\.\.\//, ''), text }))
  .filter(({ file }) => !/(^|\/)__tests__\//.test(file) && !/\.test\.tsx$/.test(file));
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('convenções de interface', () => {
  it('não usa alert() nem window.confirm()', () => {
    expect(FILES.length).toBeGreaterThan(100); // garante que a varredura enxerga o código
    const offenders = FILES.filter(({ text }) => /(^|[^.\w])alert\(|window\.confirm\(/.test(stripComments(text))).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('não usa emojis nos textos da interface', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{2B50}\u{26A0}\u{1F512}]/u;
    const offenders = FILES.filter(({ text }) => emoji.test(stripComments(text))).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('janelas modais usam o Modal compartilhado (sem overlay próprio com position fixed + backdrop)', () => {
    const offenders = FILES.filter(
      ({ file, text }) => !file.startsWith('design-system') && /className="modal-backdrop"/.test(text)
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('grids auto-fit/auto-fill usam minmax(min(100%, Npx), 1fr) para não estourar em telas estreitas', () => {
    const offenders = FILES.filter(({ text }) =>
      /repeat\(auto-(fit|fill),\s*minmax\(\d+px/.test(stripComments(text))
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('texto da interface não usa fonte menor que 12px (0.75rem)', () => {
    const offenders = FILES.filter(({ text }) => {
      const t = stripComments(text);
      return /fontSize:\s*['"]0\.(?:[0-6]\d*|7[0-4]\d*)rem['"]/.test(t) || /fontSize:\s*['"]?(?:[0-9]|1[01])(?:px)?['"]?\s*[,}]/.test(t);
    }).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});

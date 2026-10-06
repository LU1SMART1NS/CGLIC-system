import { describe, it, expect } from 'vitest';
import { ACTION_LABELS } from '../actions';

/**
 * Trava do catálogo de ações (src/design-system/actions.ts): a mesma ação tem a mesma cor em qualquer tela.
 * Se falhar, use `<ActionButton action="…" />` em vez de escolher variante no ponto de uso.
 */
const modules = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const FILES = Object.entries(modules)
  .map(([path, text]) => ({ file: path.replace(/^\//, ''), text }))
  .filter(({ file }) => !file.includes('/__tests__/') && !file.endsWith('.test.tsx'))
  .filter(({ file }) => !file.startsWith('src/design-system/')); // o design system implementa o catálogo

/** Abre cada <AppButton/IconButton …> e devolve só a tag de abertura (com chaves balanceadas). */
function tagsDeBotao(text: string): string[] {
  const tags: string[] = [];
  const re = /<(AppButton|IconButton)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0;
    let j = m.index;
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[j - 1] !== '=') break;
    }
    tags.push(text.slice(m.index, j + 1));
  }
  return tags;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('convenções de ações de botão', () => {
  it('a varredura enxerga o código', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('nenhum AppButton solto usa um rótulo do catálogo', () => {
    const re = new RegExp(`>\\s*(${ACTION_LABELS.map(escape).join('|')})\\s*</AppButton>`, 'i');
    const infratores = FILES.filter(({ text }) => re.test(text)).map((f) => f.file);
    expect(infratores, `Use ActionButton para ações do catálogo:\n${infratores.join('\n')}`).toEqual([]);
  });

  it('botão só com ícone vem sempre do catálogo (ActionButton iconOnly)', () => {
    const infratores = FILES.filter(({ text }) => tagsDeBotao(text).some((t) => t.startsWith('<IconButton') || /\biconOnly\b/.test(t))).map((f) => f.file);
    expect(infratores, `Use ActionButton iconOnly (acrescente a ação ao catálogo se faltar):\n${infratores.join('\n')}`).toEqual([]);
  });

  it('variant="danger" sólido só existe no ConfirmDialog (design system)', () => {
    const infratores = FILES.filter(({ text }) => tagsDeBotao(text).some((t) => /variant="danger"/.test(t))).map((f) => f.file);
    expect(infratores).toEqual([]);
  });

  it('verde (success) só para aplicar sugestão automática: nunca em AppButton solto', () => {
    const infratores = FILES.filter(({ text }) => tagsDeBotao(text).some((t) => /variant="success"/.test(t))).map((f) => f.file);
    expect(infratores, 'Use ActionButton action="aplicarSugestao"; atribuir/transferir/alinhar gestor não são sugestão.').toEqual([]);
  });
});

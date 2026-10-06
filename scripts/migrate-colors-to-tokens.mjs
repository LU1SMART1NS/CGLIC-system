// Fase 1 da padronização de cores: troca hex soltos por tokens CSS (var(--...)), sem mudar o visual.
// Uso: node scripts/migrate-colors-to-tokens.mjs [--dry]
import fs from 'fs';
import path from 'path';

const DRY = process.argv.includes('--dry');

const MAP = {
  '#0c326f': 'var(--primary)',
  '#08214d': 'var(--primary-hover)',
  '#fef2f2': 'var(--color-danger-bg)',
  '#fee2e2': 'var(--color-danger-bg-strong)',
  '#fecaca': 'var(--color-danger-border)',
  '#ef4444': 'var(--color-danger-solid)',
  '#dc2626': 'var(--color-danger)',
  '#b91c1c': 'var(--color-danger-text)',
  '#991b1b': 'var(--color-danger-text-strong)',
  '#f0fdf4': 'var(--color-success-bg)',
  '#bbf7d0': 'var(--color-success-border)',
  '#16a34a': 'var(--color-success-solid)',
  '#059669': 'var(--color-success)',
  '#15803d': 'var(--color-success-text)',
  '#166534': 'var(--color-success-text-strong)',
  '#fffbeb': 'var(--color-warning-bg)',
  '#fef3c7': 'var(--color-warning-bg-strong)',
  '#fde68a': 'var(--color-warning-border)',
  '#f59e0b': 'var(--color-warning-solid)',
  '#d97706': 'var(--color-warning)',
  '#b45309': 'var(--color-warning-text)',
  '#92400e': 'var(--color-warning-text-strong)',
  '#eff6ff': 'var(--color-info-bg)',
  '#bfdbfe': 'var(--color-info-border)',
  '#3b82f6': 'var(--color-info-solid)',
  '#1d4ed8': 'var(--color-info-text)',
  '#1e3a8a': 'var(--color-info-text-strong)'
};

// Arquivos onde a cor é dado (concatenada com alfa) ou vai para fora do CSS (Excel).
const SKIP_FILES = [/src\/types\/user\.ts$/, /src\/services\/excelExportService\.ts$/];
// Linhas que não podem virar var() (a cor é concatenada com alfa: `${cor}1a`).
const SKIP_LINES = [/badgeColor/, /const color = roleObj\?\.badgeColor/];

const HEX = /#[0-9a-fA-F]{6}(?![0-9a-zA-Z])/g;
const counts = {};
const files = {};

function convert(line, file) {
  return line.replace(HEX, (m, offset) => {
    const key = m.toLowerCase();
    if (offset > 0 && /[0-9a-zA-Z&]/.test(line[offset - 1])) return m;
    if (key === '#0284c7') {
      const isFocus = (/\.css$/.test(file) && /focus-visible/.test(line)) || (/tokens\.ts$/.test(file) && /\bfocus:/.test(line));
      if (!isFocus) return m;
      counts['--color-focus'] = (counts['--color-focus'] || 0) + 1;
      files[file] = (files[file] || 0) + 1;
      return 'var(--color-focus)';
    }
    const to = MAP[key];
    if (!to) return m;
    counts[to] = (counts[to] || 0) + 1;
    files[file] = (files[file] || 0) + 1;
    return to;
  });
}

function processFile(file) {
  if (SKIP_FILES.some((r) => r.test(file))) return;
  const src = fs.readFileSync(file, 'utf8');
  const isCss = file.endsWith('.css');
  const out = src.split('\n').map((line, i, all) => {
    if (SKIP_LINES.some((r) => r.test(line))) return line;
    // tokens definidos no :root: --primary/--primary-hover continuam literais (fonte da verdade)
    if (isCss && /^\s*--(primary(-hover)?|color-[a-z-]+)\s*:/.test(line)) return line;
    // lista STATUS_OPTIONS do plano: a cor é concatenada com alfa
    if (/TaskPlanSection\.tsx$/.test(file) && /color: '#/.test(line) && /value: '/.test(line)) return line;
    return convert(line, file);
  }).join('\n');
  if (out !== src && !DRY) fs.writeFileSync(file, out);
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); }
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) processFile(p);
  }
}

walk('src');
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`${DRY ? '[dry-run] ' : ''}${total} trocas em ${Object.keys(files).length} arquivos`);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));

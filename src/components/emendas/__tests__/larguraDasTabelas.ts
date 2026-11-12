import { expect } from 'vitest';

/**
 * Regra D1 da revisão das tabelas de Emendas (30/10/2026): nenhuma tabela rola para o lado numa tela de 1366px. A área
 * útil ali é de 1.207px (menos o menu lateral, as margens e a barra de rolagem); a trava fica em no máximo 6 colunas e
 * a soma das larguras mínimas dos cabeçalhos até 900px, o que deixa folga para o conteúdo das células.
 */
export const MAX_COLUNAS = 6;
export const MAX_LARGURA_MINIMA = 900;

/** Lê, do HTML renderizado, os cabeçalhos da tabela `testId` e confere a regra. */
export function confereLarguraDaTabela(html: string, testId: string): { colunas: number; larguraMinima: number } {
  const inicio = html.indexOf(`data-testid="${testId}"`);
  expect(inicio, `tabela ${testId} não apareceu`).toBeGreaterThanOrEqual(0);
  const cabecalho = html.slice(inicio, html.indexOf('</thead>', inicio));
  const ths = cabecalho.match(/<th\b[^>]*>/g) ?? [];
  // A coluna de seleção (caixinha, sem título) não conta como coluna de leitura.
  const colunas = ths.filter((th) => !/width:36px/.test(th)).length;
  const larguraMinima = ths.reduce((s, th) => s + Number(/min-width:(\d+)px/.exec(th)?.[1] ?? 0), 0);
  expect(colunas, `${testId}: ${colunas} colunas`).toBeLessThanOrEqual(MAX_COLUNAS);
  expect(larguraMinima, `${testId}: ${larguraMinima}px de largura mínima`).toBeLessThanOrEqual(MAX_LARGURA_MINIMA);
  return { colunas, larguraMinima };
}

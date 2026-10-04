import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { measureLayout, waitForSettled, type LayoutMetrics } from './layoutProbe';

/**
 * Regressão de layout mobile: percorre as rotas e abas do sistema e confere os critérios da
 * auditoria (AUDITORIA_MOBILE_FECHAMENTO.md). Veja e2e/README.md para a sessão e as chaves de teste.
 */
const ATA_KEY = process.env.E2E_ATA_KEY ?? '00059/2025-200331';
const CONTRACT_KEY = process.env.E2E_CONTRACT_KEY ?? '200331-00141-2025';
const ITEM = process.env.E2E_ITEM ?? '00001';
const ata = encodeURIComponent(ATA_KEY);

const ROUTES: Array<{ name: string; url: string }> = [
  { name: 'Visão Geral', url: '/instrumentos' },
  { name: 'Carteira de Atas', url: '/atas' },
  { name: 'Itens da carteira', url: '/itens' },
  { name: 'Carteira de Contratos', url: '/contratos' },
  { name: 'Pagamentos', url: '/pagamentos' },
  { name: 'Empenhos', url: '/empenhos' },
  { name: 'Modelos de Ata', url: '/atas/modelos' },
  { name: 'Modelos de Contrato', url: '/contratos/modelos' },
  { name: 'Unidades internas', url: '/admin/departamentos' },
  { name: 'Usuários', url: '/admin/usuarios' },
  { name: 'Perfis', url: '/admin/perfis' },
  { name: 'Regras de alertas', url: '/admin/regras-alertas' },
  { name: 'Feriados', url: '/admin/feriados' },
  ...['acoes', 'plano', 'itens', 'contratos'].map((aba) => ({ name: `Ata 360 · ${aba}`, url: `/atas/detalhe/${ata}?aba=${aba}` })),
  ...['acoes', 'plano', 'pagamentos', 'financeiro', 'historico'].map((aba) => ({
    name: `Contrato 360 · ${aba}`,
    url: `/contratos/${encodeURIComponent(CONTRACT_KEY)}?aba=${aba}`
  })),
  ...['unidades', 'alocacao', 'contratos', 'adesoes'].map((aba) => ({
    name: `Item · ${aba}`,
    url: `/atas/detalhe/${ata}/itens/${ITEM}?aba=${aba}`
  }))
];

test.skip(!fs.existsSync('e2e/.auth/state.json'), 'Sem sessão salva: rode `npm run e2e:login` uma vez (e2e/README.md).');

for (const route of ROUTES) {
  test(route.name, async ({ page }, testInfo) => {
    const strict = Boolean(testInfo.project.metadata.strict);
    await page.goto(route.url);
    await waitForSettled(page);
    const m: LayoutMetrics = await measureLayout(page);

    // Em qualquer tela: a página não rola na horizontal e nenhum controle fica inalcançável.
    expect(m.scrollWidth, `largura da página em ${m.path}`).toBeLessThanOrEqual(m.viewportWidth);
    expect(m.unreachable, 'controles inalcançáveis').toEqual([]);
    if (!strict) return;

    // Em 375px, os demais critérios de aceite.
    expect(m.offscreenInScroller, 'ações fora da tela dentro de rolagens').toEqual([]);
    expect(m.smallTargets, 'alvos de toque < 44px').toEqual([]);
    expect(m.inputsBelow16, 'inputs com fonte < 16px').toBe(0);
    expect(m.textBelow12, 'textos < 12px').toBe(0);
  });
}

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Abre o Chrome para você entrar no sistema e salva a sessão em e2e/.auth/state.json.
 * A senha é digitada por você no navegador; este script nunca a lê nem a guarda, só o
 * estado do navegador (que é ignorado pelo git).
 */
const STATE = path.join('e2e', '.auth', 'state.json');
const base = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/login`);
console.log('Entre no sistema na janela aberta. Aguardando até 5 minutos...');
await page.waitForURL((url) => !/\/(login|definir-senha|redefinir-senha)/.test(url.pathname), { timeout: 300_000 });
await page.waitForTimeout(2000);
fs.mkdirSync(path.dirname(STATE), { recursive: true });
await context.storageState({ path: STATE });
await browser.close();
console.log(`Sessão salva em ${STATE}`);

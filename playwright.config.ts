import { defineConfig } from '@playwright/test';

/**
 * Testes de layout mobile (e2e). Usam o Chrome instalado na máquina (channel 'chrome'),
 * sem baixar navegador, e a sessão salva por `npm run e2e:login` (ver e2e/README.md).
 */
const viewport = (width: number, height: number) => ({
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  storageState: 'e2e/.auth/state.json'
});

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: 'mobile-375', use: viewport(375, 812), metadata: { strict: true } },
    { name: 'mobile-320', use: viewport(320, 640), metadata: { strict: false } },
    { name: 'tablet-768', use: viewport(768, 1024), metadata: { strict: false } }
  ]
});

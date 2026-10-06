/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Worktrees isolados criados por sessões de agente (ex.: .claude/worktrees/<nome>)
      // duplicavam a suíte inteira por estarem aninhados dentro do repositório.
      '**/.claude/**',
      // Testes e2e (Playwright) rodam com `npm run e2e`, não com o vitest
      'e2e/**'
    ]
  },
  server: {
    proxy: {
      '/api-arp': {
        target: 'https://dadosabertos.compras.gov.br',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-arp/, '')
      },
      '/api-pncp': {
        target: 'https://pncp.gov.br',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-pncp/, '')
      },
      '/api-contratos-gov': {
        target: 'https://contratos.comprasnet.gov.br',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-contratos-gov/, '')
      },
      '/api-sta': {
        target: 'https://sta.api.gov.br',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-sta/, '')
      }
    }
  }
})

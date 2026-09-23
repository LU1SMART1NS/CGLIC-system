import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      }
    }
  }
})

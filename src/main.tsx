import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ouvirFalhaDePreCarga } from './utils/recargaAposPublicacao'

ouvirFalhaDePreCarga()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

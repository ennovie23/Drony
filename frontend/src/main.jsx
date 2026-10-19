import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppDataProvider from './context/AppDataProvider.jsx'
import { readStoredTheme } from './hooks/themeStorage'

// Apply the saved theme before the first render so dark users don't see a light flash.
document.documentElement.dataset.theme = readStoredTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </BrowserRouter>
  </StrictMode>,
)

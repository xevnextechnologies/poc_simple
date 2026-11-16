import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { THEME } from './theme'

// Picks the colour set from index.css ("Themes")
document.documentElement.dataset.theme = THEME

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing so the built app also runs straight from disk, offline */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

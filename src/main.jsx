import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initTheme } from '@/lib/theme'
import { initColorMode } from '@/lib/colorMode'

initTheme()
initColorMode()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

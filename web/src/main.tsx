import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { syncDynamicType } from './lib/dynamicType'
import './styles.css'

registerSW({ immediate: true })
// Make the rem type scale follow the iOS Text Size setting (see lib/dynamicType).
syncDynamicType()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

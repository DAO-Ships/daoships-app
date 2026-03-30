import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { validateContractConfig } from '@/config/contracts'
import { useUiStore } from '@/store/uiStore'

// Validate contract configuration at startup
validateContractConfig()

// Initialize theme before render to prevent flash of unstyled content
useUiStore.getState().initializeTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

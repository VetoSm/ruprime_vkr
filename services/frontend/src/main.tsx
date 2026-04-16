import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './ui/theme.css'
import AppErrorBoundary from './ui/AppErrorBoundary'
import { setupGlobalErrorTracking } from './utils/telemetry'

setupGlobalErrorTracking()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)

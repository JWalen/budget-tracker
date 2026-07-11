import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerServiceWorker, applyUpdate } from './utils/pwa'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register the PWA service worker. On a new deploy, apply the update immediately
// (content-hashed assets make this safe) so users aren't pinned to a stale build.
registerServiceWorker({
  onUpdate: (registration) => applyUpdate(registration),
})

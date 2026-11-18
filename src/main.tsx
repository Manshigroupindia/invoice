import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-capacitor');
  if (Capacitor.getPlatform() === 'android') {
    document.documentElement.classList.add('is-android');
    SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

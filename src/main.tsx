import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import './i18n/index';
import App from './App.tsx';

// On native (APK) or Electron, unregister any lingering Service Workers.
// SWs make no sense there and can serve stale cached assets.
const isWrappedApp = Capacitor.isNativePlatform() || !!window.electronAPI;
if (isWrappedApp && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

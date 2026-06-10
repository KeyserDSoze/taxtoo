/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ElectronAPI {
  getAppVersion(): Promise<string>;
  getPlatform(): Promise<string>;
  checkForUpdates(): Promise<{ currentVersion: string; state: string }>;
  getUpdateState(): Promise<{ currentVersion: string; state: string }>;
  onUpdateStatus(cb: (state: string) => void): void;
  offUpdateStatus(): void;
  isElectron: true;
}

interface Window {
  electronAPI?: ElectronAPI;
}

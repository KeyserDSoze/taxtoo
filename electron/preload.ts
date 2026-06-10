import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('get-platform'),
  checkForUpdates: (): Promise<{ currentVersion: string; state: string }> =>
    ipcRenderer.invoke('check-for-updates'),
  getUpdateState: (): Promise<{ currentVersion: string; state: string }> =>
    ipcRenderer.invoke('get-update-state'),
  onUpdateStatus: (cb: (state: string) => void) => {
    ipcRenderer.on('update-status', (_e, state) => cb(state as string));
  },
  offUpdateStatus: () => {
    ipcRenderer.removeAllListeners('update-status');
  },
  isElectron: true as const,
});

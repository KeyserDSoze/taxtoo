import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import http from 'http';
import fs from 'fs';

const isDev = !app.isPackaged;
const PORT = 54321;

// ── Auto-updater ──────────────────────────────────────────────────────────────
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://taxtoo.app/downloads/',
});
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = null;

let _updateState: 'idle' | 'checking' | 'available' | 'restart' | 'upToDate' | 'error' = 'idle';
function broadcastUpdateState(state: typeof _updateState) {
  _updateState = state;
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('update-status', state));
}

autoUpdater.on('checking-for-update', () => broadcastUpdateState('checking'));
autoUpdater.on('update-available', () => broadcastUpdateState('available'));
autoUpdater.on('update-not-available', () => broadcastUpdateState('upToDate'));
autoUpdater.on('error', () => broadcastUpdateState('error'));
autoUpdater.on('update-downloaded', () => {
  broadcastUpdateState('restart');
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: 'A new version has been downloaded. Restart now to apply it.',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    })
    .catch(() => {});
});

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

function startLocalServer(distPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url?.split('?')[0] ?? '/';
      let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);

      // SPA fallback: serve index.html for unknown paths
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, 'index.html');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': getMimeType(path.extname(filePath)) });
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
    title: 'Taxtoo',
  });

  if (isDev) {
    void win.loadURL(`http://localhost:${PORT}`);
    win.webContents.openDevTools();
  } else {
    const distPath = path.join(__dirname, '..', 'dist');
    await startLocalServer(distPath);
    void win.loadURL(`http://localhost:${PORT}`);
  }

  // Open external links in the system browser (not inside Electron)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
  if (!isDev) setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers exposed to the renderer via preload
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('check-for-updates', () => {
  try {
    if (_updateState === 'restart') return { currentVersion: app.getVersion(), state: 'restart' };
    autoUpdater.checkForUpdates().catch(() => broadcastUpdateState('error'));
    return { currentVersion: app.getVersion(), state: 'checking' };
  } catch {
    broadcastUpdateState('error');
    return { currentVersion: app.getVersion(), state: 'error' };
  }
});
ipcMain.handle('get-update-state', () => ({
  currentVersion: app.getVersion(),
  state: _updateState,
}));

// Proceso principal de Electron - Perros Americanos POS
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path       = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');
const syncService = require('../sync/syncService');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// El updater solo corre en producción (app empaquetada)
const isDev = !app.isPackaged;

// Configurar logs del updater en ~/.config/pa-pos/logs/ (Linux) o %APPDATA%\pa-pos\logs\ (Windows)
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let ventanaPrincipal;

function configurarAutoUpdater() {
  if (isDev) return; // No verificar en desarrollo

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    ventanaPrincipal?.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
    log.info('Actualización disponible:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    ventanaPrincipal?.webContents.send('update:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    ventanaPrincipal?.webContents.send('update:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    ventanaPrincipal?.webContents.send('update:downloaded', {
      version: info.version,
    });
    log.info('Actualización descargada:', info.version);
  });

  autoUpdater.on('error', (err) => {
    ventanaPrincipal?.webContents.send('update:error', err.message);
    log.error('Error en updater:', err);
  });
}

// Instalar actualización ya descargada
ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall();
});

// Verificar actualizaciones manualmente desde la UI
ipcMain.handle('update:check', async () => {
  if (isDev) return { success: false, error: 'No disponible en desarrollo' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // necesario para better-sqlite3 via IPC
    },
    title: 'Perros Americanos POS',
    backgroundColor: '#1a1a2e',
    show: false, // esperar a que cargue para evitar flash blanco
  });

  // Cargar el HTML generado por webpack
  ventanaPrincipal.loadFile(path.join(__dirname, '../../dist/index.html'));

  // Mostrar ventana cuando esté lista + inicializar sync y updater
  ventanaPrincipal.once('ready-to-show', () => {
    ventanaPrincipal.show();
    ventanaPrincipal.webContents.openDevTools();
    if (ventanaPrincipal.getBounds().width < 1280) {
      ventanaPrincipal.maximize();
    }
    // Fase 2 del sync: registrar ventana y arrancar timer automático
    syncService.inicializar(ventanaPrincipal).catch(console.error);
    // Iniciar verificación de actualizaciones (solo en producción)
    configurarAutoUpdater();
  });

  Menu.setApplicationMenu(null);

  ventanaPrincipal.on('closed', () => {
    ventanaPrincipal = null;
  });
}

app.whenReady().then(async () => {
  // Fase 1: intentar descargar DB más reciente ANTES de que better-sqlite3 la abra.
  // Si no hay internet o falla, continúa normalmente con datos locales.
  await syncService.sincronizarPreArranque();

  // Configurar handlers IPC (abre la DB)
  setupIpcHandlers();
  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

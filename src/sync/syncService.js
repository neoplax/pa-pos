// Servicio de sincronización — orquesta cuándo y cómo sincronizar con Drive
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { app }  = require('electron');
const drive    = require('./googleDrive');

// ── Archivos de estado y log ──────────────────────────────────────────────────
const DIR_CONFIG     = path.join(os.homedir(), '.perros-americanos');
const ARCHIVO_ESTADO = path.join(DIR_CONFIG, 'sync_state.json');
const ARCHIVO_LOG    = path.join(DIR_CONFIG, 'sync.log');

// ── Estado en memoria ─────────────────────────────────────────────────────────
// Este objeto es la única fuente de verdad del estado de sync durante la sesión.
let estado = {
  configurado:      false,
  cuentaEmail:      null,
  espacioUsado:     0,
  espacioTotal:     0,
  ultimaSync:       null,     // ISO string o null
  estado:           'sin_configurar', // 'sincronizado'|'pendiente'|'error'|'sincronizando'|'sin_configurar'
  errorMsg:         null,
  syncAutoActivo:   true,
  intervaloMinutos: 30,
};

let timerAuto         = null;
let ventanaPrincipal  = null; // referencia a BrowserWindow para enviar eventos

// ── Utilidades ────────────────────────────────────────────────────────────────

function log(msg) {
  const linea = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    if (!fs.existsSync(DIR_CONFIG)) fs.mkdirSync(DIR_CONFIG, { recursive: true });
    fs.appendFileSync(ARCHIVO_LOG, linea);
  } catch (_) {}
  console.log('[Sync]', msg);
}

function leerEstadoPersistido() {
  try {
    if (!fs.existsSync(ARCHIVO_ESTADO)) return {};
    return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8'));
  } catch (_) { return {}; }
}

function persistirEstado() {
  try {
    if (!fs.existsSync(DIR_CONFIG)) fs.mkdirSync(DIR_CONFIG, { recursive: true });
    fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify({
      ultimaSync:       estado.ultimaSync,
      syncAutoActivo:   estado.syncAutoActivo,
      intervaloMinutos: estado.intervaloMinutos,
    }, null, 2), 'utf8');
  } catch (_) {}
}

// Enviar cambio de estado al renderer para que el indicador visual se actualice
function notificarRenderer() {
  try {
    if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
      ventanaPrincipal.webContents.send('sync:estadoCambiado', getEstado());
    }
  } catch (_) {}
}

function actualizarEstado(cambios) {
  estado = { ...estado, ...cambios };
  notificarRenderer();
  // Persistir solo los campos que sobreviven reinicios
  if ('ultimaSync' in cambios || 'syncAutoActivo' in cambios || 'intervaloMinutos' in cambios) {
    persistirEstado();
  }
}

// Recalcular el color del indicador según minutos desde la última sync
function _recalcularColor() {
  if (!estado.configurado)  { actualizarEstado({ estado: 'sin_configurar' }); return; }
  if (!estado.ultimaSync)   { actualizarEstado({ estado: 'pendiente'      }); return; }
  const minutos = (Date.now() - new Date(estado.ultimaSync).getTime()) / 60_000;
  actualizarEstado({ estado: minutos < 60 ? 'sincronizado' : 'pendiente', errorMsg: null });
}

// Ruta de la base de datos SQLite local
function rutaDB() {
  return path.join(app.getPath('userData'), 'perros_americanos.db');
}

// Ejecutar WAL checkpoint antes de subir para que el archivo .db esté completo
function checkpointWAL() {
  try {
    const { getDB } = require('../database');
    getDB().pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {}
}

// ── FASE 1 — Sync antes de abrir la DB (al arrancar) ─────────────────────────
// Se llama ANTES de setupIpcHandlers para que si hay una DB más nueva en Drive,
// se descarga antes de que better-sqlite3 la abra.
async function sincronizarPreArranque() {
  if (!drive.estaConfigurado()) return;

  log('Sync pre-arranque: verificando Drive...');
  try {
    const meta     = await drive.obtenerMetadatosDB();
    if (!meta) { log('No hay DB en Drive — saltando descarga'); return; }

    const rutaLocal    = rutaDB();
    const statLocal    = fs.existsSync(rutaLocal) ? fs.statSync(rutaLocal) : null;
    const mtimeLocal   = statLocal ? statLocal.mtime.getTime() : 0;
    const persistido   = leerEstadoPersistido();
    const tsUltimaSync = persistido.ultimaSync ? new Date(persistido.ultimaSync).getTime() : 0;
    const mtimeDrive   = new Date(meta.modifiedTime).getTime();

    if (mtimeDrive > tsUltimaSync && mtimeDrive > mtimeLocal) {
      log('Drive tiene DB más reciente — descargando antes de arrancar...');
      await drive.bajarDB(rutaLocal);
      log('DB descargada en pre-arranque');
    } else {
      log('DB local actualizada — no se requiere descarga al arrancar');
    }
  } catch (err) {
    // Nunca bloquear el arranque si hay fallo de red
    log(`Pre-arranque (ignorado): ${err.message}`);
  }
}

// ── FASE 2 — Inicializar después de que la ventana existe ────────────────────
async function inicializar(ventana) {
  ventanaPrincipal = ventana;

  const persistido = leerEstadoPersistido();
  estado.ultimaSync        = persistido.ultimaSync       || null;
  estado.syncAutoActivo    = persistido.syncAutoActivo   !== false;
  estado.intervaloMinutos  = persistido.intervaloMinutos || 30;
  estado.configurado       = drive.estaConfigurado();

  if (!estado.configurado) {
    actualizarEstado({ estado: 'sin_configurar' });
    log('Sin credenciales — sync desactivado');
    return;
  }

  // Cargar email desde tokens.json
  const email = drive.leerCuentaEmail();
  if (email) actualizarEstado({ cuentaEmail: email });

  _recalcularColor();
  log('Servicio de sync inicializado');

  // Obtener info de cuota de Drive en segundo plano (no bloquea el arranque)
  drive.obtenerInfoCuenta().then(info => {
    if (info) actualizarEstado({ espacioUsado: info.espacioUsado, espacioTotal: info.espacioTotal });
  }).catch(() => {});

  if (estado.syncAutoActivo) iniciarTimerAuto();
}

// ── Sincronización completa — decide subir, bajar o manejar conflicto ─────────
async function sincronizarAhora({ forzar = false, origen = 'manual' } = {}) {
  if (estado.estado === 'sincronizando') {
    return { ok: false, msg: 'Ya hay una sincronización en curso' };
  }
  if (!drive.estaConfigurado()) {
    return { ok: false, msg: 'No hay cuenta de Google configurada' };
  }

  log(`Iniciando sync (origen: ${origen})`);
  actualizarEstado({ estado: 'sincronizando', errorMsg: null });

  try {
    const ruta         = rutaDB();
    const meta         = await drive.obtenerMetadatosDB();
    const statLocal    = fs.existsSync(ruta) ? fs.statSync(ruta) : null;
    const mtimeLocal   = statLocal ? statLocal.mtime.getTime() : 0;
    const tsUltimaSync = estado.ultimaSync ? new Date(estado.ultimaSync).getTime() : 0;

    if (!meta) {
      // Primera subida: no hay nada en Drive todavía
      log('Primera subida a Drive...');
      checkpointWAL();
      await drive.subirDB(ruta);
      actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
      return { ok: true, accion: 'subida' };
    }

    const mtimeDrive   = new Date(meta.modifiedTime).getTime();
    const driveEsNueva = mtimeDrive   > tsUltimaSync;
    const localEsNueva = mtimeLocal   > tsUltimaSync;

    // CONFLICTO: ambos equipos modificaron desde la última sync
    if (driveEsNueva && localEsNueva && !forzar) {
      log('CONFLICTO detectado — guardando backups en Drive');
      const ts          = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const plataforma  = process.platform === 'win32' ? 'windows' : 'ubuntu';
      const otraPlat    = plataforma === 'ubuntu' ? 'windows' : 'ubuntu';

      // Subir copia local como backup
      checkpointWAL();
      await drive.subirBackup(ruta, `perros_americanos_${plataforma}_${ts}.db`);

      // Descargar la versión de Drive y subirla como backup del otro equipo
      const tmpBackup = path.join(os.tmpdir(), `pa_drive_bak_${ts}.db`);
      await drive.bajarDB(tmpBackup);
      await drive.subirBackup(tmpBackup, `perros_americanos_${otraPlat}_${ts}.db`);
      try { fs.unlinkSync(tmpBackup); } catch (_) {}

      // Usar la versión más reciente como principal en Drive
      if (mtimeLocal >= mtimeDrive) {
        log('Versión LOCAL más reciente — subiendo como principal');
        await drive.subirDB(ruta);
      } else {
        log('Versión de DRIVE más reciente — ya está como principal (no se descarga mientras corre la app)');
      }

      const msg = 'Conflicto detectado. Se usó la versión más reciente. Backups guardados en Drive.';
      actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
      log(msg);
      return { ok: true, accion: 'conflicto_resuelto', msg };
    }

    if (localEsNueva || forzar) {
      log('Subiendo versión local...');
      checkpointWAL();
      await drive.subirDB(ruta);
      actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
      return { ok: true, accion: 'subida' };
    }

    if (driveEsNueva) {
      // Drive tiene cambios nuevos: descargar requiere reinicio para que SQLite cargue la nueva DB
      log('Drive tiene versión más reciente — se requiere reinicio para aplicar');
      return { ok: true, accion: 'drive_mas_reciente', requiereReinicio: true };
    }

    // Ya está en sync
    actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
    log('Ya sincronizado — sin cambios');
    return { ok: true, accion: 'sin_cambios' };

  } catch (err) {
    log(`Error en sync: ${err.message}`);
    actualizarEstado({ estado: 'error', errorMsg: err.message });
    return { ok: false, msg: err.message };
  }
}

// ── Forzar subida ─────────────────────────────────────────────────────────────
async function subirAhora() {
  if (!drive.estaConfigurado()) return { ok: false, msg: 'Sin cuenta configurada' };

  log('Subida forzada...');
  actualizarEstado({ estado: 'sincronizando', errorMsg: null });
  try {
    checkpointWAL();
    await drive.subirDB(rutaDB());
    actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
    log('Subida forzada completada');
    return { ok: true, accion: 'subida' };
  } catch (err) {
    log(`Error en subida forzada: ${err.message}`);
    actualizarEstado({ estado: 'error', errorMsg: err.message });
    return { ok: false, msg: err.message };
  }
}

// ── Forzar bajada ─────────────────────────────────────────────────────────────
// Descarga a un archivo .new y reinicia la app para que SQLite cargue la nueva DB.
// No se puede sobrescribir la DB mientras better-sqlite3 la tiene abierta en Windows.
async function bajarAhora() {
  if (!drive.estaConfigurado()) return { ok: false, msg: 'Sin cuenta configurada' };

  log('Bajada forzada...');
  actualizarEstado({ estado: 'sincronizando', errorMsg: null });
  try {
    const ruta    = rutaDB();
    const tmpRuta = ruta + '.downloading';

    await drive.bajarDB(tmpRuta);

    // Reemplazar DB local con la descargada
    // (el archivo .downloading se convierte en el nuevo .db antes de reiniciar)
    if (fs.existsSync(ruta)) {
      fs.renameSync(ruta, ruta + '.bak');
    }
    fs.renameSync(tmpRuta, ruta);

    actualizarEstado({ ultimaSync: new Date().toISOString(), estado: 'sincronizado', errorMsg: null });
    log('Bajada forzada completada — se requiere reinicio para cargar la nueva DB');
    // requiereReinicio: true indica al renderer que haga app.relaunch()
    return { ok: true, accion: 'descarga', requiereReinicio: true };
  } catch (err) {
    // Limpiar archivo temporal si quedó a medias
    try { fs.unlinkSync(rutaDB() + '.downloading'); } catch (_) {}
    log(`Error en bajada forzada: ${err.message}`);
    actualizarEstado({ estado: 'error', errorMsg: err.message });
    return { ok: false, msg: err.message };
  }
}

// ── Sync post-cierre de caja (solo sube) ──────────────────────────────────────
async function sincronizarPostCierre() {
  if (!drive.estaConfigurado()) return;
  log('Sync post-cierre de caja');
  // Fire-and-forget: si falla, no afecta al cierre ya completado
  subirAhora().catch(err => log(`Error post-cierre: ${err.message}`));
}

// ── Timer automático cada N minutos ──────────────────────────────────────────
function iniciarTimerAuto() {
  detenerTimerAuto();
  const ms = (estado.intervaloMinutos || 30) * 60_000;
  timerAuto = setInterval(() => {
    if (!drive.estaConfigurado() || estado.estado === 'sincronizando') return;
    log(`Sync automático (cada ${estado.intervaloMinutos} min)`);
    // Solo sube en segundo plano — la descarga requiere reinicio y es operación manual
    subirAhora().catch(err => log(`Error sync auto: ${err.message}`));
  }, ms);
  log(`Timer automático activo — cada ${estado.intervaloMinutos} min`);
}

function detenerTimerAuto() {
  if (timerAuto) { clearInterval(timerAuto); timerAuto = null; }
}

// ── Configurar sincronización automática ─────────────────────────────────────
function configurarAutoSync({ activo, intervaloMinutos }) {
  const intervalo = parseInt(intervaloMinutos) || estado.intervaloMinutos;
  actualizarEstado({ syncAutoActivo: activo, intervaloMinutos: intervalo });
  if (activo) {
    iniciarTimerAuto();
    log(`Auto-sync activado (${intervalo} min)`);
  } else {
    detenerTimerAuto();
    log('Auto-sync desactivado');
  }
}

// ── Guardar clientId/clientSecret antes del flujo OAuth (Paso 2 del wizard) ──
function guardarCredencialesParciales(clientId, clientSecret) {
  drive.guardarCredencialesParciales(clientId, clientSecret);
  log(`Credenciales parciales guardadas (sin tokens) para: ${clientId.slice(0, 20)}...`);
}

// ── Iniciar flujo OAuth completo con servidor local (Paso 3 del wizard) ───────
// Recibe clientId y clientSecret leídos por el handler de IPC directamente del
// archivo credentials.json, para evitar cualquier problema de caché de módulo.
async function iniciarOAuth(clientId, clientSecret) {
  try {
    const resultado = await drive.iniciarFlujoOAuth(clientId, clientSecret);

    actualizarEstado({
      configurado:  true,
      cuentaEmail:  resultado.email,
      estado:       'pendiente',
      errorMsg:     null,
    });
    log(`Cuenta conectada: ${resultado.email}`);

    // Obtener info de espacio en segundo plano
    drive.obtenerInfoCuenta().then(info => {
      if (info) actualizarEstado({ espacioUsado: info.espacioUsado, espacioTotal: info.espacioTotal });
    }).catch(() => {});

    if (estado.syncAutoActivo) iniciarTimerAuto();
    return { ok: true, email: resultado.email };
  } catch (err) {
    log(`Error en autenticación: ${err.message}`);
    return { ok: false, msg: err.message };
  }
}

// ── Desconectar cuenta ────────────────────────────────────────────────────────
function desconectarCuenta() {
  try {
    if (fs.existsSync(drive.ARCHIVO_CREDS))   fs.unlinkSync(drive.ARCHIVO_CREDS);
    if (fs.existsSync(drive.ARCHIVO_TOKENS))  fs.unlinkSync(drive.ARCHIVO_TOKENS);
  } catch (_) {}
  detenerTimerAuto();
  actualizarEstado({
    configurado:  false, cuentaEmail:  null,
    estado:       'sin_configurar', errorMsg: null,
    ultimaSync:   null, espacioUsado: 0, espacioTotal: 0,
  });
  log('Cuenta de Google desconectada');
}

// ── Obtener estado completo (para IPC) ────────────────────────────────────────
// Incluye carpeta_id leído de tokens.json para que el renderer pueda mostrarlo.
function getEstado() {
  return { ...estado, carpetaId: drive.leerTokens()?.carpeta_id || null };
}

module.exports = {
  sincronizarPreArranque,
  inicializar,
  sincronizarAhora,
  subirAhora,
  bajarAhora,
  sincronizarPostCierre,
  guardarCredencialesParciales,
  iniciarOAuth,
  desconectarCuenta,
  configurarAutoSync,
  getEstado,
};

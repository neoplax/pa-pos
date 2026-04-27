// Módulo de integración con Google Drive — autenticación OAuth2 y transferencia del archivo DB
const { google } = require('googleapis');
const { shell }  = require('electron');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const http       = require('http');
const url        = require('url');

// ── Rutas de configuración local ──────────────────────────────────────────────
const DIR_CONFIG     = path.join(os.homedir(), '.perros-americanos');
const ARCHIVO_CREDS  = path.join(DIR_CONFIG, 'credentials.json'); // client_id + client_secret
const ARCHIVO_TOKENS = path.join(DIR_CONFIG, 'tokens.json');      // refresh_token + datos de sesión

// ── Constantes de Google Drive ────────────────────────────────────────────────
const NOMBRE_CARPETA  = 'PerrosAmericanos_POS';
const NOMBRE_DB_DRIVE = 'perros_americanos.db';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Puertos a intentar en orden — todos deben estar registrados en Google Cloud Console
// como URIs de redirección autorizados: http://127.0.0.1:PUERTO/callback
const PUERTOS = [8080, 8081, 8082, 8083, 8084];

// ── Utilidad: crear directorio de config si no existe ─────────────────────────
function asegurarDirConfig() {
  if (!fs.existsSync(DIR_CONFIG)) fs.mkdirSync(DIR_CONFIG, { recursive: true });
}

// ── Leer credentials.json — formato: { client_id, client_secret } ─────────────
function leerCredenciales() {
  try {
    if (!fs.existsSync(ARCHIVO_CREDS)) return null;
    return JSON.parse(fs.readFileSync(ARCHIVO_CREDS, 'utf8'));
  } catch (_) { return null; }
}

// ── Leer tokens.json — { refresh_token, access_token, cuenta_email, carpeta_id } ──
function leerTokens() {
  try {
    if (!fs.existsSync(ARCHIVO_TOKENS)) return null;
    return JSON.parse(fs.readFileSync(ARCHIVO_TOKENS, 'utf8'));
  } catch (_) { return null; }
}

// ── Persistir tokens.json ─────────────────────────────────────────────────────
function guardarTokens(datos) {
  asegurarDirConfig();
  fs.writeFileSync(ARCHIVO_TOKENS, JSON.stringify(datos, null, 2), 'utf8');
}

// ── Guardar solo client_id y client_secret (Paso 2 del wizard) ───────────────
// Elimina tokens.json para que estaConfigurado() devuelva false hasta completar OAuth.
function guardarCredencialesParciales(clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('client_id y client_secret son obligatorios');
  asegurarDirConfig();
  fs.writeFileSync(ARCHIVO_CREDS, JSON.stringify({
    client_id:     clientId.trim(),
    client_secret: clientSecret.trim(),
  }, null, 2), 'utf8');

  // Verificar escritura exitosa
  const check = leerCredenciales();
  if (!check?.client_id || !check?.client_secret) {
    throw new Error(`No se pudo escribir en ${ARCHIVO_CREDS}`);
  }
  // Eliminar tokens previos para forzar re-autenticación
  try { if (fs.existsSync(ARCHIVO_TOKENS)) fs.unlinkSync(ARCHIVO_TOKENS); } catch (_) {}
}

// ── Encontrar un puerto disponible de la lista PUERTOS ───────────────────────
async function encontrarPuertoDisponible() {
  for (const puerto of PUERTOS) {
    try {
      await new Promise((resolve, reject) => {
        const servidor = http.createServer();
        servidor.listen(puerto, '127.0.0.1', () => servidor.close(resolve));
        servidor.on('error', reject);
      });
      return puerto;
    } catch (_) {
      continue;
    }
  }
  throw new Error(`No hay puertos disponibles. Verifica que ninguna otra app use los puertos ${PUERTOS.join(', ')}.`);
}

// ── Obtener cliente OAuth2 autenticado para llamadas a la API ─────────────────
// Lee credentials.json + tokens.json. No necesita redirect URI (solo para código inicial).
function obtenerClienteAutenticado() {
  const creds  = leerCredenciales();
  const tokens = leerTokens();
  if (!creds?.client_id || !creds?.client_secret || !tokens?.refresh_token) return null;

  const cliente = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  cliente.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token:  tokens.access_token || null,
  });
  return cliente;
}

// ── Flujo OAuth completo con servidor local (Paso 3 del wizard) ───────────────
// 1. Encuentra un puerto libre
// 2. Levanta servidor HTTP que recibe el redirect de Google
// 3. Abre el navegador con la URL de autorización
// 4. Espera el código, lo intercambia por tokens, guarda tokens.json
async function iniciarFlujoOAuth(clientId, clientSecret) {
  const puerto      = await encontrarPuertoDisponible();
  const redirectUri = `http://127.0.0.1:${puerto}/callback`;

  console.log(`[Drive] Puerto OAuth seleccionado: ${puerto}`);
  console.log(`[Drive] redirect_uri: ${redirectUri}`);

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent', // obligatorio para siempre recibir refresh_token
  });

  return new Promise((resolve, reject) => {
    let servidorCerrado = false;

    function cerrarServidor() {
      if (!servidorCerrado) {
        servidorCerrado = true;
        servidor.close();
      }
    }

    const servidor = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);

      // Ignorar favicon u otras peticiones del navegador
      if (parsedUrl.pathname !== '/callback') {
        res.writeHead(204);
        res.end();
        return;
      }

      const code  = parsedUrl.query.code;
      const error = parsedUrl.query.error;

      // Responder al navegador de inmediato
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

      if (error) {
        res.end(`
          <html><body style="font-family:Arial;text-align:center;padding:50px;background:#1a1a2e;color:white">
            <h2 style="color:#f44336">❌ Acceso denegado</h2>
            <p>Puedes cerrar esta pestaña y volver a la app.</p>
          </body></html>
        `);
        cerrarServidor();
        reject(new Error(`El usuario denegó el acceso: ${error}`));
        return;
      }

      if (!code) {
        // Petición sin código (prefetch del navegador) — ignorar
        res.end('<html><body style="background:#1a1a2e;color:white;font-family:Arial;padding:50px">Procesando...</body></html>');
        return;
      }

      res.end(`
        <html><body style="font-family:Arial;text-align:center;padding:50px;background:#1a1a2e;color:white">
          <h2 style="color:#4caf50">✅ ¡Autorización exitosa!</h2>
          <p>Puedes cerrar esta pestaña y volver a la app.</p>
        </body></html>
      `);

      cerrarServidor();

      try {
        console.log('[Drive] Intercambiando código por tokens...');
        const { tokens } = await oAuth2Client.getToken(code);
        console.log('[Drive] Tokens recibidos — refresh_token:', tokens.refresh_token ? 'OK' : 'AUSENTE');

        if (!tokens.refresh_token) {
          throw new Error('No se recibió refresh_token. Revoca el acceso en myaccount.google.com/permissions y vuelve a autorizar.');
        }

        oAuth2Client.setCredentials(tokens);

        // Esperar a que el cliente procese las credenciales antes de hacer llamadas
        await new Promise(r => setTimeout(r, 500));

        // Obtener email — no bloquea el flujo si falla
        let email = 'cuenta conectada';
        try {
          const oauth2Info  = google.oauth2({ version: 'v2', auth: oAuth2Client });
          const infoUsuario = await oauth2Info.userinfo.get();
          email = infoUsuario.data.email;
          console.log('[Drive] Cuenta autorizada:', email);
        } catch (errEmail) {
          console.log('[Drive] No se pudo obtener el email, continuando:', errEmail.message);
        }

        // Guardar tokens inmediatamente — son válidos independientemente del email
        // carpeta_id se crea en la primera subida si es null
        guardarTokens({
          refresh_token: tokens.refresh_token,
          access_token:  tokens.access_token,
          cuenta_email:  email,
          carpeta_id:    null,
        });
        console.log('[Drive] Tokens guardados exitosamente para:', email);

        resolve({ success: true, email });
      } catch (err) {
        console.error('[Drive] Error al intercambiar código:', err.message);
        reject(err);
      }
    });

    // Levantar servidor PRIMERO, abrir navegador solo cuando esté listo
    servidor.listen(puerto, '127.0.0.1', () => {
      console.log(`[Drive] Servidor OAuth listo — esperando en http://127.0.0.1:${puerto}/callback`);
      shell.openExternal(authUrl).catch(err => {
        cerrarServidor();
        reject(new Error(`No se pudo abrir el navegador: ${err.message}`));
      });
    });

    servidor.on('error', err => {
      const msg = err.code === 'EADDRINUSE'
        ? `Puerto ${puerto} ocupado. La app intentará con el siguiente automáticamente.`
        : `Error en servidor OAuth: ${err.message}`;
      reject(new Error(msg));
    });

    // Timeout de 5 minutos
    setTimeout(() => {
      cerrarServidor();
      reject(new Error('Tiempo de espera agotado (5 minutos). Intenta autorizar de nuevo.'));
    }, 300_000);
  });
}

// ── Obtener o crear la carpeta "PerrosAmericanos_POS" en Drive ────────────────
async function obtenerOCrearCarpeta(drive) {
  const res = await drive.files.list({
    q:      `name='${NOMBRE_CARPETA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files?.length > 0) return res.data.files[0].id;

  const nueva = await drive.files.create({
    requestBody: { name: NOMBRE_CARPETA, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  console.log(`[Drive] Carpeta "${NOMBRE_CARPETA}" creada, id: ${nueva.data.id}`);
  return nueva.data.id;
}

// ── Subir el archivo SQLite a Drive ──────────────────────────────────────────
async function subirDB(rutaLocalDB) {
  const cliente = obtenerClienteAutenticado();
  if (!cliente) throw new Error('No hay cuenta de Google configurada');

  const drive     = google.drive({ version: 'v3', auth: cliente });
  const tokens    = leerTokens();
  const carpetaId = tokens?.carpeta_id || (await obtenerOCrearCarpeta(drive));

  const lista = await drive.files.list({
    q:      `name='${NOMBRE_DB_DRIVE}' and '${carpetaId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  const mediaBody = { mimeType: 'application/octet-stream', body: fs.createReadStream(rutaLocalDB) };

  let fileId;
  if (lista.data.files?.length > 0) {
    const existingId = lista.data.files[0].id;
    await drive.files.update({
      fileId:      existingId,
      requestBody: { name: NOMBRE_DB_DRIVE },
      media:       mediaBody,
      fields:      'id, modifiedTime',
    });
    fileId = existingId;
  } else {
    const nuevo = await drive.files.create({
      requestBody: { name: NOMBRE_DB_DRIVE, parents: [carpetaId] },
      media:       mediaBody,
      fields:      'id',
    });
    fileId = nuevo.data.id;
  }

  console.log(`[Drive] DB subida, fileId: ${fileId}`);
  return fileId;
}

// ── Descargar el archivo SQLite desde Drive ───────────────────────────────────
async function bajarDB(rutaDestino) {
  const cliente = obtenerClienteAutenticado();
  if (!cliente) throw new Error('No hay cuenta de Google configurada');

  const drive     = google.drive({ version: 'v3', auth: cliente });
  const tokens    = leerTokens();
  const carpetaId = tokens?.carpeta_id;
  if (!carpetaId) throw new Error('ID de carpeta no encontrado. Reconecta la cuenta.');

  const lista = await drive.files.list({
    q:      `name='${NOMBRE_DB_DRIVE}' and '${carpetaId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (!lista.data.files?.length) throw new Error('No hay base de datos en Drive para descargar');

  const fileId = lista.data.files[0].id;

  await new Promise((resolve, reject) => {
    drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
      (err, respuesta) => {
        if (err) return reject(err);
        const destStream = fs.createWriteStream(rutaDestino);
        respuesta.data
          .on('error', reject)
          .pipe(destStream)
          .on('finish', resolve)
          .on('error', reject);
      }
    );
  });

  console.log(`[Drive] DB descargada a: ${rutaDestino}`);
}

// ── Subir un backup con nombre personalizado ──────────────────────────────────
async function subirBackup(rutaLocalDB, nombreEnDrive) {
  const cliente = obtenerClienteAutenticado();
  if (!cliente) return;

  const drive     = google.drive({ version: 'v3', auth: cliente });
  const tokens    = leerTokens();
  const carpetaId = tokens?.carpeta_id || (await obtenerOCrearCarpeta(drive));

  await drive.files.create({
    requestBody: { name: nombreEnDrive, parents: [carpetaId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(rutaLocalDB) },
    fields: 'id',
  });
  console.log(`[Drive] Backup "${nombreEnDrive}" subido`);
}

// ── Obtener metadatos del archivo DB en Drive (modifiedTime) ──────────────────
async function obtenerMetadatosDB() {
  const cliente = obtenerClienteAutenticado();
  if (!cliente) return null;

  const drive     = google.drive({ version: 'v3', auth: cliente });
  const tokens    = leerTokens();
  const carpetaId = tokens?.carpeta_id;
  if (!carpetaId) return null;

  const lista = await drive.files.list({
    q:      `name='${NOMBRE_DB_DRIVE}' and '${carpetaId}' in parents and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    spaces: 'drive',
  });

  return lista.data.files?.length ? lista.data.files[0] : null;
}

// ── Información de la cuenta: email + cuota de Drive ─────────────────────────
async function obtenerInfoCuenta() {
  const cliente = obtenerClienteAutenticado();
  if (!cliente) return null;

  try {
    const [usuarioRes, aboutRes] = await Promise.all([
      google.oauth2({ version: 'v2', auth: cliente }).userinfo.get(),
      google.drive({ version: 'v3', auth: cliente }).about.get({ fields: 'storageQuota' }),
    ]);
    const quota = aboutRes.data.storageQuota || {};
    return {
      email:        usuarioRes.data.email,
      espacioUsado: parseInt(quota.usage        || '0'),
      espacioTotal: parseInt(quota.limit        || '0'),
      espacioDrive: parseInt(quota.usageInDrive || '0'),
    };
  } catch (_) { return null; }
}

// ── Verificar si la cuenta está configurada (credentials.json + tokens.json) ──
function estaConfigurado() {
  const creds  = leerCredenciales();
  const tokens = leerTokens();
  return !!(creds?.client_id && creds?.client_secret && tokens?.refresh_token);
}

// ── Leer email de la cuenta desde tokens.json ─────────────────────────────────
function leerCuentaEmail() {
  return leerTokens()?.cuenta_email || null;
}

module.exports = {
  iniciarFlujoOAuth,
  subirDB,
  bajarDB,
  subirBackup,
  obtenerMetadatosDB,
  obtenerInfoCuenta,
  estaConfigurado,
  leerCredenciales,
  leerTokens,
  leerCuentaEmail,
  guardarCredencialesParciales,
  ARCHIVO_CREDS,
  ARCHIVO_TOKENS,
  DIR_CONFIG,
  PUERTOS,
};

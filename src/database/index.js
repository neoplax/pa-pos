// Conexión singleton a SQLite con better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDB() {
  if (db) return db;

  // Guardar en userData para que persista entre versiones
  const dbPath = path.join(app.getPath('userData'), 'perros_americanos.db');
  console.log('[DB] Conectando a:', dbPath);

  db = new Database(dbPath);

  // Optimizaciones de rendimiento
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -16000'); // 16MB caché

  return db;
}

// Cerrar la conexión para que el sync pueda reemplazar el archivo en disco
function closeDB() {
  if (db) { db.close(); db = null; }
}

module.exports = { getDB, closeDB };

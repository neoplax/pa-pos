// Migraciones - crea todas las tablas si no existen
function runMigrations(db) {
  console.log('[DB] Ejecutando migraciones...');

  db.exec(`
    -- Tabla de productos del menú
    CREATE TABLE IF NOT EXISTS productos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT    NOT NULL,
      precio      INTEGER NOT NULL,
      categoria   TEXT    NOT NULL DEFAULT 'principal', -- principal, combo, adicion
      activo      INTEGER NOT NULL DEFAULT 1,
      codigo      TEXT    NOT NULL DEFAULT '',
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Tabla de ingredientes e insumos
    CREATE TABLE IF NOT EXISTS ingredientes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre           TEXT    NOT NULL,
      stock_actual     REAL    NOT NULL DEFAULT 0,
      stock_minimo     REAL    NOT NULL DEFAULT 0,
      unidad           TEXT    NOT NULL DEFAULT 'unidad',
      es_perecedero    INTEGER NOT NULL DEFAULT 0,
      duracion_dias    INTEGER,           -- días de vida útil si es perecedero
      fecha_preparacion TEXT,             -- última vez que se preparó (batch)
      categoria        TEXT    NOT NULL DEFAULT 'otro', -- carne, pan, lacteo, vegetal, bebida, salsa, topping, preparado, otro
      unidades_por_paquete INTEGER,                    -- solo si unidad='paquete'
      activo           INTEGER NOT NULL DEFAULT 1
    );

    -- Recetas: qué ingredientes usa cada producto
    CREATE TABLE IF NOT EXISTS recetas (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id    INTEGER NOT NULL REFERENCES productos(id),
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad       REAL    NOT NULL
    );

    -- Ventas (cabecera)
    CREATE TABLE IF NOT EXISTS ventas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      empleado    TEXT    NOT NULL,
      total       INTEGER NOT NULL,
      metodo_pago TEXT    NOT NULL DEFAULT 'efectivo', -- efectivo, nequi, mixto
      monto_efectivo_mixto INTEGER NOT NULL DEFAULT 0,
      monto_nequi_mixto    INTEGER NOT NULL DEFAULT 0,
      domicilio   INTEGER NOT NULL DEFAULT 0,
      factura_num INTEGER NOT NULL DEFAULT 0,
      efectivo_recibido INTEGER NOT NULL DEFAULT 0
    );

    -- Configuración del sistema
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT ''
    );

    -- Detalle de cada venta
    CREATE TABLE IF NOT EXISTS detalle_ventas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id        INTEGER NOT NULL REFERENCES ventas(id),
      producto_id     INTEGER NOT NULL REFERENCES productos(id),
      cantidad        INTEGER NOT NULL DEFAULT 1,
      precio_unitario INTEGER NOT NULL
    );

    -- Registro de preparaciones batch (ensalada, pico de gallo, etc.)
    CREATE TABLE IF NOT EXISTS preparaciones_batch (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_nombre      TEXT    NOT NULL,  -- nombre del batch preparado
      ingrediente_id   INTEGER REFERENCES ingredientes(id), -- ingrediente resultante
      fecha_preparacion TEXT   NOT NULL DEFAULT (datetime('now','localtime')),
      fecha_vencimiento TEXT   NOT NULL,
      cantidad         REAL    NOT NULL DEFAULT 1,
      empleado         TEXT    NOT NULL DEFAULT ''
    );

    -- Tipos de preparaciones batch con sus ingredientes
    CREATE TABLE IF NOT EXISTS batch_tipos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre       TEXT NOT NULL,
      duracion_dias INTEGER NOT NULL,
      descripcion  TEXT,
      ingrediente_resultado_id INTEGER REFERENCES ingredientes(id)
    );

    -- Ingredientes que usa cada batch
    CREATE TABLE IF NOT EXISTS batch_recetas (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_tipo_id  INTEGER NOT NULL REFERENCES batch_tipos(id),
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad       REAL    NOT NULL,
      unidad_info    TEXT    -- descripción de la cantidad
    );

    -- Cierre de caja diario
    CREATE TABLE IF NOT EXISTS caja (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha         TEXT    NOT NULL,
      efectivo      INTEGER NOT NULL DEFAULT 0,
      nequi         INTEGER NOT NULL DEFAULT 0,
      total_ventas  INTEGER NOT NULL DEFAULT 0,
      gastos        INTEGER NOT NULL DEFAULT 0,
      utilidad      INTEGER NOT NULL DEFAULT 0,
      empleado      TEXT    NOT NULL DEFAULT '',
      notas         TEXT    DEFAULT '',
      cerrada       INTEGER NOT NULL DEFAULT 0,
      creado_en     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Proveedores
    CREATE TABLE IF NOT EXISTS proveedores (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre           TEXT NOT NULL,
      contacto_nombre  TEXT DEFAULT '',
      telefono         TEXT DEFAULT '',
      ingredientes     TEXT DEFAULT '[]',   -- JSON array de ingrediente IDs
      horario_entrega  TEXT DEFAULT '',
      dias_pedido      TEXT DEFAULT '',
      minimo_pedido    TEXT DEFAULT '',
      forma_pago       TEXT DEFAULT '',
      tiempo_entrega   TEXT DEFAULT '',
      notas            TEXT DEFAULT '',
      activo           INTEGER NOT NULL DEFAULT 1,
      creado_en        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Empleados con PIN encriptado
    CREATE TABLE IF NOT EXISTS empleados (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT NOT NULL UNIQUE,
      pin_hash  TEXT NOT NULL,
      activo    INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Bajas de inventario
    CREATE TABLE IF NOT EXISTS bajas (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha              TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ingrediente_id     INTEGER REFERENCES ingredientes(id),
      ingrediente_nombre TEXT NOT NULL,
      cantidad           REAL NOT NULL,
      motivo             TEXT NOT NULL DEFAULT 'otro',
      empleado           TEXT NOT NULL DEFAULT '',
      notas              TEXT DEFAULT ''
    );

    -- Gastos generales del negocio
    CREATE TABLE IF NOT EXISTS gastos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      descripcion     TEXT NOT NULL,
      monto           INTEGER NOT NULL,
      categoria       TEXT NOT NULL DEFAULT 'otro',
      metodo_pago     TEXT NOT NULL DEFAULT 'efectivo',
      empleado        TEXT NOT NULL DEFAULT '',
      notas           TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_bajas_fecha  ON bajas(fecha);
    CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);

    -- Historial de compras de ingredientes
    CREATE TABLE IF NOT EXISTS compras (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha               TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      ingrediente_id      INTEGER REFERENCES ingredientes(id),
      ingrediente_nombre  TEXT    NOT NULL,
      cantidad            REAL    NOT NULL,
      precio_pagado       INTEGER NOT NULL DEFAULT 0,
      proveedor           TEXT    DEFAULT '',
      empleado            TEXT    DEFAULT ''
    );

    -- Índices para consultas frecuentes
    CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
    CREATE INDEX IF NOT EXISTS idx_detalle_venta_id ON detalle_ventas(venta_id);
    CREATE INDEX IF NOT EXISTS idx_recetas_producto ON recetas(producto_id);
  `);

  // Proveedores y desechables para DBs existentes
  db.exec(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre           TEXT NOT NULL,
      contacto_nombre  TEXT DEFAULT '',
      telefono         TEXT DEFAULT '',
      ingredientes     TEXT DEFAULT '[]',
      horario_entrega  TEXT DEFAULT '',
      dias_pedido      TEXT DEFAULT '',
      minimo_pedido    TEXT DEFAULT '',
      forma_pago       TEXT DEFAULT '',
      tiempo_entrega   TEXT DEFAULT '',
      notas            TEXT DEFAULT '',
      activo           INTEGER NOT NULL DEFAULT 1,
      creado_en        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Tabla compras para DBs existentes (ignora si ya existe)
  db.exec(`
    CREATE TABLE IF NOT EXISTS compras (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha               TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      ingrediente_id      INTEGER REFERENCES ingredientes(id),
      ingrediente_nombre  TEXT    NOT NULL,
      cantidad            REAL    NOT NULL,
      precio_pagado       INTEGER NOT NULL DEFAULT 0,
      proveedor           TEXT    DEFAULT '',
      empleado            TEXT    DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
  `);

  // Tabla configuracion para DBs existentes
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT ''
    );
  `);

  // Columnas para DBs existentes
  try { db.exec('ALTER TABLE ventas ADD COLUMN monto_efectivo_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN monto_nequi_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ingredientes ADD COLUMN unidades_por_paquete INTEGER'); } catch(_) {}
  try { db.exec('ALTER TABLE productos ADD COLUMN codigo TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN domicilio INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN factura_num INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN efectivo_recibido INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ingredientes ADD COLUMN costo_unitario REAL NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE caja ADD COLUMN descuadre INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE caja ADD COLUMN observacion_descuadre TEXT DEFAULT ""'); } catch(_) {}

  // Columnas para gastos unificado (parte 2)
  try { db.exec('ALTER TABLE gastos ADD COLUMN numero_comprobante TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE gastos ADD COLUMN proveedor_id INTEGER DEFAULT NULL'); } catch(_) {}
  try { db.exec('ALTER TABLE gastos ADD COLUMN es_recurrente INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE gastos ADD COLUMN frecuencia_recurrente TEXT NOT NULL DEFAULT ""'); } catch(_) {}

  // Método de pago en compras (para saldo disponible)
  try { db.exec('ALTER TABLE compras ADD COLUMN metodo_pago TEXT NOT NULL DEFAULT "efectivo"'); } catch(_) {}

  // Notas de unidad en ingredientes (ej. "Paquete de 32 tiras = $15.000")
  try { db.exec('ALTER TABLE ingredientes ADD COLUMN notas_unidad TEXT NOT NULL DEFAULT ""'); } catch(_) {}

  // Pago mixto en gastos y compras
  try { db.exec('ALTER TABLE gastos ADD COLUMN monto_efectivo_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE gastos ADD COLUMN monto_nequi_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE compras ADD COLUMN monto_efectivo_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE compras ADD COLUMN monto_nequi_mixto INTEGER NOT NULL DEFAULT 0'); } catch(_) {}

  // Columnas para roles y datos adicionales de empleados (parte 6)
  try { db.exec('ALTER TABLE empleados ADD COLUMN rol TEXT NOT NULL DEFAULT "empleado"'); } catch(_) {}
  try { db.exec('ALTER TABLE empleados ADD COLUMN fecha_ingreso TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE empleados ADD COLUMN notas TEXT NOT NULL DEFAULT ""'); } catch(_) {}

  // ── PARTE 7: Descuentos, Mesas y Domicilios externos ─────────────────────────

  // Tabla de descuentos configurables
  db.exec(`
    CREATE TABLE IF NOT EXISTS descuentos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre       TEXT    NOT NULL,
      tipo         TEXT    NOT NULL DEFAULT 'porcentaje', -- porcentaje | fijo | gratis
      valor        REAL    NOT NULL DEFAULT 0,            -- % si porcentaje, $ si fijo
      descripcion  TEXT    NOT NULL DEFAULT '',
      activo       INTEGER NOT NULL DEFAULT 1,
      fecha_inicio TEXT    DEFAULT NULL,
      fecha_fin    TEXT    DEFAULT NULL,
      aplica_a     TEXT    NOT NULL DEFAULT 'total',      -- total | producto
      dias_semana  TEXT    NOT NULL DEFAULT '',           -- JSON [0..6], 0=domingo; vacío=todos
      hora_inicio  TEXT    NOT NULL DEFAULT '',           -- HH:MM; vacío=sin restricción
      hora_fin     TEXT    NOT NULL DEFAULT '',
      creado_en    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Tabla de mesas / cuentas simultáneas
  db.exec(`
    CREATE TABLE IF NOT EXISTS mesas (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER NOT NULL,
      nombre TEXT    NOT NULL DEFAULT '',
      activo INTEGER NOT NULL DEFAULT 1
    );

    -- Pedidos en curso (carrito persistente por mesa)
    CREATE TABLE IF NOT EXISTS pedidos_pendientes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa_id         INTEGER NOT NULL DEFAULT 0,  -- 0 = para llevar
      mesa_nombre     TEXT    NOT NULL DEFAULT '',
      empleado        TEXT    NOT NULL DEFAULT '',
      items           TEXT    NOT NULL DEFAULT '[]', -- JSON
      actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Índice para consulta rápida por mesa
    CREATE INDEX IF NOT EXISTS idx_pedidos_mesa ON pedidos_pendientes(mesa_id);
  `);

  // Columnas nuevas en ventas para los tres módulos
  try { db.exec('ALTER TABLE ventas ADD COLUMN descuento_id INTEGER DEFAULT NULL'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN descuento_valor INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN descuento_nombre TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN mesa_id INTEGER DEFAULT NULL'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN mesa_nombre TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN plataforma_domicilio TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN numero_orden_domicilio TEXT NOT NULL DEFAULT ""'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN comision_domicilio_pct REAL NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE ventas ADD COLUMN comision_domicilio_valor INTEGER NOT NULL DEFAULT 0'); } catch(_) {}

  // Insertar 8 mesas por defecto si la tabla está vacía
  const mesasExistentes = db.prepare('SELECT COUNT(*) as n FROM mesas').get();
  if (mesasExistentes.n === 0) {
    const ins = db.prepare('INSERT INTO mesas (numero, nombre) VALUES (?, ?)');
    for (let i = 1; i <= 8; i++) {
      ins.run(i, `Mesa ${i}`);
    }
  }

  // Insertar descuentos iniciales si la tabla está vacía
  const descExistentes = db.prepare('SELECT COUNT(*) as n FROM descuentos').get();
  if (descExistentes.n === 0) {
    db.prepare(`
      INSERT INTO descuentos (nombre, tipo, valor, descripcion, activo, dias_semana, hora_inicio, hora_fin)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run('Promo Seguidor', 'porcentaje', 10, '10% de descuento para seguidores en redes', '', '', '');

    db.prepare(`
      INSERT INTO descuentos (nombre, tipo, valor, descripcion, activo, dias_semana, hora_inicio, hora_fin)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run('Estudiante 12-14h', 'porcentaje', 15,
      '15% de descuento para estudiantes entre semana al mediodía',
      JSON.stringify([1,2,3,4,5]), '12:00', '14:00');

    db.prepare(`
      INSERT INTO descuentos (nombre, tipo, valor, descripcion, activo, dias_semana, hora_inicio, hora_fin)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run('Combo Especial', 'fijo', 1000, 'Descuento fijo de $1.000', '', '', '');
  }

  // Columnas adicionales ingredientes (parte 3)
  try { db.exec('ALTER TABLE ingredientes ADD COLUMN proveedor_id INTEGER DEFAULT NULL'); } catch(_) {}

  // Nota en detalle_ventas (gaseosa elegida en combos)
  try { db.exec("ALTER TABLE detalle_ventas ADD COLUMN nota TEXT NOT NULL DEFAULT ''"); } catch(_) {}

  // Tablas nuevas para DBs existentes
  db.exec(`
    CREATE TABLE IF NOT EXISTS empleados (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT NOT NULL UNIQUE,
      pin_hash  TEXT NOT NULL,
      activo    INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS bajas (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha              TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ingrediente_id     INTEGER REFERENCES ingredientes(id),
      ingrediente_nombre TEXT NOT NULL,
      cantidad           REAL NOT NULL,
      motivo             TEXT NOT NULL DEFAULT 'otro',
      empleado           TEXT NOT NULL DEFAULT '',
      notas              TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS gastos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      descripcion     TEXT NOT NULL,
      monto           INTEGER NOT NULL,
      categoria       TEXT NOT NULL DEFAULT 'otro',
      metodo_pago     TEXT NOT NULL DEFAULT 'efectivo',
      empleado        TEXT NOT NULL DEFAULT '',
      notas           TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_bajas_fecha  ON bajas(fecha);
    CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
  `);

  // ── BASE DE CAJA: saldo inicial al abrir el turno ────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS base_caja (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha          TEXT    NOT NULL UNIQUE,
      empleado       TEXT    NOT NULL DEFAULT '',
      efectivo_base  INTEGER NOT NULL DEFAULT 0,
      nequi_base     INTEGER NOT NULL DEFAULT 0,
      registrado_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_base_caja_fecha ON base_caja(fecha);
  `);

  console.log('[DB] Migraciones completadas.');
}

module.exports = { runMigrations };

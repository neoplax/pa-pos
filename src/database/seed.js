const crypto = require('crypto');
const { PIN_SECRET } = require('./constants');

function hashPin(pin) {
  return crypto.createHmac('sha256', PIN_SECRET).update(String(pin)).digest('hex');
}

// Datos iniciales del negocio - solo inserta si la BD está vacía
function seedDatabase(db) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM productos').get();
  if (count > 0) return; // Ya tiene datos, no re-semillar

  console.log('[DB] Insertando datos iniciales...');

  // ── PRODUCTOS DEL MENÚ ────────────────────────────────────────────────────
  const insertProducto = db.prepare(
    'INSERT INTO productos (nombre, precio, categoria) VALUES (?, ?, ?)'
  );

  const productos = [
    // Principales
    ['Perro Americano',           8000,  'principal'],
    ['Choripán',                  9000,  'principal'],
    ['Salchipapa Americana',     12000,  'principal'],
    ['Hamburguesa Artesanal',    10000,  'principal'],
    // Combos
    ['Combo Perro + Gaseosa',   10000,  'combo'],
    ['Combo Choripán + Gaseosa',11000,  'combo'],
    ['Combo Salchipapa + Gaseosa',14000,'combo'],
    ['Combo Hamburguesa',        16000,  'combo'],
    // Adiciones
    ['Adición: Tocineta',        2500,  'adicion'],
    ['Adición: Queso',           2500,  'adicion'],
    ['Adición: Carne',           4000,  'adicion'],
    ['Adición: Porción Papas',   5000,  'adicion'],
    ['Adición: Chorizo',         4500,  'adicion'],
    ['Adición: Salchicha',       4500,  'adicion'],
  ];

  const idsProductos = {};
  for (const [nombre, precio, categoria] of productos) {
    const r = insertProducto.run(nombre, precio, categoria);
    idsProductos[nombre] = r.lastInsertRowid;
  }

  // ── INGREDIENTES ──────────────────────────────────────────────────────────
  // (nombre, stock_actual, stock_minimo, unidad, es_perecedero, duracion_dias, categoria)
  const insertIng = db.prepare(`
    INSERT INTO ingredientes (nombre, stock_actual, stock_minimo, unidad, es_perecedero, duracion_dias, categoria)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const ingredientesData = [
    // Carnes
    ['Salchicha',         5,    10,   'unidad',   0, null, 'carne'],
    ['Chorizo',          14,     8,   'unidad',   0, null, 'carne'],
    ['Carne hamburguesa',18,     5,   'unidad',   0, null, 'carne'],
    ['Tocineta',          1.5,   1,   'paquete',  0, null, 'carne'],
    // Panes
    ['Pan perro',         4,     8,   'unidad',   0, null, 'pan'],
    ['Pan hamburguesa',   3,     8,   'unidad',   0, null, 'pan'],
    // Lácteos
    ['Queso tajado',     20,    10,   'tajada',   0, null, 'lacteo'],
    ['Queso costeño',   453.6, 200,   'gramo',    0, null, 'lacteo'],
    // Vegetales
    ['Repollo',           1,     1,   'unidad',   0, null, 'vegetal'],
    ['Cebolla',           5,     3,   'unidad',   0, null, 'vegetal'],
    ['Zanahoria',         2,     2,   'unidad',   0, null, 'vegetal'],
    ['Lechuga',           2,     1,   'unidad',   0, null, 'vegetal'],
    ['Piña',              2.75,  1,   'unidad',   0, null, 'vegetal'],
    ['Tomate',            3,     2,   'unidad',   0, null, 'vegetal'],
    ['Cilantro',          0,     1,   'atado',    0, null, 'vegetal'],  // FALTA
    ['Limón',             1,     3,   'unidad',   0, null, 'vegetal'],
    // Bebidas
    ['Gaseosa pequeña',  41,    12,   'unidad',   0, null, 'bebida'],
    // Toppings (autoservicio)
    ['Maicitos',          0.5,   1,   'lata',     0, null, 'topping'],
    ['Jalapeños',         1,     1,   'frasco',   0, null, 'topping'],
    ['Pepinillos',        1,     1,   'frasco',   0, null, 'topping'],
    ['Papas migaja',   1000,   500,   'gramo',    0, null, 'topping'],
    // Salsas
    ['Mayonesa',          0,     1,   'frasco',   0, null, 'salsa'],  // FALTA
    ['Salsa de tomate',   0,     1,   'frasco',   0, null, 'salsa'],  // FALTA
    ['Salsa de piña',     1,   0.5,   'frasco',   0, null, 'salsa'],
    ['Salsa tártara',     0.5, 0.5,   'frasco',   0, null, 'salsa'],
    ['Salsa BBQ',         0.5, 0.5,   'frasco',   0, null, 'salsa'],
    ['Salsa rosada',      0.5, 0.5,   'frasco',   0, null, 'salsa'],
    ['Mayo-mostaza',      0.25,0.5,   'frasco',   0, null, 'salsa'],
    ['Mostaza',           0.5, 0.5,   'frasco',   0, null, 'salsa'],
    // Otros insumos
    ['Papas fritas',   1000,   500,   'gramo',    0, null, 'otro'],
    ['Azúcar blanca',   226.8, 200,   'gramo',    0, null, 'otro'],
    ['Azúcar morena',     0,   200,   'gramo',    0, null, 'otro'],   // FALTA
    ['Vinagre',           0,     1,   'frasco',   0, null, 'otro'],   // FALTA
    ['Pimienta',          0,    50,   'gramo',    0, null, 'otro'],   // FALTA
    // Preparados perecederos (resultado de batch)
    ['Ensalada preparada',   0, 0, 'tarro', 1, 4, 'preparado'],
    ['Pico de gallo',        0, 0, 'tarro', 1, 3, 'preparado'],
    ['Cebolla grillé',       0, 0, 'tarro', 1, 4, 'preparado'],
  ];

  const idsIng = {};
  for (const row of ingredientesData) {
    const r = insertIng.run(...row);
    idsIng[row[0]] = r.lastInsertRowid;
  }

  // ── RECETAS ───────────────────────────────────────────────────────────────
  const insertReceta = db.prepare(
    'INSERT INTO recetas (producto_id, ingrediente_id, cantidad) VALUES (?, ?, ?)'
  );

  const recetas = {
    'Perro Americano': [
      [idsIng['Pan perro'],         1],
      [idsIng['Salchicha'],         1],
    ],
    'Choripán': [
      [idsIng['Pan perro'],         1],
      [idsIng['Chorizo'],           1],
    ],
    'Salchipapa Americana': [
      [idsIng['Salchicha'],         1],
      [idsIng['Tocineta'],          0.5],
      [idsIng['Queso tajado'],      1],
      [idsIng['Papas fritas'],    200],
    ],
    'Hamburguesa Artesanal': [
      [idsIng['Pan hamburguesa'],   1],
      [idsIng['Carne hamburguesa'], 1],
      [idsIng['Queso tajado'],      1],
      [idsIng['Tomate'],            0.25],
      [idsIng['Lechuga'],           0.25],
      [idsIng['Cebolla'],           0.25],
    ],
    'Combo Perro + Gaseosa': [
      [idsIng['Pan perro'],         1],
      [idsIng['Salchicha'],         1],
      [idsIng['Gaseosa pequeña'],   1],
    ],
    'Combo Choripán + Gaseosa': [
      [idsIng['Pan perro'],         1],
      [idsIng['Chorizo'],           1],
      [idsIng['Gaseosa pequeña'],   1],
    ],
    'Combo Salchipapa + Gaseosa': [
      [idsIng['Salchicha'],         1],
      [idsIng['Tocineta'],          0.5],
      [idsIng['Queso tajado'],      1],
      [idsIng['Papas fritas'],    200],
      [idsIng['Gaseosa pequeña'],   1],
    ],
    'Combo Hamburguesa': [
      [idsIng['Pan hamburguesa'],   1],
      [idsIng['Carne hamburguesa'], 1],
      [idsIng['Queso tajado'],      1],
      [idsIng['Tomate'],            0.25],
      [idsIng['Lechuga'],           0.25],
      [idsIng['Cebolla'],           0.25],
      [idsIng['Gaseosa pequeña'],   1],
    ],
    'Adición: Tocineta':       [[idsIng['Tocineta'],          0.25]],
    'Adición: Queso':          [[idsIng['Queso tajado'],      1]],
    'Adición: Carne':          [[idsIng['Carne hamburguesa'], 1]],
    'Adición: Porción Papas':  [[idsIng['Papas fritas'],    200]],
    'Adición: Chorizo':        [[idsIng['Chorizo'],           1]],
    'Adición: Salchicha':      [[idsIng['Salchicha'],         1]],
  };

  for (const [nombreProd, ingredientes] of Object.entries(recetas)) {
    const prodId = idsProductos[nombreProd];
    if (!prodId) continue;
    for (const [ingId, cantidad] of ingredientes) {
      insertReceta.run(prodId, ingId, cantidad);
    }
  }

  // ── BATCH TIPOS ───────────────────────────────────────────────────────────
  const insertBatch = db.prepare(
    'INSERT INTO batch_tipos (nombre, duracion_dias, descripcion, ingrediente_resultado_id) VALUES (?, ?, ?, ?)'
  );
  const insertBatchRec = db.prepare(
    'INSERT INTO batch_recetas (batch_tipo_id, ingrediente_id, cantidad, unidad_info) VALUES (?, ?, ?, ?)'
  );

  const batchTipos = [
    {
      nombre: 'Ensalada',
      duracion: 4,
      desc: 'Repollo, cebolla, zanahoria con pimienta y azúcar',
      resultado: idsIng['Ensalada preparada'],
      receta: [
        [idsIng['Repollo'],       1,     '1 repollo'],
        [idsIng['Cebolla'],       2,     '2 cebollas'],
        [idsIng['Zanahoria'],     2,     '2 zanahorias'],
        [idsIng['Pimienta'],      5,     '5g pimienta'],
        [idsIng['Azúcar blanca'], 113.4, '0.25lb azúcar'],
      ],
    },
    {
      nombre: 'Pico de gallo',
      duracion: 3,
      desc: 'Cebolla, tomate, cilantro, limón y vinagre',
      resultado: idsIng['Pico de gallo'],
      receta: [
        [idsIng['Cebolla'],  1,   '1 cebolla'],
        [idsIng['Tomate'],   0.5, '½ tomate'],
        [idsIng['Cilantro'], 0.25,'¼ atado cilantro'],
        [idsIng['Limón'],    0.5, '½ limón'],
        [idsIng['Vinagre'],  0.1, 'Chorrito vinagre'],
      ],
    },
    {
      nombre: 'Cebolla grillé',
      duracion: 4,
      desc: 'Cebolla caramelizada con azúcar morena y vinagre',
      resultado: idsIng['Cebolla grillé'],
      receta: [
        [idsIng['Cebolla'],       2,   '2 cebollas'],
        [idsIng['Azúcar morena'], 100, '100g azúcar morena'],
        [idsIng['Vinagre'],       0.1, 'Chorrito vinagre'],
      ],
    },
  ];

  for (const batch of batchTipos) {
    const r = insertBatch.run(batch.nombre, batch.duracion, batch.desc, batch.resultado);
    const batchId = r.lastInsertRowid;
    for (const [ingId, cantidad, info] of batch.receta) {
      insertBatchRec.run(batchId, ingId, cantidad, info);
    }
  }

  console.log('[DB] Datos iniciales insertados correctamente.');
}

// Agrega bebidas vendibles si no existen (para DBs ya existentes)
function patchBebidas(db) {
  const existeProd = db.prepare('SELECT id FROM productos WHERE nombre = ?');
  const insertProd = db.prepare('INSERT INTO productos (nombre, precio, categoria) VALUES (?, ?, ?)');
  const existeIng  = db.prepare('SELECT id FROM ingredientes WHERE nombre = ?');
  const insertIng  = db.prepare(`
    INSERT INTO ingredientes (nombre, stock_actual, stock_minimo, unidad, es_perecedero, duracion_dias, categoria)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRec  = db.prepare('INSERT INTO recetas (producto_id, ingrediente_id, cantidad) VALUES (?, ?, ?)');

  const bebidas = [
    // [nombre, precio, stock_minimo]
    ['Coca-Cola 250ml',   2500, 12],
    ['Coca-Cola 400ml',   3000, 12],
    ['Cola y Pola',       3500,  6],
    ['Poker',             4500,  6],
    ['Águila',            4500,  6],
    ['Club Dorada',       4500,  6],
    ['Colombianita',      2500,  6],
    ['Pepsi chiquita',    2500,  6],
    ['Coronita',          5000,  6],
    ['Bretaña',           2500,  6],
    ['Pony Malta',        3000,  6],
    ['Qatro',             2500,  6],
    ['Agua con gas',      2000,  6],
    ['Agua sin gas',      2000,  6],
  ];

  for (const [nombre, precio, stockMin] of bebidas) {
    // Ingrediente
    let ingId;
    const ingExist = existeIng.get(nombre);
    if (ingExist) {
      ingId = ingExist.id;
    } else {
      ingId = insertIng.run(nombre, 0, stockMin, 'unidad', 0, null, 'bebida').lastInsertRowid;
    }

    // Producto
    if (!existeProd.get(nombre)) {
      const prodId = insertProd.run(nombre, precio, 'bebida').lastInsertRowid;
      insertRec.run(prodId, ingId, 1);
    }
  }
}

// Agrega insumos desechables si no existen
function patchDesechables(db) {
  const existe = db.prepare('SELECT id FROM ingredientes WHERE nombre = ?');
  const insert = db.prepare(`
    INSERT INTO ingredientes (nombre, stock_actual, stock_minimo, unidad, es_perecedero, duracion_dias, categoria)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const desechables = [
    ['K1',                    1, 1, 'unidad', 0, null, 'desechable'],
    ['Empaque perros',        5, 5, 'paquete', 0, null, 'desechable'],
    ['Empaque hamburguesa',   3, 3, 'paquete', 0, null, 'desechable'],
    ['Papel parafinado',      2, 2, 'rollo',   0, null, 'desechable'],
    ['Servilletas',           2, 2, 'paquete', 0, null, 'desechable'],
    ['Bolsas',                3, 3, 'paquete', 0, null, 'desechable'],
    ['Vasos plásticos',       2, 2, 'paquete', 0, null, 'desechable'],
    ['Palillos',              2, 2, 'caja',    0, null, 'desechable'],
  ];
  for (const row of desechables) {
    if (!existe.get(row[0])) insert.run(...row);
  }
}

// Agrega proveedores con sus ingredientes asignados si no existen
function patchProveedores(db) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM proveedores').get();
  if (count > 0) return;

  const getId = (nombre) => db.prepare('SELECT id FROM ingredientes WHERE nombre=?').get(nombre)?.id;
  const ids   = (...nombres) => JSON.stringify(nombres.map(getId).filter(Boolean));

  const insert = db.prepare(`
    INSERT INTO proveedores (nombre, contacto_nombre, telefono, ingredientes, notas)
    VALUES (?, ?, ?, ?, ?)
  `);

  insert.run('El Coleo', 'Don Luis Jiménez', '3104009492',
    ids('Tocineta','Chorizo','Salchicha','Carne hamburguesa','Maicitos'),
    'Pedido esta noche');

  insert.run('Santa Elena Salsamentaria', '', '3203319372',
    ids('Queso costeño','Queso tajado','Vinagre'), '');

  insert.run('Bodega Frozen', '', '3013072002',
    ids('Papas fritas','Mayonesa','Salsa de tomate','Salsa tártara',
        'Salsa BBQ','Salsa rosada','Mayo-mostaza','Mostaza','Salsa de piña'), '');

  insert.run('Artesanal (Principal)', '', '3224017512',
    ids('Pan perro','Pan hamburguesa'), 'Pedido esta tarde');

  insert.run('Artesanal Carro (Auxiliar)', '', '3228326220',
    ids('Pan perro','Pan hamburguesa'), '');

  insert.run('Coca-Cola', 'Xiomara', '3133301682',
    ids('Coca-Cola 250ml','Coca-Cola 400ml'), '');

  insert.run('Postobón', 'Jhon', '3138822120',
    ids('Colombianita','Pepsi chiquita','Bretaña','Qatro'), '');

  insert.run('Depósito García', '', '3107697406',
    ids('Poker','Águila','Club Dorada','Coronita','Cola y Pola','Pony Malta'), '');

  insert.run('Don Rodrigo', '', '3003962500',
    ids('Papas migaja'), '');

  insert.run('Jeison Desechables', '', '3233067403',
    ids('K1','Empaque perros','Empaque hamburguesa','Papel parafinado',
        'Servilletas','Bolsas','Vasos plásticos','Palillos'), '');
}

// Insertar empleados con PIN encriptado si la tabla está vacía
function patchEmpleados(db) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM empleados').get();
  if (count > 0) return;
  const ins = db.prepare('INSERT INTO empleados (nombre, pin_hash) VALUES (?, ?)');
  ins.run('Juan',  hashPin('9985'));
  ins.run('Sofía', hashPin('5808'));
}

// Correcciones de productos y precios
function patchCorrecciones(db) {
  // Desactivar Jugos del Valle si existe
  db.prepare("UPDATE productos SET activo=0 WHERE nombre='Jugos del Valle'").run();

  // Unificar Agua Natural → Agua sin gas (defensivo: solo si existe Agua Natural y no hay conflicto)
  const aguaNat = db.prepare("SELECT id FROM ingredientes WHERE nombre='Agua Natural'").get();
  const aguaSin = db.prepare("SELECT id FROM ingredientes WHERE nombre='Agua sin gas'").get();
  if (aguaNat && !aguaSin) {
    db.prepare("UPDATE ingredientes SET nombre='Agua sin gas' WHERE id=?").run(aguaNat.id);
    db.prepare("UPDATE productos SET nombre='Agua sin gas' WHERE nombre='Agua Natural'").run();
  } else if (aguaNat && aguaSin) {
    // Fusionar: redirigir recetas y compras al id existente, desactivar el duplicado
    db.prepare('UPDATE recetas SET ingrediente_id=? WHERE ingrediente_id=?').run(aguaSin.id, aguaNat.id);
    db.prepare("UPDATE ingredientes SET activo=0 WHERE id=?").run(aguaNat.id);
    db.prepare("UPDATE productos SET activo=0 WHERE nombre='Agua Natural'").run();
  }

  // Renombrar Gaseosa 400ml si existe
  db.prepare("UPDATE ingredientes SET nombre='Coca-Cola 400ml' WHERE nombre='Gaseosa 400ml'").run();
  db.prepare("UPDATE productos SET nombre='Coca-Cola 400ml' WHERE nombre='Gaseosa 400ml'").run();

  // Asegurar precio correcto Adición Tocineta
  db.prepare("UPDATE productos SET precio=2500 WHERE nombre='Adición: Tocineta'").run();

  // Establecer factura_consecutivo en 2081 para que el siguiente sea 2082 (primer real = 2083)
  db.prepare(`
    INSERT INTO configuracion (clave, valor) VALUES ('factura_consecutivo','2082')
    ON CONFLICT(clave) DO UPDATE SET valor='2082' WHERE CAST(valor AS INTEGER) < 2082
  `).run();
}

// Agregar K1 y C1 como productos vendibles en categoría "empaque"
function patchProductosEmpaque(db) {
  const getIng  = (n) => db.prepare('SELECT id FROM ingredientes WHERE nombre=?').get(n);
  const getProd = (n) => db.prepare('SELECT id FROM productos WHERE nombre=?').get(n);
  const insIng  = db.prepare(`INSERT INTO ingredientes (nombre, stock_actual, stock_minimo, unidad, es_perecedero, duracion_dias, categoria, costo_unitario) VALUES (?,?,?,?,?,?,?,?)`);
  const insProd = db.prepare('INSERT INTO productos (nombre, precio, categoria, codigo) VALUES (?,?,?,?)');
  const insRec  = db.prepare('INSERT INTO recetas (producto_id, ingrediente_id, cantidad) VALUES (?,?,?)');

  // K1: ingrediente ya existe en desechables, solo crear el producto
  const k1Ing = getIng('K1');
  if (k1Ing && !getProd('K1')) {
    const r = insProd.run('K1', 500, 'empaque', 'K1');
    insRec.run(r.lastInsertRowid, k1Ing.id, 1);
  }

  // C1: crear ingrediente y producto
  let c1IngId;
  const c1Ing = getIng('C1');
  if (!c1Ing) {
    c1IngId = insIng.run('C1', 0, 2, 'unidad', 0, null, 'desechable', 300).lastInsertRowid;
  } else {
    c1IngId = c1Ing.id;
  }
  if (!getProd('C1')) {
    const r = insProd.run('C1', 300, 'empaque', 'C1');
    insRec.run(r.lastInsertRowid, c1IngId, 1);
  }

  // K1 y C1 NO son vendibles en el POS — son empaques de inventario interno
  db.prepare("UPDATE productos SET activo=0 WHERE nombre IN ('K1','C1')").run();
}

// Actualizar costos reales de ingredientes
function patchCostosIngredientes(db) {
  const upd = db.prepare('UPDATE ingredientes SET costo_unitario=? WHERE nombre=?');
  const costos = [
    // Carnes
    ['Salchicha',         1414],
    ['Chorizo',           1560],
    ['Carne hamburguesa', 1267],
    // Panes
    ['Pan perro',          625],
    ['Pan hamburguesa',    625],
    // Lácteos
    ['Queso tajado',       450],
    ['Queso costeño',    25000],  // por bloque (453.6g)
    // Papas (costo por gramo: $21000 / (31 porciones × 200g) ≈ $3.39/g)
    ['Papas fritas',      3.39],
    ['Papas migaja',      4.33],  // estimado $13000/3kg
    // Vegetales
    ['Tomate',             500],  // ~$500 por unidad
    ['Lechuga',           2500],  // ~$2500 por cabeza
    ['Cebolla',            600],  // ~$600 por unidad
    // Toppings
    ['Piña',              9000],
    ['Jalapeños',        31000],
    ['Pepinillos',       11500],
    ['Maicitos',          6800],
    // Bebidas
    ['Gaseosa pequeña',    833],
    ['Coca-Cola 250ml',   1600],
    ['Coca-Cola 400ml',   2500],
    ['Águila',            2791],
    ['Club Dorada',       3150],
    ['Coronita',          2592],
    ['Poker',             2791],
    ['Cola y Pola',       2166],
    ['Bretaña',           2288],
    ['Agua con gas',      1250],
    ['Agua sin gas',      1250],
    ['Qatro',             2500],
    ['Pony Malta',        2500],
    ['Colombianita',       833],
    ['Pepsi chiquita',     833],
    // Salsas
    ['Salsa rosada',     25211],
    ['Salsa de tomate',  15410],
    ['Salsa de piña',    19781],
    ['Mostaza',          17393],
    ['Salsa tártara',     9550],
    ['Mayonesa',         37100],
    // Empaques/desechables
    ['K1',                 175],
    ['C1',                 300],
  ];
  for (const [nombre, costo] of costos) upd.run(costo, nombre);
  // Tocineta: costo según unidad actual (no sobreescribir migración de paquete→tira)
  // Paquete = $15.000 → tira = $15.000 / 32 = $468.75
  db.prepare("UPDATE ingredientes SET costo_unitario=15000  WHERE nombre='Tocineta' AND unidad='paquete'").run();
  db.prepare("UPDATE ingredientes SET costo_unitario=468.75 WHERE nombre='Tocineta' AND unidad='tira'").run();
}

// Actualizar recetas con cantidades correctas
function patchRecetasV2(db) {
  const getProd = (n) => db.prepare('SELECT id FROM productos WHERE nombre=?').get(n)?.id;
  const getIng  = (n) => db.prepare('SELECT id FROM ingredientes WHERE nombre=?').get(n)?.id;

  const papasId = getIng('Papas fritas');
  if (!papasId) return;

  // Salchipapa Americana: papas 200g → 400g (2 porciones)
  for (const nombre of ['Salchipapa Americana', 'Combo Salchipapa + Gaseosa']) {
    const prodId = getProd(nombre);
    if (prodId) {
      db.prepare('UPDATE recetas SET cantidad=400 WHERE producto_id=? AND ingrediente_id=?')
        .run(prodId, papasId);
    }
  }

  // Combo Hamburguesa: agregar 1 porción papas (200g) si no existe
  const comboHamb = getProd('Combo Hamburguesa');
  if (comboHamb) {
    const existe = db.prepare('SELECT 1 FROM recetas WHERE producto_id=? AND ingrediente_id=?').get(comboHamb, papasId);
    if (!existe) {
      db.prepare('INSERT INTO recetas (producto_id, ingrediente_id, cantidad) VALUES (?,?,?)').run(comboHamb, papasId, 200);
    }
  }
}

// Importar datos históricos (cierres, ventas, compras del 17-20 Abr 2026)
function patchDatosHistoricos(db) {
  // Verificar si ya fue importado
  const yaExiste = db.prepare("SELECT COUNT(*) as c FROM caja WHERE fecha IN ('2026-04-17','2026-04-18','2026-04-19','2026-04-20')").get().c;
  if (yaExiste > 0) return;

  const getProdId = (n) => db.prepare('SELECT id, precio FROM productos WHERE nombre=? AND activo=1').get(n);

  const insVenta = db.prepare(`
    INSERT INTO ventas (fecha, empleado, total, metodo_pago, monto_efectivo_mixto, monto_nequi_mixto)
    VALUES (?,?,?,?,?,?)
  `);
  const insDetalle = db.prepare(`
    INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES (?,?,?,?)
  `);
  const insCaja = db.prepare(`
    INSERT INTO caja (fecha, efectivo, nequi, total_ventas, gastos, utilidad, empleado, notas, descuadre, observacion_descuadre, cerrada)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)
  `);
  const insCompra = db.prepare(`
    INSERT INTO compras (fecha, ingrediente_id, ingrediente_nombre, cantidad, precio_pagado, proveedor, empleado)
    VALUES (?,?,?,?,?,?,?)
  `);
  const getIngId = (n) => db.prepare('SELECT id FROM ingredientes WHERE nombre=?').get(n)?.id;

  const crearVenta = (fecha, metodo, total, efectivo, nequi, productos) => {
    const vId = insVenta.run(
      `${fecha} 12:00:00`, 'Sistema', total, metodo, efectivo, nequi
    ).lastInsertRowid;
    for (const [nombre, cant] of productos) {
      const p = getProdId(nombre);
      if (p) insDetalle.run(vId, p.id, cant, p.precio);
    }
    return vId;
  };

  // ── 17 Abril 2026 ─────────────────────────────────────────────────────────
  crearVenta('2026-04-17', 'efectivo', 238000, 0, 0, [
    ['Perro Americano', 10], ['Combo Perro + Gaseosa', 5],
    ['Combo Choripán + Gaseosa', 1], ['Salchipapa Americana', 4],
    ['Combo Hamburguesa', 1], ['Coronita', 3],
    ['Coca-Cola 250ml', 2], ['Coca-Cola 400ml', 1],
    ['Agua con gas', 1], ['K1', 1],
  ]);
  insCaja.run('2026-04-17', 238000, 0, 238000, 0, 238000, 'Sistema', 'Importado', 0, '');

  // ── 18 Abril 2026 ─────────────────────────────────────────────────────────
  crearVenta('2026-04-18', 'mixto', 323500, 232500, 91000, [
    ['Perro Americano', 22], ['Combo Perro + Gaseosa', 8],
    ['Choripán', 3], ['Combo Choripán + Gaseosa', 1],
    ['Hamburguesa Artesanal', 1], ['Salchipapa Americana', 1],
    ['Adición: Tocineta', 1], ['Coca-Cola 250ml', 5], ['Coca-Cola 400ml', 2],
  ]);
  // Compras 18 Abr
  const palillosId = getIngId('Palillos');
  const lechuId    = getIngId('Lechuga');
  if (lechuId) {
    insCompra.run('2026-04-18 10:00:00', lechuId, 'Lechuga', 2, 3200, 'El Gran Surtidor', 'Sistema');
    db.prepare('UPDATE ingredientes SET stock_actual=stock_actual+2 WHERE id=?').run(lechuId);
  }
  if (palillosId) {
    insCompra.run('2026-04-18 10:00:00', palillosId, 'Palillos', 1, 1400, 'El Gran Surtidor', 'Sistema');
    db.prepare('UPDATE ingredientes SET stock_actual=stock_actual+1 WHERE id=?').run(palillosId);
  }
  insCaja.run('2026-04-18', 232500, 91000, 323500, 4600, 318900, 'Sistema', 'Diferencia sistema anterior', 18000, 'Descuadre registrado al migrar del sistema anterior');

  // ── 19 Abril 2026 ─────────────────────────────────────────────────────────
  crearVenta('2026-04-19', 'mixto', 154500, 118500, 36000, [
    ['Perro Americano', 5], ['Combo Perro + Gaseosa', 1],
    ['Choripán', 2], ['Combo Choripán + Gaseosa', 1],
    ['Hamburguesa Artesanal', 3], ['Salchipapa Americana', 1],
    ['Adición: Tocineta', 2], ['Águila', 1],
    ['Coca-Cola 250ml', 2], ['Coca-Cola 400ml', 4],
    ['Agua sin gas', 1], ['K1', 1],
  ]);
  // Compras 19 Abr
  const items19 = [
    ['Repollo',       3.32,  9856],
    ['Zanahoria',     0.84,  1672],
    ['Cebolla',       1.8,   2080],
    ['Azúcar blanca', 1,     3600],
    ['Pimienta',      2,     5000],
  ];
  for (const [nombre, cant, precio] of items19) {
    const iId = getIngId(nombre);
    insCompra.run('2026-04-19 10:00:00', iId || null, nombre, cant, precio, 'El Gran Surtidor', 'Sistema');
    if (iId) db.prepare('UPDATE ingredientes SET stock_actual=stock_actual+? WHERE id=?').run(cant, iId);
  }
  // Sal Refisal sin ingrediente en BD
  insCompra.run('2026-04-19 10:00:00', null, 'Sal Refisal', 1, 2700, 'El Gran Surtidor', 'Sistema');
  insCaja.run('2026-04-19', 118500, 36000, 154500, 24828, 129672, 'Sistema', 'Importado', 0, '');

  // ── 20 Abril 2026 ─────────────────────────────────────────────────────────
  crearVenta('2026-04-20', 'mixto', 155500, 114500, 41000, [
    ['Perro Americano', 10], ['Combo Perro + Gaseosa', 3],
    ['Hamburguesa Artesanal', 1], ['Poker', 3], ['Cola y Pola', 1],
    ['Coca-Cola 250ml', 2], ['Coca-Cola 400ml', 2],
    ['Agua sin gas', 1], ['K1', 2],
  ]);
  // Compras 20 Abr
  const azuId = getIngId('Azúcar blanca');
  const cilId = getIngId('Cilantro');
  if (azuId) {
    insCompra.run('2026-04-20 10:00:00', azuId, 'Azúcar Manuelita', 1, 3600, 'El Gran Surtidor', 'Sistema');
    db.prepare('UPDATE ingredientes SET stock_actual=stock_actual+1 WHERE id=?').run(azuId);
  }
  if (cilId) {
    insCompra.run('2026-04-20 10:00:00', cilId, 'Cilantro', 1, 1200, 'El Gran Surtidor', 'Sistema');
    db.prepare('UPDATE ingredientes SET stock_actual=stock_actual+1 WHERE id=?').run(cilId);
  }
  insCaja.run('2026-04-20', 114500, 41000, 155500, 4800, 150700, 'Sistema', 'Importado', 0, '');
}

// Asigna códigos a los productos si aún no tienen
function patchCodigos(db) {
  const first = db.prepare('SELECT codigo FROM productos LIMIT 1').get();
  if (first && first.codigo) return;

  const upd = db.prepare('UPDATE productos SET codigo = ? WHERE nombre = ?');
  const codigos = [
    ['P1',  'Perro Americano'],
    ['P2',  'Combo Perro + Gaseosa'],
    ['CH1', 'Choripán'],
    ['CH2', 'Combo Choripán + Gaseosa'],
    ['SP1', 'Salchipapa Americana'],
    ['SP2', 'Combo Salchipapa + Gaseosa'],
    ['H1',  'Hamburguesa Artesanal'],
    ['H2',  'Combo Hamburguesa'],
    ['AD1', 'Adición: Tocineta'],
    ['AD2', 'Adición: Queso'],
    ['AD3', 'Adición: Carne'],
    ['AD4', 'Adición: Porción Papas'],
    ['AD5', 'Adición: Chorizo'],
    ['AD6', 'Adición: Salchicha'],
    ['B1',  'Coca-Cola 250ml'],
    ['B2',  'Coca-Cola 400ml'],
    ['B3',  'Cola y Pola'],
    ['B4',  'Poker'],
    ['B5',  'Águila'],
    ['B6',  'Club Dorada'],
    ['B7',  'Colombianita'],
    ['B8',  'Pepsi chiquita'],
    ['B9',  'Coronita'],
    ['B10', 'Bretaña'],
    ['B11', 'Pony Malta'],
    ['B12', 'Qatro'],
    ['B13', 'Agua con gas'],
    ['B14', 'Agua sin gas'],
  ];
  for (const [codigo, nombre] of codigos) upd.run(codigo, nombre);
}

// Asignar roles: Juan = administrador, Sofía y futuros = empleado por defecto
function patchRolesEmpleados(db) {
  try { db.prepare("UPDATE empleados SET rol='administrador' WHERE nombre='Juan'").run(); } catch(_) {}
}

// Migración de unidades: Papa francesa en porciones, Tocineta en tiras, recetas corregidas
function patchUnidadesV2(db) {
  const done = db.prepare("SELECT valor FROM configuracion WHERE clave='patch_unidades_v2'").get();
  if (done?.valor === '1') return;

  // ── Papa francesa (antes "Papas fritas") ─────────────────────────────────
  // El stock pasa de GRAMOS a PORCIONES (200g por porción, 1 paquete = 31 porciones)
  const papas = db.prepare("SELECT * FROM ingredientes WHERE nombre IN ('Papas fritas','Papa francesa') ORDER BY id LIMIT 1").get();
  if (papas && papas.unidad !== 'porción') {
    const stockPorciones = Math.max(0, Math.round(papas.stock_actual / 200));
    db.prepare(`
      UPDATE ingredientes SET
        nombre='Papa francesa', unidad='porción',
        costo_unitario=677, stock_actual=?, stock_minimo=31
      WHERE id=?
    `).run(stockPorciones, papas.id);

    // Salchipapa (400g gramos → 2 porciones), Combo Hamburguesa (200g → 1 porción)
    db.prepare('UPDATE recetas SET cantidad=2 WHERE ingrediente_id=? AND cantidad>=400').run(papas.id);
    db.prepare('UPDATE recetas SET cantidad=1 WHERE ingrediente_id=? AND cantidad>=200 AND cantidad<400').run(papas.id);
    // Adición porción papas (200g → 1 porción), si acaso quedó < 200
    db.prepare('UPDATE recetas SET cantidad=1 WHERE ingrediente_id=? AND cantidad>0 AND cantidad<200').run(papas.id);
  }

  // ── Tocineta: de PAQUETES a TIRAS (1 paquete = 32 tiras, costo=$468.75/tira) ──
  const tocineta = db.prepare("SELECT * FROM ingredientes WHERE nombre='Tocineta' LIMIT 1").get();
  if (tocineta && tocineta.unidad === 'paquete') {
    const stockTiras = Math.max(0, Math.round(tocineta.stock_actual * 32));
    db.prepare(`
      UPDATE ingredientes SET
        unidad='tira', costo_unitario=468.75, stock_actual=?, stock_minimo=12
      WHERE id=?
    `).run(stockTiras, tocineta.id);

    // Todas las recetas de tocineta → 1 tira (Salchipapa, Adición Tocineta)
    db.prepare('UPDATE recetas SET cantidad=1 WHERE ingrediente_id=?').run(tocineta.id);
  }

  db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('patch_unidades_v2','1') ON CONFLICT(clave) DO UPDATE SET valor='1'").run();
  console.log('[DB] patchUnidadesV2: unidades de Papa francesa y Tocineta corregidas.');
}

// Corrección de costo de Tocineta: paquete de 32 tiras = $15.000 → $468.75/tira
// Actualiza también notas_unidad y verifica que las recetas usen 1 tira por plato
function patchTocinetaV3(db) {
  const done = db.prepare("SELECT valor FROM configuracion WHERE clave='patch_tocineta_v3'").get();
  if (done?.valor === '1') return;

  const tocineta = db.prepare("SELECT id, unidad FROM ingredientes WHERE nombre='Tocineta' LIMIT 1").get();
  if (tocineta) {
    db.prepare(`
      UPDATE ingredientes
      SET costo_unitario=468.75,
          notas_unidad='Paquete de 32 tiras = $15.000'
      WHERE id=?
    `).run(tocineta.id);

    // Verificar que todas las recetas que usan Tocineta estén en 1 tira
    // (Salchipapa Americana, Combos, Adición Tocineta)
    db.prepare('UPDATE recetas SET cantidad=1 WHERE ingrediente_id=? AND cantidad!=1').run(tocineta.id);
  }

  db.prepare(
    "INSERT INTO configuracion (clave, valor) VALUES ('patch_tocineta_v3','1') ON CONFLICT(clave) DO UPDATE SET valor='1'"
  ).run();
  console.log('[DB] patchTocinetaV3: Tocineta → $468.75/tira (paquete 32 tiras = $15.000)');
}

// Eliminar ventas y compra de prueba del 23 de abril 2026
// Importar datos históricos 17 Abr–1 May 2026 (guarded)
// Ventas → tabla ventas + caja. Gastos → tabla gastos. Transferencias → tabla transferencias_internas.
// 17-20 Abril ya tienen registros en caja; solo se agregan los gastos faltantes.
// Consecutivo de facturas se actualiza a 2198 al final.
function patchDatosHistoricosV2(db) {
  const yaFue = db.prepare("SELECT valor FROM configuracion WHERE clave='historico_v2'").get();
  if (yaFue) return;

  const existeCaja = (fecha) => db.prepare('SELECT id FROM caja WHERE fecha=?').get(fecha);

  const insVenta = db.prepare(`
    INSERT INTO ventas (fecha, empleado, total, metodo_pago, monto_efectivo_mixto, monto_nequi_mixto, factura_num)
    VALUES (?,?,?,?,?,?,?)
  `);
  const insCaja = db.prepare(`
    INSERT INTO caja (fecha, efectivo, nequi, total_ventas, gastos, utilidad, empleado, notas, descuadre, observacion_descuadre, cerrada)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)
  `);
  const insGasto = db.prepare(`
    INSERT INTO gastos (fecha, descripcion, monto, categoria, metodo_pago, empleado, notas)
    VALUES (?,?,?,?,?,?,?)
  `);
  const insTrans = db.prepare(`
    INSERT INTO transferencias_internas (fecha, concepto, valor, de_medio, a_medio, empleado)
    VALUES (?,?,?,?,?,?)
  `);

  db.transaction(() => {

    // ── VENTAS Y CAJA para fechas nuevas (21 Abr – 1 May) ──────────────────

    const diasVentas = [
      // [fecha, ef, nq, total, gastos_total, ultima_factura]
      ['2026-04-21', 138000,  69000, 207000, 143600, 2094],
      ['2026-04-23',  90000,      0,  90000, 385421, 2099],
      ['2026-04-24', 372000, 108500, 480500, 128200, 2128],
      ['2026-04-25', 123000, 165500, 288500, 340559, 2144],
      ['2026-04-26', 237500,   3000, 240500, 124263, 2157],
      ['2026-04-27',  76000,      0,  76000, 199800, 2162],
      ['2026-04-28',  78500,  66500, 145000, 387247, 2170],
      ['2026-04-30', 177000,  50000, 227000, 348750, 2184],
      ['2026-05-01', 416000, 125500, 541500,  44800, 2198],
    ];

    for (const [fecha, ef, nq, total, gastosTot, uf] of diasVentas) {
      if (existeCaja(fecha)) continue;
      if (ef > 0) insVenta.run(`${fecha} 12:00:00`, 'Importado', ef, 'efectivo', 0, 0, uf);
      if (nq > 0) insVenta.run(`${fecha} 12:30:00`, 'Importado', nq, 'nequi',    0, 0, 0);
      insCaja.run(fecha, ef, nq, total, gastosTot, total - gastosTot, 'Importado', 'Datos históricos', 0, '');
    }

    // ── GASTOS — todos los días 17 Abr–1 May ───────────────────────────────
    // Formato: [fecha, descripcion, monto, categoria, metodo_pago, empleado, notas]
    const gastos = [
      // 17 Abril
      ['2026-04-17', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local', 'efectivo', 'Don Rodrigo', ''],

      // 18 Abril (Lechuga+Palillos ya están en compras — no se duplican)
      ['2026-04-18', 'Pago Sofía — Nómina',                         15000, 'Nomina',       'efectivo', 'Sofía', ''],
      ['2026-04-18', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',  'efectivo', 'Don Rodrigo', ''],

      // 19 Abril (ingredientes ya en compras)
      ['2026-04-19', 'Pago Sofía — Nómina',                         36000, 'Nomina',       'efectivo', 'Sofía', ''],
      ['2026-04-19', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',  'efectivo', 'Don Rodrigo', ''],

      // 20 Abril (Azúcar+Cilantro ya en compras)
      ['2026-04-20', 'FROZEN — Salsas Mayo-Mostaza, Mayonesa, Tomate', 70600, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-20', 'Desayuno — Mónica y Laura',                    15600, 'otro',         'nequi',    '', ''],
      ['2026-04-20', 'Pago Sofía — Nómina',                         36000, 'Nomina',        'efectivo', 'Sofía', ''],
      ['2026-04-20', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',   'efectivo', 'Don Rodrigo', ''],

      // 21 Abril
      ['2026-04-21', 'El Gran Surtidor — Lechuga',                   1600, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-21', 'Félix — Pimienta 1/4 + Paprika 1/4',          12000, 'Compra insumos', 'nequi',    '', ''],
      ['2026-04-21', 'Postobón — Gaseosas surtidas x12',            50000, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-21', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'efectivo', 'Don Rodrigo', ''],

      // 22 Abril
      ['2026-04-22', 'Pago Juan — Nómina',                          18000, 'Nomina',         'nequi',    'Juan', ''],

      // 23 Abril
      ['2026-04-23', 'Insumos — Servilletas, Guantes Nitrilo, Bolsa Negra', 37599, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-23', 'Imperio de las Carnes — Queso costeño 1/2 lb',  7830, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-23', 'El Gran Surtidor — Cebolla, Tomate, Limón',    23992, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-23', 'Don Rodrigo — Panes y Salchichas',            180000, 'Compra insumos', 'nequi',    'Don Rodrigo', ''],
      ['2026-04-23', 'Don Rodrigo — Panes y Salchichas (complemento)', 20000, 'Compra insumos', 'efectivo', 'Don Rodrigo', ''],
      ['2026-04-23', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'efectivo', 'Don Rodrigo', ''],
      ['2026-04-23', 'Pago Sofía — Nómina',                         36000, 'Nomina',          'efectivo', 'Sofía', ''],

      // 24 Abril
      ['2026-04-24', 'El Gran Surtidor — Lechuga x2',                3200, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-24', 'Pago Sofía — Nómina',                         45000, 'Nomina',          'nequi',   'Sofía', ''],
      ['2026-04-24', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',     'efectivo', 'Don Rodrigo', ''],

      // 25 Abril
      ['2026-04-25', 'El Gran Surtidor — Vinagre, Cilantro, Lechuga, Limón, Cebolla', 13031, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-25', 'El Gran Surtidor — Tomate',                    1928, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-25', 'Santa Helena — Queso costeño + Queso tajado', 63000, 'Compra insumos', 'nequi',    '', ''],
      ['2026-04-25', 'Pago Juan — Nómina',                           4000, 'Nomina',          'nequi',   'Juan', ''],
      ['2026-04-25', 'Pago Sofía — Nómina',                         42000, 'Nomina',          'nequi',   'Sofía', ''],
      ['2026-04-25', 'Pago — Varios',                               15000, 'otro',             'nequi',   '', ''],
      ['2026-04-25', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',     'efectivo', 'Don Rodrigo', ''],
      ['2026-04-25', 'Pago Juan — Salida',                          30000, 'Nomina',           'efectivo', 'Juan', ''],
      ['2026-04-25', 'Don Rodrigo — Pan, Maíz, Porta perros',       91600, 'Compra insumos',  'efectivo', 'Don Rodrigo', ''],

      // 26 Abril
      ['2026-04-26', 'El Gran Surtidor — Cebolla, Tomate',           7863, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-26', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'efectivo', 'Don Rodrigo', ''],
      ['2026-04-26', 'Pago Juan — Carro Casa',                       8400, 'Nomina',          'nequi',   'Juan', ''],
      ['2026-04-26', 'Pago Juan — Nómina Carne',                    10000, 'Nomina',          'nequi',   'Juan', ''],
      ['2026-04-26', 'Pago Sofía — Nómina',                         18000, 'Nomina',          'nequi',   'Sofía', ''],

      // 27 Abril
      ['2026-04-27', 'Pago Juan — Gastos',                           6600, 'Nomina',          'nequi',   'Juan', ''],
      ['2026-04-27', 'Pago Juan — Gastos',                           5000, 'Nomina',          'efectivo', 'Juan', ''],
      ['2026-04-27', 'Santa Helena — Queso costeño 1 lb',           23000, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-27', 'Pago Sofía — Nómina',                         18000, 'Nomina',          'nequi',   'Sofía', ''],
      ['2026-04-27', 'FROZEN — Salsa Tártara + Papas Fritas',       67200, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-27', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'efectivo', 'Don Rodrigo', ''],

      // 28 Abril
      ['2026-04-28', 'El Gran Surtidor — Cilantro, Lechuga',         3000, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-28', 'El Gran Surtidor — Tomate, Cebolla',          10107, 'Compra insumos', 'efectivo', '', ''],
      ['2026-04-28', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'nequi',    'Don Rodrigo', ''],
      ['2026-04-28', 'Pago Juan — Gastos',                          13700, 'Nomina',          'nequi',   'Juan', ''],
      ['2026-04-28', 'Servicio Luz — Servicios Públicos',          133700, 'Servicios',       'efectivo', '', ''],
      ['2026-04-28', 'Coca-Cola — Surtido gaseosas',               133484, 'Compra insumos', 'efectivo', '', 'CC250, CC400, QTO, Agua sin gas, Agua con gas'],
      ['2026-04-28', 'El Gran Surtidor — Cilantro, Tomate, Cebolla', 13256, 'Compra insumos', 'efectivo', '', ''],

      // 30 Abril
      ['2026-04-30', 'Don Rodrigo — Cuota fija — cesión del local', 80000, 'Cuota local',    'efectivo', 'Don Rodrigo', ''],
      ['2026-04-30', 'Don Rodrigo — Pan, Salchicha, Maíz',         237000, 'Compra insumos', 'efectivo', 'Don Rodrigo', ''],
      ['2026-04-30', 'Pago Sofía — Nómina',                         23000, 'Nomina',          'nequi',   'Sofía', ''],
      ['2026-04-30', 'Pago Juan — Gastos',                           8750, 'Nomina',          'nequi',   'Juan', ''],

      // 1 Mayo
      ['2026-05-01', 'Pago Sofía — Nómina',                         42000, 'Nomina',          'nequi',   'Sofía', ''],
      ['2026-05-01', 'Pago Juan — Gastos',                           2800, 'Nomina',          'nequi',   'Juan', ''],
    ];

    for (const [fecha, desc, monto, cat, metodo, empl, notas] of gastos) {
      insGasto.run(`${fecha} 08:00:00`, desc, monto, cat, metodo, empl, notas);
    }

    // ── TRANSFERENCIAS INTERNAS 28 Abril ──────────────────────────────────
    insTrans.run('2026-04-28', 'Cambio Efectivo → Nequi', 70000, 'efectivo', 'nequi', '');
    insTrans.run('2026-04-28', 'Cambio Nequi → Efectivo', 50000, 'nequi', 'efectivo', '');

    // ── Actualizar consecutivo de facturas a 2198 ─────────────────────────
    db.prepare(`
      INSERT INTO configuracion (clave, valor) VALUES ('factura_consecutivo','2198')
      ON CONFLICT(clave) DO UPDATE SET valor=
        CASE WHEN CAST(excluded.valor AS INTEGER) > CAST(valor AS INTEGER)
             THEN excluded.valor ELSE valor END
    `).run();

    // Marcar como ejecutado
    db.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('historico_v2','1')").run();

  })();

  console.log('[DB] patchDatosHistoricosV2: histórico 17 Abr–1 May importado.');
}

function patchLimpiezaDatosPrueba(db) {
  db.transaction(() => {
    db.prepare(`
      DELETE FROM detalle_ventas WHERE venta_id IN (
        SELECT id FROM ventas WHERE date(fecha) = '2026-04-23'
      )
    `).run();
    db.prepare(`DELETE FROM ventas WHERE date(fecha) = '2026-04-23'`).run();
    // Compra fantasma Pico de gallo id=28, precio_pagado=0
    db.prepare(`DELETE FROM compras WHERE id = 28 AND precio_pagado = 0`).run();
  })();
}

module.exports = {
  seedDatabase,
  patchBebidas,
  patchDesechables,
  patchProveedores,
  patchCodigos,
  patchEmpleados,
  patchCorrecciones,
  patchProductosEmpaque,
  patchCostosIngredientes,
  patchRecetasV2,
  patchDatosHistoricos,
  patchRolesEmpleados,
  patchUnidadesV2,
  patchLimpiezaDatosPrueba,
  patchTocinetaV3,
  patchDatosHistoricosV2,
};

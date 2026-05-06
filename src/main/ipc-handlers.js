// Handlers IPC - todas las operaciones de base de datos
const { ipcMain, app, shell } = require('electron');
const crypto = require('crypto');
const { getDB } = require('../database');
const { runMigrations } = require('../database/migrations');
const { PIN_SECRET } = require('../database/constants');
const {
  seedDatabase, patchBebidas, patchDesechables, patchProveedores, patchCodigos,
  patchEmpleados, patchCorrecciones, patchProductosEmpaque,
  patchCostosIngredientes, patchRecetasV2, patchDatosHistoricos,
  patchRolesEmpleados, patchUnidadesV2, patchLimpiezaDatosPrueba, patchTocinetaV3,
  patchDatosHistoricosV2, patchDatosHistoricosV3, patchLimpiezaCompleta,
} = require('../database/seed');
const { imprimirRecibo, imprimirCierre, imprimirPrueba, getPrinters, getPrintersDetailed, abrirCajon } = require('./print-service');
const syncService = require('../sync/syncService');

function hashPin(pin) {
  return crypto.createHmac('sha256', PIN_SECRET).update(String(pin)).digest('hex');
}

function setupIpcHandlers() {
  const db = getDB();
  runMigrations(db);
  seedDatabase(db);
  patchBebidas(db);
  patchDesechables(db);
  patchProveedores(db);
  patchCodigos(db);
  patchEmpleados(db);
  patchCorrecciones(db);
  patchProductosEmpaque(db);
  patchCostosIngredientes(db);
  patchRecetasV2(db);
  patchDatosHistoricos(db);
  patchRolesEmpleados(db);
  patchUnidadesV2(db);
  patchLimpiezaDatosPrueba(db);
  patchTocinetaV3(db);
  patchLimpiezaCompleta(db);   // limpieza total y reinserción desde CSV (antes de V2/V3)
  patchDatosHistoricosV2(db);  // no-op después de patchLimpiezaCompleta
  patchDatosHistoricosV3(db);  // no-op después de patchLimpiezaCompleta

  // Limpiar pedidos pendientes vacíos o corruptos al iniciar la app
  // Evita que mesas queden marcadas como "Abierta" sin tener ítems reales
  db.prepare(
    `DELETE FROM pedidos_pendientes WHERE items = '[]' OR items = '' OR items IS NULL`
  ).run();

  // ── PRODUCTOS ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:getProductos', () => {
    return db.prepare(`
      SELECT * FROM productos ORDER BY
        CASE categoria WHEN 'principal' THEN 1 WHEN 'combo' THEN 2 ELSE 3 END,
        nombre
    `).all();
  });

  ipcMain.handle('db:updateProducto', (_, id, datos) => {
    const { nombre, precio, activo, codigo } = datos;
    db.prepare('UPDATE productos SET nombre=?, precio=?, activo=?, codigo=? WHERE id=?')
      .run(nombre, precio, activo, codigo || '', id);
    return { ok: true };
  });

  ipcMain.handle('db:agregarProducto', (_, datos) => {
    const { nombre, precio, categoria, codigo } = datos;
    const r = db.prepare('INSERT INTO productos (nombre, precio, categoria, codigo) VALUES (?,?,?,?)')
      .run(nombre, precio, categoria, codigo || '');
    return { id: r.lastInsertRowid };
  });

  ipcMain.handle('db:toggleProducto', (_, id) => {
    db.prepare('UPDATE productos SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run(id);
    return { ok: true };
  });

  // ── RECETAS ───────────────────────────────────────────────────────────────

  ipcMain.handle('db:getRecetaProducto', (_, productoId) => {
    return db.prepare(`
      SELECT r.id, r.ingrediente_id, r.cantidad,
             i.nombre as ingrediente_nombre, i.unidad, i.costo_unitario
      FROM recetas r JOIN ingredientes i ON i.id = r.ingrediente_id
      WHERE r.producto_id = ?
      ORDER BY i.nombre
    `).all(productoId);
  });

  ipcMain.handle('db:updateRecetaProducto', (_, productoId, items) => {
    // items = [{ ingrediente_id, cantidad }]
    const t = db.transaction(() => {
      db.prepare('DELETE FROM recetas WHERE producto_id = ?').run(productoId);
      const ins = db.prepare('INSERT INTO recetas (producto_id, ingrediente_id, cantidad) VALUES (?,?,?)');
      for (const item of items) {
        if (item.ingrediente_id && item.cantidad > 0) {
          ins.run(productoId, item.ingrediente_id, item.cantidad);
        }
      }
    });
    t();
    return { ok: true };
  });

  // ── INGREDIENTES ──────────────────────────────────────────────────────────

  ipcMain.handle('db:getIngredientes', () => {
    return db.prepare(`
      SELECT * FROM ingredientes WHERE activo=1 ORDER BY
        CASE categoria
          WHEN 'carne'    THEN 1
          WHEN 'pan'      THEN 2
          WHEN 'lacteo'   THEN 3
          WHEN 'vegetal'  THEN 4
          WHEN 'bebida'      THEN 5
          WHEN 'salsa'       THEN 6
          WHEN 'topping'     THEN 7
          WHEN 'preparado'   THEN 8
          WHEN 'desechable'  THEN 9
          ELSE 10
        END, nombre
    `).all();
  });

  ipcMain.handle('db:updateStock', (_, id, cantidad) => {
    db.prepare('UPDATE ingredientes SET stock_actual = ? WHERE id = ?').run(cantidad, id);
    return { ok: true };
  });

  ipcMain.handle('db:updateIngrediente', (_, id, datos) => {
    const { stock_minimo, unidad, unidades_por_paquete } = datos;
    db.prepare('UPDATE ingredientes SET stock_minimo=?, unidad=?, unidades_por_paquete=? WHERE id=?')
      .run(stock_minimo, unidad, unidades_por_paquete || null, id);
    return { ok: true };
  });

  // Actualización completa de ingrediente incluyendo nombre, categoría, costos, etc.
  ipcMain.handle('db:updateIngredienteFull', (_, id, datos) => {
    const {
      nombre, categoria, unidad, stock_minimo, stock_actual,
      costo_unitario, es_perecedero, duracion_dias,
      unidades_por_paquete, proveedor_id,
    } = datos;
    db.prepare(`
      UPDATE ingredientes SET
        nombre=?, categoria=?, unidad=?, stock_minimo=?,
        costo_unitario=?, es_perecedero=?, duracion_dias=?,
        unidades_por_paquete=?, proveedor_id=?
      WHERE id=?
    `).run(
      nombre, categoria, unidad,
      parseFloat(stock_minimo) || 0,
      parseFloat(costo_unitario) || 0,
      es_perecedero ? 1 : 0,
      duracion_dias || null,
      unidades_por_paquete || null,
      proveedor_id || null,
      id,
    );
    return { ok: true };
  });

  // Crear nuevo ingrediente
  ipcMain.handle('db:agregarIngrediente', (_, datos) => {
    const {
      nombre, categoria, unidad, stock_actual, stock_minimo,
      costo_unitario, es_perecedero, duracion_dias,
      unidades_por_paquete, proveedor_id,
    } = datos;
    const r = db.prepare(`
      INSERT INTO ingredientes
        (nombre, categoria, unidad, stock_actual, stock_minimo,
         costo_unitario, es_perecedero, duracion_dias,
         unidades_por_paquete, proveedor_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      nombre, categoria || 'otro', unidad || 'unidad',
      parseFloat(stock_actual) || 0,
      parseFloat(stock_minimo) || 0,
      parseFloat(costo_unitario) || 0,
      es_perecedero ? 1 : 0,
      duracion_dias || null,
      unidades_por_paquete || null,
      proveedor_id || null,
    );
    return { ok: true, id: r.lastInsertRowid };
  });

  // ── VENTAS ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:crearVenta', (_, ventaData) => {
    const {
      empleado, items, metodo_pago, total,
      monto_efectivo_mixto = 0, monto_nequi_mixto = 0,
      domicilio = 0, efectivo_recibido = 0,
      // Módulo descuentos
      descuento_id = null, descuento_valor = 0, descuento_nombre = '',
      // Módulo mesas
      mesa_id = null, mesa_nombre = '',
      // Módulo domicilios externos
      plataforma_domicilio = '', numero_orden_domicilio = '',
      comision_domicilio_pct = 0, comision_domicilio_valor = 0,
    } = ventaData;

    const transaccion = db.transaction(() => {
      const venta = db.prepare(`
        INSERT INTO ventas
          (empleado, total, metodo_pago, monto_efectivo_mixto, monto_nequi_mixto,
           domicilio, efectivo_recibido,
           descuento_id, descuento_valor, descuento_nombre,
           mesa_id, mesa_nombre,
           plataforma_domicilio, numero_orden_domicilio,
           comision_domicilio_pct, comision_domicilio_valor)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        empleado, total, metodo_pago,
        monto_efectivo_mixto, monto_nequi_mixto,
        domicilio, efectivo_recibido,
        descuento_id || null, Math.round(descuento_valor || 0), descuento_nombre || '',
        mesa_id || null, mesa_nombre || '',
        plataforma_domicilio || '', numero_orden_domicilio || '',
        parseFloat(comision_domicilio_pct || 0), Math.round(comision_domicilio_valor || 0),
      );

      const ventaId = venta.lastInsertRowid;

      for (const item of items) {
        const notaItem = item.nota || '';
        db.prepare(
          'INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, nota) VALUES (?, ?, ?, ?, ?)'
        ).run(ventaId, item.producto_id, item.cantidad, item.precio_unitario, notaItem);

        const receta = db.prepare(
          'SELECT r.ingrediente_id, r.cantidad, i.categoria FROM recetas r JOIN ingredientes i ON i.id = r.ingrediente_id WHERE r.producto_id = ?'
        ).all(item.producto_id);

        for (const r of receta) {
          // Si el combo tiene gaseosa elegida, saltar el ingrediente bebida de la receta
          if (notaItem && r.categoria === 'bebida') continue;
          const total_descontar = r.cantidad * item.cantidad;
          db.prepare(
            'UPDATE ingredientes SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?'
          ).run(total_descontar, r.ingrediente_id);
        }

        // Descontar la gaseosa elegida (1 unidad por cada unidad del combo)
        if (notaItem) {
          const gasIng = db.prepare('SELECT id FROM ingredientes WHERE nombre = ?').get(notaItem);
          if (gasIng) {
            db.prepare('UPDATE ingredientes SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?')
              .run(item.cantidad, gasIng.id);
          }
        }
      }

      // Descontar 1 empaque K1 por pedido completo (Part 1)
      const k1Ing = db.prepare("SELECT id FROM ingredientes WHERE nombre='K1'").get();
      if (k1Ing) {
        db.prepare('UPDATE ingredientes SET stock_actual = MAX(0, stock_actual - 1) WHERE id = ?')
          .run(k1Ing.id);
      }

      // Liberar el pedido pendiente de la mesa al cobrar
      if (mesa_id) {
        db.prepare('DELETE FROM pedidos_pendientes WHERE mesa_id = ?').run(mesa_id);
      }

      return ventaId;
    });

    const ventaId = transaccion();
    return { ok: true, ventaId };
  });

  ipcMain.handle('db:getVentasDia', (_, fecha) => {
    const inicio = `${fecha} 00:00:00`;
    const fin    = `${fecha} 23:59:59`;

    const ventas = db.prepare(`
      SELECT v.id, v.fecha, v.empleado, v.total, v.metodo_pago,
             COUNT(dv.id) as num_items
      FROM ventas v
      LEFT JOIN detalle_ventas dv ON v.id = dv.venta_id
      WHERE v.fecha BETWEEN ? AND ?
      GROUP BY v.id
      ORDER BY v.fecha DESC
    `).all(inicio, fin);

    const resumen = db.prepare(`
      SELECT
        COUNT(*)                                                                          AS total_transacciones,
        COALESCE(SUM(total), 0)                                                           AS total_ventas,
        COALESCE(SUM(CASE WHEN metodo_pago='efectivo' THEN total            ELSE 0 END)
               + SUM(CASE WHEN metodo_pago='mixto'    THEN monto_efectivo_mixto ELSE 0 END), 0) AS total_efectivo,
        COALESCE(SUM(CASE WHEN metodo_pago='nequi'    THEN total            ELSE 0 END)
               + SUM(CASE WHEN metodo_pago='mixto'    THEN monto_nequi_mixto    ELSE 0 END), 0) AS total_nequi,
        COALESCE(SUM(CASE WHEN metodo_pago='mixto'    THEN total            ELSE 0 END), 0) AS total_mixto,
        COALESCE(SUM(domicilio), 0) AS total_domicilios,
        COUNT(CASE WHEN domicilio > 0 THEN 1 END) AS num_domicilios
      FROM ventas WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin);

    const porEmpleado = db.prepare(`
      SELECT empleado, COUNT(*) as transacciones, SUM(total) as total
      FROM ventas WHERE fecha BETWEEN ? AND ?
      GROUP BY empleado
    `).all(inicio, fin);

    const productoTop = db.prepare(`
      SELECT p.nombre, SUM(dv.cantidad) as vendidos
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      JOIN ventas v ON v.id = dv.venta_id
      WHERE v.fecha BETWEEN ? AND ?
      GROUP BY dv.producto_id
      ORDER BY vendidos DESC
      LIMIT 1
    `).get(inicio, fin);

    return { ventas, resumen, porEmpleado, productoTop };
  });

  ipcMain.handle('db:getVentasPorHora', (_, fecha) => {
    const inicio = `${fecha} 00:00:00`;
    const fin    = `${fecha} 23:59:59`;

    return db.prepare(`
      SELECT
        CAST(strftime('%H', fecha) AS INTEGER) AS hora,
        COUNT(*)  AS transacciones,
        SUM(total) AS total
      FROM ventas
      WHERE fecha BETWEEN ? AND ?
      GROUP BY strftime('%H', fecha)
      ORDER BY hora
    `).all(inicio, fin);
  });

  ipcMain.handle('db:getVentasRango', (_, { fechaInicio, fechaFin, empleado }) => {
    let query = `
      SELECT DATE(fecha) as dia, COUNT(*) as transacciones, SUM(total) as total
      FROM ventas WHERE fecha BETWEEN ? AND ?
    `;
    const params = [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`];

    if (empleado && empleado !== 'todos') {
      query += ' AND empleado = ?';
      params.push(empleado);
    }

    query += ' GROUP BY dia ORDER BY dia';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('db:getVentasPorProducto', (_, { fechaInicio, fechaFin, empleado }) => {
    let query = `
      SELECT p.nombre, p.categoria,
             SUM(dv.cantidad) as unidades,
             SUM(dv.cantidad * dv.precio_unitario) as total
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      JOIN ventas v ON v.id = dv.venta_id
      WHERE v.fecha BETWEEN ? AND ?
    `;
    const params = [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`];

    if (empleado && empleado !== 'todos') {
      query += ' AND v.empleado = ?';
      params.push(empleado);
    }

    query += ' GROUP BY dv.producto_id ORDER BY total DESC';
    return db.prepare(query).all(...params);
  });

  ipcMain.handle('db:getVentasPorDia', (_, dias) => {
    return db.prepare(`
      SELECT DATE(fecha) as dia,
             COUNT(*) as transacciones,
             SUM(total) as total
      FROM ventas
      WHERE fecha >= datetime('now', '-${Math.abs(parseInt(dias))} days', 'localtime')
      GROUP BY dia
      ORDER BY dia
    `).all();
  });

  // ── BASE DE CAJA ──────────────────────────────────────────────────────────

  ipcMain.handle('db:getBaseCaja', (_, fecha) => {
    return db.prepare('SELECT * FROM base_caja WHERE fecha = ?').get(fecha) || null;
  });

  ipcMain.handle('db:registrarBaseCaja', (_, { fecha, empleado, efectivo_base, nequi_base }) => {
    // INSERT OR REPLACE para idempotencia (por si se llama dos veces)
    db.prepare(`
      INSERT INTO base_caja (fecha, empleado, efectivo_base, nequi_base)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fecha) DO UPDATE SET
        empleado=excluded.empleado,
        efectivo_base=excluded.efectivo_base,
        nequi_base=excluded.nequi_base,
        registrado_at=datetime('now','localtime')
    `).run(fecha, empleado || '', Math.round(efectivo_base) || 0, Math.round(nequi_base) || 0);
    return { ok: true };
  });

  ipcMain.handle('db:updateBaseCaja', (_, { fecha, efectivo_base, nequi_base }) => {
    const fila = db.prepare('SELECT id FROM base_caja WHERE fecha = ?').get(fecha);
    if (!fila) return { ok: false, error: 'No hay base registrada para esa fecha' };
    db.prepare(`
      UPDATE base_caja
      SET efectivo_base=?, nequi_base=?, registrado_at=datetime('now','localtime')
      WHERE fecha=?
    `).run(Math.round(efectivo_base) || 0, Math.round(nequi_base) || 0, fecha);
    return { ok: true };
  });

  ipcMain.handle('db:getHistorialBaseCaja', () => {
    return db.prepare(`
      SELECT * FROM base_caja ORDER BY fecha DESC LIMIT 30
    `).all();
  });

  // ── CAJA ──────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getCajaDia', (_, fecha) => {
    return db.prepare('SELECT * FROM caja WHERE fecha = ?').get(fecha);
  });

  ipcMain.handle('db:cerrarCaja', (_, datos) => {
    const { fecha, efectivo, nequi, gastos, empleado, notas, observacion_descuadre } = datos;

    const inicio = `${fecha} 00:00:00`;
    const fin    = `${fecha} 23:59:59`;
    const { total_ventas } = db.prepare(
      'SELECT COALESCE(SUM(total), 0) as total_ventas FROM ventas WHERE fecha BETWEEN ? AND ?'
    ).get(inicio, fin);

    const utilidad = total_ventas - gastos;

    // Base del día para calcular descuadre por método de pago
    const base       = db.prepare('SELECT * FROM base_caja WHERE fecha = ?').get(fecha);
    const baseEf     = base?.efectivo_base || 0;
    const baseNq     = base?.nequi_base    || 0;

    const ventasEf   = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='efectivo' THEN total            ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto'    THEN monto_efectivo_mixto ELSE 0 END), 0
      ) as v FROM ventas WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin).v;

    const ventasNq   = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='nequi' THEN total           ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto' THEN monto_nequi_mixto ELSE 0 END), 0
      ) as v FROM ventas WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin).v;

    const gastosEfDia = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='efectivo' THEN monto                         ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto'    THEN COALESCE(monto_efectivo_mixto,0) ELSE 0 END), 0
      ) as v FROM gastos WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin).v;

    const gastosNqDia = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='nequi' THEN monto                         ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto' THEN COALESCE(monto_nequi_mixto,0) ELSE 0 END), 0
      ) as v FROM gastos WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin).v;

    // Esperado = base + ventas del día - gastos del día (por método)
    const esperadoEf = baseEf + ventasEf - gastosEfDia;
    const esperadoNq = baseNq + ventasNq - gastosNqDia;

    // Descuadre total = diferencia efectivo + diferencia nequi
    const descuadre  = (efectivo - esperadoEf) + (nequi - esperadoNq);
    const cajaDia    = db.prepare('SELECT id FROM caja WHERE fecha = ?').get(fecha);

    if (cajaDia) {
      db.prepare(`
        UPDATE caja SET efectivo=?, nequi=?, total_ventas=?, gastos=?, utilidad=?,
        empleado=?, notas=?, descuadre=?, observacion_descuadre=?, cerrada=1 WHERE id=?
      `).run(efectivo, nequi, total_ventas, gastos, utilidad, empleado, notas || '',
             descuadre, observacion_descuadre || '', cajaDia.id);
    } else {
      db.prepare(`
        INSERT INTO caja (fecha, efectivo, nequi, total_ventas, gastos, utilidad,
          empleado, notas, descuadre, observacion_descuadre, cerrada)
        VALUES (?,?,?,?,?,?,?,?,?,?,1)
      `).run(fecha, efectivo, nequi, total_ventas, gastos, utilidad,
             empleado, notas || '', descuadre, observacion_descuadre || '');
    }

    // Sync automático post-cierre: subir los datos del día a Drive
    syncService.sincronizarPostCierre();

    return { ok: true, total_ventas, utilidad, descuadre };
  });

  ipcMain.handle('db:getHistorialCaja', () => {
    return db.prepare(`
      SELECT * FROM caja WHERE cerrada=1 ORDER BY fecha DESC LIMIT 30
    `).all();
  });

  // ── PROVEEDORES ───────────────────────────────────────────────────────────

  ipcMain.handle('db:getProveedores', () => {
    return db.prepare('SELECT * FROM proveedores WHERE activo=1 ORDER BY nombre').all();
  });

  ipcMain.handle('db:agregarProveedor', (_, datos) => {
    const { nombre, contacto_nombre, telefono, ingredientes, horario_entrega,
            dias_pedido, minimo_pedido, forma_pago, tiempo_entrega, notas } = datos;
    const r = db.prepare(`
      INSERT INTO proveedores
        (nombre, contacto_nombre, telefono, ingredientes, horario_entrega,
         dias_pedido, minimo_pedido, forma_pago, tiempo_entrega, notas)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(nombre, contacto_nombre||'', telefono||'',
           JSON.stringify(ingredientes||[]),
           horario_entrega||'', dias_pedido||'', minimo_pedido||'',
           forma_pago||'', tiempo_entrega||'', notas||'');
    return { ok: true, id: r.lastInsertRowid };
  });

  ipcMain.handle('db:updateProveedor', (_, id, datos) => {
    const { nombre, contacto_nombre, telefono, ingredientes, horario_entrega,
            dias_pedido, minimo_pedido, forma_pago, tiempo_entrega, notas } = datos;
    db.prepare(`
      UPDATE proveedores SET nombre=?, contacto_nombre=?, telefono=?,
        ingredientes=?, horario_entrega=?, dias_pedido=?, minimo_pedido=?,
        forma_pago=?, tiempo_entrega=?, notas=? WHERE id=?
    `).run(nombre, contacto_nombre||'', telefono||'',
           JSON.stringify(ingredientes||[]),
           horario_entrega||'', dias_pedido||'', minimo_pedido||'',
           forma_pago||'', tiempo_entrega||'', notas||'', id);
    return { ok: true };
  });

  ipcMain.handle('db:eliminarProveedor', (_, id) => {
    db.prepare('UPDATE proveedores SET activo=0 WHERE id=?').run(id);
    return { ok: true };
  });

  // ── COMPRAS ───────────────────────────────────────────────────────────────

  ipcMain.handle('db:registrarCompra', (_, datos) => {
    const { ingrediente_id, ingrediente_nombre, cantidad, precio_pagado,
            proveedor, empleado, metodo_pago,
            monto_efectivo_mixto = 0, monto_nequi_mixto = 0 } = datos;

    const transaccion = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO compras
          (ingrediente_id, ingrediente_nombre, cantidad, precio_pagado,
           proveedor, empleado, metodo_pago, monto_efectivo_mixto, monto_nequi_mixto)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ingrediente_id, ingrediente_nombre, cantidad,
        Math.round(precio_pagado || 0),
        proveedor || '', empleado || '',
        metodo_pago || 'efectivo',
        Math.round(monto_efectivo_mixto || 0), Math.round(monto_nequi_mixto || 0),
      );

      db.prepare('UPDATE ingredientes SET stock_actual = stock_actual + ? WHERE id = ?')
        .run(cantidad, ingrediente_id);

      return r.lastInsertRowid;
    });

    const id = transaccion();
    return { ok: true, id };
  });

  // Registrar múltiples ítems en una sola compra (Part 2 - formulario unificado)
  ipcMain.handle('db:registrarCompraMultiple', (_, datos) => {
    const { items, proveedor_id, proveedor_nombre, empleado,
            metodo_pago, numero_comprobante,
            monto_efectivo_mixto = 0, monto_nequi_mixto = 0 } = datos;
    // items = [{ ingrediente_id, ingrediente_nombre, cantidad, precio_unitario }]
    const totalGlobal = items.reduce((s, i) => s + Math.round((i.cantidad||0)*(i.precio_unitario||0)), 0);

    const t = db.transaction(() => {
      const ids = [];
      for (const item of items) {
        const itemTotal = Math.round((item.cantidad || 0) * (item.precio_unitario || 0));
        // Distribuir montos mixtos proporcionalmente por ítem
        const fraccion = totalGlobal > 0 ? itemTotal / totalGlobal : 0;
        const itemEfectivo = Math.round((monto_efectivo_mixto || 0) * fraccion);
        const itemNequi    = Math.round((monto_nequi_mixto    || 0) * fraccion);
        const r = db.prepare(`
          INSERT INTO compras
            (ingrediente_id, ingrediente_nombre, cantidad, precio_pagado,
             proveedor, empleado, metodo_pago, monto_efectivo_mixto, monto_nequi_mixto)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          item.ingrediente_id, item.ingrediente_nombre,
          item.cantidad, itemTotal,
          proveedor_nombre || '', empleado || '',
          metodo_pago || 'efectivo',
          itemEfectivo, itemNequi,
        );
        db.prepare('UPDATE ingredientes SET stock_actual = stock_actual + ? WHERE id = ?')
          .run(item.cantidad, item.ingrediente_id);
        ids.push(r.lastInsertRowid);
      }
      return ids;
    });

    const ids = t();
    return { ok: true, ids };
  });

  ipcMain.handle('db:getCompras', (_, { fechaInicio, fechaFin } = {}) => {
    if (fechaInicio && fechaFin) {
      return db.prepare(`
        SELECT * FROM compras WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC
      `).all(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`);
    }
    return db.prepare('SELECT * FROM compras ORDER BY fecha DESC LIMIT 200').all();
  });

  ipcMain.handle('db:getComprasDia', (_, fecha) => {
    const inicio = `${fecha} 00:00:00`;
    const fin    = `${fecha} 23:59:59`;
    const compras = db.prepare(
      'SELECT * FROM compras WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC'
    ).all(inicio, fin);
    const total = compras.reduce((s, c) => s + c.precio_pagado, 0);
    return { compras, total };
  });

  // ── CONFIGURACIÓN ─────────────────────────────────────────────────────────

  ipcMain.handle('db:getConfig', (_, clave) => {
    const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
    return row ? row.valor : null;
  });

  ipcMain.handle('db:setConfig', (_, clave, valor) => {
    db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor')
      .run(clave, String(valor));
    return { ok: true };
  });

  ipcMain.handle('db:getTodasConfig', () => {
    const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
    const cfg = {};
    for (const r of rows) cfg[r.clave] = r.valor;
    return cfg;
  });

  // ── FACTURAS / IMPRESIÓN ──────────────────────────────────────────────────

  ipcMain.handle('db:getNextFactura', () => {
    const actual = db.prepare("SELECT valor FROM configuracion WHERE clave='factura_consecutivo'").get();
    const inicio = db.prepare("SELECT valor FROM configuracion WHERE clave='factura_inicio'").get();
    let next;
    if (!actual || !actual.valor || actual.valor === '0') {
      next = parseInt(inicio?.valor || '1');
    } else {
      next = parseInt(actual.valor) + 1;
    }
    db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('factura_consecutivo',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor")
      .run(String(next));
    return next;
  });

  ipcMain.handle('db:imprimirRecibo', (_, datos) => {
    const cfgImpresora = db.prepare("SELECT valor FROM configuracion WHERE clave='impresora_nombre'").get();
    const cfgPuerto    = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_linux'").get();
    const cfgPuertoUsb = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_usb_win'").get();
    const cfgCajon     = db.prepare("SELECT valor FROM configuracion WHERE clave='cajon_activo'").get();
    const printerName  = datos.printerName || cfgImpresora?.valor || null;
    const puertoLinux  = cfgPuerto?.valor || '/dev/usb/lp0';
    const puertoUsb    = cfgPuertoUsb?.valor || 'USB001';

    const { ventaId, efectivo_recibido } = datos;
    const venta = db.prepare('SELECT * FROM ventas WHERE id=?').get(ventaId);
    if (!venta) return { ok: false, error: 'Venta no encontrada' };

    const detalles = db.prepare(`
      SELECT dv.cantidad, dv.precio_unitario, dv.nota, p.nombre, p.codigo
      FROM detalle_ventas dv JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
    `).all(ventaId);

    const subtotal = detalles.reduce((s, d) => s + d.precio_unitario * d.cantidad, 0);

    // Abrir cajón en el mismo buffer cuando el pago es en efectivo o mixto
    const cajonActivo = cfgCajon?.valor === '1';
    const pagaEfectivo = venta.metodo_pago === 'efectivo' || venta.metodo_pago === 'mixto';
    const incluirCajon = cajonActivo && pagaEfectivo;

    return imprimirRecibo({
      factura_num:          venta.factura_num,
      fecha:                venta.fecha,
      empleado:             venta.empleado,
      items:                detalles,
      subtotal,
      domicilio:            venta.domicilio || 0,
      total:                venta.total,
      metodo_pago:          venta.metodo_pago,
      monto_efectivo_mixto: venta.monto_efectivo_mixto,
      monto_nequi_mixto:    venta.monto_nequi_mixto,
      efectivo_recibido:    efectivo_recibido || venta.efectivo_recibido || 0,
      descuento_valor:      venta.descuento_valor || 0,
      descuento_nombre:     venta.descuento_nombre || '',
      mesa_nombre:          venta.mesa_nombre || '',
      printerName,
      puertoUsb,
      puertoLinux,
      incluirCajon,
    });
  });

  ipcMain.handle('db:asignarFactura', (_, ventaId, facturaNum, efectivoRecibido) => {
    db.prepare('UPDATE ventas SET factura_num=?, efectivo_recibido=? WHERE id=?')
      .run(facturaNum, efectivoRecibido || 0, ventaId);
    return { ok: true };
  });

  ipcMain.handle('db:getUltimaVenta', () => {
    return db.prepare('SELECT * FROM ventas ORDER BY id DESC LIMIT 1').get();
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────────

  ipcMain.handle('db:loginEmpleado', (_, { nombre, pin }) => {
    const hash = hashPin(pin);
    const emp  = db.prepare(
      'SELECT nombre, rol FROM empleados WHERE nombre=? AND pin_hash=? AND activo=1'
    ).get(nombre, hash);
    return { ok: !!emp, rol: emp?.rol || 'empleado' };
  });

  // ── EMPLEADOS (gestión completa, Part 6) ──────────────────────────────────

  ipcMain.handle('db:getEmpleados', () => {
    return db.prepare(
      'SELECT id, nombre, rol, activo, fecha_ingreso, notas, creado_en FROM empleados ORDER BY nombre'
    ).all();
  });

  ipcMain.handle('db:agregarEmpleado', (_, datos) => {
    const { nombre, pin, rol, fecha_ingreso, notas } = datos;
    const pin_hash = hashPin(String(pin));
    const r = db.prepare(`
      INSERT INTO empleados (nombre, pin_hash, rol, fecha_ingreso, notas)
      VALUES (?,?,?,?,?)
    `).run(nombre, pin_hash, rol || 'empleado', fecha_ingreso || '', notas || '');
    return { ok: true, id: r.lastInsertRowid };
  });

  ipcMain.handle('db:updateEmpleado', (_, id, datos) => {
    const { nombre, pin, rol, fecha_ingreso, notas } = datos;
    if (pin) {
      // Cambiar PIN incluido
      const pin_hash = hashPin(String(pin));
      db.prepare('UPDATE empleados SET nombre=?, pin_hash=?, rol=?, fecha_ingreso=?, notas=? WHERE id=?')
        .run(nombre, pin_hash, rol || 'empleado', fecha_ingreso || '', notas || '', id);
    } else {
      // Sin cambio de PIN
      db.prepare('UPDATE empleados SET nombre=?, rol=?, fecha_ingreso=?, notas=? WHERE id=?')
        .run(nombre, rol || 'empleado', fecha_ingreso || '', notas || '', id);
    }
    return { ok: true };
  });

  ipcMain.handle('db:toggleEmpleado', (_, id) => {
    db.prepare('UPDATE empleados SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run(id);
    return { ok: true };
  });

  // ── BAJAS ─────────────────────────────────────────────────────────────────

  ipcMain.handle('db:registrarBaja', (_, datos) => {
    const { ingrediente_id, ingrediente_nombre, cantidad, motivo, empleado, notas } = datos;
    const t = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO bajas (ingrediente_id, ingrediente_nombre, cantidad, motivo, empleado, notas)
        VALUES (?,?,?,?,?,?)
      `).run(ingrediente_id || null, ingrediente_nombre, cantidad, motivo || 'otro', empleado || '', notas || '');
      if (ingrediente_id) {
        db.prepare('UPDATE ingredientes SET stock_actual=MAX(0,stock_actual-?) WHERE id=?')
          .run(cantidad, ingrediente_id);
      }
      return r.lastInsertRowid;
    });
    return { ok: true, id: t() };
  });

  ipcMain.handle('db:getBajas', (_, { fechaInicio, fechaFin, motivo } = {}) => {
    let q = `SELECT b.*, i.unidad, i.costo_unitario FROM bajas b LEFT JOIN ingredientes i ON i.id=b.ingrediente_id`;
    const params = [];
    const conds  = [];
    if (fechaInicio && fechaFin) {
      conds.push('b.fecha BETWEEN ? AND ?');
      params.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`);
    }
    if (motivo && motivo !== 'todos') { conds.push('b.motivo=?'); params.push(motivo); }
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ' ORDER BY b.fecha DESC LIMIT 300';
    return db.prepare(q).all(...params);
  });

  // ── GASTOS ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:registrarGasto', (_, datos) => {
    const {
      descripcion, monto, categoria, metodo_pago, empleado, notas,
      numero_comprobante, proveedor_id, es_recurrente, frecuencia_recurrente,
      fecha, monto_efectivo_mixto = 0, monto_nequi_mixto = 0,
    } = datos;
    const fechaFinal = fecha || new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace('T', ' ');
    const r = db.prepare(`
      INSERT INTO gastos
        (fecha, descripcion, monto, categoria, metodo_pago, empleado, notas,
         numero_comprobante, proveedor_id, es_recurrente, frecuencia_recurrente,
         monto_efectivo_mixto, monto_nequi_mixto)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      fechaFinal,
      descripcion, Math.round(monto || 0),
      categoria || 'otro', metodo_pago || 'efectivo',
      empleado || '', notas || '',
      numero_comprobante || '', proveedor_id || null,
      es_recurrente ? 1 : 0, frecuencia_recurrente || '',
      Math.round(monto_efectivo_mixto || 0), Math.round(monto_nequi_mixto || 0),
    );
    return { ok: true, id: r.lastInsertRowid };
  });

  ipcMain.handle('db:getGastos', (_, { fechaInicio, fechaFin, categoria, metodo_pago } = {}) => {
    // Gastos propios
    const params1 = [], conds1 = [];
    if (fechaInicio && fechaFin) { conds1.push('fecha BETWEEN ? AND ?'); params1.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`); }
    if (categoria && categoria !== 'todos') { conds1.push('categoria=?'); params1.push(categoria); }
    if (metodo_pago && metodo_pago !== 'todos') { conds1.push('metodo_pago=?'); params1.push(metodo_pago); }
    const w1 = conds1.length ? 'WHERE ' + conds1.join(' AND ') : '';

    const gastos = db.prepare(`
      SELECT id, fecha, descripcion, monto, categoria, metodo_pago, empleado, notas,
             numero_comprobante, proveedor_id, es_recurrente, frecuencia_recurrente,
             COALESCE(monto_efectivo_mixto,0) as monto_efectivo_mixto,
             COALESCE(monto_nequi_mixto,0) as monto_nequi_mixto,
             'gasto' as tipo_registro
      FROM gastos ${w1} ORDER BY fecha DESC LIMIT 300
    `).all(...params1);

    // Compras como "insumos" cuando no hay filtro de categoría o se pide insumos
    if (!categoria || categoria === 'todos' || categoria === 'insumos') {
      const params2 = [], conds2 = [];
      if (fechaInicio && fechaFin) { conds2.push('fecha BETWEEN ? AND ?'); params2.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`); }
      if (metodo_pago && metodo_pago !== 'todos') { conds2.push('metodo_pago=?'); params2.push(metodo_pago); }
      const w2 = conds2.length ? 'WHERE ' + conds2.join(' AND ') : '';
      const compras = db.prepare(`
        SELECT id, fecha,
               (ingrediente_nombre || ' (' || CAST(cantidad AS TEXT) || ' ' || 'u)') as descripcion,
               precio_pagado as monto, 'insumos' as categoria,
               COALESCE(metodo_pago, 'efectivo') as metodo_pago,
               empleado, proveedor as notas,
               '' as numero_comprobante, NULL as proveedor_id,
               0 as es_recurrente, '' as frecuencia_recurrente,
               COALESCE(monto_efectivo_mixto,0) as monto_efectivo_mixto,
               COALESCE(monto_nequi_mixto,0) as monto_nequi_mixto,
               'compra' as tipo_registro
        FROM compras ${w2} ORDER BY fecha DESC LIMIT 300
      `).all(...params2);
      return [...gastos, ...compras].sort((a, b) => b.fecha.localeCompare(a.fecha));
    }
    return gastos;
  });

  ipcMain.handle('db:getGastosDia', (_, fecha) => {
    const inicio = `${fecha} 00:00:00`, fin = `${fecha} 23:59:59`;
    const gastos  = db.prepare('SELECT * FROM gastos WHERE fecha BETWEEN ? AND ?').all(inicio, fin);
    const compras = db.prepare('SELECT * FROM compras WHERE fecha BETWEEN ? AND ?').all(inicio, fin);
    const totalGastos  = gastos.reduce((s, g) => s + g.monto, 0);
    const totalCompras = compras.reduce((s, c) => s + c.precio_pagado, 0);
    return { gastos, compras, totalGastos, totalCompras, total: totalGastos + totalCompras };
  });

  ipcMain.handle('db:updateGasto', (_, id, datos) => {
    const {
      descripcion, monto, categoria, metodo_pago, notas,
      numero_comprobante, es_recurrente, frecuencia_recurrente,
    } = datos;
    db.prepare(`
      UPDATE gastos SET
        descripcion=?, monto=?, categoria=?, metodo_pago=?, notas=?,
        numero_comprobante=?, es_recurrente=?, frecuencia_recurrente=?
      WHERE id=?
    `).run(
      descripcion, Math.round(monto || 0), categoria, metodo_pago, notas || '',
      numero_comprobante || '', es_recurrente ? 1 : 0, frecuencia_recurrente || '',
      id,
    );
    return { ok: true };
  });

  ipcMain.handle('db:eliminarGasto', (_, id) => {
    db.prepare('DELETE FROM gastos WHERE id=?').run(id);
    return { ok: true };
  });

  // ── RENTABILIDAD ──────────────────────────────────────────────────────────

  ipcMain.handle('db:getRentabilidad', (_, { fechaInicio, fechaFin } = {}) => {
    const productos = db.prepare('SELECT * FROM productos WHERE activo=1 ORDER BY categoria, nombre').all();
    const result    = [];

    const inicio = fechaInicio ? `${fechaInicio} 00:00:00` : '2000-01-01 00:00:00';
    const fin    = fechaFin    ? `${fechaFin} 23:59:59`    : '2099-12-31 23:59:59';

    for (const prod of productos) {
      const receta = db.prepare(`
        SELECT r.cantidad, i.nombre as ing_nombre, i.costo_unitario
        FROM recetas r JOIN ingredientes i ON i.id=r.ingrediente_id
        WHERE r.producto_id=?
      `).all(prod.id);

      let costo = 0;
      let costoCompleto = receta.length > 0;
      for (const r of receta) {
        if (!r.costo_unitario) { costoCompleto = false; }
        costo += r.cantidad * (r.costo_unitario || 0);
      }
      costo = Math.round(costo);

      const ventas = db.prepare(`
        SELECT COALESCE(SUM(dv.cantidad),0) as unidades,
               COALESCE(SUM(dv.cantidad*dv.precio_unitario),0) as ingresos
        FROM detalle_ventas dv
        JOIN ventas v ON v.id=dv.venta_id
        WHERE dv.producto_id=? AND v.fecha BETWEEN ? AND ?
      `).get(prod.id, inicio, fin);

      // Margen $ = precio - costo, Margen % = (precio - costo) / precio × 100
      const margen_monto = prod.precio - costo;
      const margen_pct   = prod.precio > 0
        ? Math.round((margen_monto / prod.precio) * 1000) / 10
        : 0;
      const utilidad_total = Math.round(margen_monto * ventas.unidades);

      result.push({
        id: prod.id, nombre: prod.nombre, categoria: prod.categoria,
        codigo: prod.codigo || '', precio: prod.precio,
        costo, costoCompleto,
        margen_monto,
        margen_pct,
        // aliases para compatibilidad
        utilidad: margen_monto,
        margen: margen_pct,
        unidades: ventas.unidades,
        utilidad_total,
        ingresos: ventas.ingresos,
      });
    }
    // Ordenar: primero mayor utilidad total, luego margen negativo al final
    return result.sort((a, b) => b.utilidad_total - a.utilidad_total);
  });

  // ── TRANSFERENCIAS INTERNAS ───────────────────────────────────────────────

  ipcMain.handle('db:getTransferenciasInternas', (_, { fechaInicio, fechaFin } = {}) => {
    let q = 'SELECT * FROM transferencias_internas';
    const params = [];
    if (fechaInicio && fechaFin) {
      q += ' WHERE fecha BETWEEN ? AND ?';
      params.push(`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`);
    }
    q += ' ORDER BY fecha DESC';
    return db.prepare(q).all(...params);
  });

  // ── SALDO DISPONIBLE (Part 5) ──────────────────────────────────────────────

  ipcMain.handle('db:getSaldoDisponible', () => {
    // Efectivo: ventas efectivo - gastos efectivo - compras efectivo
    const ventasEfectivo = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='efectivo' THEN total            ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto'    THEN monto_efectivo_mixto ELSE 0 END), 0
      ) as total FROM ventas
    `).get().total;

    const gastosEfectivo = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='efectivo' THEN monto                    ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto'    THEN COALESCE(monto_efectivo_mixto,0) ELSE 0 END), 0
      ) as total FROM gastos
    `).get().total;

    const comprasEfectivo = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN COALESCE(metodo_pago,'efectivo')='efectivo' THEN precio_pagado             ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto'                         THEN COALESCE(monto_efectivo_mixto,0) ELSE 0 END), 0
      ) as total FROM compras
    `).get().total;

    // Nequi: ventas nequi - gastos nequi - compras nequi
    const ventasNequi = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='nequi' THEN total            ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto' THEN monto_nequi_mixto ELSE 0 END), 0
      ) as total FROM ventas
    `).get().total;

    const gastosNequi = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='nequi' THEN monto                    ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto' THEN COALESCE(monto_nequi_mixto,0) ELSE 0 END), 0
      ) as total FROM gastos
    `).get().total;

    const comprasNequi = db.prepare(`
      SELECT COALESCE(
        SUM(CASE WHEN metodo_pago='nequi' THEN precio_pagado             ELSE 0 END) +
        SUM(CASE WHEN metodo_pago='mixto' THEN COALESCE(monto_nequi_mixto,0) ELSE 0 END), 0
      ) as total FROM compras
    `).get().total;

    // Base de caja del día actual (si fue registrada)
    const hoy         = new Date().toISOString().split('T')[0];
    const baseHoy     = db.prepare('SELECT * FROM base_caja WHERE fecha = ?').get(hoy);
    const baseEfHoy   = baseHoy?.efectivo_base || 0;
    const baseNqHoy   = baseHoy?.nequi_base    || 0;

    const saldoEfectivo = baseEfHoy + ventasEfectivo - gastosEfectivo - comprasEfectivo;
    const saldoNequi    = baseNqHoy + ventasNequi    - gastosNequi    - comprasNequi;

    return {
      efectivo: saldoEfectivo,
      nequi:    saldoNequi,
      total:    saldoEfectivo + saldoNequi,
      baseEfectivo: baseEfHoy,
      baseNequi:    baseNqHoy,
      detalle: {
        ventasEfectivo, gastosEfectivo, comprasEfectivo,
        ventasNequi, gastosNequi, comprasNequi,
      },
    };
  });

  // ── LISTAR IMPRESORAS ─────────────────────────────────────────────────────

  ipcMain.handle('db:getPrinters', () => {
    try { return getPrinters(); } catch(e) { return []; }
  });

  // ── IMPRIMIR CIERRE ───────────────────────────────────────────────────────

  ipcMain.handle('db:imprimirCierreCaja', (_, { fecha }) => {
    const cajaDia = db.prepare('SELECT * FROM caja WHERE fecha=?').get(fecha);
    if (!cajaDia) return { ok: false, error: 'Cierre no encontrado' };
    const ventas  = db.prepare(`
      SELECT COUNT(*) as facturas,
             MIN(CASE WHEN factura_num>0 THEN factura_num END) as f_inicio,
             MAX(factura_num) as f_fin
      FROM ventas WHERE DATE(fecha)=?
    `).get(fecha);
    const cfgImpresora = db.prepare("SELECT valor FROM configuracion WHERE clave='impresora_nombre'").get();
    const cfgPuerto    = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_linux'").get();
    const cfgPuertoUsb = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_usb_win'").get();
    return imprimirCierre({
      ...cajaDia,
      facturas:    ventas?.facturas || 0,
      f_inicio:    ventas?.f_inicio,
      f_fin:       ventas?.f_fin,
      printerName: cfgImpresora?.valor   || null,
      puertoUsb:   cfgPuertoUsb?.valor   || 'USB001',
      puertoLinux: cfgPuerto?.valor      || '/dev/usb/lp0',
    });
  });

  ipcMain.handle('db:imprimirPrueba', (_, overrides = {}) => {
    const cfgImpresora = db.prepare("SELECT valor FROM configuracion WHERE clave='impresora_nombre'").get();
    const cfgPuerto    = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_linux'").get();
    const cfgPuertoUsb = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_usb_win'").get();
    return imprimirPrueba({
      printerName: overrides.printerName ?? cfgImpresora?.valor ?? null,
      puertoUsb:   overrides.puertoUsb   ?? cfgPuertoUsb?.valor ?? 'USB001',
      puertoLinux: overrides.puertoLinux ?? cfgPuerto?.valor    ?? '/dev/usb/lp0',
    });
  });

  ipcMain.handle('db:abrirCajon', () => {
    const cfgActivo    = db.prepare("SELECT valor FROM configuracion WHERE clave='cajon_activo'").get();
    if (cfgActivo?.valor !== '1') return { ok: false, motivo: 'desactivado' };
    const cfgPin       = db.prepare("SELECT valor FROM configuracion WHERE clave='cajon_pin'").get();
    const cfgImpresora = db.prepare("SELECT valor FROM configuracion WHERE clave='impresora_nombre'").get();
    const cfgPuerto    = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_linux'").get();
    const cfgPuertoUsb = db.prepare("SELECT valor FROM configuracion WHERE clave='puerto_usb_win'").get();
    return abrirCajon({
      pin:         cfgPin?.valor       || '2',
      printerName: cfgImpresora?.valor || null,
      puertoUsb:   cfgPuertoUsb?.valor || 'USB001',
      puertoLinux: cfgPuerto?.valor    || '/dev/usb/lp0',
    });
  });

  ipcMain.handle('db:getPrintersDetailed', () => {
    try { return getPrintersDetailed(); } catch(_) { return []; }
  });

  ipcMain.handle('db:getVentasDomicilios', (_, { fechaInicio, fechaFin }) => {
    const inicio = `${fechaInicio} 00:00:00`;
    const fin    = `${fechaFin} 23:59:59`;
    const resumen = db.prepare(`
      SELECT
        COUNT(CASE WHEN domicilio > 0 THEN 1 END) AS num_domicilios,
        COALESCE(SUM(CASE WHEN domicilio > 0 THEN domicilio ELSE 0 END), 0) AS total_domicilios,
        COALESCE(AVG(CASE WHEN domicilio > 0 THEN domicilio END), 0) AS promedio_domicilio
      FROM ventas WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin);
    const lista = db.prepare(`
      SELECT id, fecha, empleado, total, domicilio, metodo_pago, factura_num,
             COALESCE(plataforma_domicilio,'') as plataforma_domicilio,
             COALESCE(numero_orden_domicilio,'') as numero_orden_domicilio,
             COALESCE(comision_domicilio_pct,0) as comision_domicilio_pct,
             COALESCE(comision_domicilio_valor,0) as comision_domicilio_valor
      FROM ventas WHERE domicilio > 0 AND fecha BETWEEN ? AND ?
      ORDER BY fecha DESC
    `).all(inicio, fin);
    return { resumen, lista };
  });

  // ── PREPARACIONES BATCH ───────────────────────────────────────────────────

  ipcMain.handle('db:getBatchTipos', () => {
    const tipos = db.prepare('SELECT * FROM batch_tipos').all();
    for (const tipo of tipos) {
      tipo.receta = db.prepare(`
        SELECT br.*, i.nombre as ingrediente_nombre, i.unidad, i.stock_actual
        FROM batch_recetas br
        JOIN ingredientes i ON i.id = br.ingrediente_id
        WHERE br.batch_tipo_id = ?
      `).all(tipo.id);
    }
    return tipos;
  });

  ipcMain.handle('db:getPreparaciones', () => {
    return db.prepare(`
      SELECT pb.*, i.nombre as ingrediente_nombre
      FROM preparaciones_batch pb
      LEFT JOIN ingredientes i ON i.id = pb.ingrediente_id
      ORDER BY pb.fecha_preparacion DESC
      LIMIT 50
    `).all();
  });

  ipcMain.handle('db:crearPreparacion', (_, datos) => {
    const { batchTipoId, cantidad, empleado } = datos;

    const tipo = db.prepare('SELECT * FROM batch_tipos WHERE id=?').get(batchTipoId);
    if (!tipo) return { ok: false, error: 'Tipo de batch no encontrado' };

    const receta = db.prepare('SELECT * FROM batch_recetas WHERE batch_tipo_id=?').all(batchTipoId);

    const transaccion = db.transaction(() => {
      for (const r of receta) {
        db.prepare(
          'UPDATE ingredientes SET stock_actual = MAX(0, stock_actual - ?) WHERE id=?'
        ).run(r.cantidad * cantidad, r.ingrediente_id);
      }

      if (tipo.ingrediente_resultado_id) {
        db.prepare(
          "UPDATE ingredientes SET stock_actual = stock_actual + ?, fecha_preparacion = datetime('now','localtime') WHERE id=?"
        ).run(cantidad, tipo.ingrediente_resultado_id);
      }

      const ahora = new Date();
      const vence = new Date(ahora.getTime() + tipo.duracion_dias * 24 * 60 * 60 * 1000);
      const fechaVenc = vence.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO preparaciones_batch
          (tipo_nombre, ingrediente_id, fecha_vencimiento, cantidad, empleado)
        VALUES (?, ?, ?, ?, ?)
      `).run(tipo.nombre, tipo.ingrediente_resultado_id, fechaVenc, cantidad, empleado || '');
    });

    try {
      transaccion();
      return { ok: true };
    } catch (err) {
      console.error('[DB] crearPreparacion error:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── SINCRONIZACIÓN CON GOOGLE DRIVE ─────────────────────────────────────────

  ipcMain.handle('sync:getEstado', () => {
    return syncService.getEstado();
  });

  ipcMain.handle('sync:sincronizarAhora', () => {
    return syncService.sincronizarAhora({ origen: 'manual' });
  });

  ipcMain.handle('sync:subirAhora', () => {
    return syncService.subirAhora();
  });

  ipcMain.handle('sync:bajarAhora', () => {
    return syncService.bajarAhora();
  });

  // Guardar clientId y clientSecret en disco — se llama en el Paso 2 del wizard
  ipcMain.handle('sync:guardarCredencialesParciales', (_, { clientId, clientSecret }) => {
    try {
      syncService.guardarCredencialesParciales(clientId, clientSecret);
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: err.message };
    }
  });

  // Paso 3 del wizard: abre el navegador y espera la respuesta en servidor local.
  // Lee credentials.json directamente aquí para garantizar que el main process
  // use siempre los valores actuales del archivo, sin depender de caché de módulo.
  ipcMain.handle('sync:iniciarOAuth', async () => {
    const os   = require('os');
    const path = require('path');
    const fs   = require('fs');

    const credPath = path.join(os.homedir(), '.perros-americanos', 'credentials.json');
    let creds;
    try {
      creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch (err) {
      return { ok: false, msg: `No se pudo leer credentials.json: ${err.message}` };
    }

    console.log('[OAuth] Client ID leído:', creds.client_id ? 'OK' : 'VACÍO');
    console.log('[OAuth] Client Secret leído:', creds.client_secret ? 'OK' : 'VACÍO');

    if (!creds.client_id || !creds.client_secret) {
      return { ok: false, msg: 'Client ID o Client Secret vacíos en credentials.json. Repite el Paso 2.' };
    }

    return syncService.iniciarOAuth(creds.client_id, creds.client_secret);
  });

  ipcMain.handle('sync:desconectar', () => {
    syncService.desconectarCuenta();
    return { ok: true };
  });

  ipcMain.handle('sync:configurarAuto', (_, { activo, intervaloMinutos }) => {
    syncService.configurarAutoSync({ activo, intervaloMinutos });
    return { ok: true };
  });

  // Reiniciar la app (usado tras "Bajar datos de Drive" para cargar la nueva DB)
  ipcMain.handle('app:reiniciar', () => {
    app.relaunch();
    app.exit(0);
  });

  // Versión real de la app desde Electron (no el string hardcodeado del renderer)
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // ── DESCUENTOS ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getDescuentos', () => {
    return db.prepare('SELECT * FROM descuentos ORDER BY nombre').all();
  });

  // Devuelve solo los descuentos válidos en el momento actual (para aplicar en POS)
  ipcMain.handle('db:getDescuentosActivos', () => {
    const todos = db.prepare('SELECT * FROM descuentos WHERE activo = 1').all();
    const ahora = new Date();
    const diaSemana = ahora.getDay(); // 0=domingo ... 6=sábado
    const horaActual = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    const fechaHoy = ahora.toISOString().split('T')[0];

    return todos.filter(d => {
      // Verificar rango de fechas si está definido
      if (d.fecha_inicio && fechaHoy < d.fecha_inicio) return false;
      if (d.fecha_fin   && fechaHoy > d.fecha_fin)    return false;

      // Verificar días de semana si está definido
      if (d.dias_semana && d.dias_semana.trim() !== '') {
        try {
          const dias = JSON.parse(d.dias_semana);
          if (Array.isArray(dias) && dias.length > 0 && !dias.includes(diaSemana)) return false;
        } catch(_) {}
      }

      // Verificar horario si está definido
      if (d.hora_inicio && d.hora_fin && d.hora_inicio !== '' && d.hora_fin !== '') {
        if (horaActual < d.hora_inicio || horaActual >= d.hora_fin) return false;
      }

      return true;
    });
  });

  ipcMain.handle('db:agregarDescuento', (_, datos) => {
    const { nombre, tipo, valor, descripcion, activo, fecha_inicio, fecha_fin,
            aplica_a, dias_semana, hora_inicio, hora_fin } = datos;
    const r = db.prepare(`
      INSERT INTO descuentos
        (nombre, tipo, valor, descripcion, activo, fecha_inicio, fecha_fin,
         aplica_a, dias_semana, hora_inicio, hora_fin)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      nombre, tipo || 'porcentaje', parseFloat(valor) || 0,
      descripcion || '', activo !== undefined ? (activo ? 1 : 0) : 1,
      fecha_inicio || null, fecha_fin || null,
      aplica_a || 'total',
      dias_semana ? JSON.stringify(dias_semana) : '',
      hora_inicio || '', hora_fin || '',
    );
    return { ok: true, id: r.lastInsertRowid };
  });

  ipcMain.handle('db:updateDescuento', (_, id, datos) => {
    const { nombre, tipo, valor, descripcion, activo, fecha_inicio, fecha_fin,
            aplica_a, dias_semana, hora_inicio, hora_fin } = datos;
    db.prepare(`
      UPDATE descuentos SET
        nombre=?, tipo=?, valor=?, descripcion=?, activo=?,
        fecha_inicio=?, fecha_fin=?, aplica_a=?,
        dias_semana=?, hora_inicio=?, hora_fin=?
      WHERE id=?
    `).run(
      nombre, tipo || 'porcentaje', parseFloat(valor) || 0,
      descripcion || '', activo ? 1 : 0,
      fecha_inicio || null, fecha_fin || null,
      aplica_a || 'total',
      dias_semana ? JSON.stringify(dias_semana) : '',
      hora_inicio || '', hora_fin || '', id,
    );
    return { ok: true };
  });

  ipcMain.handle('db:toggleDescuento', (_, id) => {
    db.prepare('UPDATE descuentos SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run(id);
    return { ok: true };
  });

  ipcMain.handle('db:eliminarDescuento', (_, id) => {
    db.prepare('DELETE FROM descuentos WHERE id=?').run(id);
    return { ok: true };
  });

  // ── MESAS ─────────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getMesas', () => {
    const mesas = db.prepare('SELECT * FROM mesas WHERE activo=1 ORDER BY numero').all();
    // Solo marcar "activo" si la mesa tiene ítems reales (total > 0)
    // Una fila vacía o con items=[] no cuenta como pedido activo
    const pendientes = db.prepare('SELECT mesa_id, items FROM pedidos_pendientes').all();
    const mapPend = {};
    for (const p of pendientes) {
      try {
        const items = JSON.parse(p.items || '[]');
        if (items.length === 0) continue; // ignorar filas vacías
        const total = items.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 0), 0);
        if (total > 0) mapPend[p.mesa_id] = total;
      } catch(_) {}
    }
    return mesas.map(m => ({
      ...m,
      estado:        mapPend[m.id] !== undefined ? 'activo' : 'libre',
      total_parcial: mapPend[m.id] || 0,
    }));
  });

  ipcMain.handle('db:agregarMesa', (_, datos) => {
    const { numero, nombre } = datos;
    const r = db.prepare('INSERT INTO mesas (numero, nombre) VALUES (?,?)').run(numero, nombre || `Mesa ${numero}`);
    return { ok: true, id: r.lastInsertRowid };
  });

  ipcMain.handle('db:updateMesa', (_, id, datos) => {
    const { nombre } = datos;
    db.prepare('UPDATE mesas SET nombre=? WHERE id=?').run(nombre, id);
    return { ok: true };
  });

  ipcMain.handle('db:toggleMesa', (_, id) => {
    db.prepare('UPDATE mesas SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=?').run(id);
    return { ok: true };
  });

  // Guardar carrito en curso para una mesa
  ipcMain.handle('db:guardarPedidoPendiente', (_, { mesa_id, mesa_nombre, empleado, items }) => {
    const existe = db.prepare('SELECT id FROM pedidos_pendientes WHERE mesa_id=?').get(mesa_id);
    if (existe) {
      db.prepare(`
        UPDATE pedidos_pendientes
        SET mesa_nombre=?, empleado=?, items=?, actualizado_en=datetime('now','localtime')
        WHERE mesa_id=?
      `).run(mesa_nombre || '', empleado || '', JSON.stringify(items || []), mesa_id);
    } else {
      db.prepare(`
        INSERT INTO pedidos_pendientes (mesa_id, mesa_nombre, empleado, items)
        VALUES (?,?,?,?)
      `).run(mesa_id, mesa_nombre || '', empleado || '', JSON.stringify(items || []));
    }
    return { ok: true };
  });

  // Obtener carrito guardado de una mesa
  ipcMain.handle('db:getPedidoPendiente', (_, mesa_id) => {
    const row = db.prepare('SELECT * FROM pedidos_pendientes WHERE mesa_id=?').get(mesa_id);
    if (!row) return null;
    try { row.items = JSON.parse(row.items || '[]'); } catch(_) { row.items = []; }
    return row;
  });

  // Eliminar pedido pendiente (al cancelar o vaciar mesa)
  ipcMain.handle('db:eliminarPedidoPendiente', (_, mesa_id) => {
    db.prepare('DELETE FROM pedidos_pendientes WHERE mesa_id=?').run(mesa_id);
    return { ok: true };
  });

  // ── DESCUENTOS EN REPORTES ────────────────────────────────────────────────────

  ipcMain.handle('db:getReporteDescuentos', (_, { fechaInicio, fechaFin }) => {
    const inicio = `${fechaInicio} 00:00:00`;
    const fin    = `${fechaFin} 23:59:59`;

    // Total descontado por período
    const resumen = db.prepare(`
      SELECT
        COUNT(CASE WHEN descuento_valor > 0 THEN 1 END) as ventas_con_descuento,
        COALESCE(SUM(descuento_valor), 0) as total_descontado,
        COALESCE(AVG(CASE WHEN descuento_valor > 0 THEN descuento_valor END), 0) as promedio_descuento
      FROM ventas WHERE fecha BETWEEN ? AND ?
    `).get(inicio, fin);

    // Desglose por nombre de descuento
    const porDescuento = db.prepare(`
      SELECT descuento_nombre,
             COUNT(*) as usos,
             COALESCE(SUM(descuento_valor), 0) as total_descontado
      FROM ventas
      WHERE descuento_valor > 0 AND fecha BETWEEN ? AND ?
      GROUP BY descuento_nombre
      ORDER BY total_descontado DESC
    `).all(inicio, fin);

    return { resumen, porDescuento };
  });

  // ── DOMICILIOS EXTERNOS EN REPORTES ──────────────────────────────────────────

  ipcMain.handle('db:getReporteDomiciliosExternos', (_, { fechaInicio, fechaFin }) => {
    const inicio = `${fechaInicio} 00:00:00`;
    const fin    = `${fechaFin} 23:59:59`;

    // Pedidos con plataforma externa
    const externos = db.prepare(`
      SELECT plataforma_domicilio, numero_orden_domicilio,
             total, comision_domicilio_pct, comision_domicilio_valor,
             (total - comision_domicilio_valor) as valor_neto,
             fecha, factura_num
      FROM ventas
      WHERE plataforma_domicilio != '' AND fecha BETWEEN ? AND ?
      ORDER BY fecha DESC
    `).all(inicio, fin);

    // Resumen por plataforma
    const porPlataforma = db.prepare(`
      SELECT plataforma_domicilio,
             COUNT(*) as pedidos,
             COALESCE(SUM(total), 0) as total_bruto,
             COALESCE(SUM(comision_domicilio_valor), 0) as total_comisiones,
             COALESCE(SUM(total - comision_domicilio_valor), 0) as ingreso_neto
      FROM ventas
      WHERE plataforma_domicilio != '' AND fecha BETWEEN ? AND ?
      GROUP BY plataforma_domicilio
      ORDER BY total_bruto DESC
    `).all(inicio, fin);

    // Domicilios propios (sin plataforma externa)
    const propios = db.prepare(`
      SELECT COUNT(*) as pedidos,
             COALESCE(SUM(domicilio), 0) as total_domicilios,
             COALESCE(SUM(total), 0) as total_ventas
      FROM ventas
      WHERE domicilio > 0 AND (plataforma_domicilio = '' OR plataforma_domicilio IS NULL)
        AND fecha BETWEEN ? AND ?
    `).get(inicio, fin);

    return { externos, porPlataforma, propios };
  });

  // ── EXPORTACIÓN A EXCEL ───────────────────────────────────────────────────

  // Formato monetario colombiano: 155000 → "$155.500"
  function fmtCO(n) {
    const num = Math.round(n || 0);
    return '$' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Fecha DD/MM/YYYY
  function fmtFecha(s) {
    if (!s) return '';
    const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  // Crea un .xlsx en ~/Documentos/PerrosAmericanos/ y devuelve la ruta.
  // hojas: [{ nombre, datos, columnas, anchosFijos? }]
  function crearExcel(hojas, nombreArchivo) {
    const XLSX   = require('xlsx');
    const path   = require('path');
    const fs     = require('fs');
    const carpeta = path.join(app.getPath('documents'), 'PerrosAmericanos');
    if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
    const ruta = path.join(carpeta, nombreArchivo);
    const wb   = XLSX.utils.book_new();
    for (const { nombre, datos, columnas, anchosFijos } of hojas) {
      const ws = XLSX.utils.json_to_sheet(datos, { header: columnas });
      ws['!cols'] = columnas.map((col, i) => ({
        wch: anchosFijos?.[i] ?? Math.max(String(col).length + 2, 14),
      }));
      XLSX.utils.book_append_sheet(wb, ws, nombre);
    }
    XLSX.writeFile(wb, ruta);
    return ruta;
  }

  // ── Exportar Rentabilidad ─────────────────────────────────────────────────
  ipcMain.handle('db:exportarRentabilidad', () => {
    try {
      const productos = db.prepare('SELECT * FROM productos WHERE activo=1 ORDER BY categoria, nombre').all();
      const filas = [];
      let sumUnidades = 0, sumUtilidad = 0;

      for (const prod of productos) {
        const receta = db.prepare(`
          SELECT r.cantidad, i.costo_unitario
          FROM recetas r JOIN ingredientes i ON i.id=r.ingrediente_id
          WHERE r.producto_id=?
        `).all(prod.id);

        let costo = 0, costoCompleto = receta.length > 0;
        for (const r of receta) {
          if (!r.costo_unitario) costoCompleto = false;
          costo += r.cantidad * (r.costo_unitario || 0);
        }
        costo = Math.round(costo);

        const vv = db.prepare(`
          SELECT COALESCE(SUM(dv.cantidad),0) as unidades
          FROM detalle_ventas dv JOIN ventas v ON v.id=dv.venta_id
          WHERE dv.producto_id=?
        `).get(prod.id);

        const margenMonto = prod.precio - costo;
        const margenPct   = prod.precio > 0
          ? Math.round((margenMonto / prod.precio) * 1000) / 10 : 0;
        const utilTotal   = Math.round(margenMonto * vv.unidades);

        const estado = !costoCompleto ? 'Sin datos'
          : margenPct >= 50 ? 'Bueno'
          : margenPct >= 30 ? 'Regular'
          : margenPct >= 0  ? 'Bajo'
          : 'Negativo';

        filas.push({
          'Código':               prod.codigo || '',
          'Producto':             prod.nombre,
          'Precio venta ($)':     fmtCO(prod.precio),
          'Costo ingredientes ($)': costoCompleto ? fmtCO(costo)      : 'Sin datos',
          'Utilidad x unidad ($)':  costoCompleto ? fmtCO(margenMonto): 'Sin datos',
          'Margen %':               costoCompleto ? `${margenPct}%`    : 'Sin datos',
          'Unidades vendidas':      vv.unidades,
          'Utilidad total ($)':     costoCompleto ? fmtCO(utilTotal)   : 'Sin datos',
          'Estado':                 estado,
        });
        sumUnidades  += vv.unidades;
        if (costoCompleto) sumUtilidad += utilTotal;
      }

      filas.push({
        'Código': '', 'Producto': 'TOTALES',
        'Precio venta ($)': '', 'Costo ingredientes ($)': '',
        'Utilidad x unidad ($)': '', 'Margen %': '',
        'Unidades vendidas': sumUnidades,
        'Utilidad total ($)': fmtCO(sumUtilidad),
        'Estado': '',
      });

      const columnas = [
        'Código','Producto','Precio venta ($)','Costo ingredientes ($)',
        'Utilidad x unidad ($)','Margen %','Unidades vendidas',
        'Utilidad total ($)','Estado',
      ];
      const hoyTag = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const ruta = crearExcel([{ nombre: 'Rentabilidad', datos: filas, columnas }],
        `Rentabilidad_${hoyTag}.xlsx`);
      return { ok: true, path: ruta };
    } catch (err) {
      console.error('[Excel] exportarRentabilidad:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Exportar Cierres de Caja ──────────────────────────────────────────────
  ipcMain.handle('db:exportarCierresCaja', () => {
    try {
      const cierres = db.prepare(
        'SELECT * FROM caja WHERE cerrada=1 ORDER BY fecha DESC LIMIT 90'
      ).all();
      const filas = [];
      let sumVentas = 0, sumEf = 0, sumNq = 0, sumGastos = 0, sumUtil = 0;

      for (const c of cierres) {
        const ini = `${c.fecha} 00:00:00`, fin = `${c.fecha} 23:59:59`;

        const vEf = db.prepare(`
          SELECT COALESCE(
            SUM(CASE WHEN metodo_pago='efectivo' THEN total ELSE 0 END)+
            SUM(CASE WHEN metodo_pago='mixto' THEN monto_efectivo_mixto ELSE 0 END),0) as v
          FROM ventas WHERE fecha BETWEEN ? AND ?
        `).get(ini, fin).v;

        const vNq = db.prepare(`
          SELECT COALESCE(
            SUM(CASE WHEN metodo_pago='nequi' THEN total ELSE 0 END)+
            SUM(CASE WHEN metodo_pago='mixto' THEN monto_nequi_mixto ELSE 0 END),0) as v
          FROM ventas WHERE fecha BETWEEN ? AND ?
        `).get(ini, fin).v;

        const gEf = db.prepare(`
          SELECT COALESCE(
            SUM(CASE WHEN metodo_pago='efectivo' THEN monto ELSE 0 END)+
            SUM(CASE WHEN metodo_pago='mixto' THEN COALESCE(monto_efectivo_mixto,0) ELSE 0 END),0) as v
          FROM gastos WHERE fecha BETWEEN ? AND ?
        `).get(ini, fin).v;

        const gNq = db.prepare(`
          SELECT COALESCE(
            SUM(CASE WHEN metodo_pago='nequi' THEN monto ELSE 0 END)+
            SUM(CASE WHEN metodo_pago='mixto' THEN COALESCE(monto_nequi_mixto,0) ELSE 0 END),0) as v
          FROM gastos WHERE fecha BETWEEN ? AND ?
        `).get(ini, fin).v;

        const facts = db.prepare(`
          SELECT COUNT(*) as total,
                 MIN(CASE WHEN factura_num>0 THEN factura_num END) as fi,
                 MAX(factura_num) as ff
          FROM ventas WHERE DATE(fecha)=?
        `).get(c.fecha);
        const factRango = facts.total > 0 && facts.fi
          ? `${facts.fi} - ${facts.ff}` : facts.total > 0 ? `${facts.total} ventas` : '—';

        filas.push({
          'Fecha':               fmtFecha(c.fecha),
          'Empleado':            c.empleado || '',
          'Total ventas ($)':    fmtCO(c.total_ventas),
          'Ventas efectivo ($)': fmtCO(vEf),
          'Ventas Nequi ($)':    fmtCO(vNq),
          'Total gastos ($)':    fmtCO(c.gastos),
          'Gastos efectivo ($)': fmtCO(gEf),
          'Gastos Nequi ($)':    fmtCO(gNq),
          'Utilidad neta ($)':   fmtCO(c.utilidad),
          'Descuadre ($)':       c.descuadre === 0 ? '$0' : fmtCO(c.descuadre),
          'Facturas':            factRango,
          'Observaciones':       c.observacion_descuadre || c.notas || '',
        });
        sumVentas += c.total_ventas || 0;
        sumEf     += vEf;
        sumNq     += vNq;
        sumGastos += c.gastos || 0;
        sumUtil   += c.utilidad || 0;
      }

      filas.push({
        'Fecha': 'TOTALES', 'Empleado': '',
        'Total ventas ($)':    fmtCO(sumVentas),
        'Ventas efectivo ($)': fmtCO(sumEf),
        'Ventas Nequi ($)':    fmtCO(sumNq),
        'Total gastos ($)':    fmtCO(sumGastos),
        'Gastos efectivo ($)': '', 'Gastos Nequi ($)': '',
        'Utilidad neta ($)':   fmtCO(sumUtil),
        'Descuadre ($)': '', 'Facturas': '', 'Observaciones': '',
      });

      const columnas = [
        'Fecha','Empleado','Total ventas ($)','Ventas efectivo ($)',
        'Ventas Nequi ($)','Total gastos ($)','Gastos efectivo ($)',
        'Gastos Nequi ($)','Utilidad neta ($)','Descuadre ($)',
        'Facturas','Observaciones',
      ];
      const hoyTag = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const ruta = crearExcel([{ nombre: 'Cierres', datos: filas, columnas }],
        `Cierres_Caja_${hoyTag}.xlsx`);
      return { ok: true, path: ruta };
    } catch (err) {
      console.error('[Excel] exportarCierresCaja:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Exportar Inventario (dos hojas) ──────────────────────────────────────
  ipcMain.handle('db:exportarInventario', () => {
    try {
      // Hoja 1: Estado actual de ingredientes
      const ingredientes = db.prepare(`
        SELECT i.*, COALESCE(p.nombre,'—') as proveedor_nombre
        FROM ingredientes i LEFT JOIN proveedores p ON p.id=i.proveedor_id
        WHERE i.activo=1 ORDER BY i.categoria, i.nombre
      `).all();

      const estadoIng = (i) => {
        if (i.stock_actual === 0)                                              return 'Sin stock';
        if (i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo)           return 'Urgente';
        if (i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo * 1.5)     return 'Riesgo';
        return 'OK';
      };

      const hoja1 = ingredientes.map(i => ({
        'Ingrediente':         i.nombre,
        'Categoría':           i.categoria,
        'Stock actual':        i.stock_actual,
        'Unidad':              i.unidad,
        'Stock mínimo':        i.stock_minimo,
        'Estado':              estadoIng(i),
        'Costo unitario ($)':  fmtCO(i.costo_unitario),
        'Valor en stock ($)':  fmtCO((i.stock_actual || 0) * (i.costo_unitario || 0)),
        'Proveedor':           i.proveedor_nombre,
      }));

      // Hoja 2: Bajas registradas
      const bajas = db.prepare(`
        SELECT b.fecha, b.ingrediente_nombre, b.cantidad, b.motivo, b.empleado,
               COALESCE(i.costo_unitario, 0) as cu
        FROM bajas b LEFT JOIN ingredientes i ON i.id=b.ingrediente_id
        ORDER BY b.fecha DESC LIMIT 300
      `).all();

      const hoja2 = bajas.map(b => ({
        'Fecha':               fmtFecha(b.fecha),
        'Ingrediente':         b.ingrediente_nombre,
        'Cantidad':            b.cantidad,
        'Motivo':              b.motivo || '',
        'Empleado':            b.empleado || '',
        'Costo estimado ($)':  fmtCO(b.cantidad * b.cu),
      }));

      const cols1 = [
        'Ingrediente','Categoría','Stock actual','Unidad','Stock mínimo',
        'Estado','Costo unitario ($)','Valor en stock ($)','Proveedor',
      ];
      const cols2 = ['Fecha','Ingrediente','Cantidad','Motivo','Empleado','Costo estimado ($)'];

      const hoyTag = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const ruta = crearExcel([
        { nombre: 'Estado actual', datos: hoja1, columnas: cols1 },
        { nombre: 'Bajas',         datos: hoja2, columnas: cols2 },
      ], `Inventario_${hoyTag}.xlsx`);
      return { ok: true, path: ruta };
    } catch (err) {
      console.error('[Excel] exportarInventario:', err);
      return { ok: false, error: err.message };
    }
  });

  // ── Abrir archivo en el explorador del SO ────────────────────────────────
  ipcMain.handle('app:abrirArchivo', (_, ruta) => {
    shell.openPath(ruta);
    return { ok: true };
  });
}

module.exports = { setupIpcHandlers };

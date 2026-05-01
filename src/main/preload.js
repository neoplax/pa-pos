// Preload - puente seguro entre renderer y main process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Productos ──────────────────────────────────────────────
  getProductos:       ()          => ipcRenderer.invoke('db:getProductos'),
  updateProducto:     (id, datos) => ipcRenderer.invoke('db:updateProducto', id, datos),
  agregarProducto:    (datos)     => ipcRenderer.invoke('db:agregarProducto', datos),
  toggleProducto:     (id)        => ipcRenderer.invoke('db:toggleProducto', id),

  // ── Recetas ────────────────────────────────────────────────
  getRecetaProducto:    (productoId)        => ipcRenderer.invoke('db:getRecetaProducto', productoId),
  updateRecetaProducto: (productoId, items) => ipcRenderer.invoke('db:updateRecetaProducto', productoId, items),

  // ── Ingredientes ───────────────────────────────────────────
  getIngredientes:       ()          => ipcRenderer.invoke('db:getIngredientes'),
  updateStock:           (id, qty)   => ipcRenderer.invoke('db:updateStock', id, qty),
  updateIngrediente:     (id, datos) => ipcRenderer.invoke('db:updateIngrediente', id, datos),
  updateIngredienteFull: (id, datos) => ipcRenderer.invoke('db:updateIngredienteFull', id, datos),
  agregarIngrediente:    (datos)     => ipcRenderer.invoke('db:agregarIngrediente', datos),

  // ── Ventas ─────────────────────────────────────────────────
  crearVenta:           (datos)   => ipcRenderer.invoke('db:crearVenta', datos),
  getVentasDia:         (fecha)   => ipcRenderer.invoke('db:getVentasDia', fecha),
  getVentasPorHora:     (fecha)   => ipcRenderer.invoke('db:getVentasPorHora', fecha),
  getVentasRango:       (filtros) => ipcRenderer.invoke('db:getVentasRango', filtros),
  getVentasPorProducto: (filtros) => ipcRenderer.invoke('db:getVentasPorProducto', filtros),
  getVentasPorDia:      (dias)    => ipcRenderer.invoke('db:getVentasPorDia', dias),

  // ── Caja ───────────────────────────────────────────────────
  getCajaDia:      (fecha)  => ipcRenderer.invoke('db:getCajaDia', fecha),
  cerrarCaja:      (datos)  => ipcRenderer.invoke('db:cerrarCaja', datos),
  getHistorialCaja: ()      => ipcRenderer.invoke('db:getHistorialCaja'),

  // ── Base de caja ───────────────────────────────────────────
  getBaseCaja:          (fecha)  => ipcRenderer.invoke('db:getBaseCaja', fecha),
  registrarBaseCaja:    (datos)  => ipcRenderer.invoke('db:registrarBaseCaja', datos),
  updateBaseCaja:       (datos)  => ipcRenderer.invoke('db:updateBaseCaja', datos),
  getHistorialBaseCaja: ()       => ipcRenderer.invoke('db:getHistorialBaseCaja'),

  // ── Preparaciones batch ────────────────────────────────────
  getPreparaciones: ()      => ipcRenderer.invoke('db:getPreparaciones'),
  crearPreparacion: (datos) => ipcRenderer.invoke('db:crearPreparacion', datos),
  getBatchTipos:    ()      => ipcRenderer.invoke('db:getBatchTipos'),

  // ── Compras ────────────────────────────────────────────────
  registrarCompra:         (datos)   => ipcRenderer.invoke('db:registrarCompra', datos),
  registrarCompraMultiple: (datos)   => ipcRenderer.invoke('db:registrarCompraMultiple', datos),
  getCompras:              (filtros) => ipcRenderer.invoke('db:getCompras', filtros),
  getComprasDia:           (fecha)   => ipcRenderer.invoke('db:getComprasDia', fecha),

  // ── Proveedores ────────────────────────────────────────────
  getProveedores:    ()          => ipcRenderer.invoke('db:getProveedores'),
  agregarProveedor:  (datos)     => ipcRenderer.invoke('db:agregarProveedor', datos),
  updateProveedor:   (id, datos) => ipcRenderer.invoke('db:updateProveedor', id, datos),
  eliminarProveedor: (id)        => ipcRenderer.invoke('db:eliminarProveedor', id),

  // ── Login ──────────────────────────────────────────────────
  loginEmpleado: (datos) => ipcRenderer.invoke('db:loginEmpleado', datos),

  // ── Empleados (gestión) ────────────────────────────────────
  getEmpleados:    ()          => ipcRenderer.invoke('db:getEmpleados'),
  agregarEmpleado: (datos)     => ipcRenderer.invoke('db:agregarEmpleado', datos),
  updateEmpleado:  (id, datos) => ipcRenderer.invoke('db:updateEmpleado', id, datos),
  toggleEmpleado:  (id)        => ipcRenderer.invoke('db:toggleEmpleado', id),

  // ── Bajas ──────────────────────────────────────────────────
  registrarBaja: (datos)   => ipcRenderer.invoke('db:registrarBaja', datos),
  getBajas:      (filtros) => ipcRenderer.invoke('db:getBajas', filtros),

  // ── Gastos ─────────────────────────────────────────────────
  registrarGasto: (datos)     => ipcRenderer.invoke('db:registrarGasto', datos),
  getGastos:      (filtros)   => ipcRenderer.invoke('db:getGastos', filtros),
  getGastosDia:   (fecha)     => ipcRenderer.invoke('db:getGastosDia', fecha),
  updateGasto:    (id, datos) => ipcRenderer.invoke('db:updateGasto', id, datos),
  eliminarGasto:  (id)        => ipcRenderer.invoke('db:eliminarGasto', id),

  // ── Rentabilidad ───────────────────────────────────────────
  getRentabilidad: (filtros) => ipcRenderer.invoke('db:getRentabilidad', filtros),

  // ── Saldo disponible ───────────────────────────────────────
  getSaldoDisponible: () => ipcRenderer.invoke('db:getSaldoDisponible'),

  // ── Imprimir cierre ────────────────────────────────────────
  imprimirCierreCaja: (datos) => ipcRenderer.invoke('db:imprimirCierreCaja', datos),

  // ── Configuracion ──────────────────────────────────────────
  getConfig:      (clave)        => ipcRenderer.invoke('db:getConfig', clave),
  setConfig:      (clave, valor) => ipcRenderer.invoke('db:setConfig', clave, valor),
  getTodasConfig: ()             => ipcRenderer.invoke('db:getTodasConfig'),

  // ── Facturas / Impresion ───────────────────────────────────
  getNextFactura:       ()                                          => ipcRenderer.invoke('db:getNextFactura'),
  getVentasDomicilios:  (filtros)                                   => ipcRenderer.invoke('db:getVentasDomicilios', filtros),
  imprimirRecibo:       (datos)                                     => ipcRenderer.invoke('db:imprimirRecibo', datos),
  imprimirPrueba:       (opts)                                      => ipcRenderer.invoke('db:imprimirPrueba', opts),
  asignarFactura:       (ventaId, facturaNum, efectivoRecibido)     => ipcRenderer.invoke('db:asignarFactura', ventaId, facturaNum, efectivoRecibido),
  getUltimaVenta:       ()                                          => ipcRenderer.invoke('db:getUltimaVenta'),
  getPrinters:          ()                                          => ipcRenderer.invoke('db:getPrinters'),

  // ── Descuentos ─────────────────────────────────────────────────────────────
  getDescuentos:         ()          => ipcRenderer.invoke('db:getDescuentos'),
  getDescuentosActivos:  ()          => ipcRenderer.invoke('db:getDescuentosActivos'),
  agregarDescuento:      (datos)     => ipcRenderer.invoke('db:agregarDescuento', datos),
  updateDescuento:       (id, datos) => ipcRenderer.invoke('db:updateDescuento', id, datos),
  toggleDescuento:       (id)        => ipcRenderer.invoke('db:toggleDescuento', id),
  eliminarDescuento:     (id)        => ipcRenderer.invoke('db:eliminarDescuento', id),
  getReporteDescuentos:  (filtros)   => ipcRenderer.invoke('db:getReporteDescuentos', filtros),

  // ── Mesas ───────────────────────────────────────────────────────────────────
  getMesas:                ()          => ipcRenderer.invoke('db:getMesas'),
  agregarMesa:             (datos)     => ipcRenderer.invoke('db:agregarMesa', datos),
  updateMesa:              (id, datos) => ipcRenderer.invoke('db:updateMesa', id, datos),
  toggleMesa:              (id)        => ipcRenderer.invoke('db:toggleMesa', id),
  guardarPedidoPendiente:  (datos)     => ipcRenderer.invoke('db:guardarPedidoPendiente', datos),
  getPedidoPendiente:      (mesa_id)   => ipcRenderer.invoke('db:getPedidoPendiente', mesa_id),
  eliminarPedidoPendiente: (mesa_id)   => ipcRenderer.invoke('db:eliminarPedidoPendiente', mesa_id),

  // ── Domicilios externos ─────────────────────────────────────────────────────
  getReporteDomiciliosExternos: (filtros) => ipcRenderer.invoke('db:getReporteDomiciliosExternos', filtros),

  // ── Sincronización Google Drive ────────────────────────────────────────────
  sync_getEstado:                   ()      => ipcRenderer.invoke('sync:getEstado'),
  sync_sincronizarAhora:            ()      => ipcRenderer.invoke('sync:sincronizarAhora'),
  sync_subirAhora:                  ()      => ipcRenderer.invoke('sync:subirAhora'),
  sync_bajarAhora:                  ()      => ipcRenderer.invoke('sync:bajarAhora'),
  // Paso 2 del wizard: guardar clientId/clientSecret en disco antes del flujo OAuth
  sync_guardarCredencialesParciales: (c)    => ipcRenderer.invoke('sync:guardarCredencialesParciales', c),
  // Paso 3 del wizard: abre el navegador y espera respuesta automática en servidor local
  sync_iniciarOAuth:                ()      => ipcRenderer.invoke('sync:iniciarOAuth'),
  sync_desconectar:                 ()      => ipcRenderer.invoke('sync:desconectar'),
  sync_configurarAuto:              (cfg)   => ipcRenderer.invoke('sync:configurarAuto', cfg),
  // Suscribirse a cambios de estado enviados desde el proceso principal
  sync_onEstadoCambiado:  (cb)   => ipcRenderer.on('sync:estadoCambiado', (_e, est) => cb(est)),
  sync_offEstadoCambiado: ()     => ipcRenderer.removeAllListeners('sync:estadoCambiado'),

  // ── App ────────────────────────────────────────────────────────────────────
  reiniciarApp: () => ipcRenderer.invoke('app:reiniciar'),

  // ── Actualizaciones ────────────────────────────────────────────────────────
  update_check:   ()   => ipcRenderer.invoke('update:check'),
  update_install: ()   => ipcRenderer.send('update:install'),
  update_onAvailable:    (cb) => ipcRenderer.on('update:available',    (_e, d) => cb(d)),
  update_onProgress:     (cb) => ipcRenderer.on('update:progress',     (_e, d) => cb(d)),
  update_onDownloaded:   (cb) => ipcRenderer.on('update:downloaded',   (_e, d) => cb(d)),
  update_onNotAvailable: (cb) => ipcRenderer.on('update:not-available', ()     => cb()),
  update_onError:        (cb) => ipcRenderer.on('update:error',         (_e, m) => cb(m)),
  update_removeListeners: ()  => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.removeAllListeners('update:progress');
    ipcRenderer.removeAllListeners('update:downloaded');
    ipcRenderer.removeAllListeners('update:not-available');
    ipcRenderer.removeAllListeners('update:error');
  },
});

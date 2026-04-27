import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import TabSync from './TabSync';

const CATEGORIAS_PROD = [
  { value: 'principal', label: 'Principal' },
  { value: 'combo',     label: 'Combo'     },
  { value: 'adicion',   label: 'Adición'  },
  { value: 'bebida',    label: 'Bebida'   },
  { value: 'empaque',   label: 'Empaque'  },
];

const UNIDADES_OPCIONES = [
  'unidad', 'paquete', 'tarro', 'gramo', 'litro', 'libra', 'atado', 'porción', 'mililitro',
];

const CATEGORIAS_ING = [
  'carne', 'pan', 'lacteo', 'vegetal', 'bebida', 'salsa', 'topping', 'desechable', 'preparado', 'otro',
];

const CATEGORIAS_ING_LABEL = {
  carne: '🥩 Carnes', pan: '🍞 Panes', lacteo: '🧀 Lácteos',
  vegetal: '🥦 Vegetales', bebida: '🥤 Bebidas', salsa: '🫙 Salsas',
  topping: '🌽 Toppings', desechable: '🛍️ Desechables',
  preparado: '⏱️ Preparados', otro: '📦 Otros',
};

function normalizar(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function Configuracion() {
  const { notificar }                   = useApp();
  const [tab, setTab]                   = useState('productos');
  const [productos, setProductos]       = useState([]);
  const [ingredientes, setIngredientes] = useState([]);
  const [proveedores, setProveedores]   = useState([]);
  const [empleados, setEmpleados]       = useState([]);
  const [cfg, setCfg]                   = useState({});
  const [cargando, setCargando]         = useState(true);

  // Modales productos
  const [modalProd, setModalProd]       = useState(null);
  const [modalNuevoProd, setModalNuevoProd] = useState(false);
  // Modales ingredientes
  const [modalIng, setModalIng]         = useState(null);
  const [modalNuevoIng, setModalNuevoIng] = useState(false);
  // Modales proveedores
  const [modalProv, setModalProv]       = useState(null);
  const [confirmElim, setConfirmElim]   = useState(null);
  // Modales empleados
  const [modalEmp, setModalEmp]         = useState(null);

  // Estado del auto-updater (tab version)
  const [updateEstado, setUpdateEstado]       = useState('idle'); // 'idle'|'checking'|'available'|'downloading'|'ready'|'error'|'uptodate'
  const [updateVersion, setUpdateVersion]     = useState(null);
  const [updateProgress, setUpdateProgress]   = useState(null);
  const [updateError, setUpdateError]         = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [prods, ings, provs, emps, config] = await Promise.all([
        window.electronAPI.getProductos(),
        window.electronAPI.getIngredientes(),
        window.electronAPI.getProveedores(),
        window.electronAPI.getEmpleados(),
        window.electronAPI.getTodasConfig(),
      ]);
      setProductos(prods || []);
      setIngredientes(ings || []);
      setProveedores(provs || []);
      setEmpleados(emps || []);
      setCfg(config || {});
    } catch (err) {
      console.error('[Config] Error:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Productos ────────────────────────────────────────────────────────────────

  const guardarProducto = async (id, datos) => {
    await window.electronAPI.updateProducto(id, datos);
    notificar('✅ Producto actualizado', 'exito');
    setModalProd(null);
    cargar();
  };

  const toggleProducto = async (id) => {
    await window.electronAPI.toggleProducto(id);
    cargar();
  };

  const crearProducto = async (datos) => {
    await window.electronAPI.agregarProducto(datos);
    notificar('✅ Producto creado', 'exito');
    setModalNuevoProd(false);
    cargar();
  };

  // ── Ingredientes ─────────────────────────────────────────────────────────────

  const guardarIngrediente = async (id, datos) => {
    await window.electronAPI.updateIngredienteFull(id, datos);
    notificar('✅ Ingrediente actualizado', 'exito');
    setModalIng(null);
    cargar();
  };

  const crearIngrediente = async (datos) => {
    await window.electronAPI.agregarIngrediente(datos);
    notificar('✅ Ingrediente creado', 'exito');
    setModalNuevoIng(false);
    cargar();
  };

  // ── Proveedores ──────────────────────────────────────────────────────────────

  const guardarProveedor = async (datos) => {
    if (modalProv?.id) {
      await window.electronAPI.updateProveedor(modalProv.id, datos);
      notificar('✅ Proveedor actualizado', 'exito');
    } else {
      await window.electronAPI.agregarProveedor(datos);
      notificar('✅ Proveedor creado', 'exito');
    }
    setModalProv(null);
    cargar();
  };

  const eliminarProveedor = async (id) => {
    await window.electronAPI.eliminarProveedor(id);
    notificar('🗑️ Proveedor eliminado', 'exito');
    setConfirmElim(null);
    cargar();
  };

  // ── Empleados ────────────────────────────────────────────────────────────────

  const guardarEmpleado = async (datos) => {
    try {
      if (datos.id) {
        await window.electronAPI.updateEmpleado(datos.id, datos);
        notificar('✅ Empleado actualizado', 'exito');
      } else {
        await window.electronAPI.agregarEmpleado(datos);
        notificar('✅ Empleado creado', 'exito');
      }
      setModalEmp(null);
      cargar();
    } catch (err) {
      notificar('❌ Error: ' + (err.message || 'desconocido'), 'error');
    }
  };

  const toggleEmpleado = async (id) => {
    await window.electronAPI.toggleEmpleado(id);
    cargar();
  };

  if (cargando) return <div className="cargando">⏳ Cargando configuración...</div>;

  return (
    <div>
      <div className="pagina-titulo">⚙️ Configuración</div>

      {/* Tabs */}
      <div className="pos-tabs mb-24">
        {[
          { id: 'productos',    label: '🍽️ Menú' },
          { id: 'inventario',   label: '📦 Inventario' },
          { id: 'empleados',    label: '👥 Empleados' },
          { id: 'proveedores',  label: '🚚 Proveedores' },
          { id: 'impresora',    label: '🖨️ Impresora' },
          { id: 'sync',         label: '☁️ Sincronización' },
          { id: 'version',      label: '🔄 Versión' },
        ].map(t => (
          <button key={t.id} className={`pos-tab ${tab === t.id ? 'activo' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB PRODUCTOS ──────────────────────────────────────────────────────── */}
      {tab === 'productos' && (
        <div>
          <div className="flex justify-between items-center mb-16">
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {productos.length} productos registrados
            </div>
            <button className="btn btn-primario" onClick={() => setModalNuevoProd(true)}>
              ➕ Nuevo producto
            </button>
          </div>

          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map(prod => (
                  <tr key={prod.id}>
                    <td>
                      <span className="badge badge-azul" style={{ fontSize: 11 }}>
                        {prod.codigo || '—'}
                      </span>
                    </td>
                    <td className="negrita">{prod.nombre}</td>
                    <td>
                      <span className={`badge badge-${
                        prod.categoria === 'principal' ? 'naranja' :
                        prod.categoria === 'combo'     ? 'azul'   :
                        prod.categoria === 'bebida'    ? 'azul'   : 'verde'
                      }`}>
                        {prod.categoria}
                      </span>
                    </td>
                    <td className="texto-naranja negrita">
                      ${(prod.precio || 0).toLocaleString('es-CO')}
                    </td>
                    <td>
                      <span className={`badge ${prod.activo ? 'badge-verde' : 'badge-rojo'}`}>
                        {prod.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button
                          className="btn btn-secundario"
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => setModalProd({ ...prod })}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          className={`btn ${prod.activo ? 'btn-peligro' : 'btn-exito'}`}
                          style={{ padding: '6px 12px', fontSize: 13 }}
                          onClick={() => toggleProducto(prod.id)}
                        >
                          {prod.activo ? '🚫 Ocultar' : '✅ Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB INVENTARIO ─────────────────────────────────────────────────────── */}
      {tab === 'inventario' && (
        <div>
          <div className="flex justify-between items-center mb-16">
            <div className="alerta azul" style={{ flex: 1, marginBottom: 0 }}>
              Configura stocks mínimos y costos por ingrediente.
              Para ajustar stock ve al módulo de Inventario.
            </div>
            <button className="btn btn-primario" style={{ marginLeft: 16, flexShrink: 0 }}
              onClick={() => setModalNuevoIng(true)}>
              ➕ Agregar ingrediente
            </button>
          </div>
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Stock actual</th>
                  <th style={{ textAlign: 'right' }}>Stock mínimo</th>
                  <th>Unidad</th>
                  <th style={{ textAlign: 'right' }}>Costo unit.</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ingredientes.map(ing => (
                  <tr key={ing.id}>
                    <td className="negrita">{ing.nombre}</td>
                    <td>
                      <span className="badge badge-azul">{ing.categoria}</span>
                    </td>
                    <td style={{
                      textAlign: 'right',
                      color: ing.stock_actual === 0 ? 'var(--rojo)' :
                             ing.stock_actual <= ing.stock_minimo ? 'var(--amarillo)' : 'var(--verde)',
                      fontWeight: 700,
                    }}>
                      {ing.stock_actual}
                    </td>
                    <td style={{ textAlign: 'right' }}>{ing.stock_minimo}</td>
                    <td className="texto-suave">{ing.unidad}</td>
                    <td style={{ textAlign: 'right' }} className="texto-suave">
                      {ing.costo_unitario > 0
                        ? `$${(ing.costo_unitario || 0).toLocaleString('es-CO')}`
                        : <span style={{ color: 'var(--amarillo)' }}>Sin costo</span>
                      }
                    </td>
                    <td>
                      <button
                        className="btn btn-secundario"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => setModalIng({ ...ing })}
                      >
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB EMPLEADOS ──────────────────────────────────────────────────────── */}
      {tab === 'empleados' && (
        <TabEmpleados
          empleados={empleados}
          onNuevo={() => setModalEmp({})}
          onEditar={emp => setModalEmp({ ...emp })}
          onToggle={toggleEmpleado}
        />
      )}

      {/* ── TAB PROVEEDORES ────────────────────────────────────────────────────── */}
      {tab === 'proveedores' && (
        <TabProveedores
          proveedores={proveedores}
          ingredientes={ingredientes}
          onNuevo={() => setModalProv({})}
          onEditar={prov => setModalProv(prov)}
          onEliminar={id => setConfirmElim(id)}
        />
      )}

      {/* ── TAB IMPRESORA ──────────────────────────────────────────────────────── */}
      {tab === 'impresora' && (
        <TabImpresora cfg={cfg} notificar={notificar} onGuardar={cargar} />
      )}

      {tab === 'sync' && (
        <TabSync />
      )}

      {tab === 'version' && (
        <TabVersion
          updateEstado={updateEstado}
          setUpdateEstado={setUpdateEstado}
          updateVersion={updateVersion}
          setUpdateVersion={setUpdateVersion}
          updateProgress={updateProgress}
          setUpdateProgress={setUpdateProgress}
          updateError={updateError}
          setUpdateError={setUpdateError}
        />
      )}

      {/* ── MODALES ────────────────────────────────────────────────────────────── */}

      {modalProd && (
        <ModalEditarProducto
          producto={modalProd}
          ingredientes={ingredientes}
          onCerrar={() => setModalProd(null)}
          onGuardar={guardarProducto}
        />
      )}

      {modalNuevoProd && (
        <ModalNuevoProducto
          onCerrar={() => setModalNuevoProd(false)}
          onGuardar={crearProducto}
        />
      )}

      {modalIng && (
        <ModalEditarIngrediente
          ingrediente={modalIng}
          proveedores={proveedores}
          onCerrar={() => setModalIng(null)}
          onGuardar={guardarIngrediente}
        />
      )}

      {modalNuevoIng && (
        <ModalNuevoIngrediente
          proveedores={proveedores}
          onCerrar={() => setModalNuevoIng(false)}
          onGuardar={crearIngrediente}
        />
      )}

      {modalProv !== null && (
        <ModalProveedor
          proveedor={modalProv}
          ingredientes={ingredientes}
          onCerrar={() => setModalProv(null)}
          onGuardar={guardarProveedor}
        />
      )}

      {confirmElim !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-titulo">🗑️ Eliminar proveedor</div>
            <p style={{ marginBottom: 24 }}>¿Estás seguro de que deseas eliminar este proveedor?</p>
            <div className="modal-acciones">
              <button className="btn btn-secundario" onClick={() => setConfirmElim(null)}>
                Cancelar
              </button>
              <button className="btn btn-peligro" onClick={() => eliminarProveedor(confirmElim)}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEmp !== null && (
        <ModalEmpleado
          empleado={modalEmp}
          onCerrar={() => setModalEmp(null)}
          onGuardar={guardarEmpleado}
        />
      )}
    </div>
  );
}

// ── Tab Empleados ─────────────────────────────────────────────────────────────

function TabEmpleados({ empleados, onNuevo, onEditar, onToggle }) {
  const activos   = empleados.filter(e => e.activo).length;
  const inactivos = empleados.filter(e => !e.activo).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-16">
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {activos} activos · {inactivos} inactivos
        </div>
        <button className="btn btn-primario" onClick={onNuevo}>
          ➕ Agregar empleado
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {empleados.map(emp => (
          <div key={emp.id} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 36 }}>
                  {emp.rol === 'administrador' ? '👨‍💼' : '👤'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{emp.nombre}</span>
                    <span className={`badge ${emp.rol === 'administrador' ? 'badge-naranja' : 'badge-azul'}`}
                      style={{ fontSize: 11 }}>
                      {emp.rol === 'administrador' ? 'Admin' : 'Empleado'}
                    </span>
                    <span className={`badge ${emp.activo ? 'badge-verde' : 'badge-rojo'}`}
                      style={{ fontSize: 11 }}>
                      {emp.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {(emp.fecha_ingreso || emp.notas) && (
                    <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 4 }}>
                      {emp.fecha_ingreso && <span>📅 Ingreso: {emp.fecha_ingreso}</span>}
                      {emp.fecha_ingreso && emp.notas && <span> · </span>}
                      {emp.notas && <span>📝 {emp.notas}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-8">
                <button className="btn btn-secundario"
                  style={{ padding: '6px 14px', fontSize: 13 }}
                  onClick={() => onEditar(emp)}>
                  ✏️ Editar
                </button>
                <button
                  className={`btn ${emp.activo ? 'btn-peligro' : 'btn-exito'}`}
                  style={{ padding: '6px 14px', fontSize: 13 }}
                  onClick={() => onToggle(emp.id)}
                >
                  {emp.activo ? '🚫 Desactivar' : '✅ Activar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="alerta azul" style={{ marginTop: 16 }}>
        Los empleados desactivados no pueden iniciar sesión. Los datos se conservan siempre.
      </div>
    </div>
  );
}

// ── Modal Empleado ────────────────────────────────────────────────────────────

function ModalEmpleado({ empleado, onCerrar, onGuardar }) {
  const esNuevo = !empleado?.id;
  const [nombre,       setNombre]       = useState(empleado?.nombre || '');
  const [pin,          setPin]          = useState('');
  const [pinConfirm,   setPinConfirm]   = useState('');
  const [rol,          setRol]          = useState(empleado?.rol || 'empleado');
  const [fechaIngreso, setFechaIngreso] = useState(empleado?.fecha_ingreso || '');
  const [notas,        setNotas]        = useState(empleado?.notas || '');
  const [error,        setError]        = useState('');

  const validar = () => {
    if (!nombre.trim()) return 'El nombre es obligatorio.';
    if (esNuevo && !pin)  return 'El PIN es obligatorio para nuevos empleados.';
    if (pin && pin.length !== 4) return 'El PIN debe tener exactamente 4 dígitos.';
    if (pin && !/^\d{4}$/.test(pin)) return 'El PIN debe ser numérico.';
    if (pin && pin !== pinConfirm) return 'Los PINs no coinciden.';
    return '';
  };

  const guardar = () => {
    const err = validar();
    if (err) { setError(err); return; }
    const datos = {
      id: empleado?.id || undefined,
      nombre: nombre.trim(),
      rol,
      fecha_ingreso: fechaIngreso,
      notas,
    };
    if (pin) datos.pin = pin;
    onGuardar(datos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-titulo">
          {esNuevo ? '➕ Nuevo empleado' : `✏️ Editar — ${empleado.nombre}`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Sofía" />
          </div>

          <div className="form-grupo">
            <label className="form-label">Rol</label>
            <select value={rol} onChange={e => setRol(e.target.value)}>
              <option value="empleado">Empleado</option>
              <option value="administrador">Administrador</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">
                PIN (4 dígitos){esNuevo ? ' *' : ' — dejar vacío para no cambiar'}
              </label>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)}
                maxLength={4} placeholder="••••" inputMode="numeric" />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Confirmar PIN</label>
              <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
                maxLength={4} placeholder="••••" inputMode="numeric" />
            </div>
          </div>

          <div className="form-grupo">
            <label className="form-label">Fecha de ingreso</label>
            <input type="date" value={fechaIngreso}
              onChange={e => setFechaIngreso(e.target.value)} />
          </div>

          <div className="form-grupo">
            <label className="form-label">Notas</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Ej: Turno tarde" />
          </div>

          {error && (
            <div style={{
              color: 'var(--rojo)', fontSize: 13,
              background: 'rgba(231,76,60,0.08)',
              padding: '8px 12px', borderRadius: 6,
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={guardar}>
            {esNuevo ? 'Crear empleado' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Editar Producto (con receta) ────────────────────────────────────────

function ModalEditarProducto({ producto, ingredientes, onCerrar, onGuardar }) {
  const [nombre,    setNombre]    = useState(producto.nombre);
  const [precio,    setPrecio]    = useState(producto.precio);
  const [activo,    setActivo]    = useState(producto.activo);
  const [codigo,    setCodigo]    = useState(producto.codigo || '');
  const [categoria, setCategoria] = useState(producto.categoria || 'principal');
  const [receta,    setReceta]    = useState([]);
  const [tabLocal,  setTabLocal]  = useState('datos');
  const [busqueda,  setBusqueda]  = useState('');
  const [cargandoReceta, setCargandoReceta] = useState(false);

  useEffect(() => {
    if (tabLocal === 'receta') cargarReceta();
  }, [tabLocal]);

  const cargarReceta = async () => {
    setCargandoReceta(true);
    try {
      const r = await window.electronAPI.getRecetaProducto(producto.id);
      setReceta(r || []);
    } catch (err) {
      console.error('[ModalEditarProducto] receta:', err);
    } finally {
      setCargandoReceta(false);
    }
  };

  const ingsFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    return ingredientes
      .filter(i => !receta.find(r => r.ingrediente_id === i.id))
      .filter(i => !q || normalizar(i.nombre).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [ingredientes, receta, busqueda]);

  const agregarAReceta = (ing) => {
    setReceta(prev => [...prev, { ingrediente_id: ing.id, nombre: ing.nombre, unidad: ing.unidad, cantidad: 1 }]);
    setBusqueda('');
  };

  const quitarDeReceta = (ingId) => {
    setReceta(prev => prev.filter(r => r.ingrediente_id !== ingId));
  };

  const setCantidad = (ingId, val) => {
    setReceta(prev => prev.map(r =>
      r.ingrediente_id === ingId ? { ...r, cantidad: parseFloat(val) || 0 } : r
    ));
  };

  const guardar = async () => {
    if (tabLocal === 'receta') {
      await window.electronAPI.updateRecetaProducto(producto.id, receta);
    }
    onGuardar(producto.id, { nombre, precio, activo, codigo, categoria });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-titulo">✏️ Editar — {producto.nombre}</div>

        <div className="pos-tabs" style={{ marginBottom: 16 }}>
          <button className={`pos-tab ${tabLocal === 'datos' ? 'activo' : ''}`}
            onClick={() => setTabLocal('datos')}>Datos</button>
          <button className={`pos-tab ${tabLocal === 'receta' ? 'activo' : ''}`}
            onClick={() => setTabLocal('receta')}>🧾 Receta</button>
        </div>

        {tabLocal === 'datos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-grupo" style={{ flex: 1 }}>
                <label className="form-label">Nombre</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div className="form-grupo" style={{ width: 90 }}>
                <label className="form-label">Código</label>
                <input type="text" value={codigo}
                  onChange={e => setCodigo(e.target.value.toUpperCase())}
                  placeholder="P1" maxLength={6} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-grupo" style={{ marginBottom: 0 }}>
                <label className="form-label">Precio (COP)</label>
                <input type="number" min="0" step="any" value={precio}
                  onChange={e => setPrecio(parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-grupo" style={{ marginBottom: 0 }}>
                <label className="form-label">Categoría</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                  {CATEGORIAS_PROD.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="checkbox" id="activoProd" checked={!!activo}
                onChange={e => setActivo(e.target.checked ? 1 : 0)} />
              <label htmlFor="activoProd" style={{ cursor: 'pointer' }}>
                Producto activo (visible en POS)
              </label>
            </div>
          </div>
        )}

        {tabLocal === 'receta' && (
          <div>
            {cargandoReceta ? (
              <div className="cargando">⏳ Cargando receta...</div>
            ) : (
              <>
                {receta.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="form-label" style={{ marginBottom: 6 }}>Ingredientes en receta</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {receta.map(r => (
                        <div key={r.ingrediente_id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 10px', borderRadius: 8,
                          background: 'var(--fondo)', border: '1px solid var(--borde)',
                        }}>
                          <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{r.ingrediente_nombre || r.nombre}</span>
                          <span className="texto-suave" style={{ fontSize: 12, width: 50 }}>{r.unidad}</span>
                          <input
                            type="number" min="0.01" step="any"
                            value={r.cantidad}
                            onChange={e => setCantidad(r.ingrediente_id, e.target.value)}
                            style={{ width: 70, textAlign: 'right' }}
                          />
                          <button
                            onClick={() => quitarDeReceta(r.ingrediente_id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--rojo)', fontSize: 16, padding: '0 4px',
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>
                    Agregar ingrediente
                  </div>
                  <input
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar ingrediente..."
                    style={{ marginBottom: 8 }}
                  />
                  {busqueda && (
                    <div style={{
                      border: '1px solid var(--borde)', borderRadius: 8,
                      maxHeight: 180, overflowY: 'auto',
                    }}>
                      {ingsFiltrados.length === 0 ? (
                        <div style={{ padding: '10px 14px', color: 'var(--texto-suave)', fontSize: 13 }}>
                          Sin resultados
                        </div>
                      ) : ingsFiltrados.map(ing => (
                        <div key={ing.id}
                          onClick={() => agregarAReceta(ing)}
                          style={{
                            padding: '8px 14px', cursor: 'pointer', fontSize: 14,
                            display: 'flex', justifyContent: 'space-between',
                            borderBottom: '1px solid var(--borde)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--fondo)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>{ing.nombre}</span>
                          <span className="texto-suave" style={{ fontSize: 12 }}>{ing.unidad}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {receta.length === 0 && !busqueda && (
                  <div className="alerta azul" style={{ marginTop: 8 }}>
                    Sin receta registrada. Busca ingredientes arriba para armar la receta.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={guardar}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Nuevo Producto ──────────────────────────────────────────────────────

function ModalNuevoProducto({ onCerrar, onGuardar }) {
  const [nombre,    setNombre]    = useState('');
  const [precio,    setPrecio]    = useState(8000);
  const [categoria, setCategoria] = useState('principal');
  const [codigo,    setCodigo]    = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">➕ Nuevo Producto</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-grupo" style={{ flex: 1 }}>
              <label className="form-label">Nombre</label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Perro con queso extra" />
            </div>
            <div className="form-grupo" style={{ width: 90 }}>
              <label className="form-label">Código</label>
              <input type="text" value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="P3" maxLength={6} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Precio (COP)</label>
              <input type="number" min="0" step="any" value={precio}
                onChange={e => setPrecio(parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS_PROD.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!nombre.trim()}
            onClick={() => onGuardar({ nombre: nombre.trim(), precio, categoria, codigo })}>
            Crear producto
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Editar Ingrediente ──────────────────────────────────────────────────

function ModalEditarIngrediente({ ingrediente, proveedores, onCerrar, onGuardar }) {
  const [nombre,       setNombre]       = useState(ingrediente.nombre);
  const [categoria,    setCategoria]    = useState(ingrediente.categoria || 'otro');
  const [unidad,       setUnidad]       = useState(
    UNIDADES_OPCIONES.includes(ingrediente.unidad) ? ingrediente.unidad : 'unidad'
  );
  const [stockMin,     setStockMin]     = useState(ingrediente.stock_minimo ?? 0);
  const [costoUnit,    setCostoUnit]    = useState(ingrediente.costo_unitario ?? 0);
  const [perecedero,   setPerecedero]   = useState(!!ingrediente.es_perecedero);
  const [diasDuracion, setDiasDuracion] = useState(ingrediente.dias_duracion || '');
  const [proveedorId,  setProveedorId]  = useState(ingrediente.proveedor_id || '');
  const [unidadesPorPaquete, setUnidadesPorPaquete] = useState(
    ingrediente.unidades_por_paquete || ''
  );

  const mostrarPaquete = unidad === 'paquete';

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-titulo">✏️ Editar — {ingrediente.nombre}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Nombre</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS_ING.map(c => (
                  <option key={c} value={c}>{CATEGORIAS_ING_LABEL[c] || c}</option>
                ))}
              </select>
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Unidad de medida</label>
              <select value={unidad} onChange={e => setUnidad(e.target.value)}>
                {UNIDADES_OPCIONES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {mostrarPaquete && (
            <div className="form-grupo">
              <label className="form-label">Unidades por paquete</label>
              <input type="number" min="1" step="1" value={unidadesPorPaquete}
                onChange={e => setUnidadesPorPaquete(e.target.value)}
                placeholder="Ej: 8 (tiras de tocineta)" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Stock mínimo (alerta)</label>
              <input type="number" min="0" step="any" value={stockMin}
                onChange={e => setStockMin(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Costo unitario (COP)</label>
              <input type="number" min="0" step="any" value={costoUnit}
                onChange={e => setCostoUnit(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" id="perecederoEdit" checked={perecedero}
              onChange={e => setPerecedero(e.target.checked)} />
            <label htmlFor="perecederoEdit" style={{ cursor: 'pointer' }}>Es perecedero</label>
            {perecedero && (
              <input type="number" min="1" step="1" value={diasDuracion}
                onChange={e => setDiasDuracion(e.target.value)}
                placeholder="Días de duración" style={{ width: 150 }} />
            )}
          </div>

          <div className="form-grupo">
            <label className="form-label">Proveedor asignado</label>
            <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div className="alerta azul" style={{ fontSize: 13 }}>
            Stock actual: <strong>{ingrediente.stock_actual} {unidad}</strong>.
            Para ajustar el stock ve al módulo de Inventario.
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario"
            onClick={() => onGuardar(ingrediente.id, {
              nombre: nombre.trim(),
              categoria,
              unidad,
              stock_minimo: stockMin,
              costo_unitario: costoUnit,
              es_perecedero: perecedero ? 1 : 0,
              dias_duracion: perecedero && diasDuracion ? parseInt(diasDuracion) : null,
              proveedor_id: proveedorId || null,
              unidades_por_paquete: mostrarPaquete && unidadesPorPaquete
                ? parseInt(unidadesPorPaquete) : null,
            })}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Nuevo Ingrediente ───────────────────────────────────────────────────

function ModalNuevoIngrediente({ proveedores, onCerrar, onGuardar }) {
  const [nombre,       setNombre]       = useState('');
  const [categoria,    setCategoria]    = useState('otro');
  const [unidad,       setUnidad]       = useState('unidad');
  const [stockInicial, setStockInicial] = useState(0);
  const [stockMin,     setStockMin]     = useState(0);
  const [costoUnit,    setCostoUnit]    = useState(0);
  const [perecedero,   setPerecedero]   = useState(false);
  const [diasDuracion, setDiasDuracion] = useState('');
  const [proveedorId,  setProveedorId]  = useState('');
  const [unidadesPorPaquete, setUnidadesPorPaquete] = useState('');

  const mostrarPaquete = unidad === 'paquete';

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-titulo">➕ Nuevo Ingrediente</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Salchicha Frankfurt" autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}>
                {CATEGORIAS_ING.map(c => (
                  <option key={c} value={c}>{CATEGORIAS_ING_LABEL[c] || c}</option>
                ))}
              </select>
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Unidad de medida</label>
              <select value={unidad} onChange={e => setUnidad(e.target.value)}>
                {UNIDADES_OPCIONES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {mostrarPaquete && (
            <div className="form-grupo">
              <label className="form-label">Unidades por paquete</label>
              <input type="number" min="1" step="1" value={unidadesPorPaquete}
                onChange={e => setUnidadesPorPaquete(e.target.value)}
                placeholder="Ej: 8" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Stock inicial</label>
              <input type="number" min="0" step="any" value={stockInicial}
                onChange={e => setStockInicial(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Stock mínimo</label>
              <input type="number" min="0" step="any" value={stockMin}
                onChange={e => setStockMin(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Costo unitario</label>
              <input type="number" min="0" step="any" value={costoUnit}
                onChange={e => setCostoUnit(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" id="perecederoNuevo" checked={perecedero}
              onChange={e => setPerecedero(e.target.checked)} />
            <label htmlFor="perecederoNuevo" style={{ cursor: 'pointer' }}>Es perecedero</label>
            {perecedero && (
              <input type="number" min="1" step="1" value={diasDuracion}
                onChange={e => setDiasDuracion(e.target.value)}
                placeholder="Días de duración" style={{ width: 150 }} />
            )}
          </div>

          <div className="form-grupo">
            <label className="form-label">Proveedor asignado</label>
            <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!nombre.trim()}
            onClick={() => onGuardar({
              nombre: nombre.trim(),
              categoria,
              unidad,
              stock_actual: stockInicial,
              stock_minimo: stockMin,
              costo_unitario: costoUnit,
              es_perecedero: perecedero ? 1 : 0,
              dias_duracion: perecedero && diasDuracion ? parseInt(diasDuracion) : null,
              proveedor_id: proveedorId || null,
              unidades_por_paquete: mostrarPaquete && unidadesPorPaquete
                ? parseInt(unidadesPorPaquete) : null,
            })}>
            Crear ingrediente
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab Impresora ─────────────────────────────────────────────────────────────

function TabImpresora({ cfg, notificar, onGuardar }) {
  const [facturaInicio, setFacturaInicio] = useState(cfg.factura_inicio   || '2083');
  const [autoPrint,     setAutoPrint]     = useState(cfg.auto_imprimir   === '1');
  const [impresora,     setImpresora]     = useState(cfg.impresora_nombre || '');
  const [puertoLinux,   setPuertoLinux]   = useState(cfg.puerto_linux     || '/dev/usb/lp0');
  const [impresoras,    setImpresoras]    = useState([]);
  const [guardando,     setGuardando]     = useState(false);
  const [imprimiendo,   setImprimiendo]   = useState(false);

  const consecutivoActual = cfg.factura_consecutivo || '0';
  const esWindows = navigator.platform?.toLowerCase().includes('win');

  useEffect(() => {
    window.electronAPI.getPrinters().then(lista => setImpresoras(lista || [])).catch(() => {});
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await window.electronAPI.setConfig('factura_inicio',   facturaInicio || '2083');
      await window.electronAPI.setConfig('auto_imprimir',    autoPrint ? '1' : '0');
      await window.electronAPI.setConfig('impresora_nombre', impresora);
      await window.electronAPI.setConfig('puerto_linux',     puertoLinux || '/dev/usb/lp0');
      notificar('✅ Configuración de impresora guardada', 'exito');
      onGuardar();
    } catch (err) {
      notificar('❌ Error guardando configuración', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const testPrint = async () => {
    setImprimiendo(true);
    try {
      const result = await window.electronAPI.imprimirPrueba({
        printerName: impresora    || null,
        puertoLinux: puertoLinux  || '/dev/usb/lp0',
      });
      if (result?.ok) {
        if (result.aviso === 'impresora_no_disponible') {
          notificar('⚠️ Impresora no disponible — recibo guardado como .txt', 'info');
        } else {
          const metodo = result.metodo ? ` (${result.metodo})` : '';
          notificar(`🖨️ Recibo de prueba enviado${metodo}`, 'exito');
        }
      } else {
        notificar('❌ Error: ' + (result?.error || 'desconocido'), 'error');
      }
    } catch (err) {
      notificar('❌ Error: ' + err.message, 'error');
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="card">
        <div className="card-titulo">🖨️ Configuración de impresión de recibos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {esWindows ? (
            <div className="alerta azul">
              <strong>Windows detectado.</strong> Selecciona la impresora 3nStar y se enviará
              ESC/POS directo al puerto USB. Sin diálogo de impresión del sistema.
            </div>
          ) : (
            <div className="alerta azul">
              <strong>Linux detectado.</strong> Los recibos se envían ESC/POS directamente al
              puerto <code>{puertoLinux || '/dev/usb/lp0'}</code>. Si la impresora no está
              disponible, se guarda <code>.txt</code> en <code>~/perros-americanos/recibos/</code>
            </div>
          )}

          {/* Puerto Linux (siempre visible) */}
          <div className="form-grupo">
            <label className="form-label">Puerto Linux (dispositivo USB)</label>
            <input
              type="text"
              value={puertoLinux}
              onChange={e => setPuertoLinux(e.target.value)}
              placeholder="/dev/usb/lp0"
              style={{ width: 220 }}
            />
            <div className="texto-suave" style={{ fontSize: 12, marginTop: 4 }}>
              Impresora 3nStar detectada en <code>/dev/usb/lp0</code> (Vendor: 1fc9 / Product: 2016)
            </div>
          </div>

          {/* Selector de impresora Windows */}
          <div className="form-grupo">
            <label className="form-label">
              Impresora Windows
              {impresoras.length === 0 && (
                <span className="texto-suave" style={{ fontSize: 12, marginLeft: 8 }}>
                  (no se detectaron impresoras)
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={impresora}
                onChange={e => setImpresora(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">— Sin impresora Windows —</option>
                {impresoras.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                className="btn btn-secundario"
                style={{ fontSize: 13, padding: '0 12px', flexShrink: 0 }}
                onClick={() => window.electronAPI.getPrinters().then(lista => setImpresoras(lista || []))}
              >
                🔄
              </button>
            </div>
            {impresora && (
              <div className="texto-suave" style={{ fontSize: 12, marginTop: 4 }}>
                Seleccionada: <strong>{impresora}</strong>
              </div>
            )}
          </div>

          <div className="form-grupo">
            <label className="form-label">Número inicial de factura</label>
            <input
              type="number" min="1" step="1"
              value={facturaInicio}
              onChange={e => setFacturaInicio(e.target.value)}
              style={{ width: 140 }}
            />
            <div className="texto-suave" style={{ fontSize: 12, marginTop: 4 }}>
              Último consecutivo emitido: <strong>#{consecutivoActual}</strong>
              {parseInt(consecutivoActual) === 0 && ' (ninguno aún)'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" id="autoPrint" checked={autoPrint}
              onChange={e => setAutoPrint(e.target.checked)} />
            <label htmlFor="autoPrint" style={{ cursor: 'pointer' }}>
              Imprimir automáticamente al cobrar
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primario" onClick={guardar} disabled={guardando}>
              {guardando ? '⏳ Guardando...' : '💾 Guardar configuración'}
            </button>
            <button className="btn btn-secundario" onClick={testPrint} disabled={imprimiendo}>
              {imprimiendo ? '⏳ Imprimiendo...' : '🖨️ Recibo de prueba'}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-titulo">📄 Vista previa del recibo (48 chars × 80mm)</div>
        <pre style={{
          fontFamily: 'monospace', fontSize: 11,
          background: 'var(--fondo)', padding: 12, borderRadius: 6,
          lineHeight: 1.5, color: 'var(--texto)',
          whiteSpace: 'pre', overflowX: 'auto',
        }}>
{`================================================
          PERROS AMERICANOS
        CC Manila L.47 Fusa
       No Responsable ICO
         NIT: 41714836-4
         Tel: 3144139985
================================================
Fecha: 23-Abr-2026  14:30:00
Factura No.: 2083
Despachó: Juan
------------------------------------------------
CONSUMIDOR FINAL
------------------------------------------------
CO   DESCRIPCIÓN            CANT        VALOR
P1   Perro Americano          x1       $8.000
B1   Coca-Cola 250ml          x2       $5.000
------------------------------------------------
              SUBTOTAL              $13.000
              DOMICILIO                  $0
              DCTO.                      $0
------------------------------------------------
              TOTAL                 $13.000
              ITEMS                       3
------------------------------------------------
PAGO:
 Efectivo recibido:           $15.000
 CAMBIO:                       $2.000
------------------------------------------------
          ARMALO COMO QUIERAS,
          GRACIAS POR TU COMPRA
================================================`}
        </pre>
      </div>
    </div>
  );
}

// ── Tab Proveedores ───────────────────────────────────────────────────────────

function TabProveedores({ proveedores, ingredientes, onNuevo, onEditar, onEliminar }) {
  const ingMap = useMemo(() => {
    const m = {};
    for (const i of ingredientes) m[i.id] = i.nombre;
    return m;
  }, [ingredientes]);

  return (
    <div>
      <div className="flex justify-between items-center mb-16">
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {proveedores.length} proveedores registrados
        </div>
        <button className="btn btn-primario" onClick={onNuevo}>
          ➕ Nuevo proveedor
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {proveedores.map(prov => {
          const ingIds   = JSON.parse(prov.ingredientes || '[]');
          const ingNames = ingIds.map(id => ingMap[id]).filter(Boolean);
          const waLink   = `https://wa.me/57${prov.telefono}`;
          return (
            <div key={prov.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>🚚 {prov.nombre}</span>
                    {prov.contacto_nombre && (
                      <span className="texto-suave" style={{ fontSize: 13 }}>
                        · {prov.contacto_nombre}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
                    <span>📞 {prov.telefono}</span>
                    {prov.horario_entrega && <span>🕐 {prov.horario_entrega}</span>}
                    {prov.dias_pedido && <span>📅 {prov.dias_pedido}</span>}
                    {prov.forma_pago && <span>💳 {prov.forma_pago}</span>}
                    {prov.tiempo_entrega && <span>⏱️ {prov.tiempo_entrega}</span>}
                  </div>
                  {ingNames.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {ingNames.map(n => (
                        <span key={n} className="badge badge-azul" style={{ fontSize: 11 }}>{n}</span>
                      ))}
                    </div>
                  )}
                  {prov.notas && (
                    <div style={{ fontSize: 12, color: 'var(--naranja)', fontStyle: 'italic' }}>
                      📝 {prov.notas}
                    </div>
                  )}
                </div>
                <div className="flex gap-8" style={{ marginLeft: 16, flexShrink: 0 }}>
                  <a href={waLink} target="_blank" rel="noreferrer"
                    className="btn btn-exito"
                    style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
                    📲 WhatsApp
                  </a>
                  <button className="btn btn-secundario"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => onEditar(prov)}>
                    ✏️ Editar
                  </button>
                  <button className="btn btn-peligro"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    onClick={() => onEliminar(prov.id)}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal Proveedor ───────────────────────────────────────────────────────────

function ModalProveedor({ proveedor, ingredientes, onCerrar, onGuardar }) {
  const esNuevo = !proveedor?.id;
  const [nombre,        setNombre]        = useState(proveedor?.nombre || '');
  const [contacto,      setContacto]      = useState(proveedor?.contacto_nombre || '');
  const [telefono,      setTelefono]      = useState(proveedor?.telefono || '');
  const [ingsSelec,     setIngsSelec]     = useState(() =>
    new Set(JSON.parse(proveedor?.ingredientes || '[]'))
  );
  const [horario,       setHorario]       = useState(proveedor?.horario_entrega || '');
  const [diasPedido,    setDiasPedido]    = useState(proveedor?.dias_pedido || '');
  const [minimoPedido,  setMinimoPedido]  = useState(proveedor?.minimo_pedido || '');
  const [formaPago,     setFormaPago]     = useState(proveedor?.forma_pago || '');
  const [tiempoEntrega, setTiempoEntrega] = useState(proveedor?.tiempo_entrega || '');
  const [notas,         setNotas]         = useState(proveedor?.notas || '');

  const ingsPorCat = useMemo(() => {
    const m = {};
    for (const i of ingredientes) {
      if (!m[i.categoria]) m[i.categoria] = [];
      m[i.categoria].push(i);
    }
    return m;
  }, [ingredientes]);

  const toggleIng = (id) => {
    setIngsSelec(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const guardar = () => {
    if (!nombre.trim()) return;
    onGuardar({
      nombre: nombre.trim(), contacto_nombre: contacto, telefono,
      ingredientes: Array.from(ingsSelec),
      horario_entrega: horario, dias_pedido: diasPedido,
      minimo_pedido: minimoPedido, forma_pago: formaPago,
      tiempo_entrega: tiempoEntrega, notas,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-titulo">
          {esNuevo ? '➕ Nuevo proveedor' : `✏️ Editar — ${proveedor.nombre}`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nombre del proveedor *</label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: El Coleo" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Contacto</label>
              <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
                placeholder="Ej: Don Luis" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Teléfono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                placeholder="Ej: 3104009492" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Horario de entrega</label>
              <input type="text" value={horario} onChange={e => setHorario(e.target.value)}
                placeholder="Ej: Lunes-Viernes 8am-12pm" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Días de pedido</label>
              <input type="text" value={diasPedido} onChange={e => setDiasPedido(e.target.value)}
                placeholder="Ej: Lunes y jueves" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Mínimo de pedido</label>
              <input type="text" value={minimoPedido} onChange={e => setMinimoPedido(e.target.value)}
                placeholder="Ej: $50.000" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Forma de pago</label>
              <input type="text" value={formaPago} onChange={e => setFormaPago(e.target.value)}
                placeholder="Ej: Efectivo, Nequi" />
            </div>
            <div className="form-grupo">
              <label className="form-label">Tiempo de entrega</label>
              <input type="text" value={tiempoEntrega} onChange={e => setTiempoEntrega(e.target.value)}
                placeholder="Ej: Mismo día, 2 horas" />
            </div>
            <div className="form-grupo" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Notas</label>
              <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: Pedido esta noche" />
            </div>
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: 8 }}>
              Ingredientes que suministra
              {ingsSelec.size > 0 && (
                <span className="badge badge-naranja" style={{ marginLeft: 8, fontSize: 11 }}>
                  {ingsSelec.size} seleccionados
                </span>
              )}
            </div>
            <div style={{
              border: '1px solid var(--borde)', borderRadius: 8,
              maxHeight: 260, overflowY: 'auto', padding: '8px 12px',
            }}>
              {Object.entries(ingsPorCat).map(([cat, ings]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto-suave)',
                    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {CATEGORIAS_ING_LABEL[cat] || cat}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ings.map(i => (
                      <label key={i.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 16, cursor: 'pointer', fontSize: 13,
                        background: ingsSelec.has(i.id) ? 'rgba(232,98,58,0.15)' : 'var(--fondo)',
                        border: `1px solid ${ingsSelec.has(i.id) ? 'var(--naranja)' : 'var(--borde)'}`,
                        fontWeight: ingsSelec.has(i.id) ? 600 : 400,
                      }}>
                        <input type="checkbox" checked={ingsSelec.has(i.id)}
                          onChange={() => toggleIng(i.id)}
                          style={{ width: 13, height: 13 }} />
                        {i.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!nombre.trim()} onClick={guardar}>
            {esNuevo ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Versión y actualizaciones
// ────────────────────────────────────────────────────────────────────────────

const CHANGELOG = [
  {
    version: '1.0.0',
    fecha: '2026-04-26',
    items: [
      'Sistema POS completo',
      'Inventario con semáforo de riesgo',
      'Gastos y compras integrados',
      'Cierre de caja con descuadre',
      'Sincronización Google Drive',
      'Impresión térmica 3nStar',
      'Login con roles (Administrador/Empleado)',
      'Rentabilidad por producto',
      'Reportes de ventas y gastos',
    ],
  },
];

function estadoLabel(estado) {
  switch (estado) {
    case 'checking':    return { texto: 'Verificando...', color: '#3498db' };
    case 'available':   return { texto: 'Actualización disponible', color: '#f39c12' };
    case 'downloading': return { texto: 'Descargando...', color: '#3498db' };
    case 'ready':       return { texto: 'Lista para instalar', color: '#27ae60' };
    case 'uptodate':    return { texto: 'Al día ✓', color: '#27ae60' };
    case 'error':       return { texto: 'Error al verificar', color: '#e74c3c' };
    default:            return { texto: 'Sin verificar', color: 'var(--texto-suave)' };
  }
}

function TabVersion({
  updateEstado, setUpdateEstado,
  updateVersion, setUpdateVersion,
  updateProgress, setUpdateProgress,
  updateError, setUpdateError,
}) {
  const pkgVersion = '1.0.0'; // sincronizado con package.json

  const buscarActualizaciones = async () => {
    setUpdateEstado('checking');
    setUpdateError(null);

    window.electronAPI.update_onAvailable((info) => {
      setUpdateEstado('downloading');
      setUpdateVersion(info.version);
    });
    window.electronAPI.update_onProgress((p) => {
      setUpdateEstado('downloading');
      setUpdateProgress(p);
    });
    window.electronAPI.update_onDownloaded((info) => {
      setUpdateEstado('ready');
      setUpdateVersion(info.version);
      setUpdateProgress(null);
    });
    window.electronAPI.update_onNotAvailable(() => {
      setUpdateEstado('uptodate');
    });
    window.electronAPI.update_onError((msg) => {
      setUpdateEstado('error');
      setUpdateError(msg);
    });

    const res = await window.electronAPI.update_check();
    if (!res.success && updateEstado === 'checking') {
      setUpdateEstado('error');
      setUpdateError(res.error || 'Error desconocido');
    }
  };

  const instalar = () => window.electronAPI.update_install();

  const { texto: estadoTexto, color: estadoColor } = estadoLabel(updateEstado);

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-titulo">Versión actual</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--naranja)' }}>
              v{pkgVersion}
            </div>
            <div style={{ color: 'var(--texto-suave)', fontSize: 13, marginTop: 2 }}>
              PA POS — Perros Americanos, CC Manila Fusagasugá
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: estadoColor, marginBottom: 8 }}>
              Estado: {estadoTexto}
            </div>
            {updateEstado === 'error' && updateError && (
              <div style={{ fontSize: 11, color: '#e74c3c', marginBottom: 8, maxWidth: 260 }}>
                {updateError}
              </div>
            )}
            {updateEstado !== 'ready' && (
              <button
                className="btn btn-primario"
                onClick={buscarActualizaciones}
                disabled={updateEstado === 'checking' || updateEstado === 'downloading'}
              >
                {updateEstado === 'checking' ? 'Verificando...' : 'Buscar actualizaciones'}
              </button>
            )}
            {updateEstado === 'ready' && (
              <button className="btn btn-primario" onClick={instalar}>
                Instalar v{updateVersion} y reiniciar
              </button>
            )}
          </div>
        </div>

        {updateProgress && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--texto-suave)' }}>Descargando actualización...</span>
              <span style={{ color: 'var(--texto-suave)' }}>{updateProgress.percent}%</span>
            </div>
            <div style={{ background: 'var(--fondo)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${updateProgress.percent}%`, height: '100%',
                background: '#3498db', transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
              {(updateProgress.transferred / 1048576).toFixed(1)} MB / {(updateProgress.total / 1048576).toFixed(1)} MB
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-titulo">Historial de versiones</div>
        {CHANGELOG.map(release => (
          <div key={release.version} style={{
            borderLeft: '3px solid var(--naranja)', paddingLeft: 16, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--naranja)' }}>v{release.version}</span>
              <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>{release.fecha}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {release.items.map(item => (
                <li key={item} style={{ fontSize: 13, marginBottom: 4, color: 'var(--texto)' }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

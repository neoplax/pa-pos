import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';

// Categorías de gasto disponibles en el formulario único
const CATEGORIAS_GASTO = [
  { value: 'insumos',       label: 'Compra de insumos'         },
  { value: 'arriendo',      label: 'Arriendo local'            },
  { value: 'nomina',        label: 'Nómina / Pago empleado'    },
  { value: 'servicios',     label: 'Servicios públicos'        },
  { value: 'mantenimiento', label: 'Mantenimiento'             },
  { value: 'publicidad',    label: 'Publicidad'                },
  { value: 'transporte',    label: 'Transporte'                },
  { value: 'impuestos',     label: 'Impuestos / Obligaciones'  },
  { value: 'otro',          label: 'Otro'                      },
];

const CAT_LABEL = Object.fromEntries(CATEGORIAS_GASTO.map(c => [c.value, c.label]));

// Normalizar texto para búsqueda insensible a mayúsculas y tildes
function normalizar(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function formatStock(ing) {
  if (ing.unidad === 'paquete' && ing.unidades_por_paquete > 0) {
    return `${ing.stock_actual} paq. (${ing.stock_actual * ing.unidades_por_paquete} und.)`;
  }
  return `${ing.stock_actual} ${ing.unidad}`;
}

function waUrl(telefono, mensaje) {
  return `https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`;
}

const CATEGORIAS_ING_LABEL = {
  carne: 'Carnes', pan: 'Panes', lacteo: 'Lácteos',
  vegetal: 'Vegetales', bebida: 'Bebidas', salsa: 'Salsas',
  topping: 'Toppings', desechable: 'Desechables',
  preparado: 'Preparados', otro: 'Otros',
};

export default function GastosCompras() {
  const { empleado, notificar } = useApp();
  const [tab, setTab] = useState('registrar');

  // Datos compartidos entre pestañas
  const [ingredientes, setIngredientes] = useState([]);
  const [proveedores, setProveedores]   = useState([]);
  const [empleados, setEmpleados]       = useState([]);
  const [gastos, setGastos]             = useState([]);
  const [cargando, setCargando]         = useState(false);

  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  const primerDiaMes = hoy.slice(0, 8) + '01';

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [ings, provs, emps, historial] = await Promise.all([
        window.electronAPI.getIngredientes(),
        window.electronAPI.getProveedores(),
        window.electronAPI.getEmpleados(),
        window.electronAPI.getGastos({ fechaInicio: primerDiaMes, fechaFin: hoy }),
      ]);
      setIngredientes(ings.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setProveedores(provs);
      setEmpleados(emps.filter(e => e.activo));
      setGastos(historial || []);
    } catch (err) {
      console.error('[GastosCompras]', err);
    } finally {
      setCargando(false);
    }
  }, [hoy, primerDiaMes]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <div className="pagina-titulo">$ Gastos &amp; Compras</div>

      {/* Tabs */}
      <div className="pos-tabs mb-24">
        <button className={`pos-tab ${tab === 'registrar' ? 'activo' : ''}`}
          onClick={() => setTab('registrar')}>
          Registrar
        </button>
        <button className={`pos-tab ${tab === 'pendientes' ? 'activo' : ''}`}
          onClick={() => setTab('pendientes')}>
          Pendientes por comprar
        </button>
        <button className={`pos-tab ${tab === 'historial' ? 'activo' : ''}`}
          onClick={() => setTab('historial')}>
          Historial ({gastos.length})
        </button>
        <button className={`pos-tab ${tab === 'proveedores' ? 'activo' : ''}`}
          onClick={() => setTab('proveedores')}>
          Proveedores
        </button>
      </div>

      {cargando && tab !== 'registrar' ? (
        <div className="cargando">Cargando...</div>
      ) : tab === 'registrar' ? (
        <TabRegistrar
          empleado={empleado}
          ingredientes={ingredientes}
          proveedores={proveedores}
          empleados={empleados}
          notificar={notificar}
          onGuardado={cargar}
        />
      ) : tab === 'pendientes' ? (
        <TabPendientes
          ingredientes={ingredientes}
          proveedores={proveedores}
          empleado={empleado}
          notificar={notificar}
          onGuardado={cargar}
        />
      ) : tab === 'historial' ? (
        <TabHistorial gastos={gastos} onActualizar={cargar} notificar={notificar} />
      ) : (
        <TabProveedores
          proveedores={proveedores}
          ingredientes={ingredientes}
          notificar={notificar}
          onActualizar={cargar}
        />
      )}
    </div>
  );
}

// ── Tab A: Registrar gasto/compra ─────────────────────────────────────────────

function TabRegistrar({ empleado, ingredientes, proveedores, empleados, notificar, onGuardado }) {
  const [categoria, setCategoria]           = useState('otro');
  const [fecha, setFecha]                   = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0]);
  const [descripcion, setDescripcion]       = useState('');
  const [monto, setMonto]                   = useState('');
  const [metodo, setMetodo]                 = useState('efectivo');
  const [mixtoEfectivo, setMixtoEfectivo]   = useState('');
  const [mixtoNequi, setMixtoNequi]         = useState('');
  const [comprobante, setComprobante]       = useState('');
  const [proveedorId, setProveedorId]       = useState('');
  const [esRecurrente, setEsRecurrente]     = useState(false);
  const [frecuencia, setFrecuencia]         = useState('mensual');
  const [notas, setNotas]                   = useState('');
  const [empleadoSel, setEmpleadoSel]       = useState('');
  const [guardando, setGuardando]           = useState(false);

  // Estado para compra de insumos (múltiples ítems)
  const [busquedaIng, setBusquedaIng]       = useState('');
  const [itemsCompra, setItemsCompra]       = useState([]); // [{ingrediente, cantidad, precio_unitario}]

  const ingsFiltrados = useMemo(() => {
    const base = ingredientes.filter(i => i.categoria !== 'preparado');
    if (!busquedaIng.trim()) return base;
    const q = normalizar(busquedaIng);
    return base.filter(i => normalizar(i.nombre).includes(q));
  }, [ingredientes, busquedaIng]);

  const agregarItemCompra = (ing) => {
    setItemsCompra(prev => {
      if (prev.find(i => i.ingrediente.id === ing.id)) return prev;
      return [...prev, { ingrediente: ing, cantidad: '', precio_unitario: '' }];
    });
    setBusquedaIng('');
  };

  const actualizarItemCompra = (idx, campo, valor) => {
    setItemsCompra(prev => prev.map((item, i) =>
      i === idx ? { ...item, [campo]: valor } : item
    ));
  };

  const quitarItemCompra = (idx) => {
    setItemsCompra(prev => prev.filter((_, i) => i !== idx));
  };

  const totalCompra = itemsCompra.reduce((sum, item) => {
    const c = parseFloat(item.cantidad) || 0;
    const p = parseFloat(item.precio_unitario) || 0;
    return sum + c * p;
  }, 0);

  const limpiar = () => {
    setDescripcion(''); setMonto(''); setComprobante('');
    setProveedorId(''); setEsRecurrente(false); setFrecuencia('mensual');
    setNotas(''); setEmpleadoSel(''); setItemsCompra([]); setBusquedaIng('');
    setMixtoEfectivo(''); setMixtoNequi('');
  };

  // Validación mixto
  const totalFormulario = categoria === 'insumos' ? totalCompra : (parseFloat(monto) || 0);
  const mixtoEfectivoN  = parseFloat(mixtoEfectivo) || 0;
  const mixtoNequiN     = parseFloat(mixtoNequi) || 0;
  const mixtoSuma       = mixtoEfectivoN + mixtoNequiN;
  const mixtoFalta      = totalFormulario - mixtoSuma;
  const mixtoValido     = metodo !== 'mixto' || (totalFormulario > 0 && Math.abs(mixtoFalta) < 1);

  const guardar = async (e) => {
    e.preventDefault();
    if (!mixtoValido) {
      notificar(`⚠️ Pago mixto: falta asignar $${Math.round(mixtoFalta).toLocaleString('es-CO')}`, 'error');
      return;
    }
    setGuardando(true);
    try {
      if (categoria === 'insumos') {
        // Registrar múltiples insumos en una compra
        const items = itemsCompra
          .filter(i => parseFloat(i.cantidad) > 0)
          .map(i => ({
            ingrediente_id:     i.ingrediente.id,
            ingrediente_nombre: i.ingrediente.nombre,
            cantidad:           parseFloat(i.cantidad),
            precio_unitario:    parseFloat(i.precio_unitario) || 0,
          }));

        if (items.length === 0) {
          notificar('⚠️ Agrega al menos un ingrediente con cantidad', 'error');
          setGuardando(false);
          return;
        }

        const prov = proveedores.find(p => p.id === parseInt(proveedorId));
        await window.electronAPI.registrarCompraMultiple({
          items,
          proveedor_id:    parseInt(proveedorId) || null,
          proveedor_nombre: prov?.nombre || '',
          empleado:        empleado || '',
          metodo_pago:     metodo,
          numero_comprobante: comprobante,
          monto_efectivo_mixto: metodo === 'mixto' ? mixtoEfectivoN : 0,
          monto_nequi_mixto:    metodo === 'mixto' ? mixtoNequiN    : 0,
        });
        notificar(`Compra de insumos registrada — ${items.length} ítems`, 'exito');
      } else {
        // Gasto general
        const desc = categoria === 'nomina'
          ? `Nómina: ${empleadoSel || descripcion}`
          : descripcion;

        if (!desc.trim() || !monto) {
          notificar('⚠️ Completa descripción y monto', 'error');
          setGuardando(false);
          return;
        }

        await window.electronAPI.registrarGasto({
          fecha:                `${fecha} 12:00:00`,
          descripcion:          desc.trim(),
          monto:                Math.round(parseFloat(monto)),
          categoria,
          metodo_pago:          metodo,
          empleado:             empleado || '',
          notas:                notas.trim(),
          numero_comprobante:   comprobante,
          proveedor_id:         parseInt(proveedorId) || null,
          es_recurrente:        esRecurrente,
          frecuencia_recurrente: esRecurrente ? frecuencia : '',
          monto_efectivo_mixto: metodo === 'mixto' ? mixtoEfectivoN : 0,
          monto_nequi_mixto:    metodo === 'mixto' ? mixtoNequiN    : 0,
        });
        notificar('Gasto registrado', 'exito');
      }

      limpiar();
      onGuardado();
    } catch (err) {
      notificar('Error al guardar', 'error');
      console.error('[GastosCompras] guardar:', err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="card-titulo">Registrar gasto / compra</div>
        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Fila 1: Fecha + Categoría */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Categoría</label>
              <select value={categoria} onChange={e => { setCategoria(e.target.value); limpiar(); setFecha(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0]); }}>
                {CATEGORIAS_GASTO.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sección especial: Compra de insumos */}
          {categoria === 'insumos' && (
            <div>
              <label className="form-label">Buscar ingrediente/insumo</label>
              <input
                type="text"
                value={busquedaIng}
                onChange={e => setBusquedaIng(e.target.value)}
                placeholder="Escribe para buscar..."
                autoComplete="off"
              />
              {/* Resultados de búsqueda */}
              {busquedaIng.trim() && (
                <div style={{
                  border: '1px solid var(--borde)', borderRadius: 8,
                  maxHeight: 200, overflowY: 'auto', marginTop: 4,
                  background: 'var(--fondo-card)',
                }}>
                  {ingsFiltrados.length === 0 ? (
                    <div style={{ padding: '10px 14px', color: 'var(--texto-suave)', fontSize: 13 }}>
                      Sin resultados
                    </div>
                  ) : ingsFiltrados.slice(0, 20).map(ing => (
                    <div
                      key={ing.id}
                      onClick={() => agregarItemCompra(ing)}
                      style={{
                        padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid var(--borde)',
                        display: 'flex', justifyContent: 'space-between',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--fondo)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <span style={{ fontWeight: 600 }}>{ing.nombre}</span>
                      <span style={{ color: 'var(--texto-suave)' }}>
                        {CATEGORIAS_ING_LABEL[ing.categoria] || ing.categoria} · stock: {formatStock(ing)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de ítems a comprar */}
              {itemsCompra.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Ítems a comprar:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {itemsCompra.map((item, idx) => {
                      const subtotal = (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0);
                      return (
                        <div key={idx} style={{
                          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto',
                          gap: 8, alignItems: 'center',
                          padding: '8px 10px', borderRadius: 8,
                          background: 'var(--fondo)', border: '1px solid var(--borde)',
                        }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{item.ingrediente.nombre}</span>
                          <input
                            type="text" inputMode="decimal"
                            value={item.cantidad}
                            onChange={e => actualizarItemCompra(idx, 'cantidad', e.target.value.replace(',', '.'))}
                            placeholder={`Cant. (${item.ingrediente.unidad})`}
                            style={{ fontSize: 13 }}
                          />
                          <input
                            type="text" inputMode="decimal"
                            value={item.precio_unitario}
                            onChange={e => actualizarItemCompra(idx, 'precio_unitario', e.target.value.replace(',', '.'))}
                            placeholder="P. unitario"
                            style={{ fontSize: 13 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--naranja)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            ${Math.round(subtotal).toLocaleString('es-CO')}
                          </span>
                          <button type="button" onClick={() => quitarItemCompra(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', fontSize: 16 }}>
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, fontSize: 15 }}>
                    Total: <span style={{ color: 'var(--naranja)' }}>${Math.round(totalCompra).toLocaleString('es-CO')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sección especial: Nómina → selector de empleado */}
          {categoria === 'nomina' && (
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Empleado</label>
              <select value={empleadoSel} onChange={e => setEmpleadoSel(e.target.value)}>
                <option value="">— Seleccionar empleado —</option>
                {empleados.map(emp => (
                  <option key={emp.id} value={emp.nombre}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descripción (para todo excepto insumos) */}
          {categoria !== 'insumos' && (
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Descripción *</label>
              <input
                type="text"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder={categoria === 'nomina' ? 'Período o concepto...' : 'Ej: Arriendo de abril, Gas natural...'}
                required={categoria !== 'insumos'}
              />
            </div>
          )}

          {/* Valor */}
          {categoria !== 'insumos' && (
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Valor ($) *</label>
              <input
                type="number" min="0" value={monto}
                onChange={e => setMonto(e.target.value)}
                placeholder="0"
                required
              />
            </div>
          )}

          {/* Método de pago + Comprobante */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Método de pago</label>
              <select value={metodo} onChange={e => { setMetodo(e.target.value); setMixtoEfectivo(''); setMixtoNequi(''); }}>
                <option value="efectivo">Efectivo</option>
                <option value="nequi">Nequi</option>
                <option value="transferencia">Transferencia</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">N° comprobante (opcional)</label>
              <input
                type="text" value={comprobante}
                onChange={e => setComprobante(e.target.value)}
                placeholder="Factura, recibo..."
              />
            </div>
          </div>

          {/* Sub-campos Mixto */}
          {metodo === 'mixto' && (
            <div style={{
              background: 'rgba(155,89,182,0.07)', border: '1px solid rgba(155,89,182,0.25)',
              borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-grupo" style={{ marginBottom: 0 }}>
                  <label className="form-label">Efectivo ($)</label>
                  <input
                    type="text" inputMode="decimal"
                    value={mixtoEfectivo}
                    onChange={e => setMixtoEfectivo(e.target.value.replace(',', '.'))}
                    placeholder="0"
                  />
                </div>
                <div className="form-grupo" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nequi ($)</label>
                  <input
                    type="text" inputMode="decimal"
                    value={mixtoNequi}
                    onChange={e => setMixtoNequi(e.target.value.replace(',', '.'))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--texto-suave)' }}>
                  Total: <strong>${Math.round(totalFormulario).toLocaleString('es-CO')}</strong>
                  {' · '}Asignado: <strong>${Math.round(mixtoSuma).toLocaleString('es-CO')}</strong>
                </span>
                {mixtoFalta > 0.5 ? (
                  <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>
                    Falta: ${Math.round(mixtoFalta).toLocaleString('es-CO')}
                  </span>
                ) : mixtoFalta < -0.5 ? (
                  <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>
                    Excede: ${Math.round(-mixtoFalta).toLocaleString('es-CO')}
                  </span>
                ) : (
                  <span style={{ color: 'var(--verde)', fontWeight: 700 }}>✅ OK</span>
                )}
              </div>
            </div>
          )}

          {/* Proveedor */}
          <div className="form-grupo" style={{ marginBottom: 0 }}>
            <label className="form-label">Proveedor (opcional)</label>
            <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Recurrente */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={esRecurrente}
                onChange={e => setEsRecurrente(e.target.checked)} />
              <span style={{ fontSize: 13 }}>¿Es recurrente?</span>
            </label>
            {esRecurrente && (
              <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)}
                style={{ fontSize: 13 }}>
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            )}
          </div>

          {/* Notas */}
          <div className="form-grupo" style={{ marginBottom: 0 }}>
            <label className="form-label">Notas (opcional)</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Detalles adicionales..." />
          </div>

          <button type="submit" className="btn btn-primario" disabled={guardando || !mixtoValido}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tab B: Pendientes por comprar ─────────────────────────────────────────────

function TabPendientes({ ingredientes, proveedores, empleado, notificar, onGuardado }) {
  const [modalCompra, setModalCompra] = useState(null);

  const urgentes   = ingredientes.filter(i => i.stock_actual === 0 && i.stock_minimo > 0);
  const bajos      = ingredientes.filter(i => i.stock_actual > 0 && i.stock_actual <= i.stock_minimo);
  const ok         = ingredientes.filter(i => i.stock_actual > i.stock_minimo);
  const pendientes = [...urgentes, ...bajos];

  const mapIngProv = useMemo(() => {
    const m = {};
    for (const prov of proveedores) {
      const ids = JSON.parse(prov.ingredientes || '[]');
      for (const id of ids) {
        if (!m[id]) m[id] = [];
        m[id].push(prov);
      }
    }
    return m;
  }, [proveedores]);

  const porProveedor = useMemo(() => {
    const grupos = {};
    const sinProv = [];
    for (const ing of pendientes) {
      const provs = mapIngProv[ing.id] || [];
      if (provs.length === 0) {
        sinProv.push(ing);
      } else {
        for (const prov of provs) {
          if (!grupos[prov.id]) grupos[prov.id] = { prov, items: [] };
          grupos[prov.id].items.push(ing);
        }
      }
    }
    return { grupos: Object.values(grupos), sinProv };
  }, [pendientes, mapIngProv]);

  const confirmarCompra = async (datos) => {
    try {
      await window.electronAPI.registrarCompra({ ...datos, empleado: empleado || '' });
      notificar(`Compra de "${datos.ingrediente_nombre}" registrada`, 'exito');
      setModalCompra(null);
      onGuardado();
    } catch {
      notificar('Error al registrar', 'error');
    }
  };

  if (pendientes.length === 0) {
    return (
      <div className="card">
        <div className="alerta verde">✅ ¡Inventario completo! No hay ítems por comprar.</div>
        {ok.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="card-titulo">Items con stock OK</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ok.map(i => <span key={i.id} className="badge badge-verde">{i.nombre}</span>)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid-3 mb-24">
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Urgente (stock = 0)</span>
          <span className="stat-valor texto-rojo">{urgentes.length}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amarillo)' }}>
          <span className="stat-label">Stock bajo</span>
          <span className="stat-valor" style={{ color: 'var(--amarillo)' }}>{bajos.length}</span>
        </div>
        <div className="stat-card verde">
          <span className="stat-label">Con stock OK</span>
          <span className="stat-valor texto-verde">{ok.length}</span>
        </div>
      </div>

      {porProveedor.grupos.map(({ prov, items }) => (
        <GrupoProveedor key={prov.id} prov={prov} items={items} onComprar={setModalCompra} />
      ))}

      {porProveedor.sinProv.length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo" style={{ color: 'var(--texto-suave)' }}>
            Sin proveedor asignado ({porProveedor.sinProv.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porProveedor.sinProv.map(ing => (
              <FilaItemPendiente key={ing.id} ing={ing} mapIngProv={mapIngProv} onComprar={setModalCompra} />
            ))}
          </div>
        </div>
      )}

      {modalCompra && (
        <ModalComprarItem
          ingrediente={modalCompra}
          onCerrar={() => setModalCompra(null)}
          onConfirmar={confirmarCompra}
        />
      )}
    </>
  );
}

function GrupoProveedor({ prov, items, onComprar }) {
  const contacto = prov.contacto_nombre || prov.nombre;
  const msgPedir = () => {
    const lineas = items.map(ing => {
      const falta = ing.stock_actual === 0
        ? `${ing.stock_minimo} ${ing.unidad}`
        : `${(ing.stock_minimo - ing.stock_actual).toFixed(1)} ${ing.unidad}`;
      return `- ${ing.nombre}: ${falta}`;
    }).join('\n');
    return `Hola ${contacto}, necesito pedir:\n${lineas}`;
  };

  return (
    <div className="card mb-16">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="card-titulo" style={{ marginBottom: 4 }}>{prov.nombre}</div>
          <div style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
            {prov.contacto_nombre && <span>{prov.contacto_nombre} · </span>}
            {prov.telefono}
          </div>
        </div>
        <a href={waUrl(prov.telefono, msgPedir())} target="_blank" rel="noreferrer"
          className="btn btn-exito"
          style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}>
          Pedir todo ({items.length})
        </a>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(ing => (
          <FilaItemPendiente key={ing.id} ing={ing} mapIngProv={{}} onComprar={onComprar} provPrincipal={prov} />
        ))}
      </div>
    </div>
  );
}

function FilaItemPendiente({ ing, mapIngProv, onComprar, provPrincipal }) {
  const esUrgente = ing.stock_actual === 0;
  const falta = esUrgente
    ? `${ing.stock_minimo} ${ing.unidad}`
    : `${(ing.stock_minimo - ing.stock_actual).toFixed(1)} ${ing.unidad}`;
  const provs = provPrincipal ? [provPrincipal] : (mapIngProv[ing.id] || []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 8,
      background: esUrgente ? 'rgba(231,76,60,0.08)' : 'rgba(243,156,18,0.06)',
      border: `1px solid ${esUrgente ? 'rgba(231,76,60,0.25)' : 'rgba(243,156,18,0.2)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!esUrgente && <span style={{ fontSize: 16 }}>⚠️</span>}
        <div>
          <div style={{ fontWeight: 700 }}>{ing.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
            {esUrgente ? 'Sin stock' : `Stock: ${formatStock(ing)}`}
            {' · '}
            <span style={{ color: esUrgente ? 'var(--rojo)' : 'var(--amarillo)', fontWeight: 700 }}>
              Pedir: {falta}
            </span>
          </div>
          {!provPrincipal && provs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {provs.map(p => (
                <a key={p.id}
                  href={waUrl(p.telefono, `Hola ${p.contacto_nombre || p.nombre}, necesito: ${ing.nombre} - ${falta}`)}
                  target="_blank" rel="noreferrer"
                  style={{
                    fontSize: 11, padding: '2px 8px',
                    background: 'rgba(52,152,219,0.12)',
                    border: '1px solid rgba(52,152,219,0.3)',
                    borderRadius: 12, color: 'var(--azul)',
                    textDecoration: 'none', fontWeight: 600,
                  }}>
                  {p.nombre} →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <button className="btn btn-exito"
        style={{ padding: '6px 14px', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 12 }}
        onClick={() => onComprar(ing)}>
        Compré
      </button>
    </div>
  );
}

function ModalComprarItem({ ingrediente, onCerrar, onConfirmar }) {
  const [cantidad,       setCantidad]       = useState('');
  const [precio,         setPrecio]         = useState('');
  const [proveedor,      setProveedor]      = useState('');
  const [metodo,         setMetodo]         = useState('efectivo');
  const [mixtoEfectivo,  setMixtoEfectivo]  = useState('');
  const [mixtoNequi,     setMixtoNequi]     = useState('');
  const [guardando,      setGuardando]      = useState(false);

  const cantidadN      = parseFloat(cantidad) || 0;
  const precioN        = Math.round(parseFloat(precio) || 0);
  const mixtoEfectivoN = parseFloat(mixtoEfectivo) || 0;
  const mixtoNequiN    = parseFloat(mixtoNequi) || 0;
  const mixtoSuma      = mixtoEfectivoN + mixtoNequiN;
  const mixtoFalta     = precioN - mixtoSuma;
  const mixtoValido    = metodo !== 'mixto' || (precioN > 0 && Math.abs(mixtoFalta) < 1);

  const guardar = async () => {
    if (!cantidadN || guardando || !mixtoValido) return;
    setGuardando(true);
    await onConfirmar({
      ingrediente_id: ingrediente.id, ingrediente_nombre: ingrediente.nombre,
      cantidad: cantidadN, precio_pagado: precioN, proveedor,
      metodo_pago: metodo,
      monto_efectivo_mixto: metodo === 'mixto' ? mixtoEfectivoN : 0,
      monto_nequi_mixto:    metodo === 'mixto' ? mixtoNequiN    : 0,
    });
    setGuardando(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">Registrar compra — {ingrediente.nombre}</div>
        <div className="alerta azul" style={{ marginBottom: 16 }}>
          Stock actual: <strong>{formatStock(ingrediente)}</strong>
          {ingrediente.stock_minimo > 0 && (
            <> · Mínimo: <strong>{ingrediente.stock_minimo} {ingrediente.unidad}</strong></>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Cantidad ({ingrediente.unidad})</label>
            <input type="text" inputMode="decimal" value={cantidad}
              onChange={e => setCantidad(e.target.value.replace(',', '.'))} autoFocus />
          </div>
          <div className="form-grupo">
            <label className="form-label">Precio pagado total ($)</label>
            <input type="text" inputMode="decimal" value={precio}
              onChange={e => setPrecio(e.target.value.replace(',', '.'))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Método de pago</label>
              <select value={metodo} onChange={e => { setMetodo(e.target.value); setMixtoEfectivo(''); setMixtoNequi(''); }}>
                <option value="efectivo">Efectivo</option>
                <option value="nequi">Nequi</option>
                <option value="transferencia">Transferencia</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Proveedor / tienda</label>
              <input type="text" value={proveedor}
                onChange={e => setProveedor(e.target.value)} placeholder="Opcional..." />
            </div>
          </div>
          {metodo === 'mixto' && (
            <div style={{
              background: 'rgba(155,89,182,0.07)', border: '1px solid rgba(155,89,182,0.25)',
              borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-grupo" style={{ marginBottom: 0 }}>
                  <label className="form-label">Efectivo ($)</label>
                  <input type="text" inputMode="decimal" value={mixtoEfectivo}
                    onChange={e => setMixtoEfectivo(e.target.value.replace(',', '.'))} placeholder="0" />
                </div>
                <div className="form-grupo" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nequi ($)</label>
                  <input type="text" inputMode="decimal" value={mixtoNequi}
                    onChange={e => setMixtoNequi(e.target.value.replace(',', '.'))} placeholder="0" />
                </div>
              </div>
              <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texto-suave)' }}>
                  Total: <strong>${precioN.toLocaleString('es-CO')}</strong>
                  {' · '}Asignado: <strong>${Math.round(mixtoSuma).toLocaleString('es-CO')}</strong>
                </span>
                {mixtoFalta > 0.5 ? (
                  <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>Falta: ${Math.round(mixtoFalta).toLocaleString('es-CO')}</span>
                ) : mixtoFalta < -0.5 ? (
                  <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>Excede: ${Math.round(-mixtoFalta).toLocaleString('es-CO')}</span>
                ) : (
                  <span style={{ color: 'var(--verde)', fontWeight: 700 }}>✅ OK</span>
                )}
              </div>
            </div>
          )}
          {cantidadN > 0 && (
            <div className="alerta verde" style={{ margin: 0 }}>
              Nuevo stock: <strong>
                {ingrediente.unidad === 'paquete' && ingrediente.unidades_por_paquete > 0
                  ? `${ingrediente.stock_actual + cantidadN} paquetes`
                  : `${(ingrediente.stock_actual + cantidadN).toFixed(1)} ${ingrediente.unidad}`}
              </strong>
            </div>
          )}
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!cantidadN || guardando || !mixtoValido} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab C: Historial completo ─────────────────────────────────────────────────

function TabHistorial({ gastos, onActualizar, notificar }) {
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroMetodo, setFiltroMetodo]       = useState('todos');
  const [diasRango, setDiasRango]             = useState(30);
  const [modalEdit, setModalEdit]             = useState(null);

  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  const fechaInicio = (() => {
    const d = new Date(); d.setDate(d.getDate() - diasRango);
    return new Date(d - d.getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  })();

  const filtrados = gastos.filter(g => {
    if (filtroCategoria !== 'todos' && g.categoria !== filtroCategoria) return false;
    if (filtroMetodo !== 'todos' && (g.metodo_pago || 'efectivo') !== filtroMetodo) return false;
    return true;
  });

  const totalFiltrado = filtrados.reduce((s, g) => s + (g.monto || 0), 0);

  const porCategoria = {};
  for (const g of filtrados) {
    porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.monto;
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    await window.electronAPI.eliminarGasto(id);
    notificar('Gasto eliminado', 'info');
    onActualizar();
  };

  return (
    <div>
      {/* Filtros */}
      <div className="card mb-16">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-grupo" style={{ marginBottom: 0, minWidth: 130 }}>
            <label className="form-label">Período</label>
            <select value={diasRango} onChange={e => setDiasRango(parseInt(e.target.value))}>
              <option value={7}>7 días</option>
              <option value={15}>15 días</option>
              <option value={30}>30 días</option>
              <option value={90}>3 meses</option>
            </select>
          </div>
          <div className="form-grupo" style={{ marginBottom: 0, minWidth: 180 }}>
            <label className="form-label">Categoría</label>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="todos">Todas</option>
              {CATEGORIAS_GASTO.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="form-grupo" style={{ marginBottom: 0, minWidth: 140 }}>
            <label className="form-label">Método</label>
            <select value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="transferencia">Transferencia</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Resumen por categoría */}
      {Object.keys(porCategoria).length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo">Resumen por categoría</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Object.entries(porCategoria)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => (
                <div key={cat} style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'var(--fondo)', border: '1px solid var(--borde)',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12 }}>{(CAT_LABEL[cat] || cat).split(' ').slice(0, 2).join(' ')}</span>
                  <span className="texto-rojo negrita">${total.toLocaleString('es-CO')}</span>
                </div>
              ))}
          </div>
          <div style={{
            marginTop: 12, display: 'flex', justifyContent: 'flex-end',
            fontWeight: 700, fontSize: 15,
          }}>
            TOTAL EGRESOS:&nbsp;
            <span className="texto-rojo">${totalFiltrado.toLocaleString('es-CO')}</span>
          </div>
        </div>
      )}

      {/* Tabla historial */}
      <div className="card">
        <div className="card-titulo">
          Historial ({filtrados.length} registros)
        </div>
        {filtrados.length === 0 ? (
          <div className="vacio">Sin registros para los filtros seleccionados</div>
        ) : (
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Método</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Empleado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(g => (
                  <tr key={`${g.tipo_registro || 'g'}-${g.id}`}>
                    <td className="texto-suave">{(g.fecha || '').split(' ')[0]}</td>
                    <td className="negrita">{g.descripcion}</td>
                    <td>
                      <span className="badge badge-azul" style={{ fontSize: 11 }}>
                        {CAT_LABEL[g.categoria] || g.categoria || ''}
                      </span>
                    </td>
                    <td className="texto-suave">
                      {(g.metodo_pago || 'efectivo') === 'mixto' ? (
                        <span title={`Efectivo: $${(g.monto_efectivo_mixto||0).toLocaleString('es-CO')} · Nequi: $${(g.monto_nequi_mixto||0).toLocaleString('es-CO')}`}>
                          Mixto
                          <div style={{ fontSize: 10, color: 'var(--texto-suave)', lineHeight: 1.3 }}>
                            Ef. ${(g.monto_efectivo_mixto||0).toLocaleString('es-CO')} / Nq. ${(g.monto_nequi_mixto||0).toLocaleString('es-CO')}
                          </div>
                        </span>
                      ) : (g.metodo_pago || 'efectivo')}
                    </td>
                    <td style={{ textAlign: 'right' }} className="texto-rojo negrita">
                      ${(g.monto || 0).toLocaleString('es-CO')}
                    </td>
                    <td className="texto-suave">{g.empleado || '—'}</td>
                    <td>
                      {g.tipo_registro !== 'compra' && (
                        <button onClick={() => eliminar(g.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', fontSize: 14 }}
                          title="Eliminar">
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalEdit && (
        <ModalEditarGasto
          gasto={modalEdit}
          onCerrar={() => setModalEdit(null)}
          onGuardar={async (id, datos) => {
            await window.electronAPI.updateGasto(id, datos);
            notificar('Gasto actualizado', 'exito');
            setModalEdit(null);
            onActualizar();
          }}
        />
      )}
    </div>
  );
}

function ModalEditarGasto({ gasto, onCerrar, onGuardar }) {
  const [desc, setDesc]     = useState(gasto.descripcion || '');
  const [monto, setMonto]   = useState(gasto.monto || '');
  const [cat, setCat]       = useState(gasto.categoria || 'otro');
  const [metodo, setMetodo] = useState(gasto.metodo_pago || 'efectivo');
  const [notas, setNotas]   = useState(gasto.notas || '');

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">Editar Gasto</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Descripción</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="form-grupo">
            <label className="form-label">Monto ($)</label>
            <input type="number" min="0" value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="form-grupo">
            <label className="form-label">Categoría</label>
            <select value={cat} onChange={e => setCat(e.target.value)}>
              {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-grupo">
            <label className="form-label">Método</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div className="form-grupo">
            <label className="form-label">Notas</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario"
            onClick={() => onGuardar(gasto.id, {
              descripcion: desc,
              monto: Math.round(parseFloat(monto) || 0),
              categoria: cat, metodo_pago: metodo, notas,
            })}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab D: Proveedores ────────────────────────────────────────────────────────

function TabProveedores({ proveedores, ingredientes, notificar, onActualizar }) {
  const [modalProv, setModalProv]   = useState(null);
  const [confirmElim, setConfirmElim] = useState(null);

  const ingMap = useMemo(() => {
    const m = {};
    for (const i of ingredientes) m[i.id] = i.nombre;
    return m;
  }, [ingredientes]);

  const guardar = async (datos) => {
    if (modalProv?.id) {
      await window.electronAPI.updateProveedor(modalProv.id, datos);
      notificar('Proveedor actualizado', 'exito');
    } else {
      await window.electronAPI.agregarProveedor(datos);
      notificar('Proveedor creado', 'exito');
    }
    setModalProv(null);
    onActualizar();
  };

  const eliminar = async (id) => {
    await window.electronAPI.eliminarProveedor(id);
    notificar('Proveedor eliminado', 'exito');
    setConfirmElim(null);
    onActualizar();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-16">
        <div style={{ fontWeight: 700, fontSize: 16 }}>{proveedores.length} proveedores</div>
        <button className="btn btn-primario" onClick={() => setModalProv({})}>
          Nuevo proveedor
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {proveedores.map(prov => {
          const ingIds   = JSON.parse(prov.ingredientes || '[]');
          const ingNames = ingIds.map(id => ingMap[id]).filter(Boolean);
          return (
            <div key={prov.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{prov.nombre}</span>
                    {prov.contacto_nombre && (
                      <span className="texto-suave" style={{ fontSize: 13 }}>· {prov.contacto_nombre}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
                    <span>{prov.telefono}</span>
                    {prov.horario_entrega && <span>{prov.horario_entrega}</span>}
                    {prov.forma_pago && <span>{prov.forma_pago}</span>}
                  </div>
                  {ingNames.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ingNames.map(n => (
                        <span key={n} className="badge badge-azul" style={{ fontSize: 11 }}>{n}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-8" style={{ marginLeft: 16, flexShrink: 0 }}>
                  <a href={`https://wa.me/57${prov.telefono}`} target="_blank" rel="noreferrer"
                    className="btn btn-exito"
                    style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>
                    WA
                  </a>
                  <button className="btn btn-secundario"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setModalProv(prov)}>
                    Editar
                  </button>
                  <button className="btn btn-peligro"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    onClick={() => setConfirmElim(prov.id)}>
                    ×
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modalProv !== null && (
        <ModalProveedor
          proveedor={modalProv}
          ingredientes={ingredientes}
          onCerrar={() => setModalProv(null)}
          onGuardar={guardar}
        />
      )}

      {confirmElim !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-titulo">Eliminar proveedor</div>
            <p style={{ marginBottom: 24 }}>¿Confirmas eliminar este proveedor?</p>
            <div className="modal-acciones">
              <button className="btn btn-secundario" onClick={() => setConfirmElim(null)}>Cancelar</button>
              <button className="btn btn-peligro" onClick={() => eliminar(confirmElim)}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalProveedor({ proveedor, ingredientes, onCerrar, onGuardar }) {
  const esNuevo = !proveedor?.id;
  const [nombre,        setNombre]       = useState(proveedor?.nombre || '');
  const [contacto,      setContacto]     = useState(proveedor?.contacto_nombre || '');
  const [telefono,      setTelefono]     = useState(proveedor?.telefono || '');
  const [ingsSelec,     setIngsSelec]    = useState(
    () => new Set(JSON.parse(proveedor?.ingredientes || '[]'))
  );
  const [horario,       setHorario]      = useState(proveedor?.horario_entrega || '');
  const [diasPedido,    setDiasPedido]   = useState(proveedor?.dias_pedido || '');
  const [minimoPedido,  setMinimoPedido] = useState(proveedor?.minimo_pedido || '');
  const [formaPago,     setFormaPago]    = useState(proveedor?.forma_pago || '');
  const [tiempoEntrega, setTiempoEntrega] = useState(proveedor?.tiempo_entrega || '');
  const [notas,         setNotas]        = useState(proveedor?.notas || '');
  const [busqueda,      setBusqueda]     = useState('');

  const ingsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return ingredientes;
    const q = normalizar(busqueda);
    return ingredientes.filter(i => normalizar(i.nombre).includes(q));
  }, [ingredientes, busqueda]);

  const toggleIng = (id) => {
    setIngsSelec(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-titulo">
          {esNuevo ? 'Nuevo proveedor' : `Editar — ${proveedor.nombre}`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nombre *</label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <div className="form-grupo">
              <label className="form-label">Contacto</label>
              <input type="text" value={contacto} onChange={e => setContacto(e.target.value)} />
            </div>
            <div className="form-grupo">
              <label className="form-label">Teléfono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} />
            </div>
            <div className="form-grupo">
              <label className="form-label">Horario de entrega</label>
              <input type="text" value={horario} onChange={e => setHorario(e.target.value)} />
            </div>
            <div className="form-grupo">
              <label className="form-label">Forma de pago</label>
              <input type="text" value={formaPago} onChange={e => setFormaPago(e.target.value)} />
            </div>
            <div className="form-grupo" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Notas</label>
              <input type="text" value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>

          {/* Ingredientes asignados */}
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>
              Ingredientes que suministra
              {ingsSelec.size > 0 && (
                <span className="badge badge-naranja" style={{ marginLeft: 8, fontSize: 11 }}>
                  {ingsSelec.size} sel.
                </span>
              )}
            </div>
            <input type="text" value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar ingrediente..."
              style={{ marginBottom: 6 }}
            />
            <div style={{
              border: '1px solid var(--borde)', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto', padding: '8px 12px',
            }}>
              {ingsFiltrados.map(i => (
                <label key={i.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', cursor: 'pointer', fontSize: 13,
                }}>
                  <input type="checkbox" checked={ingsSelec.has(i.id)}
                    onChange={() => toggleIng(i.id)} />
                  <span style={{ fontWeight: ingsSelec.has(i.id) ? 600 : 400 }}>{i.nombre}</span>
                  <span style={{ color: 'var(--texto-suave)', fontSize: 11 }}>
                    ({CATEGORIAS_ING_LABEL[i.categoria] || i.categoria})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={!nombre.trim()}
            onClick={() => onGuardar({
              nombre, contacto_nombre: contacto, telefono,
              ingredientes: Array.from(ingsSelec),
              horario_entrega: horario, dias_pedido: diasPedido,
              minimo_pedido: minimoPedido, forma_pago: formaPago,
              tiempo_entrega: tiempoEntrega, notas,
            })}>
            {esNuevo ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

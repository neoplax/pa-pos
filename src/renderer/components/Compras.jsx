import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';

function formatStock(ing) {
  if (ing.unidad === 'paquete' && ing.unidades_por_paquete > 0) {
    return `${ing.stock_actual} paquetes (${ing.stock_actual * ing.unidades_por_paquete} unidades)`;
  }
  return `${ing.stock_actual} ${ing.unidad}`;
}

function waUrl(telefono, mensaje) {
  return `https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`;
}

const CATEGORIAS_LABEL = {
  carne:      '🥩 Carnes',
  pan:        '🍞 Panes',
  lacteo:     '🧀 Lácteos',
  vegetal:    '🥦 Vegetales',
  bebida:     '🥤 Bebidas',
  salsa:      '🫙 Salsas',
  topping:    '🌽 Toppings',
  desechable: '🛍️ Desechables',
  otro:       '📦 Otros insumos',
};

export default function Compras() {
  const { empleado, notificar } = useApp();
  const [tab, setTab]                   = useState('proveedor');
  const [ingredientes, setIngredientes] = useState([]);
  const [proveedores, setProveedores]   = useState([]);
  const [compras, setCompras]           = useState([]);
  const [totalMes, setTotalMes]         = useState(0);
  const [cargando, setCargando]         = useState(true);
  const [modalCompra, setModalCompra]   = useState(null);
  const [modalManual, setModalManual]   = useState(false);

  const hoy          = new Date().toISOString().split('T')[0];
  const primerDiaMes = hoy.slice(0, 8) + '01';

  const cargar = useCallback(async () => {
    try {
      const [ings, provs, historial] = await Promise.all([
        window.electronAPI.getIngredientes(),
        window.electronAPI.getProveedores(),
        window.electronAPI.getCompras({ fechaInicio: primerDiaMes, fechaFin: hoy }),
      ]);
      setIngredientes(ings);
      setProveedores(provs);
      setCompras(historial);
      setTotalMes(historial.reduce((s, c) => s + c.precio_pagado, 0));
    } catch (err) {
      console.error('[Compras] Error:', err);
    } finally {
      setCargando(false);
    }
  }, [hoy, primerDiaMes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Mapa ingId -> [proveedor, ...]
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

  const urgentes   = ingredientes.filter(i => i.stock_actual === 0 && i.stock_minimo > 0);
  const bajos      = ingredientes.filter(i => i.stock_actual > 0 && i.stock_actual <= i.stock_minimo);
  const pendientes = [...urgentes, ...bajos];
  const ok         = ingredientes.filter(i => i.stock_actual > i.stock_minimo);

  // Agrupar pendientes por proveedor
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

  // Agrupar pendientes por categoría (vista alternativa)
  const bajosPorCat = useMemo(() => {
    const m = {};
    for (const ing of pendientes) {
      if (!m[ing.categoria]) m[ing.categoria] = [];
      m[ing.categoria].push(ing);
    }
    return m;
  }, [pendientes]);

  const confirmarCompra = async (datos) => {
    try {
      await window.electronAPI.registrarCompra({ ...datos, empleado: empleado || '' });
      notificar(`✅ Compra de "${datos.ingrediente_nombre}" registrada`, 'exito');
      setModalCompra(null);
      setModalManual(false);
      cargar();
    } catch (err) {
      notificar('❌ Error al registrar la compra', 'error');
    }
  };

  if (cargando) return <div className="cargando">⏳ Cargando...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-24">
        <div className="pagina-titulo" style={{ marginBottom: 0 }}>🛍️ Compras</div>
        <div className="flex gap-8">
          <button className="btn btn-primario" onClick={() => setModalManual(true)}>
            ➕ Compra manual
          </button>
          <button className="btn btn-secundario" onClick={cargar}>🔄</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="pos-tabs mb-24">
        <button className={`pos-tab ${tab === 'proveedor' ? 'activo' : ''}`}
          onClick={() => setTab('proveedor')}>
          🚚 Por proveedor ({pendientes.length})
        </button>
        <button className={`pos-tab ${tab === 'categoria' ? 'activo' : ''}`}
          onClick={() => setTab('categoria')}>
          📦 Por categoría
        </button>
        <button className={`pos-tab ${tab === 'historial' ? 'activo' : ''}`}
          onClick={() => setTab('historial')}>
          📋 Historial del mes
        </button>
      </div>

      {tab === 'proveedor' && (
        <TabPorProveedor
          porProveedor={porProveedor}
          urgentes={urgentes}
          bajos={bajos}
          ok={ok}
          mapIngProv={mapIngProv}
          onComprar={setModalCompra}
        />
      )}

      {tab === 'categoria' && (
        <TabPorCategoria
          bajosPorCat={bajosPorCat}
          urgentes={urgentes}
          bajos={bajos}
          ok={ok}
          mapIngProv={mapIngProv}
          onComprar={setModalCompra}
        />
      )}

      {tab === 'historial' && (
        <TabHistorial compras={compras} totalMes={totalMes} />
      )}

      {modalCompra && (
        <ModalRegistrarCompra
          ingrediente={modalCompra}
          onCerrar={() => setModalCompra(null)}
          onConfirmar={confirmarCompra}
        />
      )}

      {modalManual && (
        <ModalCompraManual
          ingredientes={ingredientes}
          onCerrar={() => setModalManual(false)}
          onConfirmar={confirmarCompra}
        />
      )}
    </div>
  );
}

// ── Tab Por Proveedor ─────────────────────────────────────────────────────────

function TabPorProveedor({ porProveedor, urgentes, bajos, ok, mapIngProv, onComprar }) {
  const { grupos, sinProv } = porProveedor;
  const pendientes = urgentes.length + bajos.length;

  if (pendientes === 0) {
    return (
      <div className="card">
        <div className="alerta verde">✅ ¡Inventario completo! No hay ítems que comprar.</div>
        <div style={{ marginTop: 16 }}>
          <div className="card-titulo">Items con stock OK</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ok.map(i => <span key={i.id} className="badge badge-verde">{i.nombre}</span>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Resumen */}
      <div className="grid-3 mb-24">
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-icono">🚨</span>
          <span className="stat-label">Urgente (stock = 0)</span>
          <span className="stat-valor texto-rojo">{urgentes.length}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amarillo)' }}>
          <span className="stat-icono">⚠️</span>
          <span className="stat-label">Stock bajo</span>
          <span className="stat-valor" style={{ color: 'var(--amarillo)' }}>{bajos.length}</span>
        </div>
        <div className="stat-card verde">
          <span className="stat-icono">✅</span>
          <span className="stat-label">Con stock OK</span>
          <span className="stat-valor texto-verde">{ok.length}</span>
        </div>
      </div>

      {/* Grupos por proveedor */}
      {grupos.map(({ prov, items }) => (
        <GrupoProveedor
          key={prov.id}
          prov={prov}
          items={items}
          onComprar={onComprar}
        />
      ))}

      {/* Ítems sin proveedor asignado */}
      {sinProv.length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo" style={{ color: 'var(--texto-suave)' }}>
            ❓ Sin proveedor asignado ({sinProv.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sinProv.map(ing => (
              <FilaItem key={ing.id} ing={ing} mapIngProv={mapIngProv} onComprar={onComprar} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function GrupoProveedor({ prov, items, onComprar }) {
  const nombre = prov.contacto_nombre || prov.nombre;

  const msgPedir = () => {
    const lineas = items.map(ing => {
      const falta = ing.stock_actual === 0
        ? `${ing.stock_minimo} ${ing.unidad}`
        : `${(ing.stock_minimo - ing.stock_actual).toFixed(1)} ${ing.unidad}`;
      return `- ${ing.nombre}: ${falta}`;
    }).join('\n');
    return `Hola ${nombre}, necesito pedir:\n${lineas}`;
  };

  return (
    <div className="card mb-16">
      {/* Header del proveedor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="card-titulo" style={{ marginBottom: 4 }}>🚚 {prov.nombre}</div>
          <div style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
            {prov.contacto_nombre && <span>{prov.contacto_nombre} · </span>}
            📞 {prov.telefono}
          </div>
        </div>
        <div className="flex gap-8">
          <a
            href={waUrl(prov.telefono, msgPedir())}
            target="_blank"
            rel="noreferrer"
            className="btn btn-exito"
            style={{ padding: '8px 14px', fontSize: 13, textDecoration: 'none' }}
          >
            📲 Pedir todo ({items.length} ítems)
          </a>
        </div>
      </div>

      {/* Ítems */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(ing => (
          <FilaItem key={ing.id} ing={ing} mapIngProv={{}} onComprar={onComprar}
            provPrincipal={prov} />
        ))}
      </div>
    </div>
  );
}

function FilaItem({ ing, mapIngProv, onComprar, provPrincipal }) {
  const esUrgente = ing.stock_actual === 0;
  const falta = esUrgente
    ? `${ing.stock_minimo} ${ing.unidad}`
    : `${(ing.stock_minimo - ing.stock_actual).toFixed(1)} ${ing.unidad}`;

  const provs = provPrincipal ? [provPrincipal] : (mapIngProv[ing.id] || []);

  const msgWa = (prov) => {
    const nombre = prov.contacto_nombre || prov.nombre;
    return `Hola ${nombre}, necesito: ${ing.nombre} - ${falta}`;
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 8,
      background: esUrgente ? 'rgba(231,76,60,0.08)' : 'rgba(243,156,18,0.06)',
      border: `1px solid ${esUrgente ? 'rgba(231,76,60,0.25)' : 'rgba(243,156,18,0.2)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16 }}>{esUrgente ? '🚨' : '⚠️'}</span>
        <div>
          <div style={{ fontWeight: 700 }}>{ing.nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
            {esUrgente ? 'Sin stock' : `Stock: ${formatStock(ing)}`}
            {' · '}
            <span style={{ color: esUrgente ? 'var(--rojo)' : 'var(--amarillo)', fontWeight: 700 }}>
              Pedir: {falta}
            </span>
          </div>
          {/* Chips de proveedor (solo en vista por categoría) */}
          {!provPrincipal && provs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {provs.map(p => (
                <a
                  key={p.id}
                  href={waUrl(p.telefono, msgWa(p))}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11, padding: '2px 8px',
                    background: 'rgba(52,152,219,0.12)',
                    border: '1px solid rgba(52,152,219,0.3)',
                    borderRadius: 12, color: 'var(--azul)',
                    textDecoration: 'none', fontWeight: 600,
                  }}
                >
                  🚚 {p.nombre} →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        className="btn btn-exito"
        style={{ padding: '6px 14px', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 12 }}
        onClick={() => onComprar(ing)}
      >
        🛒 Compré
      </button>
    </div>
  );
}

// ── Tab Por Categoría ─────────────────────────────────────────────────────────

function TabPorCategoria({ bajosPorCat, urgentes, bajos, ok, mapIngProv, onComprar }) {
  if (urgentes.length + bajos.length === 0) {
    return (
      <div className="card">
        <div className="alerta verde">✅ ¡Inventario completo! No hay ítems que comprar.</div>
      </div>
    );
  }

  return (
    <>
      {Object.entries(bajosPorCat).map(([cat, ings]) => (
        <div key={cat} className="card mb-16">
          <div className="card-titulo">{CATEGORIAS_LABEL[cat] || cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ings.map(ing => (
              <FilaItem key={ing.id} ing={ing} mapIngProv={mapIngProv} onComprar={onComprar} />
            ))}
          </div>
        </div>
      ))}
      {ok.length > 0 && (
        <div className="card">
          <div className="card-titulo">✅ Stock suficiente ({ok.length} items)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ok.map(i => <span key={i.id} className="badge badge-verde">{i.nombre}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab Historial ─────────────────────────────────────────────────────────────

function TabHistorial({ compras, totalMes }) {
  if (compras.length === 0) {
    return <div className="card"><div className="vacio">No hay compras registradas este mes.</div></div>;
  }

  const porItem = {};
  for (const c of compras) {
    if (!porItem[c.ingrediente_nombre]) porItem[c.ingrediente_nombre] = { total: 0, veces: 0 };
    porItem[c.ingrediente_nombre].total += c.precio_pagado;
    porItem[c.ingrediente_nombre].veces += 1;
  }
  const topItems = Object.entries(porItem).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  return (
    <div>
      <div className="grid-3 mb-24">
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-icono">💸</span>
          <span className="stat-label">Total gastado este mes</span>
          <span className="stat-valor texto-rojo">${totalMes.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card azul">
          <span className="stat-icono">🧾</span>
          <span className="stat-label">Compras registradas</span>
          <span className="stat-valor">{compras.length}</span>
        </div>
        <div className="stat-card amarillo">
          <span className="stat-icono">📦</span>
          <span className="stat-label">Ítems distintos</span>
          <span className="stat-valor">{Object.keys(porItem).length}</span>
        </div>
      </div>

      {topItems.length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo">💸 Mayor gasto por ítem</div>
          {topItems.map(([nombre, data]) => (
            <div key={nombre} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--borde)', fontSize: 14,
            }}>
              <span style={{ fontWeight: 600 }}>{nombre}</span>
              <span>
                <span className="texto-rojo negrita">${data.total.toLocaleString('es-CO')}</span>
                <span className="texto-suave" style={{ marginLeft: 8, fontSize: 12 }}>
                  ({data.veces} {data.veces === 1 ? 'compra' : 'compras'})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-titulo">📋 Detalle del mes</div>
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Ítem</th><th>Cantidad</th>
                <th>Precio pagado</th><th>Proveedor</th><th>Empleado</th>
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id}>
                  <td className="texto-suave">
                    {new Date(c.fecha).toLocaleString('es-CO', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="negrita">{c.ingrediente_nombre}</td>
                  <td>{c.cantidad}</td>
                  <td className="texto-rojo negrita">${c.precio_pagado.toLocaleString('es-CO')}</td>
                  <td className="texto-suave">{c.proveedor || '—'}</td>
                  <td className="texto-suave">{c.empleado || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700, paddingTop: 8 }}>TOTAL MES</td>
                <td className="texto-rojo negrita" style={{ paddingTop: 8 }}>
                  ${totalMes.toLocaleString('es-CO')}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Modal Registrar Compra ────────────────────────────────────────────────────

function ModalRegistrarCompra({ ingrediente, onCerrar, onConfirmar }) {
  const [cantidad,  setCantidad]  = useState('');
  const [precio,    setPrecio]    = useState('');
  const [proveedor, setProveedor] = useState('');
  const [guardando, setGuardando] = useState(false);

  const precioN   = Math.round(parseFloat(precio)   || 0);
  const cantidadN = parseFloat(cantidad) || 0;

  const guardar = async () => {
    if (!cantidadN || guardando) return;
    setGuardando(true);
    await onConfirmar({
      ingrediente_id: ingrediente.id, ingrediente_nombre: ingrediente.nombre,
      cantidad: cantidadN, precio_pagado: precioN, proveedor,
    });
    setGuardando(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">🛒 Registrar compra — {ingrediente.nombre}</div>
        <div className="alerta azul" style={{ marginBottom: 16 }}>
          Stock actual: <strong>{formatStock(ingrediente)}</strong>
          {ingrediente.stock_minimo > 0 && (
            <> · Mínimo: <strong>{ingrediente.stock_minimo} {ingrediente.unidad}</strong></>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Cantidad comprada ({ingrediente.unidad})</label>
            <input type="number" min="0.1" step="any" value={cantidad}
              onChange={e => setCantidad(e.target.value)} placeholder="Ej: 10" autoFocus />
          </div>
          <div className="form-grupo">
            <label className="form-label">Precio pagado total ($)</label>
            <input type="number" min="0" step="any" value={precio}
              onChange={e => setPrecio(e.target.value)} placeholder="Ej: 25000" />
          </div>
          <div className="form-grupo">
            <label className="form-label">Proveedor / tienda (opcional)</label>
            <input type="text" value={proveedor}
              onChange={e => setProveedor(e.target.value)}
              placeholder="Ej: Éxito, El Coleo..." />
          </div>
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
          <button className="btn btn-primario" disabled={!cantidadN || guardando} onClick={guardar}>
            {guardando ? '⏳ Guardando...' : '✅ Confirmar compra'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Compra Manual ───────────────────────────────────────────────────────

function ModalCompraManual({ ingredientes, onCerrar, onConfirmar }) {
  const [ingId,     setIngId]     = useState('');
  const [cantidad,  setCantidad]  = useState('');
  const [precio,    setPrecio]    = useState('');
  const [proveedor, setProveedor] = useState('');
  const [guardando, setGuardando] = useState(false);

  const ingSel    = ingredientes.find(i => i.id === parseInt(ingId));
  const cantidadN = parseFloat(cantidad) || 0;
  const precioN   = Math.round(parseFloat(precio) || 0);

  const guardar = async () => {
    if (!ingId || !cantidadN || guardando) return;
    setGuardando(true);
    await onConfirmar({
      ingrediente_id: ingSel.id, ingrediente_nombre: ingSel.nombre,
      cantidad: cantidadN, precio_pagado: precioN, proveedor,
    });
    setGuardando(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">➕ Registrar compra manual</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grupo">
            <label className="form-label">Ingrediente / insumo</label>
            <select value={ingId} onChange={e => setIngId(e.target.value)}>
              <option value="">— Selecciona un ítem —</option>
              {ingredientes.map(i => (
                <option key={i.id} value={i.id}>
                  {i.nombre} (stock: {i.stock_actual} {i.unidad})
                </option>
              ))}
            </select>
          </div>
          <div className="form-grupo">
            <label className="form-label">Cantidad{ingSel ? ` (${ingSel.unidad})` : ''}</label>
            <input type="number" min="0.1" step="any" value={cantidad}
              onChange={e => setCantidad(e.target.value)} placeholder="Ej: 10" disabled={!ingId} />
          </div>
          <div className="form-grupo">
            <label className="form-label">Precio pagado total ($)</label>
            <input type="number" min="0" step="any" value={precio}
              onChange={e => setPrecio(e.target.value)} placeholder="Ej: 25000" disabled={!ingId} />
          </div>
          <div className="form-grupo">
            <label className="form-label">Proveedor / tienda (opcional)</label>
            <input type="text" value={proveedor}
              onChange={e => setProveedor(e.target.value)}
              placeholder="Ej: Éxito, El Coleo..." />
          </div>
          {ingSel && cantidadN > 0 && (
            <div className="alerta verde" style={{ margin: 0 }}>
              Nuevo stock de <strong>{ingSel.nombre}</strong>:{' '}
              <strong>{(ingSel.stock_actual + cantidadN).toFixed(1)} {ingSel.unidad}</strong>
            </div>
          )}
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario"
            disabled={!ingId || !cantidadN || guardando} onClick={guardar}>
            {guardando ? '⏳ Guardando...' : '✅ Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';

const GASEOSAS_COMBO = ['Colombianita', 'Pepsi chiquita', 'Manzana Zero', 'Coca-Cola 250ml'];

const CATEGORIAS = [
  { id: 'principal', label: '🌭 Principales' },
  { id: 'combo',     label: '🎉 Combos'      },
  { id: 'adicion',   label: '➕ Adiciones'  },
  { id: 'bebida',    label: '🥤 Bebidas'     },
];

// Plataformas de domicilio externo con su comisión por defecto
const PLATAFORMAS = [
  { id: 'rappi',          label: 'Rappi',           comision: 30 },
  { id: 'ifood',          label: 'iFood',            comision: 25 },
  { id: 'domicilios_com', label: 'Domicilios.com',  comision: 20 },
  { id: 'whatsapp',       label: 'WhatsApp (propio)', comision: 0 },
  { id: 'otro',           label: 'Otro',             comision: 0  },
];

const EMOJIS_PROD = {
  'Perro Americano':            '🌭',
  'Choripán':                   '🥖',
  'Salchipapa Americana':       '🍟',
  'Hamburguesa Artesanal':      '🍔',
  'Combo Perro + Gaseosa':     '🌭🥤',
  'Combo Choripán + Gaseosa':  '🥖🥤',
  'Combo Salchipapa + Gaseosa': '🍟🥤',
  'Combo Hamburguesa':          '🍔🥤',
};

function getEmoji(nombre) {
  for (const [k, v] of Object.entries(EMOJIS_PROD)) {
    if (nombre.includes(k) || k.includes(nombre)) return v;
  }
  if (nombre.includes('Tocineta'))    return '🥓';
  if (nombre.includes('Queso'))       return '🧀';
  if (nombre.includes('Carne'))       return '🥩';
  if (nombre.includes('Papa'))        return '🍟';
  if (nombre.includes('Chorizo'))     return '🌭';
  if (nombre.includes('Salchicha'))   return '🌭';
  if (nombre.includes('Coca-Cola'))   return '🥤';
  if (nombre.includes('Pepsi'))       return '🥤';
  if (nombre.includes('Pony Malta'))  return '🍺';
  if (nombre.includes('Poker'))       return '🍺';
  if (nombre.includes('Águila'))      return '🍺';
  if (nombre.includes('Club'))        return '🍺';
  if (nombre.includes('Colombianita')) return '🍺';
  if (nombre.includes('Coronita'))    return '🍺';
  if (nombre.includes('Cola y Pola')) return '🍺';
  if (nombre.includes('Bretaña'))     return '🥤';
  if (nombre.includes('Qatro'))       return '🥤';
  if (nombre.includes('Agua'))        return '💧';
  return '🍽️';
}

export default function POS() {
  const { empleado, setEmpleado, notificar } = useApp();

  // ── Estado de selección de mesa ───────────────────────────────────────────
  const [mesas, setMesas]             = useState([]);
  const [mesaActual, setMesaActual]   = useState(null); // null = aún no seleccionada
  // mesaActual = { id, nombre, numero } | { id: 0, nombre: 'Para llevar' }

  // ── Estado del POS ────────────────────────────────────────────────────────
  const [productos, setProductos]     = useState([]);
  const [carrito, setCarrito]         = useState([]);
  const [categoria, setCategoria]     = useState('principal');
  const [metodoPago, setMetodoPago]   = useState('efectivo');
  const [efectivoMixto, setEfectivoMixto]   = useState('');
  const [nequiMixto, setNequiMixto]         = useState('');
  const [esDomicilio, setEsDomicilio]       = useState(false);
  const [valorDomicilio, setValorDomicilio] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [procesando, setProcesando]   = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pendingCombo, setPendingCombo] = useState(null);

  // ── Estado descuentos ─────────────────────────────────────────────────────
  const [descuentoAplicado, setDescuentoAplicado] = useState(null);
  // { id, nombre, tipo, valor }
  const [modalDescuentos, setModalDescuentos]     = useState(false);
  const [descuentosDisponibles, setDescuentosDisponibles] = useState([]);

  // ── Estado domicilio externo ───────────────────────────────────────────────
  const [esDomicilioExterno, setEsDomicilioExterno]   = useState(false);
  const [plataforma, setPlataforma]                   = useState('');
  const [numeroOrden, setNumeroOrden]                 = useState('');
  const [comisionPct, setComisionPct]                 = useState('');

  const refGuardar = useRef(null); // para auto-guardar el carrito cuando cambia

  // ── Cargar productos ──────────────────────────────────────────────────────
  const cargarProductos = useCallback(async () => {
    try {
      const prods = await window.electronAPI.getProductos();
      setProductos(prods);
    } catch (err) {
      console.error('[POS] Error cargando productos:', err);
    }
  }, []);

  // ── Cargar mesas ──────────────────────────────────────────────────────────
  const cargarMesas = useCallback(async () => {
    try {
      const data = await window.electronAPI.getMesas();
      setMesas(data || []);
    } catch (err) {
      console.error('[POS] Error cargando mesas:', err);
    }
  }, []);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  // ── Auto-guardar carrito en DB cuando la mesa está seleccionada ────────────
  useEffect(() => {
    if (!mesaActual || mesaActual.id === 0) return; // Para llevar: no persiste
    clearTimeout(refGuardar.current);
    refGuardar.current = setTimeout(async () => {
      await window.electronAPI.guardarPedidoPendiente({
        mesa_id:    mesaActual.id,
        mesa_nombre: mesaActual.nombre,
        empleado:   empleado || '',
        items:      carrito,
      });
    }, 400);
  }, [carrito, mesaActual, empleado]);

  // ── Seleccionar mesa: cargar pedido pendiente si existe ───────────────────
  const seleccionarMesa = async (mesa) => {
    setMesaActual(mesa);
    if (mesa.id === 0) {
      // Para llevar: carrito limpio
      setCarrito([]);
      return;
    }
    try {
      const pendiente = await window.electronAPI.getPedidoPendiente(mesa.id);
      if (pendiente && pendiente.items && pendiente.items.length > 0) {
        setCarrito(pendiente.items);
        notificar(`📋 Retomando pedido de ${mesa.nombre} — ${pendiente.items.length} ítems`, 'info');
      } else {
        setCarrito([]);
      }
    } catch (err) {
      setCarrito([]);
    }
    // Actualizar estado de mesas al volver
    cargarMesas();
  };

  // ── Volver al selector de mesas ───────────────────────────────────────────
  const volverSelectorMesas = async () => {
    // Guardar carrito sincronamente antes de limpiar estado (evita race condition con debounce)
    if (mesaActual && mesaActual.id !== 0 && carrito.length > 0) {
      clearTimeout(refGuardar.current);
      await window.electronAPI.guardarPedidoPendiente({
        mesa_id:    mesaActual.id,
        mesa_nombre: mesaActual.nombre,
        empleado:   empleado || '',
        items:      carrito,
      });
    }
    setMesaActual(null);
    setCarrito([]);
    setDescuentoAplicado(null);
    setEsDomicilio(false);
    setValorDomicilio('');
    setEfectivoRecibido('');
    setEsDomicilioExterno(false);
    setPlataforma('');
    setNumeroOrden('');
    setComisionPct('');
    setConfirmando(false);
    cargarMesas();
  };

  const prodsFiltrados = productos.filter(p => p.categoria === categoria && p.activo);

  const agregarItem = (producto) => {
    if (producto.categoria === 'combo') {
      setPendingCombo(producto);
      return;
    }
    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id && !i.nota);
      if (existe) {
        return prev.map(i => i.id === producto.id && !i.nota
          ? { ...i, cantidad: i.cantidad + 1 }
          : i
        );
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const confirmarGaseosa = (gaseosa_nombre) => {
    const prod = pendingCombo;
    setPendingCombo(null);
    setCarrito(prev => {
      const existe = prev.find(i => i.id === prod.id && i.nota === gaseosa_nombre);
      if (existe) {
        return prev.map(i =>
          (i.id === prod.id && i.nota === gaseosa_nombre)
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [...prev, { ...prod, cantidad: 1, nota: gaseosa_nombre }];
    });
  };

  const cambiarCantidad = (id, nota, delta) => {
    setCarrito(prev => {
      const nuevo = prev.map(i =>
        (i.id === id && (i.nota || '') === (nota || ''))
          ? { ...i, cantidad: Math.max(0, i.cantidad + delta) }
          : i
      );
      return nuevo.filter(i => i.cantidad > 0);
    });
  };

  const eliminarItem = (id, nota) =>
    setCarrito(prev => prev.filter(i => !(i.id === id && (i.nota || '') === (nota || ''))));

  const vaciarCarrito = async () => {
    setCarrito([]);
    setDescuentoAplicado(null);
    setEsDomicilio(false);
    setValorDomicilio('');
    setEfectivoRecibido('');
    setEsDomicilioExterno(false);
    setPlataforma('');
    setNumeroOrden('');
    setComisionPct('');
    // Eliminar pedido pendiente de la mesa si aplica
    if (mesaActual && mesaActual.id !== 0) {
      await window.electronAPI.eliminarPedidoPendiente(mesaActual.id);
    }
  };

  // ── Cálculos de totales ────────────────────────────────────────────────────
  const subtotal          = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const valorDomicilioN   = Math.round(parseFloat(valorDomicilio) || 0);

  // Valor del descuento según tipo
  const calcularDescuento = (desc, base) => {
    if (!desc) return 0;
    if (desc.tipo === 'porcentaje') return Math.round(base * (desc.valor / 100));
    if (desc.tipo === 'fijo')       return Math.round(Math.min(desc.valor, base));
    return 0; // 'gratis' se gestiona manualmente
  };
  const descuentoValor    = calcularDescuento(descuentoAplicado, subtotal);

  // Total: subtotal - descuento + domicilio
  const totalAntesDeDescuento = subtotal + (esDomicilio ? valorDomicilioN : 0);
  const total                 = Math.max(0, totalAntesDeDescuento - descuentoValor);

  const comisionPctN          = parseFloat(comisionPct) || 0;
  const comisionValorN        = Math.round(total * (comisionPctN / 100));
  const valorNetoPlataforma   = total - comisionValorN;

  const efectivoMixtoN        = Math.round(parseFloat(efectivoMixto) || 0);
  const nequiMixtoN           = Math.round(parseFloat(nequiMixto) || 0);
  const efectivoRecibidoN     = Math.round(parseFloat(efectivoRecibido) || 0);
  const cambio                = efectivoRecibidoN - total;
  const mixtoValido           = metodoPago !== 'mixto' || (efectivoMixtoN + nequiMixtoN === total);

  // ── Abrir modal de descuentos: refresca lista activa ──────────────────────
  const abrirModalDescuentos = async () => {
    try {
      const lista = await window.electronAPI.getDescuentosActivos();
      setDescuentosDisponibles(lista || []);
      setModalDescuentos(true);
    } catch (err) {
      notificar('Error al cargar descuentos', 'error');
    }
  };

  const aplicarDescuento = (desc) => {
    setDescuentoAplicado(desc);
    setModalDescuentos(false);
    notificar(`✅ Descuento "${desc.nombre}" aplicado`, 'exito');
  };

  const quitarDescuento = () => {
    setDescuentoAplicado(null);
    notificar('Descuento eliminado', 'info');
  };

  // ── Confirmar venta ───────────────────────────────────────────────────────
  const confirmarVenta = async (conImpresion = false) => {
    if (!empleado || carrito.length === 0 || procesando || !mixtoValido) return;

    setProcesando(true);
    try {
      let facturaNum = 0;
      if (conImpresion) {
        facturaNum = await window.electronAPI.getNextFactura();
      }

      const ventaData = {
        empleado,
        total,
        metodo_pago: metodoPago,
        monto_efectivo_mixto: metodoPago === 'mixto' ? efectivoMixtoN : 0,
        monto_nequi_mixto:    metodoPago === 'mixto' ? nequiMixtoN    : 0,
        domicilio:            esDomicilio ? valorDomicilioN : 0,
        efectivo_recibido:    metodoPago === 'efectivo' ? efectivoRecibidoN : 0,
        // Descuento
        descuento_id:    descuentoAplicado?.id    || null,
        descuento_valor: descuentoValor,
        descuento_nombre: descuentoAplicado?.nombre || '',
        // Mesa
        mesa_id:    mesaActual?.id   !== 0 ? (mesaActual?.id   || null) : null,
        mesa_nombre: mesaActual?.id  !== 0 ? (mesaActual?.nombre || '') : 'Para llevar',
        // Domicilio externo
        plataforma_domicilio:    esDomicilio && esDomicilioExterno ? plataforma  : '',
        numero_orden_domicilio:  esDomicilio && esDomicilioExterno ? numeroOrden : '',
        comision_domicilio_pct:  esDomicilio && esDomicilioExterno ? comisionPctN    : 0,
        comision_domicilio_valor: esDomicilio && esDomicilioExterno ? comisionValorN : 0,
        items: carrito.map(i => ({
          producto_id:     i.id,
          cantidad:        i.cantidad,
          precio_unitario: i.precio,
          nota:            i.nota || '',
        })),
      };

      const result = await window.electronAPI.crearVenta(ventaData);
      if (result.ok) {
        if (conImpresion && facturaNum > 0) {
          await window.electronAPI.asignarFactura(result.ventaId, facturaNum, efectivoRecibidoN);
          const printResult = await window.electronAPI.imprimirRecibo({
            ventaId: result.ventaId,
            efectivo_recibido: efectivoRecibidoN,
          });
          if (printResult?.aviso === 'impresora_no_disponible') {
            notificar('⚠️ Impresora no disponible — recibo guardado como .txt', 'info');
          }
        }
        notificar(`✅ Venta #${result.ventaId} registrada — $${total.toLocaleString('es-CO')}`, 'exito');
        // Volver al selector de mesas después de cobrar
        volverSelectorMesas();
      }
    } catch (err) {
      notificar('❌ Error al registrar la venta', 'error');
      console.error('[POS] Error al crear venta:', err);
    } finally {
      setProcesando(false);
    }
  };

  const reimprimirUltimo = async () => {
    const ultima = await window.electronAPI.getUltimaVenta();
    if (!ultima || !ultima.factura_num) {
      notificar('No hay recibo anterior para reimprimir', 'error');
      return;
    }
    await window.electronAPI.imprimirRecibo({ ventaId: ultima.id, efectivo_recibido: ultima.efectivo_recibido });
    notificar(`🖨️ Reimprimiendo factura #${ultima.factura_num}`, 'exito');
  };

  // ── Pantalla de selección de empleado ─────────────────────────────────────
  if (!empleado) {
    return (
      <div className="empleado-overlay">
        <div className="empleado-modal">
          <h2>¿Quién está de turno?</h2>
          <p>Selecciona tu nombre para iniciar el turno</p>
          <div className="empleado-opciones">
            {['Juan', 'Sofía'].map(nombre => (
              <button key={nombre} className="empleado-btn" onClick={() => setEmpleado(nombre)}>
                <span className="emp-avatar">{nombre === 'Juan' ? '👨‍🍳' : '👩‍🍳'}</span>
                {nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Pantalla de selección de mesa ──────────────────────────────────────────
  if (!mesaActual) {
    return (
      <SelectorMesas
        mesas={mesas}
        empleado={empleado}
        onCargar={cargarMesas}
        onSeleccionar={seleccionarMesa}
      />
    );
  }

  // ── POS principal ─────────────────────────────────────────────────────────
  return (
    <div className="pos-layout" style={{ position: 'relative' }}>
      {/* Modal descuentos */}
      {modalDescuentos && (
        <ModalDescuentos
          descuentos={descuentosDisponibles}
          subtotal={subtotal}
          onAplicar={aplicarDescuento}
          onCerrar={() => setModalDescuentos(false)}
        />
      )}

      {/* Modal gaseosa combo */}
      {pendingCombo && (
        <ModalGaseosa
          producto={pendingCombo}
          onSeleccionar={confirmarGaseosa}
          onCancelar={() => setPendingCombo(null)}
        />
      )}

      {/* ── Panel izquierdo: productos ── */}
      <div className="pos-productos-panel">
        <div className="flex items-center justify-between">
          <div className="pagina-titulo" style={{ marginBottom: 0 }}>🛒 Punto de Venta</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-naranja">
              {mesaActual.id === 0 ? '🛵 Para llevar' : `🪑 ${mesaActual.nombre}`}
            </span>
            <span className="badge badge-azul">Turno: {empleado}</span>
            <button
              style={{
                background: 'none', border: '1px solid var(--borde)',
                borderRadius: 6, color: 'var(--texto-suave)',
                cursor: 'pointer', fontSize: 11, padding: '2px 8px',
              }}
              title="Cambiar mesa"
              onClick={volverSelectorMesas}
            >
              ← Mesas
            </button>
          </div>
        </div>

        {/* Tabs de categoría */}
        <div className="pos-tabs">
          {CATEGORIAS.map(cat => (
            <button
              key={cat.id}
              className={`pos-tab ${categoria === cat.id ? 'activo' : ''}`}
              onClick={() => setCategoria(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div className="pos-grid">
          {prodsFiltrados.map(prod => (
            <button
              key={prod.id}
              className="producto-btn"
              onClick={() => agregarItem(prod)}
            >
              <span style={{ fontSize: 28 }}>{getEmoji(prod.nombre)}</span>
              <span className="prod-nombre">{prod.nombre}</span>
              <span className="prod-precio">
                ${prod.precio.toLocaleString('es-CO')}
              </span>
            </button>
          ))}
          {prodsFiltrados.length === 0 && (
            <div className="vacio" style={{ gridColumn: '1/-1', padding: 32 }}>
              No hay productos en esta categoría
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: carrito ── */}
      <div className="pos-carrito">
        <div className="carrito-header">
          <span>🧾 Pedido{mesaActual.id !== 0 ? ` — ${mesaActual.nombre}` : ' — Para llevar'}</span>
          {carrito.length > 0 && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--rojo)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              onClick={vaciarCarrito}
            >
              Vaciar
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div className="carrito-items">
          {carrito.length === 0 ? (
            <div className="vacio" style={{ padding: '32px 16px', fontSize: 14 }}>
              Agrega productos para<br/>comenzar el pedido
            </div>
          ) : (
            carrito.map(item => (
              <div key={`${item.id}_${item.nota || ''}`} className="carrito-item">
                <div className="carrito-item-nombre">
                  {item.nombre}
                  {item.nota && (
                    <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 1 }}>
                      + {item.nota}
                    </div>
                  )}
                </div>
                <div className="carrito-controles">
                  <button className="ctrl-btn rojo" onClick={() => cambiarCantidad(item.id, item.nota, -1)}>
                    {item.cantidad === 1 ? '🗑' : '−'}
                  </button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>
                    {item.cantidad}
                  </span>
                  <button className="ctrl-btn" onClick={() => cambiarCantidad(item.id, item.nota, 1)}>+</button>
                </div>
                <div className="carrito-item-precio">
                  ${(item.precio * item.cantidad).toLocaleString('es-CO')}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer del carrito */}
        <div className="carrito-footer">
          {/* Botón aplicar descuento */}
          {carrito.length > 0 && !descuentoAplicado && (
            <button
              style={{
                width: '100%', padding: '6px 12px', marginBottom: 6,
                background: 'none', border: '1px dashed var(--naranja)',
                color: 'var(--naranja)', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
              onClick={abrirModalDescuentos}
            >
              🏷️ Aplicar descuento
            </button>
          )}

          {/* Descuento aplicado */}
          {descuentoAplicado && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 10px', marginBottom: 6,
              background: 'rgba(76,175,80,0.1)', border: '1px solid var(--verde)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 13, color: 'var(--verde)', fontWeight: 600 }}>
                🏷️ {descuentoAplicado.nombre}
                {descuentoAplicado.tipo === 'porcentaje' && ` (${descuentoAplicado.valor}%)`}
                {descuentoAplicado.tipo === 'fijo' && ` (-$${descuentoAplicado.valor.toLocaleString('es-CO')})`}
              </span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', fontSize: 16 }}
                onClick={quitarDescuento}
                title="Quitar descuento"
              >
                ×
              </button>
            </div>
          )}

          {/* Método de pago */}
          <div>
            <div className="form-label" style={{ marginBottom: 8 }}>Método de pago</div>
            <div className="pago-selector">
              {[
                { id: 'efectivo', label: '💵 Efectivo' },
                { id: 'nequi',    label: '📱 Nequi'    },
                { id: 'mixto',    label: '🔀 Mixto'    },
              ].map(mp => (
                <button
                  key={mp.id}
                  className={`pago-opcion ${metodoPago === mp.id ? 'activo' : ''}`}
                  onClick={() => { setMetodoPago(mp.id); setEfectivoMixto(''); setNequiMixto(''); setEfectivoRecibido(''); }}
                >
                  {mp.label}
                </button>
              ))}
            </div>

            {/* Efectivo recibido + cambio */}
            {metodoPago === 'efectivo' && (
              <div style={{ marginTop: 8 }}>
                <div className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>💵 Efectivo recibido</div>
                <input
                  type="number" min="0" value={efectivoRecibido}
                  onChange={e => setEfectivoRecibido(e.target.value)}
                  placeholder={`Mín. $${total.toLocaleString('es-CO')}`}
                  style={{ width: '100%' }}
                />
                {efectivoRecibidoN > 0 && (
                  <div style={{
                    fontSize: 13, fontWeight: 700, marginTop: 4,
                    color: cambio >= 0 ? 'var(--verde)' : 'var(--rojo)',
                  }}>
                    {cambio >= 0
                      ? `CAMBIO: $${cambio.toLocaleString('es-CO')}`
                      : `⚠️ Faltan $${Math.abs(cambio).toLocaleString('es-CO')}`}
                  </div>
                )}
              </div>
            )}

            {/* Campos mixto */}
            {metodoPago === 'mixto' && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>💵 Efectivo</div>
                    <input type="number" min="0" value={efectivoMixto}
                      onChange={e => setEfectivoMixto(e.target.value)} placeholder="0" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="form-label" style={{ fontSize: 12, marginBottom: 4 }}>📱 Nequi</div>
                    <input type="number" min="0" value={nequiMixto}
                      onChange={e => setNequiMixto(e.target.value)} placeholder="0" style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: mixtoValido ? 'var(--verde)' : 'var(--rojo)' }}>
                  {mixtoValido
                    ? `✅ Suma correcta: $${total.toLocaleString('es-CO')}`
                    : `⚠️ Suma: $${(efectivoMixtoN + nequiMixtoN).toLocaleString('es-CO')} — debe ser $${total.toLocaleString('es-CO')}`}
                </div>
              </div>
            )}
          </div>

          {/* Domicilio toggle */}
          <div style={{ padding: '6px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={esDomicilio}
                onChange={e => {
                  setEsDomicilio(e.target.checked);
                  if (!e.target.checked) {
                    setValorDomicilio('');
                    setEsDomicilioExterno(false);
                    setPlataforma('');
                    setNumeroOrden('');
                    setComisionPct('');
                  }
                }} />
              🛵 Es domicilio
            </label>

            {esDomicilio && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="number" min="0" value={valorDomicilio}
                  onChange={e => setValorDomicilio(e.target.value)}
                  placeholder="Valor domicilio ($)" style={{ width: '100%', fontSize: 13 }}
                />

                {/* Tipo de domicilio */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`pago-opcion ${!esDomicilioExterno ? 'activo' : ''}`}
                    style={{ flex: 1, fontSize: 12 }}
                    onClick={() => { setEsDomicilioExterno(false); setPlataforma(''); setNumeroOrden(''); setComisionPct(''); }}
                  >
                    🛵 Propio
                  </button>
                  <button
                    className={`pago-opcion ${esDomicilioExterno ? 'activo' : ''}`}
                    style={{ flex: 1, fontSize: 12 }}
                    onClick={() => setEsDomicilioExterno(true)}
                  >
                    📱 Plataforma
                  </button>
                </div>

                {/* Campos plataforma externa */}
                {esDomicilioExterno && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select
                      value={plataforma}
                      onChange={e => {
                        setPlataforma(e.target.value);
                        const plt = PLATAFORMAS.find(p => p.id === e.target.value);
                        if (plt) setComisionPct(String(plt.comision));
                      }}
                      style={{ width: '100%', fontSize: 13 }}
                    >
                      <option value="">Seleccionar plataforma...</option>
                      {PLATAFORMAS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>

                    <input
                      type="text" value={numeroOrden}
                      onChange={e => setNumeroOrden(e.target.value)}
                      placeholder="Número de orden (ej: RAP-12345)"
                      style={{ width: '100%', fontSize: 13 }}
                    />

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 2 }}>Comisión %</div>
                        <input
                          type="number" min="0" max="100" value={comisionPct}
                          onChange={e => setComisionPct(e.target.value)}
                          style={{ width: '100%', fontSize: 13 }}
                        />
                      </div>
                      {comisionPctN > 0 && total > 0 && (
                        <div style={{ flex: 1, textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>Comisión</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rojo)' }}>
                            -${comisionValorN.toLocaleString('es-CO')}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--verde)' }}>
                            Neto: ${valorNetoPlataforma.toLocaleString('es-CO')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totales */}
          <div className="carrito-total">
            {/* Mostrar subtotal si hay descuento o domicilio */}
            {(descuentoAplicado || (esDomicilio && valorDomicilioN > 0)) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 2 }}>
                <span>Subtotal productos</span>
                <span>${subtotal.toLocaleString('es-CO')}</span>
              </div>
            )}
            {esDomicilio && valorDomicilioN > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 2 }}>
                <span>🛵 Domicilio</span>
                <span>+${valorDomicilioN.toLocaleString('es-CO')}</span>
              </div>
            )}
            {descuentoAplicado && descuentoValor > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: 'var(--verde)' }}>
                  <s style={{ color: 'var(--texto-suave)', marginRight: 4 }}>
                    ${totalAntesDeDescuento.toLocaleString('es-CO')}
                  </s>
                  DCTO. {descuentoAplicado.nombre}
                </span>
                <span style={{ color: 'var(--verde)', fontWeight: 700 }}>
                  -${descuentoValor.toLocaleString('es-CO')}
                </span>
              </div>
            )}
            <span>TOTAL</span>
            <span>${total.toLocaleString('es-CO')}</span>
          </div>

          {/* Reimprimir último recibo */}
          <button
            style={{
              fontSize: 11, background: 'none', border: 'none',
              color: 'var(--texto-suave)', cursor: 'pointer',
              padding: '4px 0', textAlign: 'left',
            }}
            onClick={reimprimirUltimo}
          >
            🔁 Reimprimir último recibo
          </button>

          {/* Botones cobrar */}
          {!confirmando ? (
            <button
              className="btn btn-primario btn-grande"
              style={{ width: '100%' }}
              disabled={carrito.length === 0}
              onClick={() => setConfirmando(true)}
            >
              ✅ Cobrar ${total.toLocaleString('es-CO')}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="alerta azul" style={{ marginBottom: 0, fontSize: 12 }}>
                {mesaActual.id !== 0 ? `🪑 ${mesaActual.nombre} · ` : '🛵 Para llevar · '}
                {esDomicilio ? `Domicilio · ` : ''}
                ${total.toLocaleString('es-CO')} en {metodoPago === 'mixto'
                  ? `mixto (💵${efectivoMixtoN.toLocaleString('es-CO')}+📱${nequiMixtoN.toLocaleString('es-CO')})`
                  : metodoPago}
                {metodoPago === 'efectivo' && cambio >= 0
                  ? ` · cambio $${cambio.toLocaleString('es-CO')}`
                  : ''}
                {descuentoAplicado ? ` · DCTO. -$${descuentoValor.toLocaleString('es-CO')}` : ''}
              </div>
              <button className="btn btn-secundario" style={{ width: '100%', fontSize: 12 }}
                onClick={() => setConfirmando(false)}>
                ← Cancelar
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-primario"
                  style={{ flex: 1, fontSize: 12 }}
                  disabled={procesando || !mixtoValido}
                  onClick={() => confirmarVenta(false)}
                >
                  {procesando ? '⏳...' : '✅ Cobrar sin imprimir'}
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: 12, background: 'var(--azul)', color: '#fff' }}
                  disabled={procesando || !mixtoValido}
                  onClick={() => confirmarVenta(true)}
                >
                  {procesando ? '⏳...' : '🖨️ Cobrar e Imprimir'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Selector de mesas ──────────────────────────────────────────────────────────
function SelectorMesas({ mesas, empleado, onCargar, onSeleccionar }) {
  useEffect(() => { onCargar(); }, [onCargar]);

  const colorEstado = { libre: 'var(--verde)', activo: 'var(--naranja)', pendiente: 'var(--rojo)' };
  const labelEstado = { libre: 'Libre', activo: 'Abierta', pendiente: 'Por cobrar' };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      <div className="pagina-titulo">🛒 Punto de Venta</div>
      <div style={{ fontSize: 14, color: 'var(--texto-suave)', marginBottom: 24 }}>
        Turno: <strong>{empleado}</strong> — Selecciona una mesa o "Para llevar"
      </div>

      {/* Para llevar */}
      <button
        onClick={() => onSeleccionar({ id: 0, nombre: 'Para llevar', numero: 0 })}
        style={{
          width: '100%', padding: '14px 20px', marginBottom: 24,
          background: 'var(--tarjeta)', border: '2px dashed var(--borde)',
          borderRadius: 12, cursor: 'pointer', color: 'var(--texto)',
          fontSize: 16, fontWeight: 700, textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ fontSize: 28 }}>🛵</span>
        <div>
          <div>Para llevar</div>
          <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--texto-suave)' }}>
            Sin asignar mesa
          </div>
        </div>
      </button>

      {/* Cuadrícula de mesas */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Mesas
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {mesas.map(mesa => {
          const color = colorEstado[mesa.estado] || 'var(--verde)';
          return (
            <button
              key={mesa.id}
              onClick={() => onSeleccionar(mesa)}
              style={{
                padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${color}`,
                background: `${color}18`,
                color: 'var(--texto)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'transform 0.1s',
              }}
            >
              <span style={{ fontSize: 28 }}>🪑</span>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{mesa.nombre}</div>
              <div style={{ fontSize: 11, color, fontWeight: 600 }}>
                {labelEstado[mesa.estado] || 'Libre'}
              </div>
              {mesa.estado === 'activo' && mesa.total_parcial > 0 && (
                <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
                  ${mesa.total_parcial.toLocaleString('es-CO')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {mesas.length === 0 && (
        <div className="vacio" style={{ marginTop: 24 }}>
          No hay mesas configuradas — ve a Configuración → Mesas
        </div>
      )}
    </div>
  );
}

// ── Modal de descuentos ────────────────────────────────────────────────────────
function ModalDescuentos({ descuentos, subtotal, onAplicar, onCerrar }) {
  const labelTipo = { porcentaje: '%', fijo: '$', gratis: '🎁' };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 340 }}>
        <div className="modal-titulo">🏷️ Seleccionar descuento</div>
        <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 12 }}>
          Subtotal actual: <strong>${subtotal.toLocaleString('es-CO')}</strong>
        </div>

        {descuentos.length === 0 ? (
          <div className="vacio" style={{ padding: '24px 0' }}>
            No hay descuentos activos disponibles ahora
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {descuentos.map(d => {
              const ahorro = d.tipo === 'porcentaje'
                ? Math.round(subtotal * (d.valor / 100))
                : d.tipo === 'fijo' ? Math.round(d.valor) : 0;

              return (
                <button
                  key={d.id}
                  className="btn btn-secundario"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px' }}
                  onClick={() => onAplicar(d)}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.nombre}
                    <span style={{ marginLeft: 8, color: 'var(--naranja)', fontSize: 13 }}>
                      {d.tipo === 'porcentaje' && `-${d.valor}%`}
                      {d.tipo === 'fijo'       && `-$${d.valor.toLocaleString('es-CO')}`}
                      {d.tipo === 'gratis'     && '🎁 Gratis'}
                    </span>
                  </div>
                  {d.descripcion && (
                    <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>{d.descripcion}</div>
                  )}
                  {ahorro > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--verde)', marginTop: 2 }}>
                      Ahorro: ${ahorro.toLocaleString('es-CO')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="btn btn-secundario" style={{ width: '100%' }} onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal selección de gaseosa ────────────────────────────────────────────────
function ModalGaseosa({ producto, onSeleccionar, onCancelar }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 300 }}>
        <div className="modal-titulo">🥤 ¿Qué gaseosa incluye?</div>
        <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 12 }}>
          {producto.nombre}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GASEOSAS_COMBO.map(g => (
            <button
              key={g}
              className="btn btn-secundario"
              style={{ width: '100%', fontSize: 15, padding: '10px 16px' }}
              onClick={() => onSeleccionar(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-secundario" style={{ width: '100%' }} onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

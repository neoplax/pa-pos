import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

const GASEOSAS_COMBO = ['Colombianita', 'Pepsi chiquita', 'Manzana Zero', 'Coca-Cola 250ml'];

const CATEGORIAS = [
  { id: 'principal', label: '🌭 Principales' },
  { id: 'combo',     label: '🎉 Combos'      },
  { id: 'adicion',   label: '➕ Adiciones'  },
  { id: 'bebida',    label: '🥤 Bebidas'     },
];

const EMOJIS_PROD = {
  'Perro Americano':           '🌭',
  'Choripán':                  '🥖',
  'Salchipapa Americana':      '🍟',
  'Hamburguesa Artesanal':     '🍔',
  'Combo Perro + Gaseosa':    '🌭🥤',
  'Combo Choripán + Gaseosa': '🥖🥤',
  'Combo Salchipapa + Gaseosa':'🍟🥤',
  'Combo Hamburguesa':         '🍔🥤',
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
  if (nombre.includes('Colombianita'))return '🍺';
  if (nombre.includes('Coronita'))    return '🍺';
  if (nombre.includes('Cola y Pola')) return '🍺';
  if (nombre.includes('Bretaña'))     return '🥤';
  if (nombre.includes('Qatro'))       return '🥤';
  if (nombre.includes('Agua'))        return '💧';
  return '🍽️';
}

export default function POS() {
  const { empleado, setEmpleado, notificar } = useApp();
  const [productos, setProductos]       = useState([]);
  const [carrito, setCarrito]           = useState([]);
  const [categoria, setCategoria]       = useState('principal');
  const [metodoPago, setMetodoPago]     = useState('efectivo');
  const [efectivoMixto, setEfectivoMixto] = useState('');
  const [nequiMixto, setNequiMixto]       = useState('');
  const [esDomicilio, setEsDomicilio]   = useState(false);
  const [valorDomicilio, setValorDomicilio] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [procesando, setProcesando]     = useState(false);
  const [confirmando, setConfirmando]   = useState(false);
  const [pendingCombo, setPendingCombo] = useState(null);

  const cargarProductos = useCallback(async () => {
    try {
      const prods = await window.electronAPI.getProductos();
      setProductos(prods);
    } catch (err) {
      console.error('[POS] Error cargando productos:', err);
    }
  }, []);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);

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

  const vaciarCarrito = () => {
    setCarrito([]);
    setEsDomicilio(false);
    setValorDomicilio('');
    setEfectivoRecibido('');
  };

  const subtotal            = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const valorDomicilioN     = Math.round(parseFloat(valorDomicilio) || 0);
  const total               = subtotal + (esDomicilio ? valorDomicilioN : 0);
  const efectivoMixtoN      = Math.round(parseFloat(efectivoMixto) || 0);
  const nequiMixtoN         = Math.round(parseFloat(nequiMixto) || 0);
  const efectivoRecibidoN   = Math.round(parseFloat(efectivoRecibido) || 0);
  const cambio              = efectivoRecibidoN - total;
  const mixtoValido         = metodoPago !== 'mixto' || (efectivoMixtoN + nequiMixtoN === total);

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
        setCarrito([]);
        setEsDomicilio(false);
        setValorDomicilio('');
        setEfectivoRecibido('');
        setConfirmando(false);
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

  // Pantalla de selección de empleado
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

  return (
    <div className="pos-layout" style={{ position: 'relative' }}>
      {/* ── Panel izquierdo: productos ── */}
      <div className="pos-productos-panel">
        <div className="flex items-center justify-between">
          <div className="pagina-titulo" style={{ marginBottom: 0 }}>🛒 Punto de Venta</div>
          <span className="badge badge-naranja">Turno: {empleado}</span>
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

      {pendingCombo && (
        <ModalGaseosa
          producto={pendingCombo}
          onSeleccionar={confirmarGaseosa}
          onCancelar={() => setPendingCombo(null)}
        />
      )}

      {/* ── Panel derecho: carrito ── */}
      <div className="pos-carrito">
        <div className="carrito-header">
          <span>🧾 Pedido</span>
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
                  type="number"
                  min="0"
                  value={efectivoRecibido}
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={esDomicilio}
                onChange={e => { setEsDomicilio(e.target.checked); if (!e.target.checked) setValorDomicilio(''); }} />
              🛵 Es domicilio
            </label>
            {esDomicilio && (
              <input type="number" min="0" value={valorDomicilio}
                onChange={e => setValorDomicilio(e.target.value)}
                placeholder="Valor ($)" style={{ flex: 1, fontSize: 13 }} />
            )}
          </div>

          {/* Total */}
          <div className="carrito-total">
            {esDomicilio && valorDomicilioN > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                <span>Subtotal</span><span>${subtotal.toLocaleString('es-CO')}</span>
              </div>
            )}
            {esDomicilio && valorDomicilioN > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                <span>🛵 Domicilio</span><span>${valorDomicilioN.toLocaleString('es-CO')}</span>
              </div>
            )}
            <span>TOTAL</span>
            <span>${total.toLocaleString('es-CO')}</span>
          </div>

          {/* Reimprimir último recibo — siempre visible */}
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
              <div className="alerta azul" style={{ marginBottom: 0, fontSize: 13 }}>
                {esDomicilio ? `🛵 Domicilio · ` : ''}
                ${total.toLocaleString('es-CO')} en {metodoPago === 'mixto'
                  ? `mixto (💵${efectivoMixtoN.toLocaleString('es-CO')}+📱${nequiMixtoN.toLocaleString('es-CO')})`
                  : metodoPago}
                {metodoPago === 'efectivo' && cambio >= 0
                  ? ` · cambio $${cambio.toLocaleString('es-CO')}`
                  : ''}
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

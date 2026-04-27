import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export default function CierreCaja() {
  const { empleado, notificar } = useApp();
  const [ventasDia, setVentasDia]   = useState(null);
  const [cajaDia, setCajaDia]       = useState(null);
  const [historial, setHistorial]   = useState([]);
  const [cargando, setCargando]     = useState(true);
  const [cerrando, setCerrando]     = useState(false);
  const [comprasDia, setComprasDia] = useState({ compras: [], total: 0 });

  // Campos del formulario de cierre
  const [efectivoContado, setEfectivoContado]         = useState('');
  const [nequiContado, setNequiContado]               = useState('');
  const [gastos, setGastos]                           = useState('');
  const [notas, setNotas]                             = useState('');
  const [obsDescuadre, setObsDescuadre]               = useState('');
  const [imprimiendo, setImprimiendo]                 = useState(false);

  const hoy = new Date().toISOString().split('T')[0];

  const cargar = useCallback(async () => {
    try {
      const [ventas, caja, hist, comprasHoy] = await Promise.all([
        window.electronAPI.getVentasDia(hoy),
        window.electronAPI.getCajaDia(hoy),
        window.electronAPI.getHistorialCaja(),
        window.electronAPI.getComprasDia(hoy),
      ]);
      setVentasDia(ventas);
      setCajaDia(caja);
      setHistorial(hist);
      setComprasDia(comprasHoy);

      // Pre-llenar si ya hay un cierre parcial
      if (caja) {
        setEfectivoContado(caja.efectivo || '');
        setNequiContado(caja.nequi || '');
        setGastos(caja.gastos || '');
        setNotas(caja.notas || '');
      } else if (comprasHoy.total > 0 && !gastos) {
        // Pre-llenar gastos con total de compras del día si no hay cierre aún
        setGastos(comprasHoy.total);
      }
    } catch (err) {
      console.error('[CierreCaja] Error:', err);
    } finally {
      setCargando(false);
    }
  }, [hoy]);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen  = ventasDia?.resumen || {};
  const totalVentas = resumen.total_ventas || 0;

  const efectivoN = Math.round(parseFloat(efectivoContado) || 0);
  const nequiN    = Math.round(parseFloat(nequiContado) || 0);
  const gastosN   = Math.round(parseFloat(gastos) || 0);

  const utilidad  = totalVentas - gastosN;
  const diferencia = (efectivoN + nequiN) - totalVentas;

  const cerrarCaja = async () => {
    if (cerrando) return;
    setCerrando(true);
    try {
      const result = await window.electronAPI.cerrarCaja({
        fecha: hoy,
        efectivo: efectivoN,
        nequi: nequiN,
        gastos: gastosN,
        empleado: empleado || 'Sin asignar',
        notas,
        descuadre: diferencia,
        observacion_descuadre: Math.abs(diferencia) > 0 ? obsDescuadre : '',
      });

      if (result.ok) {
        notificar(`✅ Caja cerrada — Utilidad: $${result.utilidad.toLocaleString('es-CO')}`, 'exito');
        cargar();
      }
    } catch (err) {
      notificar('❌ Error al cerrar la caja', 'error');
      console.error('[CierreCaja] Error:', err);
    } finally {
      setCerrando(false);
    }
  };

  const imprimirCierre = async () => {
    if (!cajaDia) return;
    setImprimiendo(true);
    try {
      const result = await window.electronAPI.imprimirCierreCaja({
        fecha: hoy,
        empleado: cajaDia.empleado,
        total_ventas: cajaDia.total_ventas,
        efectivo: cajaDia.efectivo,
        nequi: cajaDia.nequi,
        gastos: cajaDia.gastos,
        utilidad: cajaDia.utilidad,
        descuadre: cajaDia.descuadre || 0,
        observacion_descuadre: cajaDia.observacion_descuadre || '',
      });
      if (result.ok) notificar('🖨️ Cierre enviado a imprimir', 'exito');
      else notificar('❌ Error al imprimir', 'error');
    } catch {
      notificar('❌ Error al imprimir', 'error');
    } finally {
      setImprimiendo(false);
    }
  };

  if (cargando) return <div className="cargando">⏳ Cargando caja...</div>;

  return (
    <div>
      <div className="pagina-titulo">💰 Cierre de Caja</div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Resumen del día */}
        <div className="card">
          <div className="card-titulo">📊 Resumen de ventas hoy</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FilaResumen label="Total transacciones" valor={resumen.total_transacciones || 0} unidad="ventas" />
            <hr className="divider" />
            <FilaResumen label="💵 Ventas efectivo" valor={`$${(resumen.total_efectivo||0).toLocaleString('es-CO')}`} />
            <FilaResumen label="📱 Ventas Nequi"    valor={`$${(resumen.total_nequi||0).toLocaleString('es-CO')}`}   />
            {(resumen.total_mixto || 0) > 0 && (
              <FilaResumen label="🔀 Ventas Mixto" valor={`$${(resumen.total_mixto||0).toLocaleString('es-CO')}`} />
            )}
            <hr className="divider" />
            <FilaResumen
              label="TOTAL VENTAS"
              valor={`$${totalVentas.toLocaleString('es-CO')}`}
              destacado
            />

            {/* Ventas por empleado */}
            {ventasDia?.porEmpleado?.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--borde)' }}>
                <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 8 }}>
                  Por empleado:
                </div>
                {ventasDia.porEmpleado.map(e => (
                  <FilaResumen
                    key={e.empleado}
                    label={`👤 ${e.empleado}`}
                    valor={`$${(e.total||0).toLocaleString('es-CO')} (${e.transacciones} ventas)`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Formulario de cierre */}
        <div className="card">
          <div className="card-titulo">
            {cajaDia?.cerrada ? '✅ Caja cerrada hoy' : '📝 Registrar cierre'}
          </div>

          {cajaDia?.cerrada ? (
            <div>
              <div className="alerta verde" style={{ marginBottom: 12 }}>
                Caja cerrada el {new Date(cajaDia.creado_en).toLocaleString('es-CO')}
              </div>
              <FilaResumen label="Efectivo contado"   valor={`$${cajaDia.efectivo.toLocaleString('es-CO')}`} />
              <FilaResumen label="Nequi"              valor={`$${cajaDia.nequi.toLocaleString('es-CO')}`} />
              <FilaResumen label="Gastos del día"     valor={`$${cajaDia.gastos.toLocaleString('es-CO')}`} />
              <hr className="divider" />
              <FilaResumen label="UTILIDAD"           valor={`$${cajaDia.utilidad.toLocaleString('es-CO')}`} destacado />
              {(cajaDia.descuadre !== undefined && cajaDia.descuadre !== 0) && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, marginTop: 8,
                  background: cajaDia.descuadre >= 0 ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                  fontSize: 13, fontWeight: 600,
                  color: cajaDia.descuadre >= 0 ? 'var(--verde)' : 'var(--rojo)',
                }}>
                  {cajaDia.descuadre >= 0
                    ? `✅ Sobrante: $${cajaDia.descuadre.toLocaleString('es-CO')}`
                    : `⚠️ Faltante: $${Math.abs(cajaDia.descuadre).toLocaleString('es-CO')}`
                  }
                  {cajaDia.observacion_descuadre && (
                    <div style={{ fontWeight: 400, marginTop: 4 }}>{cajaDia.observacion_descuadre}</div>
                  )}
                </div>
              )}
              {cajaDia.notas && (
                <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 8 }}>
                  Notas: {cajaDia.notas}
                </div>
              )}
              <button
                className="btn btn-secundario"
                style={{ marginTop: 12, width: '100%' }}
                onClick={imprimirCierre}
                disabled={imprimiendo}
              >
                {imprimiendo ? '⏳ Imprimiendo...' : '🖨️ Imprimir cierre'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-grupo">
                <label className="form-label">💵 Efectivo contado ($)</label>
                <input
                  type="number"
                  min="0"
                  value={efectivoContado}
                  onChange={e => setEfectivoContado(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-grupo">
                <label className="form-label">📱 Nequi recibido ($)</label>
                <input
                  type="number"
                  min="0"
                  value={nequiContado}
                  onChange={e => setNequiContado(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-grupo">
                <label className="form-label">📤 Gastos del día ($)</label>
                <input
                  type="number"
                  min="0"
                  value={gastos}
                  onChange={e => setGastos(e.target.value)}
                  placeholder="0"
                />
                {comprasDia.total > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--texto-suave)' }}>
                    Compras registradas hoy: <strong style={{ color: 'var(--rojo)' }}>
                      ${comprasDia.total.toLocaleString('es-CO')}
                    </strong>
                    {' '}({comprasDia.compras.length} {comprasDia.compras.length === 1 ? 'ítem' : 'ítems'})
                    {' '}
                    <button
                      type="button"
                      style={{
                        background: 'none', border: 'none',
                        color: 'var(--naranja)', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, padding: 0,
                      }}
                      onClick={() => setGastos(comprasDia.total)}
                    >
                      ← Usar este valor
                    </button>
                  </div>
                )}
              </div>
              <div className="form-grupo">
                <label className="form-label">📝 Notas (opcional)</label>
                <input
                  type="text"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones del día..."
                />
              </div>

              <hr className="divider" />

              {/* Cálculo automático */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <FilaResumen label="Total ventas"   valor={`$${totalVentas.toLocaleString('es-CO')}`} />
                <FilaResumen label="Gastos"         valor={`-$${gastosN.toLocaleString('es-CO')}`}     />
                <FilaResumen label="UTILIDAD"       valor={`$${utilidad.toLocaleString('es-CO')}`}     destacado />
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: diferencia >= 0 ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: diferencia >= 0 ? 'var(--verde)' : 'var(--rojo)',
                }}>
                  {diferencia >= 0
                    ? `✅ Sobrante: $${diferencia.toLocaleString('es-CO')}`
                    : `⚠️ Faltante: $${Math.abs(diferencia).toLocaleString('es-CO')}`
                  }
                </div>
                {Math.abs(diferencia) > 0 && (
                  <div className="form-grupo" style={{ marginTop: 4 }}>
                    <label className="form-label">Observación del descuadre</label>
                    <input
                      type="text"
                      value={obsDescuadre}
                      onChange={e => setObsDescuadre(e.target.value)}
                      placeholder="¿Por qué hay diferencia?"
                    />
                  </div>
                )}
              </div>

              <button
                className="btn btn-primario btn-grande"
                onClick={cerrarCaja}
                disabled={cerrando}
              >
                {cerrando ? '⏳ Cerrando...' : '🔒 Cerrar Caja del Día'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="card">
        <div className="card-titulo">📅 Historial de cierres (últimos 30 días)</div>
        {historial.length === 0 ? (
          <div className="vacio">Sin cierres registrados aún</div>
        ) : (
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Ventas</th>
                  <th>Efectivo</th>
                  <th>Nequi</th>
                  <th>Gastos</th>
                  <th>Utilidad</th>
                  <th>Descuadre</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(c => (
                  <tr key={c.id}>
                    <td>{c.fecha}</td>
                    <td>{c.empleado}</td>
                    <td className="negrita">${c.total_ventas.toLocaleString('es-CO')}</td>
                    <td>${c.efectivo.toLocaleString('es-CO')}</td>
                    <td>${c.nequi.toLocaleString('es-CO')}</td>
                    <td className="texto-rojo">${c.gastos.toLocaleString('es-CO')}</td>
                    <td className="texto-verde negrita">
                      ${c.utilidad.toLocaleString('es-CO')}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {!c.descuadre || c.descuadre === 0 ? (
                        <span className="texto-suave">—</span>
                      ) : c.descuadre > 0 ? (
                        <span className="texto-verde">+${c.descuadre.toLocaleString('es-CO')}</span>
                      ) : (
                        <span className="texto-rojo">⚠️ -${Math.abs(c.descuadre).toLocaleString('es-CO')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FilaResumen({ label, valor, destacado = false }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: destacado ? 17 : 14,
      fontWeight: destacado ? 700 : 400,
      color: destacado ? 'var(--naranja)' : 'var(--texto)',
    }}>
      <span style={{ color: destacado ? 'var(--naranja)' : 'var(--texto-suave)' }}>{label}</span>
      <span>{valor}</span>
    </div>
  );
}

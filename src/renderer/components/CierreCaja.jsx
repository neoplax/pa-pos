import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export default function CierreCaja() {
  const { empleado, notificar } = useApp();
  const [ventasDia, setVentasDia]   = useState(null);
  const [cajaDia, setCajaDia]       = useState(null);
  const [baseDia, setBaseDia]       = useState(null);
  const [gastosDia, setGastosDia]   = useState({ gastos: [], compras: [], totalGastos: 0, totalCompras: 0 });
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
  const [exportando, setExportando]                   = useState(false);
  const [exportPath, setExportPath]                   = useState(null);

  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0];

  const cargar = useCallback(async () => {
    try {
      const [ventas, caja, hist, comprasHoy, base, gastosHoy] = await Promise.all([
        window.electronAPI.getVentasDia(hoy),
        window.electronAPI.getCajaDia(hoy),
        window.electronAPI.getHistorialCaja(),
        window.electronAPI.getComprasDia(hoy),
        window.electronAPI.getBaseCaja(hoy),
        window.electronAPI.getGastosDia(hoy),
      ]);
      setVentasDia(ventas);
      setCajaDia(caja);
      setHistorial(hist);
      setComprasDia(comprasHoy);
      setBaseDia(base || null);
      setGastosDia(gastosHoy || { gastos: [], compras: [], totalGastos: 0, totalCompras: 0 });

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

  const resumen     = ventasDia?.resumen || {};
  const totalVentas = resumen.total_ventas || 0;
  const ventasEf    = resumen.total_efectivo || 0;
  const ventasNq    = resumen.total_nequi    || 0;

  const efectivoN   = Math.round(parseFloat(efectivoContado) || 0);
  const nequiN      = Math.round(parseFloat(nequiContado)    || 0);
  const gastosN     = Math.round(parseFloat(gastos)          || 0);

  const utilidad    = totalVentas - gastosN;

  // Base del día
  const baseEf = baseDia?.efectivo_base || 0;
  const baseNq = baseDia?.nequi_base    || 0;

  // Gastos + compras del día desglosados por método de pago
  const calcEf = (arr, campoMonto = 'monto') =>
    arr.reduce((s, g) => {
      if (g.metodo_pago === 'efectivo') return s + (g[campoMonto] || 0);
      if (g.metodo_pago === 'mixto')    return s + (g.monto_efectivo_mixto || 0);
      return s;
    }, 0);
  const calcNq = (arr, campoMonto = 'monto') =>
    arr.reduce((s, g) => {
      if (g.metodo_pago === 'nequi') return s + (g[campoMonto] || 0);
      if (g.metodo_pago === 'mixto') return s + (g.monto_nequi_mixto || 0);
      return s;
    }, 0);

  const gastosEfDia = calcEf(gastosDia.gastos)         + calcEf(gastosDia.compras, 'precio_pagado');
  const gastosNqDia = calcNq(gastosDia.gastos)         + calcNq(gastosDia.compras, 'precio_pagado');

  // Efectivo/Nequi esperado = base + ventas del método - gastos del método
  const esperadoEf  = baseEf + ventasEf - gastosEfDia;
  const esperadoNq  = baseNq + ventasNq - gastosNqDia;
  const difEfectivo = efectivoN - esperadoEf;
  const difNequi    = nequiN    - esperadoNq;
  const diferencia  = difEfectivo + difNequi;

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
        notificar(`Caja cerrada — Utilidad: $${result.utilidad.toLocaleString('es-CO')}`, 'exito');
        cargar();
      }
    } catch (err) {
      notificar('Error al cerrar la caja', 'error');
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
      if (result.ok) notificar('Cierre enviado a imprimir', 'exito');
      else notificar('Error al imprimir', 'error');
    } catch {
      notificar('Error al imprimir', 'error');
    } finally {
      setImprimiendo(false);
    }
  };

  if (cargando) return <div className="cargando">Cargando caja...</div>;

  return (
    <div>
      <div className="pagina-titulo">Cierre de Caja</div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Resumen del día */}
        <div className="card">
          <div className="card-titulo">Resumen de ventas hoy</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FilaResumen label="Total transacciones" valor={resumen.total_transacciones || 0} unidad="ventas" />
            <hr className="divider" />
            <FilaResumen label="Ventas efectivo" valor={`$${(resumen.total_efectivo||0).toLocaleString('es-CO')}`} />
            <FilaResumen label="Ventas Nequi"    valor={`$${(resumen.total_nequi||0).toLocaleString('es-CO')}`}   />
            {(resumen.total_mixto || 0) > 0 && (
              <FilaResumen label="Ventas Mixto" valor={`$${(resumen.total_mixto||0).toLocaleString('es-CO')}`} />
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
                    label={e.empleado}
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
            {cajaDia?.cerrada ? 'Caja cerrada hoy' : 'Registrar cierre'}
          </div>

          {cajaDia?.cerrada ? (
            <div>
              <div className="alerta verde" style={{ marginBottom: 12 }}>
                Caja cerrada el {new Date(cajaDia.creado_en).toLocaleString('es-CO')}
              </div>

              {/* Desglose efectivo */}
              <DesgloseCuadre
                label="Efectivo"
                base={baseEf}
                ventas={ventasEf}
                gastos={gastosEfDia}
                contado={cajaDia.efectivo}
              />
              <div style={{ margin: '10px 0' }} />
              {/* Desglose Nequi */}
              <DesgloseCuadre
                label="Nequi"
                base={baseNq}
                ventas={ventasNq}
                gastos={gastosNqDia}
                contado={cajaDia.nequi}
              />

              <hr className="divider" />
              <FilaResumen label="Total ventas"   valor={`$${cajaDia.total_ventas.toLocaleString('es-CO')}`} />
              <FilaResumen label="Gastos del día" valor={`-$${cajaDia.gastos.toLocaleString('es-CO')}`} />
              <FilaResumen label="UTILIDAD"       valor={`$${cajaDia.utilidad.toLocaleString('es-CO')}`} destacado />

              {(cajaDia.descuadre !== undefined && cajaDia.descuadre !== 0) && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, marginTop: 8,
                  background: cajaDia.descuadre >= 0 ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                  fontSize: 13, fontWeight: 600,
                  color: cajaDia.descuadre >= 0 ? 'var(--verde)' : 'var(--rojo)',
                }}>
                  {cajaDia.descuadre >= 0
                    ? `✅ Sobrante total: $${cajaDia.descuadre.toLocaleString('es-CO')}`
                    : `⚠️ Faltante total: $${Math.abs(cajaDia.descuadre).toLocaleString('es-CO')}`
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
                {imprimiendo ? 'Imprimiendo...' : 'Imprimir cierre'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Aviso si no hay base de caja registrada hoy */}
              {!baseDia && (
                <div className="alerta naranja" style={{ fontSize: 12 }}>
                  ⚠️ No hay base de caja registrada para hoy. El cuadre se hará sin efectivo/Nequi inicial.
                </div>
              )}

              <div className="form-grupo">
                <label className="form-label">Efectivo contado ($)</label>
                <input
                  type="number"
                  min="0"
                  value={efectivoContado}
                  onChange={e => setEfectivoContado(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-grupo">
                <label className="form-label">Nequi recibido ($)</label>
                <input
                  type="number"
                  min="0"
                  value={nequiContado}
                  onChange={e => setNequiContado(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-grupo">
                <label className="form-label">Gastos del día ($)</label>
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
                <label className="form-label">Notas (opcional)</label>
                <input
                  type="text"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones del día..."
                />
              </div>

              <hr className="divider" />

              {/* Desglose de cuadre por método de pago */}
              <DesgloseCuadre
                label="Efectivo"
                base={baseEf}
                ventas={ventasEf}
                gastos={gastosEfDia}
                contado={efectivoN}
              />
              <div style={{ margin: '6px 0' }} />
              <DesgloseCuadre
                label="Nequi"
                base={baseNq}
                ventas={ventasNq}
                gastos={gastosNqDia}
                contado={nequiN}
              />

              <hr className="divider" />

              {/* Resumen de utilidad */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <FilaResumen label="Total ventas"   valor={`$${totalVentas.toLocaleString('es-CO')}`} />
                <FilaResumen label="Gastos"         valor={`-$${gastosN.toLocaleString('es-CO')}`}     />
                <FilaResumen label="UTILIDAD"       valor={`$${utilidad.toLocaleString('es-CO')}`}     destacado />

                {/* Diferencia total */}
                {(Math.abs(difEfectivo) > 0 || Math.abs(difNequi) > 0) && (
                  <>
                    <div style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: diferencia >= 0 ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                      fontSize: 14, fontWeight: 600,
                      color: diferencia >= 0 ? 'var(--verde)' : 'var(--rojo)',
                    }}>
                      {diferencia >= 0
                        ? `✅ Sobrante total: $${diferencia.toLocaleString('es-CO')}`
                        : `⚠️ Faltante total: $${Math.abs(diferencia).toLocaleString('es-CO')}`
                      }
                    </div>
                    <div className="form-grupo" style={{ marginTop: 4 }}>
                      <label className="form-label">Observación del descuadre</label>
                      <input
                        type="text"
                        value={obsDescuadre}
                        onChange={e => setObsDescuadre(e.target.value)}
                        placeholder="¿Por qué hay diferencia?"
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                className="btn btn-primario btn-grande"
                onClick={cerrarCaja}
                disabled={cerrando}
              >
                {cerrando ? 'Cerrando...' : 'Cerrar Caja del Día'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-titulo" style={{ marginBottom: 0 }}>Historial de cierres (últimos 30 días)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {exportPath && (
              <span style={{ fontSize: 12, color: 'var(--verde)' }}>
                ✅ Guardado
                <button
                  className="btn btn-secundario"
                  style={{ fontSize: 12, padding: '2px 8px', marginLeft: 6 }}
                  onClick={() => window.electronAPI.abrirArchivoExcel(exportPath)}
                >
                  Abrir
                </button>
              </span>
            )}
            <button
              className="btn btn-secundario"
              style={{ fontSize: 13 }}
              disabled={exportando || historial.length === 0}
              onClick={async () => {
                setExportando(true); setExportPath(null);
                try {
                  const res = await window.electronAPI.exportarCierresCaja();
                  if (res?.ok) {
                    setExportPath(res.path);
                    notificar('Excel guardado en Documentos/PerrosAmericanos/', 'exito');
                  } else {
                    notificar('Error al exportar: ' + (res?.error || ''), 'error');
                  }
                } catch (e) { notificar('Error al exportar', 'error'); }
                finally { setExportando(false); }
              }}
            >
              {exportando ? 'Exportando...' : 'Exportar historial'}
            </button>
          </div>
        </div>
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

// Muestra el desglose de cuadre para un método de pago (efectivo o nequi)
function DesgloseCuadre({ label, base, ventas, gastos, contado }) {
  const fmt   = n => `$${Math.abs(n).toLocaleString('es-CO')}`;
  const esp   = base + ventas - gastos;
  const dif   = contado - esp;
  const color = dif >= 0 ? 'var(--verde)' : 'var(--rojo)';

  return (
    <div style={{
      background: 'var(--fondo)', borderRadius: 10, padding: '10px 14px',
      fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--naranja)', marginBottom: 4 }}>{label}</div>
      <FilaResumen label="Saldo inicial"        valor={fmt(base)} />
      <FilaResumen label="+ Ventas del método"  valor={fmt(ventas)} />
      <FilaResumen label="− Gastos del método"  valor={fmt(gastos)} />
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontWeight: 700, borderTop: '1px solid var(--borde)', paddingTop: 4, marginTop: 2,
      }}>
        <span style={{ color: 'var(--texto-suave)' }}>= Esperado en caja</span>
        <span>{fmt(esp)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 13, color: 'var(--texto-suave)',
      }}>
        <span>Contado físico</span>
        <span style={{ color: 'var(--texto)' }}>{fmt(contado)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontWeight: 700, color,
      }}>
        <span>Diferencia</span>
        <span>{dif >= 0 ? `+${fmt(dif)}` : `-${fmt(dif)}`}</span>
      </div>
    </div>
  );
}

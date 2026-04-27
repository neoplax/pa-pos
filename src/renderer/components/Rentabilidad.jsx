import React, { useState, useEffect, useCallback } from 'react';

function semaforo(pct) {
  if (pct >= 50) return 'verde';
  if (pct >= 30) return 'amarillo';
  return 'rojo';
}

function SemaforoCirculo({ pct, gris = false }) {
  const color = gris ? '#aaa'
    : pct >= 50 ? 'var(--verde)'
    : pct >= 30 ? 'var(--amarillo)'
    : 'var(--rojo)';
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

export default function Rentabilidad() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [filtro, setFiltro]       = useState('todos');
  const [ordenar, setOrdenar]     = useState('utilidad_total');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await window.electronAPI.getRentabilidad({});
      setProductos(data || []);
    } catch (err) {
      console.error('[Rentabilidad]', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = productos
    .filter(p => filtro === 'todos' || p.categoria === filtro)
    .sort((a, b) => {
      if (ordenar === 'nombre')       return a.nombre.localeCompare(b.nombre, 'es');
      if (ordenar === 'precio')       return b.precio - a.precio;
      if (ordenar === 'margen_pct')   return (b.margen_pct || 0) - (a.margen_pct || 0);
      return (b.utilidad_total || 0) - (a.utilidad_total || 0); // utilidad_total por defecto
    });

  const conDatos     = filtrados.filter(p => p.costoCompleto);
  const sinCosto     = filtrados.filter(p => !p.costoCompleto).length;
  const verdes       = conDatos.filter(p => semaforo(p.margen_pct) === 'verde').length;
  const amarillos    = conDatos.filter(p => semaforo(p.margen_pct) === 'amarillo').length;
  const rojos        = conDatos.filter(p => semaforo(p.margen_pct) === 'rojo').length;
  const promMargen   = conDatos.length > 0
    ? Math.round(conDatos.reduce((s, p) => s + p.margen_pct, 0) / conDatos.length)
    : 0;

  // Resumen especial
  const estrella    = conDatos.reduce((a, b) => ((b.utilidad_total || 0) > (a?.utilidad_total || 0) ? b : a), null);
  const masVendido  = conDatos.reduce((a, b) => ((b.unidades || 0) > (a?.unidades || 0) ? b : a), null);
  const critico     = conDatos.length > 0
    ? conDatos.reduce((a, b) => ((b.margen_pct || 0) < (a?.margen_pct || 99)) ? b : a, conDatos[0])
    : null;
  const negativos   = conDatos.filter(p => p.margen_pct < 0);

  if (cargando) return <div className="cargando">⏳ Calculando rentabilidad...</div>;

  return (
    <div>
      <div className="pagina-titulo">📉 Rentabilidad</div>

      {/* Alerta margen negativo */}
      {negativos.length > 0 && (
        <div className="alerta" style={{
          background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)',
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
        }}>
          🚨 <strong>{negativos.length} producto{negativos.length > 1 ? 's' : ''} con margen negativo:</strong>{' '}
          {negativos.map(p => p.nombre).join(', ')}
        </div>
      )}

      {/* Stats semáforo */}
      <div className="stats-grid mb-24">
        <div className="stat-card verde">
          <span className="stat-icono">✅</span>
          <span className="stat-label">Margen &gt; 50%</span>
          <span className="stat-valor">{verdes} prod.</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amarillo)' }}>
          <span className="stat-icono">⚠️</span>
          <span className="stat-label">Margen 30–50%</span>
          <span className="stat-valor">{amarillos} prod.</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-icono">🔴</span>
          <span className="stat-label">Margen &lt; 30%</span>
          <span className="stat-valor">{rojos} prod.</span>
        </div>
        <div className="stat-card azul">
          <span className="stat-icono">📊</span>
          <span className="stat-label">Margen promedio</span>
          <span className="stat-valor">{promMargen}%</span>
        </div>
      </div>

      {/* Resumen destacado */}
      {(estrella || masVendido || critico) && (
        <div className="card mb-24" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {estrella && estrella.utilidad_total > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>⭐ Producto estrella</div>
              <div style={{ fontWeight: 700 }}>{estrella.nombre}</div>
              <div style={{ color: 'var(--verde)', fontSize: 13 }}>
                Utilidad total: ${estrella.utilidad_total.toLocaleString('es-CO')}
              </div>
            </div>
          )}
          {masVendido && masVendido.unidades > 0 && (
            <div style={{ flex: 1, minWidth: 160, borderLeft: '1px solid var(--borde)', paddingLeft: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>🏆 Más vendido</div>
              <div style={{ fontWeight: 700 }}>{masVendido.nombre}</div>
              <div style={{ color: 'var(--naranja)', fontSize: 13 }}>
                {masVendido.unidades} unidades vendidas
              </div>
            </div>
          )}
          {critico && (
            <div style={{ flex: 1, minWidth: 160, borderLeft: '1px solid var(--borde)', paddingLeft: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>🔴 Margen más bajo</div>
              <div style={{ fontWeight: 700 }}>{critico.nombre}</div>
              <div style={{ color: 'var(--rojo)', fontSize: 13 }}>
                Margen: {Math.round(critico.margen_pct)}%
              </div>
            </div>
          )}
        </div>
      )}

      {sinCosto > 0 && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.3)',
          fontSize: 14,
        }}>
          ⚠️ <strong>{sinCosto} producto{sinCosto > 1 ? 's' : ''}</strong> tiene
          {sinCosto > 1 ? 'n' : ''} receta incompleta o sin costos.
          Configura los costos en Inventario o Configuración → Menú.
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-12 mb-16 items-center" style={{ flexWrap: 'wrap' }}>
        <div className="pos-tabs">
          {['todos', 'principal', 'combo', 'adicion', 'bebida', 'empaque'].map(f => (
            <button
              key={f}
              className={`pos-tab ${filtro === f ? 'activo' : ''}`}
              onClick={() => setFiltro(f)}
            >
              {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="form-grupo" style={{ marginBottom: 0, minWidth: 200 }}>
          <select value={ordenar} onChange={e => setOrdenar(e.target.value)}>
            <option value="utilidad_total">Ordenar por utilidad total</option>
            <option value="margen_pct">Ordenar por margen %</option>
            <option value="nombre">Ordenar por nombre</option>
            <option value="precio">Ordenar por precio</option>
          </select>
        </div>
        <button className="btn btn-secundario" onClick={cargar}>🔄 Recalcular</button>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cat.</th>
                <th style={{ textAlign: 'right' }}>Precio venta</th>
                <th style={{ textAlign: 'right' }}>Costo estimado</th>
                <th style={{ textAlign: 'right' }}>Margen $</th>
                <th style={{ textAlign: 'right' }}>Margen %</th>
                <th style={{ textAlign: 'right' }}>Uds. vendidas</th>
                <th style={{ textAlign: 'right' }}>Utilidad total</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => {
                const color = p.costoCompleto ? semaforo(p.margen_pct) : null;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {p.costoCompleto
                          ? <SemaforoCirculo pct={p.margen_pct} />
                          : <span style={{ marginRight: 6 }}>⚠️</span>
                        }
                        <span className="negrita">{p.nombre}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-azul" style={{ fontSize: 10 }}>{p.categoria}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      ${(p.precio || 0).toLocaleString('es-CO')}
                    </td>
                    <td style={{ textAlign: 'right' }} className="texto-suave">
                      {p.costoCompleto
                        ? `$${Math.round(p.costo || 0).toLocaleString('es-CO')}`
                        : <span style={{ color: 'var(--amarillo)' }}>Incompleto</span>
                      }
                    </td>
                    {/* Margen $ — usa margen_monto del backend */}
                    <td style={{ textAlign: 'right' }}>
                      {p.costoCompleto ? (
                        <span style={{ color: p.margen_monto >= 0 ? 'var(--verde)' : 'var(--rojo)', fontWeight: 600 }}>
                          ${Math.round(p.margen_monto || 0).toLocaleString('es-CO')}
                        </span>
                      ) : '—'}
                    </td>
                    {/* Margen % — usa margen_pct del backend */}
                    <td style={{ textAlign: 'right' }}>
                      {p.costoCompleto ? (
                        <span style={{
                          fontWeight: 700,
                          color: color === 'verde' ? 'var(--verde)'
                               : color === 'amarillo' ? 'var(--amarillo)'
                               : 'var(--rojo)',
                        }}>
                          {(p.margen_pct || 0).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }} className="texto-suave">
                      {(p.unidades || 0) > 0 ? p.unidades : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.costoCompleto && (p.utilidad_total || 0) !== 0 ? (
                        <span style={{ color: (p.utilidad_total || 0) > 0 ? 'var(--verde)' : 'var(--rojo)', fontWeight: 600 }}>
                          ${(p.utilidad_total || 0).toLocaleString('es-CO')}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!p.costoCompleto ? (
                        <span className="badge badge-amarillo">Sin datos</span>
                      ) : color === 'verde' ? (
                        <span className="badge badge-verde">Bueno</span>
                      ) : color === 'amarillo' ? (
                        <span className="badge badge-amarillo">Regular</span>
                      ) : (
                        <span className="badge badge-rojo">Bajo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <div className="card" style={{ marginTop: 16, fontSize: 13, color: 'var(--texto-suave)' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span><SemaforoCirculo pct={60} /> Verde: margen &gt; 50%</span>
          <span><SemaforoCirculo pct={35} /> Amarillo: margen 30–50%</span>
          <span><SemaforoCirculo pct={10} /> Rojo: margen &lt; 30%</span>
          <span>⚠️ Receta incompleta o sin costos</span>
        </div>
        <div style={{ marginTop: 8 }}>
          Margen $ = Precio venta − Costo estimado · Margen % = Margen $ / Precio × 100
        </div>
      </div>
    </div>
  );
}

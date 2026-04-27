import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';

const COLORES_PIE = ['#E8623A', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];

// Interpreta código WMO de Open-Meteo
function descClima(code) {
  if (code === 0) return { desc: 'Despejado', icono: '☀️' };
  if (code <= 3)  return { desc: 'Parcialmente nublado', icono: '⛅' };
  if (code <= 48) return { desc: 'Niebla', icono: '🌫️' };
  if (code <= 67) return { desc: 'Lluvia', icono: '🌧️' };
  if (code <= 82) return { desc: 'Aguacero', icono: '⛈️' };
  if (code <= 99) return { desc: 'Tormenta eléctrica', icono: '⛈️' };
  return { desc: 'Variable', icono: '🌤️' };
}

// Tooltip personalizado para recharts
function TooltipVentas({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--fondo-card)',
      border: '1px solid var(--borde)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
    }}>
      <p style={{ color: 'var(--texto-suave)', marginBottom: 4 }}>{label}h</p>
      <p style={{ color: 'var(--naranja)', fontWeight: 700 }}>
        $ {(payload[0].value || 0).toLocaleString('es-CO')}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { esAdmin } = useApp();

  const [datos, setDatos]             = useState(null);
  const [clima, setClima]             = useState(null);
  const [ventasHora, setVentasHora]   = useState([]);
  const [ventasProd, setVentasProd]   = useState([]);
  const [alertasStock, setAlertasStock] = useState([]);
  const [alertasVenc, setAlertasVenc] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando]       = useState(true);

  // Estado del auto-updater (solo visible para admins)
  const [updateInfo, setUpdateInfo]   = useState(null); // { version, releaseDate }
  const [updateProgress, setUpdateProgress] = useState(null); // { percent, transferred, total }
  const [updateReady, setUpdateReady] = useState(null);  // { version }
  const [updateError, setUpdateError] = useState(null);

  const hoy = new Date().toISOString().split('T')[0];

  const cargar = useCallback(async () => {
    try {
      const [resVentas, horas, prods, ings, provs] = await Promise.all([
        window.electronAPI.getVentasDia(hoy),
        window.electronAPI.getVentasPorHora(hoy),
        window.electronAPI.getVentasPorProducto({ fechaInicio: hoy, fechaFin: hoy }),
        window.electronAPI.getIngredientes(),
        window.electronAPI.getProveedores(),
      ]);

      setDatos(resVentas);

      // Rellenar horas sin ventas
      const mapaHoras = {};
      for (const h of horas) mapaHoras[h.hora] = h.total;
      const horaLlena = Array.from({ length: 15 }, (_, i) => ({
        hora: i + 8,
        total: mapaHoras[i + 8] || 0,
      }));
      setVentasHora(horaLlena);
      setVentasProd(prods.slice(0, 6));

      setProveedores(provs);

      // Alertas de stock bajo (stock < mínimo)
      const bajos = ings.filter(i => i.stock_actual <= i.stock_minimo && i.stock_minimo > 0);
      setAlertasStock(bajos);

      // Alertas de perecederos próximos a vencer
      const hoyMs = Date.now();
      const vencen = ings.filter(i => {
        if (!i.es_perecedero || !i.fecha_preparacion) return false;
        const diasRestantes = i.duracion_dias - Math.floor(
          (hoyMs - new Date(i.fecha_preparacion).getTime()) / 86400000
        );
        return diasRestantes <= 1;
      });
      setAlertasVenc(vencen);

    } catch (err) {
      console.error('[Dashboard] Error cargando datos:', err);
    } finally {
      setCargando(false);
    }
  }, [hoy]);

  const cargarClima = useCallback(async () => {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=4.3369&longitude=-74.3642' +
        '&current=temperature_2m,weather_code,wind_speed_10m&timezone=America%2FBogota'
      );
      if (res.ok) {
        const data = await res.json();
        setClima(data.current);
      }
    } catch {
      // Sin internet, mostrar sin clima
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarClima();
    const id = setInterval(cargar, 120000);
    return () => clearInterval(id);
  }, [cargar, cargarClima]);

  // Suscribirse a eventos del updater (solo en producción, solo admins)
  useEffect(() => {
    if (!esAdmin) return;
    window.electronAPI.update_onAvailable(setUpdateInfo);
    window.electronAPI.update_onProgress(setUpdateProgress);
    window.electronAPI.update_onDownloaded(setUpdateReady);
    window.electronAPI.update_onError(setUpdateError);
    return () => window.electronAPI.update_removeListeners();
  }, [esAdmin]);

  if (cargando) return <div className="cargando">⏳ Cargando dashboard...</div>;

  const resumen = datos?.resumen || {};
  const productoTop = datos?.productoTop;

  // Mapa ingId -> primer proveedor
  const mapIngProv = {};
  for (const prov of proveedores) {
    const ids = JSON.parse(prov.ingredientes || '[]');
    for (const id of ids) {
      if (!mapIngProv[id]) mapIngProv[id] = prov;
    }
  }

  const instalarActualizacion = () => {
    window.electronAPI.update_install();
  };

  return (
    <div>
      <div className="pagina-titulo">📊 Dashboard</div>

      {/* Banner de actualizaciones — solo para administradores */}
      {esAdmin && updateError && (
        <div style={{
          background: '#3a1a1a', border: '1px solid #c0392b', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex',
          alignItems: 'center', gap: 10, fontSize: 13,
        }}>
          <span>⚠️ Error al verificar actualizaciones: {updateError}</span>
          <button onClick={() => setUpdateError(null)} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#e74c3c', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
      )}

      {esAdmin && updateInfo && !updateReady && (
        <div style={{
          background: '#1a2a3a', border: '1px solid #3498db', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: updateProgress ? 8 : 0 }}>
            <span>🔄 Nueva versión <strong>v{updateInfo.version}</strong> disponible — Descargando en segundo plano...</span>
          </div>
          {updateProgress && (
            <div>
              <div style={{
                background: '#0d1b2a', borderRadius: 4, height: 6, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${updateProgress.percent}%`, height: '100%',
                  background: '#3498db', transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ color: 'var(--texto-suave)', marginTop: 4 }}>
                {updateProgress.percent}% — {(updateProgress.transferred / 1048576).toFixed(1)} MB / {(updateProgress.total / 1048576).toFixed(1)} MB
              </div>
            </div>
          )}
        </div>
      )}

      {esAdmin && updateReady && (
        <div style={{
          background: '#1a3a2a', border: '1px solid #27ae60', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex',
          alignItems: 'center', gap: 12, fontSize: 13,
        }}>
          <span>✅ Actualización v{updateReady.version} lista</span>
          <button onClick={instalarActualizacion} style={{
            background: '#27ae60', color: '#fff', border: 'none', borderRadius: 6,
            padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>Instalar ahora</button>
          <button onClick={() => setUpdateReady(null)} style={{
            background: 'transparent', border: '1px solid #27ae60', color: '#27ae60',
            borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
          }}>Más tarde</button>
        </div>
      )}

      {/* Stats principales */}
      <div className="stats-grid">
        <div className="stat-card naranja">
          <span className="stat-icono">💵</span>
          <span className="stat-label">Ventas del día</span>
          <span className="stat-valor">
            $ {(resumen.total_ventas || 0).toLocaleString('es-CO')}
          </span>
        </div>
        <div className="stat-card verde">
          <span className="stat-icono">🧾</span>
          <span className="stat-label">Transacciones</span>
          <span className="stat-valor">{resumen.total_transacciones || 0}</span>
        </div>
        <div className="stat-card azul">
          <span className="stat-icono">💳</span>
          <span className="stat-label">Efectivo / Nequi</span>
          <span className="stat-valor" style={{ fontSize: 18 }}>
            $ {(resumen.total_efectivo || 0).toLocaleString('es-CO')} /
            $ {(resumen.total_nequi || 0).toLocaleString('es-CO')}
          </span>
        </div>
        <div className="stat-card amarillo">
          <span className="stat-icono">🏆</span>
          <span className="stat-label">Producto más vendido</span>
          <span className="stat-valor" style={{ fontSize: 16 }}>
            {productoTop ? `${productoTop.nombre} (×${productoTop.vendidos})` : '—'}
          </span>
        </div>
      </div>

      {/* Clima + Alertas */}
      <div className="dashboard-top">
        {/* Clima Fusagasugá */}
        <div className="clima-widget">
          <span className="clima-icono">
            {clima ? descClima(clima.weather_code).icono : '🌤️'}
          </span>
          <div className="clima-info">
            <span className="clima-ciudad">Fusagasugá, Colombia</span>
            {clima ? (
              <>
                <span className="clima-temp">
                  {Math.round(clima.temperature_2m)}°C
                </span>
                <span className="clima-desc">
                  {descClima(clima.weather_code).desc} · Viento {Math.round(clima.wind_speed_10m)} km/h
                </span>
              </>
            ) : (
              <span className="texto-suave">Sin conexión a internet</span>
            )}
          </div>
        </div>

        {/* Ventas por empleado hoy */}
        <div className="card" style={{ flex: 1 }}>
          <div className="card-titulo">Por empleado hoy</div>
          {datos?.porEmpleado?.length ? (
            datos.porEmpleado.map(e => (
              <div key={e.empleado} className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                <span>👤 {e.empleado}</span>
                <span>
                  <strong className="texto-naranja">${(e.total||0).toLocaleString('es-CO')}</strong>
                  <span className="texto-suave" style={{ marginLeft: 8, fontSize: 13 }}>
                    ({e.transacciones} ventas)
                  </span>
                </span>
              </div>
            ))
          ) : (
            <p className="texto-suave" style={{ fontSize: 14 }}>Sin ventas registradas hoy</p>
          )}
        </div>

        {/* Alertas */}
        {(alertasStock.length > 0 || alertasVenc.length > 0) && (
          <div className="card" style={{ minWidth: 280 }}>
            <div className="card-titulo">⚠️ Alertas</div>
            {alertasVenc.map(i => (
              <div key={i.id} className="alerta amarillo" style={{ marginBottom: 6 }}>
                🕐 <strong>{i.nombre}</strong> — próximo a vencer
              </div>
            ))}
            {alertasStock.slice(0, 6).map(i => {
              const prov = mapIngProv[i.id];
              const waMsg = prov
                ? `Hola ${prov.contacto_nombre || prov.nombre}, necesito: ${i.nombre} - ${i.stock_minimo} ${i.unidad}`
                : '';
              return (
                <div key={i.id} className="alerta rojo"
                  style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    📦 <strong>{i.nombre}</strong> — stock bajo
                    {prov && (
                      <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                        Contactar: {prov.nombre} · {prov.telefono}
                      </div>
                    )}
                  </div>
                  {prov && (
                    <a href={`https://wa.me/57${prov.telefono}?text=${encodeURIComponent(waMsg)}`}
                      target="_blank" rel="noreferrer"
                      style={{
                        fontSize: 12, padding: '3px 8px', background: 'rgba(255,255,255,0.2)',
                        borderRadius: 6, color: 'inherit', textDecoration: 'none',
                        fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8,
                      }}>
                      📲 WA
                    </a>
                  )}
                </div>
              );
            })}
            {alertasStock.length > 6 && (
              <div className="texto-suave" style={{ fontSize: 13 }}>
                +{alertasStock.length - 6} más con stock bajo
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gráficas */}
      <div className="dashboard-charts">
        {/* Ventas por hora */}
        <div className="card">
          <div className="card-titulo">Ventas por hora (hoy)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ventasHora} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--borde)" />
              <XAxis
                dataKey="hora"
                tickFormatter={h => `${h}h`}
                tick={{ fill: 'var(--texto-suave)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                tick={{ fill: 'var(--texto-suave)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TooltipVentas />} />
              <Bar dataKey="total" fill="var(--naranja)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Productos del día */}
        <div className="card">
          <div className="card-titulo">Productos vendidos hoy</div>
          {ventasProd.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={ventasProd}
                  dataKey="unidades"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  label={({ nombre, unidades }) =>
                    `${nombre.replace('Adición: ', '').slice(0, 10)} (${unidades})`
                  }
                  labelLine={false}
                  fontSize={11}
                >
                  {ventasProd.map((_, i) => (
                    <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' uds', n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="vacio" style={{ height: 200 }}>Sin ventas aún hoy</div>
          )}
        </div>
      </div>
    </div>
  );
}

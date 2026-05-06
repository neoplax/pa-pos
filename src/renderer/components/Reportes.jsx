import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';

export default function Reportes() {
  const { esAdmin }                         = useApp();
  const [vista, setVista]                   = useState('dias');
  const [empleado, setEmpleado]             = useState('todos');
  const [diasRango, setDiasRango]           = useState(30);
  const [ventasDia, setVentasDia]           = useState([]);
  const [ventasProd, setVentasProd]         = useState([]);
  const [compras, setCompras]               = useState([]);
  const [gastosPeriodo, setGastosPeriodo]   = useState([]);
  const [proveedores, setProveedores]       = useState([]);
  const [domicilios, setDomicilios]         = useState({ resumen: {}, lista: [] });
  const [bajas, setBajas]                   = useState([]);
  const [saldo, setSaldo]                   = useState(null);
  const [empleados, setEmpleados]           = useState([]);
  const [reporteDescuentos, setReporteDescuentos] = useState(null);
  const [transferencias, setTransferencias] = useState([]);
  const [cargando, setCargando]             = useState(false);

  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  const fechaInicio = (() => {
    const d = new Date();
    d.setDate(d.getDate() - diasRango);
    return new Date(d - d.getTimezoneOffset() * 60_000).toISOString().split('T')[0];
  })();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const promesas = [
        window.electronAPI.getVentasRango({ fechaInicio, fechaFin: hoy, empleado }),
        window.electronAPI.getVentasPorProducto({ fechaInicio, fechaFin: hoy, empleado }),
        window.electronAPI.getCompras({ fechaInicio, fechaFin: hoy }),
        window.electronAPI.getGastos({ fechaInicio, fechaFin: hoy }),
        window.electronAPI.getProveedores(),
        window.electronAPI.getVentasDomicilios({ fechaInicio, fechaFin: hoy }),
        window.electronAPI.getBajas({ fechaInicio, fechaFin: hoy }),
        window.electronAPI.getEmpleados(),
        window.electronAPI.getReporteDescuentos({ fechaInicio, fechaFin: hoy }),
        window.electronAPI.getTransferenciasInternas({ fechaInicio, fechaFin: hoy }),
      ];
      if (esAdmin) promesas.push(window.electronAPI.getSaldoDisponible());

      const [dias, prods, comprasData, gastosData, provs, doms, bajasData, emps, descData, transData, saldoData] =
        await Promise.all(promesas);

      setVentasDia(dias);
      setVentasProd(prods);
      setCompras(comprasData);
      setGastosPeriodo(gastosData || []);
      setProveedores(provs);
      setDomicilios(doms || { resumen: {}, lista: [] });
      setBajas(bajasData || []);
      setEmpleados(emps || []);
      setReporteDescuentos(descData || null);
      setTransferencias(transData || []);
      if (esAdmin && saldoData) setSaldo(saldoData);
    } catch (err) {
      console.error('[Reportes] Error:', err);
    } finally {
      setCargando(false);
    }
  }, [fechaInicio, hoy, empleado, esAdmin]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalPeriodo  = ventasDia.reduce((s, d) => s + (d.total || 0), 0);
  const totalTrans    = ventasDia.reduce((s, d) => s + (d.transacciones || 0), 0);
  const ticketProm    = totalTrans > 0 ? Math.round(totalPeriodo / totalTrans) : 0;
  const totalEgresos  = gastosPeriodo.reduce((s, g) => s + (g.monto || 0), 0);
  const utilidadNeta  = totalPeriodo - totalEgresos;

  const formatFecha = (str) => {
    if (!str) return '';
    const parts = str.split('-');
    return `${parts[2]}/${parts[1]}`;
  };

  return (
    <div>
      <div className="pagina-titulo">Reportes</div>

      {/* ── Saldo disponible (solo admin) ── */}
      {esAdmin && saldo && (
        <div className="card mb-24">
          <div className="card-titulo" style={{ marginBottom: 16 }}>
            SALDO DISPONIBLE ACTUAL
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <TarjetaSaldo
              label="Efectivo disponible"
              valor={saldo.efectivo}
              color="var(--verde)"
            />
            <TarjetaSaldo
              label="Nequi disponible"
              valor={saldo.nequi}
              color="var(--azul)"
            />
            <TarjetaSaldo
              label="Total disponible"
              valor={saldo.total}
              color="var(--naranja)"
              grande
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 8 }}>
            Base inicial hoy: ${(saldo.baseEfectivo || 0).toLocaleString('es-CO')} efectivo
            {' '}· ${(saldo.baseNequi || 0).toLocaleString('es-CO')} Nequi.
            {' '}Calculado sobre historial completo: base + ventas − gastos − compras por método.
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card mb-24">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-grupo" style={{ minWidth: 160 }}>
            <label className="form-label">Empleado</label>
            <select value={empleado} onChange={e => setEmpleado(e.target.value)}>
              <option value="todos">Todos</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.nombre}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-grupo" style={{ minWidth: 160 }}>
            <label className="form-label">Período</label>
            <select value={diasRango} onChange={e => setDiasRango(parseInt(e.target.value))}>
              <option value={7}>Última semana</option>
              <option value={15}>Últimos 15 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 3 meses</option>
            </select>
          </div>
          <button className="btn btn-primario" onClick={cargar}>Aplicar</button>
        </div>
      </div>

      {/* Stats del período */}
      <div className="stats-grid mb-24">
        <div className="stat-card naranja">
          <span className="stat-label">Ventas del período</span>
          <span className="stat-valor">${totalPeriodo.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Egresos del período</span>
          <span className="stat-valor texto-rojo">${totalEgresos.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card verde">
          <span className="stat-label">Utilidad neta</span>
          <span className={`stat-valor ${utilidadNeta >= 0 ? 'texto-verde' : 'texto-rojo'}`}>
            ${utilidadNeta.toLocaleString('es-CO')}
          </span>
        </div>
        <div className="stat-card azul">
          <span className="stat-label">Ticket promedio</span>
          <span className="stat-valor">${ticketProm.toLocaleString('es-CO')}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="pos-tabs mb-16">
        {[
          { id: 'dias',        label: 'Ventas por día'    },
          { id: 'productos',   label: 'Ranking productos' },
          { id: 'flujo',       label: 'Flujo de caja'    },
          { id: 'gastos',      label: 'Gastos / Compras'  },
          { id: 'proveedores', label: 'Proveedores'       },
          { id: 'domicilios',  label: 'Domicilios'        },
          { id: 'descuentos',  label: 'Descuentos'       },
          { id: 'bajas',       label: 'Bajas'             },
        ].map(t => (
          <button key={t.id}
            className={`pos-tab ${vista === t.id ? 'activo' : ''}`}
            onClick={() => setVista(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="cargando">Cargando reportes...</div>
      ) : vista === 'dias' ? (
        <VentasPorDia datos={ventasDia} formatFecha={formatFecha} />
      ) : vista === 'productos' ? (
        <VentasPorProducto datos={ventasProd} />
      ) : vista === 'flujo' ? (
        <FlujoCaja ventasDia={ventasDia} gastosPeriodo={gastosPeriodo} formatFecha={formatFecha}
          totalPeriodo={totalPeriodo} totalEgresos={totalEgresos} />
      ) : vista === 'gastos' ? (
        <GastosPeriodo compras={compras} gastos={gastosPeriodo} formatFecha={formatFecha}
          transferencias={transferencias} />
      ) : vista === 'domicilios' ? (
        <ReporteDomicilios data={domicilios} fechaInicio={fechaInicio} fechaFin={hoy} />
      ) : vista === 'descuentos' ? (
        <ReporteDescuentos data={reporteDescuentos} />
      ) : vista === 'bajas' ? (
        <ReporteBajas datos={bajas} />
      ) : (
        <ReporteProveedores compras={compras} proveedores={proveedores} />
      )}
    </div>
  );
}

// ── Tarjeta saldo disponible ──────────────────────────────────────────────────

function TarjetaSaldo({ label, valor, color, grande = false }) {
  return (
    <div style={{
      background: 'var(--fondo)',
      border: `2px solid ${color}`,
      borderRadius: 12,
      padding: grande ? '20px 24px' : '16px 20px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: grande ? 22 : 18,
        fontWeight: 900,
        color: valor >= 0 ? color : 'var(--rojo)',
      }}>
        ${Math.round(valor).toLocaleString('es-CO')}
      </div>
    </div>
  );
}

// ── Flujo de Caja ─────────────────────────────────────────────────────────────

function FlujoCaja({ ventasDia, gastosPeriodo, formatFecha, totalPeriodo, totalEgresos }) {
  // Agrupar gastos por día
  const gastosPorDia = {};
  for (const g of gastosPeriodo) {
    const dia = (g.fecha || '').split(' ')[0];
    if (dia) gastosPorDia[dia] = (gastosPorDia[dia] || 0) + (g.monto || 0);
  }

  // Combinar ventas y gastos por día
  const diasSet = new Set([
    ...ventasDia.map(d => d.dia),
    ...Object.keys(gastosPorDia),
  ]);
  const dataDias = Array.from(diasSet)
    .sort()
    .map(dia => ({
      dia,
      ventas:  ventasDia.find(d => d.dia === dia)?.total || 0,
      egresos: gastosPorDia[dia] || 0,
    }));

  const utilidad = totalPeriodo - totalEgresos;

  return (
    <div>
      <div className="stats-grid mb-24">
        <div className="stat-card naranja">
          <span className="stat-label">Ingresos</span>
          <span className="stat-valor">${totalPeriodo.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Egresos</span>
          <span className="stat-valor texto-rojo">${totalEgresos.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${utilidad >= 0 ? 'var(--verde)' : 'var(--rojo)'}` }}>
          <span className="stat-label">Utilidad neta</span>
          <span className={`stat-valor ${utilidad >= 0 ? 'texto-verde' : 'texto-rojo'}`}>
            ${utilidad.toLocaleString('es-CO')}
          </span>
        </div>
      </div>

      {dataDias.length > 1 && (
        <div className="card">
          <div className="card-titulo">Ventas vs Egresos por día</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dataDias} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--borde)" />
              <XAxis dataKey="dia" tickFormatter={formatFecha}
                tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, name) => [`$${v.toLocaleString('es-CO')}`, name === 'ventas' ? 'Ventas' : 'Egresos']}
                contentStyle={{ background: 'var(--fondo-card)', border: '1px solid var(--borde)', borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="ventas"  fill="var(--naranja)" radius={[4, 4, 0, 0]} opacity={0.85} />
              <Bar dataKey="egresos" fill="var(--rojo)"    radius={[4, 4, 0, 0]} opacity={0.75} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Gastos del Período ────────────────────────────────────────────────────────

function GastosPeriodo({ compras, gastos, formatFecha, transferencias = [] }) {
  // Combina compras + gastos para el período
  const totalCompras = compras.reduce((s, c) => s + c.precio_pagado, 0);
  const totalGastos  = gastos.filter(g => g.tipo_registro === 'gasto').reduce((s, g) => s + g.monto, 0);
  const totalEgresos = gastos.reduce((s, g) => s + (g.monto || 0), 0);

  if (gastos.length === 0 && compras.length === 0) {
    return <div className="vacio card">Sin egresos registrados en este período</div>;
  }

  // Agrupar por día (gastos unificados)
  const porDia = {};
  for (const g of gastos) {
    const dia = (g.fecha || '').split(' ')[0];
    if (dia) porDia[dia] = (porDia[dia] || 0) + (g.monto || 0);
  }
  const dataDias = Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, total]) => ({ dia, total }));

  // Agrupar por categoría
  const porCat = {};
  for (const g of gastos) {
    porCat[g.categoria] = (porCat[g.categoria] || 0) + (g.monto || 0);
  }
  const topCat = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="stats-grid mb-16">
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Compras insumos</span>
          <span className="stat-valor texto-rojo">${totalCompras.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--amarillo)' }}>
          <span className="stat-label">Otros gastos</span>
          <span className="stat-valor" style={{ color: 'var(--amarillo)' }}>${totalGastos.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Total egresos</span>
          <span className="stat-valor texto-rojo">${totalEgresos.toLocaleString('es-CO')}</span>
        </div>
      </div>

      {dataDias.length > 1 && (
        <div className="card mb-16">
          <div className="card-titulo">Egresos por día</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dataDias} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--borde)" />
              <XAxis dataKey="dia" tickFormatter={formatFecha}
                tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => [`$${v.toLocaleString('es-CO')}`, 'Egresos']}
                contentStyle={{ background: 'var(--fondo-card)', border: '1px solid var(--borde)', borderRadius: 8 }} />
              <Bar dataKey="total" fill="var(--rojo)" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {topCat.length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo">Por categoría</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topCat.map(([cat, total]) => (
              <div key={cat} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 12px', borderRadius: 6,
                background: 'var(--fondo)', border: '1px solid var(--borde)',
              }}>
                <span style={{ fontWeight: 600 }}>{cat}</span>
                <span className="texto-rojo negrita">${total.toLocaleString('es-CO')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-titulo">Detalle — Total: <span className="texto-rojo">${totalEgresos.toLocaleString('es-CO')}</span></div>
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => (
                <tr key={`${g.tipo_registro}-${g.id}`}>
                  <td className="texto-suave">{(g.fecha || '').split(' ')[0]}</td>
                  <td className="negrita">{g.descripcion}</td>
                  <td><span className="badge badge-azul" style={{ fontSize: 10 }}>{g.categoria}</span></td>
                  <td className="texto-suave">{g.metodo_pago || 'efectivo'}</td>
                  <td style={{ textAlign: 'right' }} className="texto-rojo negrita">
                    ${(g.monto || 0).toLocaleString('es-CO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {transferencias.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-titulo" style={{ color: 'var(--texto-suave)' }}>
            Transferencias internas — no afectan totales
          </div>
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Concepto</th><th>De</th><th>A</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map(t => (
                  <tr key={t.id} style={{ opacity: 0.7 }}>
                    <td className="texto-suave">{(t.fecha || '').split(' ')[0]}</td>
                    <td>{t.concepto}</td>
                    <td><span className="badge badge-azul" style={{ fontSize: 10 }}>{t.de_medio}</span></td>
                    <td><span className="badge badge-verde" style={{ fontSize: 10 }}>{t.a_medio}</span></td>
                    <td style={{ textAlign: 'right' }} className="texto-suave negrita">
                      ${(t.valor || 0).toLocaleString('es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ventas por Día ────────────────────────────────────────────────────────────

function VentasPorDia({ datos, formatFecha }) {
  if (datos.length === 0) {
    return <div className="vacio card">Sin ventas en este período</div>;
  }

  return (
    <div className="card">
      <div className="card-titulo">Ventas diarias</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={datos} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--borde)" />
          <XAxis dataKey="dia" tickFormatter={formatFecha}
            tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
            tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={v => [`$${v.toLocaleString('es-CO')}`, 'Ventas']}
            labelFormatter={l => `Fecha: ${l}`}
            contentStyle={{ background: 'var(--fondo-card)', border: '1px solid var(--borde)', borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="total" stroke="var(--naranja)" strokeWidth={2.5}
            dot={{ fill: 'var(--naranja)', r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="tabla-wrapper" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Transacciones</th><th>Total ventas</th><th>Ticket prom.</th>
            </tr>
          </thead>
          <tbody>
            {[...datos].reverse().map(d => (
              <tr key={d.dia}>
                <td>{d.dia}</td>
                <td>{d.transacciones}</td>
                <td className="negrita texto-naranja">${(d.total || 0).toLocaleString('es-CO')}</td>
                <td className="texto-suave">
                  ${d.transacciones > 0 ? Math.round(d.total / d.transacciones).toLocaleString('es-CO') : 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ranking de Productos ──────────────────────────────────────────────────────

function VentasPorProducto({ datos }) {
  if (datos.length === 0) {
    return <div className="vacio card">Sin ventas en este período</div>;
  }

  const maxTotal = Math.max(...datos.map(d => d.total || 0));

  return (
    <div>
      <div className="card mb-16">
        <div className="card-titulo">Ingresos por producto</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={datos.slice(0, 10)} layout="vertical"
            margin={{ top: 0, right: 20, left: 120, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borde)" horizontal={false} />
            <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
              tick={{ fill: 'var(--texto-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="nombre"
              tick={{ fill: 'var(--texto)', fontSize: 12 }} axisLine={false} tickLine={false}
              width={118} tickFormatter={n => n.length > 16 ? n.slice(0, 16) + '…' : n} />
            <Tooltip formatter={v => [`$${v.toLocaleString('es-CO')}`, 'Ingresos']}
              contentStyle={{ background: 'var(--fondo-card)', border: '1px solid var(--borde)', borderRadius: 8 }} />
            <Bar dataKey="total" fill="var(--naranja)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-titulo">Ranking completo</div>
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Producto</th><th>Categoría</th>
                <th>Unidades</th><th>Total ingresos</th><th>% del total</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((prod, i) => (
                <tr key={prod.nombre}>
                  <td style={{ color: i < 3 ? 'var(--naranja)' : 'var(--texto-suave)', fontWeight: i < 3 ? 700 : 400 }}>
                    {i + 1}
                  </td>
                  <td className="negrita">{prod.nombre}</td>
                  <td><span className="badge badge-azul">{prod.categoria}</span></td>
                  <td>{prod.unidades}</td>
                  <td className="texto-naranja negrita">${(prod.total || 0).toLocaleString('es-CO')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        background: 'var(--naranja)', height: 6, borderRadius: 3,
                        width: `${Math.round((prod.total / maxTotal) * 80)}px`, opacity: 0.8,
                      }} />
                      <span className="texto-suave" style={{ fontSize: 12 }}>
                        {maxTotal > 0 ? Math.round((prod.total / maxTotal) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Reporte Domicilios ────────────────────────────────────────────────────────

const LABEL_PLATAFORMA = {
  rappi:           'Rappi',
  ifood:           'iFood',
  domicilios_com:  'Domicilios.com',
  whatsapp:        'WhatsApp',
  otro:            'Otro',
};

function ReporteDomicilios({ data, fechaInicio, fechaFin }) {
  const { resumen = {}, lista = [] } = data;
  const numDom   = resumen.num_domicilios    || 0;
  const totalDom = resumen.total_domicilios  || 0;
  const promDom  = resumen.promedio_domicilio || 0;

  const [externos, setExternos] = useState(null);
  const [cargandoExt, setCargandoExt] = useState(false);

  useEffect(() => {
    if (!fechaInicio || !fechaFin) return;
    setCargandoExt(true);
    window.electronAPI.getReporteDomiciliosExternos({ fechaInicio, fechaFin })
      .then(d => setExternos(d))
      .catch(() => {})
      .finally(() => setCargandoExt(false));
  }, [fechaInicio, fechaFin]);

  const porPlataforma  = externos?.porPlataforma  || [];
  const propios        = externos?.propios        || {};
  const externosList   = externos?.externos       || [];
  const totalComisiones = porPlataforma.reduce((s, p) => s + (p.total_comisiones || 0), 0);
  const totalNeto       = porPlataforma.reduce((s, p) => s + (p.ingreso_neto    || 0), 0);

  return (
    <div>
      {/* Stats generales */}
      <div className="stats-grid mb-24">
        <div className="stat-card naranja">
          <span className="stat-label">Domicilios realizados</span>
          <span className="stat-valor">{numDom}</span>
        </div>
        <div className="stat-card verde">
          <span className="stat-label">Total cobrado (domicilios)</span>
          <span className="stat-valor">${totalDom.toLocaleString('es-CO')}</span>
        </div>
        <div className="stat-card azul">
          <span className="stat-label">Promedio domicilio</span>
          <span className="stat-valor">${Math.round(promDom).toLocaleString('es-CO')}</span>
        </div>
      </div>

      {/* Plataformas externas */}
      {cargandoExt ? (
        <div className="cargando">Cargando datos de plataformas...</div>
      ) : porPlataforma.length > 0 ? (
        <>
          <div className="card mb-16">
            <div className="card-titulo">Plataformas externas — Comisiones del período</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--fondo)', border: '2px solid var(--rojo)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>Total comisiones pagadas</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--rojo)' }}>
                  -${totalComisiones.toLocaleString('es-CO')}
                </div>
              </div>
              <div style={{ background: 'var(--fondo)', border: '2px solid var(--verde)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>Ingreso neto plataformas</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--verde)' }}>
                  ${totalNeto.toLocaleString('es-CO')}
                </div>
              </div>
              <div style={{ background: 'var(--fondo)', border: '2px solid var(--azul)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>Pedidos propios (WhatsApp)</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--azul)' }}>
                  {propios?.pedidos || 0}
                </div>
              </div>
            </div>

            {/* Desglose por plataforma */}
            <div className="tabla-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Plataforma</th>
                    <th style={{ textAlign: 'right' }}>Pedidos</th>
                    <th style={{ textAlign: 'right' }}>Total bruto</th>
                    <th style={{ textAlign: 'right' }}>Comisiones</th>
                    <th style={{ textAlign: 'right' }}>Ingreso neto</th>
                  </tr>
                </thead>
                <tbody>
                  {porPlataforma.map(p => (
                    <tr key={p.plataforma_domicilio}>
                      <td className="negrita">
                        {LABEL_PLATAFORMA[p.plataforma_domicilio] || p.plataforma_domicilio}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.pedidos}</td>
                      <td style={{ textAlign: 'right' }} className="texto-naranja negrita">
                        ${(p.total_bruto || 0).toLocaleString('es-CO')}
                      </td>
                      <td style={{ textAlign: 'right' }} className="texto-rojo">
                        -${(p.total_comisiones || 0).toLocaleString('es-CO')}
                      </td>
                      <td style={{ textAlign: 'right' }} className="texto-verde negrita">
                        ${(p.ingreso_neto || 0).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle pedidos externos */}
          {externosList.length > 0 && (
            <div className="card mb-16">
              <div className="card-titulo">Detalle de pedidos por plataforma</div>
              <div className="tabla-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Plataforma</th><th>Orden</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Comisión</th>
                      <th style={{ textAlign: 'right' }}>Neto</th>
                      <th>Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {externosList.map((v, i) => (
                      <tr key={i}>
                        <td className="texto-suave">{(v.fecha || '').split(' ')[0]}</td>
                        <td>
                          <span className="badge badge-azul">
                            {LABEL_PLATAFORMA[v.plataforma_domicilio] || v.plataforma_domicilio}
                          </span>
                        </td>
                        <td className="texto-suave">{v.numero_orden_domicilio || '—'}</td>
                        <td style={{ textAlign: 'right' }} className="texto-naranja negrita">
                          ${(v.total || 0).toLocaleString('es-CO')}
                        </td>
                        <td style={{ textAlign: 'right' }} className="texto-rojo">
                          -{v.comision_domicilio_pct}% = ${(v.comision_domicilio_valor || 0).toLocaleString('es-CO')}
                        </td>
                        <td style={{ textAlign: 'right' }} className="texto-verde negrita">
                          ${(v.valor_neto || 0).toLocaleString('es-CO')}
                        </td>
                        <td className="texto-suave">{v.factura_num > 0 ? `#${v.factura_num}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        externos !== null && (
          <div className="alerta azul mb-16">
            Sin pedidos de plataformas externas en este período.
          </div>
        )
      )}

      {/* Domicilios propios (lista histórica de todas las ventas con domicilio) */}
      {lista.length === 0 ? (
        <div className="vacio card">Sin domicilios en este período</div>
      ) : (
        <div className="card">
          <div className="card-titulo">Todos los domicilios del período ({lista.length})</div>
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Empleado</th><th>Total venta</th>
                  <th>Domicilio</th><th>Tipo</th><th>Pago</th><th>Factura</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(v => (
                  <tr key={v.id}>
                    <td className="texto-suave">{(v.fecha || '').split(' ')[0]}</td>
                    <td>{v.empleado}</td>
                    <td className="negrita texto-naranja">${(v.total || 0).toLocaleString('es-CO')}</td>
                    <td className="negrita texto-verde">${(v.domicilio || 0).toLocaleString('es-CO')}</td>
                    <td>
                      {v.plataforma_domicilio && v.plataforma_domicilio !== '' ? (
                        <span className="badge badge-azul">
                          {LABEL_PLATAFORMA[v.plataforma_domicilio] || v.plataforma_domicilio}
                        </span>
                      ) : (
                        <span className="badge badge-verde">Propio</span>
                      )}
                    </td>
                    <td><span className="badge badge-azul">{v.metodo_pago}</span></td>
                    <td className="texto-suave">{v.factura_num > 0 ? `#${v.factura_num}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reporte Proveedores ───────────────────────────────────────────────────────

function ReporteProveedores({ compras, proveedores }) {
  const porProv = {};
  for (const c of compras) {
    const key = c.proveedor || 'Sin proveedor';
    if (!porProv[key]) porProv[key] = { total: 0, items: {}, veces: 0 };
    porProv[key].total += c.precio_pagado;
    porProv[key].veces += 1;
    if (!porProv[key].items[c.ingrediente_nombre]) porProv[key].items[c.ingrediente_nombre] = 0;
    porProv[key].items[c.ingrediente_nombre] += c.precio_pagado;
  }

  const provOrdenados = Object.entries(porProv).sort((a, b) => b[1].total - a[1].total);
  const totalGastos   = compras.reduce((s, c) => s + c.precio_pagado, 0);

  return (
    <div>
      <div className="card mb-16">
        <div className="card-titulo">Directorio de proveedores</div>
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id}>
                  <td className="negrita">{p.nombre}</td>
                  <td className="texto-suave">{p.contacto_nombre || '—'}</td>
                  <td>{p.telefono}</td>
                  <td>
                    <a href={`https://wa.me/57${p.telefono}`} target="_blank" rel="noreferrer"
                      className="btn btn-exito"
                      style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>WA</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {provOrdenados.length > 0 && (
        <div className="card">
          <div className="card-titulo">
            Gasto por proveedor — Total: <span className="texto-rojo">${totalGastos.toLocaleString('es-CO')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {provOrdenados.map(([nombre, data]) => {
              const topItems = Object.entries(data.items).sort((a, b) => b[1] - a[1]).slice(0, 5);
              return (
                <div key={nombre} style={{
                  padding: '12px 16px', borderRadius: 8,
                  background: 'var(--fondo)', border: '1px solid var(--borde)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700 }}>{nombre}</span>
                    <span>
                      <span className="texto-rojo negrita">${data.total.toLocaleString('es-CO')}</span>
                      <span className="texto-suave" style={{ marginLeft: 8, fontSize: 12 }}>({data.veces} compras)</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {topItems.map(([item, total]) => (
                      <span key={item} style={{
                        fontSize: 11, padding: '2px 8px',
                        background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
                        borderRadius: 12,
                      }}>
                        {item}: ${total.toLocaleString('es-CO')}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reporte Descuentos ────────────────────────────────────────────────────────

function ReporteDescuentos({ data }) {
  if (!data) return <div className="cargando">Cargando...</div>;

  const { resumen = {}, porDescuento = [] } = data;
  const totalDescontado  = resumen.total_descontado   || 0;
  const ventasConDesc    = resumen.ventas_con_descuento || 0;
  const promedioDescuento = resumen.promedio_descuento  || 0;

  return (
    <div>
      <div className="stats-grid mb-24">
        <div className="stat-card naranja">
          <span className="stat-label">Ventas con descuento</span>
          <span className="stat-valor">{ventasConDesc}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className="stat-label">Total descontado</span>
          <span className="stat-valor texto-rojo">
            -${Math.round(totalDescontado).toLocaleString('es-CO')}
          </span>
        </div>
        <div className="stat-card azul">
          <span className="stat-label">Descuento promedio</span>
          <span className="stat-valor">${Math.round(promedioDescuento).toLocaleString('es-CO')}</span>
        </div>
      </div>

      {porDescuento.length === 0 ? (
        <div className="vacio card">Sin ventas con descuento en este período</div>
      ) : (
        <div className="card">
          <div className="card-titulo">Descuentos aplicados por tipo</div>
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Descuento</th>
                  <th style={{ textAlign: 'right' }}>Usos</th>
                  <th style={{ textAlign: 'right' }}>Total descontado</th>
                  <th style={{ textAlign: 'right' }}>Promedio por uso</th>
                </tr>
              </thead>
              <tbody>
                {porDescuento.map(d => (
                  <tr key={d.descuento_nombre}>
                    <td className="negrita">{d.descuento_nombre || '(sin nombre)'}</td>
                    <td style={{ textAlign: 'right' }}>{d.usos}</td>
                    <td style={{ textAlign: 'right' }} className="texto-rojo negrita">
                      -${(d.total_descontado || 0).toLocaleString('es-CO')}
                    </td>
                    <td style={{ textAlign: 'right' }} className="texto-suave">
                      ${d.usos > 0 ? Math.round(d.total_descontado / d.usos).toLocaleString('es-CO') : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reporte Bajas ─────────────────────────────────────────────────────────────

function ReporteBajas({ datos }) {
  if (datos.length === 0) {
    return <div className="vacio card">Sin bajas en este período</div>;
  }

  const totalPorMotivo = {};
  for (const b of datos) {
    totalPorMotivo[b.motivo] = (totalPorMotivo[b.motivo] || 0) + 1;
  }

  const porIngrediente = {};
  for (const b of datos) {
    if (!porIngrediente[b.ingrediente_nombre]) porIngrediente[b.ingrediente_nombre] = 0;
    porIngrediente[b.ingrediente_nombre] += b.cantidad;
  }
  const topIng = Object.entries(porIngrediente).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div>
      <div className="stats-grid mb-24">
        {Object.entries(totalPorMotivo).map(([motivo, count]) => (
          <div key={motivo} className="stat-card" style={{ borderTop: '3px solid var(--rojo)' }}>
            <span className="stat-label">{motivo}</span>
            <span className="stat-valor">{count} baja{count > 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      {topIng.length > 0 && (
        <div className="card mb-16">
          <div className="card-titulo">Ingredientes con más bajas</div>
          {topIng.map(([nombre, cant]) => (
            <div key={nombre} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '6px 12px', borderRadius: 6,
              background: 'var(--fondo)', border: '1px solid var(--borde)', marginBottom: 6,
            }}>
              <span>{nombre}</span>
              <span className="texto-rojo negrita">{cant} uds.</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-titulo">Detalle ({datos.length})</div>
        <div className="tabla-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Ingrediente</th><th>Cantidad</th>
                <th>Motivo</th><th>Empleado</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(b => (
                <tr key={b.id}>
                  <td className="texto-suave">{(b.fecha || '').split(' ')[0]}</td>
                  <td className="negrita">{b.ingrediente_nombre}</td>
                  <td>{b.cantidad}</td>
                  <td><span className="badge badge-rojo">{b.motivo}</span></td>
                  <td className="texto-suave">{b.empleado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIAS_LABEL = {
  carne:      '🥩 Carnes',
  pan:        '🍞 Panes',
  lacteo:     '🧀 Lácteos',
  vegetal:    '🥦 Vegetales',
  bebida:     '🥤 Bebidas',
  salsa:      '🫙 Salsas',
  topping:    '🌽 Toppings',
  preparado:  '⏱️ Preparados',
  desechable: '🛍️ Desechables',
  otro:       '📦 Otros',
};

const MOTIVOS_BAJA = [
  { value: 'vencimiento', label: '📅 Vencimiento'          },
  { value: 'daño',        label: '💥 Daño / Rotura'        },
  { value: 'merma',       label: '📉 Merma en preparación' },
  { value: 'consumo',     label: '🍴 Consumo interno'      },
  { value: 'otro',        label: '📦 Otro'                 },
];

// Configuración visual de cada nivel de riesgo
const NIVEL_CONFIG = {
  sinStock: {
    label:      '⚫ Sin stock',
    bg:         'rgba(231,76,60,0.10)',
    borde:      'rgba(231,76,60,0.40)',
    barColor:   '#e74c3c',
    badgeText:  'FALTA',
    badgeClass: 'badge-rojo',
    colorTexto: 'var(--rojo)',
  },
  urgente: {
    label:      '🔴 Urgente',
    bg:         'rgba(230,126,34,0.08)',
    borde:      'rgba(230,126,34,0.35)',
    barColor:   '#e67e22',
    badgeText:  'URGENTE',
    badgeClass: 'badge-naranja',
    colorTexto: 'var(--naranja)',
  },
  riesgo: {
    label:      '🟡 En riesgo',
    bg:         'rgba(243,156,18,0.07)',
    borde:      'rgba(243,156,18,0.30)',
    barColor:   '#f39c12',
    badgeText:  'RIESGO',
    badgeClass: 'badge-amarillo',
    colorTexto: 'var(--amarillo)',
  },
  ok: {
    label:      '🟢 OK',
    bg:         'var(--fondo-card)',
    borde:      'var(--borde)',
    barColor:   '#27ae60',
    badgeText:  'OK',
    badgeClass: 'badge-verde',
    colorTexto: 'var(--verde)',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Determina el nivel de riesgo de un ingrediente
function nivelRiesgo(ing) {
  if (ing.stock_actual === 0) return 'sinStock';
  if (ing.stock_minimo > 0 && ing.stock_actual <= ing.stock_minimo) return 'urgente';
  if (ing.stock_minimo > 0 && ing.stock_actual <= ing.stock_minimo * 1.5) return 'riesgo';
  return 'ok';
}

function formatStock(ing) {
  if (ing.unidad === 'paquete' && ing.unidades_por_paquete > 0) {
    return `${ing.stock_actual} paq. (${ing.stock_actual * ing.unidades_por_paquete} und.)`;
  }
  return `${ing.stock_actual} ${ing.unidad}`;
}

function diasVencimiento(ing) {
  if (!ing.es_perecedero || !ing.fecha_preparacion) return null;
  const diasPasados = (Date.now() - new Date(ing.fecha_preparacion).getTime()) / 86400000;
  return Math.max(0, ing.duracion_dias - Math.floor(diasPasados));
}

function waUrl(telefono, texto) {
  return `https://wa.me/57${telefono}?text=${encodeURIComponent(texto)}`;
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function Inventario() {
  const { empleado, notificar } = useApp();
  const [exportando, setExportando]   = useState(false);
  const [exportPath, setExportPath]   = useState(null);

  // Datos
  const [ingredientes,  setIngredientes]  = useState([]);
  const [proveedores,   setProveedores]   = useState([]);
  const [batchTipos,    setBatchTipos]    = useState([]);
  const [preparaciones, setPreparaciones] = useState([]);
  const [bajas,         setBajas]         = useState([]);
  const [cargando,      setCargando]      = useState(true);

  // Filtros
  const [busqueda,     setBusqueda]     = useState('');
  const [catActiva,    setCatActiva]    = useState('todas');
  const [filtroNivel,  setFiltroNivel]  = useState('todos');

  // UI
  const [verBajas,    setVerBajas]    = useState(false);

  // Modales
  const [modalStock,  setModalStock]  = useState(null); // ingrediente
  const [modalBaja,   setModalBaja]   = useState(null); // ingrediente | true
  const [modalCompra, setModalCompra] = useState(null); // ingrediente
  const [modalBatch,  setModalBatch]  = useState(false);

  // Carga inicial de datos
  const cargar = useCallback(async () => {
    try {
      const [ings, provs, tipos, preps, bajasData] = await Promise.all([
        window.electronAPI.getIngredientes(),
        window.electronAPI.getProveedores(),
        window.electronAPI.getBatchTipos(),
        window.electronAPI.getPreparaciones(),
        window.electronAPI.getBajas({ limite: 20 }),
      ]);
      setIngredientes(ings);
      setProveedores(provs);
      setBatchTipos(tipos);
      setPreparaciones(preps);
      setBajas(bajasData || []);
    } catch (err) {
      console.error('[Inventario] Error al cargar:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mapa ingId → lista de proveedores que lo suministran
  const provMap = useMemo(() => {
    const m = {};
    for (const prov of proveedores) {
      for (const id of JSON.parse(prov.ingredientes || '[]')) {
        if (!m[id]) m[id] = [];
        m[id].push(prov);
      }
    }
    return m;
  }, [proveedores]);

  // Ingredientes filtrados por búsqueda, categoría y nivel de riesgo
  const ingsFiltrados = useMemo(() => {
    return ingredientes.filter(i => {
      const matchBusq  = i.nombre.toLowerCase().includes(busqueda.toLowerCase());
      const matchCat   = catActiva === 'todas' || i.categoria === catActiva;
      const matchNivel = filtroNivel === 'todos' || nivelRiesgo(i) === filtroNivel;
      return matchBusq && matchCat && matchNivel;
    });
  }, [ingredientes, busqueda, catActiva, filtroNivel]);

  // Contadores por nivel (sobre el total, sin filtros de búsqueda)
  const resumen = useMemo(() => {
    const r = { sinStock: 0, urgente: 0, riesgo: 0, ok: 0 };
    for (const i of ingredientes) r[nivelRiesgo(i)]++;
    return r;
  }, [ingredientes]);

  // Ingredientes filtrados agrupados por nivel
  const porNivel = useMemo(() => {
    const g = { sinStock: [], urgente: [], riesgo: [], ok: [] };
    for (const i of ingsFiltrados) g[nivelRiesgo(i)].push(i);
    return g;
  }, [ingsFiltrados]);

  // Categorías presentes en el inventario completo
  const categorias = useMemo(() => {
    return [...new Set(ingredientes.map(i => i.categoria))].sort();
  }, [ingredientes]);

  const perecederos = ingredientes.filter(i => i.es_perecedero);

  if (cargando) return <div className="cargando">⏳ Cargando inventario...</div>;

  return (
    <div>
      {/* Animación de parpadeo para badge "FALTA" */}
      <style>{`
        @keyframes parpadeo { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .badge-parpadeo { animation: parpadeo 1.1s ease-in-out infinite; }
      `}</style>

      {/* ── Cabecera ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-24">
        <div className="pagina-titulo" style={{ marginBottom: 0 }}>📦 Inventario</div>
        <div className="flex gap-8">
          <button className="btn btn-secundario" onClick={() => setModalBaja(true)}>
            📉 Registrar baja
          </button>
          <button className="btn btn-secundario" onClick={() => setModalBatch(true)}>
            🍳 Preparación batch
          </button>
          <button className="btn btn-secundario" onClick={cargar}>🔄 Actualizar</button>
          <button
            className="btn btn-secundario"
            disabled={exportando}
            onClick={async () => {
              setExportando(true); setExportPath(null);
              try {
                const res = await window.electronAPI.exportarInventario();
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
            {exportando ? 'Exportando...' : '📊 Exportar inventario'}
          </button>
          {exportPath && (
            <button
              className="btn btn-secundario"
              style={{ fontSize: 12 }}
              onClick={() => window.electronAPI.abrirArchivoExcel(exportPath)}
            >
              Abrir archivo
            </button>
          )}
        </div>
      </div>

      {/* ── 4 tarjetas resumen clickeables ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { nivel: 'sinStock', icon: '⚫', color: 'var(--rojo)'    },
          { nivel: 'urgente',  icon: '🔴', color: 'var(--naranja)' },
          { nivel: 'riesgo',   icon: '🟡', color: 'var(--amarillo)'},
          { nivel: 'ok',       icon: '🟢', color: 'var(--verde)'   },
        ].map(({ nivel, icon, color }) => {
          const activo = filtroNivel === nivel;
          return (
            <div
              key={nivel}
              onClick={() => setFiltroNivel(activo ? 'todos' : nivel)}
              style={{
                padding: '14px 12px', borderRadius: 12, cursor: 'pointer',
                textAlign: 'center', userSelect: 'none',
                background: activo ? `rgba(0,0,0,0.06)` : 'var(--fondo-card)',
                border: `2px solid ${activo ? color : 'var(--borde)'}`,
                transition: 'border 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
                {resumen[nivel]}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
                {NIVEL_CONFIG[nivel].label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Control de Perecederos ────────────────────────────────────────── */}
      {perecederos.length > 0 && (
        <div className="card mb-24">
          <div className="card-titulo">⏱️ Control de Perecederos</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {perecederos.map(ing => {
              const dias = diasVencimiento(ing);
              const color = dias === null ? 'var(--borde)' : dias <= 0 ? 'var(--rojo)' : dias <= 1 ? 'var(--amarillo)' : 'var(--verde)';
              return (
                <div key={ing.id} style={{
                  background: 'var(--fondo)', border: `1px solid ${color}`,
                  borderRadius: 8, padding: '10px 16px', minWidth: 180,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{ing.nombre}</div>
                  <div style={{ fontSize: 13, color: 'var(--texto-suave)' }}>Stock: {formatStock(ing)}</div>
                  {ing.fecha_preparacion && dias !== null ? (
                    <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 4 }}>
                      {dias <= 0 ? '❌ Vencido' : `✅ Vence en ${dias}d`}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 4 }}>Sin preparación</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Últimas preparaciones batch ───────────────────────────────────── */}
      {preparaciones.length > 0 && (
        <div className="card mb-24">
          <div className="card-titulo">📋 Últimas preparaciones batch</div>
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Preparación</th><th>Fecha</th><th>Vencimiento</th><th>Cant.</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {preparaciones.slice(0, 8).map(p => {
                  const vence = new Date(p.fecha_vencimiento);
                  const diasR = Math.ceil((vence - new Date()) / 86400000);
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.tipo_nombre}</strong></td>
                      <td className="texto-suave">{new Date(p.fecha_preparacion).toLocaleString('es-CO')}</td>
                      <td className="texto-suave">{vence.toLocaleDateString('es-CO')}</td>
                      <td>{p.cantidad}</td>
                      <td>
                        {diasR <= 0
                          ? <span className="badge badge-rojo">Vencido</span>
                          : diasR <= 1
                          ? <span className="badge badge-amarillo">{diasR}d</span>
                          : <span className="badge badge-verde">{diasR}d</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="card mb-16">
        {/* Tabs de nivel de riesgo */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { id: 'todos',    label: `Todos (${ingredientes.length})` },
            { id: 'sinStock', label: `⚫ Sin stock (${resumen.sinStock})` },
            { id: 'urgente',  label: `🔴 Urgente (${resumen.urgente})` },
            { id: 'riesgo',   label: `🟡 Riesgo (${resumen.riesgo})` },
            { id: 'ok',       label: `🟢 OK (${resumen.ok})` },
          ].map(t => (
            <button
              key={t.id}
              className={`pos-tab ${filtroNivel === t.id ? 'activo' : ''}`}
              onClick={() => setFiltroNivel(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Buscador + selector de categoría */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 Buscar ingrediente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1, maxWidth: 320 }}
          />
          <select
            value={catActiva}
            onChange={e => setCatActiva(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="todas">— Todas las categorías —</option>
            {categorias.map(c => (
              <option key={c} value={c}>{CATEGORIAS_LABEL[c] || c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Secciones por nivel ───────────────────────────────────────────── */}
      {ingsFiltrados.length === 0 ? (
        <div className="vacio">No se encontraron ingredientes con los filtros actuales</div>
      ) : (
        <>
          {porNivel.sinStock.length > 0 && (
            <SeccionNivel
              nivel="sinStock"
              ings={porNivel.sinStock}
              provMap={provMap}
              onComprar={setModalCompra}
              onBaja={setModalBaja}
              onEditar={setModalStock}
              colapsable={false}
            />
          )}
          {porNivel.urgente.length > 0 && (
            <SeccionNivel
              nivel="urgente"
              ings={porNivel.urgente}
              provMap={provMap}
              onComprar={setModalCompra}
              onBaja={setModalBaja}
              onEditar={setModalStock}
              colapsable={false}
            />
          )}
          {porNivel.riesgo.length > 0 && (
            <SeccionNivel
              nivel="riesgo"
              ings={porNivel.riesgo}
              provMap={provMap}
              onComprar={setModalCompra}
              onBaja={setModalBaja}
              onEditar={setModalStock}
              colapsable={false}
            />
          )}
          {/* Sección OK colapsada por defecto */}
          {porNivel.ok.length > 0 && (
            <SeccionNivel
              nivel="ok"
              ings={porNivel.ok}
              provMap={provMap}
              onComprar={setModalCompra}
              onBaja={setModalBaja}
              onEditar={setModalStock}
              colapsable={true}
              colapsadoInicial={true}
            />
          )}
        </>
      )}

      {/* ── Historial de bajas ────────────────────────────────────────────── */}
      <div className="card mb-24" style={{ marginTop: 24 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setVerBajas(v => !v)}
        >
          <div className="card-titulo" style={{ marginBottom: 0 }}>
            📉 Bajas recientes ({bajas.length})
          </div>
          <span style={{ color: 'var(--texto-suave)' }}>{verBajas ? '▲' : '▼'}</span>
        </div>
        {verBajas && (
          bajas.length === 0 ? (
            <div className="vacio" style={{ marginTop: 12 }}>Sin bajas registradas</div>
          ) : (
            <div className="tabla-wrapper" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Ingrediente</th><th>Cantidad</th>
                    <th>Motivo</th><th>Empleado</th><th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {bajas.map(b => (
                    <tr key={b.id}>
                      <td className="texto-suave">{(b.fecha || '').split(' ')[0]}</td>
                      <td className="negrita">{b.ingrediente_nombre}</td>
                      <td>{b.cantidad}</td>
                      <td><span className="badge badge-rojo">{b.motivo}</span></td>
                      <td className="texto-suave">{b.empleado || '—'}</td>
                      <td className="texto-suave">{b.notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Modales ───────────────────────────────────────────────────────── */}

      {modalStock && (
        <ModalEditarStock
          ingrediente={modalStock}
          onCerrar={() => setModalStock(null)}
          onGuardar={async (id, cantidad) => {
            await window.electronAPI.updateStock(id, cantidad);
            notificar(`📦 Stock de "${modalStock.nombre}" actualizado`, 'exito');
            setModalStock(null);
            cargar();
          }}
        />
      )}

      {modalBaja && (
        <ModalBaja
          ingredientes={ingredientes}
          empleado={empleado}
          ingredienteInicial={modalBaja !== true ? modalBaja : null}
          onCerrar={() => setModalBaja(null)}
          onGuardar={async (datos) => {
            await window.electronAPI.registrarBaja(datos);
            notificar(`📉 Baja de "${datos.ingrediente_nombre}" registrada`, 'info');
            setModalBaja(null);
            cargar();
          }}
        />
      )}

      {modalCompra && (
        <ModalCompraRapida
          ingrediente={modalCompra}
          empleado={empleado}
          onCerrar={() => setModalCompra(null)}
          onGuardar={async (datos) => {
            await window.electronAPI.registrarCompra({ ...datos, empleado: empleado || '' });
            notificar(`✅ Compra de "${modalCompra.nombre}" registrada`, 'exito');
            setModalCompra(null);
            cargar();
          }}
        />
      )}

      {modalBatch && (
        <ModalBatch
          tipos={batchTipos}
          empleado={empleado}
          onCerrar={() => setModalBatch(false)}
          onGuardar={async (datos) => {
            try {
              const r = await window.electronAPI.crearPreparacion(datos);
              if (!r?.ok) throw new Error(r?.error || 'Error desconocido');
              notificar(`✅ Preparación "${datos.nombre}" registrada`, 'exito');
              setModalBatch(false);
              cargar();
            } catch (err) {
              notificar(`❌ Error al registrar preparación: ${err.message}`, 'error');
              throw err;
            }
          }}
        />
      )}
    </div>
  );
}

// ── Sección agrupada por nivel de riesgo ──────────────────────────────────────

function SeccionNivel({ nivel, ings, provMap, onComprar, onBaja, onEditar, colapsable, colapsadoInicial = false }) {
  const [colapsado, setColapsado] = useState(colapsadoInicial);
  const cfg = NIVEL_CONFIG[nivel];

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Cabecera de sección */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px',
          borderRadius: colapsado ? 10 : '10px 10px 0 0',
          background: cfg.bg,
          border: `1px solid ${cfg.borde}`,
          cursor: colapsable ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={colapsable ? () => setColapsado(v => !v) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{cfg.label}</span>
          <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
            {ings.length} ingrediente{ings.length !== 1 ? 's' : ''}
          </span>
        </div>
        {colapsable && (
          <span style={{ color: 'var(--texto-suave)', fontSize: 16 }}>
            {colapsado ? '▼ Expandir' : '▲ Colapsar'}
          </span>
        )}
      </div>

      {/* Grid de tarjetas */}
      {!colapsado && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: 12,
          padding: '12px 0',
        }}>
          {ings.map(ing => (
            <TarjetaIngrediente
              key={ing.id}
              ing={ing}
              nivel={nivel}
              provs={provMap[ing.id] || []}
              onComprar={onComprar}
              onBaja={onBaja}
              onEditar={onEditar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta individual de ingrediente ─────────────────────────────────────────

function TarjetaIngrediente({ ing, nivel, provs, onComprar, onBaja, onEditar }) {
  const cfg = NIVEL_CONFIG[nivel];

  // Porcentaje para la barra: relativo a stock_minimo×2 (o stock_actual si no hay mínimo)
  const maximo = ing.stock_minimo > 0 ? ing.stock_minimo * 2 : Math.max(ing.stock_actual, 1);
  const pct    = Math.min(100, (ing.stock_actual / maximo) * 100);

  // Unidades que faltan para llegar al mínimo (solo en nivel urgente)
  const unidadesFaltan = nivel === 'urgente' && ing.stock_minimo > 0
    ? (ing.stock_minimo - ing.stock_actual).toFixed(1)
    : null;

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.borde}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Nombre + badge de nivel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ing.nombre}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
            {CATEGORIAS_LABEL[ing.categoria] || ing.categoria}
          </div>
        </div>
        <span
          className={`badge ${cfg.badgeClass}${nivel === 'sinStock' ? ' badge-parpadeo' : ''}`}
          style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}
        >
          {cfg.badgeText}
        </span>
      </div>

      {/* Stock actual en grande */}
      <div style={{ lineHeight: 1 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: cfg.colorTexto }}>
          {ing.stock_actual}
        </span>
        <span style={{ fontSize: 13, color: 'var(--texto-suave)', marginLeft: 5 }}>
          {ing.unidad}
        </span>
      </div>

      {/* Barra de progreso horizontal */}
      {ing.stock_minimo > 0 ? (
        <div>
          <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: cfg.barColor,
              borderRadius: 4,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
            <span>Stock: {ing.stock_actual} {ing.unidad}</span>
            <span>Mín: {ing.stock_minimo} {ing.unidad}</span>
          </div>
          {unidadesFaltan && (
            <div style={{ fontSize: 12, color: cfg.colorTexto, fontWeight: 700, marginTop: 3 }}>
              Faltan {unidadesFaltan} {ing.unidad} para el mínimo
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>Sin mínimo definido</div>
      )}

      {/* Proveedor con enlace a WhatsApp */}
      {provs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {provs.slice(0, 2).map(p => (
            <a
              key={p.id}
              href={waUrl(p.telefono, `Hola ${p.contacto_nombre || p.nombre}, necesito: ${ing.nombre} — ${ing.stock_minimo || '?'} ${ing.unidad}`)}
              target="_blank"
              rel="noreferrer"
              title={`Pedir a ${p.nombre}`}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 10,
                background: 'rgba(37,211,102,0.10)',
                border: '1px solid rgba(37,211,102,0.30)',
                color: '#25d366', textDecoration: 'none', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              📲 {p.nombre}
            </a>
          ))}
        </div>
      )}

      {/* Acciones: Comprar / Baja / Editar */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          className="btn btn-exito"
          style={{ flex: 1, padding: '5px 6px', fontSize: 12 }}
          onClick={() => onComprar(ing)}
        >
          🛒 Comprar
        </button>
        <button
          className="btn btn-peligro"
          style={{ flex: 1, padding: '5px 6px', fontSize: 12 }}
          onClick={() => onBaja(ing)}
        >
          📉 Baja
        </button>
        <button
          className="btn btn-secundario"
          style={{ padding: '5px 10px', fontSize: 13 }}
          onClick={() => onEditar(ing)}
          title="Editar stock manualmente"
        >
          ✏️
        </button>
      </div>
    </div>
  );
}

// ── Modal: compra rápida desde inventario ─────────────────────────────────────

function ModalCompraRapida({ ingrediente, empleado, onCerrar, onGuardar }) {
  const [cantidad,  setCantidad]  = useState('');
  const [precio,    setPrecio]    = useState('');
  const [proveedor, setProveedor] = useState('');
  const [metodo,    setMetodo]    = useState('efectivo');
  const [guardando, setGuardando] = useState(false);

  const cantidadN = parseFloat(cantidad) || 0;
  const precioN   = Math.round(parseFloat(precio) || 0);

  const guardar = async () => {
    if (!cantidadN || guardando) return;
    setGuardando(true);
    await onGuardar({
      ingrediente_id:    ingrediente.id,
      ingrediente_nombre: ingrediente.nombre,
      cantidad:          cantidadN,
      precio_pagado:     precioN,
      proveedor,
      metodo_pago:       metodo,
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
            <label className="form-label">Cantidad ({ingrediente.unidad})</label>
            <input
              type="text" inputMode="decimal"
              value={cantidad}
              onChange={e => setCantidad(e.target.value.replace(',', '.'))}
              autoFocus
            />
          </div>
          <div className="form-grupo">
            <label className="form-label">Precio pagado total ($)</label>
            <input
              type="text" inputMode="decimal"
              value={precio}
              onChange={e => setPrecio(e.target.value.replace(',', '.'))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Método de pago</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="nequi">📱 Nequi</option>
                <option value="transferencia">🏦 Transferencia</option>
              </select>
            </div>
            <div className="form-grupo" style={{ marginBottom: 0 }}>
              <label className="form-label">Proveedor / tienda</label>
              <input
                type="text" value={proveedor}
                onChange={e => setProveedor(e.target.value)}
                placeholder="Opcional..."
              />
            </div>
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
          <button
            className="btn btn-primario"
            disabled={!cantidadN || guardando}
            onClick={guardar}
          >
            {guardando ? '⏳ Guardando...' : '✅ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: editar stock manualmente ──────────────────────────────────────────

function ModalEditarStock({ ingrediente, onCerrar, onGuardar }) {
  const [cantidad, setCantidad] = useState(ingrediente.stock_actual);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-titulo">✏️ Editar Stock — {ingrediente.nombre}</div>
        <div className="form-grupo">
          <label className="form-label">Stock actual ({ingrediente.unidad})</label>
          <input
            type="number" min="0" step="any"
            value={cantidad}
            onChange={e => setCantidad(parseFloat(e.target.value) || 0)}
            autoFocus
          />
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => onGuardar(ingrediente.id, cantidad)}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: registrar baja ─────────────────────────────────────────────────────

function ModalBaja({ ingredientes, empleado, ingredienteInicial, onCerrar, onGuardar }) {
  const [ingId,     setIngId]     = useState(ingredienteInicial?.id || ingredientes[0]?.id || '');
  const [cantidad,  setCantidad]  = useState('');
  const [motivo,    setMotivo]    = useState('vencimiento');
  const [notas,     setNotas]     = useState('');
  const [guardando, setGuardando] = useState(false);

  const ingSel = ingredientes.find(i => i.id === parseInt(ingId));

  const guardar = async () => {
    if (!ingId || !cantidad) return;
    setGuardando(true);
    await onGuardar({
      ingrediente_id:    parseInt(ingId),
      ingrediente_nombre: ingSel?.nombre || '',
      cantidad:          parseFloat(cantidad),
      motivo,
      empleado:          empleado || '',
      notas:             notas.trim(),
    });
    setGuardando(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 460 }}>
        <div className="modal-titulo">📉 Registrar Baja de Inventario</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-grupo">
            <label className="form-label">Ingrediente</label>
            <select value={ingId} onChange={e => setIngId(e.target.value)}>
              {ingredientes.map(i => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </div>
          {ingSel && (
            <div className="alerta azul" style={{ fontSize: 13 }}>
              Stock actual: <strong>{ingSel.stock_actual} {ingSel.unidad}</strong>
            </div>
          )}
          <div className="form-grupo">
            <label className="form-label">Cantidad a dar de baja ({ingSel?.unidad || ''})</label>
            <input
              type="number" min="0.01" step="any"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="form-grupo">
            <label className="form-label">Motivo</label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}>
              {MOTIVOS_BAJA.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="form-grupo">
            <label className="form-label">Notas (opcional)</label>
            <input
              type="text" value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Detalles adicionales..."
            />
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button
            className="btn btn-primario"
            disabled={guardando || !ingId || !cantidad}
            onClick={guardar}
          >
            {guardando ? '⏳ Guardando...' : '📉 Registrar baja'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: preparación batch ──────────────────────────────────────────────────

function ModalBatch({ tipos, empleado, onCerrar, onGuardar }) {
  const [tipoId,    setTipoId]    = useState(tipos[0]?.id || '');
  const [cantidad,  setCantidad]  = useState(1);
  const [guardando, setGuardando] = useState(false);

  const tipoSel = tipos.find(t => t.id === parseInt(tipoId));

  const guardar = async () => {
    if (!tipoId) return;
    setGuardando(true);
    try {
      await onGuardar({ batchTipoId: parseInt(tipoId), cantidad, nombre: tipoSel?.nombre, empleado: empleado || '' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ minWidth: 500 }}>
        <div className="modal-titulo">🍳 Registrar Preparación Batch</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-grupo">
            <label className="form-label">Tipo de preparación</label>
            <select value={tipoId} onChange={e => setTipoId(e.target.value)}>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          {tipoSel && (
            <div className="alerta azul">
              <strong>{tipoSel.nombre}</strong> — {tipoSel.descripcion}
              <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                Vence en {tipoSel.duracion_dias} días
              </span>
            </div>
          )}
          {tipoSel?.receta?.length > 0 && (
            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Ingredientes que se descuentan:</div>
              {tipoSel.receta.map(r => (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid var(--borde)', fontSize: 14,
                }}>
                  <span>{r.ingrediente_nombre}</span>
                  <span className="texto-suave">{r.cantidad * cantidad} {r.unidad}</span>
                </div>
              ))}
            </div>
          )}
          <div className="form-grupo">
            <label className="form-label">Cantidad de tarros / porciones</label>
            <input
              type="number" min="1" max="10"
              value={cantidad}
              onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
        </div>
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando || !tipoId} onClick={guardar}>
            {guardando ? '⏳ Guardando...' : '✅ Registrar preparación'}
          </button>
        </div>
      </div>
    </div>
  );
}

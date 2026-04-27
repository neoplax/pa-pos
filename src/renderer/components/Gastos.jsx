import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';

const CATEGORIAS = [
  { value: 'insumos',   label: '🛒 Insumos / Compras' },
  { value: 'servicios', label: '🔌 Servicios (agua, luz...)' },
  { value: 'personal',  label: '👤 Personal' },
  { value: 'arriendo',  label: '🏠 Arriendo' },
  { value: 'otro',      label: '📦 Otro' },
];

const CAT_LABEL = Object.fromEntries(CATEGORIAS.map(c => [c.value, c.label]));

export default function Gastos() {
  const { empleado, notificar } = useApp();
  const [gastos, setGastos]         = useState([]);
  const [cargando, setCargando]     = useState(true);
  const [guardando, setGuardando]   = useState(false);
  const [diasRango, setDiasRango]   = useState(30);
  const [modalEdit, setModalEdit]   = useState(null);

  // Formulario nuevo gasto
  const [desc, setDesc]       = useState('');
  const [monto, setMonto]     = useState('');
  const [cat, setCat]         = useState('insumos');
  const [metodo, setMetodo]   = useState('efectivo');
  const [notasF, setNotasF]   = useState('');

  const hoy = new Date().toISOString().split('T')[0];
  const fechaInicio = (() => {
    const d = new Date();
    d.setDate(d.getDate() - diasRango);
    return d.toISOString().split('T')[0];
  })();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await window.electronAPI.getGastos({ fechaInicio, fechaFin: hoy });
      setGastos(data || []);
    } catch (err) {
      console.error('[Gastos]', err);
    } finally {
      setCargando(false);
    }
  }, [fechaInicio, hoy]);

  useEffect(() => { cargar(); }, [cargar]);

  const registrar = async (e) => {
    e.preventDefault();
    if (!desc.trim() || !monto) return;
    setGuardando(true);
    try {
      await window.electronAPI.registrarGasto({
        descripcion: desc.trim(),
        monto: Math.round(parseFloat(monto)),
        categoria: cat,
        metodo_pago: metodo,
        empleado: empleado || '',
        notas: notasF.trim(),
      });
      notificar('✅ Gasto registrado', 'exito');
      setDesc(''); setMonto(''); setNotasF('');
      cargar();
    } catch (err) {
      notificar('❌ Error al registrar gasto', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    await window.electronAPI.eliminarGasto(id);
    notificar('🗑️ Gasto eliminado', 'info');
    cargar();
  };

  // Totales por categoría
  const totalGeneral = gastos.reduce((s, g) => s + (g.monto || 0), 0);
  const porCategoria = {};
  for (const g of gastos) {
    porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.monto;
  }

  return (
    <div>
      <div className="pagina-titulo">💸 Gastos</div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Formulario nuevo gasto */}
        <div className="card">
          <div className="card-titulo">➕ Registrar gasto</div>
          <form onSubmit={registrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grupo">
              <label className="form-label">Descripción *</label>
              <input
                type="text"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej: Gas natural, domicilio insumos..."
                required
              />
            </div>
            <div className="form-grupo">
              <label className="form-label">Monto ($) *</label>
              <input
                type="number"
                min="0"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="form-grupo">
              <label className="form-label">Categoría</label>
              <select value={cat} onChange={e => setCat(e.target.value)}>
                {CATEGORIAS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-grupo">
              <label className="form-label">Método de pago</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="nequi">📱 Nequi</option>
                <option value="transferencia">🏦 Transferencia</option>
              </select>
            </div>
            <div className="form-grupo">
              <label className="form-label">Notas (opcional)</label>
              <input
                type="text"
                value={notasF}
                onChange={e => setNotasF(e.target.value)}
                placeholder="Detalles adicionales..."
              />
            </div>
            <button type="submit" className="btn btn-primario" disabled={guardando}>
              {guardando ? '⏳ Guardando...' : '💾 Registrar gasto'}
            </button>
          </form>
        </div>

        {/* Resumen por categoría */}
        <div className="card">
          <div className="card-titulo">📊 Resumen del período</div>
          <div style={{ marginBottom: 12 }}>
            <div className="form-grupo">
              <label className="form-label">Período</label>
              <select value={diasRango} onChange={e => setDiasRango(parseInt(e.target.value))}>
                <option value={7}>Última semana</option>
                <option value={15}>Últimos 15 días</option>
                <option value={30}>Últimos 30 días</option>
                <option value={90}>Últimos 3 meses</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATEGORIAS.filter(c => porCategoria[c.value] > 0).map(c => (
              <div key={c.value} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--fondo)', border: '1px solid var(--borde)',
              }}>
                <span>{c.label}</span>
                <span className="texto-rojo negrita">
                  ${(porCategoria[c.value] || 0).toLocaleString('es-CO')}
                </span>
              </div>
            ))}
            {Object.keys(porCategoria).length === 0 && (
              <div className="vacio">Sin gastos en este período</div>
            )}
          </div>

          {totalGeneral > 0 && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)',
              display: 'flex', justifyContent: 'space-between', fontWeight: 700,
            }}>
              <span>TOTAL GASTOS</span>
              <span className="texto-rojo">${totalGeneral.toLocaleString('es-CO')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-titulo" style={{ marginBottom: 0 }}>
            📋 Historial de gastos ({gastos.length})
          </div>
          <button className="btn btn-secundario" onClick={cargar}>🔄 Actualizar</button>
        </div>
        {cargando ? (
          <div className="cargando">⏳ Cargando...</div>
        ) : gastos.length === 0 ? (
          <div className="vacio">Sin gastos registrados en este período</div>
        ) : (
          <div className="tabla-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Método</th>
                  <th>Monto</th>
                  <th>Empleado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gastos.map(g => (
                  <tr key={`${g.tipo || 'gasto'}-${g.id}`}>
                    <td className="texto-suave">{(g.fecha || '').split(' ')[0]}</td>
                    <td className="negrita">{g.descripcion}</td>
                    <td>
                      <span className="badge badge-azul">
                        {(CAT_LABEL[g.categoria] || g.categoria || '').replace(/^[^\s]+\s/, '')}
                      </span>
                    </td>
                    <td className="texto-suave">{g.metodo_pago || 'efectivo'}</td>
                    <td className="texto-rojo negrita">${(g.monto || 0).toLocaleString('es-CO')}</td>
                    <td className="texto-suave">{g.empleado || '—'}</td>
                    <td>
                      {g.tipo !== 'insumo' && (
                        <button
                          onClick={() => eliminar(g.id)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--rojo)',
                            cursor: 'pointer', fontSize: 14,
                          }}
                          title="Eliminar gasto"
                        >
                          🗑️
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
            notificar('✅ Gasto actualizado', 'exito');
            setModalEdit(null);
            cargar();
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
        <div className="modal-titulo">✏️ Editar Gasto</div>
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
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
          <button
            className="btn btn-primario"
            onClick={() => onGuardar(gasto.id, {
              descripcion: desc,
              monto: Math.round(parseFloat(monto) || 0),
              categoria: cat,
              metodo_pago: metodo,
              notas,
            })}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

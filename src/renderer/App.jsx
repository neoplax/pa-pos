import React, { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Inventario from './components/Inventario';
import CierreCaja from './components/CierreCaja';
import GastosCompras from './components/GastosCompras';
import Reportes from './components/Reportes';
import Configuracion from './components/Configuracion';
import Rentabilidad from './components/Rentabilidad';

// Módulos accesibles por todos los roles
const PAGINAS = {
  dashboard:     Dashboard,
  pos:           POS,
  inventario:    Inventario,
  cierreCaja:    CierreCaja,
  gastosCompras: GastosCompras,
  reportes:      Reportes,
  rentabilidad:  Rentabilidad,
  configuracion: Configuracion,
};

// Páginas que solo puede ver el administrador
const SOLO_ADMIN = new Set(['cierreCaja', 'gastosCompras', 'rentabilidad', 'configuracion']);

export default function App() {
  const { paginaActiva, notificaciones, empleado, esAdmin, setPaginaActiva } = useApp();

  // Estado del modal de base de caja
  const [baseVerificada,    setBaseVerificada]    = useState(false);
  const [mostrarModalBase,  setMostrarModalBase]  = useState(false);
  const [efectivoBase,      setEfectivoBase]      = useState('');
  const [nequiBase,         setNequiBase]         = useState('');
  const [guardandoBase,     setGuardandoBase]     = useState(false);

  const hoy = new Date().toISOString().split('T')[0];

  // Al iniciar sesión como admin, verificar si ya hay base de caja registrada hoy
  useEffect(() => {
    if (!empleado || !esAdmin || baseVerificada) return;
    window.electronAPI.getBaseCaja(hoy).then(base => {
      if (base) {
        setBaseVerificada(true);
      } else {
        setMostrarModalBase(true);
      }
    }).catch(() => setBaseVerificada(true));
  }, [empleado, esAdmin, hoy, baseVerificada]);

  const confirmarBase = async () => {
    if (guardandoBase) return;
    const ef = Math.round(parseFloat(efectivoBase) || 0);
    const nq = Math.round(parseFloat(nequiBase)    || 0);
    setGuardandoBase(true);
    try {
      await window.electronAPI.registrarBaseCaja({
        fecha: hoy,
        empleado,
        efectivo_base: ef,
        nequi_base:    nq,
      });
      setMostrarModalBase(false);
      setBaseVerificada(true);
    } catch (err) {
      console.error('[BaseCaja] Error al registrar:', err);
    } finally {
      setGuardandoBase(false);
    }
  };

  if (!empleado) return <Login />;

  // Si un empleado intenta acceder a una página restringida, redirigir al dashboard
  const paginaFinal = (!esAdmin && SOLO_ADMIN.has(paginaActiva))
    ? 'dashboard'
    : paginaActiva;

  const Pagina = PAGINAS[paginaFinal] || Dashboard;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-contenido">
        <Pagina />
      </main>

      {/* Indicador de sync en esquina superior derecha */}
      {esAdmin && <IndicadorSync />}

      {/* Notificaciones flotantes */}
      <div className="notificaciones-contenedor">
        {notificaciones.map(n => (
          <div key={n.id} className={`notificacion notificacion-${n.tipo}`}>
            {n.mensaje}
          </div>
        ))}
      </div>

      {/* Modal obligatorio de base de caja — solo admin, solo si no hay base hoy */}
      {mostrarModalBase && (
        <ModalBaseCaja
          hoy={hoy}
          efectivoBase={efectivoBase}
          nequiBase={nequiBase}
          onEfectivoChange={setEfectivoBase}
          onNequiChange={setNequiBase}
          onConfirmar={confirmarBase}
          guardando={guardandoBase}
        />
      )}
    </div>
  );
}

// ── Modal de base de caja al inicio del turno ────────────────────────────────
function ModalBaseCaja({ hoy, efectivoBase, nequiBase, onEfectivoChange, onNequiChange, onConfirmar, guardando }) {
  const fechaLegible = new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--fondo-card)',
        border: '2px solid var(--naranja)',
        borderRadius: 20,
        padding: 36,
        width: '100%', maxWidth: 420,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💵</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--naranja)' }}>
            Base de Caja
          </div>
          <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 4, textTransform: 'capitalize' }}>
            {fechaLegible}
          </div>
        </div>

        {/* Campos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div className="form-grupo">
            <label className="form-label">💵 Efectivo en caja al inicio ($)</label>
            <input
              type="number"
              min="0"
              value={efectivoBase}
              onChange={e => onEfectivoChange(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="form-grupo">
            <label className="form-label">📱 Saldo Nequi disponible ($)</label>
            <input
              type="number"
              min="0"
              value={nequiBase}
              onChange={e => onNequiChange(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 20, textAlign: 'center' }}>
          Este registro es obligatorio para el cuadre del día.
          <br/>Puedes corregirlo desde Configuración → Base de Caja.
        </div>

        <button
          className="btn btn-primario btn-grande"
          style={{ width: '100%' }}
          onClick={onConfirmar}
          disabled={guardando}
        >
          {guardando ? '⏳ Guardando...' : '✅ Confirmar e iniciar'}
        </button>
      </div>
    </div>
  );
}

// ── Indicador de sync — ícono flotante en esquina superior derecha ────────────
function IndicadorSync() {
  const { syncEstado, notificar } = useApp();
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [ejecutando, setEjecutando]     = useState(false);

  const { estado, ultimaSync, cuentaEmail, errorMsg, configurado } = syncEstado;

  // Color e ícono según estado
  const COLORES = {
    sincronizado:   { bg: '#1a3a1a', borde: '#2d7a2d', texto: '#4caf50', icono: '●' },
    pendiente:      { bg: '#3a3a1a', borde: '#7a7a2d', texto: '#ffeb3b', icono: '●' },
    error:          { bg: '#3a1a1a', borde: '#7a2d2d', texto: '#f44336', icono: '●' },
    sincronizando:  { bg: '#1a2a3a', borde: '#2d5a7a', texto: '#2196f3', icono: '↻' },
    sin_configurar: { bg: '#2a2a2a', borde: '#444',    texto: '#888',    icono: '●' },
  };
  const estilo = COLORES[estado] || COLORES.sin_configurar;

  const etiquetas = {
    sincronizado:   'Sincronizado',
    pendiente:      'Pendiente',
    error:          'Error sync',
    sincronizando:  'Sincronizando...',
    sin_configurar: 'Sin configurar',
  };

  function formatearUltimaSync() {
    if (!ultimaSync) return 'Nunca';
    const diff = Math.round((Date.now() - new Date(ultimaSync).getTime()) / 60_000);
    if (diff < 1)    return 'Hace un momento';
    if (diff < 60)   return `Hace ${diff} min`;
    if (diff < 1440) return `Hace ${Math.round(diff / 60)} h`;
    return new Date(ultimaSync).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function sincronizarAhora() {
    if (ejecutando) return;
    setEjecutando(true);
    try {
      const res = await window.electronAPI.sync_sincronizarAhora();
      if (res.requiereReinicio) {
        notificar('Datos descargados. Reiniciando app...', 'info');
        setTimeout(() => window.electronAPI.reiniciarApp(), 2500);
      } else if (res.ok) {
        const msg = res.accion === 'sin_cambios' ? '✅ Ya estaba sincronizado'
                  : res.accion === 'subida'      ? '✅ Datos subidos a Drive'
                  : res.accion === 'descarga'    ? '✅ Datos descargados de Drive'
                  : res.accion === 'conflicto_resuelto' ? `⚠️ ${res.msg}` : '✅ Sincronizado';
        notificar(msg, 'exito');
      } else {
        notificar(`❌ ${res.msg}`, 'error');
      }
    } catch (err) {
      notificar('❌ Error al sincronizar', 'error');
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <>
      {/* Botón indicador */}
      <button
        onClick={() => setPanelAbierto(v => !v)}
        title={`Sync Drive — ${etiquetas[estado]}`}
        style={{
          position: 'fixed', top: 12, right: 16, zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 20,
          background: estilo.bg, border: `1px solid ${estilo.borde}`,
          color: estilo.texto, cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          transition: 'all 0.2s',
        }}
      >
        <span
          style={{
            fontSize: 14,
            display: 'inline-block',
            animation: estado === 'sincronizando' ? 'girarSync 1s linear infinite' : 'none',
          }}
        >
          {estilo.icono}
        </span>
        <span>{etiquetas[estado]}</span>
      </button>

      {/* Panel desplegable */}
      {panelAbierto && (
        <div
          style={{
            position: 'fixed', top: 44, right: 16, zIndex: 999,
            background: 'var(--tarjeta)', border: '1px solid var(--borde)',
            borderRadius: 10, padding: 16, width: 260,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
            ☁️ Google Drive Sync
          </div>

          {configurado ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                {cuentaEmail || 'Cuenta conectada'}
              </div>
              <div style={{ fontSize: 12, marginBottom: 10 }}>
                <span style={{ color: 'var(--texto-suave)' }}>Última sync: </span>
                <span style={{ fontWeight: 600 }}>{formatearUltimaSync()}</span>
              </div>
              {errorMsg && (
                <div style={{
                  fontSize: 11, color: '#f44336', background: 'rgba(244,67,54,0.1)',
                  borderRadius: 6, padding: '4px 8px', marginBottom: 10,
                }}>
                  {errorMsg}
                </div>
              )}
              <button
                className="btn btn-primario"
                style={{ width: '100%', padding: '8px 0', fontSize: 13 }}
                onClick={sincronizarAhora}
                disabled={ejecutando || estado === 'sincronizando'}
              >
                {ejecutando ? '🔄 Sincronizando...' : '🔄 Sincronizar ahora'}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 10 }}>
              Ve a <strong>Configuración → Sincronización</strong> para conectar Google Drive.
            </div>
          )}

          <button
            style={{
              marginTop: 8, background: 'none', border: 'none',
              color: 'var(--texto-suave)', fontSize: 11, cursor: 'pointer', width: '100%',
            }}
            onClick={() => setPanelAbierto(false)}
          >
            Cerrar
          </button>
        </div>
      )}
    </>
  );
}

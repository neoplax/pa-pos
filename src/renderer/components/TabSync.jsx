// Pestaña de Sincronización con Google Drive en Configuración
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// ── Utilidad: formatear bytes a texto legible ─────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 MB';
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ── Utilidad: formatear timestamp ─────────────────────────────────────────────
function formatearFecha(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TabSync() {
  const { syncEstado, setSyncEstado, notificar } = useApp();

  // ── Paso del wizard de configuración inicial ────────────────────────���─────
  const [paso, setPaso]             = useState(1);    // 1-4 solo si !configurado
  const [clientId, setClientId]     = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [autorizando, setAutorizando]   = useState(false);

  // ── Estado de operaciones manuales ────────────────────────────────────────
  const [ejecutando, setEjecutando] = useState(null); // null | 'sync' | 'subir' | 'bajar'
  const [intervalo, setIntervalo]   = useState(syncEstado.intervaloMinutos || 30);
  const [autoActivo, setAutoActivo] = useState(syncEstado.syncAutoActivo !== false);

  // Sincronizar controles locales cuando llega estado nuevo desde el main process
  useEffect(() => {
    setIntervalo(syncEstado.intervaloMinutos || 30);
    setAutoActivo(syncEstado.syncAutoActivo !== false);
  }, [syncEstado.intervaloMinutos, syncEstado.syncAutoActivo]);

  const { configurado, cuentaEmail, espacioUsado, espacioTotal, ultimaSync, estado, errorMsg, carpetaId } = syncEstado;

  // ── Wizard Paso 2: guardar credenciales en disco y avanzar al Paso 3 ────────
  async function guardarYContinuar() {
    const id     = clientId.trim();
    const secret = clientSecret.trim();
    if (!id || !secret) {
      notificar('Ingresa el Client ID y el Client Secret', 'error');
      return;
    }
    try {
      const res = await window.electronAPI.sync_guardarCredencialesParciales({ clientId: id, clientSecret: secret });
      if (!res.ok) {
        notificar(`No se pudieron guardar las credenciales: ${res.msg}`, 'error');
        return;
      }
      // Credenciales guardadas en disco — ahora es seguro avanzar
      setPaso(3);
    } catch (err) {
      notificar(`Error al guardar credenciales: ${err.message}`, 'error');
    }
  }

  // ── Wizard Paso 3: iniciar flujo OAuth (abre navegador, espera callback automático) ──
  async function autorizar() {
    setAutorizando(true);
    try {
      const res = await window.electronAPI.sync_iniciarOAuth();
      if (res.ok) {
        setPaso(4);
        notificar(`Google Drive conectado — ${res.email}`, 'exito');
        const nuevoEstado = await window.electronAPI.sync_getEstado();
        setSyncEstado(nuevoEstado);
      } else {
        notificar(res.msg, 'error');
        if (res.msg?.includes('credenciales') || res.msg?.includes('Paso 2')) {
          setPaso(2);
        }
      }
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setAutorizando(false);
    }
  }

  // ── Sincronización manual completa ────────────────────────────────────────
  async function sincronizarAhora() {
    setEjecutando('sync');
    try {
      const res = await window.electronAPI.sync_sincronizarAhora();
      if (res.requiereReinicio) {
        notificar('Datos descargados. Reiniciando app en 3 s...', 'info');
        setTimeout(() => window.electronAPI.reiniciarApp(), 3000);
        return;
      }
      if (res.ok) {
        const msg = res.accion === 'sin_cambios'       ? 'Ya estaba sincronizado'
                  : res.accion === 'subida'             ? 'Datos subidos a Drive'
                  : res.accion === 'descarga'           ? 'Datos descargados'
                  : res.accion === 'conflicto_resuelto' ? res.msg
                  : res.accion === 'drive_mas_reciente' ? 'Drive tiene datos nuevos — usa "Bajar datos" para aplicarlos'
                  : 'Sincronizado';
        notificar(msg, 'exito');
      } else {
        notificar(res.msg, 'error');
      }
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setEjecutando(null);
    }
  }

  async function subirAhora() {
    setEjecutando('subir');
    try {
      const res = await window.electronAPI.sync_subirAhora();
      if (res.ok) notificar('Datos subidos a Drive', 'exito');
      else        notificar(res.msg, 'error');
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setEjecutando(null);
    }
  }

  async function bajarAhora() {
    setEjecutando('bajar');
    try {
      const res = await window.electronAPI.sync_bajarAhora();
      if (res.ok && res.requiereReinicio) {
        notificar('Datos descargados. Reiniciando app en 3 s...', 'exito');
        setTimeout(() => window.electronAPI.reiniciarApp(), 3000);
      } else if (res.ok) {
        notificar('Datos descargados de Drive', 'exito');
      } else {
        notificar(res.msg, 'error');
      }
    } catch (err) {
      notificar(err.message, 'error');
    } finally {
      setEjecutando(null);
    }
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar la cuenta de Google Drive?')) return;
    await window.electronAPI.sync_desconectar();
    const nuevoEstado = await window.electronAPI.sync_getEstado();
    setSyncEstado(nuevoEstado);
    setPaso(1);
    notificar('Cuenta de Google desconectada', 'info');
  }

  async function guardarAutoSync() {
    await window.electronAPI.sync_configurarAuto({ activo: autoActivo, intervaloMinutos: parseInt(intervalo) || 30 });
    notificar('Configuración guardada', 'exito');
  }

  const hayOp = ejecutando !== null;

  // ── Render: panel principal (ya configurado) ──────────────────────────────
  if (configurado) {
    const pctEspacio = espacioTotal > 0 ? Math.round((espacioUsado / espacioTotal) * 100) : 0;

    return (
      <div style={{ maxWidth: 620 }}>
        {/* Estado de conexión */}
        <div style={{
          background: 'var(--tarjeta)', border: '1px solid var(--borde)',
          borderRadius: 10, padding: 20, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                ✅ Google Drive conectado
              </div>
              <div style={{ fontSize: 13, color: 'var(--texto-suave)' }}>{cuentaEmail}</div>
            </div>
            <button
              className="btn btn-peligro"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={desconectar}
            >
              Desconectar
            </button>
          </div>

          {/* Espacio en Drive */}
          {espacioTotal > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--texto-suave)' }}>Espacio Drive</span>
                <span>{formatBytes(espacioUsado)} / {formatBytes(espacioTotal)}</span>
              </div>
              <div style={{ background: 'var(--borde)', borderRadius: 4, height: 6 }}>
                <div style={{
                  background: pctEspacio > 80 ? '#f44336' : 'var(--naranja)',
                  width: `${Math.min(pctEspacio, 100)}%`,
                  height: '100%', borderRadius: 4, transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Última sync + estado */}
        <div style={{
          background: 'var(--tarjeta)', border: '1px solid var(--borde)',
          borderRadius: 10, padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Estado de sincronización</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--texto-suave)' }}>Última sync exitosa</span>
            <span style={{ fontWeight: 600 }}>{formatearFecha(ultimaSync)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--texto-suave)' }}>Estado actual</span>
            <span style={{
              fontWeight: 600,
              color: estado === 'sincronizado' ? '#4caf50'
                   : estado === 'error'        ? '#f44336'
                   : estado === 'sincronizando' ? '#2196f3'
                   : '#ffeb3b',
            }}>
              {estado === 'sincronizado'   ? '✅ Sincronizado'
             : estado === 'pendiente'      ? 'Pendiente'
             : estado === 'error'          ? 'Error'
             : estado === 'sincronizando'  ? 'Sincronizando...'
             : 'Sin configurar'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--texto-suave)' }}>Carpeta Drive</span>
            <span style={{ fontWeight: 600, color: carpetaId ? '#4caf50' : '#ffeb3b', fontFamily: 'monospace' }}>
              {carpetaId
                ? `Carpeta lista ✅ ···${carpetaId.slice(-8)}`
                : 'Carpeta no configurada ⚠️'}
            </span>
          </div>

          {errorMsg && (
            <div style={{
              fontSize: 12, color: '#f44336', background: 'rgba(244,67,54,0.1)',
              borderRadius: 6, padding: '6px 10px', marginBottom: 12,
            }}>
              {errorMsg}
            </div>
          )}
        </div>

        {/* Botones de sync manual */}
        <div style={{
          background: 'var(--tarjeta)', border: '1px solid var(--borde)',
          borderRadius: 10, padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Sincronización manual</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="btn btn-primario"
              style={{ padding: '10px 0', fontSize: 14 }}
              onClick={sincronizarAhora}
              disabled={hayOp}
            >
              {ejecutando === 'sync' ? 'Sincronizando...' : 'Sincronizar ahora (inteligente)'}
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secundario"
                style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                onClick={subirAhora}
                disabled={hayOp}
              >
                {ejecutando === 'subir' ? 'Subiendo...' : 'Subir mis datos'}
              </button>
              <button
                className="btn btn-secundario"
                style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                onClick={bajarAhora}
                disabled={hayOp}
              >
                {ejecutando === 'bajar' ? 'Bajando...' : 'Bajar datos de Drive'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 10 }}>
            "Bajar datos" reinicia la app para aplicar la nueva base de datos.
          </div>
        </div>

        {/* Configuración de sync automático */}
        <div style={{
          background: 'var(--tarjeta)', border: '1px solid var(--borde)',
          borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Sync automático</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoActivo}
                onChange={e => setAutoActivo(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Activar sync automático en segundo plano
            </label>
          </div>

          {autoActivo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: 'var(--texto-suave)', whiteSpace: 'nowrap' }}>
                Cada
              </span>
              <select
                value={intervalo}
                onChange={e => setIntervalo(e.target.value)}
                style={{
                  background: 'var(--fondo)', color: 'var(--texto)',
                  border: '1px solid var(--borde)', borderRadius: 6,
                  padding: '4px 8px', fontSize: 13,
                }}
              >
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <option key={m} value={m}>{m} minutos</option>
                ))}
              </select>
            </div>
          )}

          <button
            className="btn btn-primario"
            style={{ padding: '8px 20px', fontSize: 13 }}
            onClick={guardarAutoSync}
          >
            Guardar configuración
          </button>

          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 10 }}>
            El cierre de caja siempre sube automáticamente los datos, independientemente de este ajuste.
          </div>
        </div>
      </div>
    );
  }

  // ── Render: wizard de configuración inicial ───────────────────────────────
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        background: 'var(--tarjeta)', border: '1px solid var(--borde)',
        borderRadius: 10, padding: 24,
      }}>
        {/* Indicador de pasos */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: n <= paso ? 'var(--naranja)' : 'var(--borde)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Paso 1: instrucciones */}
        {paso === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
              Paso 1 — Crear proyecto en Google Cloud
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--texto-suave)', marginBottom: 16 }}>
              Para conectar Google Drive necesitas crear credenciales OAuth2 gratuitas:
            </div>
            <ol style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, marginBottom: 12 }}>
              <li>Abre <strong>Google Cloud Console</strong></li>
              <li>Crea un proyecto nuevo (ej: "PerrosAmericanosPOS")</li>
              <li>Activa la <strong>API de Google Drive</strong></li>
              <li>Ve a <strong>APIs y Servicios → Credenciales</strong></li>
              <li>Crea credenciales → <strong>ID de cliente OAuth 2.0</strong></li>
              <li>Tipo de aplicación: <strong>Aplicación web</strong></li>
              <li>
                En <strong>URIs de redirección autorizados</strong> agrega las 5 URIs:
                <div style={{ margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[8080, 8081, 8082, 8083, 8084].map(p => (
                    <code key={p} style={{
                      display: 'block', background: 'var(--fondo)',
                      padding: '3px 10px', borderRadius: 5, fontSize: 11,
                      border: '1px solid var(--borde)',
                    }}>
                      http://127.0.0.1:{p}/callback
                    </code>
                  ))}
                </div>
              </li>
              <li>Copia el <strong>Client ID</strong> y el <strong>Client Secret</strong></li>
            </ol>
            <button
              className="btn btn-secundario"
              style={{ marginBottom: 16, fontSize: 13 }}
              onClick={() => window.open('https://console.cloud.google.com', '_blank')}
            >
              Abrir Google Cloud Console ↗
            </button>
            <div>
              <button className="btn btn-primario" onClick={() => setPaso(2)}>
                Ya tengo las credenciales →
              </button>
            </div>
          </div>
        )}

        {/* Paso 2: ingresar y guardar credenciales en disco */}
        {paso === 2 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              Paso 2 — Ingresar credenciales OAuth2
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 16 }}>
              Las credenciales se guardarán en disco antes de continuar.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="123456789-abc...apps.googleusercontent.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--fondo)', color: 'var(--texto)',
                  border: '1px solid var(--borde)', borderRadius: 6,
                  padding: '8px 12px', fontSize: 13,
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                Client Secret
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--fondo)', color: 'var(--texto)',
                  border: '1px solid var(--borde)', borderRadius: 6,
                  padding: '8px 12px', fontSize: 13,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secundario" onClick={() => setPaso(1)}>← Atrás</button>
              <button
                className="btn btn-primario"
                disabled={!clientId.trim() || !clientSecret.trim()}
                onClick={guardarYContinuar}
              >
                Guardar y continuar →
              </button>
            </div>
          </div>
        )}

        {/* Paso 3: autorizar con Google (flujo automático con servidor local) */}
        {paso === 3 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
              Paso 3 — Autorizar con Google
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', lineHeight: 1.7, marginBottom: 20 }}>
              Al hacer clic se abrirá el navegador. Inicia sesión con tu cuenta de Google
              y acepta los permisos. La app recibirá la confirmación automáticamente
              y avanzará sola.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secundario"
                onClick={() => setPaso(2)}
                disabled={autorizando}
              >
                ← Atrás
              </button>
              <button
                className="btn btn-primario"
                onClick={autorizar}
                disabled={autorizando}
                style={{ flex: 1, padding: '10px 0' }}
              >
                {autorizando ? 'Esperando autorización...' : 'Autorizar con Google'}
              </button>
            </div>

            {autorizando && (
              <div style={{
                fontSize: 12, color: 'var(--texto-suave)',
                marginTop: 16, lineHeight: 1.8,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8, padding: '10px 14px',
              }}>
                El navegador se abrió. Inicia sesión con tu cuenta de Google, acepta
                los permisos y esta pantalla se actualizará automáticamente.
                Tienes hasta 5 minutos.
              </div>
            )}
          </div>
        )}

        {/* Paso 4: éxito */}
        {paso === 4 && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12, color: 'var(--verde)' }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              ¡Google Drive conectado!
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 4 }}>
              {cuentaEmail || 'Cuenta conectada'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 20 }}>
              Los datos se sincronizarán automáticamente.
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              Esta pestaña se actualizará al salir y volver.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

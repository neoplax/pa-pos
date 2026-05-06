import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';


export default function Login() {
  const { setEmpleado, setRolEmpleado } = useApp();
  const [empleados, setEmpleados]       = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [pin, setPin]                   = useState('');
  const [error, setError]               = useState('');
  const [verificando, setVerificando]   = useState(false);

  useEffect(() => {
    window.electronAPI.getEmpleados()
      .then(lista => setEmpleados(lista.filter(e => e.activo)))
      .catch(() => {});
  }, []);

  const presionarTecla = (tecla) => {
    setError('');
    if (pin.length < 6) setPin(prev => prev + tecla);
  };

  const borrar = () => { setError(''); setPin(prev => prev.slice(0, -1)); };

  const confirmar = async () => {
    if (pin.length === 0 || verificando) return;
    setVerificando(true);
    try {
      const result = await window.electronAPI.loginEmpleado({ nombre: seleccionado, pin });
      if (result.ok) {
        setEmpleado(seleccionado);
        setRolEmpleado(result.rol || 'empleado');
      } else {
        setError('PIN incorrecto. Intenta de nuevo.');
        setPin('');
      }
    } catch {
      setError('Error al verificar. Intenta de nuevo.');
      setPin('');
    } finally {
      setVerificando(false);
    }
  };

  const volver = () => { setSeleccionado(null); setPin(''); setError(''); };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--fondo)', padding: 24,
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🌭</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--naranja)', margin: 0 }}>
          Perros Americanos
        </h1>
        <p style={{ color: 'var(--texto-suave)', marginTop: 4 }}>Sistema POS</p>
      </div>

      {!seleccionado ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, marginBottom: 24, color: 'var(--texto-suave)' }}>
            ¿Quién está de turno?
          </p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {empleados.map(emp => (
              <button
                key={emp.nombre}
                onClick={() => setSeleccionado(emp.nombre)}
                style={{
                  width: 160, height: 160, borderRadius: 16,
                  border: '2px solid var(--borde)',
                  background: 'var(--fondo-card)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--naranja)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--borde)'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <span style={{ fontSize: 20, fontWeight: 700 }}>{emp.nombre}</span>
                {emp.rol === 'administrador' && (
                  <span style={{ fontSize: 11, color: 'var(--naranja)', fontWeight: 600 }}>Admin</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--fondo-card)', borderRadius: 16, padding: 32,
          border: '1px solid var(--borde)', minWidth: 320, textAlign: 'center',
        }}>
          <button onClick={volver} style={{
            background: 'none', border: 'none', color: 'var(--texto-suave)',
            cursor: 'pointer', fontSize: 13, marginBottom: 16, display: 'flex',
            alignItems: 'center', gap: 6,
          }}>
            ← Cambiar empleado
          </button>

          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
            {seleccionado}
          </div>

          {/* Indicador de PIN */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: i < pin.length ? 'var(--naranja)' : 'var(--borde)',
                transition: 'background 0.1s',
              }} />
            ))}
          </div>

          {error && (
            <div style={{
              color: 'var(--rojo)', fontSize: 13, marginBottom: 16,
              padding: '8px 12px', background: 'rgba(231,76,60,0.1)',
              borderRadius: 8,
            }}>
              {error}
            </div>
          )}

          {/* Teclado numérico 3×4 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <TeclaPin key={n} label={String(n)} onClick={() => presionarTecla(String(n))} />
            ))}
            <TeclaPin label="⌫" onClick={borrar} variant="secundario" />
            <TeclaPin label="0" onClick={() => presionarTecla('0')} />
            <TeclaPin
              label={verificando ? '...' : '✓'}
              onClick={confirmar}
              variant="primario"
              disabled={pin.length === 0 || verificando}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TeclaPin({ label, onClick, variant = 'normal', disabled = false }) {
  const bg    = variant === 'primario' ? 'var(--naranja)' : 'var(--fondo)';
  const color = variant === 'primario' ? '#fff' : 'var(--texto)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 64, borderRadius: 10, fontSize: 22, fontWeight: 700,
        border: '1px solid var(--borde)', background: bg, color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
    >
      {label}
    </button>
  );
}

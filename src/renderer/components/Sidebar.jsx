import React from 'react';
import { useApp } from '../context/AppContext';

// Todos los ítems del menú lateral
const ITEMS_NAV = [
  { id: 'dashboard',     icono: '📊', label: 'Dashboard',        soloAdmin: false },
  { id: 'pos',           icono: '🛒', label: 'Punto de Venta',   soloAdmin: false },
  { id: 'inventario',    icono: '📦', label: 'Inventario',        soloAdmin: false },
  { id: 'cierreCaja',    icono: '💰', label: 'Cierre de Caja',   soloAdmin: true  },
  { id: 'gastosCompras', icono: '$',  label: 'Gastos & Compras', soloAdmin: true  },
  { id: 'reportes',      icono: '📈', label: 'Reportes',          soloAdmin: true  },
  { id: 'rentabilidad',  icono: '📉', label: 'Rentabilidad',     soloAdmin: true  },
  { id: 'configuracion', icono: '⚙️', label: 'Configuración',    soloAdmin: true  },
];

export default function Sidebar() {
  const { paginaActiva, setPaginaActiva, empleado, esAdmin, cerrarSesion } = useApp();

  const itemsVisibles = ITEMS_NAV.filter(item => !item.soloAdmin || esAdmin);

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <h1>🌭 Perros<br/>Americanos</h1>
        <span>Sistema POS</span>
      </div>

      {/* Empleado activo */}
      <div className="sidebar-empleado" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div>👤 {empleado}</div>
          {esAdmin && (
            <div style={{ fontSize: 10, color: 'var(--naranja)', fontWeight: 600 }}>Administrador</div>
          )}
        </div>
        <button
          onClick={cerrarSesion}
          title="Cerrar sesión"
          style={{
            background: 'none', border: '1px solid var(--borde)', borderRadius: 6,
            color: 'var(--texto-suave)', cursor: 'pointer', fontSize: 11,
            padding: '2px 8px', whiteSpace: 'nowrap',
          }}
        >
          Salir
        </button>
      </div>

      {/* Navegación */}
      <div className="sidebar-nav">
        {itemsVisibles.map(item => (
          <div
            key={item.id}
            className={`nav-item ${paginaActiva === item.id ? 'activo' : ''}`}
            onClick={() => setPaginaActiva(item.id)}
          >
            <span className="nav-icono" style={item.id === 'gastosCompras' ? { fontWeight: 900, fontSize: 16 } : {}}>
              {item.icono}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Hora */}
      <HoraActual />
    </nav>
  );
}

function HoraActual() {
  const [hora, setHora] = React.useState(new Date().toLocaleTimeString('es-CO'));

  React.useEffect(() => {
    const id = setInterval(() => {
      setHora(new Date().toLocaleTimeString('es-CO'));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: '1px solid var(--borde)',
      textAlign: 'center',
      fontSize: '18px',
      fontWeight: '700',
      color: 'var(--naranja)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {hora}
      <div style={{ fontSize: '11px', color: 'var(--texto-suave)', fontWeight: 400, marginTop: 2 }}>
        {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}
      </div>
    </div>
  );
}

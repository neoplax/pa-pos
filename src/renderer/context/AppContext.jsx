import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

const ESTADO_SYNC_INICIAL = {
  configurado:      false,
  cuentaEmail:      null,
  espacioUsado:     0,
  espacioTotal:     0,
  ultimaSync:       null,
  estado:           'sin_configurar',
  errorMsg:         null,
  syncAutoActivo:   true,
  intervaloMinutos: 30,
};

export function AppProvider({ children }) {
  const [empleado, setEmpleado]             = useState(null);      // nombre del empleado
  const [rolEmpleado, setRolEmpleado]       = useState(null);      // 'administrador' | 'empleado'
  const [paginaActiva, setPaginaActiva]     = useState('dashboard');
  const [notificaciones, setNotificaciones] = useState([]);
  const [syncEstado, setSyncEstado]         = useState(ESTADO_SYNC_INICIAL);

  // Notificación temporal que desaparece en 4s
  const notificar = (mensaje, tipo = 'info') => {
    const id = Date.now();
    setNotificaciones(prev => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // Suscribirse a cambios de estado de sync enviados por el proceso principal
  useEffect(() => {
    // Cargar estado inicial
    window.electronAPI.sync_getEstado().then(setSyncEstado).catch(() => {});
    // Escuchar actualizaciones en tiempo real
    window.electronAPI.sync_onEstadoCambiado(setSyncEstado);
    return () => { window.electronAPI.sync_offEstadoCambiado(); };
  }, []);

  const esAdmin = rolEmpleado === 'administrador';

  // Al cerrar sesión limpiar también el rol
  const cerrarSesion = () => {
    setEmpleado(null);
    setRolEmpleado(null);
    setPaginaActiva('dashboard');
  };

  return (
    <AppContext.Provider value={{
      empleado, setEmpleado,
      rolEmpleado, setRolEmpleado,
      esAdmin,
      cerrarSesion,
      paginaActiva, setPaginaActiva,
      notificaciones, notificar,
      syncEstado, setSyncEstado,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}

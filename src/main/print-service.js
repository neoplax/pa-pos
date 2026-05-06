const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

// Ancho de línea para papel 80mm (48 caracteres monoespaciados)
const W = 48;

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD_INIT        = Buffer.from([ESC, 0x40]);        // Inicializar impresora
const CMD_CODEPAGE    = Buffer.from([ESC, 0x74, 0x12]);  // PC858 Latin — soporta ñ, á, é, ó, ú y caracteres especiales
const CMD_CENTER      = Buffer.from([ESC, 0x61, 0x01]);  // Centrar texto
const CMD_LEFT        = Buffer.from([ESC, 0x61, 0x00]);  // Alinear izquierda
const CMD_BOLD_ON     = Buffer.from([ESC, 0x45, 0x01]);  // Negrita activada
const CMD_BOLD_OFF    = Buffer.from([ESC, 0x45, 0x00]);  // Negrita desactivada
// 3 avances de línea antes del corte total de papel
const CMD_CORTE      = Buffer.from([LF, LF, LF, GS, 0x56, 0x00]);
const CMD_CAJON_PIN2 = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
const CMD_CAJON_PIN5 = Buffer.from([0x1B, 0x70, 0x01, 0x19, 0xFA]);

// Nombre de impresora por defecto en Windows
const DEFAULT_WIN_PRINTER = 'POS-80C';

// ── Utilidades de formato ─────────────────────────────────────────────────────
function pad(str, len)  { return String(str || '').slice(0, len).padEnd(len); }
function padR(str, len) { return String(str || '').padStart(len); }
function center(str) {
  const s  = String(str || '');
  const sp = Math.max(0, Math.floor((W - s.length) / 2));
  return ' '.repeat(sp) + s;
}
function linea(ch = '-') { return ch.repeat(W); }
function money(n)        { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }

const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatFechaRecibo(fechaStr) {
  const d   = new Date(fechaStr);
  const dia  = String(d.getDate()).padStart(2, '0');
  const mes  = MESES_ES[d.getMonth()];
  const año  = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const mm   = String(d.getMinutes()).padStart(2, '0');
  const ss   = String(d.getSeconds()).padStart(2, '0');
  return { fecha: `${dia}-${mes}-${año}`, hora: `${hh}:${mm}:${ss}` };
}

// ── Constructor de buffer ESC/POS ─────────────────────────────────────────────
// partes: Array de { texto, negrita?, centrado? }
// Usa latin1 (ISO-8859-1) — compatible con WPC1252 para á, é, ñ, ó, ú
function construirBuffer(partes) {
  const bloques = [CMD_INIT, CMD_CODEPAGE, CMD_LEFT, CMD_BOLD_OFF];
  for (const p of partes) {
    bloques.push(p.centrado ? CMD_CENTER : CMD_LEFT);
    if (p.negrita) bloques.push(CMD_BOLD_ON);
    bloques.push(Buffer.from(p.texto + '\n', 'latin1'));
    if (p.negrita) bloques.push(CMD_BOLD_OFF);
  }
  bloques.push(CMD_CORTE);
  return Buffer.concat(bloques);
}

// ── Partes del recibo de venta ────────────────────────────────────────────────
function _partesRecibo({
  factura_num, fecha, empleado, items, subtotal, domicilio, total,
  metodo_pago, monto_efectivo_mixto, monto_nequi_mixto, efectivo_recibido,
  descuento_valor = 0, descuento_nombre = '',
  mesa_nombre = '',
}) {
  const { fecha: fechaStr, hora } = formatFechaRecibo(fecha || new Date().toISOString());
  const numStr = String(factura_num || 0).padStart(4, '0');
  const p = [];

  // Encabezado empresa
  p.push({ texto: linea('=') });
  p.push({ texto: center('PERROS AMERICANOS'),   negrita: true });
  p.push({ texto: center('CC Manila L.47 Fusa')              });
  p.push({ texto: center('No Responsable ICO')               });
  p.push({ texto: center('NIT: 41714836-4')                  });
  p.push({ texto: center('Tel: 3144139985')                  });
  p.push({ texto: linea('=') });

  // Datos de la transacción
  p.push({ texto: `Fecha: ${fechaStr}  ${hora}` });
  p.push({ texto: `Factura No.: ${numStr}` });
  p.push({ texto: `Despacho: ${empleado || ''}` }); // sin tilde para compatibilidad latin1
  if (mesa_nombre && mesa_nombre !== '') {
    p.push({ texto: `Mesa: ${mesa_nombre}` });
  }
  p.push({ texto: linea('-') });
  p.push({ texto: 'CONSUMIDOR FINAL' });
  p.push({ texto: linea('-') });

  // Cabecera de columnas
  p.push({ texto: pad('CO', 4) + ' ' + pad('DESCRIPCION', 22) + ' ' + padR('CANT', 5) + ' ' + padR('VALOR', 11) });
  p.push({ texto: linea('-') });

  // Items del pedido
  let totalItems = 0;
  for (const item of (items || [])) {
    const nombre = (item.nombre || '')
      .replace('Adicion: ', 'Ad. ').replace('Adición: ', 'Ad. ')
      .replace('Combo ', 'Cmb. ');
    const col1 = pad(item.codigo || '', 4);
    const col2 = pad(nombre, 22);
    const col3 = padR(`x${item.cantidad}`, 5);
    const col4 = padR(money(item.precio_unitario * item.cantidad), 11);
    p.push({ texto: `${col1} ${col2} ${col3} ${col4}` });
    if (item.nota) p.push({ texto: `      + ${item.nota}` });
    totalItems += item.cantidad;
  }

  p.push({ texto: linea('-') });

  // Totales alineados a la derecha
  const WL = 22, WV = W - WL;
  p.push({ texto: padR('SUBTOTAL',  WL) + padR(money(subtotal || total), WV) });
  p.push({ texto: padR('DOMICILIO', WL) + padR(domicilio > 0 ? money(domicilio) : '$0', WV) });
  if (descuento_valor > 0) {
    const etiqDcto = descuento_nombre
      ? `DCTO. ${descuento_nombre}`.slice(0, WL)
      : 'DCTO.';
    p.push({ texto: padR(etiqDcto, WL) + padR(`-${money(descuento_valor)}`, WV) });
  } else {
    p.push({ texto: padR('DCTO.',   WL) + padR('$0', WV) });
  }
  p.push({ texto: linea('-') });
  p.push({ texto: padR('TOTAL', WL) + padR(money(total), WV), negrita: true });
  p.push({ texto: padR('ITEMS', WL) + padR(String(totalItems), WV) });
  p.push({ texto: linea('-') });

  // Forma de pago
  p.push({ texto: 'PAGO:' });
  if (metodo_pago === 'efectivo') {
    const recibido = efectivo_recibido || total;
    p.push({ texto: ` Efectivo recibido:${padR(money(recibido), W - 18)}` });
    const cambio = recibido - total;
    if (cambio >= 0) p.push({ texto: ` CAMBIO:           ${padR(money(cambio), W - 19)}` });
  } else if (metodo_pago === 'nequi') {
    p.push({ texto: ` Nequi:${padR(money(total), W - 7)}` });
  } else if (metodo_pago === 'mixto') {
    if (monto_efectivo_mixto > 0) p.push({ texto: ` Efectivo:${padR(money(monto_efectivo_mixto), W - 10)}` });
    if (monto_nequi_mixto > 0)   p.push({ texto: ` Nequi:   ${padR(money(monto_nequi_mixto), W - 10)}` });
  }

  p.push({ texto: linea('-') });
  p.push({ texto: center('ARMALO COMO QUIERAS,'),  negrita: true });
  p.push({ texto: center('GRACIAS POR TU COMPRA'), negrita: true });
  p.push({ texto: linea('=') });

  return p;
}

// ── Partes del cierre de caja ─────────────────────────────────────────────────
function _partesCierre({
  fecha, empleado, total_ventas, efectivo, nequi, gastos, utilidad,
  descuadre, observacion_descuadre, facturas, f_inicio, f_fin,
}) {
  const horaActual = new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const { fecha: fechaStr } = formatFechaRecibo(new Date(fecha + 'T12:00:00').toISOString());
  const p = [];

  p.push({ texto: linea('=') });
  p.push({ texto: center('PERROS AMERICANOS'), negrita: true });
  p.push({ texto: center('Cierre de Caja') });
  p.push({ texto: center(`Fecha: ${fechaStr}`) });
  p.push({ texto: center(`Empleado: ${empleado || ''}`) });
  p.push({ texto: center(`Hora cierre: ${horaActual}`) });
  p.push({ texto: linea('=') });

  const WL = 20, WV = W - WL;
  p.push({ texto: pad('Total ventas:',     WL) + padR(money(total_ventas), WV) });
  p.push({ texto: pad('Efectivo:',         WL) + padR(money(efectivo),     WV) });
  p.push({ texto: pad('Nequi:',            WL) + padR(money(nequi),        WV) });
  p.push({ texto: pad('Total gastos dia:', WL) + padR(money(gastos),       WV) });
  p.push({ texto: pad('Utilidad neta:',    WL) + padR(money(utilidad),     WV), negrita: true });
  p.push({ texto: linea('-') });

  if (facturas > 0) {
    const rango = (f_inicio && f_fin) ? ` (${f_inicio}-${f_fin})` : '';
    p.push({ texto: `Facturas: ${facturas}${rango}` });
  }
  if (Math.abs(descuadre || 0) > 0) {
    p.push({ texto: linea('-') });
    p.push({ texto: pad('Descuadre:', WL) + padR(money(Math.abs(descuadre)), WV) });
    if (observacion_descuadre) p.push({ texto: center(observacion_descuadre) });
  }
  p.push({ texto: linea('=') });

  return p;
}

// ── Partes del recibo de prueba ───────────────────────────────────────────────
function _partesPrueba() {
  const { fecha, hora } = formatFechaRecibo(new Date().toISOString());
  return [
    { texto: linea('=') },
    { texto: center('PERROS AMERICANOS'),    negrita: true },
    { texto: center('CC Manila L.47 Fusa')               },
    { texto: center('No Responsable ICO')                },
    { texto: center('NIT: 41714836-4')                   },
    { texto: center('Tel: 3144139985')                   },
    { texto: linea('=') },
    { texto: center('** RECIBO DE PRUEBA **'), negrita: true },
    { texto: center(`${fecha}  ${hora}`)                 },
    { texto: center('Impresora configurada OK')           },
    { texto: linea('=') },
  ];
}

// ── Generadores de texto plano (respaldo .txt) ────────────────────────────────
function generarTextoRecibo(datos) {
  return _partesRecibo(datos).map(p => p.texto).join('\n') + '\n';
}

function generarTextoCierre(datos) {
  return _partesCierre(datos).map(p => p.texto).join('\n') + '\n';
}

// ── Guardar respaldo .txt ─────────────────────────────────────────────────────
function _guardarTxt(texto, subtipo = 'recibo', fechaStr = null) {
  const carpeta = subtipo === 'cierre' ? 'cierres' : 'recibos';
  const dir = path.join(os.homedir(), 'perros-americanos', carpeta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sello   = fechaStr || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = path.join(dir, `${subtipo}-${sello}.txt`);
  fs.writeFileSync(archivo, texto, 'utf8');
  return archivo;
}

// ── Log de impresión en Windows ───────────────────────────────────────────────
function _logWin(msg) {
  const ts = new Date().toISOString();
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'perros-print-win.log'),
      `[${ts}] ${msg}\n`
    );
  } catch (_) {}
  console.log('[Win]', msg);
}

// ── Log de impresión en Linux ─────────────────────────────────────────────────
function _logLin(msg) {
  try { fs.appendFileSync('/tmp/perros-print.log', `[${new Date().toISOString()}] ${msg}\n`); } catch(_) {}
  console.log('[Print]', msg);
}

// ── Listar impresoras del sistema (solo nombres) ──────────────────────────────
function getPrinters() {
  try {
    if (process.platform === 'win32') {
      const raw = execSync('wmic printer get Name /format:csv', {
        encoding: 'utf8', shell: 'cmd.exe', timeout: 5000,
      });
      return raw.split('\n')
        .map(l => l.split(',').pop()?.trim())
        .filter(n => n && n !== 'Name' && n.length > 0);
    }
    try {
      const raw = execSync('lpstat -a 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
      const nombres = raw.split('\n').map(l => l.split(/\s+/)[0]).filter(Boolean);
      if (nombres.length > 0) return nombres;
    } catch (_) {}
    return [];
  } catch (_) {
    return [];
  }
}

// ── Listar impresoras con nombre Y puerto (Windows) ───────────────────────────
function getPrintersDetailed() {
  try {
    if (process.platform !== 'win32') return [];
    const raw = execSync('wmic printer get Name,PortName /format:csv', {
      encoding: 'utf8', shell: 'cmd.exe', timeout: 5000,
    });
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const hi = lines.findIndex(l => /node,name,portname/i.test(l));
    if (hi === -1) return [];
    return lines.slice(hi + 1).map(l => {
      const parts = l.split(',');
      if (parts.length < 3) return null;
      const name = parts[parts.length - 2]?.trim();
      const port = parts[parts.length - 1]?.trim();
      return (name && name !== 'Name' && port) ? { name, port } : null;
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

// ── Impresión raw en Windows vía PowerShell + Win32 API ──────────────────────
// Método definitivo: evita el spooler de Windows, escribe bytes ESC/POS directo
// a la impresora usando winspool.drv vía P/Invoke en C# compilado en tiempo de
// ejecución. No requiere drivers adicionales ni diálogos del sistema.
function _imprimirRawWindows(bufferESCPOS, nombreImpresora) {
  // Cada clase debe tener nombre único para evitar conflictos con Add-Type
  const className = 'RawPrint' + Date.now();
  const bytesStr  = Array.from(bufferESCPOS).join(',');

  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ${className} {
    [DllImport("winspool.drv", CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
    [DllImport("winspool.drv")]
    public static extern bool StartDocPrinter(IntPtr h, int l, int[] d);
    [DllImport("winspool.drv")]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
    [DllImport("winspool.drv")]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv")]
    public static extern bool ClosePrinter(IntPtr h);
}
"@
\$h = [IntPtr]::Zero
[${className}]::OpenPrinter("${nombreImpresora}", [ref]\$h, [IntPtr]::Zero)
[${className}]::StartDocPrinter(\$h, 1, [int[]](0,0,0,0))
[${className}]::StartPagePrinter(\$h)
\$b = [byte[]](${bytesStr})
\$w = 0
[${className}]::WritePrinter(\$h, \$b, \$b.Length, [ref]\$w)
[${className}]::EndPagePrinter(\$h)
[${className}]::EndDocPrinter(\$h)
[${className}]::ClosePrinter(\$h)
Write-Host "OK:\$w"
`;

  const scriptPath = path.join(os.tmpdir(), `papos_${Date.now()}.ps1`);

  try {
    fs.writeFileSync(scriptPath, script, 'utf8');
    const result = execSync(
      `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { timeout: 15000 }
    );
    const output = result.toString();
    _logWin(`PowerShell resultado: ${output.trim()}`);
    if (output.includes('OK:')) {
      return { ok: true };
    }
    throw new Error('Sin confirmacion de bytes enviados');
  } catch (err) {
    _logWin(`PowerShell error: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch(e) {}
  }
}

// ── Impresión en Windows ──────────────────────────────────────────────────────
// incluirCajon: si true, añade el comando de apertura al final del buffer
// antes de enviarlo a WritePrinter (recomendado para efectivo/mixto)
async function printWindows(buffer, texto, printerName, incluirCajon = false) {
  const nombre = printerName || DEFAULT_WIN_PRINTER;

  // Concatenar comando cajón al buffer si se requiere
  const bufferFinal = incluirCajon
    ? Buffer.concat([buffer, CMD_CAJON_PIN2])
    : buffer;

  _logWin(`Impresora: ${nombre} | ${bufferFinal.length} bytes${incluirCajon ? ' (+ cajón)' : ''}`);

  const resultado = _imprimirRawWindows(bufferFinal, nombre);

  // Guardar .txt siempre como registro histórico
  _guardarTxt(texto);

  if (resultado.ok) {
    return { ok: true, metodo: 'powershell_raw' };
  }

  // Sin impresora disponible: recibo ya guardado en .txt
  _logWin('Fallback a .txt — impresora no disponible');
  const archivo = _guardarTxt(texto);
  return { ok: true, metodo: 'txt_backup', path: archivo, aviso: 'impresora_no_disponible', detalle: resultado.error };
}

// ── Impresión en Linux — ESC/POS directo al puerto de la impresora ───────────
// incluirCajon: si true, envía el comando de apertura por separado después del recibo
function printLinux(buffer, texto, puerto, incluirCajon = false) {
  const puertoReal = puerto || '/dev/usb/lp0';

  _logLin(`Intentando imprimir en ${puertoReal}, buffer ${buffer.length} bytes`);

  // Intento 1: writeFileSync en modo bloqueante — escribe todos los bytes de una vez.
  // NO usar O_NONBLOCK: con ese flag writeSync puede escribir solo parcialmente sin
  // lanzar error, y la impresora recibe datos truncados (imprime '@' y '=' sueltos).
  try {
    fs.writeFileSync(puertoReal, buffer);
    _logLin('writeFileSync OK - impresión exitosa');
    if (incluirCajon) {
      try {
        fs.writeFileSync(puertoReal, CMD_CAJON_PIN2);
        _logLin('Cajón: comando enviado');
      } catch(e) {
        _logLin(`Cajón: no se pudo enviar: ${e.message}`);
      }
    }
    _guardarTxt(texto);
    return { ok: true, metodo: 'escpos_raw' };
  } catch (e1) {
    _logLin(`Intento1 falló: code=${e1.code} msg=${e1.message}`);

    // Intento 2: escribir a archivo temporal y enviar con cat
    try {
      const tmpBin = path.join(os.tmpdir(), 'perros-escpos.bin');
      fs.writeFileSync(tmpBin, buffer);
      _logLin(`cat "${tmpBin}" > "${puertoReal}"`);
      execSync(`cat "${tmpBin}" > "${puertoReal}"`, { timeout: 5000 });
      _logLin('cat OK - impresión exitosa');
      if (incluirCajon) {
        try { fs.writeFileSync(puertoReal, CMD_CAJON_PIN2); } catch(_) {}
      }
      _guardarTxt(texto);
      return { ok: true, metodo: 'escpos_cat' };
    } catch (e2) {
      _logLin(`Intento2 (cat) falló: code=${e2.code} msg=${e2.message}`);
    }

    const detalle = e1.code === 'EACCES'
      ? `Sin permisos en ${puertoReal}. Ejecuta: sudo chmod 666 ${puertoReal}`
      : `Puerto no disponible (${puertoReal}): ${e1.message}`;
    _logLin(`Sin impresora: ${detalle}`);
    const archivo = _guardarTxt(texto);
    return { ok: true, metodo: 'txt_backup', path: archivo, aviso: 'impresora_no_disponible', detalle };
  }
}

// ── Apertura de cajón portamonedas ────────────────────────────────────────────
async function abrirCajon({ pin = '2', printerName, puertoLinux } = {}) {
  const cmd = pin === '5' ? CMD_CAJON_PIN5 : CMD_CAJON_PIN2;
  try {
    if (process.platform === 'win32') {
      const nombre = printerName || DEFAULT_WIN_PRINTER;
      _logWin(`Cajón: enviando a ${nombre}`);
      const r = _imprimirRawWindows(cmd, nombre);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    } else {
      const puertoReal = puertoLinux || '/dev/usb/lp0';
      try {
        fs.writeFileSync(puertoReal, cmd);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Punto de entrada: imprimir recibo de venta ────────────────────────────────
// incluirCajon: true cuando metodo_pago es efectivo o mixto y cajon_activo está activo
async function imprimirRecibo(datos) {
  try {
    const buffer = construirBuffer(_partesRecibo(datos));
    const texto  = generarTextoRecibo(datos);
    const incluirCajon = !!datos.incluirCajon;
    if (process.platform === 'win32') {
      return await printWindows(buffer, texto, datos.printerName, incluirCajon);
    }
    return printLinux(buffer, texto, datos.puertoLinux, incluirCajon);
  } catch (err) {
    console.error('[Print] Error imprimirRecibo:', err);
    return { ok: false, error: err.message };
  }
}

// ── Punto de entrada: imprimir cierre de caja ─────────────────────────────────
async function imprimirCierre(datos) {
  try {
    const buffer = construirBuffer(_partesCierre(datos));
    const texto  = generarTextoCierre(datos);
    _guardarTxt(texto, 'cierre', datos.fecha);
    if (process.platform === 'win32') {
      return await printWindows(buffer, texto, datos.printerName, false);
    }
    return printLinux(buffer, texto, datos.puertoLinux, false);
  } catch (err) {
    console.error('[Print] Error imprimirCierre:', err);
    return { ok: false, error: err.message };
  }
}

// ── Punto de entrada: imprimir recibo de prueba ───────────────────────────────
async function imprimirPrueba({ printerName, puertoLinux } = {}) {
  try {
    const partes = _partesPrueba();
    const buffer = construirBuffer(partes);
    const texto  = partes.map(p => p.texto).join('\n') + '\n';
    if (process.platform === 'win32') {
      return await printWindows(buffer, texto, printerName, false);
    }
    return printLinux(buffer, texto, puertoLinux, false);
  } catch (err) {
    console.error('[Print] Error imprimirPrueba:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  imprimirRecibo, generarTextoRecibo,
  imprimirCierre, generarTextoCierre,
  imprimirPrueba, getPrinters, getPrintersDetailed, abrirCajon,
};

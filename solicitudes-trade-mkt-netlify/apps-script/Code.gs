/**
 * Solicitudes Trade Marketing · Cineplanet
 * Google Apps Script (web app).
 *
 *  Funciona como servidor (API) del sitio publicado en Netlify:
 *  - Formulario para gerentes:   https://TU-SITIO.netlify.app/
 *  - Panel de Marketing:         https://TU-SITIO.netlify.app/panel.html
 *
 * Qué hace:
 *  1. Guarda cada solicitud en una Google Sheet ("Trade Marketing · Solicitudes").
 *  2. Sube la foto (JPG, máx. 100 KB) a la carpeta de Drive Trade_MKT.
 *  3. Envía la solicitud por correo a asparrow@cineplanet.com.pe.
 *  4. Desde el panel, Marketing completa Fecha de entrega, Comentarios de MKT y
 *     Destinatario, y el sistema notifica por correo al destinatario.
 */

const CONFIG = {
  CORREO_MKT: 'asparrow@cineplanet.com.pe',
  URL_SITIO: '', // opcional: https://TU-SITIO.netlify.app (para el enlace al panel en los correos)
  CARPETA_DRIVE_ID: '1HL1ny4KJ2NZ_dJvhTbYHUUEFC3OFE6sy', // Carpeta Trade_MKT
  NOMBRE_HOJA: 'Solicitudes',
  NOMBRE_LIBRO: 'Trade Marketing · Solicitudes',
  MAX_FOTO_BYTES: 100 * 1024,
  ZONA: 'America/Lima',
  PROVINCIAS: ['Lima', 'Arequipa', 'Trujillo', 'Cusco', 'Huancayo', 'Cajamarca', 'Chiclayo', 'Huanuco', 'Pucallpa', 'Piura'],
  COMPLEJOS: ['Mall del Sur', 'Lurin', 'Arequipa RP', 'Trujillo Centro', 'Villa el Salvador', 'Puruchuco', 'Piura RP', 'Salaverry'],
  TIPOS: ['Material dañado', 'Pantallas/Tecnología', 'Solicitud de artes', 'Solicitud de materiales', 'Retiro de material', 'Instalación', 'Consulta y Coordinación'],
  URGENCIAS: ['Normal', 'Urgente'],
  ESTADOS: ['Pendiente', 'En proceso', 'Completado']
};

// Orden de columnas en la hoja. No cambiar el orden sin ajustar filaAObjeto_().
const COLUMNAS = [
  'Código', 'Registrado', 'Nombre del gerente', 'Correo del gerente', 'Provincia', 'Complejo',
  'Fecha de solicitud', 'Tipo de trabajo', 'Urgencia', 'Comentarios', 'Foto (Drive)',
  'Estado', 'Fecha de entrega', 'Comentarios de MKT', 'Destinatario', 'Notificado'
];

/* ------------------------------------------------------------------ */
/*  Web app                                                            */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, resultado: 'Servidor de Solicitudes Trade Marketing activo.' });
}

/**
 * API usada por el sitio en Netlify. Recibe {accion, datos} como texto JSON
 * (Content-Type text/plain para evitar el bloqueo CORS del navegador).
 */
function doPost(e) {
  try {
    const cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const d = cuerpo.datos || {};
    let resultado;
    switch (cuerpo.accion) {
      case 'enviarSolicitud': resultado = enviarSolicitud(d); break;
      case 'listarSolicitudes': resultado = listarSolicitudes(d.clave); break;
      case 'actualizarSolicitud': resultado = actualizarSolicitud(d.clave, d.codigo, d.cambios, d.notificar); break;
      default: throw new Error('Acción no reconocida.');
    }
    return json_({ ok: true, resultado: resultado });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  Formulario de gerentes                                            */
/* ------------------------------------------------------------------ */

function enviarSolicitud(d) {
  d = d || {};
  const limpio = s => String(s == null ? '' : s).trim();
  const sol = {
    nombre: limpio(d.nombre).slice(0, 120),
    correo: limpio(d.correo).slice(0, 160),
    provincia: limpio(d.provincia),
    complejo: limpio(d.complejo),
    fecha: limpio(d.fecha),
    tipo: limpio(d.tipo),
    urgencia: limpio(d.urgencia),
    comentarios: limpio(d.comentarios).slice(0, 1500)
  };

  // Validación en servidor (no confiar solo en el navegador)
  if (!sol.nombre) throw new Error('Falta el nombre del gerente.');
  if (!esCorreo_(sol.correo)) throw new Error('El correo de contacto no es válido.');
  if (CONFIG.PROVINCIAS.indexOf(sol.provincia) < 0) throw new Error('Provincia no válida.');
  if (CONFIG.COMPLEJOS.indexOf(sol.complejo) < 0) throw new Error('Complejo no válido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sol.fecha)) throw new Error('Fecha de solicitud no válida.');
  if (CONFIG.TIPOS.indexOf(sol.tipo) < 0) throw new Error('Tipo de trabajo no válido.');
  if (CONFIG.URGENCIAS.indexOf(sol.urgencia) < 0) throw new Error('Urgencia no válida.');
  if (sol.comentarios.length < 10) throw new Error('Describe el pedido en los comentarios.');

  let fotoBlob = null;
  if (d.foto && d.foto.data) {
    const bytes = Utilities.base64Decode(d.foto.data);
    if (bytes.length > CONFIG.MAX_FOTO_BYTES) throw new Error('La foto supera los 100 KB.');
    // Comprobar firma JPG (FF D8 FF)
    if (!((bytes[0] & 0xFF) === 0xFF && (bytes[1] & 0xFF) === 0xD8)) throw new Error('La foto debe ser JPG.');
    fotoBlob = Utilities.newBlob(bytes, 'image/jpeg', 'foto.jpg');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let codigo, fotoUrl = '';
  try {
    const hoja = hoja_();
    const ahora = new Date();
    codigo = nuevoCodigo_(hoja, ahora);

    if (fotoBlob) {
      const nombreArchivo = codigo + ' · ' + sol.complejo + ' · ' + sol.tipo.replace(/\//g, '-') + '.jpg';
      fotoBlob.setName(nombreArchivo);
      const archivo = DriveApp.getFolderById(CONFIG.CARPETA_DRIVE_ID).createFile(fotoBlob);
      archivo.setDescription('Solicitud ' + codigo + ' · ' + sol.nombre + ' (' + sol.correo + ')');
      fotoUrl = archivo.getUrl();
    }

    hoja.appendRow([
      codigo,
      Utilities.formatDate(ahora, CONFIG.ZONA, 'yyyy-MM-dd HH:mm'),
      sol.nombre, sol.correo, sol.provincia, sol.complejo, sol.fecha, sol.tipo, sol.urgencia,
      sol.comentarios, fotoUrl, 'Pendiente', '', '', '', ''
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Correo a Marketing
  const asunto = (sol.urgencia === 'Urgente' ? '[URGENTE] ' : '') +
    'Solicitud ' + codigo + ' · ' + sol.complejo + ' · ' + sol.tipo;
  const filas = [
    ['Código', codigo],
    ['Gerente', sol.nombre + ' · ' + sol.correo],
    ['Provincia', sol.provincia],
    ['Complejo', sol.complejo],
    ['Fecha de solicitud', fechaCorta_(sol.fecha)],
    ['Tipo de trabajo', sol.tipo],
    ['Urgencia', sol.urgencia],
    ['Comentarios', sol.comentarios],
    ['Foto', fotoUrl ? '<a href="' + fotoUrl + '">Ver en Google Drive</a>' : 'Sin foto']
  ];
  const opciones = {
    to: CONFIG.CORREO_MKT,
    subject: asunto,
    replyTo: sol.correo,
    name: 'Solicitudes Trade Marketing',
    htmlBody: plantillaCorreo_('Nueva solicitud de ' + sol.complejo, filas,
      'Responde desde el panel: ' + urlPanel_(d.origen))
  };
  if (fotoBlob) opciones.attachments = [fotoBlob];
  MailApp.sendEmail(opciones);

  return { codigo: codigo };
}

/* ------------------------------------------------------------------ */
/*  Panel de Marketing                                                 */
/* ------------------------------------------------------------------ */

function listarSolicitudes(clave) {
  verificarClave_(clave);
  const hoja = hoja_();
  const n = hoja.getLastRow() - 1;
  if (n < 1) return [];
  return hoja.getRange(2, 1, n, COLUMNAS.length).getValues().map(filaAObjeto_);
}

function actualizarSolicitud(clave, codigo, cambios, notificar) {
  verificarClave_(clave);
  cambios = cambios || {};
  const estado = String(cambios.estado || 'Pendiente');
  if (CONFIG.ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido.');
  const entrega = String(cambios.entrega || '');
  if (entrega && !/^\d{4}-\d{2}-\d{2}$/.test(entrega)) throw new Error('Fecha de entrega no válida.');
  const comentariosMkt = String(cambios.comentariosMkt || '').slice(0, 2000);
  const destinatario = String(cambios.destinatario || '').trim();
  const correos = destinatario.split(/[,;\s]+/).filter(String);
  if (notificar && (!correos.length || !correos.every(esCorreo_))) throw new Error('Destinatario no válido.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let fila, obj;
  try {
    const hoja = hoja_();
    const n = hoja.getLastRow() - 1;
    const codigos = n > 0 ? hoja.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const i = codigos.indexOf(String(codigo));
    if (i < 0) throw new Error('No se encontró la solicitud ' + codigo + '.');
    fila = i + 2;
    hoja.getRange(fila, 12, 1, 4).setValues([[estado, entrega, comentariosMkt, correos.join(', ')]]);
    obj = filaAObjeto_(hoja.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0]);

    if (notificar) {
      const filas = [
        ['Código', obj.codigo],
        ['Complejo', obj.complejo + ' · ' + obj.provincia],
        ['Tipo de trabajo', obj.tipo],
        ['Urgencia', obj.urgencia],
        ['Fecha de solicitud', fechaCorta_(obj.fecha)],
        ['Tu pedido', obj.comentarios],
        ['Estado', obj.estado],
        ['Fecha de entrega', obj.entrega ? fechaCorta_(obj.entrega) : 'Por confirmar'],
        ['Comentarios de Marketing', obj.comentariosMkt || '—']
      ];
      MailApp.sendEmail({
        to: correos.join(','),
        cc: CONFIG.CORREO_MKT,
        replyTo: CONFIG.CORREO_MKT,
        name: 'Trade Marketing Cineplanet',
        subject: 'Solicitud ' + obj.codigo + ' · ' + obj.estado +
          (obj.entrega ? ' · entrega ' + fechaCorta_(obj.entrega) : ''),
        htmlBody: plantillaCorreo_('Respuesta a tu solicitud ' + obj.codigo, filas,
          'Si tienes dudas, responde a este correo.')
      });
      const sello = Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyy-MM-dd HH:mm');
      hoja.getRange(fila, 16).setValue(sello);
      obj.notificado = sello;
    }
  } finally {
    lock.releaseLock();
  }
  return obj;
}

/* ------------------------------------------------------------------ */
/*  Configuración inicial: ejecutar UNA vez desde el editor            */
/* ------------------------------------------------------------------ */

/**
 * Crea la hoja de cálculo, define la clave del panel y pide los permisos.
 * Cambia la clave antes de ejecutar.
 */
function configurar() {
  const CLAVE_PANEL = 'CambiaEstaClave2026';
  PropertiesService.getScriptProperties().setProperty('CLAVE_PANEL', CLAVE_PANEL);
  const hoja = hoja_();
  DriveApp.getFolderById(CONFIG.CARPETA_DRIVE_ID).getName(); // valida acceso a la carpeta
  MailApp.getRemainingDailyQuota();
  Logger.log('Hoja de solicitudes: ' + hoja.getParent().getUrl());
  Logger.log('Clave del panel guardada. Cuota de correos restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

function hoja_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  let libro;
  if (id) {
    libro = SpreadsheetApp.openById(id);
  } else {
    libro = SpreadsheetApp.create(CONFIG.NOMBRE_LIBRO);
    props.setProperty('SHEET_ID', libro.getId());
    // Guardar la hoja dentro de la carpeta Trade_MKT
    DriveApp.getFileById(libro.getId()).moveTo(DriveApp.getFolderById(CONFIG.CARPETA_DRIVE_ID));
  }
  let hoja = libro.getSheetByName(CONFIG.NOMBRE_HOJA);
  if (!hoja) {
    hoja = libro.getSheets()[0];
    hoja.setName(CONFIG.NOMBRE_HOJA);
  }
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
      .setFontWeight('bold').setBackground('#041E42').setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
    // Fechas como texto para que no cambien de formato
    hoja.getRange('B:B').setNumberFormat('@');
    hoja.getRange('G:G').setNumberFormat('@');
    hoja.getRange('M:M').setNumberFormat('@');
    hoja.getRange('P:P').setNumberFormat('@');
    hoja.setColumnWidth(10, 360);
    hoja.setColumnWidth(14, 300);
  }
  return hoja;
}

function nuevoCodigo_(hoja, fecha) {
  const prefijo = 'TM-' + Utilities.formatDate(fecha, CONFIG.ZONA, 'yyMMdd') + '-';
  const total = Math.max(hoja.getLastRow() - 1, 0);
  return prefijo + ('00' + (total + 1)).slice(-3);
}

function filaAObjeto_(r) {
  const t = v => v instanceof Date ? Utilities.formatDate(v, CONFIG.ZONA, 'yyyy-MM-dd') : String(v == null ? '' : v);
  return {
    codigo: t(r[0]), registrado: r[1] instanceof Date ? Utilities.formatDate(r[1], CONFIG.ZONA, 'yyyy-MM-dd HH:mm') : t(r[1]),
    nombre: t(r[2]), correo: t(r[3]), provincia: t(r[4]), complejo: t(r[5]), fecha: t(r[6]),
    tipo: t(r[7]), urgencia: t(r[8]), comentarios: t(r[9]), fotoUrl: t(r[10]),
    estado: t(r[11]) || 'Pendiente', entrega: t(r[12]), comentariosMkt: t(r[13]),
    destinatario: t(r[14]), notificado: r[15] instanceof Date ? Utilities.formatDate(r[15], CONFIG.ZONA, 'yyyy-MM-dd HH:mm') : t(r[15])
  };
}

function verificarClave_(clave) {
  const real = PropertiesService.getScriptProperties().getProperty('CLAVE_PANEL');
  if (!real) throw new Error('El panel aún no está configurado. Ejecuta configurar() en el editor.');
  if (String(clave || '') !== real) throw new Error('Clave incorrecta.');
}

function esCorreo_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

function fechaCorta_(iso) { return String(iso).split('-').reverse().join('/'); }

function urlPanel_(origen) {
  const base = CONFIG.URL_SITIO || (/^https:\/\/[a-z0-9.-]+$/i.test(String(origen || '')) ? String(origen) : '');
  return base ? base.replace(/\/$/, '') + '/panel.html' : '(sitio en Netlify)/panel.html';
}

function html_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function plantillaCorreo_(titulo, filas, pie) {
  const celdas = filas.map(f => {
    const valor = /^<a /.test(f[1]) ? f[1] : html_(f[1]);
    return '<tr><td style="padding:10px 14px;color:#4A5873;font-size:13px;vertical-align:top;white-space:nowrap;border-bottom:1px solid #DCE3EE">' +
      html_(f[0]) + '</td><td style="padding:10px 14px;color:#041E42;font-size:14px;font-weight:bold;border-bottom:1px solid #DCE3EE">' +
      valor + '</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#F6F8FB;padding:24px">' +
    '<div style="max-width:620px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #DCE3EE">' +
    '<div style="background:#041E42;color:#FFFFFF;padding:18px 22px;font-size:13px;letter-spacing:1px;text-transform:uppercase">cineplanet · Trade Marketing</div>' +
    '<div style="padding:22px"><h2 style="margin:0 0 16px;color:#041E42;font-size:20px">' + html_(titulo) + '</h2>' +
    '<table style="border-collapse:collapse;width:100%">' + celdas + '</table>' +
    '<p style="color:#4A5873;font-size:12px;margin:18px 0 0">' + html_(pie) + '</p></div></div></div>';
}

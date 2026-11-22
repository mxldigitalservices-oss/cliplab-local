const CLAVE_STORAGE = 'cliplab.masterKey';
const TIMEOUT_MS = 8000;
const TIMEOUT_SUBIDA_MS = 15 * 60 * 1000;   // subir un video pesado tarda mucho mas que una consulta normal
const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF]/g;
const CABECERA_VALIDA = /^[\x20-\x7E]+$/;

function limpiarLlave(valor) {
  let limpio = String(valor || '').replace(INVISIBLES, '').trim();
  const comilla = limpio.charAt(0);
  if (limpio.length >= 2 && (comilla === '"' || comilla === "'") && limpio.endsWith(comilla)) {
    limpio = limpio.slice(1, -1).trim();
  }
  return limpio;
}

export function leerLlave() {
  try {
    return limpiarLlave(localStorage.getItem(CLAVE_STORAGE));
  } catch {
    return '';
  }
}

export function guardarLlave(valor) {
  try {
    const limpia = limpiarLlave(valor);
    if (limpia) {
      localStorage.setItem(CLAVE_STORAGE, limpia);
    } else {
      localStorage.removeItem(CLAVE_STORAGE);
    }
  } catch {
    // Navegador sin almacenamiento disponible: se ignora.
  }
}

export class ApiError extends Error {
  constructor(mensaje, status, cancelado = false) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.cancelado = cancelado;
    this.requiereLlave = status === 401;
  }
}

async function solicitar(ruta, opciones = {}) {
  const { metodo = 'GET', cuerpo, formulario, signal, timeoutMs = TIMEOUT_MS } = opciones;

  const cabeceras = { Accept: 'application/json' };
  const llave = leerLlave();
  if (llave) {
    if (!CABECERA_VALIDA.test(llave)) {
      throw new ApiError('La llave guardada tiene caracteres no validos (acentos o comillas curvas). Borrala y pega la correcta.', 401);
    }
    cabeceras['x-master-key'] = llave;
  }
  // Con FormData NO se fija Content-Type: el navegador lo pone con el boundary del multipart.
  if (cuerpo !== undefined && formulario === undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(temporizador);
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    signal.addEventListener('abort', () => controlador.abort(), { once: true });
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cabeceras,
      body: formulario !== undefined ? formulario : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
      cache: 'no-store',
    });
  } catch {
    if (signal && signal.aborted && !vencido) {
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    throw new ApiError(vencido ? 'El servidor no respondio a tiempo' : 'Sin conexion con el servidor', 0);
  } finally {
    clearTimeout(temporizador);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok || (datos && datos.success === false)) {
    throw new ApiError((datos && datos.error) || 'Error ' + respuesta.status, respuesta.status);
  }

  // Respuesta estandar { success, data, error }: el resto del panel sigue recibiendo { ok, ...campos }.
  if (datos && typeof datos === 'object' && 'success' in datos) {
    return { ok: true, ...(datos.data || {}) };
  }

  return datos;
}

let proveedorAjustes = null;

/** lote.js registra aqui una funcion que devuelve los ajustes a enviar con cada proyecto nuevo (o null). */
export function registrarAjustesNuevos(fn) {
  proveedorAjustes = typeof fn === 'function' ? fn : null;
}

export function obtenerEstado(signal) {
  return solicitar('/api/panel/estado', { signal });
}

/**
 * Encola un video. Con `archivo` (File) envia multipart/form-data con el campo "archivo" y los demas campos de texto
 * (sin url: el backend acepta enlace o archivo, nunca ambos). Sin archivo envia JSON como siempre.
 * opciones: modo, cantidad, instruccion, estiloSubtitulos (y inicio/duracion). Si "Aplicar tambien a clips nuevos" esta
 * activo (lote.js), se agregan los `ajustes` de lote.
 */
export function encolarVideo(url, opcionesBase = {}, archivo = null) {
  // "Aplicar tambien a clips nuevos" (lote.js): si hay ajustes activos se envian con cada proyecto nuevo.
  const ajustes = proveedorAjustes ? proveedorAjustes() : null;
  const opciones = ajustes && opcionesBase.ajustes === undefined ? { ...opcionesBase, ajustes } : opcionesBase;
  if (!archivo) {
    return solicitar('/api/panel/encolar', { metodo: 'POST', cuerpo: { url, ...opciones } });
  }
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(opciones)) {
    if (clave === 'ajustes' && valor && typeof valor === 'object') {
      formulario.append('ajustes', JSON.stringify(valor));   // multipart solo lleva texto: el backend lo lee como JSON
      continue;
    }
    if (valor !== undefined && valor !== null && valor !== '') formulario.append(clave, String(valor));
  }
  formulario.append('archivo', archivo, archivo.name);   // el archivo va al final: los campos de texto llegan antes
  return solicitar('/api/panel/encolar', { metodo: 'POST', formulario, timeoutMs: TIMEOUT_SUBIDA_MS });
}

export function obtenerIncidencia(id, signal) {
  return solicitar('/api/panel/incidencias/' + encodeURIComponent(id), { signal });
}

export function guardarCookiesRed(red, cookies) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'POST', cuerpo: { cookies } });
}

export function quitarCookiesRed(red) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'DELETE' });
}

/** Sube una foto/logo (png, jpg, webp). Devuelve { logo: { id, ancho, alto, conAlfa, fondoDetectado, fondoColor } }. */
export function subirLogo(archivo) {
  const formulario = new FormData();
  formulario.append('logo', archivo, archivo.name);
  return solicitar('/api/panel/logo', { metodo: 'POST', formulario, timeoutMs: 60000 });
}

/** Imagen del logo como URL local (blob): <img> no puede enviar la llave maestra, asi que se pide con fetch. */
export async function obtenerLogoUrl(id, sinFondo = false) {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  const respuesta = await fetch('/api/panel/logo/' + encodeURIComponent(id) + (sinFondo ? '?sinFondo=1' : ''), { headers: cabeceras, cache: 'no-store' });
  if (!respuesta.ok) throw new ApiError('No se pudo cargar el logo', respuesta.status);
  return URL.createObjectURL(await respuesta.blob());
}

/** "Aplicar a todos": re-renderiza los clips indicados con los ajustes (cada uno sale como clip nuevo). */
export function aplicarLote(ids, ajustes) {
  return solicitar('/api/panel/lote/aplicar', { metodo: 'POST', cuerpo: { ids, ajustes } });
}

/** Catalogo de solo lectura (canales, destinos, mercados y plan de renders) para el panel. */
export function obtenerCanales(signal) {
  return solicitar('/api/panel/canales', { signal });
}

/** Paquete de texto del clip. `canal` es obligatorio; `mercado` y `destino` (texto o lista separada por comas) son opcionales. */
export function obtenerPaquete(id, { canal, mercado, destino } = {}, signal) {
  const consulta = new URLSearchParams();
  if (canal) consulta.set('canal', canal);
  if (mercado) consulta.set('mercado', mercado);
  if (destino) consulta.set('destino', destino);
  return solicitar('/api/panel/clips/' + encodeURIComponent(id) + '/paquete?' + consulta.toString(), { signal });
}

function nombreDeContentDisposition(cabecera) {
  const m = /filename="?([^";]+)"?/i.exec(String(cabecera || ''));
  const limpio = m ? m[1].replace(/[^A-Za-z0-9._-]/g, '_') : '';
  return /\.mp4$/i.test(limpio) ? limpio : 'clip.mp4';
}

/**
 * Descarga el video del clip. Un enlace <a> no puede enviar la llave maestra, asi que se pide con fetch y se guarda
 * desde un blob (un clip pesa decenas de MB como maximo: cabe sin problema en la RAM del navegador).
 */
export async function descargarVideo(id, mercado = '') {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  let respuesta;
  try {
    respuesta = await fetch('/api/panel/clips/' + encodeURIComponent(id) + '/descarga' + (mercado ? '?mercado=' + encodeURIComponent(mercado) : ''), { headers: cabeceras, cache: 'no-store' });
  } catch {
    throw new ApiError('Sin conexion con el servidor', 0);
  }
  if (!respuesta.ok) {
    let mensaje = 'Error ' + respuesta.status;
    try { const datos = await respuesta.json(); if (datos && datos.error) mensaje = datos.error; } catch { /* sin cuerpo JSON */ }
    throw new ApiError(mensaje, respuesta.status);
  }
  const nombre = nombreDeContentDisposition(respuesta.headers.get('content-disposition'));
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { nombre };
}

// ---- Guiones (Parte 5): cola de fichas -> guion con Ollama -> video de stories con Piper + FFmpeg ----
export const obtenerEntornoGuiones = (signal) => solicitar('/api/panel/guiones/entorno', { signal });
export const listarGuiones = (signal) => solicitar('/api/panel/guiones', { signal });
export const estadoTrabajoGuion = (signal) => solicitar('/api/panel/guiones/estado', { signal });
export const encolarGuionFicha = (ficha, opciones = {}) => solicitar('/api/panel/guiones', { metodo: 'POST', cuerpo: { ficha, ...opciones } });
export const procesarGuion = () => solicitar('/api/panel/guiones/procesar', { metodo: 'POST', cuerpo: {} });
export const producirGuiones = (ids) => solicitar('/api/panel/guiones/producir', { metodo: 'POST', cuerpo: { ids } });

// ---- Sports / News desde video fuente + cancelar produccion (Parte 6B) ----
export const obtenerConfigFranja = (canal = '', formato = '', signal) => solicitar('/api/panel/franja/config' + (canal ? '?canal=' + encodeURIComponent(canal) + (formato ? '&formato=' + encodeURIComponent(formato) : '') : ''), { signal });
export const listarFuentesFranja = (signal) => solicitar('/api/panel/franja/fuentes', { signal });
export const validarDifuminados = (canal, formato, difuminados) => solicitar('/api/panel/franja/difuminados/validar', { metodo: 'POST', cuerpo: { canal, formato, difuminados } });
export const producirFranjaVideo = (cuerpo) => solicitar('/api/panel/franja/producir', { metodo: 'POST', cuerpo });
export const cancelarProduccion = () => solicitar('/api/panel/produccion/cancelar', { metodo: 'POST', cuerpo: {} });

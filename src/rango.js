// ---------------------------------------------------------------------------
// Rango de recorte de un video fuente por marcas de tiempo (Parte 6B). Modulo puro.
// Una marca es un numero de segundos (75.5), texto numerico ("75.5") o reloj ("1:15", "01:15.5", "1:02:03").
// Se puede dar { inicio, fin } o { inicio, duracion } (o las dos si coinciden); { marcas: [inicio, fin] } es la forma corta.
// Sin fin ni duracion = desde `inicio` hasta el final del video. El tope RANGO_MAX_SEGUNDOS protege la CPU de la laptop (el render no
// carga el video en memoria: FFmpeg lo lee en flujo y solo se limita el tiempo de codificacion).
// ---------------------------------------------------------------------------

export class ErrorRango extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorRango';
    this.status = 400;
  }
}

export const RANGO_MAX_SEGUNDOS = 600;
export const RANGO_MIN_SEGUNDOS = 0.5;
const TOLERANCIA = 0.05;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Marca -> segundos (>= 0). Lanza ErrorRango si no es una marca valida. */
export function parsearMarca(valor, etiqueta = 'marca') {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) throw new ErrorRango(etiqueta + ' debe ser una marca de tiempo >= 0.');
    return r3(valor);
  }
  const t = String(valor ?? '').trim();
  if (!t) throw new ErrorRango(etiqueta + ' esta vacia.');
  if (/^\d+(\.\d+)?$/.test(t)) return r3(Number(t));
  const m = /^(?:(\d{1,3}):)?(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/.exec(t);
  if (!m) throw new ErrorRango(etiqueta + ' no es una marca valida (usa segundos o mm:ss).');
  const horas = m[1] === undefined ? 0 : Number(m[1]);
  const minutos = Number(m[2]);
  const segundos = Number(m[3]);
  if (segundos >= 60 || (m[1] !== undefined && minutos >= 60)) throw new ErrorRango(etiqueta + ' tiene minutos o segundos fuera de rango.');
  return r3(horas * 3600 + minutos * 60 + segundos);
}

const vacio = (v) => v === undefined || v === null || v === '';

/**
 * Normaliza el rango. Devuelve { inicio, fin, duracion } con fin/duracion = null cuando no hay limite.
 * fin = inicio + duracion cuando hay duracion. Lanza ErrorRango (400) con un mensaje claro.
 */
export function normalizarRango(entrada = {}, { max = RANGO_MAX_SEGUNDOS } = {}) {
  const f = entrada && typeof entrada === 'object' ? entrada : {};
  let { inicio, fin, duracion } = f;
  if (f.marcas !== undefined && f.marcas !== null) {
    if (!Array.isArray(f.marcas) || f.marcas.length !== 2) throw new ErrorRango('marcas debe ser [inicio, fin].');
    if (!vacio(inicio) || !vacio(fin)) throw new ErrorRango('Usa marcas o inicio/fin, no las dos formas a la vez.');
    [inicio, fin] = f.marcas;
  }
  const ini = vacio(inicio) ? 0 : parsearMarca(inicio, 'inicio');
  const fi = vacio(fin) ? null : parsearMarca(fin, 'fin');
  let du = null;
  if (!vacio(duracion)) {
    du = parsearMarca(duracion, 'duracion');
    if (du <= 0) throw new ErrorRango('duracion debe ser mayor que 0.');
  }
  if (fi !== null && fi <= ini) throw new ErrorRango('fin (' + fi + ' s) debe ser mayor que inicio (' + ini + ' s).');
  if (fi !== null && du !== null && Math.abs(fi - ini - du) > TOLERANCIA) throw new ErrorRango('inicio, fin y duracion no coinciden: da dos de los tres.');
  const largo = fi !== null ? r3(fi - ini) : du;
  if (largo !== null) {
    if (largo < RANGO_MIN_SEGUNDOS) throw new ErrorRango('El tramo es demasiado corto (minimo ' + RANGO_MIN_SEGUNDOS + ' s).');
    if (largo > max) throw new ErrorRango('El tramo dura ' + largo + ' s y el maximo es ' + max + ' s (cuida la CPU de la laptop; parte el video en tramos).');
  }
  return { inicio: ini, fin: largo === null ? null : r3(ini + largo), duracion: largo };
}

// ---------------------------------------------------------------------------
// Plan de produccion del canal STORIES (puro: sin disco, sin red, sin ffmpeg). Convierte el guion validado en lo que el render dibuja:
//   guion.partes[].narracion  -> voz en off (Piper) + subtitulos temporizados por frase
//   guion.partes[].tecnico[]  -> escenas: duracionSeg (reescalada a la duracion REAL de la voz), textoPantalla, efecto (visual + sonido)
//   ficha                     -> expediente en pantalla (CANALES.stories.ficha: foto, anio, lugar, datosClave) al inicio de cada parte
// Un video por (mercado x parte) y un video largo por mercado que concatena las partes EN ORDEN, en 9:16 heredado (sin render 16:9).
// La ficha y la voz van quemadas: es-US tiene su propio render (CAPAS_POR_IDIOMA). Un guion por mercado (el validador ya exige el idioma).
// ---------------------------------------------------------------------------
import { CANALES, ErrorCanal } from './canales.js';
import { MERCADOS, MERCADO_PRINCIPAL, normalizarMercado } from './mercados.js';

export class ErrorProduccion extends ErrorCanal {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorProduccion';
  }
}

export const EFECTOS_VISUALES = Object.freeze(['zoom_in', 'zoom_out', 'pan_izq', 'pan_der', 'fundido', 'ninguno']);
const ALIAS_VISUAL = { zoom: 'zoom_in', acercar: 'zoom_in', alejar: 'zoom_out', pan: 'pan_der', paneo: 'pan_der', fade: 'fundido', none: 'ninguno', nada: 'ninguno' };
const ROTACION = ['zoom_in', 'pan_der', 'zoom_out', 'pan_izq'];
export const COLA_SEG = 0.8;           // silencio final tras la ultima palabra
export const ESCENA_MIN_SEG = 0.6;
export const FACTOR_AVISO = [0.5, 2];  // si reescalar las escenas pasa de este rango, se avisa

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "zoom_in + whoosh" -> { visual: 'zoom_in', sonido: 'whoosh' }. El texto lo escribe el modelo: se normaliza y nunca se usa como ruta. */
export function normalizarEfecto(texto) {
  const tokens = sinAcentos(texto).replace(/[\s-]+/g, '_').split(/[+,;|/]+/).map((t) => t.replace(/^_+|_+$/g, '')).filter(Boolean);
  let visual = null;
  let sonido = null;
  for (const t of tokens) {
    const v = EFECTOS_VISUALES.includes(t) ? t : ALIAS_VISUAL[t];
    if (v) { visual = visual ?? v; continue; }
    if (/^[a-z0-9][a-z0-9_]{1,31}$/.test(t)) sonido = sonido ?? t.replace(/_/g, '-');
  }
  return { visual, sonido };
}

/** Parte el texto en lineas de hasta `max` caracteres (palabras enteras); como maximo `lineas`, con "..." si sobra. */
export function envolver(texto, max, lineas = 2) {
  const palabras = String(texto ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const salida = [];
  let actual = '';
  for (const p of palabras) {
    if (actual && (actual + ' ' + p).length > max) { salida.push(actual); actual = p; } else actual = actual ? actual + ' ' + p : p;
  }
  if (actual) salida.push(actual);
  if (salida.length <= lineas) return salida;
  const corto = salida.slice(0, lineas);
  corto[lineas - 1] = corto[lineas - 1].slice(0, Math.max(1, max - 3)).trimEnd() + '...';
  return corto;
}

/** Subtitulos temporizados por frase, repartidos por numero de caracteres sobre la duracion de la voz. */
export function subtitulos(narracion, duracionVoz, { inicio = 0.15, maxLinea = 26, maxLineas = 2 } = {}) {
  const frases = String(narracion ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+|(?<=[,;:])\s+(?=\S{4,}\s\S)/u).map((f) => f.trim()).filter(Boolean);
  const trozos = [];
  for (const f of frases) {
    const lineas = envolver(f, maxLinea, 99);
    for (let i = 0; i < lineas.length; i += maxLineas) trozos.push(lineas.slice(i, i + maxLineas).join('\n'));
  }
  const total = trozos.reduce((s, t) => s + t.replace(/\n/g, ' ').length, 0) || 1;
  const util = Math.max(0.5, duracionVoz - inicio);
  let t0 = inicio;
  return trozos.map((texto, i) => {
    const dur = (texto.replace(/\n/g, ' ').length / total) * util;
    const fila = { inicio: Math.round(t0 * 1000) / 1000, fin: Math.round((i === trozos.length - 1 ? inicio + util : t0 + dur) * 1000) / 1000, texto };
    t0 += dur;
    return fila;
  });
}

const ETIQUETAS = {
  en: { expediente: 'FILE', anio: 'YEAR', lugar: 'PLACE', datos: 'KEY FACTS' },
  es: { expediente: 'EXPEDIENTE', anio: 'AÑO', lugar: 'LUGAR', datos: 'DATOS CLAVE' },
};

/** Tarjeta de expediente (CANALES.stories.ficha.campos) con los hechos de la ficha. null si la ficha no tiene nada que mostrar. */
export function fichaEnPantalla(ficha, mercado) {
  const cfg = CANALES.stories.ficha;
  const et = ETIQUETAS[MERCADOS[normalizarMercado(mercado)].idioma];
  const primero = (tipo) => (ficha.hechos || []).find((h) => h.tipo === tipo);
  const fecha = primero('fecha');
  const anio = fecha ? (fecha.valor.match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || [fecha.valor])[0] : null;
  const lugar = primero('lugar');
  const persona = primero('persona');
  const datos = (ficha.hechos || []).filter((h) => h.tipo === 'cifra' || h.tipo === 'dato').slice(0, 3).map((h) => h.valor.slice(0, 40));
  const campos = {};
  if (cfg.campos.includes('anio') && anio) campos.anio = { etiqueta: et.anio, valor: anio };
  if (cfg.campos.includes('lugar') && lugar) campos.lugar = { etiqueta: et.lugar, valor: lugar.valor.slice(0, 40) };
  if (cfg.campos.includes('datosClave') && datos.length) campos.datosClave = { etiqueta: et.datos, valor: datos };
  const lineas = [];
  for (const c of cfg.campos) {
    if (!campos[c]) continue;
    lineas.push(c === 'datosClave' ? et.datos + ': ' + campos[c].valor.join(' · ') : campos[c].etiqueta + ': ' + campos[c].valor);
  }
  if (!lineas.length && !ficha.foto) return null;
  return { etiqueta: et.expediente, nombre: (persona ? persona.valor : ficha.titulo).slice(0, 40), lineas, foto: cfg.campos.includes('foto') && ficha.foto ? ficha.foto : null, segundos: cfg.segundos, posicion: cfg.posicion };
}

/**
 * Plan de UNA parte. `duracionVoz` es la duracion REAL del WAV de Piper: el video dura voz + COLA_SEG y las escenas del guion se
 * reescalan proporcionalmente (el modelo no sabe cuanto tarda en decirse el texto). Devuelve { n, duracionTotal, escenas, subtitulos, ficha, avisos }.
 */
export function planDeParte({ parte, ficha, mercado, duracionVoz }) {
  if (!parte || !Array.isArray(parte.tecnico) || parte.tecnico.length === 0) throw new ErrorProduccion('La parte no tiene escenas (tecnico).');
  if (!(duracionVoz > 0)) throw new ErrorProduccion('Falta la duracion de la voz de la parte ' + parte.n + '.');
  const avisos = [];
  const total = Math.round((duracionVoz + COLA_SEG) * 1000) / 1000;
  const suma = parte.tecnico.reduce((s, e) => s + (Number(e.duracionSeg) > 0 ? Number(e.duracionSeg) : 0), 0);
  if (!(suma > 0)) throw new ErrorProduccion('Las escenas de la parte ' + parte.n + ' no tienen duracion.');
  const factor = total / suma;
  if (factor < FACTOR_AVISO[0] || factor > FACTOR_AVISO[1]) avisos.push('Parte ' + parte.n + ': las escenas del guion suman ' + Math.round(suma) + ' s y la voz dura ' + Math.round(duracionVoz) + ' s; se reescalaron x' + factor.toFixed(2) + '.');
  let t = 0;
  const escenas = parte.tecnico.map((e, i) => {
    const ultima = i === parte.tecnico.length - 1;
    const dur = ultima ? Math.round((total - t) * 1000) / 1000 : Math.max(ESCENA_MIN_SEG, Math.round(Number(e.duracionSeg) * factor * 1000) / 1000);
    const { visual, sonido } = normalizarEfecto(e.efecto);
    const fila = { inicio: Math.round(t * 1000) / 1000, duracion: Math.max(ESCENA_MIN_SEG, dur), textoPantalla: envolver(e.textoPantalla, 18, 3).join('\n'), visual: visual ?? ROTACION[i % ROTACION.length], sonido };
    t += fila.duracion;
    return fila;
  });
  const exceso = t - total;
  if (exceso > 0.001) escenas[escenas.length - 1].duracion = Math.max(ESCENA_MIN_SEG, Math.round((escenas[escenas.length - 1].duracion - exceso) * 1000) / 1000);
  const fin = escenas.reduce((s, e) => s + e.duracion, 0);
  return { n: parte.n, duracionTotal: Math.round(fin * 1000) / 1000, escenas, subtitulos: subtitulos(parte.narracion, duracionVoz), ficha: fichaEnPantalla(ficha, mercado), avisos };
}

const slug = (m) => m.toLowerCase();

/**
 * Plan de produccion de una serie: `entradas` = [{ mercado, ficha, guion }] (un guion ya validado por mercado). Devuelve, por mercado,
 * el nombre de cada video de parte y del largo. Nombres: stories-<id>-<mercado>-p<N>.mp4 y stories-<id>-<mercado>-largo.mp4.
 */
export function planDeProduccion({ id, canal = 'stories', entradas } = {}) {
  if (canal !== 'stories') throw new ErrorProduccion('La produccion automatica de video solo esta lista para el canal stories (sports y news llegan en la Parte 6).');
  const limpio = String(id ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(limpio)) throw new ErrorProduccion('Id de produccion no valido.');
  if (!Array.isArray(entradas) || entradas.length === 0) throw new ErrorProduccion('Falta al menos un guion por mercado.');
  const vistos = new Set();
  const mercados = entradas.map((e) => {
    const m = normalizarMercado(e && e.mercado);
    if (vistos.has(m)) throw new ErrorProduccion('Mercado repetido: ' + m + '. Solo un guion por mercado.');
    vistos.add(m);
    if (!e.ficha || e.ficha.canal !== 'stories') throw new ErrorProduccion('El guion de ' + m + ' no es del canal stories.');
    if (e.ficha.mercado !== m) throw new ErrorProduccion('La ficha de ' + m + ' esta hecha para el mercado ' + e.ficha.mercado + '.');
    const partes = e.guion && Array.isArray(e.guion.partes) ? [...e.guion.partes].sort((a, b) => a.n - b.n) : [];
    if (!partes.length) throw new ErrorProduccion('El guion de ' + m + ' no tiene partes.');
    return {
      mercado: m, ficha: e.ficha, titulo: e.ficha.titulo,
      partes: partes.map((parte) => ({ n: parte.n, parte, archivo: 'stories-' + limpio + '-' + slug(m) + '-p' + parte.n + '.mp4' })),
      largo: { archivo: 'stories-' + limpio + '-' + slug(m) + '-largo.mp4' },
    };
  }).sort((a, b) => (a.mercado === MERCADO_PRINCIPAL ? -1 : 0) - (b.mercado === MERCADO_PRINCIPAL ? -1 : 0));
  const avisos = [];
  const base = mercados[0].partes.map((p) => p.n).join(',');
  for (const m of mercados.slice(1)) if (m.partes.map((p) => p.n).join(',') !== base) avisos.push('Los mercados no tienen las mismas partes (' + mercados[0].mercado + ': ' + base + '; ' + m.mercado + ': ' + m.partes.map((p) => p.n).join(',') + ').');
  return { id: limpio, canal, mercados, avisos, resumen: { renders: mercados.reduce((s, m) => s + m.partes.length, 0), concatenaciones: mercados.length } };
}

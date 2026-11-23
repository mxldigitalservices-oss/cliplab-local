// ---------------------------------------------------------------------------
// Mini Editor (Parte 7A): modelo de capas y rangos. ADAPTA lo que ya existe, no lo reescribe:
//   - regiones de difuminado  -> el formato { version: 1, regiones } de src/difuminados.js (mismas fracciones del cuadro de salida)
//   - formatos de salida      -> vertical 1080x1920 / horizontal 1920x1080 de src/formatos.js
//   - rango del video fuente  -> src/rango.js (marcas, tope y minimo)
// y suma dos cosas nuevas, ambas opcionales y acotadas:
//   - capas PNG:  { id, etiqueta, archivo, x, y, escala, desde, hasta, activo }
//       x, y    esquina superior izquierda (fraccion del ancho / del alto del cuadro de salida)
//       escala  ancho de la capa como fraccion del ancho del cuadro (ESCALA.min..ESCALA.max); el alto sigue la proporcion del PNG
//       desde/hasta  segundos DESDE EL INICIO DEL TRAMO (null = todo el tramo), igual que los difuminados
//   - audio:      { archivo, volumen, offset, mezclar }   volumen 0..2, offset = segundos de retraso con que entra, mezclar = sumar al original
// Documento del editor (lo que el panel guarda y devuelve):
//   { fuente:{archivo, inicio?, fin?, duracion?}, formato, modo, difuminados:{version:1, regiones}, capas:[...], audio, calidad? }
//
// Los archivos (video, PNG, audio) SOLO pueden estar en tres carpetas: clips, subidas y assets. Se resuelven con realpath, asi que ni ".."
// ni un enlace simbolico que apunte afuera pasan. Lo que sale hacia el panel nunca lleva rutas absolutas del servidor.
// Sin red y sin ffmpeg: lo unico que toca es disco (lectura de cabeceras de 24 bytes, tamanos y nombres).
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { dirUploads } from './upload.js';
import { FORMATOS, normalizarFormato } from './formatos.js';
import { geometriaDeDifuminados, resolverDifuminados, MAX_TIEMPO } from './difuminados.js';
import { normalizarRango } from './rango.js';

export class ErrorEditor extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorEditor';
    this.status = 400;
  }
}

export const VERSION = 1;
export const MAX_CAPAS = 4;
export const ESCALA = Object.freeze({ min: 0.05, max: 1, defecto: 0.2 });
export const VOLUMEN = Object.freeze({ min: 0, max: 2, defecto: 1 });
export const OFFSET_AUDIO_MAX = 120;
export const MAX_ETIQUETA = 24;
export const PNG_MAX_BYTES = 5 * 1024 * 1024;
export const PNG_MAX_LADO = 4096;
export const AUDIO_MAX_BYTES = 60 * 1024 * 1024;
export const MODOS = Object.freeze(['recorte', 'blur']);
export const CALIDADES = Object.freeze({ rapida: 'veryfast', mejor: 'faster' });   // nunca mas lento que "faster": cuida la CPU de la laptop

const EXT_VIDEO = /\.(mp4|mov|mkv|webm)$/i;
const EXT_PNG = /\.png$/i;
const EXT_AUDIO = /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i;
const NOMBRE_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r4 = (n) => Math.round(n * 10000) / 10000;
const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const vacio = (v) => v === undefined || v === null || v === '';
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function numero(valor, nombre, contexto) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ErrorEditor(contexto + ': ' + nombre + ' debe ser un numero.');
  return n;
}

function tiempo(valor, nombre, contexto) {
  if (vacio(valor)) return null;
  const n = numero(valor, nombre, contexto);
  if (n < 0 || n > MAX_TIEMPO) throw new ErrorEditor(contexto + ': ' + nombre + ' debe estar entre 0 y ' + MAX_TIEMPO + ' s.');
  return r4(n);
}

const textoCorto = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ETIQUETA);

function nombreDeArchivo(valor, contexto) {
  const t = String(valor ?? '').trim();
  if (!t || t.includes('\u0000')) throw new ErrorEditor(contexto + ': falta el archivo.');
  if (t.length > 300) throw new ErrorEditor(contexto + ': la ruta del archivo es demasiado larga.');
  return t;
}

// ---------------------------------------------------------------- estructura (pura)

/** Sanea UNA capa PNG (el id unico lo resuelve sanearEditor). Lanza ErrorEditor (400). */
export function sanearCapa(raw, indice = 0) {
  const contexto = 'Capa ' + (indice + 1);
  if (!objeto(raw)) throw new ErrorEditor(contexto + ' debe ser un objeto { archivo, x, y, escala }.');
  const archivo = nombreDeArchivo(raw.archivo, contexto);
  if (!EXT_PNG.test(archivo)) throw new ErrorEditor(contexto + ': solo se admiten imagenes PNG.');
  const escala = vacio(raw.escala) ? ESCALA.defecto : acotar(numero(raw.escala, 'escala', contexto), ESCALA.min, ESCALA.max);
  const x = vacio(raw.x) ? 0.05 : acotar(numero(raw.x, 'x', contexto), 0, 1);
  const y = vacio(raw.y) ? 0.05 : acotar(numero(raw.y, 'y', contexto), 0, 1);
  const desde = tiempo(raw.desde, 'desde', contexto);
  const hasta = tiempo(raw.hasta, 'hasta', contexto);
  if (desde !== null && hasta !== null && hasta <= desde) throw new ErrorEditor(contexto + ': hasta debe ser mayor que desde.');
  const id = typeof raw.id === 'string' && ID_VALIDO.test(raw.id.trim().toLowerCase()) ? raw.id.trim().toLowerCase() : '';
  return { id, etiqueta: textoCorto(raw.etiqueta), archivo, x: r4(x), y: r4(y), escala: r4(escala), desde, hasta, activo: raw.activo !== false && raw.activo !== 'false' };
}

/** Sanea la pista de audio. Vacio / null / activo:false = sin audio extra (null). */
export function sanearAudio(raw) {
  if (vacio(raw)) return null;
  if (!objeto(raw)) throw new ErrorEditor('El audio debe ser un objeto { archivo, volumen, offset }.');
  if (raw.activo === false || raw.activo === 'false') return null;
  const archivo = nombreDeArchivo(raw.archivo, 'Audio');
  if (!EXT_AUDIO.test(archivo)) throw new ErrorEditor('Audio: formato no admitido (usa mp3, wav, m4a, aac, ogg, opus o flac).');
  const volumen = vacio(raw.volumen) ? VOLUMEN.defecto : acotar(numero(raw.volumen, 'volumen', 'Audio'), VOLUMEN.min, VOLUMEN.max);
  const offset = vacio(raw.offset) ? 0 : acotar(numero(raw.offset, 'offset', 'Audio'), 0, OFFSET_AUDIO_MAX);
  return { archivo, volumen: r4(volumen), offset: r4(offset), mezclar: raw.mezclar !== false && raw.mezclar !== 'false' };
}

/**
 * Valida y normaliza el documento del editor SIN tocar disco. Devuelve
 *   { version, formato, modo, preset, fuente:{archivo, inicio, fin, duracion}, difuminados:{version, regiones}, capas, audio, avisos }
 * Los difuminados pasan por resolverDifuminados (mismo tope de regiones y de area que el resto del sistema); el rango por normalizarRango.
 */
export function sanearEditor(raw) {
  const c = objeto(raw);
  if (!c) throw new ErrorEditor('El cuerpo debe ser un objeto { fuente, formato, difuminados, capas, audio }.');
  const formato = normalizarFormato(c.formato);   // ErrorFormato (400): nunca se adivina
  const modo = vacio(c.modo) ? 'recorte' : String(c.modo).trim().toLowerCase();
  if (!MODOS.includes(modo)) throw new ErrorEditor('Encuadre no valido: ' + modo.slice(0, 12) + '. Usa ' + MODOS.join(' o ') + '.');
  const calidad = vacio(c.calidad) ? null : String(c.calidad).trim().toLowerCase();
  if (calidad !== null && !Object.hasOwn(CALIDADES, calidad)) throw new ErrorEditor('Calidad no valida: ' + calidad.slice(0, 12) + '. Usa ' + Object.keys(CALIDADES).join(' o ') + '.');

  const f = objeto(c.fuente);
  if (!f) throw new ErrorEditor('Falta la fuente { archivo, inicio?, fin? }.');
  const archivo = nombreDeArchivo(f.archivo, 'Fuente');
  const rango = normalizarRango(f);   // ErrorRango (400)

  const d = resolverDifuminados(c.difuminados, []);   // sin sugeridos: el editor parte de lo que el usuario dibuja
  const avisos = [...d.avisos];

  if (!vacio(c.capas) && !Array.isArray(c.capas)) throw new ErrorEditor('capas debe ser una lista.');
  const lista = Array.isArray(c.capas) ? c.capas : [];
  if (lista.length > MAX_CAPAS) throw new ErrorEditor('Demasiadas capas (' + lista.length + '): el maximo es ' + MAX_CAPAS + '.');
  const usados = new Set();
  let contador = 0;
  const capas = lista.map((r, i) => {
    const s = sanearCapa(r, i);
    let id = s.id;
    while (!id || usados.has(id)) id = 'c' + (++contador);
    usados.add(id);
    return { ...s, id };
  });
  const audio = sanearAudio(c.audio);

  if (rango.duracion !== null) {
    for (const r of d.regiones) if (r.activo && r.desde !== null && r.desde >= rango.duracion) avisos.push('El difuminado "' + (r.etiqueta || r.id) + '" empieza despues de que termina el tramo (' + rango.duracion + ' s): no se vera.');
    for (const k of capas) if (k.activo && k.desde !== null && k.desde >= rango.duracion) avisos.push('La capa "' + (k.etiqueta || k.id) + '" empieza despues de que termina el tramo (' + rango.duracion + ' s): no se vera.');
    if (audio && audio.offset >= rango.duracion) avisos.push('El audio entra en el segundo ' + audio.offset + ' y el tramo dura ' + rango.duracion + ' s: no se oira.');
  }

  return { version: VERSION, formato, modo, preset: calidad === null ? null : CALIDADES[calidad], fuente: { archivo, inicio: rango.inicio, fin: rango.fin, duracion: rango.duracion }, difuminados: { version: d.version, regiones: d.regiones }, capas, audio, avisos };
}

/** Pixeles de cada capa activa dentro del cuadro W x H (pares y siempre DENTRO del cuadro). `dim` = { ancho, alto } del PNG. */
export function geometriaDeCapas(capas, W, H) {
  return capas.filter((k) => k.activo).map((k) => {
    const razon = k.dim.alto / k.dim.ancho;
    let w = Math.min(W - (W % 2), par(k.escala * W));
    let h = par(w * razon);
    if (h > H) { h = H - (H % 2); w = Math.min(W - (W % 2), par(h / razon)); }
    let x = Math.round(k.x * W); x -= x % 2;
    let y = Math.round(k.y * H); y -= y % 2;
    x = Math.max(0, Math.min(x, W - w));
    y = Math.max(0, Math.min(y, H - h));
    return { ...k, px: { x, y, w, h } };
  });
}

// ---------------------------------------------------------------- carpetas permitidas y rutas seguras

/** { clips, subidas, assets }: rutas absolutas. Es la UNICA lista de carpetas desde donde el editor lee archivos. */
export function dirsPermitidos() {
  let subidas;
  try { subidas = dirUploads(); } catch { subidas = process.env.UPLOADS_DIR || path.join(process.env.DATA_DIR || '/tmp/cliplab-data', 'uploads'); }
  return { clips: path.resolve(config.clipsDir), subidas: path.resolve(subidas), assets: path.resolve(process.env.ASSETS_DIR || path.join(RAIZ, 'assets')) };
}

const PREFIJOS = Object.freeze([['/clips/', 'clips', true], ['/uploads/', 'subidas', true], ['/assets/', 'assets', false]]);
const dentroDe = (ruta, dir) => ruta === dir || ruta.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

/**
 * Resuelve un archivo pedido por el panel a una ruta ABSOLUTA real dentro de las carpetas permitidas.
 * Acepta "/clips/x.mp4", "/uploads/x.png", "/assets/banco/musica/calida/x.mp3" o una ruta absoluta dentro de ellas.
 *   claves      cuales carpetas valen ('clips' | 'subidas' | 'assets')
 *   extension   regex del tipo de archivo; etiqueta  nombre para el mensaje de error; maxBytes  tope de tamano
 * Los mensajes no incluyen la ruta del servidor (solo el nombre del archivo).
 */
export async function resolverArchivo(valor, { dirs = dirsPermitidos(), claves = ['clips', 'subidas', 'assets'], extension, etiqueta = 'archivo', maxBytes = Infinity } = {}) {
  const pedido = nombreDeArchivo(valor, etiqueta);
  const prefijo = PREFIJOS.find(([p]) => pedido.startsWith(p));
  let candidato = pedido;
  if (prefijo) {
    const [pre, clave, plano] = prefijo;
    if (!claves.includes(clave)) throw new ErrorEditor('El ' + etiqueta + ' no puede estar en ' + pre + '.');
    const resto = pedido.slice(pre.length);
    candidato = path.join(dirs[clave], plano ? path.basename(resto) : resto);
  }
  const absoluta = path.resolve(candidato);
  const raices = [];
  for (const clave of claves) { try { raices.push(await fs.realpath(dirs[clave])); } catch { /* carpeta inexistente */ } }
  let real;
  try { real = await fs.realpath(absoluta); } catch { throw new ErrorEditor('No existe el ' + etiqueta + ': ' + path.basename(absoluta).slice(0, 80)); }
  if (!raices.some((d) => dentroDe(real, d))) throw new ErrorEditor('El ' + etiqueta + ' debe estar en las carpetas de clips, subidas o assets.');
  if (extension && !extension.test(real)) throw new ErrorEditor('El ' + etiqueta + ' no tiene un formato admitido: ' + path.basename(real).slice(0, 80));
  const info = await fs.stat(real);
  if (!info.isFile()) throw new ErrorEditor('El ' + etiqueta + ' no es un archivo.');
  if (info.size > maxBytes) throw new ErrorEditor('El ' + etiqueta + ' pesa ' + Math.round(info.size / 1048576) + ' MB y el maximo es ' + Math.round(maxBytes / 1048576) + ' MB.');
  return real;
}

/** Ancho y alto de un PNG leyendo SOLO la cabecera (24 bytes): ni decodifica ni carga la imagen en memoria. */
export async function leerDimensionesPng(ruta) {
  const nombre = path.basename(ruta).slice(0, 80);
  const fh = await fs.open(ruta, 'r');
  try {
    const cabecera = Buffer.alloc(24);
    const { bytesRead } = await fh.read(cabecera, 0, 24, 0);
    if (bytesRead < 24 || !cabecera.subarray(0, 8).equals(FIRMA_PNG) || cabecera.toString('ascii', 12, 16) !== 'IHDR') throw new ErrorEditor('"' + nombre + '" no es un PNG valido.');
    const ancho = cabecera.readUInt32BE(16);
    const alto = cabecera.readUInt32BE(20);
    if (!ancho || !alto || ancho > PNG_MAX_LADO || alto > PNG_MAX_LADO) throw new ErrorEditor('"' + nombre + '" mide ' + ancho + 'x' + alto + ' y el maximo es ' + PNG_MAX_LADO + 'x' + PNG_MAX_LADO + ' px.');
    return { ancho, alto };
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------- plan completo (con disco)

/**
 * Documento -> plan listo para renderizar. Valida la estructura (sanearEditor) y TODOS los archivos antes de gastar CPU.
 * Devuelve el documento saneado mas: ancho, alto, entrada (ruta real), geometria (difuminados en pixeles),
 * capas[{..., ruta, dim, px}] (solo las activas, en orden de apilado) y audio con ruta. Contiene rutas del servidor: para el panel usa vistaPublica().
 */
export async function planDeEditor(raw, { dirs = dirsPermitidos() } = {}) {
  const s = sanearEditor(raw);
  const fmt = FORMATOS[s.formato];
  const entrada = await resolverArchivo(s.fuente.archivo, { dirs, claves: ['clips', 'subidas'], extension: EXT_VIDEO, etiqueta: 'video fuente' });
  const avisos = [...s.avisos];

  const conDim = [];
  for (const k of s.capas) {
    const ruta = await resolverArchivo(k.archivo, { dirs, extension: EXT_PNG, etiqueta: 'PNG de la capa "' + (k.etiqueta || k.id) + '"', maxBytes: PNG_MAX_BYTES });
    conDim.push({ ...k, ruta, dim: await leerDimensionesPng(ruta) });
  }
  const capas = geometriaDeCapas(conDim, fmt.ancho, fmt.alto);
  for (const k of capas) {
    const x0 = Math.round(k.x * fmt.ancho);
    const y0 = Math.round(k.y * fmt.alto);
    if (Math.abs(k.px.x - x0) > 2 || Math.abs(k.px.y - y0) > 2) avisos.push('La capa "' + (k.etiqueta || k.id) + '" se acomodo dentro del cuadro porque se salia.');
  }

  let audio = null;
  if (s.audio) audio = { ...s.audio, ruta: await resolverArchivo(s.audio.archivo, { dirs, extension: EXT_AUDIO, etiqueta: 'audio', maxBytes: AUDIO_MAX_BYTES }) };

  return { ...s, avisos, ancho: fmt.ancho, alto: fmt.alto, entrada, geometria: geometriaDeDifuminados(s.difuminados.regiones, fmt.ancho, fmt.alto), capas, audio };
}

/** Lo que se le devuelve al panel: la estructura editable + pixeles de cada elemento. Sin rutas absolutas del servidor. */
export function vistaPublica(plan) {
  return {
    version: plan.version, formato: plan.formato, ancho: plan.ancho, alto: plan.alto, modo: plan.modo, fuente: plan.fuente,
    difuminados: plan.difuminados,
    capas: plan.capas.map(({ ruta, px, ...resto }) => resto),
    audio: plan.audio ? { archivo: plan.audio.archivo, volumen: plan.audio.volumen, offset: plan.audio.offset, mezclar: plan.audio.mezclar } : null,
    pixeles: {
      difuminados: plan.geometria.map((g) => ({ id: g.id, ...g.px })),
      capas: plan.capas.map((k) => ({ id: k.id, ...k.px })),
    },
    avisos: plan.avisos,
  };
}

// ---------------------------------------------------------------- recursos que el panel puede elegir

async function recorrer(dir, { prefijo, extension, profundidad = 3, tope = 200 }) {
  const salida = [];
  async function entrar(actual, relativo, nivel) {
    let entradas;
    try { entradas = await fs.readdir(actual, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (salida.length >= tope) return;
      if (e.name.startsWith('.') || !NOMBRE_SEGURO.test(e.name)) continue;
      const rel = relativo ? relativo + '/' + e.name : e.name;
      if (e.isDirectory() && nivel < profundidad) { await entrar(path.join(actual, e.name), rel, nivel + 1); continue; }
      if (!e.isFile() || !extension.test(e.name)) continue;   // enlaces simbolicos y carpetas no se listan
      try {
        const info = await fs.lstat(path.join(actual, e.name));
        salida.push({ ruta: prefijo + rel, nombre: e.name, tamano: info.size, _t: info.mtimeMs });
      } catch { /* desaparecio mientras se listaba */ }
    }
  }
  await entrar(dir, '', 0);
  return salida;
}

/** PNG y audios disponibles (subidas y assets), con las dimensiones de cada PNG. Solo nombres y cabeceras: nada de contenido. */
export async function listarRecursos({ dirs = dirsPermitidos(), limite = 100 } = {}) {
  const pngs = [];
  const audios = [];
  for (const [origen, prefijo, dir] of [['subidas', '/uploads/', dirs.subidas], ['assets', '/assets/', dirs.assets]]) {
    for (const r of await recorrer(dir, { prefijo, extension: EXT_PNG })) {
      if (r.tamano > PNG_MAX_BYTES) continue;
      try { pngs.push({ ...r, origen, ...(await leerDimensionesPng(path.join(dir, r.ruta.slice(prefijo.length)))) }); } catch { /* PNG danado: no se ofrece */ }
    }
    for (const r of await recorrer(dir, { prefijo, extension: EXT_AUDIO })) if (r.tamano <= AUDIO_MAX_BYTES) audios.push({ ...r, origen });
  }
  const orden = (a, b) => b._t - a._t;
  const limpio = ({ _t, ...resto }) => resto;
  return { pngs: pngs.sort(orden).slice(0, limite).map(limpio), audios: audios.sort(orden).slice(0, limite).map(limpio) };
}

export const limitesEditor = () => ({
  maxCapas: MAX_CAPAS, escala: { ...ESCALA }, volumen: { ...VOLUMEN }, offsetAudioMax: OFFSET_AUDIO_MAX, pngMaxBytes: PNG_MAX_BYTES, pngMaxLado: PNG_MAX_LADO,
  audioMaxBytes: AUDIO_MAX_BYTES, calidades: Object.keys(CALIDADES), modos: [...MODOS],
});

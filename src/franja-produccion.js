// ---------------------------------------------------------------------------
// Produccion de SPORTS / NEWS desde un video fuente: plan (franja-plan.js) -> un render por mercado (franja-render.js) -> clips en el store
// (para descargar y publicar a mano). Todo el render va dentro del candado 'ffmpeg' de exclusion.js: nunca a la vez que Ollama.
// La fuente SOLO puede estar en las carpetas permitidas (clips ya generados y subidas): nada de rutas arbitrarias del servidor.
// Salida: <clipsDir>/<canal>-<id>-<mercado>.mp4 (horizontal agrega -16x9). Las dependencias (renderizar, existe) son inyectables para probar
// sin FFmpeg.
// Cancelar (signal) es LIMPIO: FFmpeg se detiene (run.js), el candado se libera, la carpeta temporal se borra y los videos que esta produccion
// ya habia movido a clipsDir se eliminan (no quedan huerfanos sin clip en el store).
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';
import { elegirFuente, renderizarFranja } from './engine/franja-render.js';
import { ErrorFranja, planDeProduccionFranja } from './franja-plan.js';
import { MERCADO_PRINCIPAL } from './mercados.js';
import { dirUploads } from './upload.js';

const URL_DE = (nombre) => '/clips/' + nombre;
const MENSAJE_CANCELADA = 'Produccion cancelada.';
const EXT_VIDEO = /\.(mp4|mov|mkv|webm)$/i;
const NOMBRE_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

export const dirsFuentePorDefecto = () => {
  let subidas;
  try { subidas = dirUploads(); } catch { subidas = process.env.UPLOADS_DIR || path.join(process.env.DATA_DIR || '/tmp/cliplab-data', 'uploads'); }
  return [config.clipsDir, subidas].map((d) => path.resolve(d));
};

async function moverFinal(origen, destino) {
  try { await fs.rename(origen, destino); } catch { await fs.copyFile(origen, destino); await fs.rm(origen, { force: true }); }
}

const dentroDe = (ruta, dir) => ruta === dir || ruta.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

/**
 * Resuelve la fuente a una ruta ABSOLUTA real (sin symlinks que escapen) dentro de las carpetas permitidas.
 * Acepta una ruta de archivo, la URL local de un clip ("/clips/nombre.mp4") o una subida ("/uploads/nombre.mp4").
 */
export async function resolverFuente(archivo, dirs = dirsFuentePorDefecto()) {
  let pedido = String(archivo ?? '').trim();
  if (!pedido || pedido.includes('\u0000')) throw new ErrorFranja('Ruta de fuente vacia o invalida.');
  if (pedido.startsWith('/clips/')) pedido = path.join(config.clipsDir, path.basename(pedido));
  else if (pedido.startsWith('/uploads/')) pedido = path.join(dirs[1] ?? dirsFuentePorDefecto()[1], path.basename(pedido));
  const absoluta = path.resolve(pedido);
  const reales = [];
  for (const d of dirs) { try { reales.push(await fs.realpath(d)); } catch { /* carpeta inexistente */ } }
  let real;
  try { real = await fs.realpath(absoluta); } catch { throw new ErrorFranja('No existe el video fuente: ' + path.basename(absoluta).slice(0, 80)); }
  if (!reales.some((d) => dentroDe(real, d))) throw new ErrorFranja('La fuente debe estar en las carpetas de clips o de subidas.');
  const st = await fs.stat(real);
  if (!st.isFile()) throw new ErrorFranja('La fuente no es un archivo.');
  return real;
}

/**
 * Videos que se pueden usar como fuente (clips ya hechos y subidas), los mas nuevos primero. Solo lee nombres y tamanos (nada de contenido):
 * [{ ruta: '/clips/x.mp4' | '/uploads/x.mp4', nombre, origen: 'clips'|'subidas', tamano, modificado }]. Ignora ocultos, enlaces y carpetas.
 */
export async function listarFuentes({ dirs = dirsFuentePorDefecto(), limite = 100 } = {}) {
  const origenes = [['clips', '/clips/', dirs[0]], ['subidas', '/uploads/', dirs[1]]];
  const lista = [];
  for (const [origen, prefijo, dir] of origenes) {
    if (!dir) continue;
    let nombres = [];
    try { nombres = await fs.readdir(dir); } catch { continue; }
    for (const nombre of nombres) {
      if (nombre.startsWith('.') || !EXT_VIDEO.test(nombre) || !NOMBRE_SEGURO.test(nombre)) continue;
      try {
        const info = await fs.lstat(path.join(dir, nombre));
        if (!info.isFile()) continue;
        lista.push({ ruta: prefijo + nombre, nombre, origen, tamano: info.size, modificado: new Date(info.mtimeMs).toISOString(), _t: info.mtimeMs });
      } catch { /* desaparecio mientras se listaba */ }
    }
  }
  lista.sort((a, b) => b._t - a._t);
  return lista.slice(0, Math.max(1, limite)).map(({ _t, ...resto }) => resto);
}

/** Cuenta los .mp4 de la carpeta de clips (es lo que poda el pipeline con MAX_CLIPS_STORED). */
export async function contarVideos(dir = config.clipsDir) {
  try { return (await fs.readdir(dir)).filter((n) => n.endsWith('.mp4')).length; } catch { return 0; }
}

/** Aviso (texto) si agregar `nuevos` videos pasa el limite MAX_CLIPS_STORED y se borrarian los mas viejos; null si cabe. */
export function avisoDeCapacidad({ actuales, nuevos, max = config.maxClipsStored }) {
  const total = actuales + nuevos;
  if (total <= max) return null;
  return 'La carpeta guarda hasta ' + max + ' videos (MAX_CLIPS_STORED) y con esta produccion habria ' + total + ': el pipeline borrara los ' + (total - max) + ' mas viejos. Sube MAX_CLIPS_STORED si quieres conservarlos.';
}

/**
 * entradas: [{ mercado, titulo, fuente:{archivo,inicio?,fin?,duracion?,marcas?}, difuminados?, posicionTitulo?, modo? }].
 * opciones: { id, canal, formato?, signal, avance(etapa, %), dirSalida, dirTemporal, dirsFuente, deps:{ renderizar, resolver, fuente }, render:{ hilos, preset, crf } }
 * Devuelve { id, canal, formato, avisos, mercados:[{ mercado, titulo, archivo, url, duracion }] }.
 */
export async function producirFranja({ id, canal, formato, entradas, signal, avance = () => {}, dirSalida = config.clipsDir, dirTemporal, dirsFuente, deps = {}, render = {} } = {}) {
  const d = { renderizar: renderizarFranja, resolver: (a) => resolverFuente(a, dirsFuente), ...deps };
  const plan = planDeProduccionFranja({ id, canal, formato, entradas });
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'franja', plan.canal + '-' + plan.id);
  const fuenteLetra = deps.fuente !== undefined ? deps.fuente : await elegirFuente();
  await fs.mkdir(dirSalida, { recursive: true });
  const avisos = [...plan.avisos];

  // Se validan TODAS las fuentes antes de gastar CPU en el primer render.
  const rutas = [];
  for (const m of plan.mercados) rutas.push(await d.resolver(m.fuente.archivo));

  await fs.rm(trabajo, { recursive: true, force: true });
  await fs.mkdir(trabajo, { recursive: true });
  const creados = [];   // videos finales ya movidos a dirSalida por ESTA produccion
  try {
    return await exclusion.ejecutar('ffmpeg', async () => {
      const resultados = [];
      for (const [i, m] of plan.mercados.entries()) {
        if (signal && signal.aborted) throw new Error(MENSAJE_CANCELADA);
        avance(m.mercado + ': render con difuminados y titulo', (i / plan.mercados.length) * 100);
        const temporal = path.join(trabajo, m.archivo);
        await d.renderizar({ dirTrabajo: path.join(trabajo, 'w-' + m.mercado), entrada: rutas[i], salida: temporal, franja: m.franja, inicio: m.fuente.inicio, duracion: m.fuente.duracion, modo: m.modo, fuente: fuenteLetra, signal, ...render });
        if (signal && signal.aborted) throw new Error(MENSAJE_CANCELADA);
        const destino = path.join(dirSalida, m.archivo);
        await moverFinal(temporal, destino);
        creados.push(destino);
        resultados.push({ mercado: m.mercado, titulo: m.titulo, archivo: m.archivo, url: URL_DE(m.archivo), duracion: m.fuente.duracion });
      }
      avance('Listo', 100);
      return { id: plan.id, canal: plan.canal, formato: plan.formato, avisos, mercados: resultados };
    }, { signal });
  } catch (error) {
    for (const f of creados) await fs.rm(f, { force: true }).catch(() => {});
    if (signal && signal.aborted && !(error instanceof Error && error.message === MENSAJE_CANCELADA)) {
      const cancelada = new Error(MENSAJE_CANCELADA);
      cancelada.cause = error;
      throw cancelada;
    }
    throw error;
  } finally {
    await fs.rm(trabajo, { recursive: true, force: true });
  }
}

/** Crea UN clip en el store con el archivo de cada mercado (`url` = mercado principal). `store` se inyecta (encolar/completar). */
export function registrarClipsFranja({ store, resultado }) {
  const principal = resultado.mercados.find((m) => m.mercado === MERCADO_PRINCIPAL) || resultado.mercados[0];
  const archivos = Object.fromEntries(resultado.mercados.map((m) => [m.mercado, m.url]));
  const clip = store.encolar(resultado.canal + ':' + resultado.id, { origen: resultado.canal });
  store.completar(clip.id, { titulo: principal.titulo, url: principal.url, archivos, duracion: principal.duracion ?? null, canal: resultado.canal, proyecto: resultado.id, formato: resultado.formato ?? 'vertical' });
  return [clip.id];
}

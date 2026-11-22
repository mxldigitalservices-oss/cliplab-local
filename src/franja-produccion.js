// ---------------------------------------------------------------------------
// Produccion de SPORTS / NEWS desde un video fuente: plan (franja-plan.js) -> un render por mercado (franja-render.js) -> clips en el store
// (para descargar y publicar a mano). Todo el render va dentro del candado 'ffmpeg' de exclusion.js: nunca a la vez que Ollama.
// La fuente SOLO puede estar en las carpetas permitidas (clips ya generados y subidas): nada de rutas arbitrarias del servidor.
// Salida: <clipsDir>/<canal>-<id>-<mercado>.mp4. Las dependencias (renderizar, existe) son inyectables para probar sin FFmpeg.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';
import { elegirFuente, renderizarFranja } from './engine/franja-render.js';
import { ErrorFranja, planDeProduccionFranja } from './franja-plan.js';
import { MERCADO_PRINCIPAL } from './mercados.js';

const URL_DE = (nombre) => '/clips/' + nombre;

export const dirsFuentePorDefecto = () => [
  config.clipsDir,
  process.env.UPLOADS_DIR || path.join(process.env.DATA_DIR || '/tmp/cliplab-data', 'uploads'),
].map((d) => path.resolve(d));

async function moverFinal(origen, destino) {
  try { await fs.rename(origen, destino); } catch { await fs.copyFile(origen, destino); await fs.rm(origen, { force: true }); }
}

const dentroDe = (ruta, dir) => ruta === dir || ruta.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

/**
 * Resuelve la fuente a una ruta ABSOLUTA real (sin symlinks que escapen) dentro de las carpetas permitidas.
 * Acepta una ruta de archivo o la URL local de un clip ("/clips/nombre.mp4").
 */
export async function resolverFuente(archivo, dirs = dirsFuentePorDefecto()) {
  let pedido = String(archivo ?? '').trim();
  if (!pedido || pedido.includes('\u0000')) throw new ErrorFranja('Ruta de fuente vacia o invalida.');
  if (pedido.startsWith('/clips/')) pedido = path.join(config.clipsDir, path.basename(pedido));
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
 * entradas: [{ mercado, titulo, fuente:{archivo,inicio?,duracion?}, posiciones?, modo? }]. opciones: { id, canal, signal, avance(etapa, %),
 *   dirSalida, dirTemporal, dirsFuente, deps:{ renderizar, resolver, fuente }, render:{ hilos, preset, crf } }
 * Devuelve { id, canal, avisos, mercados:[{ mercado, titulo, archivo, url, duracion }] }.
 */
export async function producirFranja({ id, canal, entradas, signal, avance = () => {}, dirSalida = config.clipsDir, dirTemporal, dirsFuente, deps = {}, render = {} } = {}) {
  const d = { renderizar: renderizarFranja, resolver: (a) => resolverFuente(a, dirsFuente), ...deps };
  const plan = planDeProduccionFranja({ id, canal, entradas });
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'franja', plan.canal + '-' + plan.id);
  const fuenteLetra = deps.fuente !== undefined ? deps.fuente : await elegirFuente();
  await fs.mkdir(dirSalida, { recursive: true });
  const avisos = [...plan.avisos];

  // Se validan TODAS las fuentes antes de gastar CPU en el primer render.
  const rutas = [];
  for (const m of plan.mercados) rutas.push(await d.resolver(m.fuente.archivo));

  await fs.rm(trabajo, { recursive: true, force: true });
  await fs.mkdir(trabajo, { recursive: true });
  try {
    return await exclusion.ejecutar('ffmpeg', async () => {
      const resultados = [];
      for (const [i, m] of plan.mercados.entries()) {
        if (signal && signal.aborted) throw new Error('Produccion cancelada.');
        avance(m.mercado + ': render con franja', (i / plan.mercados.length) * 100);
        const temporal = path.join(trabajo, m.archivo);
        await d.renderizar({ dirTrabajo: path.join(trabajo, 'w-' + m.mercado), entrada: rutas[i], salida: temporal, franja: m.franja, inicio: m.fuente.inicio, duracion: m.fuente.duracion, modo: m.modo, fuente: fuenteLetra, signal, ...render });
        await moverFinal(temporal, path.join(dirSalida, m.archivo));
        resultados.push({ mercado: m.mercado, titulo: m.titulo, archivo: m.archivo, url: URL_DE(m.archivo), duracion: m.fuente.duracion });
      }
      avance('Listo', 100);
      return { id: plan.id, canal: plan.canal, avisos, mercados: resultados };
    }, { signal });
  } finally {
    await fs.rm(trabajo, { recursive: true, force: true });
  }
}

/** Crea UN clip en el store con el archivo de cada mercado (`url` = mercado principal). `store` se inyecta (encolar/completar). */
export function registrarClipsFranja({ store, resultado }) {
  const principal = resultado.mercados.find((m) => m.mercado === MERCADO_PRINCIPAL) || resultado.mercados[0];
  const archivos = Object.fromEntries(resultado.mercados.map((m) => [m.mercado, m.url]));
  const clip = store.encolar(resultado.canal + ':' + resultado.id, { origen: resultado.canal });
  store.completar(clip.id, { titulo: principal.titulo, url: principal.url, archivos, duracion: principal.duracion ?? null, canal: resultado.canal, proyecto: resultado.id });
  return [clip.id];
}

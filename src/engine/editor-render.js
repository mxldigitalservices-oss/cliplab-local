// ---------------------------------------------------------------------------
// Render del Mini Editor (Parte 7A). Toma el plan de src/editor-capas.js y lo convierte en UN grafo de filtros FFmpeg de una sola pasada:
//   tramo (-ss/-t) -> base 9:16 / 16:9 (recorte centrado o fondo desenfocado) -> regiones de difuminado (con `enable` desde/hasta)
//   -> capas PNG (overlay, con `enable`) -> audio opcional (volumen, retraso y mezcla con el original o reemplazo).
// CPU libx264 con preset veryfast / faster como maximo (laptop de 8 GB y 4 hilos): los difuminados trabajan sobre un recorte reducido,
// los PNG se escalan una sola vez y nada se carga entero en memoria. No toca pipeline.js, render.js ni franja-render.js: la logica de la
// base y de los difuminados es la misma que la de franja-render.js (se repite a proposito para no tocar un modulo que ya funciona).
//   construirEditor(opciones)      funcion pura -> { args }          (se prueba sin ffmpeg)
//   construirVistaPrevia(opciones) funcion pura -> { args }          (un solo fotograma, JPEG reducido, con TODO el grafo aplicado)
//   producirEditor(...)            plan -> video final dentro del candado 'ffmpeg' de exclusion.js, con cancelacion limpia
//   previsualizarEditor(...)       plan -> fotograma JPEG en base64 (tambien dentro del candado)
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { run } from '../utils/run.js';
import { exclusion } from './exclusion.js';
import { ErrorEditor, planDeEditor } from '../editor-capas.js';

const MENSAJE_CANCELADA = 'Produccion cancelada.';
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const PRESETS_PERMITIDOS = Object.freeze(['ultrafast', 'superfast', 'veryfast', 'faster']);
const presetSeguro = (p) => (PRESETS_PERMITIDOS.includes(p) ? p : 'veryfast');
const seg = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
const dentroDeTiempo = (desde, hasta) => (desde === null || desde === undefined) && (hasta === null || hasta === undefined)
  ? ''
  : `:enable='between(t,${seg(desde ?? 0)},${seg(hasta ?? 86400)})'`;

/** Duracion final del tramo: la pedida, o lo que queda del video desde `inicio` (si se pudo medir). */
export function duracionDelTramo(plan, duracionTotal = null) {
  const { inicio, duracion } = plan.fuente;
  if (duracionTotal === null || duracionTotal === undefined) return duracion;
  const quedan = Math.max(0, duracionTotal - inicio);
  return duracion === null ? quedan : Math.min(duracion, quedan);
}

/** Cadena de filtros de video comun al render y a la vista previa. Devuelve { filtros, ultimo } (ultimo = etiqueta de la salida de video). */
function grafoDeVideo(plan, { desplazamiento = 0 } = {}) {
  const W = plan.ancho;
  const H = plan.alto;
  const filtros = [];
  // Con vista previa el fotograma se saca de un punto del video: se desplaza la linea de tiempo para que `enable` use el tiempo real del tramo.
  const comun = desplazamiento > 0 ? `setpts=PTS-STARTPTS+${seg(desplazamiento)}/TB,fps=30` : 'setpts=PTS-STARTPTS,fps=30';

  if (plan.modo === 'blur') {
    filtros.push(`[0:v]${comun},split=2[a][b]`);
    filtros.push(`[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},scale=${W / 8}:${H / 8},boxblur=4:2,scale=${W}:${H},setsar=1[bg]`);
    filtros.push(`[b]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg]`);
    filtros.push('[bg][fg]overlay=(W-w)/2:(H-h)/2[base]');
  } else {
    filtros.push(`[0:v]${comun},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[base]`);
  }
  let ultimo = 'base';

  // Difuminados: cada rectangulo se recorta, se reduce, se desenfoca y se pega en su lugar (el resto del cuadro queda intacto).
  const regiones = plan.geometria;
  if (regiones.length) {
    filtros.push(`[base]split=${regiones.length + 1}[s]${regiones.map((_, i) => `[r${i}]`).join('')}`);
    regiones.forEach((r, i) => {
      const { x, y, w, h } = r.px;
      const b = r.blur;
      filtros.push(`[r${i}]crop=${w}:${h}:${x}:${y},scale=${b.wk}:${b.hk}:flags=bilinear,boxblur=${b.radio}:2,scale=${w}:${h}:flags=bicubic[z${i}]`);
    });
    let anterior = 's';
    regiones.forEach((r, i) => {
      const etiqueta = i === regiones.length - 1 ? 'conblur' : `o${i}`;
      filtros.push(`[${anterior}][z${i}]overlay=${r.px.x}:${r.px.y}${dentroDeTiempo(r.desde, r.hasta)}[${etiqueta}]`);
      anterior = etiqueta;
    });
    ultimo = 'conblur';
  }

  // Capas PNG: cada una se escala UNA vez a sus pixeles y se superpone en orden (la ultima queda arriba). Entradas ffmpeg 1..n.
  let previo = ultimo;
  plan.capas.forEach((k, i) => {
    const { x, y, w, h } = k.px;
    filtros.push(`[${i + 1}:v]scale=${w}:${h}:flags=bicubic,format=rgba[p${i}]`);
    const etiqueta = i === plan.capas.length - 1 ? 'concapas' : `c${i}`;
    filtros.push(`[${previo}][p${i}]overlay=${x}:${y}${dentroDeTiempo(k.desde, k.hasta)}[${etiqueta}]`);
    previo = etiqueta;
  });
  return { filtros, ultimo: previo };
}

/**
 * opciones: { plan (de planDeEditor), salida, tieneAudio = false, duracionTotal = null, hilos, preset, crf, progreso = false }
 * Devuelve { args, duracion } (duracion = largo final del tramo si se conoce). El audio extra solo se mezcla si el video tiene audio;
 * si no lo tiene (o mezclar = false) la pista reemplaza al original, con silencio de relleno hasta el final del tramo.
 */
export function construirEditor({ plan, salida, tieneAudio = false, duracionTotal = null, hilos = config.cpuThreads, preset = plan && plan.preset ? plan.preset : config.videoPreset, crf = config.videoCrf, progreso = false } = {}) {
  if (!plan || !salida) throw new Error('construirEditor necesita plan y salida.');
  const { filtros, ultimo } = grafoDeVideo(plan);
  filtros.push(`[${ultimo}]format=yuv420p[vout]`);

  const duracion = duracionDelTramo(plan, duracionTotal);
  const entradas = ['-i', plan.entrada];
  for (const k of plan.capas) entradas.push('-i', k.ruta);

  let mapaAudio = ['-map', '0:a:0?'];
  if (plan.audio) {
    const ia = plan.capas.length + 1;
    const a = plan.audio;
    entradas.push('-i', a.ruta);
    const retraso = Math.round(a.offset * 1000);
    const cadena = ['aresample=44100', 'aformat=channel_layouts=stereo', `volume=${a.volumen.toFixed(2)}`];
    if (retraso > 0) cadena.push(`adelay=${retraso}|${retraso}`);
    if (a.mezclar && tieneAudio) {
      filtros.push(`[${ia}:a]${cadena.join(',')}[ax]`);
      filtros.push('[0:a:0]aresample=44100,aformat=channel_layouts=stereo[ao]');
      filtros.push('[ao][ax]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]');
    } else {
      if (duracion !== null) cadena.push('apad');
      filtros.push(`[${ia}:a]${cadena.join(',')}[aout]`);
    }
    mapaAudio = ['-map', '[aout]'];
  }

  const h = String(hilos);
  const tramo = [];
  if (plan.fuente.inicio > 0) tramo.push('-ss', seg(plan.fuente.inicio));
  if (duracion !== null) tramo.push('-t', seg(duracion));
  // -ss / -t van ANTES de -i: solo recortan el video fuente (la primera entrada), no los PNG ni el audio.
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...(progreso ? ['-progress', 'pipe:1', '-nostats'] : []), ...tramo, ...entradas,
    '-filter_complex', filtros.join(';'), '-map', '[vout]', ...mapaAudio,
    '-c:v', 'libx264', '-preset', presetSeguro(preset), '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', '30', '-threads', h, '-filter_complex_threads', h,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', ...(duracion !== null ? ['-t', seg(duracion)] : []), '-y', salida];
  return { args, duracion };
}

/**
 * Vista previa: UN fotograma (en el segundo `t` del tramo) con difuminados y capas ya aplicados, reducido a un tercio y en JPEG.
 * opciones: { plan, salida, t = 0, hilos }. Devuelve { args, ancho, alto } (tamano del JPEG).
 */
export function construirVistaPrevia({ plan, salida, t = 0, hilos = config.cpuThreads } = {}) {
  if (!plan || !salida) throw new Error('construirVistaPrevia necesita plan y salida.');
  const instante = Math.max(0, Number(t) || 0);
  const { filtros, ultimo } = grafoDeVideo(plan, { desplazamiento: instante });
  const ancho = Math.round(plan.ancho / 3 / 2) * 2;
  const alto = Math.round(plan.alto / 3 / 2) * 2;
  filtros.push(`[${ultimo}]scale=${ancho}:${alto}:flags=bilinear,format=yuvj420p[vout]`);
  const entradas = [];
  for (const k of plan.capas) entradas.push('-i', k.ruta);
  const h = String(hilos);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', seg(plan.fuente.inicio + instante), '-i', plan.entrada, ...entradas,
    '-filter_complex', filtros.join(';'), '-map', '[vout]', '-an', '-frames:v', '1', '-q:v', '4', '-threads', h, '-filter_complex_threads', h, '-y', salida];
  return { args, ancho, alto };
}

// ---------------------------------------------------------------- sonda y ejecucion

/** { duracion, tieneAudio } del video fuente con ffprobe. Si no se puede medir devuelve nulos (el render sigue sin esos datos). */
export async function sondearVideo(ruta, { signal } = {}) {
  try {
    const { stdout } = await run(config.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', ruta], { timeoutMs: 30000, signal });
    const datos = JSON.parse(stdout);
    const duracion = Number(datos.format && datos.format.duration);
    return { duracion: Number.isFinite(duracion) && duracion > 0 ? duracion : null, tieneAudio: Array.isArray(datos.streams) ? datos.streams.some((s) => s.codec_type === 'audio') : null };
  } catch (error) {
    if (signal && signal.aborted) throw error;
    return { duracion: null, tieneAudio: null };
  }
}

/** Corre ffmpeg para el plan. `onProgreso(0..1)` se llama con lo ya codificado del tramo (si se conoce su largo). */
export async function renderizarEditor({ dirTrabajo, signal, onProgreso, ...opciones }) {
  await fs.mkdir(dirTrabajo, { recursive: true });
  const { args, duracion } = construirEditor({ ...opciones, progreso: typeof onProgreso === 'function' });
  const lectura = typeof onProgreso === 'function' && duracion
    ? (linea) => { const m = /^out_time_(?:us|ms)=(\d+)/.exec(linea); if (m) onProgreso(Math.min(1, Number(m[1]) / 1e6 / duracion)); }
    : undefined;
  await run(config.ffmpegPath, args, { cwd: dirTrabajo, signal, onStdoutLine: lectura });
  return { archivo: opciones.salida };
}

async function moverFinal(origen, destino) {
  try { await fs.rename(origen, destino); } catch { await fs.copyFile(origen, destino); await fs.rm(origen, { force: true }); }
}

/**
 * Produce el video del editor. Entrada: `plan` (de planDeEditor) o `peticion` (el documento crudo, que se valida aqui).
 * opciones: { id, signal, avance(etapa, %), dirSalida, dirTemporal, dirs, deps:{ renderizar, sondear }, render:{ hilos, preset, crf } }
 * Salida: <clipsDir>/editor-<id>.mp4 (horizontal agrega -16x9). Devuelve { id, formato, archivo, url, duracion, titulo, avisos }.
 * Todo corre dentro del candado 'ffmpeg' (nunca a la vez que Ollama u otro render). Cancelar (signal) es limpio: FFmpeg se detiene, el
 * candado se libera, el video a medias y la carpeta temporal se borran.
 */
export async function producirEditor({ id, plan: planDado, peticion, signal, avance = () => {}, dirSalida = config.clipsDir, dirTemporal, dirs, deps = {}, render = {} } = {}) {
  const d = { renderizar: renderizarEditor, sondear: sondearVideo, ...deps };
  const proyecto = String(id ?? '').trim().toLowerCase();
  if (!ID_VALIDO.test(proyecto)) throw new ErrorEditor('Falta el id del trabajo o no es valido (a-z, 0-9, _ y -; maximo 64).');
  const plan = planDado ?? await planDeEditor(peticion, { dirs });
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'editor', proyecto);
  const nombre = 'editor-' + proyecto + (plan.formato === 'horizontal' ? '-16x9' : '') + '.mp4';
  const avisos = [...plan.avisos];

  const info = await d.sondear(plan.entrada, { signal });
  if (info.duracion !== null && plan.fuente.inicio >= info.duracion - 0.1) throw new ErrorEditor('El inicio (' + plan.fuente.inicio + ' s) queda fuera del video fuente, que dura ' + Math.round(info.duracion * 10) / 10 + ' s.');
  if (info.duracion !== null && plan.fuente.fin !== null && plan.fuente.fin > info.duracion + 0.05) avisos.push('El tramo pasa del final del video (' + Math.round(info.duracion * 10) / 10 + ' s): se recorta ahi.');
  if (plan.audio && plan.audio.mezclar && info.tieneAudio === false) avisos.push('El video fuente no tiene audio: la pista elegida lo reemplaza en lugar de mezclarse.');
  const duracion = duracionDelTramo(plan, info.duracion);

  await fs.mkdir(dirSalida, { recursive: true });
  await fs.rm(trabajo, { recursive: true, force: true });
  await fs.mkdir(trabajo, { recursive: true });
  let creado = null;
  try {
    return await exclusion.ejecutar('ffmpeg', async () => {
      if (signal && signal.aborted) throw new Error(MENSAJE_CANCELADA);
      avance('Renderizando', 3);
      const temporal = path.join(trabajo, nombre);
      await d.renderizar({ dirTrabajo: path.join(trabajo, 'w'), plan, salida: temporal, tieneAudio: info.tieneAudio === true, duracionTotal: info.duracion, signal, onProgreso: (f) => avance('Renderizando', 3 + f * 94), ...render });
      if (signal && signal.aborted) throw new Error(MENSAJE_CANCELADA);
      const destino = path.join(dirSalida, nombre);
      await moverFinal(temporal, destino);
      creado = destino;
      avance('Listo', 100);
      return { id: proyecto, formato: plan.formato, archivo: nombre, url: '/clips/' + nombre, duracion, titulo: 'Editor: ' + path.basename(plan.entrada).slice(0, 60), avisos };
    }, { signal });
  } catch (error) {
    if (creado) await fs.rm(creado, { force: true }).catch(() => {});
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

/**
 * Fotograma de vista previa en el segundo `t` DEL TRAMO. Devuelve { imagen: 'data:image/jpeg;base64,...', ancho, alto, t }.
 * Va dentro del candado 'ffmpeg' (es un solo fotograma: tarda una fraccion de segundo) y borra su carpeta temporal.
 */
export async function previsualizarEditor({ plan: planDado, peticion, t = 0, signal, dirs, dirTemporal, render = {} } = {}) {
  const plan = planDado ?? await planDeEditor(peticion, { dirs });
  const instante = Number(t);
  if (!Number.isFinite(instante) || instante < 0) throw new ErrorEditor('El instante de la vista previa debe ser un numero de segundos >= 0.');
  if (plan.fuente.duracion !== null && instante > plan.fuente.duracion) throw new ErrorEditor('El instante de la vista previa (' + instante + ' s) pasa del final del tramo (' + plan.fuente.duracion + ' s).');
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'editor', 'vista-' + randomBytes(5).toString('hex'));
  await fs.mkdir(trabajo, { recursive: true });
  try {
    const archivo = path.join(trabajo, 'vista.jpg');
    const { args, ancho, alto } = construirVistaPrevia({ plan, salida: archivo, t: instante, ...render });
    await exclusion.ejecutar('ffmpeg', () => run(config.ffmpegPath, args, { cwd: trabajo, signal, timeoutMs: 60000 }), { signal });
    const bytes = await fs.readFile(archivo).catch(() => null);
    if (!bytes || !bytes.length) throw new ErrorEditor('No se pudo sacar un fotograma en ese instante (revisa que el tramo exista en el video).');
    return { imagen: 'data:image/jpeg;base64,' + bytes.toString('base64'), ancho, alto, t: instante };
  } finally {
    await fs.rm(trabajo, { recursive: true, force: true });
  }
}

/** Crea UN clip en el store para poder descargarlo desde "Todos los clips". `store` se inyecta (encolar/completar). */
export function registrarClipEditor({ store, resultado }) {
  const clip = store.encolar('editor:' + resultado.id, { origen: 'editor' });
  store.completar(clip.id, { titulo: resultado.titulo, url: resultado.url, duracion: resultado.duracion ?? null, proyecto: resultado.id, formato: resultado.formato });
  return [clip.id];
}

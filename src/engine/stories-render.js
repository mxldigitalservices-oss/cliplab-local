// ---------------------------------------------------------------------------
// Render del canal STORIES con FFmpeg (CPU libx264, hilos limitados: 16 GB RAM, Intel UHD 620 sin aceleracion). No toca pipeline.js:
// aqui se CONSTRUYE el video desde cero (fondos del banco o color generado + textos + voz de Piper + musica y efectos opcionales).
//   construirParte(opciones) -> { args, textos:[{nombre, contenido}] }   funcion pura (se prueba sin ffmpeg)
//   renderizarParte(opciones) -> escribe los textos en dirTrabajo y corre ffmpeg (cwd = dirTrabajo: sin rutas con ':' en los filtros)
//   concatenarPartes(archivos, salida) -> une los videos EN ORDEN sin recodificar (mismos parametros: 9:16 heredado)
// Todo el texto va en archivos (drawtext textfile): nada de escapar comillas ni dos puntos del contenido del guion.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { run } from '../utils/run.js';
import { RE_IMAGEN } from '../banco-medios.js';

export const ANCHO = 1080;
export const ALTO = 1920;
const PALETA = ['0x14202e', '0x1d1b2e', '0x10261f', '0x2a1a1a'];
const FUENTES = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'];

const seg = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const recortar = (t, n) => (t.length > n ? t.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : t);

/** Fuente para drawtext: Anton en FONTS_DIR si existe, una fuente comun del sistema o null (entonces drawtext usa fontconfig). */
export async function elegirFuente({ fontsDir = config.fontsDir, extra = [] } = {}) {
  const candidatas = [path.join(fontsDir, config.subtitleFont + '-Regular.ttf'), path.join(fontsDir, config.subtitleFont + '.ttf'), ...extra, ...FUENTES];
  for (const c of candidatas) { try { if ((await fs.stat(c)).isFile()) return c; } catch { /* siguiente */ } }
  return null;
}

/** Ruta para usar DENTRO de un filtro: barras normales y ':' o ''' escapados. */
export const rutaEnFiltro = (r) => String(r).replace(/\\/g, '/').replace(/([:'])/g, '\\$1');

function efectoVisual(visual, D, W, H) {
  const d = seg(D);
  switch (visual) {
    case 'zoom_in': return `scale=w='trunc(${W}*(1+0.10*t/${d})/2)*2':h='trunc(${H}*(1+0.10*t/${d})/2)*2':eval=frame,crop=${W}:${H}`;
    case 'zoom_out': return `scale=w='trunc(${W}*(1.10-0.10*t/${d})/2)*2':h='trunc(${H}*(1.10-0.10*t/${d})/2)*2':eval=frame,crop=${W}:${H}`;
    case 'pan_der': return `scale=${par(W * 1.1)}:${par(H * 1.1)},crop=${W}:${H}:x='(iw-ow)*t/${d}':y='(ih-oh)/2'`;
    case 'pan_izq': return `scale=${par(W * 1.1)}:${par(H * 1.1)},crop=${W}:${H}:x='(iw-ow)*(1-t/${d})':y='(ih-oh)/2'`;
    case 'fundido': return `fade=t=in:st=0:d=0.4,fade=t=out:st=${seg(Math.max(0, D - 0.4))}:d=0.4`;
    default: return '';
  }
}

/**
 * opciones: { plan (de planDeParte), voz (wav), salida, medios:[ruta|null por escena], musica?, sfx?:[{ruta, inicio}], foto?, fuente?,
 *             ancho, alto, hilos, preset, crf }
 * Devuelve { args, textos } (los textos se escriben en dirTrabajo con los mismos nombres).
 */
export function construirParte({ plan, voz, salida, medios = [], musica = null, sfx = [], foto = null, fuente = null, ancho = ANCHO, alto = ALTO, hilos = config.cpuThreads, preset = config.videoPreset, crf = config.videoCrf } = {}) {
  const W = par(ancho);
  const H = par(alto);
  const T = plan.duracionTotal;
  const textos = [];
  const nuevoTexto = (contenido) => { const nombre = 't' + textos.length + '.txt'; textos.push({ nombre, contenido }); return nombre; };
  const entradas = [];
  const filtros = [];
  const f = (x) => Math.max(8, Math.round(alto * x));   // tamanos relativos al alto

  // 1) escenas -> un tramo de video por escena
  plan.escenas.forEach((e, i) => {
    const medio = medios[i] || null;
    const D = e.duracion;
    const largo = seg(D + 0.2);
    if (medio && RE_IMAGEN.test(medio)) entradas.push('-loop', '1', '-framerate', '30', '-t', largo, '-i', medio);
    else if (medio) entradas.push('-stream_loop', '-1', '-t', largo, '-i', medio);
    else entradas.push('-f', 'lavfi', '-t', largo, '-i', `color=c=${PALETA[i % PALETA.length]}:s=${W}x${H}:r=30`);
    const partes = [`[${i}:v]setpts=PTS-STARTPTS`, 'fps=30', `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, 'setsar=1', efectoVisual(e.visual, D, W, H), `trim=duration=${seg(D)}`, 'setpts=PTS-STARTPTS', 'format=yuv420p'].filter(Boolean);
    filtros.push(partes.join(',') + `[v${i}]`);
  });
  const n = plan.escenas.length;
  filtros.push(plan.escenas.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[base]`);

  // 2) entradas de audio e imagen extra
  let idx = n;
  entradas.push('-i', voz); const iVoz = idx++;
  let iMusica = null; if (musica) { entradas.push('-stream_loop', '-1', '-i', musica); iMusica = idx++; }
  let iFoto = null; if (foto && plan.ficha) { entradas.push('-loop', '1', '-framerate', '30', '-t', seg(T), '-i', foto); iFoto = idx++; }
  const iSfx = sfx.slice(0, 6).map((s) => { entradas.push('-i', s.ruta); return { i: idx++, inicio: s.inicio }; });

  // 3) textos: expediente (inicio de la parte), texto en pantalla por escena y subtitulos de la narracion
  const base = fuente ? `fontfile='${rutaEnFiltro(fuente)}':` : '';
  const dt = (archivo, { x, y, tam, extra = '', enable }) => `drawtext=${base}textfile=${archivo}:reload=0:fontcolor=white:fontsize=${tam}:x=${x}:y=${y}:${extra}enable='${enable}'`;
  const cadena = [];
  const f0 = plan.ficha;
  let fotoLista = false;
  if (f0) {
    const a = seg(0.4);
    const b = seg(0.4 + f0.segundos);
    const ventana = `between(t,${a},${b})`;
    const cy = 0.70;
    cadena.push(`drawbox=x=${Math.round(W * 0.06)}:y=${Math.round(H * cy)}:w=${Math.round(W * 0.88)}:h=${Math.round(H * 0.2)}:color=black@0.68:t=fill:enable='${ventana}'`);
    const ph = par(H * 0.14);
    const xTexto = Math.round(W * 0.06) + (iFoto !== null ? ph + 50 : 40);
    const maxCh = iFoto !== null ? 25 : 34;
    fotoLista = iFoto !== null;
    cadena.push(dt(nuevoTexto(recortar(f0.etiqueta + ' · ' + f0.nombre, maxCh)), { x: xTexto, y: Math.round(H * (cy + 0.018)), tam: f(0.03), extra: 'borderw=2:bordercolor=black@0.9:', enable: ventana }));
    f0.lineas.slice(0, 4).forEach((l, k) => {
      cadena.push(dt(nuevoTexto(recortar(l, maxCh)), { x: xTexto, y: Math.round(H * (cy + 0.058 + k * 0.032)), tam: f(0.022), extra: 'borderw=2:bordercolor=black@0.9:', enable: ventana }));
    });
  }
  plan.escenas.forEach((e) => {
    if (!e.textoPantalla) return;
    cadena.push(dt(nuevoTexto(e.textoPantalla), { x: '(w-text_w)/2', y: Math.round(H * 0.12), tam: f(0.045), extra: 'borderw=4:bordercolor=black@0.9:line_spacing=10:', enable: `between(t,${seg(e.inicio + 0.1)},${seg(e.inicio + e.duracion - 0.1)})` }));
  });
  plan.subtitulos.forEach((s) => {
    cadena.push(dt(nuevoTexto(s.texto), { x: '(w-text_w)/2', y: Math.round(H * 0.54), tam: f(0.03), extra: 'box=1:boxcolor=black@0.55:boxborderw=16:line_spacing=8:', enable: `between(t,${seg(s.inicio)},${seg(s.fin)})` }));
  });
  filtros.push(`[base]${cadena.length ? cadena.join(',') : 'null'}[vtxt]`);
  if (fotoLista) {
    const ph = par(H * 0.14);
    filtros.push(`[${iFoto}:v]scale=${ph}:${ph}:force_original_aspect_ratio=increase,crop=${ph}:${ph},format=yuva420p[foto]`);
    const a = seg(0.4);
    const b = seg(0.4 + plan.ficha.segundos);
    filtros.push(`[vtxt][foto]overlay=x=${Math.round(W * 0.06) + 24}:y=${Math.round(H * 0.70) + Math.round((H * 0.2 - ph) / 2)}:enable='between(t,${a},${b})',format=yuv420p[vout]`);
  } else {
    filtros.push('[vtxt]format=yuv420p[vout]');
  }

  // 4) audio: voz (+ musica baja + efectos al inicio de su escena)
  const ts = seg(T);
  const pistas = [];
  filtros.push(`[${iVoz}:a]aresample=44100,apad,atrim=0:${ts},asetpts=PTS-STARTPTS[narr]`); pistas.push('[narr]');
  if (iMusica !== null) { filtros.push(`[${iMusica}:a]aresample=44100,volume=0.10,atrim=0:${ts},asetpts=PTS-STARTPTS[mus]`); pistas.push('[mus]'); }
  iSfx.forEach((s, k) => {
    const ms = Math.max(0, Math.round(s.inicio * 1000));
    filtros.push(`[${s.i}:a]aresample=44100,volume=0.7,adelay=${ms}|${ms},atrim=0:${ts}[sfx${k}]`); pistas.push(`[sfx${k}]`);
  });
  filtros.push(pistas.length > 1 ? `${pistas.join('')}amix=inputs=${pistas.length}:duration=first:dropout_transition=0,volume=${pistas.length},alimiter=limit=0.95[aout]` : '[narr]anull[aout]');

  const h = String(hilos);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...entradas, '-filter_complex', filtros.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', '30', '-threads', h, '-filter_complex_threads', h,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-t', ts, '-y', salida];
  return { args, textos };
}

/** Escribe los textos en dirTrabajo y corre ffmpeg alli (los archivos de texto se citan por nombre relativo). */
export async function renderizarParte({ dirTrabajo, signal, ...opciones }) {
  await fs.mkdir(dirTrabajo, { recursive: true });
  const { args, textos } = construirParte(opciones);
  for (const t of textos) await fs.writeFile(path.join(dirTrabajo, t.nombre), t.contenido, 'utf8');
  await run(config.ffmpegPath, args, { cwd: dirTrabajo, signal });
  return { archivo: opciones.salida };
}

/** Argumentos de la union sin recodificar (-c copy): las partes ya comparten codec, tamano y fps. */
export const argsConcat = (lista, salida) => ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', '-y', salida];

/** Une los videos de las partes, EN EL ORDEN dado, sin recodificar. Todos salen del mismo render (mismo codec, tamano y fps). */
export async function concatenarPartes(archivos, salida, { dirTrabajo, signal } = {}) {
  if (!Array.isArray(archivos) || archivos.length === 0) throw new Error('No hay partes que concatenar.');
  const lista = path.join(dirTrabajo ?? path.dirname(salida), 'concat-' + path.basename(salida, '.mp4') + '.txt');
  await fs.writeFile(lista, archivos.map((a) => `file '${path.resolve(a).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n', 'utf8');
  try {
    await run(config.ffmpegPath, argsConcat(lista, salida), { signal });
  } finally {
    await fs.rm(lista, { force: true });
  }
  return { archivo: salida };
}

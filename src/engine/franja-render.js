// ---------------------------------------------------------------------------
// Render del canal SPORTS / NEWS desde un VIDEO FUENTE con FFmpeg (CPU libx264, hilos limitados: 16 GB RAM, Intel UHD 620 sin aceleracion).
// No toca pipeline.js ni render.js: toma un tramo del video, lo lleva a 9:16 (recorte centrado o fondo desenfocado), dibuja las franjas
// (degradado + franja solida que tapan logos ajenos) y escribe el titulo con gancho. Una sola pasada de codificacion.
//   construirFranja(opciones) -> { args, textos:[{nombre, contenido}] }   funcion pura (se prueba sin ffmpeg)
//   renderizarFranja(opciones) -> escribe los textos en dirTrabajo y corre ffmpeg alli (sin rutas con ':' en los filtros)
// El titulo va en archivos (drawtext textfile): nada de escapar comillas ni dos puntos del contenido.
// El audio del video fuente se conserva (aac); si no tiene audio, el video sale mudo.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { run } from '../utils/run.js';
import { elegirFuente, rutaEnFiltro } from './stories-render.js';

export { elegirFuente };

const seg = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

/**
 * opciones: { entrada (ruta absoluta), salida, franja (de planDeFranja), inicio?, duracion?, modo: 'recorte'|'blur', fuente?, hilos, preset, crf }
 * Devuelve { args, textos }.
 */
export function construirFranja({ entrada, salida, franja, inicio = 0, duracion = null, modo = 'recorte', fuente = null, hilos = config.cpuThreads, preset = config.videoPreset, crf = config.videoCrf } = {}) {
  if (!entrada || !salida || !franja) throw new Error('construirFranja necesita entrada, salida y franja.');
  if (!['recorte', 'blur'].includes(modo)) throw new Error('Modo no valido: ' + modo);
  const W = franja.ancho;
  const H = franja.alto;
  const textos = [];
  const filtros = [];

  // 1) base 9:16: recorte centrado o primer plano sobre el mismo video desenfocado (el fondo se baja de resolucion antes del blur: barato)
  const comun = 'setpts=PTS-STARTPTS,fps=30';
  if (modo === 'blur') {
    filtros.push(`[0:v]${comun},split=2[a][b]`);
    filtros.push(`[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},scale=${W / 8}:${H / 8},boxblur=4:2,scale=${W}:${H},setsar=1[bg]`);
    filtros.push(`[b]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg]`);
    filtros.push('[bg][fg]overlay=(W-w)/2:(H-h)/2[base]');
  } else {
    filtros.push(`[0:v]${comun},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[base]`);
  }

  // 2) franjas: tiras del degradado (alfa decreciente hacia el centro) + franja solida por posicion
  const cadena = [];
  for (const b of franja.bandas) {
    if (b.degradado) for (const p of b.degradado.pasos) if (p.opacidad > 0 && p.alto > 0) cadena.push(`drawbox=x=0:y=${p.y}:w=${W}:h=${p.alto}:color=${b.color}@${p.opacidad}:t=fill`);
    cadena.push(`drawbox=x=0:y=${b.y}:w=${W}:h=${b.alto}:color=${b.color}@${b.opacidad}:t=fill`);
  }

  // 3) titulo con gancho: una linea por drawtext, centrada, con borde para que se lea sobre cualquier color
  const t = franja.titulo;
  if (t) {
    const base = fuente ? `fontfile='${rutaEnFiltro(fuente)}':` : '';
    t.lineas.forEach((linea, k) => {
      const nombre = 't' + textos.length + '.txt';
      textos.push({ nombre, contenido: linea });
      cadena.push(`drawtext=${base}textfile=${nombre}:reload=0:fontcolor=${t.color}:fontsize=${t.tam}:x=(w-text_w)/2:y=${t.yInicio + k * t.interlineado}:borderw=${t.borde}:bordercolor=black@0.85`);
    });
  }
  filtros.push(`[base]${cadena.length ? cadena.join(',') : 'null'},format=yuv420p[vout]`);

  const h = String(hilos);
  const tramo = [];
  if (inicio > 0) tramo.push('-ss', seg(inicio));
  if (duracion) tramo.push('-t', seg(duracion));
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...tramo, '-i', entrada,
    '-filter_complex', filtros.join(';'), '-map', '[vout]', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', '30', '-threads', h, '-filter_complex_threads', h,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-y', salida];
  return { args, textos };
}

/** Escribe los textos en dirTrabajo y corre ffmpeg alli (los archivos de texto se citan por nombre relativo). */
export async function renderizarFranja({ dirTrabajo, signal, ...opciones }) {
  await fs.mkdir(dirTrabajo, { recursive: true });
  const { args, textos } = construirFranja(opciones);
  for (const t of textos) await fs.writeFile(path.join(dirTrabajo, t.nombre), t.contenido, 'utf8');
  await run(config.ffmpegPath, args, { cwd: dirTrabajo, signal });
  return { archivo: opciones.salida };
}

// ---------------------------------------------------------------------------
// Voz en off con Piper local (100 % offline; sin edge-tts ni gTTS). CONTRATO DE SINTESIS:
//   sintetizar({ texto, mercado, salida }) -> { archivo, duracionSeg, mercado, voz, sampleRate }
//     texto    una narracion (se limpia a UNA linea: Piper lee una frase-bloque por linea de stdin)
//     mercado  'en-US' | 'es-US' (se normaliza; sin valor por defecto) -> elige la voz .onnx
//     salida   ruta ABSOLUTA de un .wav; Piper lo escribe con -f (mono; 16 kHz en las voces "low", 22.05 kHz en las "medium")
//   Errores: ErrorVoz con tipo sin_binario | sin_voz | texto | salida | fallo | timeout | cancelado.
// Verificado (Parte 5, binario piper_linux_x86_64 2023.11.14-2 y voces low en-US/es): CLI `piper -m modelo.onnx -f out.wav -q
// --length_scale N --sentence_silence N` con el texto por stdin; factor de tiempo real ~0.12 en un nucleo; ~165 MB de RAM.
// La sintesis pasa por el candado de exclusion.js (nunca a la vez que Ollama) y es reentrante dentro de un trabajo de render.
// El proceso se lanza SIN shell y con argumentos en arreglo (el texto va por stdin, nunca en la linea de comandos).
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';
import { MERCADOS, normalizarMercado } from './mercados.js';

export class ErrorVoz extends Error {
  constructor(mensaje, tipo = 'fallo') {
    super(mensaje);
    this.name = 'ErrorVoz';
    this.tipo = tipo;
    this.status = tipo === 'texto' ? 400 : 502;
  }
}

export const MAX_CARACTERES = 4000;
const PATRON_VOZ = { 'en-US': /^en[-_]us/i, 'es-US': /^es/i };
const CALIDAD = [/high/i, /medium/i, /low/i];   // se prefiere mas calidad; x_low al final

/** Una sola linea de texto limpia (sin saltos ni caracteres de control). Lanza ErrorVoz(texto) si no queda nada. */
export function limpiarTexto(texto) {
  const t = String(texto ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) throw new ErrorVoz('No hay texto para sintetizar.', 'texto');
  if (t.length > MAX_CARACTERES) throw new ErrorVoz('El texto pasa de ' + MAX_CARACTERES + ' caracteres; sintetiza por partes.', 'texto');
  return t;
}

/** Duracion (s) de un WAV PCM leyendo su cabecera (sin ffprobe). */
export async function duracionWav(archivo) {
  const fh = await fs.open(archivo, 'r');
  try {
    const { size } = await fh.stat();
    const cab = Buffer.alloc(Math.min(size, 4096));
    await fh.read(cab, 0, cab.length, 0);
    if (cab.length < 44 || cab.toString('ascii', 0, 4) !== 'RIFF' || cab.toString('ascii', 8, 12) !== 'WAVE') throw new ErrorVoz('El archivo de voz no es un WAV valido.', 'salida');
    let pos = 12;
    let bytesPorSeg = 0;
    let rate = 0;
    while (pos + 8 <= cab.length) {
      const id = cab.toString('ascii', pos, pos + 4);
      const tam = cab.readUInt32LE(pos + 4);
      if (id === 'fmt ') {
        rate = cab.readUInt32LE(pos + 12);
        bytesPorSeg = cab.readUInt32LE(pos + 16);
      } else if (id === 'data') {
        if (!bytesPorSeg) break;
        const util = tam === 0 || tam === 0xffffffff || pos + 8 + tam > size ? size - (pos + 8) : tam;
        return { duracionSeg: util / bytesPorSeg, sampleRate: rate };
      }
      pos += 8 + tam + (tam % 2);
    }
    throw new ErrorVoz('El WAV no tiene datos de audio.', 'salida');
  } finally {
    await fh.close();
  }
}

async function existe(ruta) {
  try { return (await fs.stat(ruta)).isFile(); } catch { return false; }
}

/** Ruta del .onnx de la voz del mercado: variable PIPER_VOICE_* (nombre o ruta) o la mejor que haya en PIPER_VOICES_DIR. null si no hay. */
export async function vozDeMercado(mercado, { dir = config.piperVoicesDir, fija } = {}) {
  const id = normalizarMercado(mercado);
  const elegida = fija ?? (id === 'en-US' ? config.piperVoiceEnUs : config.piperVoiceEsUs);
  if (elegida) {
    const ruta = path.isAbsolute(elegida) ? elegida : path.join(dir, elegida);
    return (await existe(ruta)) ? ruta : null;
  }
  let nombres;
  try { nombres = (await fs.readdir(dir)).filter((n) => /\.onnx$/i.test(n) && PATRON_VOZ[id].test(n)); } catch { return null; }
  const rango = (n) => { const i = CALIDAD.findIndex((r) => r.test(n)); return i < 0 ? CALIDAD.length : i; };
  nombres.sort((a, b) => rango(a) - rango(b) || a.localeCompare(b));
  return nombres.length ? path.join(dir, nombres[0]) : null;
}

/** Estado del entorno de voz: binario (responde a --help) y voz encontrada por mercado. */
export async function verificarPiper({ binario = config.piperPath, argsPrevios = [], dir } = {}) {
  const voces = {};
  for (const id of Object.keys(MERCADOS)) voces[id] = await vozDeMercado(id, dir ? { dir } : {});
  const binarioOk = await new Promise((resolver) => {
    let hijo;
    try { hijo = spawn(binario, [...argsPrevios, '--help'], { stdio: 'ignore', windowsHide: true }); } catch { resolver(false); return; }
    const fin = setTimeout(() => { hijo.kill('SIGKILL'); resolver(false); }, 8000);
    hijo.once('error', () => { clearTimeout(fin); resolver(false); });
    hijo.once('exit', () => { clearTimeout(fin); resolver(true); });
  });
  return { binario: binarioOk, ruta: binario, voces, listo: binarioOk && Object.values(voces).every(Boolean) };
}

async function lanzar({ binario, args, texto, timeoutMs, signal }) {
  if (signal && signal.aborted) throw new ErrorVoz('Sintesis cancelada.', 'cancelado');
  return new Promise((resolver, rechazar) => {
    let hijo;
    try { hijo = spawn(binario, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { rechazar(new ErrorVoz('No se pudo lanzar Piper: ' + e.message, 'sin_binario')); return; }
    let stderr = '';
    let terminado = false;
    const cerrar = (fn) => { if (terminado) return; terminado = true; clearTimeout(reloj); if (signal) signal.removeEventListener('abort', alAbortar); fn(); };
    const reloj = setTimeout(() => { hijo.kill('SIGKILL'); cerrar(() => rechazar(new ErrorVoz('Piper no termino en ' + Math.round(timeoutMs / 1000) + ' s.', 'timeout'))); }, timeoutMs);
    const alAbortar = () => { hijo.kill('SIGKILL'); cerrar(() => rechazar(new ErrorVoz('Sintesis cancelada.', 'cancelado'))); };
    if (signal) signal.addEventListener('abort', alAbortar, { once: true });
    hijo.stdout.on('data', () => {});   // Piper escribe el nombre del archivo en stdout; se descarta
    hijo.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    hijo.stdin.on('error', () => {});    // si Piper muere antes de leer, el error llega por 'exit'
    hijo.once('error', (e) => cerrar(() => rechazar(e.code === 'ENOENT'
      ? new ErrorVoz('No se encontro Piper en "' + binario + '". Define PIPER_PATH con la ruta completa del binario.', 'sin_binario')
      : new ErrorVoz('No se pudo lanzar Piper: ' + e.message, 'sin_binario'))));
    hijo.once('exit', (codigo) => cerrar(() => (codigo === 0 ? resolver() : rechazar(new ErrorVoz('Piper fallo (codigo ' + codigo + '): ' + stderr.trim().split('\n').slice(-3).join(' | '), 'fallo')))));
    hijo.stdin.end(texto + '\n');
  });
}

/** Sintetiza `texto` en la voz del `mercado` y lo guarda como WAV en `salida` (ruta absoluta). Ver el contrato arriba. */
export async function sintetizar({ texto, mercado, salida, lengthScale = config.piperLengthScale, signal, binario = config.piperPath, argsPrevios = [], modelo, dirVoces, timeoutMs = config.piperTimeoutMs } = {}) {
  const id = normalizarMercado(mercado);
  const limpio = limpiarTexto(texto);
  if (typeof salida !== 'string' || !path.isAbsolute(salida) || !/\.wav$/i.test(salida)) throw new ErrorVoz('La salida debe ser una ruta absoluta que termine en .wav.', 'salida');
  const voz = modelo ?? (await vozDeMercado(id, dirVoces ? { dir: dirVoces } : {}));
  if (!voz) throw new ErrorVoz('No hay voz de Piper para ' + id + ': copia un .onnx (con su .onnx.json) en ' + config.piperVoicesDir + ' o define PIPER_VOICE_' + id.replace('-', '_').toUpperCase() + '.', 'sin_voz');
  const escala = Number(lengthScale) >= 0.5 && Number(lengthScale) <= 2 ? Number(lengthScale) : 1;
  const args = [...argsPrevios, '-m', voz, '-f', salida, '-q', '--length_scale', String(escala), '--sentence_silence', '0.25'];
  const datosEspeak = path.join(path.dirname(path.resolve(binario)), 'espeak-ng-data');
  if (path.isAbsolute(binario) && (await fs.stat(datosEspeak).then((s) => s.isDirectory(), () => false))) args.push('--espeak_data', datosEspeak);

  await fs.mkdir(path.dirname(salida), { recursive: true });
  await fs.rm(salida, { force: true });
  // Mismo candado que Ollama y FFmpeg: un solo trabajo pesado a la vez (reentrante dentro de un render).
  await exclusion.ejecutar('ffmpeg', () => lanzar({ binario, args, texto: limpio, timeoutMs, signal }), { signal });
  if (!(await existe(salida))) throw new ErrorVoz('Piper termino pero no escribio ' + path.basename(salida) + '.', 'salida');
  const { duracionSeg, sampleRate } = await duracionWav(salida);
  if (!(duracionSeg > 0.1)) throw new ErrorVoz('Piper genero un audio vacio.', 'salida');
  return { archivo: salida, duracionSeg, mercado: id, voz: path.basename(voz), sampleRate };
}

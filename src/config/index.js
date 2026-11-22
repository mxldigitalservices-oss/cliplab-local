import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANALES } from '../canales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '..', '..');

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Modo de operacion. 'local' = estacion de produccion en la laptop: sin publicador automatico (ni programador, ni Chromium).
// Cualquier otro valor (o vacio) = 'completo', el comportamiento de siempre. Un valor desconocido se avisa en el arranque.
const MODOS_VALIDOS = ['', 'completo', 'full', 'cloud', 'nube', 'local'];
const modoPedido = String(process.env.CLIPLAB_MODE ?? '').trim().toLowerCase();
const modo = modoPedido === 'local' ? 'local' : 'completo';

// Canal de la instancia (CLIPLAB_CANAL = stories | sports | news). Si es valido, el ritmo editorial de esa instancia sale de
// CANALES[canal].ritmo. Precedencia por campo: variable de entorno explicita > ritmo del canal > valor por defecto de siempre.
// Un valor desconocido NO se adivina: canal = null y server.js avisa al arrancar. Sin CLIPLAB_CANAL nada cambia.
const canalPedido = String(process.env.CLIPLAB_CANAL ?? '').trim().toLowerCase();
const canal = Object.hasOwn(CANALES, canalPedido) ? canalPedido : null;
const canalValido = canalPedido === '' || canal !== null;
const ritmoDelCanal = canal ? CANALES[canal].ritmo : null;

const RITMO_DEFECTO = { beatSeconds: 3.6, punchZoom: 1.14, hotCutGap: 0.45, segmentMinSeconds: 30, segmentMaxSeconds: 60 };
const RITMO_EXPLICITO = {
  beatSeconds: Number(process.env.BEAT_SECONDS) > 0 ? Number(process.env.BEAT_SECONDS) : null,
  punchZoom: Number(process.env.PUNCH_ZOOM) ? Number(process.env.PUNCH_ZOOM) : null,
  hotCutGap: Number(process.env.HOT_CUT_GAP) > 0 ? Number(process.env.HOT_CUT_GAP) : null,
  segmentMinSeconds: Number.isFinite(parseInt(process.env.SEGMENT_MIN_SECONDS, 10)) ? parseInt(process.env.SEGMENT_MIN_SECONDS, 10) : null,
  segmentMaxSeconds: Number.isFinite(parseInt(process.env.SEGMENT_MAX_SECONDS, 10)) ? parseInt(process.env.SEGMENT_MAX_SECONDS, 10) : null,
};
const ritmo = {};
const ritmoOrigen = {};
for (const campo of Object.keys(RITMO_DEFECTO)) {
  if (RITMO_EXPLICITO[campo] !== null) { ritmo[campo] = RITMO_EXPLICITO[campo]; ritmoOrigen[campo] = 'env'; }
  else if (ritmoDelCanal) { ritmo[campo] = ritmoDelCanal[campo]; ritmoOrigen[campo] = 'canal'; }
  else { ritmo[campo] = RITMO_DEFECTO[campo]; ritmoOrigen[campo] = 'defecto'; }
}

const tmpDir = process.env.TMP_DIR || path.join(os.tmpdir(), 'cliplab');
const volumen = process.env.RAILWAY_VOLUME_MOUNT_PATH || '';

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  modo,
  modoLocal: modo === 'local',
  modoPedido,
  modoValido: MODOS_VALIDOS.includes(modoPedido),
  canal,
  canalPedido,
  canalValido,
  ritmoOrigen: Object.freeze(ritmoOrigen),
  port: toInt(process.env.PORT, 8080),
  host: '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  masterKey: process.env.MASTER_KEY || '',
  tmpDir,
  clipsDir: process.env.CLIPS_DIR || path.join(tmpDir, 'clips'),

  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ytdlpCookies: process.env.YTDLP_COOKIES || '',
  whisperPath: process.env.WHISPER_PATH || 'whisper-cli',
  whisperModel: process.env.WHISPER_MODEL || '/opt/whisper/modelo.bin',
  whisperLang: process.env.WHISPER_LANG || 'auto',

  fontsDir: process.env.FONTS_DIR || path.join(raiz, 'fonts'),
  subtitleFont: process.env.SUBTITLE_FONT || 'Anton',

  // Marca de agua (logo de Klikap). Si el archivo no existe, los clips se generan sin logo.
  logoEnabled: process.env.LOGO_ENABLED !== 'false',
  logoPath: process.env.LOGO_PATH || path.join(raiz, 'assets', 'klikap-logo.png'),
  logoPosition: ['top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(process.env.LOGO_POSITION)
    ? process.env.LOGO_POSITION
    : 'top-right',
  logoWidth: Math.min(540, Math.max(64, toInt(process.env.LOGO_WIDTH, 216))),
  logoMargin: Math.max(0, toInt(process.env.LOGO_MARGIN, 56)),
  logoOpacity: Number(process.env.LOGO_OPACITY) > 0 && Number(process.env.LOGO_OPACITY) <= 1 ? Number(process.env.LOGO_OPACITY) : 0.95,

  cpuThreads: Math.max(1, toInt(process.env.CPU_THREADS, 2)),
  videoCrf: toInt(process.env.VIDEO_CRF, 24),
  videoPreset: process.env.VIDEO_PRESET || 'veryfast',
  maxVideoSeconds: toInt(process.env.MAX_VIDEO_SECONDS, 10800),
  maxClipSeconds: toInt(process.env.MAX_CLIP_SECONDS, 90),

  defaultClipSeconds: toInt(process.env.DEFAULT_CLIP_SECONDS, 45),
  defaultRenderMode: process.env.DEFAULT_RENDER_MODE === 'blur' ? 'blur' : 'recorte',
  // true si el operador fijo DEFAULT_RENDER_MODE (recorte|blur): un modo vacio usa ese valor en vez de rotar.
  defaultRenderModeFijo: ['recorte', 'blur'].includes(process.env.DEFAULT_RENDER_MODE),
  maxQueue: Math.max(1, toInt(process.env.MAX_QUEUE, 20)),
  maxClipsStored: Math.max(1, toInt(process.env.MAX_CLIPS_STORED, 25)),

  // Extraccion multiple: de 4 a 5 clips de 30 a 60 s por video. El historial de rangos usados
  // (anti-duplicados) se guarda en dataDir; en Railway conviene montar un volumen para que sobreviva.
  segmentMinSeconds: Math.max(5, ritmo.segmentMinSeconds),
  segmentMaxSeconds: Math.max(ritmo.segmentMinSeconds, ritmo.segmentMaxSeconds),
  segmentsMin: Math.max(1, toInt(process.env.SEGMENTS_MIN, 4)),
  segmentsMax: Math.max(1, toInt(process.env.SEGMENTS_MAX, 5)),
  // Edicion con ritmo: cortes a frases completas, pausas eliminadas y alternancia de planos (medio / cerrado).
  editorialEnabled: process.env.EDITORIAL !== 'off',
  editorialPad: Math.max(0, toInt(process.env.EDITORIAL_PAD_SECONDS, 8)),
  hotCutGap: ritmo.hotCutGap,
  hotCutPad: Number(process.env.HOT_CUT_PAD) >= 0 && process.env.HOT_CUT_PAD ? Number(process.env.HOT_CUT_PAD) : 0.1,
  beatSeconds: ritmo.beatSeconds,
  punchZoom: Math.min(1.4, Math.max(1, ritmo.punchZoom)),
  dataDir: process.env.DATA_DIR || (volumen ? path.join(volumen, 'datos') : path.join(tmpDir, 'datos')),

  // Ollama (guionista local). Un solo modelo a la vez y keep_alive:0 en cada peticion (ver src/ollama.js): la RAM queda libre para FFmpeg.
  ollamaUrl: String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, ''),
  ollamaModel: String(process.env.OLLAMA_MODEL || '').trim() || 'qwen2.5:7b-instruct',
  ollamaNumCtx: Math.max(512, toInt(process.env.OLLAMA_NUM_CTX, 8192)),
  ollamaNumPredict: Math.max(64, toInt(process.env.OLLAMA_NUM_PREDICT, 1536)),
  ollamaTimeoutMs: Math.max(1000, toInt(process.env.OLLAMA_TIMEOUT_MS, 600000)),

  // Voz en off local (Piper, 100% offline; Parte 5). PIPER_PATH = ruta COMPLETA al binario (junto a el deben estar sus librerias y espeak-ng-data).
  // Las voces son archivos .onnx (+ .onnx.json) en PIPER_VOICES_DIR; PIPER_VOICE_EN_US / PIPER_VOICE_ES_US fijan cual usar (nombre o ruta).
  piperPath: String(process.env.PIPER_PATH || 'piper').trim(),
  piperVoicesDir: process.env.PIPER_VOICES_DIR || path.join(raiz, 'assets', 'voces'),
  piperVoiceEnUs: String(process.env.PIPER_VOICE_EN_US || '').trim(),
  piperVoiceEsUs: String(process.env.PIPER_VOICE_ES_US || '').trim(),
  piperLengthScale: Number(process.env.PIPER_LENGTH_SCALE) >= 0.5 && Number(process.env.PIPER_LENGTH_SCALE) <= 2 ? Number(process.env.PIPER_LENGTH_SCALE) : 1,
  piperTimeoutMs: Math.max(5000, toInt(process.env.PIPER_TIMEOUT_MS, 120000)),
  // Banco de medios en carpeta: <bancoDir>/{efectos,musica,medios}/<categoria>/archivo (seleccion aleatoria por categoria).
  bancoDir: process.env.BANCO_DIR || path.join(raiz, 'assets', 'banco'),

  sessionDir: process.env.SESSION_DIR || (volumen ? path.join(volumen, 'sesion') : path.join(tmpDir, 'sesion-datos')),
  sessionKey: String(process.env.SESSION_KEY || process.env.MASTER_KEY || '').trim(),
  sessionCheckMinutes: Math.max(0, toInt(process.env.SESSION_CHECK_MIN, 360)),
  sessionProbeUrl: process.env.SESSION_PROBE_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
});

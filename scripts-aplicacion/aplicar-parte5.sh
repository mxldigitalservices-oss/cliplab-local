#!/usr/bin/env bash
# aplicar-parte5.sh - ClipLab Pro, PARTE 5: voz Piper local (contrato de sintesis), banco de medios, produccion del canal stories
# (plan + render FFmpeg + concatenacion 9:16 por mercado), cola de guiones con rutas protegidas y control en el panel.
#
# Uso (desde la raiz del repo con las Partes 1 a 4 ya aplicadas):
#   bash aplicar-parte5.sh              aplica y corre las pruebas de la Parte 5 (~1 min)
#   bash aplicar-parte5.sh --completo   ademas corre npm test (tarda ~6 min)
#   bash aplicar-parte5.sh --simular    solo comprueba que se puede aplicar; no escribe nada
#   bash aplicar-parte5.sh /ruta/repo   aplica sobre otra carpeta
#
# Autocontenido y repetible: comprueba el sha256 de cada archivo existente que va a reemplazar (si no es el de la Parte 4 ni el de la
# Parte 5, aborta sin tocar nada), guarda copias en .respaldo-parte5/<fecha>/ y comprueba al final que pipeline.js, upload.js y
# rotacion*.js siguen exactamente igual. Nunca usa nano.
set -euo pipefail

COMPLETO=0; SIMULAR=0; RAIZ="$PWD"
for arg in "$@"; do
  case "$arg" in
    --completo) COMPLETO=1 ;;
    --simular) SIMULAR=1 ;;
    *) RAIZ="$arg" ;;
  esac
done
cd "$RAIZ"

fallar() { echo "ERROR: $*" >&2; exit 1; }
sha() { if [ -f "$1" ]; then sha256sum "$1" | cut -d" " -f1; else echo AUSENTE; fi; }

[ -f package.json ] && grep -q "\"name\": \"cliplab-pro\"" package.json || fallar "esta carpeta no es el repo cliplab-backend (falta package.json de cliplab-pro): $PWD"
for f in src/ollama.js src/engine/exclusion.js src/validador-ficha.js src/guionista.js src/guiones-cola.js src/memoria-proyecto.js src/routes/paquete.js tests/fixtures/ficha-ejemplo.mjs; do [ -f "$f" ] || fallar "faltan las Partes 1 a 4 (no existe $f)"; done
[ -d node_modules ] || echo "AVISO: no hay node_modules; corre npm ci antes de las pruebas."

PROTEGIDOS="src/engine/pipeline.js src/upload.js src/engine/rotacion.js src/engine/rotacion-estado.js src/engine/rotacion-flujo.js"
ANTES_PROTEGIDOS="$(for f in $PROTEGIDOS; do echo "$f $(sha "$f")"; done)"

comprobar_reemplazo() {   # ruta sha_parte4 sha_parte5
  local actual; actual="$(sha "$1")"
  if [ "$actual" != "$2" ] && [ "$actual" != "$3" ]; then
    fallar "$1 no coincide con la version de la Parte 4 ni con la de la Parte 5 (sha256 $actual). Alguien lo edito: no se escribio nada. Revisa el cambio o pide a Claude que lo integre."
  fi
}
comprobar_nuevo() {       # ruta sha_parte5
  local actual; actual="$(sha "$1")"
  if [ "$actual" != AUSENTE ] && [ "$actual" != "$2" ]; then
    fallar "$1 ya existe y es distinto de la Parte 5 (sha256 $actual): no se escribio nada."
  fi
}

comprobar_reemplazo "src/config/index.js" "ce2509faa0b539dfedcf823eadc8548f2896c3042325ce89908768351eaa170a" "8169cc170aa176a4d0370724738450cbfe3b552f0fbd2c066a45e7f0e3213af3"
comprobar_reemplazo "src/validador-ficha.js" "4fca047b9a7ff55a34ff7e2728d43d7a8f7635d3dd23eb17a08ac979875eb97a" "2115b814a66f903e0f059e5b124a01e019c88df92dd0770cefebb76abe4e806a"
comprobar_reemplazo "src/routes/index.js" "7c847e3b134e73843430e5e2e27e62ad3d1ead8c5fcbb12f37b06baa9ede8d5f" "210c3751b94f84f183701e27fcaac187a1945f037aa1cedab5c8beae58cdd28c"
comprobar_reemplazo "src/routes/paquete.js" "50e8994a6b9bf7b15f4e721fbf2038d8861b4f660887012b029ba0865afa9f11" "39299e64b530a6002b5212db820c2d5c5f98a48fa113888ea123ff7b85e0ffad"
comprobar_reemplazo "public/js/api.js" "1cc881b984275664487827bc712c0bfd135b37f75647868220949dcfe9abbf72" "27b71d28db2fab88b00fc79fb0b5a5c3bec8958c2b7caf366617a74b77680d2e"
comprobar_reemplazo "public/js/paquete.js" "e3bc5abeeca60dc1959b7806600754008d42b0cf8b360e236e10a9432428b772" "2d0c03b4713e9d59493ce367700382b1dcd71b508f6896425bd1cc45cc6996d8"
comprobar_reemplazo "public/index.html" "ff839546ebaaee4f67644e687de4be78441df1fe206a50944cae8b5110a95a72" "242b19351eec8e129b20dedf2d71f27b07f1c87bf4d2046b760fd47831f2e60a"
comprobar_reemplazo "public/css/styles.css" "aa2adad9a438889b7a7fda49fd564b50b463642638940cd787b065587fdd140e" "9bb9e04554d0aada88d4c252621d00cabb9dc229a1e29672a07e09f38f57c717"
comprobar_reemplazo "package.json" "a1d4517f2de9b57a9f9a38b1c4323176edb9a7edea74e7828d8e0ceb59a334d3" "73604a0820ef11cbae48bb9b7227b7573dba2c3d4929b10c30a601428a921f25"
comprobar_reemplazo ".env.example" "46173a8326fc980f9fa4e045ba700027c38913e73e8bfa8191c2d38eaf9966f9" "c6a79104de162650a582b2f309d6c020d4d8919f88bc965a544ca0c7cdc7d312"
comprobar_reemplazo "tests/validador-ficha.test.js" "89e82ea63d11e369c868b7e1f79737bfa5b42e9e0e04f48684494aaa1b138e66" "28b5410d0b2e65b754cfe734a46ff141fe8c6a1029609ad305125b6bddb67997"
comprobar_reemplazo "tests/paquete-rutas.test.js" "38db8fccdd7b8cfc624d6af8dfff1c3d43fbfe38e61e2ebf17f06430711fa287" "249b9365a87126868233384a2655b60b2ea698925dcef55f750091c3e335ab64"
comprobar_nuevo "src/voz.js" "550217378239bc57c930bc25693fb3132cf71efb13e1e63e921fb79db27bdb66"
comprobar_nuevo "src/banco-medios.js" "83cab43c93d9386f1c4bceefe683b43c4da09f1489b5a6ece7b877cfd59f43ef"
comprobar_nuevo "src/stories-plan.js" "7babab360be37c2b3a23a6b43cd515901c1a5714031e87c922825d52a2d14d3c"
comprobar_nuevo "src/engine/stories-render.js" "8ba1a8f0a29b45eee154eb8de332e5a9d38c562fe1ca902c0bfbbcb0c1ebdd92"
comprobar_nuevo "src/stories-produccion.js" "cc1a460f5a5f2ac4759f93c1d290c3a2e016146d3555c9a3d5f3ce09fefb8365"
comprobar_nuevo "src/trabajos-guion.js" "04fe628972c974a04eff63a3e46f79b4b485ecc3d6deab867facc406b49792ab"
comprobar_nuevo "src/routes/guiones.js" "e87adff4becc7c3555da314c524fe89c6ebe02c2de31d7dea306bf5195eb7578"
comprobar_nuevo "public/js/guiones.js" "ea7aba690f8e0367b6005657d1b982aae2c8c53b5fc59c44f2fc2f9b27a8e50d"
comprobar_nuevo "tests/voz.test.js" "4442cb6c9f36e2fe1fd00c12fae1b33a4acf1a224ea5fd00ccb5b13a9fccf07f"
comprobar_nuevo "tests/banco-medios.test.js" "fdf3b3ef1ed45999e9e0f7b236bd1ee75bd8d3a019c8306b6b5b70c690ee0d7e"
comprobar_nuevo "tests/stories-plan.test.js" "bf8144bc9f149bb224c492a2b3459be0e74f2fc20ce9441466f6c9aebd94ae02"
comprobar_nuevo "tests/stories-render.test.js" "c6f6f2bdd1043f4d551524321a3acea1be33284dab7a97961d4fe24cbd9837e8"
comprobar_nuevo "tests/stories-produccion.test.js" "a49218ea39c4fcbdb9f4cf5847e178c43191ed817b9ad9e602e5b7d45f1a45ad"
comprobar_nuevo "tests/guiones-rutas.test.js" "36d7d46d20e5427f53c652c985cc22dd1437027e96f10d254e3bfe4f1e396669"
comprobar_nuevo "tests/guiones-panel.test.js" "c9dd11b67879cc30e3453ef9e7558c5795cce057640f7a5860aa6d461060412d"
comprobar_nuevo "tests/fixtures/piper-falso.mjs" "0d4d0f1ba3289c93d6fd98895b75eff6bf721ff4070f89e997c90bfef22f2897"
echo "Comprobacion previa: OK ($PWD)"
[ "$SIMULAR" = 1 ] && { echo "Simulacion: se puede aplicar la Parte 5. No se escribio nada."; exit 0; }

RESPALDO=".respaldo-parte5/$(date +%Y%m%d-%H%M%S)"
for f in src/config/index.js src/validador-ficha.js src/routes/index.js src/routes/paquete.js public/js/api.js public/js/paquete.js public/index.html public/css/styles.css package.json .env.example tests/validador-ficha.test.js tests/paquete-rutas.test.js ESTADO_CLIPLAB_PRO.md .cliplab-handoff.json .gitignore; do
  if [ -f "$f" ]; then mkdir -p "$RESPALDO/$(dirname "$f")"; cp -p "$f" "$RESPALDO/$f"; fi
done
echo "Respaldo en $RESPALDO"

escribir() { mkdir -p "$(dirname "$1")"; cat > "$1"; echo "  escrito $1"; }

escribir "src/voz.js" <<'CLIPLAB_EOF_PARTE5'
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
CLIPLAB_EOF_PARTE5
escribir "src/banco-medios.js" <<'CLIPLAB_EOF_PARTE5'
// ---------------------------------------------------------------------------
// Banco de medios en carpeta (patron assets/efectos_sonido y assets/musica de ContentBotMXL-2, portado a Node):
//   <bancoDir>/efectos/<categoria>/*.wav|mp3|ogg|m4a      efectos de sonido (whoosh, impacto, ...)
//   <bancoDir>/musica/<categoria>/*.wav|mp3|ogg|m4a       musica de fondo (suspenso, calida, ...)
//   <bancoDir>/medios/<categoria>/*.mp4|mov|webm|jpg|png  fondos de escena (fondos, ciudad, estadio, ...) y medios/fotos/ para la ficha
// La categoria sale del texto del guion (nunca se usa tal cual como ruta): minusculas [a-z0-9_-], max. 32. Se elige un archivo al azar
// (rng inyectable, para pruebas y para que un mismo guion repita su seleccion). Solo archivos normales dentro del banco (sin
// ocultos ni enlaces que escapen). Si no hay archivos, devuelve null y el render usa un fondo generado: el banco es opcional.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';

export const TIPOS = Object.freeze({
  efectos: /\.(wav|mp3|ogg|m4a)$/i,
  musica: /\.(wav|mp3|ogg|m4a)$/i,
  medios: /\.(mp4|mov|webm|mkv|jpe?g|png|webp)$/i,
});
export const RE_CATEGORIA = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const RE_IMAGEN = /\.(jpe?g|png|webp)$/i;
const RE_NOMBRE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]*$/;

/** Generador pseudoaleatorio reproducible (mulberry32) a partir de un texto: mismo guion -> misma seleccion. */
export function crearRng(semilla = '') {
  let h = 1779033703 ^ String(semilla).length;
  for (const c of String(semilla)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validar(tipo, categoria) {
  if (!Object.hasOwn(TIPOS, tipo)) throw new Error('Tipo de banco no valido: ' + String(tipo));
  if (!RE_CATEGORIA.test(String(categoria))) throw new Error('Categoria no valida: ' + String(categoria).slice(0, 40));
}

/** Nombres de archivo (ordenados) de una categoria. [] si la carpeta no existe. */
export async function listarCategoria(tipo, categoria, { dir = config.bancoDir } = {}) {
  validar(tipo, categoria);
  const carpeta = path.join(dir, tipo, categoria);
  let entradas;
  try { entradas = await fs.readdir(carpeta, { withFileTypes: true }); } catch { return []; }
  const raiz = await fs.realpath(dir).catch(() => path.resolve(dir));
  const salida = [];
  for (const e of entradas) {
    if (!TIPOS[tipo].test(e.name) || !RE_NOMBRE.test(e.name)) continue;
    const ruta = path.join(carpeta, e.name);
    try {
      const real = await fs.realpath(ruta);
      if (!real.startsWith(raiz + path.sep) || !(await fs.stat(real)).isFile()) continue;
      salida.push(e.name);
    } catch { /* enlace roto */ }
  }
  return salida.sort();
}

/** Ruta absoluta de un archivo al azar de la categoria (sin repetir los de `excluir` si hay otros), o null. */
export async function elegir(tipo, categoria, { dir = config.bancoDir, rng = Math.random, excluir = [] } = {}) {
  const todos = await listarCategoria(tipo, categoria, { dir });
  if (!todos.length) return null;
  const libres = todos.filter((n) => !excluir.includes(n));
  const lista = libres.length ? libres : todos;
  return path.join(dir, tipo, categoria, lista[Math.min(lista.length - 1, Math.floor(rng() * lista.length))]);
}

/** Foto de la ficha: nombre de archivo dentro de medios/fotos (solo imagenes, sin rutas). null si no existe. */
export async function fotoDeFicha(nombre, { dir = config.bancoDir } = {}) {
  const n = String(nombre ?? '').trim();
  if (!n || !RE_NOMBRE.test(n) || !RE_IMAGEN.test(n)) return null;
  return (await listarCategoria('medios', 'fotos', { dir })).includes(n) ? path.join(dir, 'medios', 'fotos', n) : null;
}

/** { efectos: {categoria: n}, musica: {...}, medios: {...} } con lo que hay en disco. */
export async function resumen({ dir = config.bancoDir } = {}) {
  const salida = {};
  for (const tipo of Object.keys(TIPOS)) {
    salida[tipo] = {};
    let cats = [];
    try { cats = await fs.readdir(path.join(dir, tipo), { withFileTypes: true }); } catch { /* sin carpeta */ }
    for (const c of cats) {
      if (!c.isDirectory() || !RE_CATEGORIA.test(c.name)) continue;
      salida[tipo][c.name] = (await listarCategoria(tipo, c.name, { dir })).length;
    }
  }
  return salida;
}

/** Crea las carpetas base (vacias) para que el usuario solo tenga que copiar archivos. */
export async function asegurarEstructura({ dir = config.bancoDir } = {}) {
  const carpetas = ['efectos/whoosh', 'efectos/impacto', 'musica/suspenso', 'musica/calida', 'medios/fondos', 'medios/fotos'];
  for (const c of carpetas) await fs.mkdir(path.join(dir, c), { recursive: true });
  return carpetas;
}
CLIPLAB_EOF_PARTE5
escribir "src/stories-plan.js" <<'CLIPLAB_EOF_PARTE5'
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
CLIPLAB_EOF_PARTE5
escribir "src/engine/stories-render.js" <<'CLIPLAB_EOF_PARTE5'
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
CLIPLAB_EOF_PARTE5
escribir "src/stories-produccion.js" <<'CLIPLAB_EOF_PARTE5'
// ---------------------------------------------------------------------------
// Produccion del canal STORIES de punta a punta: guiones validados (uno por mercado) -> voz Piper -> render por parte -> video largo
// por mercado (concatenacion en orden, 9:16 heredado) -> clips en el store (para descargar y publicar a mano).
// Todo el trabajo pesado va dentro de UN candado ('ffmpeg' de exclusion.js): nunca a la vez que Ollama. Las dependencias
// (sintetizar, renderizar, concatenar, banco) son inyectables para probar sin Piper ni FFmpeg.
// Salida: <clipsDir>/stories-<id>-<mercado>-p<N>.mp4 y ...-largo.mp4. Un clip del store por parte (archivos por mercado) y uno por el largo.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';
import { concatenarPartes, elegirFuente, renderizarParte } from './engine/stories-render.js';
import { crearRng, elegir, fotoDeFicha } from './banco-medios.js';
import { MERCADO_PRINCIPAL } from './mercados.js';
import { planDeParte, planDeProduccion } from './stories-plan.js';
import { sintetizar } from './voz.js';

const URL_DE = (nombre) => '/clips/' + nombre;

async function moverFinal(origen, destino) {
  try { await fs.rename(origen, destino); } catch { await fs.copyFile(origen, destino); await fs.rm(origen, { force: true }); }
}

/**
 * entradas: [{ mercado, ficha, guion }]. opciones: { id, signal, avance(etapa, %), dirSalida, dirTemporal, bancoDir, musicaCategoria,
 *   fondoCategoria, deps:{ sintetizar, renderizar, concatenar, elegir, fotoDeFicha, fuente }, render:{ ancho, alto, hilos, preset, crf }, voz:{...} }
 * Devuelve { id, avisos, mercados:[{ mercado, titulo, partes:[{ n, archivo, url, duracion }], largo:{ archivo, url, duracion } }] }.
 */
export async function producirStories({ id, entradas, signal, avance = () => {}, dirSalida = config.clipsDir, dirTemporal, bancoDir = config.bancoDir, musicaCategoria = 'calida', fondoCategoria = 'fondos', deps = {}, render = {}, voz = {} } = {}) {
  const d = { sintetizar, renderizar: renderizarParte, concatenar: concatenarPartes, elegir, fotoDeFicha, ...deps };
  const plan = planDeProduccion({ id, canal: 'stories', entradas });
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'stories', plan.id);
  const fuente = deps.fuente !== undefined ? deps.fuente : await elegirFuente();
  await fs.mkdir(dirSalida, { recursive: true });
  await fs.rm(trabajo, { recursive: true, force: true });
  await fs.mkdir(trabajo, { recursive: true });
  const totalPasos = plan.resumen.renders + plan.resumen.concatenaciones;
  let hechos = 0;
  const paso = (texto) => avance(texto, (hechos / totalPasos) * 100);
  const avisos = [...plan.avisos];

  try {
    return await exclusion.ejecutar('ffmpeg', async () => {
      const resultados = [];
      for (const m of plan.mercados) {
        const salidas = [];
        for (const p of m.partes) {
          if (signal && signal.aborted) throw new Error('Produccion cancelada.');
          paso(m.mercado + ' · parte ' + p.n + ': voz');
          const wav = path.join(trabajo, `${m.mercado}-p${p.n}.wav`);
          const v = await d.sintetizar({ texto: p.parte.narracion, mercado: m.mercado, salida: wav, signal, ...voz });
          const pp = planDeParte({ parte: p.parte, ficha: m.ficha, mercado: m.mercado, duracionVoz: v.duracionSeg });
          avisos.push(...pp.avisos);

          paso(m.mercado + ' · parte ' + p.n + ': video');
          const rng = crearRng(plan.id + '|' + m.mercado + '|' + p.n);
          const usados = [];
          const medios = [];
          for (let i = 0; i < pp.escenas.length; i++) {
            const ruta = await d.elegir('medios', fondoCategoria, { dir: bancoDir, rng, excluir: usados });
            if (ruta) usados.push(path.basename(ruta));
            medios.push(ruta);
          }
          const sfx = [];
          for (const e of pp.escenas) {
            if (!e.sonido) continue;
            const ruta = await d.elegir('efectos', e.sonido, { dir: bancoDir, rng });
            if (ruta) sfx.push({ ruta, inicio: e.inicio });
          }
          const musica = await d.elegir('musica', musicaCategoria, { dir: bancoDir, rng });
          const foto = pp.ficha && pp.ficha.foto ? await d.fotoDeFicha(pp.ficha.foto, { dir: bancoDir }) : null;
          if (pp.ficha && pp.ficha.foto && !foto) avisos.push('La foto "' + pp.ficha.foto + '" no esta en medios/fotos del banco: la ficha sale sin foto.');

          const temporal = path.join(trabajo, p.archivo);
          await d.renderizar({ dirTrabajo: path.join(trabajo, `w-${m.mercado}-p${p.n}`), plan: pp, voz: wav, salida: temporal, medios, musica, sfx, foto, fuente, signal, ...render });
          await moverFinal(temporal, path.join(dirSalida, p.archivo));
          await fs.rm(wav, { force: true });
          hechos++;
          salidas.push({ n: p.n, archivo: p.archivo, url: URL_DE(p.archivo), duracion: pp.duracionTotal });
        }
        paso(m.mercado + ': video largo');
        await d.concatenar(salidas.map((s) => path.join(dirSalida, s.archivo)), path.join(trabajo, m.largo.archivo), { dirTrabajo: trabajo, signal });
        await moverFinal(path.join(trabajo, m.largo.archivo), path.join(dirSalida, m.largo.archivo));
        hechos++;
        resultados.push({ mercado: m.mercado, titulo: m.titulo, partes: salidas, largo: { archivo: m.largo.archivo, url: URL_DE(m.largo.archivo), duracion: Math.round(salidas.reduce((s, x) => s + x.duracion, 0) * 1000) / 1000 } });
      }
      avance('Listo', 100);
      return { id: plan.id, avisos, mercados: resultados };
    }, { signal });
  } finally {
    await fs.rm(trabajo, { recursive: true, force: true });
  }
}

/**
 * Crea en el store un clip por parte (con `archivos` por mercado; `url` = mercado principal) y uno por el video largo.
 * `store` se inyecta (encolar/completar). Devuelve los ids de clip creados.
 */
export function registrarClips({ store, resultado, entradas }) {
  const principal = resultado.mercados.find((m) => m.mercado === MERCADO_PRINCIPAL) || resultado.mercados[0];
  const narracionDe = (mercado, n) => { const e = entradas.find((x) => x.mercado === mercado); const p = e && e.guion.partes.find((x) => x.n === n); return p ? String(p.narracion) : ''; };
  const ids = [];
  const crear = (titulo, archivos, duracion, transcripcion, extra) => {
    const clip = store.encolar('stories:' + resultado.id, { origen: 'stories' });
    store.completar(clip.id, { titulo, url: archivos[principal.mercado] ?? Object.values(archivos)[0], archivos, duracion, transcripcion, canal: 'stories', serie: resultado.id, ...extra });
    ids.push(clip.id);
  };
  const etiqueta = principal.mercado.startsWith('es') ? 'Parte' : 'Part';
  for (const p of principal.partes) {
    const archivos = {};
    for (const m of resultado.mercados) { const q = m.partes.find((x) => x.n === p.n); if (q) archivos[m.mercado] = q.url; }
    crear(`${principal.titulo} — ${etiqueta} ${p.n}`, archivos, p.duracion, narracionDe(principal.mercado, p.n), { parte: p.n });
  }
  const largos = {};
  for (const m of resultado.mercados) largos[m.mercado] = m.largo.url;
  crear(`${principal.titulo} — ${principal.mercado.startsWith('es') ? 'Serie completa' : 'Full Series'}`, largos, principal.largo.duracion, '', { parte: null, largo: true });
  return ids;
}
CLIPLAB_EOF_PARTE5
escribir "src/trabajos-guion.js" <<'CLIPLAB_EOF_PARTE5'
// ---------------------------------------------------------------------------
// Un solo trabajo pesado de guion/produccion a la vez (generar guion con Ollama o producir video con Piper + FFmpeg), con su estado en
// memoria para que el panel lo consulte. La RAM no alcanza para dos; ademas exclusion.js serializa Ollama/FFmpeg por dentro.
// `iniciar(tipo, fn)` devuelve false si ya hay uno corriendo; fn recibe ({ senal, avance }) y su resultado queda en estado().resultado.
// ---------------------------------------------------------------------------
import { logger } from './utils/logger.js';

export function crearGestor() {
  let actual = null;
  let controlador = null;
  const estado = () => (actual ? { ...actual } : { tipo: null, estado: 'libre' });
  function iniciar(tipo, fn) {
    if (actual && actual.estado === 'corriendo') return false;
    controlador = new AbortController();
    const mio = { tipo, estado: 'corriendo', etapa: 'Iniciando', progreso: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null };
    actual = mio;
    const avance = (etapa, progreso) => { if (actual === mio) { if (etapa) mio.etapa = String(etapa); if (Number.isFinite(progreso)) mio.progreso = Math.max(0, Math.min(100, Math.round(progreso))); } };
    Promise.resolve()
      .then(() => fn({ senal: controlador.signal, avance }))
      .then((resultado) => { mio.estado = 'ok'; mio.etapa = 'Listo'; mio.progreso = 100; mio.resultado = resultado ?? null; })
      .catch((error) => { mio.estado = 'error'; mio.error = error && error.message ? error.message : String(error); logger.warn('Trabajo de guion fallido', { tipo, mensaje: mio.error }); })
      .finally(() => { mio.fin = new Date().toISOString(); });
    return true;
  }
  const cancelar = () => { if (controlador && actual && actual.estado === 'corriendo') controlador.abort(); };
  return { iniciar, estado, cancelar };
}

export const gestor = crearGestor();
CLIPLAB_EOF_PARTE5
escribir "src/routes/guiones.js" <<'CLIPLAB_EOF_PARTE5'
import { Router } from 'express';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { config } from '../config/index.js';
import { gestor } from '../trabajos-guion.js';
import { encolarGuion, leerGuion, listarFallidos, listarPendientes, listarProcesados, procesarSiguiente } from '../guiones-cola.js';
import { normalizarFicha } from '../validador-ficha.js';
import { modelosInstalados, ErrorOllama } from '../ollama.js';
import { verificarPiper } from '../voz.js';
import { resumen as resumenBanco } from '../banco-medios.js';
import { MERCADOS } from '../mercados.js';
import { planDeProduccion, ErrorProduccion } from '../stories-plan.js';
import { producirStories, registrarClips } from '../stories-produccion.js';

// Cola de guiones (ficha -> guion con Ollama) y produccion de video del canal stories (Piper + FFmpeg).
// Cada ruta lleva su propia llave maestra. Lo pesado corre en segundo plano (un trabajo a la vez): los POST responden 202 y el panel
// consulta GET /guiones/estado.
const router = Router();
const RE_ID = /^[0-9]{13}-[0-9a-f]{8}$/;
const ESTADOS = ['pendientes', 'procesados', 'fallidos'];

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) { res.status(error.status).json({ ok: false, error: error.message }); return; }
  next(error);
}

async function resumenDe(estado, id) {
  try {
    const g = await leerGuion(estado, id);
    return { id, titulo: g.ficha.titulo, canal: g.ficha.canal, mercado: g.ficha.mercado, proyecto: g.ficha.proyecto || null, partes: g.guion ? g.guion.partes.length : (g.ficha.partes || null), intentos: g.intentos ?? null, problemas: g.problemas ?? [], avisos: g.avisos ?? [], error: g.error ?? null };
  } catch {
    return { id, titulo: '(ilegible)', canal: null, mercado: null, proyecto: null, partes: null, intentos: null, problemas: [], avisos: [], error: 'No se pudo leer el archivo.' };
  }
}

async function listaDe(estado, ids) {
  return Promise.all(ids.slice(-50).reverse().map((id) => resumenDe(estado, id)));
}

router.get('/guiones/entorno', requireMasterKey, async (req, res, next) => {
  try {
    const ollama = { url: config.ollamaUrl, modelo: config.ollamaModel, activo: false, instalado: false, error: null };
    try {
      const modelos = await modelosInstalados({ timeoutMs: 3000 });
      ollama.activo = true;
      ollama.instalado = modelos.includes(config.ollamaModel.replace(/:latest$/, ''));
      ollama.modelos = modelos;
    } catch (e) { ollama.error = e instanceof ErrorOllama ? e.message : String(e.message || e); }
    const piper = await verificarPiper();
    const banco = await resumenBanco();
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ollama, piper: { binario: piper.binario, ruta: piper.ruta, voces: piper.voces, listo: piper.listo }, banco, mercados: Object.values(MERCADOS).map((m) => ({ id: m.id, nombre: m.nombre })) });
  } catch (error) { next(error); }
});

router.get('/guiones/estado', requireMasterKey, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, trabajo: gestor.estado() });
});

router.get('/guiones', requireMasterKey, async (req, res, next) => {
  try {
    const [pend, proc, fall] = await Promise.all([listarPendientes(), listarProcesados(), listarFallidos()]);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, pendientes: await listaDe('pendientes', pend), procesados: await listaDe('procesados', proc), fallidos: await listaDe('fallidos', fall), trabajo: gestor.estado() });
  } catch (error) { next(error); }
});

router.post('/guiones', requireMasterKey, async (req, res, next) => {
  try {
    const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
    const ficha = normalizarFicha(cuerpo.ficha);   // ErrorFicha (400) con la lista de problemas
    const ids = [(await encolarGuion(ficha)).id];
    if (cuerpo.tambienEsUS === true && ficha.mercado === 'en-US') {
      // La version es-US usa la misma ficha (los hechos son los mismos); el titulo puede ir traducido en tituloEs.
      const titulo = String(cuerpo.tituloEs ?? '').trim() || ficha.titulo;
      ids.push((await encolarGuion({ ...ficha, titulo, mercado: 'es-US' })).id);
    }
    res.status(201).json({ ok: true, ids });
  } catch (error) { next(error); }
});

router.post('/guiones/procesar', requireMasterKey, async (req, res, next) => {
  try {
    if ((await listarPendientes()).length === 0) throw new ErrorHttp(404, 'No hay guiones pendientes.');
    const arrancado = gestor.iniciar('guion', async ({ avance }) => {
      avance('Escribiendo el guion con Ollama (puede tardar varios minutos)', 5);
      const r = await procesarSiguiente();
      if (!r) return { vacio: true };
      if (!r.ok && r.motivo === 'ollama') throw new Error('Ollama no respondio: ' + r.error + ' El guion sigue en pendientes.');
      return r;
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine.');
    res.status(202).json({ ok: true, trabajo: gestor.estado() });
  } catch (error) { responderError(error, res, next); }
});

router.post('/guiones/producir', requireMasterKey, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? [...new Set(req.body.ids.map(String))] : [];
    if (ids.length < 1 || ids.length > 2) throw new ErrorHttp(400, 'Elige uno o dos guiones procesados (uno por mercado).');
    if (ids.some((id) => !RE_ID.test(id))) throw new ErrorHttp(400, 'Id de guion no valido.');
    const entradas = [];
    for (const id of ids) {
      let g;
      try { g = await leerGuion('procesados', id); } catch { throw new ErrorHttp(404, 'El guion ' + id + ' no esta entre los procesados.'); }
      entradas.push({ mercado: g.ficha.mercado, ficha: g.ficha, guion: g.guion });
    }
    const idProduccion = 'p' + Date.now().toString(36);
    planDeProduccion({ id: idProduccion, canal: entradas[0].ficha.canal, entradas });   // valida antes de arrancar (ErrorProduccion = 400)
    const arrancado = gestor.iniciar('produccion', async ({ senal, avance }) => {
      const resultado = await producirStories({ id: idProduccion, entradas, signal: senal, avance });
      const clips = registrarClips({ store, resultado, entradas });
      return { id: idProduccion, clips, avisos: resultado.avisos, videos: resultado.mercados.map((m) => ({ mercado: m.mercado, partes: m.partes.length, largo: m.largo.url })) };
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine.');
    res.status(202).json({ ok: true, trabajo: gestor.estado() });
  } catch (error) {
    if (error instanceof ErrorProduccion) { res.status(400).json({ ok: false, error: error.message }); return; }
    responderError(error, res, next);
  }
});

router.get('/guiones/:estado/:id', requireMasterKey, async (req, res, next) => {
  try {
    if (!ESTADOS.includes(req.params.estado)) throw new ErrorHttp(404, 'Estado no valido.');
    if (!RE_ID.test(req.params.id)) throw new ErrorHttp(404, 'Guion no encontrado.');
    let g;
    try { g = await leerGuion(req.params.estado, req.params.id); } catch { throw new ErrorHttp(404, 'Guion no encontrado.'); }
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, estado: req.params.estado, guion: g });
  } catch (error) { responderError(error, res, next); }
});

export default router;
CLIPLAB_EOF_PARTE5
escribir "public/js/guiones.js" <<'CLIPLAB_EOF_PARTE5'
// Guiones y produccion de stories (Parte 5). Boton "Guiones" de la barra superior -> dialogo con:
//   Entorno (Ollama / Piper / banco), formulario de ficha, cola (pendientes -> procesados / fallidos) y produccion de video.
// Cada control llama a una ruta real de /api/panel/guiones. Todo el texto entra con textContent (sin HTML inyectado).
import { obtenerCanales, obtenerEntornoGuiones, listarGuiones, estadoTrabajoGuion, encolarGuionFicha, procesarGuion, producirGuiones } from './api.js';
import { el, toast } from './ui.js';

const TIPOS = ['fecha', 'lugar', 'cifra', 'persona', 'dato'];
let dialogo = null;
let temporizador = null;
let seleccion = new Set();
let ultimoTrabajo = '';

/** "lugar: Lisbon" por linea -> [{tipo, valor}]. Devuelve { hechos, errores }. */
export function parsearHechos(texto) {
  const hechos = [];
  const errores = [];
  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const m = /^\s*([A-Za-z]+)\s*[:=]\s*(.+?)\s*$/.exec(linea);
    if (!m || !TIPOS.includes(m[1].toLowerCase())) { errores.push('Linea ' + (i + 1) + ': usa "tipo: valor" con tipo ' + TIPOS.join(', ') + '.'); return; }
    hechos.push({ tipo: m[1].toLowerCase(), valor: m[2] });
  });
  return { hechos, errores };
}

function zona(nombre) { return dialogo.querySelector('[data-zona="' + nombre + '"]'); }

function aviso(texto, tipo = 'info') {
  const z = zona('estado');
  z.textContent = texto;
  z.dataset.tipo = tipo;
  z.hidden = !texto;
}

function fila(g, estado) {
  const marca = estado === 'procesados'
    ? el('input', { type: 'checkbox', 'aria-label': 'Elegir ' + g.titulo, onchange: (e) => { if (e.target.checked) seleccion.add(g.id); else seleccion.delete(g.id); actualizarBotones(); } })
    : null;
  if (marca && seleccion.has(g.id)) marca.checked = true;
  const detalle = [];
  if (g.problemas && g.problemas.length) detalle.push(el('ul', { class: 'lista-problemas' }, g.problemas.map((p) => el('li', { text: p }))));
  if (g.avisos && g.avisos.length) detalle.push(el('p', { class: 'suave', text: 'Avisos: ' + g.avisos.join(' | ') }));
  if (g.error) detalle.push(el('p', { class: 'suave', text: g.error }));
  return el('li', { class: 'guion-fila' }, marca, el('div', {},
    el('strong', { text: g.titulo }), ' ', el('span', { class: 'suave', text: [g.canal, g.mercado, g.partes ? g.partes + ' parte(s)' : null, g.intentos ? g.intentos + ' intento(s)' : null].filter(Boolean).join(' · ') }), ...detalle));
}

function pintarLista(nombre, lista, estado, vacio) {
  const z = zona(nombre);
  z.replaceChildren(...(lista.length ? lista.map((g) => fila(g, estado)) : [el('li', { class: 'suave', text: vacio })]));
}

function actualizarBotones() {
  const ocupado = dialogo.dataset.ocupado === '1';
  zona('btn-procesar').disabled = ocupado || dialogo.dataset.pendientes === '0';
  zona('btn-producir').disabled = ocupado || seleccion.size < 1 || seleccion.size > 2;
}

function pintarTrabajo(t) {
  const caja = zona('trabajo');
  const ocupado = t.estado === 'corriendo';
  dialogo.dataset.ocupado = ocupado ? '1' : '0';
  if (!t.tipo) caja.textContent = 'Sin trabajos en curso.';
  else if (ocupado) caja.textContent = (t.tipo === 'guion' ? 'Guion' : 'Produccion') + ': ' + t.etapa + ' (' + t.progreso + '%)';
  else if (t.estado === 'ok') caja.textContent = (t.tipo === 'guion' ? 'Guion listo.' : 'Produccion lista: los videos estan en "Todos los clips" (boton Publicar a mano).') + (t.resultado && t.resultado.avisos && t.resultado.avisos.length ? ' Avisos: ' + t.resultado.avisos.join(' | ') : '');
  else caja.textContent = 'Fallo: ' + (t.error || 'sin detalle');
  caja.dataset.tipo = t.estado === 'error' ? 'error' : t.estado === 'ok' ? 'ok' : 'info';
  const huella = t.tipo + t.estado + t.fin;
  if (!ocupado && huella !== ultimoTrabajo) { if (ultimoTrabajo) refrescar(false); ultimoTrabajo = huella; }
  actualizarBotones();
}

async function refrescar(conEntorno = true) {
  try {
    const datos = await listarGuiones();
    dialogo.dataset.pendientes = String(datos.pendientes.length);
    seleccion = new Set([...seleccion].filter((id) => datos.procesados.some((g) => g.id === id)));
    pintarLista('pendientes', datos.pendientes, 'pendientes', 'No hay fichas pendientes.');
    pintarLista('procesados', datos.procesados, 'procesados', 'Aun no hay guiones procesados.');
    pintarLista('fallidos', datos.fallidos, 'fallidos', 'Sin guiones fallidos.');
    pintarTrabajo(datos.trabajo);
  } catch (error) {
    aviso('No se pudo leer la cola: ' + error.message, 'error');
  }
  if (conEntorno) comprobarEntorno();
}

async function comprobarEntorno() {
  const caja = zona('entorno');
  caja.textContent = 'Comprobando…';
  try {
    const e = await obtenerEntornoGuiones();
    const ollama = e.ollama.activo ? (e.ollama.instalado ? 'Ollama listo (' + e.ollama.modelo + ')' : 'Ollama activo, falta el modelo ' + e.ollama.modelo + ' (ollama pull ' + e.ollama.modelo + ')') : 'Ollama NO responde (' + (e.ollama.error || 'sin conexion') + ')';
    const voces = Object.entries(e.piper.voces).map(([m, v]) => m + ': ' + (v ? 'ok' : 'falta voz')).join(', ');
    const piper = e.piper.binario ? 'Piper listo (' + voces + ')' : 'Piper NO encontrado en ' + e.piper.ruta + ' (define PIPER_PATH)';
    const n = Object.values(e.banco).reduce((s, tipo) => s + Object.values(tipo).reduce((a, b) => a + b, 0), 0);
    caja.replaceChildren(el('div', { text: ollama }), el('div', { text: piper }), el('div', { text: 'Banco de medios: ' + n + ' archivo(s)' + (n ? '' : ' (opcional: sin el, los fondos son colores)') }));
  } catch (error) {
    caja.textContent = 'No se pudo comprobar el entorno: ' + error.message;
  }
}

async function encolar(formulario) {
  const v = (n) => formulario.elements[n];
  const { hechos, errores } = parsearHechos(v('hechos').value);
  if (errores.length) { aviso(errores.join(' '), 'error'); return; }
  const ficha = { titulo: v('titulo').value, canal: v('canal').value, mercado: v('mercado').value, hechos, fuente: v('fuente').value, partes: v('partes').value, proyecto: v('proyecto').value, foto: v('foto').value, continuar: v('continuar').checked };
  const opciones = v('esus').checked ? { tambienEsUS: true, tituloEs: v('tituloes').value } : {};
  try {
    const r = await encolarGuionFicha(ficha, opciones);
    aviso('Ficha en la cola (' + r.ids.length + ' guion(es)).', 'ok');
    formulario.reset();
    refrescar(false);
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function accion(promesa, textoOk) {
  try {
    const r = await promesa();
    aviso(textoOk, 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(async () => {
    if (!dialogo.open) { clearInterval(temporizador); return; }
    try { pintarTrabajo((await estadoTrabajoGuion()).trabajo); } catch { /* se reintenta */ }
  }, 3000);
}

async function llenarCanales() {
  const selector = dialogo.querySelector('[name="canal"]');
  try {
    const c = await obtenerCanales();
    selector.replaceChildren(el('option', { value: '', text: 'Elige el canal' }), ...c.canales.map((x) => el('option', { value: x.id, text: x.nombre })));
  } catch { /* queda el selector vacio: el servidor rechaza una ficha sin canal */ }
}

function crearDialogo() {
  const campo = (etiqueta, control) => el('label', { class: 'campo' }, etiqueta, control);
  const formulario = el('form', { class: 'form-ficha', autocomplete: 'off', onsubmit: (e) => { e.preventDefault(); encolar(formulario); } },
    campo('Titulo', el('input', { name: 'titulo', required: true, maxlength: '160' })),
    el('div', { class: 'fila-campos' },
      campo('Canal', el('select', { name: 'canal', required: true }, el('option', { value: '', text: 'Elige el canal' }))),
      campo('Mercado', el('select', { name: 'mercado' }, el('option', { value: 'en-US', text: 'en-US (principal)' }), el('option', { value: 'es-US', text: 'es-US' }))),
      campo('Partes', el('input', { name: 'partes', type: 'number', min: '1', max: '12', placeholder: '1' }))),
    campo('Hechos (uno por linea: tipo: valor)', el('textarea', { name: 'hechos', rows: '5', required: true, placeholder: 'persona: Marco Silva\nlugar: Lisbon, Portugal\nfecha: March 3, 1998\ncifra: 12 goals' })),
    el('div', { class: 'fila-campos' },
      campo('Fuente (opcional)', el('input', { name: 'fuente', maxlength: '300' })),
      campo('Proyecto (serie)', el('input', { name: 'proyecto', placeholder: 'marco-silva' })),
      campo('Foto (medios/fotos)', el('input', { name: 'foto', placeholder: 'marco.jpg' }))),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'continuar' }), ' Continuar la serie (siguiente Parte N del proyecto)'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'esus' }), ' Crear tambien la version es-US'),
    campo('Titulo en espanol (solo es-US)', el('input', { name: 'tituloes', maxlength: '160' })),
    el('button', { class: 'btn btn-primario', type: 'submit', text: 'Agregar a la cola' }));
  const btnProcesar = el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-procesar', text: 'Escribir guion (siguiente pendiente)', onclick: () => accion(procesarGuion, 'Escribiendo el guion con Ollama…') });
  const btnProducir = el('button', { class: 'btn btn-primario', type: 'button', 'data-zona': 'btn-producir', text: 'Producir video (elegidos)', onclick: () => accion(() => producirGuiones([...seleccion]), 'Produccion iniciada.') });
  const d = el('dialog', { id: 'dlg-guiones', class: 'dlg-guiones' },
    el('h2', { text: 'Guiones y produccion' }),
    el('div', { class: 'estado-entorno', 'data-zona': 'entorno' }),
    el('p', { class: 'estado', 'data-zona': 'estado', hidden: true }),
    el('p', { class: 'estado', 'data-zona': 'trabajo', text: 'Sin trabajos en curso.' }),
    formulario,
    el('h3', { text: 'Pendientes' }), el('ul', { class: 'guion-lista', 'data-zona': 'pendientes' }), btnProcesar,
    el('h3', { text: 'Procesados (elige 1 o 2: uno por mercado)' }), el('ul', { class: 'guion-lista', 'data-zona': 'procesados' }), btnProducir,
    el('h3', { text: 'Fallidos' }), el('ul', { class: 'guion-lista', 'data-zona': 'fallidos' }),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn', type: 'button', text: 'Actualizar', onclick: () => refrescar(true) }),
      el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() })));
  d.dataset.ocupado = '0';
  d.dataset.pendientes = '0';
  d.addEventListener('close', () => clearInterval(temporizador));
  document.body.appendChild(d);
  return d;
}

export async function abrirGuiones() {
  if (!dialogo) { dialogo = crearDialogo(); llenarCanales(); }
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  await refrescar(true);
  iniciarSondeo();
}

const boton = document.getElementById('btn-guiones');
if (boton) boton.addEventListener('click', () => { abrirGuiones().catch((e) => toast('No se pudo abrir Guiones: ' + e.message, 'error')); });
CLIPLAB_EOF_PARTE5
escribir "tests/voz.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-voz-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { sintetizar, vozDeMercado, verificarPiper, limpiarTexto, duracionWav, ErrorVoz, MAX_CARACTERES } = await import('../src/voz.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const FALSO = path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs');
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const voces = path.join(raiz, 'voces');
await fs.mkdir(voces, { recursive: true });
for (const n of ['en_US-lessac-low.onnx', 'en_US-lessac-medium.onnx', 'en_US-amy-low.onnx', 'es_MX-claude-high.onnx', 'es_ES-davefx-medium.onnx', 'fr_FR-x-low.onnx', 'en_US-falla-low.onnx']) await fs.writeFile(path.join(voces, n), 'modelo');
const opciones = (extra = {}) => ({ binario: process.execPath, argsPrevios: [FALSO], ...extra });
const wav = (n) => path.join(raiz, 'salida-' + n + '.wav');

test('limpiarTexto: una sola linea, sin controles; vacio o enorme es error de texto (400)', () => {
  assert.equal(limpiarTexto('  Hola\n\n mundo\t\u0000 ok  '), 'Hola mundo ok');
  assert.throws(() => limpiarTexto('   \n '), (e) => e instanceof ErrorVoz && e.tipo === 'texto' && e.status === 400);
  assert.throws(() => limpiarTexto('x'.repeat(MAX_CARACTERES + 1)), /pasa de/);
  assert.equal(limpiarTexto('x'.repeat(MAX_CARACTERES)).length, MAX_CARACTERES);
});

test('vozDeMercado: elige por mercado y prefiere mas calidad (high > medium > low)', async () => {
  assert.equal(path.basename(await vozDeMercado('en-US', { dir: voces })), 'en_US-lessac-medium.onnx');
  assert.equal(path.basename(await vozDeMercado('es-US', { dir: voces })), 'es_MX-claude-high.onnx');
  assert.equal(await vozDeMercado('en_us', { dir: path.join(raiz, 'no-existe') }), null);
  await assert.rejects(vozDeMercado('fr-FR', { dir: voces }), /ercado/);   // sin valor por defecto ni mercados inventados
});

test('vozDeMercado: una voz fija (nombre o ruta) manda sobre la autodeteccion; si no existe, null', async () => {
  assert.equal(path.basename(await vozDeMercado('en-US', { dir: voces, fija: 'en_US-amy-low.onnx' })), 'en_US-amy-low.onnx');
  assert.equal(await vozDeMercado('en-US', { dir: voces, fija: path.join(voces, 'en_US-amy-low.onnx') }), path.join(voces, 'en_US-amy-low.onnx'));
  assert.equal(await vozDeMercado('en-US', { dir: voces, fija: 'otra.onnx' }), null);
});

test('sintetizar (contrato): escribe el WAV, devuelve duracion, mercado, voz y sampleRate', async () => {
  const texto = 'In 1998 the story of Marco Silva began in Lisbon, and the whole neighborhood noticed it.';   // 90 caracteres -> 6 s
  const r = await sintetizar({ texto, mercado: 'en-US', salida: wav('a'), modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() });
  assert.equal(r.archivo, wav('a'));
  assert.equal(r.mercado, 'en-US');
  assert.equal(r.voz, 'en_US-lessac-low.onnx');
  assert.equal(r.sampleRate, 16000);
  assert.ok(Math.abs(r.duracionSeg - texto.length / 15) < 0.1, String(r.duracionSeg));
  assert.ok((await fs.stat(wav('a'))).size > 44);
  assert.ok(Math.abs((await duracionWav(wav('a'))).duracionSeg - r.duracionSeg) < 0.001);
});

test('sintetizar: length_scale alarga la voz; un valor fuera de 0.5-2 se ignora (vuelve a 1)', async () => {
  const base = { texto: 'x'.repeat(150), mercado: 'en-US', modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() };
  const normal = await sintetizar({ ...base, salida: wav('n') });
  const lenta = await sintetizar({ ...base, salida: wav('l'), lengthScale: 1.5 });
  const absurda = await sintetizar({ ...base, salida: wav('s'), lengthScale: 9 });
  assert.ok(Math.abs(lenta.duracionSeg / normal.duracionSeg - 1.5) < 0.02);
  assert.ok(Math.abs(absurda.duracionSeg - normal.duracionSeg) < 0.01);
});

test('sintetizar: el texto va por stdin (jamas en la linea de comandos) y la voz sale del directorio', async () => {
  const secreto = 'texto; rm -rf / `whoami` $(id) "comillas"';
  const r = await sintetizar({ texto: secreto, mercado: 'es-US', salida: wav('p'), modelo: path.join(voces, 'es_MX-claude-high.onnx'), ...opciones() });
  assert.ok(r.duracionSeg >= 0.5);
});

test('sintetizar: sin voz -> ErrorVoz(sin_voz) que dice donde ponerla', async () => {
  await assert.rejects(sintetizar({ texto: 'hola', mercado: 'en-US', salida: wav('x'), dirVoces: path.join(raiz, 'sin-voces'), ...opciones() }), (e) => e.tipo === 'sin_voz' && /PIPER_VOICE_EN_US/.test(e.message) && e.status === 502);
});

test('sintetizar: binario inexistente -> sin_binario con la pista PIPER_PATH', async () => {
  await assert.rejects(sintetizar({ texto: 'hola', mercado: 'en-US', salida: wav('y'), modelo: path.join(voces, 'en_US-lessac-low.onnx'), binario: path.join(raiz, 'no-existe-piper') }), (e) => e.tipo === 'sin_binario' && /PIPER_PATH/.test(e.message));
});

test('sintetizar: Piper sale con error -> fallo (con su stderr); no escribe nada -> salida', async () => {
  await assert.rejects(sintetizar({ texto: 'hola', mercado: 'en-US', salida: wav('f'), modelo: path.join(voces, 'en_US-falla-low.onnx'), ...opciones() }), (e) => e.tipo === 'fallo' && /onnx error simulado/.test(e.message));
  process.env.PIPER_FALSO = 'vacio';
  try {
    await assert.rejects(sintetizar({ texto: 'hola', mercado: 'en-US', salida: wav('v'), modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() }), (e) => e.tipo === 'salida');
  } finally { delete process.env.PIPER_FALSO; }
});

test('sintetizar: timeout y cancelacion matan el proceso', async () => {
  process.env.PIPER_FALSO = 'colgar';
  try {
    const base = { texto: 'hola', mercado: 'en-US', modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() };
    await assert.rejects(sintetizar({ ...base, salida: wav('t'), timeoutMs: 300 }), (e) => e.tipo === 'timeout');
    const ctl = new AbortController();
    const p = sintetizar({ ...base, salida: wav('c'), signal: ctl.signal });
    setTimeout(() => ctl.abort(), 100);
    await assert.rejects(p, (e) => e.tipo === 'cancelado' || /cancel|abort/i.test(String(e.message)));
    await assert.rejects(sintetizar({ ...base, salida: wav('c2'), signal: AbortSignal.abort() }), /cancel|abort/i);
  } finally { delete process.env.PIPER_FALSO; }
});

test('sintetizar: argumentos invalidos (salida relativa o no .wav, mercado sin definir, texto vacio)', async () => {
  const base = { texto: 'hola', mercado: 'en-US', modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() };
  await assert.rejects(sintetizar({ ...base, salida: 'relativa.wav' }), (e) => e.tipo === 'salida');
  await assert.rejects(sintetizar({ ...base, salida: path.join(raiz, 'x.mp3') }), (e) => e.tipo === 'salida');
  await assert.rejects(sintetizar({ ...base, mercado: '', salida: wav('z') }), /ercado/);
  await assert.rejects(sintetizar({ ...base, texto: ' ', salida: wav('z') }), (e) => e.tipo === 'texto');
});

test('sintetizar: pasa por el candado (no corre a la vez que otro trabajo pesado)', async () => {
  const orden = [];
  const largo = exclusion.ejecutar('ollama', async () => { orden.push('ollama-ini'); await dormir(150); orden.push('ollama-fin'); });
  await dormir(10);
  const voz = sintetizar({ texto: 'hola mundo', mercado: 'en-US', salida: wav('lock'), modelo: path.join(voces, 'en_US-lessac-low.onnx'), ...opciones() }).then(() => orden.push('voz'));
  await Promise.all([largo, voz]);
  assert.deepEqual(orden, ['ollama-ini', 'ollama-fin', 'voz']);
});

test('duracionWav: rechaza archivos que no son WAV', async () => {
  const f = path.join(raiz, 'no.wav');
  await fs.writeFile(f, 'x'.repeat(200));
  await assert.rejects(duracionWav(f), (e) => e.tipo === 'salida');
});

test('verificarPiper: binario que responde y voces por mercado', async () => {
  const v = await verificarPiper({ binario: process.execPath, argsPrevios: [FALSO], dir: voces });
  assert.equal(v.binario, true);
  assert.equal(path.basename(v.voces['en-US']), 'en_US-lessac-medium.onnx');
  assert.equal(v.listo, true);
  const sin = await verificarPiper({ binario: path.join(raiz, 'no-existe'), dir: voces });
  assert.equal(sin.binario, false);
  assert.equal(sin.listo, false);
  const sinVoces = await verificarPiper({ binario: process.execPath, argsPrevios: [FALSO], dir: path.join(raiz, 'vacio') });
  assert.equal(sinVoces.listo, false);
});

// Piper REAL: solo si se define PIPER_PATH y hay voces (en esta prueba se usa la que haya en PIPER_VOICES_DIR). Se salta sin ellas.
const real = process.env.PIPER_PATH ? await verificarPiper({ binario: process.env.PIPER_PATH, dir: process.env.PIPER_VOICES_DIR }) : { listo: false };
test('Piper real (opcional): sintetiza en-US y es-US con RTF razonable', { skip: real.listo ? false : 'sin PIPER_PATH/voces reales' }, async () => {
  for (const [mercado, texto] of [['en-US', 'In 1998 the story of Marco Silva began in Lisbon.'], ['es-US', 'En 1998 empezó la historia de Marco Silva en Lisboa.']]) {
    const t0 = Date.now();
    const r = await sintetizar({ texto, mercado, salida: wav('real-' + mercado), binario: process.env.PIPER_PATH, modelo: real.voces[mercado] });
    assert.ok(r.duracionSeg > 1.5 && r.duracionSeg < 15, mercado + ' ' + r.duracionSeg);
    assert.ok((Date.now() - t0) / 1000 < r.duracionSeg * 3 + 5, 'demasiado lento');
  }
});
CLIPLAB_EOF_PARTE5
escribir "tests/banco-medios.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-banco-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });
const { crearRng, elegir, listarCategoria, fotoDeFicha, resumen, asegurarEstructura } = await import('../src/banco-medios.js');

const dir = path.join(raiz, 'banco');
const poner = async (rel, contenido = 'x') => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), contenido); };
await poner('efectos/whoosh/a.wav'); await poner('efectos/whoosh/b.mp3'); await poner('efectos/whoosh/nota.txt'); await poner('efectos/whoosh/.oculto.wav');
await poner('efectos/impacto/hit.ogg'); await poner('musica/calida/uno.mp3'); await poner('medios/fondos/c.mp4'); await poner('medios/fondos/d.jpg'); await poner('medios/fotos/marco.jpg');
await poner('medios/fotos/malo.exe');

test('listarCategoria: solo extensiones del tipo, sin ocultos ni otros formatos; ordenado', async () => {
  assert.deepEqual(await listarCategoria('efectos', 'whoosh', { dir }), ['a.wav', 'b.mp3']);
  assert.deepEqual(await listarCategoria('medios', 'fondos', { dir }), ['c.mp4', 'd.jpg']);
  assert.deepEqual(await listarCategoria('efectos', 'no-existe', { dir }), []);
});

test('categoria y tipo invalidos no arman rutas (traversal)', async () => {
  for (const c of ['../musica', '..', 'a/b', 'A', '', 'x'.repeat(40), 'a b']) await assert.rejects(listarCategoria('efectos', c, { dir }), /Categoria no valida/, c);
  await assert.rejects(listarCategoria('../x', 'whoosh', { dir }), /Tipo de banco/);
});

test('elegir: devuelve una ruta absoluta dentro del banco o null si no hay', async () => {
  const r = await elegir('efectos', 'whoosh', { dir });
  assert.ok(path.isAbsolute(r) && r.startsWith(dir + path.sep));
  assert.equal(await elegir('efectos', 'vacia', { dir }), null);
});

test('elegir: rng reproducible (mismo texto -> misma eleccion) y respeta `excluir` mientras haya otras', async () => {
  const a = await elegir('medios', 'fondos', { dir, rng: crearRng('serie-1') });
  const b = await elegir('medios', 'fondos', { dir, rng: crearRng('serie-1') });
  assert.equal(a, b);
  const distintos = new Set();
  for (let i = 0; i < 30; i++) distintos.add(await elegir('medios', 'fondos', { dir, rng: crearRng('s' + i) }));
  assert.equal(distintos.size, 2);
  const sin = await elegir('medios', 'fondos', { dir, excluir: ['c.mp4'] });
  assert.equal(path.basename(sin), 'd.jpg');
  const todo = await elegir('medios', 'fondos', { dir, excluir: ['c.mp4', 'd.jpg'] });
  assert.ok(todo);   // si se agotan, se repite en vez de quedarse sin fondo
});

test('crearRng: valores en [0,1) y semillas distintas dan secuencias distintas', () => {
  const r = crearRng('x'); const v = Array.from({ length: 50 }, r);
  assert.ok(v.every((n) => n >= 0 && n < 1));
  assert.notDeepEqual(Array.from({ length: 5 }, crearRng('a')), Array.from({ length: 5 }, crearRng('b')));
});

test('enlaces simbolicos que salen del banco se ignoran', async () => {
  const fuera = path.join(raiz, 'secreto.wav');
  await fs.writeFile(fuera, 'x');
  await fs.symlink(fuera, path.join(dir, 'efectos/whoosh/enlace.wav')).catch(() => {});
  assert.ok(!(await listarCategoria('efectos', 'whoosh', { dir })).includes('enlace.wav'));
});

test('fotoDeFicha: solo imagenes que existen en medios/fotos, por nombre (nunca por ruta)', async () => {
  assert.equal(await fotoDeFicha('marco.jpg', { dir }), path.join(dir, 'medios/fotos/marco.jpg'));
  for (const n of ['otra.jpg', '../marco.jpg', 'malo.exe', '', null, 'a/b.jpg']) assert.equal(await fotoDeFicha(n, { dir }), null, String(n));
});

test('resumen y asegurarEstructura', async () => {
  const r = await resumen({ dir });
  assert.equal(r.efectos.whoosh, 2);
  assert.equal(r.efectos.impacto, 1);
  assert.equal(r.musica.calida, 1);
  assert.equal(r.medios.fondos, 2);
  const nuevo = path.join(raiz, 'banco-nuevo');
  const creadas = await asegurarEstructura({ dir: nuevo });
  assert.ok(creadas.includes('medios/fotos'));
  assert.deepEqual((await resumen({ dir: nuevo })).efectos, { whoosh: 0, impacto: 0 });
});
CLIPLAB_EOF_PARTE5
escribir "tests/stories-plan.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHA, guionBueno, parte, NARRACION_EN, NARRACION_ES } from './fixtures/ficha-ejemplo.mjs';
import { normalizarFicha } from '../src/validador-ficha.js';
import { COLA_SEG, ErrorProduccion, envolver, fichaEnPantalla, normalizarEfecto, planDeParte, planDeProduccion, subtitulos } from '../src/stories-plan.js';
import { ErrorCanal } from '../src/canales.js';

const ficha = normalizarFicha(FICHA);
const fichaEs = normalizarFicha({ ...FICHA, mercado: 'es-US' });

test('normalizarEfecto: visual y sonido separados; sin ruta posible; vacio = nada', () => {
  assert.deepEqual(normalizarEfecto('zoom_in'), { visual: 'zoom_in', sonido: null });
  assert.deepEqual(normalizarEfecto('Zoom In + Whoosh'), { visual: 'zoom_in', sonido: 'whoosh' });
  assert.deepEqual(normalizarEfecto('whoosh, pan izq'), { visual: 'pan_izq', sonido: 'whoosh' });
  assert.deepEqual(normalizarEfecto('Fade'), { visual: 'fundido', sonido: null });
  assert.deepEqual(normalizarEfecto('golpe_seco'), { visual: null, sonido: 'golpe-seco' });
  assert.deepEqual(normalizarEfecto(undefined), { visual: null, sonido: null });
  assert.match(normalizarEfecto('../../etc/passwd').sonido ?? '', /^[a-z0-9-]*$/);   // las barras separan: nunca queda una ruta
  assert.equal(normalizarEfecto('x'.repeat(60)).sonido, null);
});

test('envolver: palabras enteras, maximo de lineas, "..." si sobra', () => {
  assert.deepEqual(envolver('MARCO SILVA LISBON 1998', 18, 3), ['MARCO SILVA LISBON', '1998']);
  assert.deepEqual(envolver('', 10), []);
  const largo = envolver('uno dos tres cuatro cinco seis siete ocho nueve diez', 10, 2);
  assert.equal(largo.length, 2);
  assert.ok(largo[1].endsWith('...'));
  assert.ok(envolver('palabraenormesinespacios', 10, 2)[0].length >= 10);
});

test('subtitulos: cubren la voz en orden, sin solaparse, y cada frase cabe en 2 lineas de 26', () => {
  const s = subtitulos(NARRACION_EN, 12);
  assert.ok(s.length >= 3);
  assert.equal(s[0].inicio, 0.15);
  assert.equal(s.at(-1).fin, 12);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].inicio >= s[i - 1].fin - 0.002 && s[i].fin > s[i].inicio, String(i));
  for (const f of s) { const l = f.texto.split('\n'); assert.ok(l.length <= 2 && l.every((x) => x.length <= 28), f.texto); }
  assert.deepEqual(subtitulos('', 5), []);
});

test('fichaEnPantalla: campos de CANALES.stories.ficha (anio, lugar, datos) y etiquetas por idioma', () => {
  const en = fichaEnPantalla(ficha, 'en-US');
  assert.equal(en.etiqueta, 'FILE');
  assert.equal(en.nombre, 'Marco Silva');
  assert.deepEqual(en.lineas, ['YEAR: 1998', 'PLACE: Lisbon, Portugal', 'KEY FACTS: 12 goals']);
  assert.equal(en.segundos, 4);
  const es = fichaEnPantalla(fichaEs, 'es-US');
  assert.equal(es.etiqueta, 'EXPEDIENTE');
  assert.deepEqual(es.lineas, ['AÑO: 1998', 'LUGAR: Lisbon, Portugal', 'DATOS CLAVE: 12 goals']);
});

test('fichaEnPantalla: sin hechos que mostrar y sin foto -> null; con foto se conserva; nombre cae al titulo', () => {
  const vacia = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'dato', valor: 'x' }, { tipo: 'cifra', valor: '' + 5 }].slice(0, 1) });
  assert.ok(fichaEnPantalla(vacia, 'en-US').lineas.length === 1);
  const soloPersona = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'persona', valor: 'Ana' }] });
  assert.equal(fichaEnPantalla(soloPersona, 'en-US'), null);
  assert.equal(fichaEnPantalla({ ...soloPersona, foto: 'ana.jpg' }, 'en-US').foto, 'ana.jpg');
  const sinPersona = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'lugar', valor: 'Lima' }] });
  assert.equal(fichaEnPantalla(sinPersona, 'en-US').nombre, 'The Rise of Marco Silva');
});

test('planDeParte: las escenas se reescalan a la voz real (+cola) y suman exactamente la duracion total', () => {
  const p = planDeParte({ parte: parte(1, { escenas: 8, duracion: 6 }), ficha, mercado: 'en-US', duracionVoz: 12 });
  assert.equal(p.duracionTotal, 12 + COLA_SEG);
  assert.equal(p.escenas.length, 8);
  assert.ok(Math.abs(p.escenas.reduce((s, e) => s + e.duracion, 0) - p.duracionTotal) < 0.01);
  assert.equal(p.escenas[0].inicio, 0);
  for (let i = 1; i < 8; i++) assert.ok(Math.abs(p.escenas[i].inicio - (p.escenas[i - 1].inicio + p.escenas[i - 1].duracion)) < 0.01);
  assert.ok(p.avisos.length === 1 && /reescalaron/.test(p.avisos[0]));   // 48 s de guion -> 12.8 s de voz
  assert.ok(p.subtitulos.length > 0 && p.ficha.nombre === 'Marco Silva');
});

test('planDeParte: efecto ausente -> el ritmo rota zoom_in, pan_der, zoom_out, pan_izq; el efecto del guion manda', () => {
  const g = parte(1, { escenas: 5, duracion: 3 });
  g.tecnico.forEach((e) => { delete e.efecto; });
  g.tecnico[1].efecto = 'fade + whoosh';
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 14 });
  assert.deepEqual(p.escenas.map((e) => e.visual), ['zoom_in', 'fundido', 'zoom_out', 'pan_izq', 'zoom_in']);
  assert.equal(p.escenas[1].sonido, 'whoosh');
});

test('planDeParte: sin escenas, sin voz o sin duraciones -> ErrorProduccion (400)', () => {
  const base = { ficha, mercado: 'en-US', duracionVoz: 10 };
  assert.throws(() => planDeParte({ ...base, parte: { n: 1, narracion: 'x', tecnico: [] } }), ErrorProduccion);
  assert.throws(() => planDeParte({ ...base, parte: parte(1), duracionVoz: 0 }), /duracion de la voz/);
  const sin = parte(1); sin.tecnico.forEach((e) => { e.duracionSeg = 0; });
  assert.throws(() => planDeParte({ ...base, parte: sin }), /no tienen duracion/);
  assert.ok(new ErrorProduccion('x') instanceof ErrorCanal);
});

test('planDeParte: nunca hay escenas de menos de 0.6 s y el total no se pasa', () => {
  const g = parte(1, { escenas: 20, duracion: 0.1 });
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 5 });
  assert.ok(p.escenas.every((e) => e.duracion >= 0.6));
});

test('planDeProduccion: nombres de archivo, mercado principal primero y totales', () => {
  const g = guionBueno();
  const plan = planDeProduccion({ id: 'abc', entradas: [{ mercado: 'es-US', ficha: fichaEs, guion: { partes: [parte(1, { narracion: NARRACION_ES }), parte(2, { narracion: NARRACION_ES })] } }, { mercado: 'en-US', ficha, guion: g }] });
  assert.deepEqual(plan.mercados.map((m) => m.mercado), ['en-US', 'es-US']);
  assert.deepEqual(plan.mercados[0].partes.map((p) => p.archivo), ['stories-abc-en-us-p1.mp4', 'stories-abc-en-us-p2.mp4']);
  assert.equal(plan.mercados[1].largo.archivo, 'stories-abc-es-us-largo.mp4');
  assert.deepEqual(plan.resumen, { renders: 4, concatenaciones: 2 });
  assert.deepEqual(plan.avisos, []);
});

test('planDeProduccion: las partes salen ordenadas por n aunque el guion llegue desordenado', () => {
  const plan = planDeProduccion({ id: 'ord', entradas: [{ mercado: 'en-US', ficha, guion: { partes: [parte(3), parte(1), parte(2)] } }] });
  assert.deepEqual(plan.mercados[0].partes.map((p) => p.n), [1, 2, 3]);
});

test('planDeProduccion: solo stories; un guion por mercado; la ficha debe ser del mercado y del canal', () => {
  const entrada = { mercado: 'en-US', ficha, guion: guionBueno() };
  assert.throws(() => planDeProduccion({ id: 'a', canal: 'sports', entradas: [entrada] }), /Parte 6/);
  assert.throws(() => planDeProduccion({ id: 'a', canal: 'news', entradas: [entrada] }), ErrorProduccion);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [entrada, entrada] }), /repetido/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, mercado: 'es-US' }] }), /esta hecha para el mercado en-US/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, ficha: { ...ficha, canal: 'news' } }] }), /no es del canal stories/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [] }), /al menos un guion/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, guion: { partes: [] } }] }), /no tiene partes/);
  assert.throws(() => planDeProduccion({ id: '../x', entradas: [entrada] }), /Id de produccion/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, mercado: 'fr-FR' }] }), /ercado/);
});

test('planDeProduccion: avisa si los mercados no tienen las mismas partes', () => {
  const plan = planDeProduccion({ id: 'a', entradas: [{ mercado: 'en-US', ficha, guion: guionBueno() }, { mercado: 'es-US', ficha: fichaEs, guion: { partes: [parte(1)] } }] });
  assert.equal(plan.avisos.length, 1);
});
CLIPLAB_EOF_PARTE5
escribir "tests/stories-render.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-render-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { FICHA, parte } = await import('./fixtures/ficha-ejemplo.mjs');
const { normalizarFicha } = await import('../src/validador-ficha.js');
const { planDeParte } = await import('../src/stories-plan.js');
const { ALTO, ANCHO, argsConcat, concatenarPartes, construirParte, elegirFuente, renderizarParte, rutaEnFiltro } = await import('../src/engine/stories-render.js');
const { sintetizar } = await import('../src/voz.js');

const ficha = normalizarFicha(FICHA);
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const sonda = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f]);
  const j = JSON.parse(r.stdout.toString());
  return { duracion: Number(j.format.duration), video: j.streams.find((s) => s.codec_type === 'video'), audio: j.streams.find((s) => s.codec_type === 'audio') };
};
const plan = (n = 4, voz = 6) => planDeParte({ parte: parte(1, { escenas: n, duracion: 3 }), ficha, mercado: 'en-US', duracionVoz: voz });

test('rutaEnFiltro: escapa ":" y comillas y usa barras normales', () => {
  assert.equal(rutaEnFiltro("C:\\Fonts\\it's.ttf"), "C\\:/Fonts/it\\'s.ttf");
});

test('construirParte: CPU libx264 con hilos limitados, 9:16, audio aac y salida con -t de la duracion total', () => {
  const p = plan();
  const { args, textos } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4', hilos: 2, preset: 'veryfast', crf: 24 });
  const val = (k) => args[args.indexOf(k) + 1];
  assert.equal(val('-c:v'), 'libx264');
  assert.equal(val('-threads'), '2');
  assert.equal(val('-filter_complex_threads'), '2');
  assert.equal(val('-preset'), 'veryfast');
  assert.equal(val('-c:a'), 'aac');
  assert.equal(args[args.lastIndexOf('-t') + 1], p.duracionTotal.toFixed(3));   // el -t de salida es el ultimo
  assert.equal(args.at(-1), '/s.mp4');
  assert.equal(args.filter((a) => a === '-i').length, 4 + 1);   // 4 fondos generados (lavfi) + la voz
  assert.equal(args.filter((a) => a === 'lavfi').length, 4);
  const fc = val('-filter_complex');
  assert.match(args.join(' '), new RegExp(`color=c=0x[0-9a-f]+:s=${ANCHO}x${ALTO}`));   // fondo generado: va en la entrada lavfi
  assert.match(fc, /concat=n=4:v=1:a=0\[base\]/);
  assert.ok(!/ffmpeg|-vf/.test(fc));
  assert.equal((fc.match(/drawtext=/g) || []).length, (fc.match(/textfile=t\d+\.txt/g) || []).length);   // todo texto va por archivo
  assert.ok(textos.length > 3);   // expediente + escenas + subtitulos
  assert.ok(textos.every((t) => /^t\d+\.txt$/.test(t.nombre)));
});

test('construirParte: el texto del guion nunca entra en la linea de filtros (va en archivos)', () => {
  const g = parte(1, { escenas: 2, duracion: 3 });
  g.tecnico[0].textoPantalla = "'; drawtext=text=PWNED:x=0 :";
  g.narracion = "He said 'hi': 100% [real]; \\ done. Another sentence follows here for the captions to split.";
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 6 });
  const { args, textos } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4' });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!fc.includes('PWNED'));
  assert.ok(textos.some((t) => t.contenido.includes('PWNED')));
});

test('construirParte: medios (imagen -> -loop, video -> -stream_loop), musica, efectos y foto suman entradas y mezcla', () => {
  const p = plan(3, 6);
  const { args } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4', medios: ['/m/a.jpg', '/m/b.mp4', null], musica: '/m/musica.mp3', sfx: [{ ruta: '/m/w.wav', inicio: 1.5 }], foto: '/m/foto.png' });
  assert.ok(args.includes('-loop') && args.includes('-stream_loop'));
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.match(fc, /amix=inputs=3:duration=first/);
  assert.match(fc, /adelay=1500\|1500/);
  assert.match(fc, /\[foto\]overlay=/);
  assert.match(fc, /volume=0\.10/);
});

test('construirParte: sin musica ni efectos no hay amix; sin foto no hay overlay; la fuente va con fontfile escapado', () => {
  const { args } = construirParte({ plan: plan(), voz: '/v.wav', salida: '/s.mp4', fuente: 'C:/Fonts/Anton.ttf' });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!fc.includes('amix'));
  assert.ok(!fc.includes('overlay'));
  assert.match(fc, /fontfile='C\\:\/Fonts\/Anton\.ttf'/);
});

test('construirParte: efectos visuales (zoom, pan, fundido) se traducen a filtros', () => {
  const g = parte(1, { escenas: 4, duracion: 3 });
  ['zoom_in', 'zoom_out', 'pan_izq', 'fundido'].forEach((e, i) => { g.tecnico[i].efecto = e; });
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 10 });
  const fc = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4' }).args.join(' ');
  assert.match(fc, /eval=frame/);
  assert.match(fc, /crop=1080:1920:x='\(iw-ow\)\*\(1-t\//);
  assert.match(fc, /fade=t=in/);
});

test('elegirFuente: devuelve un archivo que existe o null (drawtext usa entonces fontconfig)', async () => {
  const f = await elegirFuente({ fontsDir: path.join(raiz, 'sin-fuentes') });
  assert.ok(f === null || (await fs.stat(f)).isFile());
  const mia = path.join(raiz, 'Mia.ttf'); await fs.writeFile(mia, 'x');
  assert.equal(await elegirFuente({ fontsDir: raiz, extra: [mia] }), mia);
});

test('FFmpeg real: renderiza una parte 9:16 con voz, texto y expediente; dura lo planeado', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 120000 }, async () => {
  await fs.writeFile(path.join(raiz, 'm.onnx'), 'x');
  const voz = await sintetizar({ texto: 'In 1998 the story of Marco Silva began in Lisbon. He was a quiet kid.', mercado: 'en-US', salida: path.join(raiz, 'v1.wav'), binario: process.execPath, argsPrevios: [path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs')], modelo: path.join(raiz, 'm.onnx') });
  const p = planDeParte({ parte: parte(1, { escenas: 3, duracion: 3 }), ficha, mercado: 'en-US', duracionVoz: voz.duracionSeg });
  const salida = path.join(raiz, 'p1.mp4');
  await renderizarParte({ dirTrabajo: path.join(raiz, 'w1'), plan: p, voz: voz.archivo, salida, ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 32, fuente: await elegirFuente() });
  const s = sonda(salida);
  assert.equal(s.video.codec_name, 'h264');
  assert.deepEqual([s.video.width, s.video.height], [270, 480]);
  assert.equal(s.audio.codec_name, 'aac');
  assert.ok(Math.abs(s.duracion - p.duracionTotal) < 0.25, `${s.duracion} vs ${p.duracionTotal}`);
});

test('FFmpeg real: medios del banco (imagen, foto de ficha, musica y efecto) y concatenacion en orden', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 180000 }, async () => {
  const ff = (...a) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...a]).status, 0);
  const img = path.join(raiz, 'fondo.png'); ff('-f', 'lavfi', '-i', 'testsrc=s=640x360:d=1', '-frames:v', '1', img);
  const foto = path.join(raiz, 'foto.png'); ff('-f', 'lavfi', '-i', 'color=c=red:s=200x200:d=1', '-frames:v', '1', foto);
  const vid = path.join(raiz, 'fondo.mp4'); ff('-f', 'lavfi', '-i', 'testsrc=s=320x240:d=1:r=25', '-pix_fmt', 'yuv420p', vid);
  const mus = path.join(raiz, 'mus.wav'); ff('-f', 'lavfi', '-i', 'sine=f=220:d=2', mus);
  const fx = path.join(raiz, 'fx.wav'); ff('-f', 'lavfi', '-i', 'sine=f=880:d=0.3', fx);
  const voz = path.join(raiz, 'v2.wav'); ff('-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '5', voz);
  const tiempos = [];
  for (const n of [1, 2]) {
    const g = parte(n, { escenas: 3, duracion: 2 });
    const p = planDeParte({ parte: g, ficha: { ...ficha, foto: 'foto.png' }, mercado: 'en-US', duracionVoz: 3 + n });
    const salida = path.join(raiz, `q${n}.mp4`);
    await renderizarParte({ dirTrabajo: path.join(raiz, 'w2-' + n), plan: p, voz, salida, medios: [img, vid, null], musica: mus, sfx: [{ ruta: fx, inicio: 1 }], foto, ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 32 });
    assert.ok(Math.abs(sonda(salida).duracion - p.duracionTotal) < 0.25);
    tiempos.push(sonda(salida).duracion);
  }
  const largo = path.join(raiz, 'largo.mp4');
  await concatenarPartes([path.join(raiz, 'q1.mp4'), path.join(raiz, 'q2.mp4')], largo, { dirTrabajo: raiz });
  const s = sonda(largo);
  assert.ok(Math.abs(s.duracion - (tiempos[0] + tiempos[1])) < 0.3);
  assert.deepEqual([s.video.width, s.video.height], [270, 480]);
  assert.deepEqual((await fs.readdir(raiz)).filter((n) => n.startsWith('concat-')), []);   // la lista temporal se borra
  await assert.rejects(concatenarPartes([], largo, { dirTrabajo: raiz }), /No hay partes/);
});

test('argsConcat: une EN ORDEN con el demuxer concat y SIN recodificar (-c copy)', () => {
  const a = argsConcat('lista.txt', 'salida.mp4');
  assert.deepEqual(a.slice(a.indexOf('-f'), a.indexOf('-f') + 2), ['-f', 'concat']);
  assert.deepEqual(a.slice(a.indexOf('-c'), a.indexOf('-c') + 2), ['-c', 'copy']);
  assert.ok(!a.includes('libx264'));
  assert.equal(a.at(-1), 'salida.mp4');
});
CLIPLAB_EOF_PARTE5
escribir "tests/stories-produccion.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-produccion-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { FICHA, NARRACION_EN, NARRACION_ES, parte } = await import('./fixtures/ficha-ejemplo.mjs');
const { normalizarFicha } = await import('../src/validador-ficha.js');
const { producirStories, registrarClips } = await import('../src/stories-produccion.js');
const { sintetizar } = await import('../src/voz.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const { gestor, crearGestor } = await import('../src/trabajos-guion.js');

const FALSO = path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs');
const modelo = path.join(raiz, 'modelo.onnx');
await fs.writeFile(modelo, 'x');
const fichaEn = normalizarFicha(FICHA);
const fichaEs = normalizarFicha({ ...FICHA, mercado: 'es-US', titulo: 'El ascenso de Marco Silva' });
const guion = (narracion) => ({ partes: [parte(1, { narracion, escenas: 3, duracion: 2 }), parte(2, { narracion, escenas: 3, duracion: 2 })] });
const entradas = () => [{ mercado: 'en-US', ficha: fichaEn, guion: guion(NARRACION_EN) }, { mercado: 'es-US', ficha: fichaEs, guion: guion(NARRACION_ES) }];
const vozFalsa = (extra = {}) => (o) => sintetizar({ ...o, binario: process.execPath, argsPrevios: [FALSO], modelo, ...extra });
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Dependencias falsas: guardan lo que se les pide y crean archivos vacios. */
function falsos() {
  const reg = { voz: [], render: [], concat: [], orden: [] };
  return {
    reg,
    deps: {
      fuente: null,
      sintetizar: async (o) => { reg.voz.push(o); reg.orden.push('voz'); return vozFalsa()(o); },
      renderizar: async (o) => { reg.render.push(o); reg.orden.push('render'); await fs.writeFile(o.salida, 'video'); },
      concatenar: async (lista, salida) => { reg.concat.push({ lista, salida }); reg.orden.push('concat'); await fs.writeFile(salida, 'largo'); },
      elegir: async () => null,
      fotoDeFicha: async () => null,
    },
  };
}

test('producirStories: una voz y un render por (mercado x parte) y una concatenacion por mercado, en orden', async () => {
  const { reg, deps } = falsos();
  const salida = path.join(raiz, 'clips1');
  const progreso = [];
  const r = await producirStories({ id: 'serie1', entradas: entradas(), dirSalida: salida, dirTemporal: path.join(raiz, 't1'), deps, avance: (e, p) => progreso.push(p) });
  assert.equal(reg.voz.length, 4);
  assert.equal(reg.render.length, 4);
  assert.equal(reg.concat.length, 2);
  assert.deepEqual(reg.voz.map((v) => v.mercado), ['en-US', 'en-US', 'es-US', 'es-US']);
  assert.deepEqual(reg.concat[0].lista.map((f) => path.basename(f)), ['stories-serie1-en-us-p1.mp4', 'stories-serie1-en-us-p2.mp4']);
  assert.deepEqual(reg.concat[1].lista.map((f) => path.basename(f)), ['stories-serie1-es-us-p1.mp4', 'stories-serie1-es-us-p2.mp4']);
  assert.deepEqual((await fs.readdir(salida)).sort(), ['stories-serie1-en-us-largo.mp4', 'stories-serie1-en-us-p1.mp4', 'stories-serie1-en-us-p2.mp4', 'stories-serie1-es-us-largo.mp4', 'stories-serie1-es-us-p1.mp4', 'stories-serie1-es-us-p2.mp4']);
  assert.equal(r.mercados.length, 2);
  assert.equal(r.mercados[0].partes[0].url, '/clips/stories-serie1-en-us-p1.mp4');
  assert.ok(r.mercados[0].largo.duracion > 10);
  assert.equal(progreso.at(-1), 100);
  assert.ok(progreso.every((p, i) => i === 0 || p >= progreso[i - 1]));
  await assert.rejects(fs.stat(path.join(raiz, 't1')));   // el directorio temporal se borra
});

test('producirStories: cada render recibe el plan con la duracion REAL de la voz y la ficha del mercado', async () => {
  const { reg, deps } = falsos();
  await producirStories({ id: 'serie2', entradas: entradas(), dirSalida: path.join(raiz, 'clips2'), dirTemporal: path.join(raiz, 't2'), deps });
  const en = reg.render[0];
  const es = reg.render[2];
  assert.equal(en.plan.ficha.etiqueta, 'FILE');
  assert.equal(es.plan.ficha.etiqueta, 'EXPEDIENTE');
  assert.ok(Math.abs(en.plan.duracionTotal - (NARRACION_EN.length / 15 + 0.8)) < 0.05);
  assert.ok(en.voz.endsWith('en-US-p1.wav'));
  assert.equal(en.medios.length, en.plan.escenas.length);
});

test('producirStories: banco de medios -> fondos, efectos y musica elegidos; sin banco los fondos son null (color generado)', async () => {
  const { reg, deps } = falsos();
  const pedidos = [];
  deps.elegir = async (tipo, categoria) => { pedidos.push(tipo + '/' + categoria); return tipo === 'medios' ? '/banco/medios/fondos/f.jpg' : tipo === 'musica' ? '/banco/musica/calida/m.mp3' : categoria === 'whoosh' ? '/banco/efectos/whoosh/w.wav' : null; };
  const e = entradas();
  e[0].guion.partes[0].tecnico[1].efecto = 'zoom_in+whoosh';
  e[0].guion.partes[0].tecnico[2].efecto = 'impacto';   // categoria sin archivos -> se omite
  await producirStories({ id: 'serie3', entradas: [e[0]], dirSalida: path.join(raiz, 'clips3'), dirTemporal: path.join(raiz, 't3'), deps });
  const r0 = reg.render[0];
  assert.deepEqual(r0.medios, ['/banco/medios/fondos/f.jpg', '/banco/medios/fondos/f.jpg', '/banco/medios/fondos/f.jpg']);
  assert.equal(r0.musica, '/banco/musica/calida/m.mp3');
  assert.deepEqual(r0.sfx.map((s) => s.ruta), ['/banco/efectos/whoosh/w.wav']);
  assert.ok(pedidos.includes('efectos/impacto') && pedidos.includes('efectos/whoosh'));
  const vacio = falsos();
  await producirStories({ id: 'serie3b', entradas: [e[0]], dirSalida: path.join(raiz, 'clips3b'), dirTemporal: path.join(raiz, 't3b'), deps: vacio.deps });
  assert.deepEqual(vacio.reg.render[0].medios, [null, null, null]);
  assert.equal(vacio.reg.render[0].musica, null);
});

test('producirStories: foto de la ficha ausente del banco -> aviso y la ficha sale sin foto', async () => {
  const { reg, deps } = falsos();
  const e = entradas()[0];
  e.ficha = { ...e.ficha, foto: 'marco.jpg' };
  const r = await producirStories({ id: 'serie4', entradas: [e], dirSalida: path.join(raiz, 'clips4'), dirTemporal: path.join(raiz, 't4'), deps });
  assert.ok(r.avisos.some((a) => /marco\.jpg/.test(a)));
  assert.equal(reg.render[0].foto, null);
  const con = falsos();
  con.deps.fotoDeFicha = async (n) => '/banco/medios/fotos/' + n;
  await producirStories({ id: 'serie4b', entradas: [e], dirSalida: path.join(raiz, 'clips4b'), dirTemporal: path.join(raiz, 't4b'), deps: con.deps });
  assert.equal(con.reg.render[0].foto, '/banco/medios/fotos/marco.jpg');
});

test('producirStories: canal que no es stories, o plan invalido, se rechaza ANTES de tocar nada', async () => {
  const { reg, deps } = falsos();
  const e = entradas()[0];
  await assert.rejects(producirStories({ id: 'x', entradas: [{ ...e, ficha: { ...e.ficha, canal: 'news' } }], dirSalida: path.join(raiz, 'c5'), dirTemporal: path.join(raiz, 't5'), deps }), /stories/);
  await assert.rejects(producirStories({ id: 'x', entradas: [], deps }), /al menos un guion/);
  assert.equal(reg.orden.length, 0);
});

test('producirStories: cancelar a medias deja de producir y borra lo temporal', async () => {
  const { reg, deps } = falsos();
  const ctl = new AbortController();
  deps.sintetizar = async () => ({ duracionSeg: 5 });   // no mira la senal: la cancelacion la decide el orquestador
  deps.renderizar = async (o) => { reg.render.push(o); await fs.writeFile(o.salida, 'v'); ctl.abort(); };
  await assert.rejects(producirStories({ id: 'serie6', entradas: entradas(), dirSalida: path.join(raiz, 'c6'), dirTemporal: path.join(raiz, 't6'), deps, signal: ctl.signal }), /cancelada/i);
  assert.equal(reg.render.length, 1);
  await assert.rejects(fs.stat(path.join(raiz, 't6')));
});

test('producirStories: toma el candado; un trabajo de Ollama en curso va primero', async () => {
  const { reg, deps } = falsos();
  deps.sintetizar = async () => ({ duracionSeg: 5 });   // sin candado propio: aqui se prueba el del orquestador
  const orden = [];
  const ollama = exclusion.ejecutar('ollama', async () => { orden.push('ollama-ini'); await dormir(120); orden.push('ollama-fin'); });
  await dormir(10);
  const prod = producirStories({ id: 'serie7', entradas: [entradas()[0]], dirSalida: path.join(raiz, 'c7'), dirTemporal: path.join(raiz, 't7'), deps }).then(() => orden.push('produccion'));
  await Promise.all([ollama, prod]);
  assert.deepEqual(orden, ['ollama-ini', 'ollama-fin', 'produccion']);
  assert.ok(reg.render.length > 0);
});

const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('de punta a punta (Piper falso + FFmpeg real, 270x480): voces, partes y largo por mercado con la duracion correcta', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 240000 }, async () => {
  const salida = path.join(raiz, 'clips8');
  const r = await producirStories({ id: 'serie8', entradas: entradas(), dirSalida: salida, dirTemporal: path.join(raiz, 't8'), deps: { sintetizar: vozFalsa() }, render: { ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 34 } });
  const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(salida, f)]).stdout.toString());
  for (const m of r.mercados) {
    const p1 = dur(m.partes[0].archivo);
    const p2 = dur(m.partes[1].archivo);
    assert.ok(Math.abs(p1 - m.partes[0].duracion) < 0.3, `${m.mercado} p1 ${p1} vs ${m.partes[0].duracion}`);
    assert.ok(Math.abs(dur(m.largo.archivo) - (p1 + p2)) < 0.4);
  }
  assert.equal(r.mercados.length, 2);
});

// ---------------------------------------------------------------------------------------------------- registrarClips
function storeFalso() {
  const clips = [];
  return {
    clips,
    encolar: (url, extra) => { const c = { id: 'clip_' + clips.length, fuente: url, ...extra }; clips.push(c); return c; },
    completar: (id, campos) => Object.assign(clips.find((c) => c.id === id), campos, { estado: 'listo' }),
  };
}
const resultadoFalso = () => ({ id: 'serie9', mercados: ['en-US', 'es-US'].map((m) => ({ mercado: m, titulo: m === 'en-US' ? 'The Rise of Marco Silva' : 'El ascenso de Marco Silva', partes: [1, 2].map((n) => ({ n, archivo: `stories-serie9-${m.toLowerCase()}-p${n}.mp4`, url: `/clips/stories-serie9-${m.toLowerCase()}-p${n}.mp4`, duracion: 10 + n })), largo: { archivo: `stories-serie9-${m.toLowerCase()}-largo.mp4`, url: `/clips/stories-serie9-${m.toLowerCase()}-largo.mp4`, duracion: 23 } })) });

test('registrarClips: un clip por parte (archivos por mercado, url = principal) y uno por el largo', () => {
  const store = storeFalso();
  const ids = registrarClips({ store, resultado: resultadoFalso(), entradas: entradas() });
  assert.equal(ids.length, 3);
  const [p1, p2, largo] = store.clips;
  assert.equal(p1.titulo, 'The Rise of Marco Silva — Part 1');
  assert.equal(p1.url, '/clips/stories-serie9-en-us-p1.mp4');
  assert.deepEqual(p1.archivos, { 'en-US': '/clips/stories-serie9-en-us-p1.mp4', 'es-US': '/clips/stories-serie9-es-us-p1.mp4' });
  assert.equal(p1.transcripcion, NARRACION_EN);
  assert.equal(p2.parte, 2);
  assert.equal(largo.largo, true);
  assert.equal(largo.titulo, 'The Rise of Marco Silva — Full Series');
  assert.equal(largo.archivos['es-US'], '/clips/stories-serie9-es-us-largo.mp4');
  assert.ok(store.clips.every((c) => c.canal === 'stories' && c.estado === 'listo' && c.origen === 'stories' && c.serie === 'serie9'));
});

test('registrarClips: con un solo mercado (es-US) usa ese como principal', () => {
  const store = storeFalso();
  const r = resultadoFalso(); r.mercados = [r.mercados[1]];
  registrarClips({ store, resultado: r, entradas: [entradas()[1]] });
  assert.equal(store.clips[0].titulo, 'El ascenso de Marco Silva — Parte 1');
  assert.equal(store.clips.at(-1).titulo, 'El ascenso de Marco Silva — Serie completa');
  assert.deepEqual(Object.keys(store.clips[0].archivos), ['es-US']);
});

// ---------------------------------------------------------------------------------------------------- gestor
test('gestor: un solo trabajo a la vez, con estado, progreso, resultado y error', async () => {
  const g = crearGestor();
  assert.deepEqual(g.estado(), { tipo: null, estado: 'libre' });
  let suelta;
  assert.equal(g.iniciar('guion', ({ avance }) => { avance('paso 1', 40); return new Promise((ok) => { suelta = ok; }); }), true);
  assert.equal(g.iniciar('produccion', async () => 1), false);
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().etapa, g.estado().progreso], ['corriendo', 'paso 1', 40]);
  suelta({ listo: true });
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().progreso, g.estado().resultado], ['ok', 100, { listo: true }]);
  assert.equal(g.iniciar('produccion', async () => { throw new Error('boom'); }), true);
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().error], ['error', 'boom']);
  assert.equal(g.iniciar('guion', async () => 1), true);   // tras un error se puede volver a empezar
});

test('gestor: cancelar manda la senal de aborto al trabajo en curso', async () => {
  const g = crearGestor();
  g.iniciar('produccion', ({ senal }) => new Promise((_, mal) => senal.addEventListener('abort', () => mal(new Error('cancelado')))));
  await dormir(5);
  g.cancelar();
  await dormir(10);
  assert.equal(g.estado().error, 'cancelado');
  assert.ok(gestor);
});
CLIPLAB_EOF_PARTE5
escribir "tests/guiones-rutas.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const windows = process.platform === 'win32';
const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-guiones-rutas-'));

// Ollama de mentira: responde /api/tags y /api/chat con un guion valido para la ficha (en o es segun el prompt).
const NARRACION = { en: 'In 1998 the story of Marco Silva began in Lisbon, and everyone noticed it.', es: 'En 1998 la historia de Marco Silva empezo en Lisbon, y todos lo notaron.' };
const peticiones = [];
const ollama = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (d) => { cuerpo += d; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') { res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b-instruct' }] })); return; }
    const datos = JSON.parse(cuerpo);
    peticiones.push(datos);
    const es = /Spanish \(US\)/.test(datos.messages[0].content);
    const n = Number(/desde n=(\d+)/.exec(datos.messages[0].content)[1]);
    const escena = (efecto) => ({ escena: 'Wide shot of Lisbon at dawn', textoPantalla: 'MARCO SILVA', efecto, duracionSeg: 3 });
    const guion = { partes: [{ n, narracion: es ? NARRACION.es : NARRACION.en, tecnico: [escena('zoom_in'), escena('whoosh')] }] };
    res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(guion) } }));
  });
});
await new Promise((ok) => ollama.listen(0, '127.0.0.1', ok));

// Piper de mentira como ejecutable (envoltorio sh) y voces vacias.
const voces = path.join(raiz, 'voces');
await fs.mkdir(voces, { recursive: true });
await fs.writeFile(path.join(voces, 'en_US-prueba-low.onnx'), 'x');
await fs.writeFile(path.join(voces, 'es_MX-prueba-low.onnx'), 'x');
const piper = path.join(raiz, 'piper');
await fs.writeFile(piper, `#!/bin/sh\nexec "${process.execPath}" "${path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs')}" "$@"\n`, { mode: 0o755 });

Object.assign(process.env, {
  CLIPLAB_MODE: 'local', TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), CLIPS_DIR: path.join(raiz, 'clips'),
  MASTER_KEY: 'llave-de-prueba', LOG_LEVEL: 'error', OLLAMA_URL: 'http://127.0.0.1:' + ollama.address().port, PIPER_PATH: piper, PIPER_VOICES_DIR: voces,
  BANCO_DIR: path.join(raiz, 'banco'), VIDEO_PRESET: 'ultrafast', VIDEO_CRF: '34', CPU_THREADS: '1',
});

const { createApp } = await import('../src/app.js');
const { store } = await import('../src/storage/store.js');
const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
const AUTH = { 'x-master-key': 'llave-de-prueba' };
test.after(() => { servidor.close(); ollama.close(); });

async function api(ruta, { metodo = 'GET', cuerpo, auth = true } = {}) {
  const r = await fetch(base + '/api/panel' + ruta, { method: metodo, headers: { ...(auth ? AUTH : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* no JSON */ }
  const d = json && json.data !== undefined ? json.data : json;
  return { status: r.status, cuerpo: json, datos: d, texto, cabeceras: r.headers };
}
async function esperar(fn, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((ok) => setTimeout(ok, 250)); }
  throw new Error('tiempo agotado esperando');
}
const esperarLibre = () => esperar(async () => { const e = (await api('/guiones/estado')).datos.trabajo; return e.estado !== 'corriendo' ? e : null; });
const FICHA = { titulo: 'The Rise of Marco Silva', canal: 'stories', mercado: 'en-US', partes: 1, hechos: [{ tipo: 'persona', valor: 'Marco Silva' }, { tipo: 'lugar', valor: 'Lisbon, Portugal' }, { tipo: 'fecha', valor: 'March 3, 1998' }, { tipo: 'cifra', valor: '12 goals' }] };
let ids = [];

test('todas las rutas de guiones exigen la llave maestra (401 sin ella)', async () => {
  for (const [metodo, ruta] of [['GET', '/guiones'], ['GET', '/guiones/entorno'], ['GET', '/guiones/estado'], ['POST', '/guiones'], ['POST', '/guiones/procesar'], ['POST', '/guiones/producir'], ['GET', '/guiones/pendientes/0000000000001-deadbeef']]) {
    const r = await api(ruta, { metodo, auth: false, cuerpo: metodo === 'POST' ? {} : undefined });
    assert.equal(r.status, 401, metodo + ' ' + ruta);
  }
});

test('GET /guiones/entorno: Ollama, modelo instalado, Piper (binario y voces) y banco', async () => {
  const { status, datos } = await api('/guiones/entorno');
  assert.equal(status, 200);
  assert.equal(datos.ollama.activo, true);
  assert.equal(datos.ollama.instalado, true);
  assert.equal(datos.ollama.modelo, 'qwen2.5:7b-instruct');
  assert.equal(datos.piper.binario, true);
  assert.equal(datos.piper.listo, true);
  assert.ok(datos.piper.voces['en-US'].endsWith('en_US-prueba-low.onnx') && datos.piper.voces['es-US'].endsWith('es_MX-prueba-low.onnx'));
  assert.deepEqual(datos.banco, { efectos: {}, musica: {}, medios: {} });
  assert.deepEqual(datos.mercados.map((m) => m.id), ['en-US', 'es-US']);
});

test('POST /guiones: ficha invalida -> 400 con los problemas; valida -> 201; con tambienEsUS encola dos', async () => {
  const mala = await api('/guiones', { metodo: 'POST', cuerpo: { ficha: { titulo: 'x' } } });
  assert.equal(mala.status, 400);
  assert.match(mala.texto, /canal|mercado|hecho/i);
  assert.equal((await api('/guiones', { metodo: 'POST', cuerpo: {} })).status, 400);
  const ok = await api('/guiones', { metodo: 'POST', cuerpo: { ficha: FICHA, tambienEsUS: true, tituloEs: 'El ascenso de Marco Silva' } });
  assert.equal(ok.status, 201);
  ids = ok.datos.ids;
  assert.equal(ids.length, 2);
  const lista = (await api('/guiones')).datos;
  assert.equal(lista.pendientes.length, 2);
  assert.deepEqual(lista.pendientes.map((g) => g.mercado).sort(), ['en-US', 'es-US']);
  assert.equal(lista.pendientes.find((g) => g.mercado === 'es-US').titulo, 'El ascenso de Marco Silva');
});

test('GET /guiones/:estado/:id: devuelve el guion; ids o estados raros dan 404 (sin rutas)', async () => {
  const bien = await api('/guiones/pendientes/' + ids[0]);
  assert.equal(bien.status, 200);
  assert.equal(bien.datos.guion.ficha.canal, 'stories');
  for (const ruta of ['/guiones/pendientes/..%2F..%2Fetc%2Fpasswd', '/guiones/pendientes/0000000000001-deadbeef', '/guiones/otro/' + ids[0]]) assert.equal((await api(ruta)).status, 404, ruta);
});

test('POST /guiones/procesar: escribe con Ollama en segundo plano (202), valida y mueve a procesados', async () => {
  const r = await api('/guiones/procesar', { metodo: 'POST', cuerpo: {} });
  assert.equal(r.status, 202);
  assert.equal(r.datos.trabajo.tipo, 'guion');
  const fin = await esperarLibre();
  assert.equal(fin.estado, 'ok', fin.error);
  assert.equal((await api('/guiones/procesar', { metodo: 'POST', cuerpo: {} })).status, 202);
  assert.equal((await esperarLibre()).estado, 'ok');
  const lista = (await api('/guiones')).datos;
  assert.equal(lista.pendientes.length, 0);
  assert.equal(lista.procesados.length, 2);
  assert.ok(peticiones.every((p) => p.keep_alive === 0 && p.stream === false && p.format === 'json'));
  assert.equal((await api('/guiones/procesar', { metodo: 'POST', cuerpo: {} })).status, 404);   // ya no hay pendientes
});

test('POST /guiones/producir: valida ids y mercados antes de arrancar', async () => {
  const p = (ids2) => api('/guiones/producir', { metodo: 'POST', cuerpo: { ids: ids2 } });
  assert.equal((await p([])).status, 400);
  assert.equal((await p([1, 2, 3])).status, 400);
  assert.equal((await p(['../x'])).status, 400);
  assert.equal((await p(['0000000000001-deadbeef'])).status, 404);
  assert.equal((await api('/guiones/producir', { metodo: 'POST', cuerpo: {} })).status, 400);
  const noStories = (await api('/guiones', { metodo: 'POST', cuerpo: { ficha: { titulo: 'Gol', canal: 'sports', mercado: 'en-US', hechos: [{ tipo: 'dato', valor: 'Final' }] } } })).datos.ids[0];
  assert.equal((await p([noStories])).status, 404);   // todavia pendiente: solo se produce desde procesados
});

test('producir (Piper falso + FFmpeg real): 202, estado con progreso, clips en el store y descarga por mercado', { skip: windows ? 'envoltorio sh' : false, timeout: 240000 }, async () => {
  await esperarLibre();
  const procesados = (await api('/guiones')).datos.procesados;
  const r = await api('/guiones/producir', { metodo: 'POST', cuerpo: { ids: procesados.map((g) => g.id) } });
  assert.equal(r.status, 202);
  assert.equal(r.datos.trabajo.tipo, 'produccion');
  // mientras corre, otro trabajo recibe 409 (y los pendientes nuevos esperan)
  await api('/guiones', { metodo: 'POST', cuerpo: { ficha: { ...FICHA, titulo: 'Otra' } } });
  assert.equal((await api('/guiones/procesar', { metodo: 'POST', cuerpo: {} })).status, 409);
  assert.equal((await api('/guiones/producir', { metodo: 'POST', cuerpo: { ids: [procesados[0].id] } })).status, 409);
  const fin = await esperarLibre();
  assert.equal(fin.estado, 'ok', fin.error);
  assert.equal(fin.progreso, 100);
  assert.equal(fin.resultado.clips.length, 2);   // 1 parte + el largo
  const clips = fin.resultado.clips.map((id) => store.buscar(id));
  assert.ok(clips.every((c) => c.estado === 'listo' && c.canal === 'stories'));
  const parte1 = clips.find((c) => c.parte === 1);
  assert.deepEqual(Object.keys(parte1.archivos).sort(), ['en-US', 'es-US']);
  for (const url of [...Object.values(parte1.archivos), ...Object.values(clips.find((c) => c.largo).archivos)]) assert.ok((await fs.stat(path.join(process.env.CLIPS_DIR, path.basename(url)))).size > 1000, url);
  const en = await fetch(base + '/api/panel/clips/' + parte1.id + '/descarga', { headers: AUTH });
  const es = await fetch(base + '/api/panel/clips/' + parte1.id + '/descarga?mercado=es-US', { headers: AUTH });
  assert.equal(en.status, 200);
  assert.equal(es.status, 200);
  assert.match(es.headers.get('content-disposition'), /-es-us\.mp4/);
  assert.doesNotMatch(en.headers.get('content-disposition'), /-es-us/);
  const bytesEn = Buffer.from(await en.arrayBuffer());
  const bytesEs = Buffer.from(await es.arrayBuffer());
  assert.equal(bytesEn.subarray(4, 8).toString(), 'ftyp');
  assert.notDeepEqual(bytesEn, bytesEs);
  assert.equal((await fetch(base + '/api/panel/clips/' + parte1.id + '/descarga?mercado=fr-FR', { headers: AUTH })).status, 400);
});
CLIPLAB_EOF_PARTE5
escribir "tests/guiones-panel.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// El panel no usa jsdom: se comprueba de forma estatica que cada control apunta a algo real (boton -> ruta -> funcion exportada).
const raiz = path.join(import.meta.dirname, '..');
const leer = (r) => fs.readFile(path.join(raiz, r), 'utf8');
const [html, guiones, api, paquete, css, rutas, indexRutas] = await Promise.all(['public/index.html', 'public/js/guiones.js', 'public/js/api.js', 'public/js/paquete.js', 'public/css/styles.css', 'src/routes/guiones.js', 'src/routes/index.js'].map(leer));

test('index.html: boton #btn-guiones y el modulo guiones.js cargado', () => {
  assert.match(html, /id="btn-guiones"/);
  assert.match(html, /<script type="module" src="\/js\/guiones\.js"><\/script>/);
  assert.ok(html.indexOf('id="btn-guiones"') < html.indexOf('id="lnk-sesion"'));
});

test('guiones.js: cada importacion existe en api.js / ui.js', async () => {
  const ui = await leer('public/js/ui.js');
  for (const [, nombres, desde] of [...guiones.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)]) {
    const fuente = desde === 'api' ? api : ui;
    for (const n of nombres.split(',').map((x) => x.trim())) assert.match(fuente, new RegExp('export (async )?(function|const|class) ' + n + '\\b'), desde + ': ' + n);
  }
});

test('api.js: las funciones de guiones llaman a rutas que existen en el servidor', () => {
  const llamadas = [...api.matchAll(/solicitar\('(\/api\/panel\/guiones[^']*)'(?:, \{ metodo: '(\w+)')?/g)].map((m) => [m[2] || 'GET', m[1]]);
  assert.equal(llamadas.length, 6);
  for (const [metodo, ruta] of llamadas) {
    const sub = ruta.replace('/api/panel', '');
    assert.match(rutas, new RegExp(`router\\.${metodo.toLowerCase()}\\('${sub}'`), metodo + ' ' + sub);
  }
  assert.match(indexRutas, /guionesRoutes/);
});

test('guiones.js: cada boton del dialogo llama a su funcion real', () => {
  assert.match(guiones, /onclick: \(\) => accion\(procesarGuion/);
  assert.match(guiones, /producirGuiones\(\[\.\.\.seleccion\]\)/);
  assert.match(guiones, /encolarGuionFicha\(ficha, opciones\)/);
  assert.match(guiones, /text: 'Actualizar', onclick: \(\) => refrescar\(true\)/);
  assert.match(guiones, /text: 'Cerrar', onclick: \(\) => d\.close\(\)/);
  assert.match(guiones, /getElementById\('btn-guiones'\)/);
  assert.match(guiones, /obtenerEntornoGuiones\(\)/);
});

test('guiones.js: sin innerHTML ni eval (todo el texto entra con textContent)', () => {
  assert.doesNotMatch(guiones, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
});

test('paquete.js descarga el archivo del mercado elegido; el CSS del dialogo existe', () => {
  assert.match(paquete, /descargarVideo\(vista\.clipId, vista\.mercado\)/);
  assert.match(api, /'\/descarga' \+ \(mercado \?/);
  assert.match(css, /dialog\.dlg-guiones/);
});

test('parsearHechos: "tipo: valor" por linea, con errores claros', async () => {
  globalThis.document = { getElementById: () => null };   // el modulo busca su boton al cargarse
  const { parsearHechos } = await import('../public/js/guiones.js');
  const r = parsearHechos('persona: Marco Silva\n\nlugar = Lisbon, Portugal\nFECHA: March 3, 1998\nnada raro\nrumor: x');
  assert.deepEqual(r.hechos, [{ tipo: 'persona', valor: 'Marco Silva' }, { tipo: 'lugar', valor: 'Lisbon, Portugal' }, { tipo: 'fecha', valor: 'March 3, 1998' }]);
  assert.equal(r.errores.length, 2);
  assert.match(r.errores[0], /Linea 5/);
  assert.deepEqual(parsearHechos('').hechos, []);
});
CLIPLAB_EOF_PARTE5
escribir "tests/fixtures/piper-falso.mjs" <<'CLIPLAB_EOF_PARTE5'
// Piper de mentira para las pruebas: mismas banderas que el real (-m, -f, -q, --length_scale, --sentence_silence, --espeak_data),
// lee el texto de stdin y escribe un WAV mono 16 kHz en silencio con 1 s por cada 15 caracteres (x length_scale).
// Comportamientos: modelo con "falla" en el nombre -> sale con codigo 3; PIPER_FALSO=colgar -> no termina; PIPER_FALSO=vacio -> no escribe nada.
import fs from 'node:fs';

const a = process.argv.slice(2);
const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const modelo = val('-m');
const salida = val('-f');
const escala = Number(val('--length_scale') ?? 1);
if (process.env.PIPER_FALSO === 'colgar') setInterval(() => {}, 1000);
else {
  let texto = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { texto += d; });
  process.stdin.on('end', () => {
    if (!modelo || !fs.existsSync(modelo)) { process.stderr.write('model not found: ' + modelo + '\n'); process.exit(1); }
    if (/falla/.test(modelo)) { process.stderr.write('onnx error simulado\n'); process.exit(3); }
    if (process.env.PIPER_FALSO === 'vacio') process.exit(0);
    const segundos = Math.max(0.5, (texto.trim().length / 15) * escala);
    const muestras = Math.round(segundos * 16000);
    const datos = Buffer.alloc(muestras * 2);
    const cab = Buffer.alloc(44);
    cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8); cab.write('fmt ', 12);
    cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(16000, 24); cab.writeUInt32LE(32000, 28);
    cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
    fs.writeFileSync(salida, Buffer.concat([cab, datos]));
    process.stdout.write(salida + '\n');
  });
}
CLIPLAB_EOF_PARTE5
escribir "src/config/index.js" <<'CLIPLAB_EOF_PARTE5'
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
CLIPLAB_EOF_PARTE5
escribir "src/validador-ficha.js" <<'CLIPLAB_EOF_PARTE5'
// ---------------------------------------------------------------------------
// Validador de ficha y de guion. Modulo puro: sin disco, sin red y sin config.
//
// La FICHA que carga el usuario es la UNICA fuente de hechos:
//   { titulo, canal, mercado, hechos:[{ tipo: fecha|lugar|cifra|persona|dato, valor }], fuente?, partes?, proyecto?, continuar?, foto? }
// El modelo devuelve:
//   { partes:[{ n, narracion, tecnico:[{ escena, textoPantalla, efecto?, duracionSeg }] }] }
// validarGuion() lo RECHAZA si: la estructura es mala; "Parte N" no es consecutiva; aparecen numeros, meses, lugares o nombres
// propios que no estan en la ficha; hay dialogos de actores o citas atribuidas; el idioma no corresponde al mercado; excede el
// ritmo del canal; o (news) falta el lugar o la fecha. Devuelve { ok, problemas[], avisos[], detalle[] }.
//
// Limites conocidos (heuristicas, sin diccionario): un nombre propio al INICIO de una frase no se comprueba; las cifras escritas
// con palabras ("three million") solo dan aviso; el idioma usa detectarIdioma (puede devolver null si hay poca evidencia).
// ---------------------------------------------------------------------------
import { CANALES, ErrorCanal, normalizarCanal } from './canales.js';
import { MERCADOS, normalizarMercado } from './mercados.js';
import { detectarIdioma } from './paquete-texto.js';

export class ErrorFicha extends ErrorCanal {
  constructor(problemas) {
    super('Ficha no valida: ' + problemas.join(' | '));
    this.name = 'ErrorFicha';
    this.problemas = problemas;
  }
}

export const TIPOS_HECHO = Object.freeze(['fecha', 'lugar', 'cifra', 'persona', 'dato']);
export const LIMITES_FICHA = Object.freeze({ titulo: 160, hechos: 40, valor: 300, fuente: 300, partes: 12, proyecto: 64 });
/** Una escena puede durar hasta beatSeconds * este factor; la narracion no puede pasar de estas palabras por segundo. */
export const ESCENA_MAX_FACTOR = 1.5;
export const PALABRAS_POR_SEGUNDO_MAX = 3.4;
export const MAX_PROBLEMAS = 12;

const TEXTO_ETIQUETAS_NARRADOR = /^(narrator|narrador|narradora|voz|voz en off|voiceover|voice-over|locutor|locutora)$/i;
const MESES = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
// Un mes de la ficha en un idioma vale en el otro ("March 3" en la ficha -> "marzo" en la narracion es-US).
const INDICE_MES = new Map([...MESES.en.map((m, i) => [m, i]), ...MESES.es.map((m, i) => [m, i]), ['setiembre', 8]]);
const TODOS_LOS_MESES = new Set(INDICE_MES.keys());
const nombresDeMes = (indice) => [MESES.en[indice], MESES.es[indice]];
const NUMEROS_EN_PALABRAS = /\b(hundred|thousand|million|billion|trillion|cien|ciento|mil|millon|millones|billon|billones)\b/;
const VERBOS_DE_HABLA = /(?<![\p{L}])(said|says|told|replied|answered|shouted|whispered|asked|exclaimed|yelled|dijo|dice|respondio|respondió|grito|gritó|susurro|susurró|pregunto|preguntó|exclamo|exclamó)(?![\p{L}])\s*[:,]?\s*["“«]/iu;

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const palabrasDe = (t) => sinAcentos(t).match(/[\p{L}\p{N}]+/gu) || [];

/** Numero canonico: "1,200" y "1.200" (miles) -> "1200"; "3,5" -> "3.5". */
function canonNum(t) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return t.replace(/[.,]/g, '');
  return t.replace(',', '.');
}
const numerosDe = (t) => (String(t ?? '').match(/\d+(?:[.,]\d+)*/g) || []).map(canonNum);

// --------------------------------------------------------------------------------------------- ficha
/** Revisa la ficha. Devuelve { ok, problemas, avisos, ficha } (ficha normalizada, o null si hay problemas). */
export function validarFicha(entrada) {
  const problemas = [];
  const avisos = [];
  const f = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : null;
  if (!f) return { ok: false, problemas: ['La ficha debe ser un objeto.'], avisos, ficha: null };

  const titulo = String(f.titulo ?? '').trim();
  if (!titulo) problemas.push('Falta el titulo de la ficha.');
  else if (titulo.length > LIMITES_FICHA.titulo) problemas.push('El titulo pasa de ' + LIMITES_FICHA.titulo + ' caracteres.');

  let canal = null;
  try { canal = normalizarCanal(f.canal); } catch (e) { problemas.push(e.message); }
  let mercado = null;
  try { mercado = normalizarMercado(f.mercado); } catch (e) { problemas.push(e.message); }

  const hechos = [];
  if (!Array.isArray(f.hechos) || f.hechos.length === 0) {
    problemas.push('La ficha necesita al menos un hecho (hechos: [{ tipo, valor }]).');
  } else {
    if (f.hechos.length > LIMITES_FICHA.hechos) problemas.push('La ficha tiene mas de ' + LIMITES_FICHA.hechos + ' hechos.');
    f.hechos.slice(0, LIMITES_FICHA.hechos).forEach((h, i) => {
      const tipo = String(h && h.tipo ? h.tipo : '').trim().toLowerCase();
      const valor = h && (typeof h.valor === 'string' || typeof h.valor === 'number') ? String(h.valor).trim() : '';
      if (!TIPOS_HECHO.includes(tipo)) { problemas.push('Hecho ' + (i + 1) + ': tipo no valido (' + (tipo || 'vacio') + '). Usa: ' + TIPOS_HECHO.join(', ') + '.'); return; }
      if (!valor) { problemas.push('Hecho ' + (i + 1) + ': falta el valor.'); return; }
      if (valor.length > LIMITES_FICHA.valor) { problemas.push('Hecho ' + (i + 1) + ': el valor pasa de ' + LIMITES_FICHA.valor + ' caracteres.'); return; }
      hechos.push({ tipo, valor });
    });
  }

  if (canal && CANALES[canal].rigor) {
    if (!hechos.some((h) => h.tipo === 'lugar')) problemas.push('El canal ' + canal + ' exige un hecho de tipo lugar.');
    if (!hechos.some((h) => h.tipo === 'fecha')) problemas.push('El canal ' + canal + ' exige un hecho de tipo fecha.');
  } else if (canal) {
    if (!hechos.some((h) => h.tipo === 'fecha')) avisos.push('La ficha no tiene fecha: el guion no podra mencionar ninguna.');
    if (!hechos.some((h) => h.tipo === 'lugar')) avisos.push('La ficha no tiene lugar: el guion no podra mencionar ninguno.');
  }

  let partes = null;
  if (f.partes !== undefined && f.partes !== null && f.partes !== '') {
    partes = Number(f.partes);
    if (!Number.isInteger(partes) || partes < 1 || partes > LIMITES_FICHA.partes) { problemas.push('partes debe ser un entero entre 1 y ' + LIMITES_FICHA.partes + '.'); partes = null; }
  }
  const fuente = f.fuente === undefined || f.fuente === null ? '' : String(f.fuente).trim().slice(0, LIMITES_FICHA.fuente);
  let proyecto = '';
  if (f.proyecto !== undefined && f.proyecto !== null && String(f.proyecto).trim() !== '') {
    proyecto = String(f.proyecto).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(proyecto)) { problemas.push('proyecto solo admite letras minusculas, numeros, guion y guion bajo (max. 64).'); proyecto = ''; }
  }

  if (problemas.length) return { ok: false, problemas, avisos, ficha: null };
  let foto = '';
  if (f.foto !== undefined && f.foto !== null && String(f.foto).trim() !== '') {
    foto = String(f.foto).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.(jpe?g|png|webp)$/i.test(foto)) { problemas.push('foto debe ser el nombre de una imagen (jpg, png o webp) dentro de medios/fotos del banco, sin rutas.'); foto = ''; }
  }
  if (problemas.length) return { ok: false, problemas, avisos, ficha: null };
  const ficha = { titulo, canal, mercado, hechos, fuente, partes, proyecto, foto, continuar: f.continuar === true };
  return { ok: true, problemas, avisos, ficha };
}

/** Igual que validarFicha pero lanza ErrorFicha (400) si hay problemas. Devuelve la ficha normalizada. */
export function normalizarFicha(entrada) {
  const r = validarFicha(entrada);
  if (!r.ok) throw new ErrorFicha(r.problemas);
  return r.ficha;
}

/** Texto de la ficha (titulo, hechos, fuente) que sirve de fuente unica para comparar. */
export function corpusDeFicha(ficha) {
  return [ficha.titulo, ...(ficha.hechos || []).map((h) => h.valor), ficha.fuente || ''].join(' \n ');
}

// --------------------------------------------------------------------------------------------- guion
function contarMayusculas(tokens) {
  return tokens.filter((t) => /^\p{Lu}/u.test(t.texto)).length;
}

/** Nombres propios probables (palabra con mayuscula que NO abre frase) de un texto. */
function nombresPropios(texto) {
  const tokens = [];
  const re = /[\p{L}][\p{L}\p{M}]*/gu;
  let m;
  while ((m = re.exec(texto)) !== null) tokens.push({ texto: m[0], pos: m.index });
  if (tokens.length === 0) return [];
  // Linea en "Title Case" o TODO MAYUSCULAS (texto de pantalla): no se puede distinguir nombres propios.
  if (tokens.length >= 3 && contarMayusculas(tokens) / tokens.length >= 0.6) return [];
  const salida = [];
  for (const t of tokens) {
    if (!/^\p{Lu}/u.test(t.texto) || t.texto.length < 2) continue;   // "I", "A" sueltas o minusculas
    const antes = texto.slice(0, t.pos).replace(/[\s"“”'‘’«»()\[\]]+$/u, '');
    const abreFrase = antes === '' || /[.!?¡¿:;\n—–]$/.test(antes);
    if (abreFrase) continue;
    salida.push(t.texto);
  }
  return salida;
}

function pareceNarrador(etiqueta) { return TEXTO_ETIQUETAS_NARRADOR.test(etiqueta.trim()); }

/**
 * Valida la salida del modelo contra la ficha.
 * opciones: { ritmo (por defecto CANALES[canal].ritmo), desdeParte = 1 (primera "Parte N" esperada), partes (cuantas se esperan) }
 */
export function validarGuion(salida, fichaEntrada, opciones = {}) {
  const detalle = [];
  const problema = (codigo, mensaje) => { if (!detalle.some((d) => d.mensaje === mensaje)) detalle.push({ nivel: 'problema', codigo, mensaje }); };
  const aviso = (codigo, mensaje) => { if (!detalle.some((d) => d.mensaje === mensaje)) detalle.push({ nivel: 'aviso', codigo, mensaje }); };
  const cierre = () => {
    const problemas = detalle.filter((d) => d.nivel === 'problema').map((d) => d.mensaje).slice(0, MAX_PROBLEMAS);
    const avisos = detalle.filter((d) => d.nivel === 'aviso').map((d) => d.mensaje);
    return { ok: problemas.length === 0, problemas, avisos, detalle };
  };

  const rf = validarFicha(fichaEntrada);
  if (!rf.ok) { rf.problemas.forEach((p) => problema('ficha', p)); return cierre(); }
  const ficha = rf.ficha;
  const perfil = CANALES[ficha.canal];
  const mercado = MERCADOS[ficha.mercado];
  const ritmo = { ...perfil.ritmo, ...(opciones.ritmo || {}) };
  const desdeParte = Number.isInteger(opciones.desdeParte) && opciones.desdeParte >= 1 ? opciones.desdeParte : 1;
  const esperadas = Number.isInteger(opciones.partes) ? opciones.partes : ficha.partes;

  // 1) estructura -----------------------------------------------------------------------------
  const partes = salida && typeof salida === 'object' && Array.isArray(salida.partes) ? salida.partes : null;
  if (!partes || partes.length === 0) { problema('estructura', 'La salida debe ser { "partes": [ ... ] } con al menos una parte.'); return cierre(); }
  if (partes.length > LIMITES_FICHA.partes) problema('estructura', 'Hay mas de ' + LIMITES_FICHA.partes + ' partes.');
  if (esperadas && partes.length !== esperadas) problema('estructura', 'Se pedian ' + esperadas + ' partes y llegaron ' + partes.length + '.');

  const corpus = corpusDeFicha(ficha);
  const corpusNorm = sinAcentos(corpus).replace(/\s+/g, ' ');
  const palabrasFicha = new Set(palabrasDe(corpus));
  const numerosFicha = new Set(numerosDe(corpus));
  const numerosPermitidos = new Set(numerosFicha);
  partes.forEach((p, i) => { numerosPermitidos.add(String(desdeParte + i)); });
  numerosPermitidos.add(String(partes.length));
  if (Number.isInteger(esperadas)) numerosPermitidos.add(String(esperadas));
  const mesesFicha = new Set([...TODOS_LOS_MESES].filter((mes) => palabrasFicha.has(mes)).map((mes) => INDICE_MES.get(mes)));

  const textoTotal = [];
  partes.forEach((p, i) => {
    const et = 'Parte ' + (desdeParte + i);
    if (!p || typeof p !== 'object') { problema('estructura', et + ': debe ser un objeto.'); return; }

    // 2) Parte N consecutiva
    if (!Number.isInteger(p.n)) problema('parte', et + ': falta "n" entero.');
    else if (p.n !== desdeParte + i) problema('parte', 'Parte N no es consecutiva: se esperaba ' + (desdeParte + i) + ' y llego ' + p.n + '.');

    const narracion = typeof p.narracion === 'string' ? p.narracion.trim() : '';
    if (!narracion) problema('estructura', et + ': falta la narracion.');
    const tecnico = Array.isArray(p.tecnico) ? p.tecnico : null;
    if (!tecnico || tecnico.length === 0) problema('estructura', et + ': falta "tecnico" (lista de escenas).');

    const campos = [];   // [etiqueta, texto]
    if (narracion) campos.push([et + ' narracion', narracion]);
    let duracionTotal = 0;
    const maxEscena = Math.round(ritmo.beatSeconds * ESCENA_MAX_FACTOR * 100) / 100;
    const largas = [];
    (tecnico || []).forEach((e, j) => {
      const loc = et + ' escena ' + (j + 1);
      if (!e || typeof e !== 'object') { problema('estructura', loc + ': debe ser un objeto.'); return; }
      const escena = typeof e.escena === 'string' ? e.escena.trim() : '';
      const pantalla = typeof e.textoPantalla === 'string' ? e.textoPantalla.trim() : '';
      if (!escena) problema('estructura', loc + ': falta "escena".');
      if (typeof e.textoPantalla !== 'string') problema('estructura', loc + ': falta "textoPantalla" (puede ir vacio).');
      if (e.efecto !== undefined && typeof e.efecto !== 'string') problema('estructura', loc + ': "efecto" debe ser texto.');
      const d = e.duracionSeg;
      if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) problema('estructura', loc + ': duracionSeg debe ser un numero mayor que 0.');
      else {
        duracionTotal += d;
        // 6) ritmo por escena
        if (d > maxEscena + 1e-9) largas.push((j + 1) + ' (' + d + ' s)');
        else if (d < 1) aviso('ritmo', loc + ' dura menos de 1 s.');
      }
      if (escena) campos.push([loc + ' escena', escena]);
      if (pantalla) campos.push([loc + ' textoPantalla', pantalla]);
    });

    if (largas.length) problema('ritmo', et + ': escena(s) ' + largas.join(', ') + ' exceden el ritmo del canal ' + ficha.canal + ' (maximo ' + maxEscena + ' s por escena).');
    if (duracionTotal > 0) {
      if (duracionTotal > ritmo.segmentMaxSeconds) problema('ritmo', et + ' dura ' + Math.round(duracionTotal) + ' s y excede el maximo del canal ' + ficha.canal + ' (' + ritmo.segmentMaxSeconds + ' s).');
      else if (duracionTotal < ritmo.segmentMinSeconds) aviso('ritmo', et + ' dura ' + Math.round(duracionTotal) + ' s, menos del minimo del canal (' + ritmo.segmentMinSeconds + ' s).');
      const nPalabras = narracion ? narracion.split(/\s+/).filter(Boolean).length : 0;
      if (nPalabras / duracionTotal > PALABRAS_POR_SEGUNDO_MAX) problema('ritmo', et + ': la narracion (' + nPalabras + ' palabras) no cabe en ' + Math.round(duracionTotal) + ' s; acorta el texto o alarga las escenas.');
    }

    // 3) hechos, dialogos y citas
    for (const [loc, texto] of campos) {
      for (const num of numerosDe(texto)) {
        if (!numerosPermitidos.has(num)) problema('hecho_inventado', loc + ': la cifra o el ano "' + num + '" no esta en la ficha.');
      }
      for (const original of texto.match(/[\p{L}]+/gu) || []) {
        const palabra = sinAcentos(original);
        if (!TODOS_LOS_MESES.has(palabra) || (palabra === 'may' && original[0] !== 'M')) continue;   // "may" en minuscula es el verbo
        if (!mesesFicha.has(INDICE_MES.get(palabra))) problema('hecho_inventado', loc + ': el mes "' + palabra + '" no esta en la ficha.');
      }
      if (NUMEROS_EN_PALABRAS.test(sinAcentos(texto)) && !NUMEROS_EN_PALABRAS.test(corpusNorm)) aviso('cifra_en_palabras', loc + ': hay una cifra escrita con palabras; comprueba que viene de la ficha.');
      for (const nombre of new Set(nombresPropios(texto))) {
        if (!palabrasFicha.has(sinAcentos(nombre)) && !TODOS_LOS_MESES.has(sinAcentos(nombre)) && !/^parte$|^part$/i.test(nombre)) {
          problema('hecho_inventado', loc + ': el nombre o lugar "' + nombre + '" no esta en la ficha.');
        }
      }
      // citas y dialogos
      for (const q of texto.matchAll(/[“"«]([^”"»]{1,400})[”"»]/gu)) {
        const dentro = q[1].trim();
        const nPal = dentro.split(/\s+/).filter(Boolean).length;
        const enFicha = corpusNorm.includes(sinAcentos(dentro).replace(/\s+/g, ' '));
        if (nPal >= 3 && !enFicha) problema('cita', loc + ': hay una cita o dialogo entrecomillado que no esta en la ficha ("' + dentro.slice(0, 40) + '"). La voz en off no usa dialogos de actores ni citas atribuidas.');
        else if (nPal < 3 && !enFicha) aviso('cita', loc + ': entrecomillado corto ("' + dentro.slice(0, 40) + '"); comprueba que no es una cita inventada.');
      }
      if (VERBOS_DE_HABLA.test(texto)) problema('cita', loc + ': cita atribuida (alguien "dijo" algo entre comillas). Esta prohibida.');
      if (/^\s*[—–]\s*\S/m.test(texto)) problema('dialogo', loc + ': linea de dialogo (empieza con raya). Esta prohibido.');
      for (const l of texto.matchAll(/^\s*(\p{Lu}[\p{L}.' -]{0,30}):\s+\S/gmu)) {
        if (!pareceNarrador(l[1])) problema('dialogo', loc + ': etiqueta de personaje "' + l[1] + ':" (dialogo de actor). Esta prohibido.');
      }
      // mencion a otra "Parte N"
      for (const r of texto.matchAll(/\b(?:parte|part)\s+(\d+)\b/giu)) {
        if (Number(r[1]) !== desdeParte + i) problema('parte', loc + ': menciona "Parte ' + r[1] + '" dentro de la Parte ' + (desdeParte + i) + '.');
      }
    }
    if (narracion) textoTotal.push(narracion);

    // 5) idioma vs mercado
    const idioma = detectarIdioma(narracion);
    if (idioma && idioma !== mercado.idioma) problema('idioma', et + ': la narracion esta en ' + (idioma === 'en' ? 'ingles' : 'espanol') + ' y el mercado ' + mercado.id + ' pide ' + (mercado.idioma === 'en' ? 'ingles' : 'espanol') + '.');
  });

  // news: lugar y fecha obligatorios tambien en el guion
  if (perfil.rigor) {
    const narrado = sinAcentos(textoTotal.join(' '));
    const palabrasNarradas = new Set(palabrasDe(narrado));
    const lugares = ficha.hechos.filter((h) => h.tipo === 'lugar');
    const lugarDicho = lugares.some((h) => { const ps = palabrasDe(h.valor).filter((w) => w.length >= 3); return ps.length > 0 && ps.every((w) => palabrasNarradas.has(w)); });
    if (!lugarDicho) problema('rigor', 'El canal ' + ficha.canal + ' exige decir el lugar en la narracion (de la ficha: ' + lugares.map((h) => h.valor).join(' / ') + ').');
    const fechas = ficha.hechos.filter((h) => h.tipo === 'fecha');
    const fechaDicha = fechas.some((h) => {
      const clave = [...palabrasDe(h.valor).filter((w) => TODOS_LOS_MESES.has(w)).flatMap((w) => nombresDeMes(INDICE_MES.get(w))), ...numerosDe(h.valor).filter((n) => /^\d{4}$/.test(n))];
      const alternativa = clave.length ? clave : numerosDe(h.valor);
      return alternativa.some((c) => palabrasNarradas.has(c));
    });
    if (!fechaDicha) problema('rigor', 'El canal ' + ficha.canal + ' exige decir la fecha en la narracion (de la ficha: ' + fechas.map((h) => h.valor).join(' / ') + ').');
  }

  return cierre();
}
CLIPLAB_EOF_PARTE5
escribir "src/routes/index.js" <<'CLIPLAB_EOF_PARTE5'
import { Router } from 'express';
import healthRoutes from './health.js';
import statusRoutes from './status.js';
import panelRoutes from './panel.js';
import sesionRoutes from './sesion.js';
import cookiesRedesRoutes from './cookies-redes.js';
import loteRoutes from './lote.js';
import paqueteRoutes from './paquete.js';
import guionesRoutes from './guiones.js';
import { config } from '../config/index.js';

const router = Router();

router.get('/api', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'ClipLab Pro API',
    version: '0.3.0',
    modo: config.modo,
    endpoints: ['/health', '/api/status', '/api/panel/estado', '/api/panel/encolar', '/api/panel/sesion', '/api/panel/cookies-redes', '/api/panel/logo', '/api/panel/lote/aplicar', '/api/panel/canales', '/api/panel/clips/:id/paquete', '/api/panel/clips/:id/descarga', '/api/panel/guiones', '/api/panel/guiones/entorno', '/api/panel/guiones/estado', '/api/panel/guiones/procesar', '/api/panel/guiones/producir'],
  });
});

// Modo de operacion (publico, sin llave): el panel y los scripts lo consultan para saber si hay publicador.
router.get('/api/modo', (req, res) => {
  res.status(200).json({
    ok: true,
    modo: config.modo,
    local: config.modoLocal,
    publicador: !config.modoLocal,
    canal: config.canal,
    canalValido: config.canalValido,
    ritmo: {
      beatSeconds: config.beatSeconds,
      punchZoom: config.punchZoom,
      hotCutGap: config.hotCutGap,
      segmentMinSeconds: config.segmentMinSeconds,
      segmentMaxSeconds: config.segmentMaxSeconds,
    },
    ritmoOrigen: config.ritmoOrigen,
  });
});

router.use(healthRoutes);
router.use('/api', statusRoutes);
router.use('/api/panel/sesion', sesionRoutes);
router.use('/api/panel/cookies-redes', cookiesRedesRoutes);
router.use('/api/panel', loteRoutes);
router.use('/api/panel', paqueteRoutes);
router.use('/api/panel', guionesRoutes);
router.use('/api/panel', panelRoutes);

// Publicador automatico (programador + publicador + Chromium). En modo local NO se carga: el import es dinamico a proposito,
// para que ni siquiera se evaluen esos modulos. Sus rutas responden 404 aunque venga una llave valida.
function publicadorDesactivado(req, res) {
  res.status(404).json({ ok: false, error: 'Publicador automatico desactivado (CLIPLAB_MODE=local): descarga el video y copia los textos desde el panel.' });
}

if (config.modoLocal) {
  router.use('/api/programador', publicadorDesactivado);
  router.all('/api/clips/:id/publicar-ahora', publicadorDesactivado);
  router.all('/api/clips/:id/programar', publicadorDesactivado);
} else {
  const { default: programadorRouter } = await import('./programador.js');
  router.use(programadorRouter);
}

export default router;
CLIPLAB_EOF_PARTE5
escribir "src/routes/paquete.js" <<'CLIPLAB_EOF_PARTE5'
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config/index.js';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { CANALES, DESTINOS, IDS_CANALES, normalizarCanal, normalizarDestinos } from '../canales.js';
import { MERCADOS, normalizarMercado, normalizarMercados } from '../mercados.js';
import { planDeRenders } from '../plan-renders.js';
import { generarPaquetes } from '../paquete-texto.js';

// Paquete de texto, descarga manual del video y catalogo de solo lectura (modo local: se publica a mano).
// Cada ruta lleva su propia llave maestra; el router no la aplica a todo lo que pase por /api/panel.
const router = Router();

const ESTADOS_CON_VIDEO = new Set(['listo', 'publicado']);
const NOMBRE_VIDEO = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/;   // sin punto inicial: nada oculto ni '..'

class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/** Errores esperados (404/409) se responden sin ensuciar el log; el resto (incluidos ErrorCanal/ErrorMercado, 400) va al manejador. */
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) {
    res.status(error.status).json({ ok: false, error: error.message });
    return;
  }
  next(error);
}

/** Texto de una consulta (?destino=a,b): acepta repeticiones (?destino=a&destino=b) y vacio = no indicado. */
function listaDeConsulta(valor) {
  if (valor === undefined) return undefined;
  const lista = (Array.isArray(valor) ? valor : [valor]).map((x) => String(x ?? '')).join(',');
  return lista.trim() ? lista : undefined;
}

function buscarClip(id) {
  const limpio = String(id ?? '').trim();
  const clip = limpio ? store.buscar(limpio) : null;
  if (!clip) throw new ErrorHttp(404, 'Clip no encontrado');
  return clip;
}

/** Nombre de descarga seguro (ASCII, sin rutas): titulo del clip o, si el titulo es una URL, su id. */
export function nombreDeDescarga(clip, mercado = null) {
  const titulo = String(clip.titulo ?? '');
  const base = /^(https?:\/\/|www\.)/i.test(titulo.trim()) ? '' : titulo;
  const slug = base.toLowerCase().replace(/ñ/g, 'n').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const sufijo = mercado && clip.archivos && Object.hasOwn(clip.archivos, mercado) ? '-' + String(mercado).toLowerCase() : '';
  return (slug || path.basename(String(clip.id ?? 'clip')).replace(/[^A-Za-z0-9_-]/g, '') || 'clip') + sufijo + '.mp4';
}

/** Nombre de archivo del video dentro de clipsDir, o null si la URL del clip no es un /clips/<nombre>.mp4 valido. */
export function archivoDeClip(clip, mercado = null) {
  // Clips de stories: un archivo por mercado en clip.archivos[mercado]; sin mercado (o sin ese archivo) vale clip.url (mercado principal).
  const propio = mercado && clip.archivos && typeof clip.archivos === 'object' && Object.hasOwn(clip.archivos, mercado) ? clip.archivos[mercado] : null;
  const url = String(propio ?? clip.url ?? '');
  if (!url.startsWith('/clips/')) return null;
  const nombre = path.basename(url);
  return NOMBRE_VIDEO.test(nombre) && url === '/clips/' + nombre ? nombre : null;
}

router.get('/canales', requireMasterKey, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    canales: IDS_CANALES.map((id) => {
      const c = CANALES[id];
      return {
        id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        estructuraLarga: c.estructuraLarga,
        destinos: [...c.destinos],
        mercados: [...c.mercados],
        plan: planDeRenders({ canal: id }).resumen,
      };
    }),
    destinos: Object.values(DESTINOS).map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, formato: d.formato })),
    mercados: Object.values(MERCADOS).map((m) => ({ id: m.id, nombre: m.nombre, rol: m.rol })),
  });
});

router.get('/clips/:id/paquete', requireMasterKey, (req, res, next) => {
  try {
    const clip = buscarClip(req.params.id);
    if (!ESTADOS_CON_VIDEO.has(clip.estado)) throw new ErrorHttp(409, 'El clip todavia no esta listo (estado: ' + String(clip.estado) + ').');
    const canal = normalizarCanal(req.query.canal);   // sin valor por defecto: nunca se adivina el canal
    const mercadosPedidos = listaDeConsulta(req.query.mercado);
    const destinosPedidos = listaDeConsulta(req.query.destino);
    const mercados = mercadosPedidos === undefined ? undefined : normalizarMercados(mercadosPedidos);
    const destinos = destinosPedidos === undefined ? undefined : normalizarDestinos(destinosPedidos, canal);
    const paquetes = generarPaquetes({ clip, canal, mercados, destinos });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, clipId: clip.id, canal, paquetes });
  } catch (error) {
    responderError(error, res, next);
  }
});

router.get('/clips/:id/descarga', requireMasterKey, async (req, res, next) => {
  try {
    const clip = buscarClip(req.params.id);
    const mercadoPedido = listaDeConsulta(req.query.mercado);
    const mercado = mercadoPedido === undefined ? null : normalizarMercado(mercadoPedido);
    const nombre = archivoDeClip(clip, mercado);
    if (!nombre) throw new ErrorHttp(404, 'El clip no tiene video para descargar (puede haberse borrado por el limite de almacenamiento).');
    const raiz = path.resolve(config.clipsDir);
    const ruta = path.resolve(raiz, nombre);
    if (path.dirname(ruta) !== raiz) throw new ErrorHttp(404, 'Video no encontrado');
    let info;
    try {
      info = await fs.stat(ruta);
    } catch {
      throw new ErrorHttp(404, 'Video no encontrado en disco');
    }
    if (!info.isFile()) throw new ErrorHttp(404, 'Video no encontrado en disco');
    // res.download transmite el archivo (sin cargarlo en RAM), admite Range y pone Content-Disposition: attachment.
    res.download(nombre, nombreDeDescarga(clip, mercado), { root: raiz, dotfiles: 'deny', cacheControl: false, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    responderError(error, res, next);
  }
});

export default router;
CLIPLAB_EOF_PARTE5
escribir "public/js/api.js" <<'CLIPLAB_EOF_PARTE5'
const CLAVE_STORAGE = 'cliplab.masterKey';
const TIMEOUT_MS = 8000;
const TIMEOUT_SUBIDA_MS = 15 * 60 * 1000;   // subir un video pesado tarda mucho mas que una consulta normal
const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF]/g;
const CABECERA_VALIDA = /^[\x20-\x7E]+$/;

function limpiarLlave(valor) {
  let limpio = String(valor || '').replace(INVISIBLES, '').trim();
  const comilla = limpio.charAt(0);
  if (limpio.length >= 2 && (comilla === '"' || comilla === "'") && limpio.endsWith(comilla)) {
    limpio = limpio.slice(1, -1).trim();
  }
  return limpio;
}

export function leerLlave() {
  try {
    return limpiarLlave(localStorage.getItem(CLAVE_STORAGE));
  } catch {
    return '';
  }
}

export function guardarLlave(valor) {
  try {
    const limpia = limpiarLlave(valor);
    if (limpia) {
      localStorage.setItem(CLAVE_STORAGE, limpia);
    } else {
      localStorage.removeItem(CLAVE_STORAGE);
    }
  } catch {
    // Navegador sin almacenamiento disponible: se ignora.
  }
}

export class ApiError extends Error {
  constructor(mensaje, status, cancelado = false) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.cancelado = cancelado;
    this.requiereLlave = status === 401;
  }
}

async function solicitar(ruta, opciones = {}) {
  const { metodo = 'GET', cuerpo, formulario, signal, timeoutMs = TIMEOUT_MS } = opciones;

  const cabeceras = { Accept: 'application/json' };
  const llave = leerLlave();
  if (llave) {
    if (!CABECERA_VALIDA.test(llave)) {
      throw new ApiError('La llave guardada tiene caracteres no validos (acentos o comillas curvas). Borrala y pega la correcta.', 401);
    }
    cabeceras['x-master-key'] = llave;
  }
  // Con FormData NO se fija Content-Type: el navegador lo pone con el boundary del multipart.
  if (cuerpo !== undefined && formulario === undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(temporizador);
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    signal.addEventListener('abort', () => controlador.abort(), { once: true });
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cabeceras,
      body: formulario !== undefined ? formulario : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
      cache: 'no-store',
    });
  } catch {
    if (signal && signal.aborted && !vencido) {
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    throw new ApiError(vencido ? 'El servidor no respondio a tiempo' : 'Sin conexion con el servidor', 0);
  } finally {
    clearTimeout(temporizador);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok || (datos && datos.success === false)) {
    throw new ApiError((datos && datos.error) || 'Error ' + respuesta.status, respuesta.status);
  }

  // Respuesta estandar { success, data, error }: el resto del panel sigue recibiendo { ok, ...campos }.
  if (datos && typeof datos === 'object' && 'success' in datos) {
    return { ok: true, ...(datos.data || {}) };
  }

  return datos;
}

let proveedorAjustes = null;

/** lote.js registra aqui una funcion que devuelve los ajustes a enviar con cada proyecto nuevo (o null). */
export function registrarAjustesNuevos(fn) {
  proveedorAjustes = typeof fn === 'function' ? fn : null;
}

export function obtenerEstado(signal) {
  return solicitar('/api/panel/estado', { signal });
}

/**
 * Encola un video. Con `archivo` (File) envia multipart/form-data con el campo "archivo" y los demas campos de texto
 * (sin url: el backend acepta enlace o archivo, nunca ambos). Sin archivo envia JSON como siempre.
 * opciones: modo, cantidad, instruccion, estiloSubtitulos (y inicio/duracion). Si "Aplicar tambien a clips nuevos" esta
 * activo (lote.js), se agregan los `ajustes` de lote.
 */
export function encolarVideo(url, opcionesBase = {}, archivo = null) {
  // "Aplicar tambien a clips nuevos" (lote.js): si hay ajustes activos se envian con cada proyecto nuevo.
  const ajustes = proveedorAjustes ? proveedorAjustes() : null;
  const opciones = ajustes && opcionesBase.ajustes === undefined ? { ...opcionesBase, ajustes } : opcionesBase;
  if (!archivo) {
    return solicitar('/api/panel/encolar', { metodo: 'POST', cuerpo: { url, ...opciones } });
  }
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(opciones)) {
    if (clave === 'ajustes' && valor && typeof valor === 'object') {
      formulario.append('ajustes', JSON.stringify(valor));   // multipart solo lleva texto: el backend lo lee como JSON
      continue;
    }
    if (valor !== undefined && valor !== null && valor !== '') formulario.append(clave, String(valor));
  }
  formulario.append('archivo', archivo, archivo.name);   // el archivo va al final: los campos de texto llegan antes
  return solicitar('/api/panel/encolar', { metodo: 'POST', formulario, timeoutMs: TIMEOUT_SUBIDA_MS });
}

export function obtenerIncidencia(id, signal) {
  return solicitar('/api/panel/incidencias/' + encodeURIComponent(id), { signal });
}

export function guardarCookiesRed(red, cookies) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'POST', cuerpo: { cookies } });
}

export function quitarCookiesRed(red) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'DELETE' });
}

/** Sube una foto/logo (png, jpg, webp). Devuelve { logo: { id, ancho, alto, conAlfa, fondoDetectado, fondoColor } }. */
export function subirLogo(archivo) {
  const formulario = new FormData();
  formulario.append('logo', archivo, archivo.name);
  return solicitar('/api/panel/logo', { metodo: 'POST', formulario, timeoutMs: 60000 });
}

/** Imagen del logo como URL local (blob): <img> no puede enviar la llave maestra, asi que se pide con fetch. */
export async function obtenerLogoUrl(id, sinFondo = false) {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  const respuesta = await fetch('/api/panel/logo/' + encodeURIComponent(id) + (sinFondo ? '?sinFondo=1' : ''), { headers: cabeceras, cache: 'no-store' });
  if (!respuesta.ok) throw new ApiError('No se pudo cargar el logo', respuesta.status);
  return URL.createObjectURL(await respuesta.blob());
}

/** "Aplicar a todos": re-renderiza los clips indicados con los ajustes (cada uno sale como clip nuevo). */
export function aplicarLote(ids, ajustes) {
  return solicitar('/api/panel/lote/aplicar', { metodo: 'POST', cuerpo: { ids, ajustes } });
}

/** Catalogo de solo lectura (canales, destinos, mercados y plan de renders) para el panel. */
export function obtenerCanales(signal) {
  return solicitar('/api/panel/canales', { signal });
}

/** Paquete de texto del clip. `canal` es obligatorio; `mercado` y `destino` (texto o lista separada por comas) son opcionales. */
export function obtenerPaquete(id, { canal, mercado, destino } = {}, signal) {
  const consulta = new URLSearchParams();
  if (canal) consulta.set('canal', canal);
  if (mercado) consulta.set('mercado', mercado);
  if (destino) consulta.set('destino', destino);
  return solicitar('/api/panel/clips/' + encodeURIComponent(id) + '/paquete?' + consulta.toString(), { signal });
}

function nombreDeContentDisposition(cabecera) {
  const m = /filename="?([^";]+)"?/i.exec(String(cabecera || ''));
  const limpio = m ? m[1].replace(/[^A-Za-z0-9._-]/g, '_') : '';
  return /\.mp4$/i.test(limpio) ? limpio : 'clip.mp4';
}

/**
 * Descarga el video del clip. Un enlace <a> no puede enviar la llave maestra, asi que se pide con fetch y se guarda
 * desde un blob (un clip pesa decenas de MB como maximo: cabe sin problema en la RAM del navegador).
 */
export async function descargarVideo(id, mercado = '') {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  let respuesta;
  try {
    respuesta = await fetch('/api/panel/clips/' + encodeURIComponent(id) + '/descarga' + (mercado ? '?mercado=' + encodeURIComponent(mercado) : ''), { headers: cabeceras, cache: 'no-store' });
  } catch {
    throw new ApiError('Sin conexion con el servidor', 0);
  }
  if (!respuesta.ok) {
    let mensaje = 'Error ' + respuesta.status;
    try { const datos = await respuesta.json(); if (datos && datos.error) mensaje = datos.error; } catch { /* sin cuerpo JSON */ }
    throw new ApiError(mensaje, respuesta.status);
  }
  const nombre = nombreDeContentDisposition(respuesta.headers.get('content-disposition'));
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { nombre };
}

// ---- Guiones (Parte 5): cola de fichas -> guion con Ollama -> video de stories con Piper + FFmpeg ----
export const obtenerEntornoGuiones = (signal) => solicitar('/api/panel/guiones/entorno', { signal });
export const listarGuiones = (signal) => solicitar('/api/panel/guiones', { signal });
export const estadoTrabajoGuion = (signal) => solicitar('/api/panel/guiones/estado', { signal });
export const encolarGuionFicha = (ficha, opciones = {}) => solicitar('/api/panel/guiones', { metodo: 'POST', cuerpo: { ficha, ...opciones } });
export const procesarGuion = () => solicitar('/api/panel/guiones/procesar', { metodo: 'POST', cuerpo: {} });
export const producirGuiones = (ids) => solicitar('/api/panel/guiones/producir', { metodo: 'POST', cuerpo: { ids } });
CLIPLAB_EOF_PARTE5
escribir "public/js/paquete.js" <<'CLIPLAB_EOF_PARTE5'
// Paquete de texto + descarga manual (modo local): botones Copiar y Descargar por destino y mercado.
// Se abre desde cualquier boton [data-accion="paquete"][data-id="<clip>"]. El canal lo elige la persona cada vez:
// el sistema nunca adivina de que canal es un video.
import { obtenerCanales, obtenerPaquete, descargarVideo, leerLlave } from './api.js';
import { el } from './ui.js';

let dialogo = null;
let catalogo = null;
const vista = { clipId: '', canal: '', mercado: '', paquetes: [], cargando: false };

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copiado = false;
    try { copiado = document.execCommand('copy'); } catch { copiado = false; }
    area.remove();
    return copiado;
  }
}

function aviso(texto, tipo = 'info') {
  const zona = dialogo.querySelector('[data-zona="estado"]');
  zona.textContent = texto;
  zona.dataset.tipo = tipo;
  zona.hidden = !texto;
}

function botonCopiar(etiqueta, obtenerTexto) {
  return el('button', {
    class: 'btn', type: 'button', text: etiqueta,
    onclick: async () => {
      const ok = await copiarTexto(obtenerTexto());
      aviso(ok ? 'Copiado: ' + etiqueta.replace(/^Copiar /, '') + '.' : 'No se pudo copiar el texto.', ok ? 'ok' : 'error');
    },
  });
}

function campo(titulo, texto) {
  return el('div', { class: 'copy' }, el('strong', { text: titulo }), el('p', { text: texto }));
}

function tarjetaPaquete(p) {
  const nombre = (catalogo.destinos.find((d) => d.id === p.destino) || {}).nombre || p.destino;
  const hijos = [el('h3', { text: nombre })];
  for (const a of p.avisos || []) hijos.push(el('p', { class: 'aviso-paquete', text: a }));
  hijos.push(campo('Título', p.titulo));
  if (p.variantes && p.variantes.length) {
    hijos.push(el('div', { class: 'copy' },
      el('strong', { text: 'Variantes de título y gancho' }),
      ...p.variantes.map((v) => el('div', { class: 'variante' },
        el('p', { text: v.titulo + (v.gancho ? '\n' + v.gancho : '') }),
        botonCopiar('Copiar variante ' + v.etiqueta, () => v.titulo)))));
  }
  hijos.push(campo('Texto para pegar', p.texto));
  hijos.push(el('div', { class: 'card-acciones' },
    botonCopiar('Copiar título', () => p.titulo),
    botonCopiar('Copiar texto', () => p.texto),
    botonCopiar('Copiar todo', () => p.titulo + '\n\n' + p.texto)));
  return el('article', { class: 'card paquete' }, ...hijos);
}

function pintar() {
  const zona = dialogo.querySelector('[data-zona="paquetes"]');
  zona.replaceChildren();
  if (!vista.canal) { zona.append(el('div', { class: 'vacio', text: 'Elige el canal para ver los textos.' })); return; }
  if (vista.cargando) { zona.append(el('div', { class: 'vacio', text: 'Preparando textos…' })); return; }
  const lista = vista.paquetes.filter((p) => p.mercado === vista.mercado);
  if (!lista.length) { zona.append(el('div', { class: 'vacio', text: 'No hay textos para este mercado.' })); return; }
  for (const p of lista) zona.append(tarjetaPaquete(p));
}

function pintarMercados() {
  const caja = dialogo.querySelector('[data-zona="mercados"]');
  caja.replaceChildren(...catalogo.mercados.map((m) => el('button', {
    class: 'btn', type: 'button', text: m.nombre, 'aria-pressed': String(m.id === vista.mercado),
    onclick: () => { vista.mercado = m.id; pintarMercados(); pintar(); },
  })));
}

async function cargarPaquetes() {
  if (!vista.canal) { vista.paquetes = []; pintar(); return; }
  vista.cargando = true;
  pintar();
  aviso('');
  try {
    const datos = await obtenerPaquete(vista.clipId, { canal: vista.canal });
    vista.paquetes = datos.paquetes || [];
  } catch (error) {
    vista.paquetes = [];
    aviso('No se pudieron preparar los textos: ' + error.message, 'error');
  } finally {
    vista.cargando = false;
    pintar();
  }
}

function crearDialogo() {
  const selector = el('select', { 'aria-label': 'Canal', 'data-zona': 'canal' });
  selector.addEventListener('change', () => { vista.canal = selector.value; cargarPaquetes(); });
  const descargar = el('button', {
    class: 'btn btn-primario', type: 'button', text: 'Descargar video',
    onclick: async () => {
      descargar.disabled = true;
      aviso('Descargando…');
      try {
        const { nombre } = await descargarVideo(vista.clipId, vista.mercado);
        aviso('Video descargado: ' + nombre, 'ok');
      } catch (error) {
        aviso('No se pudo descargar: ' + error.message, 'error');
      } finally {
        descargar.disabled = false;
      }
    },
  });
  const cerrar = el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => dialogo.close() });
  const d = el('dialog', { id: 'dlg-paquete', class: 'dlg-paquete' },
    el('h2', { text: 'Publicar a mano' }),
    el('p', { text: 'Descarga el video y copia los textos de cada destino. Nada se publica solo.' }),
    el('div', { class: 'toolbar' }, el('label', { text: 'Canal ' }, selector), el('div', { class: 'segmento', 'data-zona': 'mercados', role: 'group', 'aria-label': 'Mercado' })),
    el('div', { class: 'card-acciones' }, descargar),
    el('p', { class: 'suave', 'data-zona': 'estado', role: 'status', hidden: true }),
    el('div', { 'data-zona': 'paquetes' }),
    el('div', { class: 'dlg-acciones' }, cerrar));
  document.body.appendChild(d);
  return d;
}

async function abrir(clipId) {
  if (!dialogo) dialogo = crearDialogo();
  vista.clipId = clipId;
  vista.canal = '';
  vista.paquetes = [];
  const selector = dialogo.querySelector('[data-zona="canal"]');
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  try {
    if (!catalogo) catalogo = await obtenerCanales();
  } catch (error) {
    aviso(error.requiereLlave || !leerLlave() ? 'Falta la llave maestra: guárdala en el panel y vuelve a intentar.' : 'No se pudo cargar el catálogo: ' + error.message, 'error');
    return;
  }
  vista.mercado = (catalogo.mercados.find((m) => m.rol === 'principal') || catalogo.mercados[0]).id;
  selector.replaceChildren(el('option', { value: '', text: 'Elige el canal…' }), ...catalogo.canales.map((c) => el('option', { value: c.id, text: c.nombre })));
  selector.value = '';
  pintarMercados();
  pintar();
}

document.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-accion="paquete"]');
  if (!boton || !boton.dataset.id) return;
  ev.preventDefault();
  abrir(boton.dataset.id);
});
CLIPLAB_EOF_PARTE5
escribir "public/index.html" <<'CLIPLAB_EOF_PARTE5'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#0a0d14">
  <title>ClipLab Pro</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%236d7bff'/%3E%3Cpath d='M12 9l12 7-12 7z' fill='white'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/lote.css">
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="logo" aria-hidden="true">&#9654;</div>
        <div>
          <h1>ClipLab <span>Pro</span></h1>
          <p id="sync" class="sync" data-estado="pendiente" role="status">
            <span class="dot"></span><span id="sync-texto">Conectando...</span>
          </p>
        </div>
      </div>
      <div class="acciones">
        <button id="btn-refrescar" class="btn btn-icono" type="button" title="Actualizar ahora" aria-label="Actualizar ahora">&#10227;</button>
        <button id="btn-guiones" class="btn" type="button">&#9998; Guiones</button>
        <a class="btn" id="lnk-sesion" href="/sesion.html" style="text-decoration:none">&#127850; Sesion</a>
        <button id="btn-llave" class="btn" type="button">&#128273; Llave</button>
      </div>
    </header>

    <form id="form-encolar" class="crear" autocomplete="off">
      <div class="crear-fila">
        <input id="input-url" type="url" inputmode="url" placeholder="Pega el enlace del video (https://...)" required>
        <button id="btn-encolar" class="btn btn-primario" type="submit">Crear clips</button>
      </div>
      <div class="crear-opciones">
        <label class="campo">Formato
          <select id="sel-formato" disabled title="El motor siempre exporta en vertical"><option>9:16 vertical</option></select>
        </label>
        <label class="campo">Calidad
          <select id="sel-calidad" disabled title="Resolución fija del motor"><option>1080x1920</option></select>
        </label>
        <label class="campo">Encuadre
          <select id="sel-encuadre" title="Conversación: sigue a quien habla. Plano amplio: video completo sobre fondo desenfocado."></select>
        </label>
        <label class="campo">Clips
          <select id="sel-cantidad" title="Cuántos momentos extraer del video">
            <option value="auto">Automático (4-5)</option>
            <option value="1">1</option><option value="2">2</option><option value="3">3</option>
            <option value="4">4</option><option value="5">5</option>
          </select>
        </label>
        <label class="campo">Subtítulos
          <select id="sel-subtitulos" title="Dinámico: mayúsculas y resalte palabra por palabra. Clásico: blanco con contorno. Minimal: texto pequeño sobre caja translúcida."></select>
        </label>
      </div>
      <div class="crear-opciones">
        <label class="campo campo-ancho">O sube un archivo local (mp4, mov, mkv, webm)
          <input id="input-archivo" type="file" accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/x-matroska,video/webm">
        </label>
        <label class="campo campo-ancho">Qué buscar (opcional)
          <input id="input-instruccion" type="text" maxlength="300" placeholder="Ej.: los momentos donde hablan de precios">
        </label>
      </div>
      <p id="archivo-info" class="suave" hidden></p>
    </form>

    <p id="aviso" class="aviso" hidden role="status"></p>

    <nav class="tabs" role="tablist" aria-label="Secciones">
      <button class="tab" role="tab" type="button" data-vista="resumen">Resumen</button>
      <button class="tab" role="tab" type="button" data-vista="conexiones">Conexiones</button>
      <button class="tab" role="tab" type="button" data-vista="proyectos">Proyectos <span id="n-proyectos" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="clips">Todos los clips <span id="n-clips" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="lotes">Lotes / Variantes <span id="n-lotes" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="incidencias">Incidencias <span id="n-incidencias" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="marketing">Marketing y Analiticas</button>
      <button type="button" class="tab" data-vista="publicador" role="tab" aria-selected="false">Programar y Publicar</button>
    </nav>

    <main>
      <section id="vista-resumen" class="vista" data-vista="resumen" role="tabpanel">
        <div id="kpis" class="kpis"></div>
        <h2 class="titulo-seccion">Trabajos activos</h2>
        <div id="trabajos-activos" class="lista"></div>
        <h2 class="titulo-seccion">Clips listos</h2>
        <div id="clips-listos" class="grid"></div>
      </section>

      <section id="vista-conexiones" class="vista" data-vista="conexiones" role="tabpanel" hidden>
        <div id="lista-conexiones" class="grid"></div>
      </section>

      <section id="vista-proyectos" class="vista" data-vista="proyectos" role="tabpanel" hidden>
        <div id="proy-toolbar" class="toolbar">
          <input id="proy-buscar" type="search" placeholder="Buscar proyecto..." aria-label="Buscar proyectos">
          <span id="proy-contador" class="suave">0 proyectos</span>
        </div>
        <div id="lista-proyectos"></div>
      </section>

      <section id="vista-clips" class="vista" data-vista="clips" role="tabpanel" hidden>
        <div class="toolbar">
          <input id="clips-buscar" type="search" placeholder="Buscar por título o lo que se dice..." aria-label="Buscar clips">
          <div class="segmento" role="group" aria-label="Filtro">
            <button class="btn" type="button" data-filtro="todos" aria-pressed="true">Todos</button>
            <button class="btn" type="button" data-filtro="favoritos" aria-pressed="false">Me gustan <span id="clips-favs" class="contador">0</span></button>
          </div>
          <select id="clips-orden" aria-label="Ordenar">
            <option value="recientes">Más recientes</option>
            <option value="puntaje">Mejor puntaje</option>
          </select>
          <span id="clips-contador" class="suave">0 clips</span>
          <span id="clips-chip-proyecto" class="chip-filtro" hidden>Solo un proyecto <button type="button" data-accion="quitar-proyecto" aria-label="Quitar filtro de proyecto">&times;</button></span>
        </div>
        <div id="lista-flujo-clips"></div>
      </section>

      <section id="vista-lotes" class="vista" data-vista="lotes" role="tabpanel" hidden>
        <div id="lista-lotes" class="grid"></div>
      </section>

      <section id="vista-incidencias" class="vista" data-vista="incidencias" role="tabpanel" hidden>
        <div class="toolbar">
          <label class="check"><input id="inc-ocultar" type="checkbox"> Ocultar resueltas</label>
        </div>
        <div id="lista-incidencias" class="lista"></div>
      </section>

      <section id="vista-marketing" class="vista" data-vista="marketing" role="tabpanel" hidden>
        <div id="marketing"></div>
      </section>
      <section id="vista-publicador" class="vista" data-vista="publicador" role="tabpanel" hidden>
        <div id="panel-publicador-ui"></div>
      </section>
    </main>
  </div>

  <dialog id="dlg-llave">
    <form id="form-llave" autocomplete="off">
      <h2>Llave maestra</h2>
      <p>Se guarda solo en este navegador y se envia en la cabecera <code>x-master-key</code>.</p>
      <input id="input-llave" class="secreto" type="text" name="clave-maestra-cliplab" placeholder="MASTER_KEY" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <div class="dlg-acciones">
        <button id="llave-borrar" class="btn" type="button">Borrar</button>
        <button id="llave-cancelar" class="btn" type="button">Cancelar</button>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <dialog id="dlg-red">
    <form id="form-red" autocomplete="off">
      <h2 id="red-titulo">Pegar cookies</h2>
      <p id="red-pasos"></p>
      <textarea id="input-cookies" class="area-cookies" rows="8" spellcheck="false" autocomplete="off" placeholder='[ { "name": "sessionid", "value": "...", "domain": ".tiktok.com" } ]'></textarea>
      <p id="red-error" class="red-error" role="alert" hidden></p>
      <div class="dlg-acciones">
        <button id="red-cancelar" class="btn" type="button">Cancelar</button>
        <button id="red-guardar" class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <dialog id="dlg-editar">
    <form id="form-editar" autocomplete="off">
      <h2>Editar clip</h2>
      <p>Los cambios se guardan solo en este navegador; el video y la ficha del servidor no se modifican.</p>
      <label class="campo-bloque">Título <input id="ed-titulo" type="text" maxlength="120"></label>
      <label class="campo-bloque">Descripción para publicar <textarea id="ed-desc" class="area-cookies" rows="8"></textarea></label>
      <div class="dlg-acciones">
        <button id="ed-restaurar" class="btn" type="button">Restaurar original</button>
        <button id="ed-cancelar" class="btn" type="button">Cancelar</button>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <noscript><p class="aviso">ClipLab Pro necesita JavaScript para funcionar.</p></noscript>
  <script type="module" src="/js/panel.js"></script>
  <script type="module" src="/js/lote.js"></script>
  <script type="module" src="/js/paquete.js"></script>
  <script type="module" src="/js/guiones.js"></script>
</body>
</html>
CLIPLAB_EOF_PARTE5
escribir "public/css/styles.css" <<'CLIPLAB_EOF_PARTE5'
:root {
  color-scheme: dark;
  --bg: #0a0d14;
  --panel: #0f1420;
  --panel-2: #141b2b;
  --borde: #1f2940;
  --texto: #e6eaf5;
  --suave: #8b97b4;
  --acento: #6d7bff;
  --acento-2: #8a5cff;
  --ok: #3ecf8e;
  --warn: #f5b84b;
  --err: #ff6b6b;
  --info: #5ab0ff;
  --radio: 12px;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--texto);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.app { max-width: 1176px; margin: 0 auto; padding: 16px; }

code {
  background: var(--panel-2);
  border: 1px solid var(--borde);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
}

/* Cabecera */
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.logo {
  width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--acento), var(--acento-2)); color: #fff; font-size: 14px; flex: none;
}
h1 { margin: 0; font-size: 18px; line-height: 1.2; }
h1 span { color: var(--acento); }
h2 { margin: 0; }
.acciones { display: flex; gap: 8px; flex: none; }

.sync { margin: 2px 0 0; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--suave); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--suave); flex: none; }
.sync[data-estado="ok"] .dot { background: var(--ok); }
.sync[data-estado="error"] .dot { background: var(--err); }
.sync[data-estado="pendiente"] .dot { background: var(--warn); }

/* Botones e inputs */
.btn {
  background: var(--panel-2); color: var(--texto); border: 1px solid var(--borde); border-radius: 10px;
  padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
.btn:hover { border-color: var(--acento); }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn-primario { background: linear-gradient(135deg, var(--acento), var(--acento-2)); border-color: transparent; color: #fff; }
.btn-icono { padding: 7px 11px; font-size: 16px; line-height: 1; }
.btn.con-llave { border-color: var(--ok); }

input[type="text"], input[type="url"], input[type="search"], input[type="password"], select {
  background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 10px;
  padding: 10px 12px; font: inherit; width: 100%; min-width: 0;
}
input:focus, select:focus, .btn:focus-visible, .tab:focus-visible { outline: 2px solid var(--acento); outline-offset: 1px; }
select { width: auto; }

.encolar { display: flex; gap: 10px; margin-bottom: 10px; }
.encolar .btn { padding: 10px 18px; }

.aviso {
  margin: 0 0 12px; padding: 9px 12px; border-radius: 10px; font-size: 13px;
  background: var(--panel-2); border: 1px solid var(--borde); color: var(--texto);
}
.aviso[data-tipo="ok"] { border-color: var(--ok); }
.aviso[data-tipo="error"] { border-color: var(--err); }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--borde); margin-bottom: 14px; overflow-x: auto; scrollbar-width: thin; }
.tab {
  background: none; border: 0; border-bottom: 2px solid transparent; color: var(--suave);
  padding: 10px 12px; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.tab:hover { color: var(--texto); }
.tab[aria-selected="true"] { color: var(--texto); border-bottom-color: var(--acento); }
.contador {
  display: inline-block; min-width: 20px; padding: 0 6px; margin-left: 4px; border-radius: 999px;
  background: var(--panel-2); border: 1px solid var(--borde); font-size: 11px; text-align: center; color: var(--suave);
}

/* Layout de contenido */
.titulo-seccion { font-size: 14px; color: var(--suave); text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 10px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
.check { display: flex; align-items: center; gap: 8px; color: var(--suave); cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.lista { display: flex; flex-direction: column; gap: 8px; }
.vacio {
  grid-column: 1 / -1; padding: 28px 16px; text-align: center; color: var(--suave);
  background: var(--panel); border: 1px dashed var(--borde); border-radius: var(--radio);
}

/* KPIs */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px; display: flex; flex-direction: column; gap: 2px; }
.kpi-valor { font-size: 26px; font-weight: 700; }
.kpi-titulo { color: var(--suave); font-size: 12px; }
.kpi-ok .kpi-valor { color: var(--ok); }
.kpi-info .kpi-valor { color: var(--info); }
.kpi-acento .kpi-valor { color: var(--acento); }
.kpi-err .kpi-valor { color: var(--err); }

/* Tarjetas */
.card { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.card h3 { margin: 0; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
.meta { color: var(--suave); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.fuente { color: var(--suave); font-size: 12px; overflow-wrap: anywhere; }
.copy { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 8px 10px; }
.copy strong { display: block; font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .05em; }
.copy p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.card-acciones { display: flex; gap: 8px; flex-wrap: wrap; }

.fila { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.fila-cab { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.fila-titulo { font-weight: 600; overflow-wrap: anywhere; }
.fila.nivel-error { border-left: 3px solid var(--err); }
.fila.nivel-warn { border-left: 3px solid var(--warn); }
.fila.nivel-info { border-left: 3px solid var(--info); }
.fila.resuelta { opacity: .6; }

/* Badges y progreso */
.badge { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--borde); white-space: nowrap; flex: none; }
.badge-ok { color: var(--ok); border-color: rgba(62, 207, 142, .45); background: rgba(62, 207, 142, .08); }
.badge-warn { color: var(--warn); border-color: rgba(245, 184, 75, .45); background: rgba(245, 184, 75, .08); }
.badge-err { color: var(--err); border-color: rgba(255, 107, 107, .45); background: rgba(255, 107, 107, .08); }
.badge-info { color: var(--info); border-color: rgba(90, 176, 255, .45); background: rgba(90, 176, 255, .08); }
.badge-neutro { color: var(--suave); }

.progreso { height: 6px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.progreso > span { display: block; height: 100%; background: linear-gradient(90deg, var(--acento), var(--acento-2)); transition: width .4s ease; }

/* Marketing */
.barra-fila { display: grid; grid-template-columns: 110px 1fr 40px; align-items: center; gap: 10px; margin-bottom: 8px; }
.barra { height: 10px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.barra > span { display: block; height: 100%; background: var(--acento); }
.barra-num { text-align: right; color: var(--suave); }

/* Dialogo de llave */
dialog { background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 14px; padding: 18px; width: min(92vw, 420px); }
dialog::backdrop { background: rgba(0, 0, 0, .65); }
dialog h2 { font-size: 16px; margin-bottom: 6px; }
dialog p { color: var(--suave); margin: 0 0 12px; }
.dlg-acciones { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

@media (max-width: 640px) {
  .app { padding: 12px; }
  .encolar { flex-direction: column; }
  .toolbar { flex-direction: column; align-items: stretch; }
  select { width: 100%; }
  .grid { grid-template-columns: 1fr; }
  .barra-fila { grid-template-columns: 80px 1fr 32px; }
}

.secreto { -webkit-text-security: disc; }

.area-cookies { width: 100%; box-sizing: border-box; background: var(--fondo, #0b0d12); color: var(--texto); border: 1px solid var(--borde); border-radius: 8px; padding: 10px; font: 12px/1.4 ui-monospace, monospace; resize: vertical; }
.red-error { color: var(--err); margin: 8px 0 0; }

/* ---------- Paleta con mas contraste y color (sobrescribe las variables de arriba) ---------- */
:root {
  --bg: #070a12;
  --panel: #121a2c;
  --panel-2: #1a253d;
  --borde: #2c3b5c;
  --texto: #f2f5fc;
  --suave: #aab6d3;
  --acento: #7c6bff;
  --acento-2: #c45cff;
  --ok: #35e3a3;
  --warn: #ffc65c;
  --err: #ff6b82;
  --info: #4cc3ff;
}
body { background: radial-gradient(1200px 500px at 50% -120px, rgba(124, 107, 255, .16), transparent 70%), var(--bg); }
.card, .fila, .kpi, .mini { box-shadow: 0 1px 0 rgba(255, 255, 255, .03) inset, 0 6px 18px rgba(0, 0, 0, .25); }
.card:hover { border-color: #3d4f78; }
.btn-primario { background: linear-gradient(135deg, var(--acento), var(--acento-2)); border-color: transparent; color: #fff; }
.btn-primario:hover { filter: brightness(1.1); }
.tab[aria-selected="true"] { border-bottom-color: var(--acento-2); }
.contador { background: rgba(124, 107, 255, .22); color: #dcd6ff; }
.badge-ok { background: rgba(53, 227, 163, .14); border-color: rgba(53, 227, 163, .6); }
.badge-warn { background: rgba(255, 198, 92, .14); border-color: rgba(255, 198, 92, .6); }
.badge-err { background: rgba(255, 107, 130, .14); border-color: rgba(255, 107, 130, .6); }
.badge-info { background: rgba(76, 195, 255, .14); border-color: rgba(76, 195, 255, .6); }
.badge-neutro { color: #cdd5ea; border-color: #43557d; background: rgba(255, 255, 255, .05); }
.kpi-valor { font-size: 28px; }

/* ---------- Flujo: crear, Proyectos, Todos los clips ---------- */
.suave { color: var(--suave); }
.crear { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.crear-fila { display: flex; gap: 10px; }
.crear-fila .btn { padding: 10px 18px; white-space: nowrap; }
.crear-opciones { display: flex; flex-wrap: wrap; gap: 10px; }
.campo { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .04em; min-width: 140px; }
.campo select, .campo input { text-transform: none; letter-spacing: 0; font-size: 13px; }
.campo select:disabled, .campo input:disabled { opacity: .55; cursor: not-allowed; }
.campo-ancho { flex: 1 1 260px; }
.campo-bloque { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; color: var(--suave); font-size: 12px; }
.instruccion-proyecto { margin: 6px 0 0; font-size: 12px; color: var(--suave); }
.instruccion-proyecto b { color: var(--texto); font-weight: 600; }
.badge-instruccion { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

.toolbar .segmento { display: flex; gap: 0; }
.segmento .btn { border-radius: 0; }
.segmento .btn:first-child { border-radius: 8px 0 0 8px; }
.segmento .btn:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
.segmento .btn[aria-pressed="true"] { background: var(--acento); border-color: var(--acento); color: #fff; }
.chip-filtro { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--borde); border-radius: 999px; color: var(--suave); font-size: 12px; }
.chip-filtro button { background: none; border: 0; color: var(--texto); cursor: pointer; font-size: 15px; line-height: 1; }
.toolbar { flex-wrap: wrap; }
.toolbar input[type="search"] { flex: 1 1 220px; }

.proyecto .miniatura { aspect-ratio: 16 / 9; background: var(--panel-2); border-radius: 10px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mini-video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.sin-video { color: var(--suave); font-size: 12px; padding: 12px; text-align: center; }
.detalle-cab { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
.detalle-cab > div { flex: 1 1 240px; min-width: 0; }
.detalle-cab h2 { margin: 0 0 4px; font-size: 18px; overflow-wrap: anywhere; }
.fila-clips { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; scroll-snap-type: x proximity; }
.mini { flex: 0 0 200px; scroll-snap-align: start; background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.mini-estado { align-items: center; justify-content: center; min-height: 200px; color: var(--suave); }
.mini-cab { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; font-size: 12px; }
.mini-cab strong { overflow-wrap: anywhere; }
.mini-gancho { margin: 0; font-size: 12px; color: var(--texto); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.visor { position: relative; background: #000; border-radius: 10px; overflow: hidden; }
.visor .v916 { display: block; width: 100%; aspect-ratio: 9 / 16; object-fit: contain; background: #000; }
.visor .sin-video { aspect-ratio: 9 / 16; display: flex; align-items: center; justify-content: center; }
.visor .dur { position: absolute; right: 8px; top: 8px; background: rgba(0, 0, 0, .65); border-radius: 6px; padding: 1px 7px; font-size: 11px; pointer-events: none; }
.visor-mini .v916 { max-height: 300px; }
.chips-bloques { display: flex; flex-wrap: wrap; gap: 4px; }
.chip-bloque { font-size: 10px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--borde); color: var(--suave); }
.chip-bloque b { color: var(--texto); }
.chip-bloque.nivel-alto, .bloque.nivel-alto .barra span { border-color: rgba(62, 207, 142, .5); }
.chip-bloque.nivel-medio { border-color: rgba(90, 176, 255, .5); }
.chip-bloque.nivel-bajo { border-color: rgba(245, 184, 75, .5); }

.grid-clips { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.clip-der { display: flex; align-items: center; gap: 6px; flex: none; }
.fav { background: none; border: 1px solid var(--borde); border-radius: 8px; color: var(--warn); font-size: 18px; line-height: 1; padding: 2px 8px; cursor: pointer; }
.fav[aria-pressed="true"] { background: rgba(245, 184, 75, .12); border-color: rgba(245, 184, 75, .5); }
.bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bloque { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 8px; min-width: 0; }
.bloque-cab { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.bloque .barra { height: 6px; }
.bloque.nivel-alto .barra span { background: var(--ok); }
.bloque.nivel-medio .barra span { background: var(--info); }
.bloque.nivel-bajo .barra span { background: var(--warn); }
.bloque p { margin: 6px 0 0; font-size: 11px; color: var(--suave); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.revision { border: 1px solid var(--borde); border-radius: 10px; padding: 8px 10px; }
.revision summary { cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.revision dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 8px 0 0; font-size: 12px; }
.revision dt { color: var(--suave); }
.revision dd { margin: 0; }
.alertas { margin: 8px 0 0; padding-left: 18px; color: var(--warn); font-size: 12px; }
.panel-extra { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.panel-extra strong { font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .05em; }
.panel-extra pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 240px; overflow-y: auto; }
.card-acciones a.btn { text-decoration: none; }

@media (max-width: 640px) {
  .crear-fila { flex-direction: column; }
  .campo { min-width: calc(50% - 5px); flex: 1 1 calc(50% - 5px); }
  .bloques { grid-template-columns: 1fr; }
}

/* Publicar a mano: paquete de texto y descarga (Parte 3) */
dialog.dlg-paquete { width: min(94vw, 720px); max-height: 86vh; overflow-y: auto; }
.dlg-paquete .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
.dlg-paquete .paquete { margin-top: 10px; }
.dlg-paquete .paquete h3 { margin: 0 0 6px; }
.dlg-paquete .aviso-paquete { color: var(--atencion, #f5b942); margin: 4px 0; }
.dlg-paquete .variante { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; margin-top: 6px; }
.dlg-paquete [data-tipo="error"] { color: var(--error, #ff6b6b); }
.dlg-paquete [data-tipo="ok"] { color: var(--ok, #4ade80); }

/* Guiones y produccion de stories (Parte 5) */
dialog.dlg-guiones { width: min(96vw, 760px); max-height: 90vh; overflow-y: auto; }
.dlg-guiones h3 { margin: 14px 0 6px; font-size: 14px; }
.dlg-guiones .estado { margin: 6px 0; padding: 6px 8px; border: 1px solid var(--borde); border-radius: 8px; }
.dlg-guiones [data-tipo="error"] { color: var(--error, #ff6b6b); }
.dlg-guiones [data-tipo="ok"] { color: var(--ok, #3ecf8e); }
.dlg-guiones .estado-entorno { color: var(--suave); font-size: 13px; margin-bottom: 8px; }
.dlg-guiones .form-ficha { display: grid; gap: 8px; margin: 10px 0; }
.dlg-guiones .fila-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.dlg-guiones .campo { display: grid; gap: 4px; font-size: 12px; color: var(--suave); }
.dlg-guiones input:not([type="checkbox"]), .dlg-guiones select, .dlg-guiones textarea { background: var(--panel-2); color: var(--texto); border: 1px solid var(--borde); border-radius: 8px; padding: 6px 8px; font: inherit; }
.dlg-guiones .check { font-size: 13px; color: var(--texto); }
.dlg-guiones .guion-lista { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 6px; }
.dlg-guiones .guion-fila { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border: 1px solid var(--borde); border-radius: 8px; }
.dlg-guiones .lista-problemas { margin: 4px 0 0 16px; padding: 0; color: var(--warn); font-size: 12px; }
.dlg-guiones .suave { color: var(--suave); font-size: 12px; margin: 2px 0; }
.dlg-guiones .toolbar { display: flex; gap: 10px; margin-top: 12px; }
CLIPLAB_EOF_PARTE5
escribir "package.json" <<'CLIPLAB_EOF_PARTE5'
{
  "name": "cliplab-pro",
  "version": "0.3.0",
  "description": "Backend modular y ultraligero de ClipLab Pro: clipping de videos de YouTube con FFmpeg, subtitulos dinamicos y publicacion automatizada.",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/sesion.test.js tests/envelope.test.js tests/render.test.js tests/segmentos.test.js tests/marketing.test.js tests/multiclip.test.js tests/editorial.test.js tests/sujeto.test.js tests/trayectoria.test.js tests/split-histeresis.test.js tests/interlocutor.test.js tests/cookies-redes.test.js tests/curador.test.js tests/curador-pipeline.test.js tests/proyectos.test.js tests/instruccion.test.js tests/estilos-subtitulos.test.js tests/upload.test.js tests/encolar-controles.test.js tests/archivo-instruccion-estilo.test.js tests/rotacion.test.js tests/rotacion-flujo.test.js tests/upload-respaldo.test.js tests/programador.test.js tests/publicador.test.js tests/plataformas.test.js tests/programador-plataformas.test.js tests/ajustes.test.js tests/lote-ajustes.test.js tests/download-escalera.test.js tests/transcribe-sin-whisper.test.js tests/transcribe-whisper-fallos.test.js tests/paso2-publicador.test.js tests/modo-local.test.js tests/modo-completo.test.js tests/mercados.test.js tests/canales.test.js tests/plan-renders.test.js tests/paquete-texto.test.js tests/paquete-rutas.test.js tests/canal-config.test.js tests/exclusion.test.js tests/ollama.test.js tests/validador-ficha.test.js tests/guionista.test.js tests/guiones-cola.test.js tests/voz.test.js tests/banco-medios.test.js tests/stories-plan.test.js tests/stories-render.test.js tests/stories-produccion.test.js tests/guiones-rutas.test.js tests/guiones-panel.test.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "mongodb": "^6.22.0",
    "multer": "^2.5.0",
    "playwright-core": "1.65.1",
    "redis": "^6.3.1"
  }
}
CLIPLAB_EOF_PARTE5
escribir ".env.example" <<'CLIPLAB_EOF_PARTE5'
NODE_ENV=development
PORT=8080
LOG_LEVEL=info
CORS_ORIGIN=*
MASTER_KEY=cambia-esta-llave
TMP_DIR=/tmp/cliplab

FFMPEG_PATH=ffmpeg
YTDLP_PATH=yt-dlp
YTDLP_COOKIES=
WHISPER_PATH=whisper-cli
WHISPER_MODEL=/opt/whisper/modelo.bin
WHISPER_LANG=auto

FONTS_DIR=
SUBTITLE_FONT=Anton

CPU_THREADS=2
VIDEO_CRF=24
VIDEO_PRESET=veryfast
MAX_VIDEO_SECONDS=10800
MAX_CLIP_SECONDS=90

FFPROBE_PATH=ffprobe
LOGO_ENABLED=true
LOGO_PATH=
LOGO_POSITION=top-right
LOGO_WIDTH=216
LOGO_MARGIN=56
LOGO_OPACITY=0.95

# Extraccion multiple (4-5 clips de 30-60 s por video) y anti-duplicados
# DATA_DIR guarda historial-cortes.json. En Railway usa un volumen (RAILWAY_VOLUME_MOUNT_PATH) para que sobreviva a los deploys.
DATA_DIR=
# SEGMENT_MIN_SECONDS=30
# SEGMENT_MAX_SECONDS=60
SEGMENTS_MIN=4
SEGMENTS_MAX=5

# Publicador ("Programar y Publicar")
# MongoDB (cola de publicaciones). Con el plugin de MongoDB de Railway basta con referenciar MONGO_URL en este servicio:
#   MONGO_URL=${{MongoDB.MONGO_URL}}      (tambien se aceptan MONGODB_URI, MONGO_PUBLIC_URL o MONGOHOST/MONGOUSER/MONGOPASSWORD)
# Sin URI o si Mongo falla, la cola se guarda en DATA_DIR/programador.json (con volumen persiste entre deploys).
MONGODB_URI=
MONGODB_DB=cliplab
MONGO_REINTENTO_MS=300000
# Chromium para publicar (la imagen ya lo instala en /ms-playwright; no hace falta tocarlo)
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# PUBLICADOR_MODO=seco   -> recorre el flujo sin publicar de verdad (pruebas)

# Modo de operacion. local = estacion de produccion en la laptop: SIN publicador automatico (ni programador ni Chromium);
# el panel oculta "Programar y Publicar" y las rutas /api/programador y /api/clips/:id/(programar|publicar-ahora) responden 404.
# Vacio o "completo" = comportamiento de siempre.
CLIPLAB_MODE=

# Canal de ESTA instancia: stories | sports | news. Con un canal valido, el ritmo editorial (BEAT_SECONDS, PUNCH_ZOOM, HOT_CUT_GAP,
# SEGMENT_MIN_SECONDS, SEGMENT_MAX_SECONDS) sale de CANALES[canal].ritmo (src/canales.js).
# Precedencia por campo: variable de entorno EXPLICITA > ritmo del canal > valor de siempre. Si defines BEAT_SECONDS=4 (u otra de
# esas cinco) en tu .env, esa gana sobre el canal: dejalas vacias o comentadas para usar el ritmo del canal.
# Vacio = comportamiento de siempre. Un valor desconocido se ignora y se avisa al arrancar (nunca se adivina). Se ve en GET /api/modo.
CLIPLAB_CANAL=

# Ollama (guionista local, Parte 4). Un solo modelo a la vez; nunca corre a la vez que FFmpeg (candado en src/engine/exclusion.js).
# Cada peticion lleva keep_alive:0, asi el modelo se descarga de RAM al terminar. Crear el guionista (opcional):
#   ollama create guionista -f config/Modelfile.guionista        y luego OLLAMA_MODEL=guionista
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_NUM_CTX=8192
OLLAMA_NUM_PREDICT=1536
# En CPU un 7B va a unos 3-6 tokens/s: 10 minutos de margen por peticion.
OLLAMA_TIMEOUT_MS=600000

# Voz en off con Piper (Parte 5; 100 % offline, sin edge-tts ni gTTS). PIPER_PATH = ruta COMPLETA al binario: junto a el deben quedar sus
# librerias y la carpeta espeak-ng-data (descomprime el release de github.com/rhasspy/piper: piper_linux_x86_64 / piper_windows_amd64).
# Las voces son archivos .onnx + .onnx.json (rhasspy/piper-voices): copia una en-US y una es en PIPER_VOICES_DIR (se elige sola la de mas
# calidad: high > medium > low) o fija cual usar con PIPER_VOICE_EN_US / PIPER_VOICE_ES_US (nombre dentro de la carpeta, o ruta).
PIPER_PATH=
PIPER_VOICES_DIR=
PIPER_VOICE_EN_US=
PIPER_VOICE_ES_US=
# 1 = velocidad normal; mayor = mas lenta (0.5 a 2). Verificado: factor de tiempo real ~0.12 en un solo nucleo y ~165 MB de RAM.
PIPER_LENGTH_SCALE=1
PIPER_TIMEOUT_MS=120000

# Banco de medios del canal stories (opcional; por defecto assets/banco). Subcarpetas: efectos/<categoria>, musica/<categoria>,
# medios/fondos (fondos de escena) y medios/fotos (fotos de la ficha). Sin archivos, los fondos son colores generados.
BANCO_DIR=
# Una serie en dos mercados genera (partes + 1 largo) x 2 videos: MAX_CLIPS_STORED debe ser mayor que ese numero, o los mas viejos se borran.
CLIPLAB_EOF_PARTE5
escribir "tests/validador-ficha.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHA, FICHA_NEWS, NARRACION_EN, NARRACION_ES, guionBueno, parte } from './fixtures/ficha-ejemplo.mjs';
import { ErrorFicha, normalizarFicha, validarFicha, validarGuion, corpusDeFicha } from '../src/validador-ficha.js';
import { ErrorCanal } from '../src/canales.js';

const codigos = (r) => r.detalle.filter((d) => d.nivel === 'problema').map((d) => d.codigo);
const con = (cambios) => ({ ...FICHA, ...cambios });
const guionCon = (...partes) => ({ partes });

// ------------------------------------------------------------------------------------------------ ficha
test('ficha valida: se normaliza (canal y mercado en minusculas/formato canonico, hechos limpios)', () => {
  const r = validarFicha({ ...FICHA, canal: ' Stories ', mercado: 'en_us', hechos: [{ tipo: 'LUGAR', valor: ' Lisbon ' }, { tipo: 'cifra', valor: 12 }] });
  assert.equal(r.ok, true, r.problemas.join('|'));
  assert.equal(r.ficha.canal, 'stories');
  assert.equal(r.ficha.mercado, 'en-US');
  assert.deepEqual(r.ficha.hechos, [{ tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'cifra', valor: '12' }]);
});

test('ficha invalida: sin titulo, canal, mercado o hechos', () => {
  assert.equal(validarFicha(null).ok, false);
  assert.equal(validarFicha([]).ok, false);
  const r = validarFicha({ hechos: [] });
  assert.equal(r.ok, false);
  assert.ok(r.problemas.length >= 4, r.problemas.join('|'));
});

test('ficha: no se adivina el canal ni el mercado', () => {
  assert.equal(validarFicha(con({ canal: '' })).ok, false);
  assert.equal(validarFicha(con({ canal: 'cocina' })).ok, false);
  assert.equal(validarFicha(con({ mercado: '' })).ok, false);
  assert.equal(validarFicha(con({ mercado: 'fr-FR' })).ok, false);
});

test('ficha: tipos de hecho, valores vacios y limites', () => {
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'rumor', valor: 'x' }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'dato', valor: '   ' }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: [{ tipo: 'dato', valor: 'x'.repeat(301) }] })).ok, false);
  assert.equal(validarFicha(con({ hechos: Array.from({ length: 41 }, () => ({ tipo: 'dato', valor: 'x' })) })).ok, false);
  assert.equal(validarFicha(con({ partes: 13 })).ok, false);
  assert.equal(validarFicha(con({ partes: 'dos' })).ok, false);
  assert.equal(validarFicha(con({ proyecto: '../etc/passwd' })).ok, false);
});

test('ficha news: exige lugar y fecha (stories solo avisa)', () => {
  assert.equal(validarFicha(FICHA_NEWS).ok, true);
  const sinFecha = validarFicha({ ...FICHA_NEWS, hechos: FICHA_NEWS.hechos.filter((h) => h.tipo !== 'fecha') });
  assert.equal(sinFecha.ok, false);
  assert.match(sinFecha.problemas.join('|'), /fecha/);
  const sinLugar = validarFicha({ ...FICHA_NEWS, hechos: FICHA_NEWS.hechos.filter((h) => h.tipo !== 'lugar') });
  assert.equal(sinLugar.ok, false);
  assert.match(sinLugar.problemas.join('|'), /lugar/);
  const stories = validarFicha(con({ hechos: [{ tipo: 'persona', valor: 'Marco Silva' }] }));
  assert.equal(stories.ok, true);
  assert.equal(stories.avisos.length, 2);
});

test('normalizarFicha lanza ErrorFicha (400, hereda de ErrorCanal) con la lista de problemas', () => {
  assert.throws(() => normalizarFicha({}), (e) => e instanceof ErrorFicha && e instanceof ErrorCanal && e.status === 400 && e.problemas.length > 0);
  assert.equal(normalizarFicha(FICHA).canal, 'stories');
});

// ------------------------------------------------------------------------------------------------ guion bueno
test('un guion correcto pasa sin problemas', () => {
  const r = validarGuion(guionBueno(), FICHA);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.ok, true);
});

test('el guion tambien pasa en es-US cuando esta en espanol, y la ficha es la misma', () => {
  const g = guionCon(parte(1, { narracion: NARRACION_ES }), parte(2, { narracion: NARRACION_ES }));
  const r = validarGuion(g, con({ mercado: 'es-US' }));
  assert.deepEqual(r.problemas, []);
});

// ------------------------------------------------------------------------------------------------ estructura
test('estructura: salidas que no son { partes: [...] }', () => {
  for (const mala of [null, 'texto', [], {}, { partes: [] }, { partes: 'x' }]) {
    const r = validarGuion(mala, FICHA);
    assert.equal(r.ok, false, JSON.stringify(mala));
    assert.ok(codigos(r).includes('estructura'));
  }
});

test('estructura: falta narracion, escenas, textoPantalla o duracion', () => {
  const p = parte(1);
  assert.ok(codigos(validarGuion(guionCon({ ...p, narracion: '' }, parte(2)), FICHA)).includes('estructura'));
  assert.ok(codigos(validarGuion(guionCon({ ...p, tecnico: [] }, parte(2)), FICHA)).includes('estructura'));
  const sinPantalla = parte(1); delete sinPantalla.tecnico[0].textoPantalla;
  assert.ok(codigos(validarGuion(guionCon(sinPantalla, parte(2)), FICHA)).includes('estructura'));
  const sinDur = parte(1); sinDur.tecnico[0].duracionSeg = 'tres';
  assert.ok(codigos(validarGuion(guionCon(sinDur, parte(2)), FICHA)).includes('estructura'));
});

test('estructura: cantidad de partes distinta de la que pide la ficha', () => {
  const r = validarGuion(guionCon(parte(1)), FICHA);   // la ficha pide 2
  assert.ok(codigos(r).includes('estructura'));
  assert.match(r.problemas.join('|'), /2 partes/);
});

// ------------------------------------------------------------------------------------------------ Parte N
test('Parte N: debe ser consecutiva', () => {
  const r = validarGuion(guionCon(parte(1), parte(3)), FICHA);
  assert.ok(codigos(r).includes('parte'));
  assert.match(r.problemas.join('|'), /consecutiva/);
  assert.ok(codigos(validarGuion(guionCon(parte(2), parte(1)), FICHA)).includes('parte'));
  assert.ok(codigos(validarGuion(guionCon({ ...parte(1), n: '1' }, parte(2)), FICHA)).includes('parte'));
});

test('Parte N: desdeParte permite continuar una serie (3 y 4)', () => {
  assert.deepEqual(validarGuion(guionCon(parte(3), parte(4)), FICHA, { desdeParte: 3 }).problemas, []);
  assert.ok(codigos(validarGuion(guionCon(parte(1), parte(2)), FICHA, { desdeParte: 3 })).includes('parte'));
});

test('Parte N: no puede mencionar otra parte dentro de la narracion', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Stay tuned for Part 2 of the story.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('parte'));
  assert.deepEqual(validarGuion(guionCon(parte(1), parte(2, { narracion: NARRACION_EN + ' This is Part 2 of the story.' })), FICHA).problemas, []);
});

// ------------------------------------------------------------------------------------------------ hechos inventados
test('hechos: un ano o cifra que no esta en la ficha se rechaza (y los de la ficha se aceptan, con separadores)', () => {
  const mal = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN.replace('1998', '2005') }), parte(2)), FICHA);
  assert.ok(codigos(mal).includes('hecho_inventado'));
  assert.match(mal.problemas.join('|'), /2005/);
  const mal2 = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN.replace('12 goals', '15 goals') }), parte(2)), FICHA);
  assert.match(mal2.problemas.join('|'), /15/);
  const miles = { ...FICHA, hechos: [...FICHA.hechos, { tipo: 'cifra', valor: '1,200 fans' }] };
  const bien = guionCon(parte(1, { narracion: NARRACION_EN + ' About 1.200 fans came.' }), parte(2));
  assert.deepEqual(validarGuion(bien, miles).problemas, []);
});

test('hechos: un mes que no esta en la ficha se rechaza (ingles y espanol)', () => {
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It all changed in April.' }), parte(2)), FICHA);
  assert.match(en.problemas.join('|'), /april/i);
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo cambio en abril.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(es.problemas.join('|'), /abril/);
  assert.deepEqual(validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It began in March.' }), parte(2)), FICHA).problemas, []);
});

test('hechos: un nombre propio o lugar que no esta en la ficha se rechaza (no al inicio de frase)', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Later he moved to Barcelona with Ronaldo.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('hecho_inventado'));
  assert.match(r.problemas.join('|'), /Barcelona/);
  assert.match(r.problemas.join('|'), /Ronaldo/);
});

test('hechos: los nombres que si estan en la ficha pasan (con acentos distintos)', () => {
  const ficha = con({ hechos: [{ tipo: 'persona', valor: 'José Álvarez' }, { tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'fecha', valor: '1998' }] });
  const g = guionCon(parte(1, { narracion: 'In 1998 the story of Jose Alvarez began in Lisbon, and it is a story that the whole city still tells.' }), parte(2, { narracion: 'In 1998 the story of Jose Alvarez began in Lisbon, and it is a story that the whole city still tells.' }));
  assert.deepEqual(validarGuion(g, ficha).problemas, []);
});

test('hechos: tambien se revisa la descripcion de escena y el texto en pantalla', () => {
  const p = parte(1);
  p.tecnico[0].escena = 'Archive photo of the 1987 final in Madrid';
  p.tecnico[1].textoPantalla = 'Scored 99 goals';
  const r = validarGuion(guionCon(p, parte(2)), FICHA);
  const t = r.problemas.join('|');
  assert.match(t, /1987/);
  assert.match(t, /Madrid/);
  assert.match(t, /99/);
});

test('hechos: texto de pantalla en MAYUSCULAS o Title Case no genera falsos nombres propios', () => {
  const p = parte(1, { textoPantalla: 'THE TRUTH ABOUT HIS CAREER' });
  p.tecnico[1].textoPantalla = 'The Truth About His Career';
  assert.deepEqual(validarGuion(guionCon(p, parte(2)), FICHA).problemas, []);
});

test('hechos: una cifra escrita con palabras solo da aviso', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Nearly a million people watched.' }), parte(2)), FICHA);
  assert.equal(r.ok, true);
  assert.ok(r.detalle.some((d) => d.codigo === 'cifra_en_palabras'));
});

// ------------------------------------------------------------------------------------------------ dialogos y citas
test('dialogos y citas: una cita entrecomillada que no esta en la ficha se rechaza', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' "You will never play again, kid," the coach told him.' }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('cita'));
});

test('dialogos y citas: verbo de habla + comillas es una cita atribuida (ingles y espanol)', () => {
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' The coach said: "Run."' }), parte(2)), FICHA);
  assert.match(en.problemas.join('|'), /atribuida/);
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' El entrenador respondió: “Corre”.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(es.problemas.join('|'), /atribuida/);
});

test('dialogos y citas: lineas con raya y etiquetas de personaje se rechazan; "Narrator:" se permite', () => {
  const raya = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + '\n— Come here, kid, said nobody.' }), parte(2)), FICHA);
  assert.ok(codigos(raya).includes('dialogo'));
  const etiqueta = validarGuion(guionCon(parte(1, { narracion: 'Coach: Run faster now.\n' + NARRACION_EN }), parte(2)), FICHA);
  assert.ok(codigos(etiqueta).includes('dialogo'));
  const narrador = validarGuion(guionCon(parte(1, { narracion: 'Narrator: ' + NARRACION_EN }), parte(2)), FICHA);
  assert.ok(!codigos(narrador).includes('dialogo'));
});

test('dialogos y citas: una cita que SI viene de la ficha se acepta', () => {
  const ficha = con({ hechos: [...FICHA.hechos, { tipo: 'dato', valor: 'He wrote "I never stopped believing in the dream" in his diary' }] });
  const g = guionCon(parte(1, { narracion: NARRACION_EN + ' His diary read "I never stopped believing in the dream".' }), parte(2));
  assert.ok(!codigos(validarGuion(g, ficha)).includes('cita'));
});

// ------------------------------------------------------------------------------------------------ idioma
test('idioma: narracion en espanol para un mercado en-US se rechaza (y al reves)', () => {
  const r = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('idioma'));
  const r2 = validarGuion(guionCon(parte(1), parte(2)), con({ mercado: 'es-US' }));
  assert.ok(codigos(r2).includes('idioma'));
});

test('idioma: con poca evidencia no se rechaza', () => {
  const g = guionCon(parte(1, { narracion: 'Marco Silva. Lisbon.' }), parte(2, { narracion: 'Marco Silva. Lisbon.' }));
  assert.ok(!codigos(validarGuion(g, FICHA)).includes('idioma'));
});

// ------------------------------------------------------------------------------------------------ ritmo
test('ritmo: una escena mas larga que el ritmo del canal se rechaza (stories 4.6 s -> maximo 6.9 s)', () => {
  const r = validarGuion(guionCon(parte(1, { escenas: 5, duracion: 10 }), parte(2)), FICHA);
  assert.ok(codigos(r).includes('ritmo'));
  assert.deepEqual(validarGuion(guionCon(parte(1, { escenas: 8, duracion: 6.9 }), parte(2)), FICHA).problemas, []);
});

test('ritmo: el mismo guion se juzga con el ritmo de SU canal (sports es mas rapido)', () => {
  const ficha = con({ canal: 'sports' });
  const r = validarGuion(guionCon(parte(1, { escenas: 8, duracion: 6 }), parte(2)), ficha);   // sports: escena max 3.6 s, parte max 45 s
  assert.ok(codigos(r).includes('ritmo'));
  const bien = validarGuion(guionCon(parte(1, { escenas: 10, duracion: 3 }), parte(2, { escenas: 10, duracion: 3 })), ficha);
  assert.deepEqual(bien.problemas, []);
});

test('ritmo: la parte entera no puede pasar del maximo del canal; si es mas corta que el minimo solo avisa', () => {
  const larga = validarGuion(guionCon(parte(1, { escenas: 14, duracion: 6 }), parte(2)), FICHA);   // 84 s > 75
  assert.ok(codigos(larga).includes('ritmo'));
  const corta = validarGuion(guionCon(parte(1, { escenas: 4, duracion: 6 }), parte(2)), FICHA);    // 24 s < 45
  assert.equal(corta.ok, true);
  assert.ok(corta.avisos.some((a) => /minimo/.test(a)));
});

test('ritmo: una narracion que no cabe en el tiempo (mas de 3.4 palabras por segundo) se rechaza', () => {
  const larga = Array.from({ length: 70 }, () => 'the Lisbon story of Marco Silva').join(' ');   // 350 palabras en 48 s
  const r = validarGuion(guionCon(parte(1, { narracion: larga }), parte(2)), FICHA);
  assert.match(r.problemas.join('|'), /no cabe/);
});

test('ritmo: se puede forzar otro ritmo por opciones', () => {
  const r = validarGuion(guionBueno(), FICHA, { ritmo: { beatSeconds: 2, segmentMaxSeconds: 100 } });
  assert.ok(codigos(r).includes('ritmo'));
});

// ------------------------------------------------------------------------------------------------ news
test('news: el guion debe decir el lugar y la fecha de la ficha', () => {
  const buena = 'On May 4, 2024 the river rose above the alert level in Porto Alegre, and the authorities asked families to move away from the valley.';
  const ok = validarGuion(guionCon(parte(1, { narracion: buena, escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.deepEqual(ok.problemas, []);
  const sinLugar = validarGuion(guionCon(parte(1, { narracion: 'On May 4, 2024 the river rose above the alert level, and the authorities asked families to move away from the valley.', escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.ok(codigos(sinLugar).includes('rigor'));
  assert.match(sinLugar.problemas.join('|'), /lugar/);
  const sinFecha = validarGuion(guionCon(parte(1, { narracion: 'The river rose above the alert level in Porto Alegre, and the authorities asked families to move away from the valley.', escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'FLOOD WARNING' })), FICHA_NEWS);
  assert.match(sinFecha.problemas.join('|'), /fecha/);
});

test('guion con ficha invalida: devuelve el problema de la ficha, no revienta', () => {
  const r = validarGuion(guionBueno(), { titulo: 'x' });
  assert.equal(r.ok, false);
  assert.ok(codigos(r).includes('ficha'));
});

test('corpusDeFicha junta titulo, hechos y fuente', () => {
  const c = corpusDeFicha({ ...FICHA, fuente: 'Archivo municipal' });
  for (const t of ['Rise of Marco Silva', 'Lisbon, Portugal', 'March 3, 1998', '12 goals', 'Archivo municipal']) assert.ok(c.includes(t), t);
});

test('limite de problemas: nunca mas de 12 (para no inflar el prompt de correccion)', () => {
  const p = parte(1, { narracion: Array.from({ length: 30 }, (_, i) => 'in ' + (3000 + i) + ' the story').join(' ') });
  const r = validarGuion(guionCon(p, parte(2)), FICHA);
  assert.ok(r.problemas.length <= 12);
  assert.equal(r.ok, false);
});

// ------------------------------------------------------------------------------------------------ Parte 5: meses equivalentes y foto
test('meses: un mes de la ficha en ingles vale en espanol y al reves (la ficha es la misma para los dos mercados)', () => {
  const es = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo empezo en marzo.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.ok(!es.problemas.join('|').includes('marzo'), es.problemas.join('|'));
  const mal = validarGuion(guionCon(parte(1, { narracion: NARRACION_ES + ' Todo cambio en abril.' }), parte(2, { narracion: NARRACION_ES })), con({ mercado: 'es-US' }));
  assert.match(mal.problemas.join('|'), /abril/);
  const fichaEs = con({ mercado: 'es-US', hechos: [{ tipo: 'fecha', valor: '3 de marzo de 1998' }, { tipo: 'lugar', valor: 'Lisbon' }, { tipo: 'persona', valor: 'Marco Silva' }] });
  const en = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It began in March.' }), parte(2)), { ...fichaEs, mercado: 'en-US' });
  assert.ok(!en.problemas.join('|').includes('march'), en.problemas.join('|'));
});

test('meses: "may" en minuscula es el verbo, no el mes; "May" con mayuscula si cuenta', () => {
  const verbo = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' Some say he may return.' }), parte(2)), FICHA);
  assert.ok(!verbo.problemas.join('|').includes('"may"'));
  const mes = validarGuion(guionCon(parte(1, { narracion: NARRACION_EN + ' It ended in May.' }), parte(2)), FICHA);
  assert.match(mes.problemas.join('|'), /"may"/);
});

test('news: la fecha de la ficha en ingles se acepta dicha en espanol (mes o ano)', () => {
  const ficha = { ...FICHA_NEWS, mercado: 'es-US' };
  const narracion = 'El 4 de mayo de 2024 el rio subio por encima del nivel de alerta en Porto Alegre, y las autoridades pidieron a las familias que salieran del valle.';
  const g = guionCon(parte(1, { narracion, escenas: 8, duracion: 5, escena: 'Aerial view of the river', textoPantalla: 'ALERTA' }));
  assert.ok(!codigos(validarGuion(g, ficha)).includes('rigor'), validarGuion(g, ficha).problemas.join('|'));
});

test('foto: nombre de imagen valido se conserva; rutas o formatos raros se rechazan', () => {
  assert.equal(validarFicha(con({ foto: ' marco.JPG ' })).ficha.foto, 'marco.JPG');
  assert.equal(validarFicha(con({})).ficha.foto, '');
  for (const f of ['../marco.jpg', 'a/b.png', 'marco.gif', 'marco', '.oculta.jpg', 'x.exe']) assert.equal(validarFicha(con({ foto: f })).ok, false, f);
});
CLIPLAB_EOF_PARTE5
escribir "tests/paquete-rutas.test.js" <<'CLIPLAB_EOF_PARTE5'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-paquete-rutas-'));
process.env.CLIPLAB_MODE = 'local';
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.CLIPS_DIR = path.join(raiz, 'clips');
process.env.MASTER_KEY = 'llave-de-prueba';
process.env.LOG_LEVEL = 'error';

const { config } = await import('../src/config/index.js');
const { createApp } = await import('../src/app.js');
const { store } = await import('../src/storage/store.js');
const { nombreDeDescarga, archivoDeClip } = await import('../src/routes/paquete.js');

await fs.mkdir(config.clipsDir, { recursive: true });
const VIDEO = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'.repeat(50));   // 1800 bytes
await fs.writeFile(path.join(config.clipsDir, 'abc123.mp4'), VIDEO);
await fs.writeFile(path.join(raiz, 'secreto.mp4'), 'TOP-SECRET');   // fuera de clipsDir: nunca debe salir
await fs.writeFile(path.join(raiz, 'secreto.txt'), 'TOP-SECRET');

const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
const AUTH = { 'x-master-key': 'llave-de-prueba' };
test.after(() => servidor.close());

function clipListo(campos = {}) {
  const c = store.encolar('https://www.youtube.com/watch?v=aaaaaaaaaaa', {});
  return store.completar(c.id, {
    titulo: 'The rise of a small-town boxer',
    url: '/clips/abc123.mp4',
    duracion: 48,
    transcripcion: 'He was born in a small town. Nobody believed he could win. He trained every morning before school.',
    marketing: { titulo: 'He was told he would never win' },
    ...campos,
  });
}

async function pedir(ruta, cabeceras = AUTH) {
  const r = await fetch(base + ruta, { headers: cabeceras });
  return r;
}
async function json(ruta, cabeceras = AUTH) {
  const r = await pedir(ruta, cabeceras);
  return { status: r.status, cuerpo: await r.json() };
}

const listo = clipListo();

test('las tres rutas exigen la llave maestra', async () => {
  for (const ruta of ['/api/panel/canales', '/api/panel/clips/' + listo.id + '/paquete?canal=stories', '/api/panel/clips/' + listo.id + '/descarga']) {
    const sin = await json(ruta, {});
    assert.equal(sin.status, 401, ruta);
    assert.equal(sin.cuerpo.success, false);
    const mala = await json(ruta, { 'x-master-key': 'otra' });
    assert.equal(mala.status, 401, ruta);
  }
});

test('cada ruta lleva su propia llave maestra (router montado solo, sin otras capas que la protejan)', async () => {
  const { default: express } = await import('express');
  const { default: paqueteRouter } = await import('../src/routes/paquete.js');
  const solo = express();
  solo.use('/api/panel', paqueteRouter);
  const srv = solo.listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  try {
    const url = 'http://127.0.0.1:' + srv.address().port;
    for (const ruta of ['/api/panel/canales', '/api/panel/clips/' + listo.id + '/paquete?canal=stories', '/api/panel/clips/' + listo.id + '/descarga']) {
      assert.equal((await fetch(url + ruta)).status, 401, 'sin llave: ' + ruta);
      assert.equal((await fetch(url + ruta, { headers: AUTH })).status, 200, 'con llave: ' + ruta);
    }
  } finally {
    srv.close();
  }
});

test('/api/panel/canales: catalogo de solo lectura con el plan de renders', async () => {
  const { status, cuerpo } = await json('/api/panel/canales');
  assert.equal(status, 200);
  assert.equal(cuerpo.success, true);
  assert.deepEqual(cuerpo.data.canales.map((c) => c.id), ['stories', 'sports', 'news']);
  assert.deepEqual(cuerpo.data.mercados.map((m) => m.id), ['en-US', 'es-US']);
  assert.deepEqual(cuerpo.data.destinos.map((d) => d.id), ['facebook_reels', 'instagram_reels', 'youtube_shorts', 'youtube_long']);
  const stories = cuerpo.data.canales.find((c) => c.id === 'stories');
  assert.equal(stories.plan.rendersNecesarios, 2, 'stories completo: 2 renders, no 8');
  assert.equal(stories.plan.concatenaciones, 2);
  assert.equal(stories.estructuraLarga, 'serie');
  const r = await fetch(base + '/api/panel/canales', { method: 'POST', headers: AUTH });
  assert.equal(r.status, 404, 'solo lectura: sin POST');
});

test('paquete: sin canal o con canal invalido es 400 (el canal nunca se adivina)', async () => {
  const sin = await json('/api/panel/clips/' + listo.id + '/paquete');
  assert.equal(sin.status, 400);
  assert.match(sin.cuerpo.error, /canal/i);
  const mal = await json('/api/panel/clips/' + listo.id + '/paquete?canal=cocina');
  assert.equal(mal.status, 400);
  assert.match(mal.cuerpo.error, /stories, sports, news/);
});

test('paquete: todos los mercados y destinos del canal por defecto (8 paquetes)', async () => {
  const { status, cuerpo } = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories');
  assert.equal(status, 200);
  assert.equal(cuerpo.data.clipId, listo.id);
  assert.equal(cuerpo.data.canal, 'stories');
  assert.equal(cuerpo.data.paquetes.length, 8);
  assert.equal(cuerpo.data.paquetes[0].mercado, 'en-US');
  const largo = cuerpo.data.paquetes.find((p) => p.destino === 'youtube_long' && p.mercado === 'en-US');
  assert.equal(largo.variantes.length, 3);
});

test('paquete: filtra por mercado y destino (texto, lista con comas y repeticiones)', async () => {
  const uno = await json('/api/panel/clips/' + listo.id + '/paquete?canal=sports&mercado=es-US&destino=youtube_shorts');
  assert.equal(uno.status, 200);
  assert.equal(uno.cuerpo.data.paquetes.length, 1);
  assert.equal(uno.cuerpo.data.paquetes[0].mercado, 'es-US');
  assert.equal(uno.cuerpo.data.paquetes[0].destino, 'youtube_shorts');
  const coma = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=EN_us&destino=facebook_reels,instagram_reels');
  assert.equal(coma.cuerpo.data.paquetes.length, 2);
  const rep = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=en-US&destino=facebook_reels&destino=youtube_long');
  assert.equal(rep.cuerpo.data.paquetes.length, 2);
  const vacio = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=&destino=');
  assert.equal(vacio.cuerpo.data.paquetes.length, 8, 'vacio = no indicado = todos');
});

test('paquete: mercado o destino invalidos son 400', async () => {
  const m = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories&mercado=fr-FR');
  assert.equal(m.status, 400);
  assert.match(m.cuerpo.error, /en-US, es-US/);
  const d = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories&destino=tiktok');
  assert.equal(d.status, 400);
  assert.match(d.cuerpo.error, /facebook_reels/);
});

test('paquete: 404 si el clip no existe y 409 si aun se procesa', async () => {
  const no = await json('/api/panel/clips/no-existe/paquete?canal=stories');
  assert.equal(no.status, 404);
  const proceso = store.encolar('https://www.youtube.com/watch?v=bbbbbbbbbbb', {});
  const aun = await json('/api/panel/clips/' + proceso.id + '/paquete?canal=stories');
  assert.equal(aun.status, 409);
  assert.match(aun.cuerpo.error, /no esta listo/);
});

test('descarga: attachment con nombre seguro, bytes completos y sin cache', async () => {
  const r = await pedir('/api/panel/clips/' + listo.id + '/descarga');
  assert.equal(r.status, 200);
  const cd = r.headers.get('content-disposition');
  assert.match(cd, /^attachment;/);
  assert.match(cd, /filename="the-rise-of-a-small-town-boxer\.mp4"/);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(VIDEO));
});

test('descarga: admite Range (el navegador puede reanudar)', async () => {
  const r = await pedir('/api/panel/clips/' + listo.id + '/descarga', { ...AUTH, Range: 'bytes=10-19' });
  assert.equal(r.status, 206);
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), VIDEO.subarray(10, 20).toString());
});

test('descarga: 404 sin video (url nula, archivo borrado o clip inexistente)', async () => {
  const sinUrl = store.encolar('https://www.youtube.com/watch?v=ccccccccccc', {});
  assert.equal((await json('/api/panel/clips/' + sinUrl.id + '/descarga')).status, 404);
  const borrado = clipListo({ url: '/clips/ya-no-esta.mp4' });
  const r = await json('/api/panel/clips/' + borrado.id + '/descarga');
  assert.equal(r.status, 404);
  assert.match(r.cuerpo.error, /no encontrado/i);
  assert.equal((await json('/api/panel/clips/no-existe/descarga')).status, 404);
});

test('descarga: un clip con url manipulada NUNCA saca archivos de fuera de clipsDir', async () => {
  const urls = [
    '/clips/../secreto.mp4',
    '/clips/..%2Fsecreto.mp4',
    '/clips/%2e%2e/secreto.mp4',
    '/clips/..\\secreto.mp4',
    '/clips/sub/../../secreto.mp4',
    '../secreto.mp4',
    '/etc/passwd',
    '/clips/secreto.txt',
    '/clips/abc123.mp4/../../secreto.mp4',
    '/clips/.oculto.mp4',
    '/clips//abc123.mp4',
  ];
  for (const url of urls) {
    const c = clipListo({ url });
    const r = await pedir('/api/panel/clips/' + c.id + '/descarga');
    const cuerpo = await r.text();
    assert.equal(r.status, 404, 'url ' + url + ' deberia dar 404, dio ' + r.status);
    assert.ok(!cuerpo.includes('TOP-SECRET'), 'filtro contenido de fuera con la url ' + url);
  }
});

test('descarga: el id de la ruta no se usa para armar rutas de disco', async () => {
  for (const id of ['..%2Fsecreto', '%2e%2e%2fsecreto.mp4', 'abc123.mp4']) {
    const r = await pedir('/api/panel/clips/' + id + '/descarga');
    assert.equal(r.status, 404, id);
    assert.ok(!(await r.text()).includes('TOP-SECRET'));
  }
});

test('nombreDeDescarga y archivoDeClip (unitarias)', () => {
  assert.equal(nombreDeDescarga({ id: 'clip_1', titulo: 'Él cayó… ¡y volvió! ñandú' }), 'el-cayo-y-volvio-nandu.mp4');
  assert.equal(nombreDeDescarga({ id: 'clip_9', titulo: 'https://youtu.be/xyz' }), 'clip_9.mp4', 'si el titulo es una URL se usa el id');
  assert.equal(nombreDeDescarga({ id: '../x', titulo: '' }), 'x.mp4');
  assert.equal(nombreDeDescarga({ id: 'c', titulo: '"; rm -rf /' }), 'rm-rf.mp4');
  assert.ok(nombreDeDescarga({ id: 'c', titulo: 'a'.repeat(300) }).length <= 64);
  assert.equal(archivoDeClip({ url: '/clips/abc123.mp4' }), 'abc123.mp4');
  for (const url of [null, '', '/clips/', '/clips/a.mov', '/clips/../a.mp4', 'clips/a.mp4', 'https://x.com/clips/a.mp4', '/clips/a b.mp4', '/clips/.a.mp4', '/clips/a/b.mp4']) {
    assert.equal(archivoDeClip({ url }), null, String(url));
  }
});

test('el panel carga paquete.js y ofrece los botones (modo local y HTML servido)', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /<html data-modo="local"/);
  assert.match(html, /src="\/js\/paquete\.js"/);
  const js = await fetch(base + '/js/paquete.js');
  assert.equal(js.status, 200);
  const flujo = await fs.readFile(new URL('../public/js/flujo.js', import.meta.url), 'utf8');
  const vistas = await fs.readFile(new URL('../public/js/views.js', import.meta.url), 'utf8');
  assert.match(flujo, /data-accion="paquete"/);
  assert.match(vistas, /data-accion="paquete"/);
});

test('paquete.js solo importa lo que api.js y ui.js exportan, y trae Copiar con respaldo y Descargar', async () => {
  const paquete = await fs.readFile(new URL('../public/js/paquete.js', import.meta.url), 'utf8');
  const api = await fs.readFile(new URL('../public/js/api.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  for (const [, nombres, origen] of paquete.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)) {
    const fuente = origen === 'api' ? api : ui;
    for (const nombre of nombres.split(',').map((n) => n.trim())) {
      assert.match(fuente, new RegExp('export (?:async )?function ' + nombre + '\\b'), origen + '.js no exporta ' + nombre);
    }
  }
  assert.match(paquete, /navigator\.clipboard\.writeText/);
  assert.match(paquete, /execCommand\('copy'\)/);
  assert.match(paquete, /descargarVideo/);
  assert.match(api, /\/descarga/);
  assert.match(api, /x-master-key/);
});

test('archivoDeClip(clip, mercado): usa clip.archivos[mercado] si existe; si no, clip.url; nunca una ruta fuera de /clips/', () => {
  const clip = { url: '/clips/en.mp4', archivos: { 'en-US': '/clips/en.mp4', 'es-US': '/clips/es.mp4', 'fr-FR': '/clips/../x.mp4' } };
  assert.equal(archivoDeClip(clip), 'en.mp4');
  assert.equal(archivoDeClip(clip, 'es-US'), 'es.mp4');
  assert.equal(archivoDeClip(clip, 'de-DE'), 'en.mp4');
  assert.equal(archivoDeClip(clip, 'fr-FR'), null);
  assert.equal(archivoDeClip({ url: '/clips/a.mp4' }, 'es-US'), 'a.mp4');
  assert.equal(archivoDeClip({ url: '/clips/a.mp4', archivos: { 'es-US': 'http://evil/x.mp4' } }, 'es-US'), null);
});

test('nombreDeDescarga(clip, mercado): el archivo de otro mercado lleva su sufijo', () => {
  const clip = { id: 'clip_1', titulo: 'The Rise', archivos: { 'es-US': '/clips/es.mp4' } };
  assert.equal(nombreDeDescarga(clip), 'the-rise.mp4');
  assert.equal(nombreDeDescarga(clip, 'es-US'), 'the-rise-es-us.mp4');
  assert.equal(nombreDeDescarga(clip, 'en-US'), 'the-rise.mp4');
});
CLIPLAB_EOF_PARTE5
escribir "ESTADO_CLIPLAB_PRO.md" <<'CLIPLAB_EOF_PARTE5'
# ESTADO_CLIPLAB_PRO.md — Relevo para la siguiente instancia de Claude

Repo: `cliplab-backend` (Node 22, ESM, Express + FFmpeg). Base: commit `d64f983` de github.com/mxldigitalservices-oss/cliplab-backend + Partes 1, 2, 3, 4 y 5 aplicadas (sin commit; vienen en `cliplab-backend-parte5.zip`, o en el zip de la Parte 3 + `aplicar-parte4.sh` + `aplicar-parte5.sh`).
Idioma de trabajo con el usuario: español informal (usa voz a texto; interpretar abreviaturas).
**Si eres la siguiente instancia: lee SOLO este archivo y `.cliplab-handoff.json`; no vuelvas a estudiar los 3 repos.** Arranca directo en la **Parte 6** (las decisiones de la sección 11 ya están cerradas: no las vuelvas a preguntar).

## 1. Objetivo del proyecto
ClipLab Pro como **estación local de producción de video** (`CLIPLAB_MODE=local`) para una laptop de 16 GB de RAM e Intel UHD Graphics 620, con respaldo seguro a CPU `libx264` (hilos limitados). **Sin publicador automático**: el sistema prepara videos, cortes, compilados y paquetes de texto para que el usuario los **descargue y copie manualmente**. Sin APIs costosas ni generación de video pesada.
Tres canales aislados (`stories`, `sports`, `news`), mercado principal inglés `en-US` y subcanal `es-US`. Destinos: `facebook_reels` (adultos 27+, nichos prioritarios + 2 ranuras reservadas), `instagram_reels` (espejo del mismo render 9:16), `youtube_shorts` (embudo), `youtube_long` (concatena las partes en orden; estructura serie/lista; variantes de título/gancho).

## 2. Reglas del usuario (estrictas)
- **NO tocar**: `src/engine/pipeline.js`, `src/upload.js`, `src/engine/rotacion*.js` (la extracción múltiple vive en `pipeline.js`; `logos.js` está en `src/logos.js`). Verificado: cero cambios en esos archivos.
- **Ollama (instruct 7–8B) y FFmpeg nunca en paralelo**: la cola los serializa.
- Todo lo tomado de `ContentBotMXL-2` y `ollama-core-engine` se **porta a Node, sin Python**, en módulos nuevos.
- Descartado (no portar): publicador automático (programador, publicador, chromium, redis-programador, routes/programador, publicador-ui, playwright-core, Chromium del Dockerfile), moviepy, psycopg2/Postgres, gemini_client, youtube_client/OAuth, scripts de música infantil, .mp4/PNG de prueba, autogit, gitops, apikeys/, server.py, Caddyfile, .zip, .patch.
- Entrega: **archivos completos** (sin `...`), comandos de una línea (`cat`/heredoc o `bash script`; **nunca `nano`**; pegar directo falla en su Chromebook/Crostini), pruebas con `node --test`, **una parte validada antes de la siguiente**, relevo actualizado al cierre.
- Patrón de entrega que funcionó: un `aplicar-parteN.sh` autocontenido (heredocs con delimitador entrecomillado), con copia de respaldo y repetible; verificarlo en un clon limpio de GitHub + partes previas, y probar las pruebas con **mutaciones** (romper algo a propósito y ver que fallan).

## 3. Parte 1 — HECHA y probada: `CLIPLAB_MODE=local`
- `src/config/index.js`: `config.modo` (`'local'|'completo'`), `modoLocal`, `modoPedido`, `modoValido`. Se normaliza (`local`, `LOCAL`, ` Local ` → local). Vacío/`completo`/`full`/`cloud`/`nube` → completo. Valor desconocido (p. ej. `locla`) → completo + aviso al arrancar (NO activa local).
- `src/routes/index.js`: en modo local **no se importa** `routes/programador.js` (import dinámico con top-level await; tampoco se evalúan programador, publicador, chromium, redis-programador ni playwright: probado con un hook de módulos). `/api/programador/*`, `/api/clips/:id/programar` y `/api/clips/:id/publicar-ahora` responden **404** con y sin llave (`error` menciona `CLIPLAB_MODE=local`). Nuevo `GET /api/modo` (público): `{modo, local, publicador}`; `GET /api` incluye `modo`. En modo completo todo sigue como antes (401 sin llave).
- `src/app.js`: exporta `htmlModoLocal(html)`; en modo local `/` y `/index.html` se sirven sin la pestaña ni la sección "Programar y Publicar" y con `<html data-modo="local">` (en el servidor: sin parpadeo; `panel.js` no monta el publicador porque falta `#panel-publicador-ui`). Una prueba avisa si cambia el HTML y las marcas dejan de existir.
- `src/server.js`: aviso de modo local / de valor desconocido; campo `modo` en el log de arranque.
- Se mantienen en modo local: `cookies-redes` y `sincronizarCookiesRedes` (solo reflejan tarjetas de conexión), `sesion/` (YouTube), `/api/panel/*`.
- **Pendiente de limpieza (Parte 7, con permiso del usuario)**: el `Dockerfile` aún instala Chromium (`playwright-core install`, `check-chromium.mjs`), `playwright-core` sigue en `package.json`, y los módulos del publicador siguen en el repo (solo no se cargan).

## 4. Parte 2 — HECHA y probada: canales, mercados, destinos, plan de renders
- `src/mercados.js` (puro): `MERCADOS` (`en-US` principal, `es-US` sub que deriva de en-US; campos `idioma, region, locale, whisperLang, rol, derivaDe`), `normalizarMercado(s)` (acepta `en-us`, `EN_US`; vacío/desconocido → `ErrorMercado` 400, sin valor por defecto), `CAPAS_POR_IDIOMA = [voz, subtitulos, titulo_pantalla, ficha]`, `esPrincipal`, `mercadoDe`.
- `src/canales.js` (puro, catálogo congelado): `CANALES` (stories/sports/news: `tono, trabajo{modo,estiloSubtitulos,ajustes}, ritmo, franja|ficha, estructuraLarga, rigor, nichos, destinos, mercados`), `DESTINOS` (facebook_reels audiencia 27+ y 2 ranuras; instagram_reels `espejoDe: facebook_reels` con el mismo `render: 'vertical_9x16'`; youtube_shorts embudo; youtube_long `render: 'largo_concat'`, `dependeDe: 'vertical_9x16'`, `variantesTitulo: 3`), `normalizarCanal`, `perfilDeCanal`, `destinosDeCanal`, `normalizarDestinos(valor, canal?)`, `trabajoDeCanal(canal, extras)` (campos que `/api/panel/encolar` YA acepta: `modo`, `estiloSubtitulos`, `ajustes`; devuelve copia editable; lo manual pisa al canal), `variablesDeEntorno(canal)`, `validarNichosReservados(destino, lista)`, `validarCatalogo()`.
- `src/plan-renders.js` (puro): `planDeRenders({canal, mercados, destinos, capasDeIdioma=true})`. Instagram/Shorts comparten el archivo de Facebook por mercado; `youtube_long` es concatenación (no render) y fuerza el render base aunque nadie más lo use. stories completo: **2 renders (no 8) + 2 concatenaciones**. Con `capasDeIdioma:false`, 1 render para ambos mercados.
- Valores de ritmo/franja/modo/estilo: **valores iniciales míos, editables** (sports beat 2.4 s / news 4.0 / stories 4.6; no son reglas de plataformas). Los nichos salen del texto del usuario.
- **Límite conocido**: el ritmo editorial (`BEAT_SECONDS`, `PUNCH_ZOOM`, `HOT_CUT_GAP`, `SEGMENT_MIN/MAX_SECONDS`) vive en `config` (env al arrancar), NO por trabajo; el pipeline solo acepta por trabajo `modo`, `estiloSubtitulos`, `ajustes`, `cantidad`, `instruccion`. Hoy se aplica arrancando una instancia con `variablesDeEntorno(canal)`. **Aprobado por el usuario:** variable `CLIPLAB_CANAL` leída en `config/index.js` (archivo permitido) que arranca cada instancia con el ritmo de su canal; se implementa al inicio de la Parte 4 (ver sección 9).
- **`es-US` NO comparte render con `en-US`** si el clip lleva voz, subtítulos, título en pantalla o ficha (van quemados). El ahorro real es 8→2.
- **Voz (TTS): DECIDIDA = Piper local (100 % offline)**; no se usan edge-tts ni gTTS (nube). Enganche listo: `MERCADOS[...].locale` (`en-US`/`es-US`) y `whisperLang`. Nada de Piper está verificado todavía (binario para la laptop, voces/modelos `.onnx` en inglés y español, consumo de CPU): verificarlo al empezar la Parte 5. Whisper (`transcribe.js`) solo transcribe, no sintetiza.

## 5. Archivos
**Partes 1–2 (nuevos):** `src/mercados.js`, `src/canales.js`, `src/plan-renders.js`; `tests/modo-local.test.js`, `tests/modo-completo.test.js`, `tests/mercados.test.js`, `tests/canales.test.js`, `tests/plan-renders.test.js`; `tests/fixtures/hook-cargas.mjs`, `registrar-hook.mjs`, `arrancar-app.mjs`; `ESTADO_CLIPLAB_PRO.md`, `.cliplab-handoff.json`.
**Parte 3 (nuevos):** `src/paquete-texto.js`, `src/routes/paquete.js`, `public/js/paquete.js`, `tests/paquete-texto.test.js`, `tests/paquete-rutas.test.js`, `aplicar-parte3.sh`.
**Parte 4 (nuevos):** `src/ollama.js`, `src/engine/exclusion.js`, `src/validador-ficha.js`, `src/guionista.js`, `src/guiones-cola.js`, `src/memoria-proyecto.js`, `config/Modelfile.guionista`; `tests/canal-config.test.js`, `tests/exclusion.test.js`, `tests/ollama.test.js`, `tests/validador-ficha.test.js`, `tests/guionista.test.js`, `tests/guiones-cola.test.js`, `tests/fixtures/ficha-ejemplo.mjs`; `aplicar-parte4.sh`.
**Parte 4 (modificados):** `src/config/index.js` (CLIPLAB_CANAL + OLLAMA_*), `src/engine/cola.js` (candado + `fijarProcesador` solo para pruebas), `src/routes/index.js` (`/api/modo` con canal/ritmo), `src/server.js` (aviso y log del canal), `package.json` (6 archivos de prueba nuevos en `test`), `.env.example` (bloques CLIPLAB_CANAL y Ollama; `SEGMENT_MIN/MAX_SECONDS` quedaron comentadas).
**Parte 5 (nuevos):** `src/voz.js`, `src/banco-medios.js`, `src/stories-plan.js`, `src/engine/stories-render.js`, `src/stories-produccion.js`, `src/trabajos-guion.js`, `src/routes/guiones.js`, `public/js/guiones.js`; `tests/voz.test.js`, `tests/banco-medios.test.js`, `tests/stories-plan.test.js`, `tests/stories-render.test.js`, `tests/stories-produccion.test.js`, `tests/guiones-rutas.test.js`, `tests/guiones-panel.test.js`, `tests/fixtures/piper-falso.mjs`; carpetas `assets/voces/` y `assets/banco/{efectos,musica,medios}/...` (las crea el script con `.gitkeep`); `aplicar-parte5.sh`.
**Parte 5 (modificados):** `src/config/index.js` (PIPER_* y BANCO_DIR), `src/validador-ficha.js` (ficha acepta `foto`; meses equivalentes en/es; "may" minúscula es verbo), `src/routes/index.js` (monta guiones), `src/routes/paquete.js` (`archivoDeClip(clip, mercado)` y `?mercado=` en la descarga), `public/js/api.js` (6 funciones de guiones + `descargarVideo(id, mercado)`), `public/js/paquete.js` (descarga el mercado elegido), `public/index.html` (botón `#btn-guiones` y un `<script>`), `public/css/styles.css` (bloque al final), `package.json` (7 archivos de prueba nuevos), `.env.example` (bloques Piper y banco), `tests/validador-ficha.test.js` (+4), `tests/paquete-rutas.test.js` (+2), `.gitignore` (voces y medios del banco).
**Modificados (Partes 1–3):** `src/config/index.js`, `src/app.js`, `src/server.js`, `src/routes/index.js` (P1 y P3), `package.json` (script `test` con los 7 archivos nuevos), `.env.example`; Parte 3 además: `public/js/api.js` (3 funciones nuevas al final), `public/js/flujo.js` y `public/js/views.js` (un botón "Publicar a mano" cada uno), `public/index.html` (un `<script>`), `public/css/styles.css` (bloque al final).
**Protegidos, sin tocar (verificado con sha256 en `aplicar-parte3.sh`):** `src/engine/pipeline.js`, `src/upload.js`, `src/engine/rotacion.js`, `rotacion-estado.js`, `rotacion-flujo.js`. Tampoco `Dockerfile`, `src/engine/marketing.js` (solo se importa `construirContextoClip`).

## 6. Estado exacto de `npm test`
`npm test` (≈ 330–400 s): **590 pruebas — 585 pasan, 5 se saltan, 0 fallan** (base original 336 = 332 + 4 saltan; Parte 1 +15; Parte 2 +29; Parte 3 +31; Parte 4 +101; Parte 5 +78). Los 5 saltos: 4 de la base + la prueba de **Piper real** de `voz.test.js` (se activa con `PIPER_PATH=... PIPER_VOICES_DIR=... node --test tests/voz.test.js`). Correr siempre `setsid nohup npm test > /tmp/t.log 2>&1 &` y consultar el log (una llamada de bash no puede pasar de 300 s). Rápidas de la Parte 5: `node --test tests/voz.test.js tests/banco-medios.test.js tests/stories-plan.test.js tests/stories-render.test.js tests/stories-produccion.test.js tests/guiones-rutas.test.js tests/guiones-panel.test.js` (72; ~40 s; las de render usan FFmpeg real a 270x480).

## 7. Arranque en otra PC
`unzip cliplab-backend-parte3.zip && cd cliplab-backend && npm ci && bash aplicar-parte4.sh && bash aplicar-parte5.sh   (o, con el zip de la Parte 5: npm ci && npm test)` (el zip excluye `node_modules/` y `.git/`; hay `package-lock.json`). Para commitear: `git init` o clonar el repo y copiar encima. FFmpeg y ffprobe deben estar en PATH (las pruebas que los usan se saltan si no están). `CLIPLAB_MODE=local node src/server.js`.

## 8. Parte 3 — HECHA y probada: paquete de texto y descarga manual
- `src/paquete-texto.js` (puro): `generarPaquete({clip, canal, mercado, destino})` → `{destino, mercado, canal, titulo, descripcion, hashtags, cta, texto, avisos}` (+ `variantes:[{etiqueta,titulo,gancho}]` solo en `youtube_long`: `DESTINOS.youtube_long.variantesTitulo` = 3, `directo`/`pregunta`/`estructura`; el sufijo de estructura sale de `CANALES[canal].estructuraLarga`: serie → "Full Series"/"Serie completa", lista → "Key Moments"/"Momentos clave"). `generarPaquetes({clip, canal, mercados?, destinos?})` → lista (por defecto 2 mercados × destinos del canal = 8; principal primero). También exporta `detectarIdioma`, `acortar`, `LIMITES`, `ErrorPaquete` (400, hereda de `ErrorCanal`).
  - `texto` = lo que se pega en el campo de descripción/caption (descripción + CTA + hashtags). Facebook/Instagram abren el caption con el título (no hay campo de título); Shorts y largo llevan el título aparte y la descripción no lo repite.
  - Reutiliza `construirContextoClip` (gancho, puntos clave, duración). **No inventa hechos** (solo aparecen texto y números del propio clip; lo prueba una prueba con cifras) y **no traduce**: si el texto del clip parece estar en otro idioma que el mercado, agrega un aviso en `avisos` (heurística de palabras comunes; devuelve `null` si hay poca evidencia). Un clip sin procesar (título = URL) nunca publica la URL: usa `marketing.titulo` o avisa que falta título.
  - Límites (valores de diseño míos, editables en `LIMITES`; no son reglas de las plataformas): título 100; descripción FB/IG 2000, Shorts 1000, largo 4000; hashtags FB 4, IG 8, Shorts 4, largo 5. Hashtags: del destino (`#reels`/`#shorts` primero), del canal por idioma y hasta 2 palabras del título (sin acentos, sin palabras vacías). CTA por canal e idioma (rotan con una semilla estable); Shorts siempre lleva el CTA de embudo ("More on the channel." / "Hay más en el canal.").
  - Limitación conocida: las palabras de tema de los hashtags son toscas (primeras palabras largas del título); el usuario los ajusta a mano.
- `src/routes/paquete.js` (montado en `src/routes/index.js` antes de `panelRoutes`; **cada ruta lleva su propio `requireMasterKey`**, probado con el router montado solo):
  - `GET /api/panel/canales` (solo lectura): `{canales:[{id,nombre,descripcion,estructuraLarga,destinos,mercados,plan}], destinos, mercados}`; `plan` = `planDeRenders({canal}).resumen` (stories: 2 renders + 2 concatenaciones).
  - `GET /api/panel/clips/:id/paquete?canal=&mercado=&destino=` → `{clipId, canal, paquetes:[...]}`. `canal` obligatorio (400 si falta o es inválido: nunca se adivina). `mercado`/`destino` opcionales, aceptan texto, lista con comas o parámetros repetidos; vacío = todos los del canal. 404 clip inexistente; 409 si el clip no está `listo`/`publicado`.
  - `GET /api/panel/clips/:id/descarga` → `res.download` (stream, sin cargar el archivo en RAM; admite `Range`; `Content-Disposition: attachment; filename="<titulo-en-ascii>.mp4"`, `Cache-Control: no-store`, `nosniff`). El archivo se saca de `clip.url` solo si es exactamente `/clips/<nombre>.mp4` con `^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$`, resuelto dentro de `config.clipsDir`; el id de la URL nunca arma rutas de disco. 404 si no hay video o fue podado. Probado contra `../`, `%2e%2e`, `\`, subrutas, dotfiles y rutas absolutas (nada de fuera de `clipsDir` sale).
  - Los errores 404/409 se responden directo (sin ensuciar el log); `ErrorCanal`/`ErrorMercado` (400) los respeta `errorHandler`.
- Panel (`public/js/`): `paquete.js` (nuevo) abre un `<dialog>` desde cualquier `[data-accion="paquete"][data-id]` (botón "Publicar a mano" en la tarjeta de Todos los clips y en la de Resumen, solo si el clip está listo/publicado). **El canal lo elige la persona cada vez** (sin valor por defecto); pestañas de mercado (en-US primero); una tarjeta por destino con avisos, título, variantes (largo) y botones **Copiar título / Copiar texto / Copiar todo** (`navigator.clipboard` con respaldo `execCommand('copy')`) y un botón **Descargar video**. La descarga usa `fetch` + blob porque un `<a>` no puede enviar la llave maestra (`api.js`: `obtenerCanales`, `obtenerPaquete`, `descargarVideo`). Todo el texto entra con `textContent` (sin HTML inyectado).
- Verificación hecha: pruebas Node (rutas, traversal, auth, archivos estáticos del panel e importaciones de `paquete.js` contra lo que exportan `api.js`/`ui.js`) y una **prueba de humo en jsdom fuera del repo** (abrir, elegir canal, copiar, cambiar de mercado, descargar con llave, aviso sin inyección HTML). **No se probó en un navegador real**: revisar a ojo el diálogo en el Chromebook (estilos en `styles.css`, bloque "Publicar a mano").
- Mutaciones probadas (13, todas detectadas salvo una equivalente): quitar filtro de URL, aceptar subruta, quitar la llave de cada ruta, CTA es-US en inglés, número inventado, sin `attachment`, gancho que no sale del contexto, canal por defecto, barras en el nombre de archivo, paquete de clip en proceso, no limpiar `<>`, respaldo de copiar. La equivalente: quitar la comprobación canal↔mercado (hoy todos los canales tienen ambos mercados).
- Pendiente para la Parte 5: hoy hay **un solo archivo por clip**, así que la descarga es la misma para en-US y es-US. Cuando existan renders por mercado, extender `archivoDeClip(clip, mercado)` (`src/routes/paquete.js`) con algo como `clip.archivos[mercado]` y pasar `?mercado=` desde `descargarVideo`.
- Nota: `/clips/<token>.mp4` sigue sirviéndose estático y público (comportamiento original, tokens aleatorios); la ruta nueva añade llave + `attachment`.

## 9. Parte 4 — HECHA y probada: CLIPLAB_CANAL, cliente Ollama, exclusión Ollama↔FFmpeg, Modelfile, validador de ficha, guionista y colas
**Paso 0 — `CLIPLAB_CANAL`** (`src/config/index.js`, ahora importa `canales.js`; sin ciclos): `config.canal` (`'stories'|'sports'|'news'|null`), `canalPedido`, `canalValido`, `ritmoOrigen` (`{campo: 'env'|'canal'|'defecto'}`). Se normaliza (` News ` → news). Con canal válido el ritmo (`beatSeconds, punchZoom, hotCutGap, segmentMinSeconds, segmentMaxSeconds`) sale de `CANALES[canal].ritmo`. **Precedencia por campo: variable de entorno explícita (válida) > ritmo del canal > defecto de siempre.** Variable vacía, `0` o basura = no explícita. Valor desconocido → `canal: null`, `canalValido: false`, ritmo de siempre, aviso al arrancar (`server.js`), nunca se adivina. Visible en `GET /api/modo` (`canal, canalValido, ritmo, ritmoOrigen`) y en el log de arranque (`Canal de la instancia` + campo `canal` en `ClipLab Pro escuchando`). **Ojo:** si el `.env` real del usuario trae `SEGMENT_MIN_SECONDS=30` / `SEGMENT_MAX_SECONDS=60` (venían en `.env.example`), esas ganan sobre el canal; `.env.example` ahora las trae comentadas y lo explica.
**Paso 1 — variables Ollama** (`config`): `ollamaUrl` (`OLLAMA_URL`, por defecto `http://127.0.0.1:11434`, sin `/` final), `ollamaModel` (**`qwen2.5:7b-instruct`**), `ollamaNumCtx` (8192, mínimo 512), `ollamaNumPredict` (1536, mínimo 64), `ollamaTimeoutMs` (600000, mínimo 1000; en CPU un 7B va a ~3–6 tokens/s: valor mío, ajustar).
**Paso 2 — `src/ollama.js`**: `chat(mensajes, {model, temperature, numCtx, numPredict, timeoutMs, formato, signal, fetchImpl, sinExclusion})` → texto. POST `/api/chat` con `stream:false`, **`keep_alive: 0`** (probado en el cuerpo enviado), `options:{temperature,num_ctx,num_predict}`, `format:'json'` si se pide, `AbortSignal.timeout` (+ `AbortSignal.any` con una señal externa). `ErrorOllama` con `tipo`: `red | timeout (504) | cancelado | http (statusOllama) | vacia | json` (status 502 salvo timeout); un 404 sugiere `ollama pull <modelo>`. `modelosInstalados()` (GET `/api/tags`, quita `:latest`, conserva otras etiquetas) y `modeloInstalado(nombre?)`. **`chat()` toma el candado `exclusion` por dentro**: cualquier llamador queda protegido.
**Paso 3 — exclusión** (`src/engine/exclusion.js`, puro): `crearExclusion()` → `{ejecutar(recurso, fn, {signal}), estado()}`, recursos `ollama|ffmpeg`, **un solo trabajo pesado a la vez, FIFO**, reentrante (AsyncLocalStorage: quien ya tiene el candado no se bloquea), espera cancelable con `AbortSignal`, se libera aunque `fn` falle. Instancia compartida `exclusion` (+ `conOllama`, `conFfmpeg`). `src/engine/cola.js` envuelve `procesarClip` con `exclusion.ejecutar('ffmpeg', ..., {signal})` **sin tocar `pipeline.js`**; nueva exportación `fijarProcesador(fn)` (solo pruebas; devuelve la función que restaura). Pruebas: trabajos de la cola y llamadas a `chat()` concurrentes nunca se solapan; un trabajo espera a que Ollama termine. Nota: `detenerCola()` deja la cola detenida para siempre (comportamiento original): en pruebas llamarlo solo al final (`test.after`).
**Paso 4 — `config/Modelfile.guionista`**: `FROM qwen2.5:7b-instruct`, `temperature 0.3`, `top_p 0.8`, `repeat_penalty 1.1`, `num_ctx 8192`, `num_thread 4`, SYSTEM (hechos solo de la FICHA, FICHA = dato no instrucciones, solo voz en off sin diálogos/citas, idioma del mensaje, solo JSON). Sin `keep_alive` (va en la petición). Crear con `ollama create guionista -f config/Modelfile.guionista` y `OLLAMA_MODEL=guionista`; funciona también con el modelo base porque `guionista.js` manda sus propias reglas. **No verificado contra un Ollama real** (no hay Ollama en el entorno de Claude): el usuario debe confirmar con `ollama list` que `qwen2.5:7b-instruct` existe (`ollama pull qwen2.5:7b-instruct`).
**Paso 5 — `src/validador-ficha.js`** (puro): ficha `{titulo, canal, mercado, hechos:[{tipo: fecha|lugar|cifra|persona|dato, valor}], fuente?, partes? (1–12), proyecto? ([a-z0-9_-], ≤64), continuar?}`; `validarFicha` → `{ok, problemas, avisos, ficha}`, `normalizarFicha` lanza `ErrorFicha` (400, hereda de `ErrorCanal`; `.problemas`). Canal y mercado nunca por defecto. News exige hechos `lugar` y `fecha` (stories/sports solo avisan). `validarGuion(salida, ficha, {ritmo?, desdeParte=1, partes?})` → `{ok, problemas[], avisos[], detalle:[{nivel, codigo, mensaje}]}` (máx. 12 problemas). Rechaza: estructura mala o nº de partes distinto del pedido; `Parte N` no consecutiva (o que menciona otra parte); cifras/años, **meses** y **nombres propios** que no están en la ficha (se revisan narración, `escena` y `textoPantalla`); citas entrecomilladas (≥3 palabras) que no están literalmente en la ficha, verbo de habla + comillas, líneas con raya, etiquetas `Nombre:` (menos Narrator/Narrador/Voz/Locutor); idioma ≠ mercado (reutiliza `detectarIdioma`); ritmo del canal (escena > `beatSeconds*1.5`, parte > `segmentMaxSeconds`, narración > 3.4 palabras/s); news sin decir lugar/fecha en la narración. Avisos: parte más corta que `segmentMinSeconds`, cifra escrita con palabras, entrecomillado corto. **Límites conocidos (heurísticas sin diccionario):** un nombre propio que abre una frase no se comprueba; líneas en Title Case/MAYÚSCULAS (texto de pantalla) no se revisan como nombres; `detectarIdioma` devuelve null con poca evidencia (no rechaza); los umbrales (1.5, 3.4, 12) son valores míos editables (`ESCENA_MAX_FACTOR`, `PALABRAS_POR_SEGUNDO_MAX`, `MAX_PROBLEMAS`).
**Bucle — `src/guionista.js`**: `generarGuion(ficha, {desdeParte, memoria, maxReintentos (0–2), chatImpl, temperature, signal, fetchImpl})` → `{ok, intentos, guion, problemas, avisos, historial}`. Prompt de sistema por canal (tono, evitar, idioma del mercado, ritmo, rigor) y la ficha dentro de `<FICHA>…</FICHA>` como **dato**; memoria en `<YA_ESCRITO>`. Si hay problemas, reenvía la respuesta anterior (assistant) + la lista de problemas y reintenta: **máx. 2 reintentos (3 intentos)**; JSON roto o vacío también se reintenta; red/timeout/HTTP/cancelado se propagan como `ErrorOllama` sin reintento. Tras el último fallo devuelve `ok:false` con el último guion legible. `extraerJson` admite ```json y texto alrededor. Cada intento toma el candado por separado (entre reintentos FFmpeg puede avanzar).
**Paso 6 — colas**: `src/guiones-cola.js`: `<dataDir>/guiones/{pendientes,procesados,fallidos}/<id>.json`, id `\d{13}-[0-9a-f]{8}` generado por el sistema (validado antes de armar rutas), escritura atómica. `encolarGuion(ficha)` (valida), `listarPendientes/Procesados/Fallidos`, `leerGuion(estado,id)`, `procesarSiguiente()` (más antiguo primero; ok → procesados; no pasa la validación → fallidos con problemas; **Ollama caído → se queda en pendientes**, resultado `motivo:'ollama'`; archivo ilegible → fallidos), `procesarPendientes({max})` (se detiene si Ollama falla), un guion a la vez. Todas aceptan `{base, baseMemoria}` para pruebas. `src/memoria-proyecto.js`: `<dataDir>/memoria/<proyecto>.json` con `ultimaParte` y las últimas 20 entradas; `ficha.proyecto` activa la memoria y `ficha.continuar:true` hace que el guion siga en `ultimaParte+1` (si no, empieza en 1).
**Sin rutas HTTP ni botones nuevos en la Parte 4** (a propósito: nada colgando sin conexión). Falta exponer la cola de guiones en el panel (Parte 5, ver abajo).
**Verificación:** `npm test` completo 512/508/4/0; ~48 mutaciones (candado, keep_alive, timeout, `:latest`, FIFO, reentrada, liberar tras error, precedencia env/canal, canal desconocido, cifras/meses/nombres/citas/diálogos/idioma/ritmo/news, tope de reintentos, devolver problemas al modelo, errores de red sin reintento, ids con traversal, orden de la cola, memoria) — todas detectadas (una mutación mal planteada se rehízo); script aplicado en un clon limpio de la Parte 3, dos veces (repetible); sha256 de pipeline/upload/rotacion* sin cambios. Gotcha de pruebas: `AbortSignal.timeout` no mantiene vivo el proceso (en producción lo hace el socket); las pruebas de timeout usan un `setInterval`. Gotcha de shell: `pkill -f`/`pgrep -f` con texto que aparece en tu propia línea de comandos mata tu shell; usa `ps -eo pid,args | awk '/patron/ && !/awk/ {print $1}' | xargs kill`.

## 9b. Parte 5 — HECHA y probada: voz Piper, banco de medios, producción del canal stories, cola de guiones en el panel
**Piper verificado (entorno de Claude, Linux x86_64):** binario `piper_linux_x86_64.tar.gz` del release 2023.11.14-2 (github.com/rhasspy/piper) corre sin instalar nada; voces de prueba `en-us-lessac-low` y `es-carlfm-x-low` (assets del release v0.0.2). CLI usada: `piper -m modelo.onnx -f salida.wav -q --length_scale N --sentence_silence 0.25 [--espeak_data DIR]` con el texto por **stdin** (una línea); Piper imprime el nombre del archivo en stdout. Medido: **factor de tiempo real ≈ 0.12–0.13** en un solo núcleo (12 s de audio en 1.5 s), **RAM pico ≈ 165 MB**, WAV mono (16 kHz las voces "low"; las "medium" son 22.05 kHz). El binario debe ejecutarse **por su ruta completa** (sus `.so` y `espeak-ng-data` van junto a él). **No verificado:** Windows (hay `piper_windows_amd64.zip` en el mismo release; mismas banderas), ni voces "medium/high" (Hugging Face está bloqueado aquí: se recomienda `en_US-lessac-medium` y una `es_MX`/`es_ES` medium; el contrato no cambia).
**Contrato de síntesis (`src/voz.js`):** `sintetizar({texto, mercado, salida, lengthScale?, signal?, binario?, argsPrevios?, modelo?, dirVoces?, timeoutMs?}) → {archivo, duracionSeg, mercado, voz, sampleRate}`. `mercado` obligatorio (sin defecto); `salida` = ruta absoluta `.wav`; `ErrorVoz.tipo`: `sin_binario | sin_voz | texto (400) | salida | fallo | timeout | cancelado` (502 salvo texto). Sin shell, texto por stdin, máx. 4000 caracteres, `length_scale` fuera de 0.5–2 se ignora. Pasa por el candado `exclusion` (recurso `'ffmpeg'`, reentrante). `vozDeMercado(m)`: `PIPER_VOICE_EN_US/ES_US` (nombre o ruta) o la mejor `.onnx` de `PIPER_VOICES_DIR` (en-US: `^en[-_]us`; es-US: `^es`; high > medium > low). `verificarPiper()` → `{binario, ruta, voces, listo}`; `duracionWav()` lee la cabecera sin ffprobe. Config: `PIPER_PATH` (defecto `piper`), `PIPER_VOICES_DIR` (defecto `assets/voces`), `PIPER_LENGTH_SCALE`, `PIPER_TIMEOUT_MS` (120000), `BANCO_DIR` (defecto `assets/banco`).
**Banco (`src/banco-medios.js`):** `<bancoDir>/efectos|musica/<categoria>/*.wav|mp3|ogg|m4a`, `medios/<categoria>/*.mp4|mov|webm|mkv|jpg|png|webp` (`medios/fondos` = fondos de escena, `medios/fotos` = fotos de la ficha). Categoría `[a-z0-9_-]{1,32}` (nunca ruta), sin ocultos ni enlaces que salgan del banco; `elegir()` con `rng` reproducible (`crearRng(semilla)`: mismo guion → misma selección) y `excluir`; sin archivos → `null` y el render usa colores. Opcional.
**Plan (`src/stories-plan.js`, puro):** `planDeParte({parte, ficha, mercado, duracionVoz})` reescala las escenas del guion a **voz real + 0.8 s** (mín. 0.6 s por escena; aviso si el factor sale de 0.5–2), `normalizarEfecto("zoom_in + whoosh") → {visual, sonido}` (visuales: `zoom_in zoom_out pan_izq pan_der fundido ninguno`; sin efecto, rota zoom_in/pan_der/zoom_out/pan_izq; el resto de tokens = categoría de efecto de sonido), subtítulos por frase temporizados por caracteres, `fichaEnPantalla()` (expediente: etiqueta FILE/EXPEDIENTE, nombre = hecho `persona` o título, líneas año/lugar/datos clave según `CANALES.stories.ficha.campos`, foto, 4 s), `planDeProduccion({id, canal, entradas:[{mercado, ficha, guion}]})` → un video por (mercado × parte) `stories-<id>-<mercado>-p<N>.mp4` + largo `…-largo.mp4`, principal primero, partes ordenadas por `n`. **Solo `stories`** (otro canal → `ErrorProduccion` 400 "Parte 6"); un guion por mercado; la ficha debe ser del mercado y canal.
**Render (`src/engine/stories-render.js`, no toca `pipeline.js`):** `construirParte()` (pura; devuelve `{args, textos}`), `renderizarParte()`, `concatenarPartes()` (demuxer concat, `-c copy`, en orden), `argsConcat()`, `elegirFuente()` (Anton en `FONTS_DIR` si existe, DejaVu/Arial del sistema, o null → fontconfig). 1080×1920 @30 fps, **libx264 CPU** con `config.cpuThreads` / `videoPreset` / `videoCrf` (los del pipeline), AAC 44.1 kHz. Escenas: imagen (`-loop`), video (`-stream_loop`) o color generado; efectos con `scale eval=frame` / `crop` animado (sin zoompan, barato en CPU); texto en pantalla arriba, **subtítulos de la narración** a media altura, **expediente** abajo (recuadro + foto opcional) de 0.4 s a 4.4 s; audio = voz + música al 10 % (`musica/calida`) + hasta 6 efectos al inicio de su escena (`amix` + `alimiter`). **Todo texto va en archivos `textfile` y ffmpeg corre con `cwd` = carpeta de trabajo** (sin escapar nada del guion, sin `:` de Windows en los filtros). Revisado visualmente con voz real de Piper (expediente, texto y subtítulos sincronizados).
**Orquestador (`src/stories-produccion.js`):** `producirStories({id, entradas, signal, avance, ...})`: por mercado y parte → Piper → plan → banco (fondos sin repetir mientras haya, efectos, música `calida`, foto) → render → mover a `clipsDir`; luego concat por mercado. Todo bajo **un candado** `exclusion('ffmpeg')`; temporales en `tmpDir/stories/<id>` se borran siempre; cancelable con `signal`. Dependencias inyectables (`deps`). `registrarClips({store, resultado, entradas})`: **un clip del store por parte** (`archivos: {mercado: url}`, `url` = mercado principal, `titulo` "… — Part N" / "… — Parte N", `transcripcion` = narración, `canal:'stories'`, `serie`, `parte`) **y uno por el largo** (`largo:true`). `src/trabajos-guion.js`: gestor de **un trabajo pesado a la vez** con estado (`tipo`, `estado` libre/corriendo/ok/error, `etapa`, `progreso`, `resultado`, `error`) y `cancelar()` (sin ruta HTTP todavía).
**Rutas (`src/routes/guiones.js`, cada una con `requireMasterKey`, bajo `/api/panel`):** `GET /guiones/entorno` (Ollama activo/modelo instalado, Piper binario/voces, banco), `GET /guiones/estado`, `GET /guiones` (pendientes/procesados/fallidos, hasta 50 c/u, con problemas/avisos), `POST /guiones {ficha, tambienEsUS?, tituloEs?}` → 201 `{ids}` (con `tambienEsUS` encola además la versión es-US de la misma ficha, título opcional traducido), `POST /guiones/procesar` → 202 (Ollama en segundo plano; 404 sin pendientes; 409 si hay un trabajo), `POST /guiones/producir {ids:[1–2 procesados]}` → 202 (valida el plan antes: 400/404; 409 si ocupado), `GET /guiones/:estado/:id` (ids validados). Descarga por mercado: `GET /clips/:id/descarga?mercado=es-US` (nombre `…-es-us.mp4`; sin `mercado` o sin ese archivo vale `clip.url`).
**Panel (`public/js/guiones.js`):** botón **Guiones** en la barra superior → diálogo con comprobación de entorno, formulario de ficha (hechos "tipo: valor" por línea, partes, proyecto/serie, foto, continuar serie, crear también es-US), pendientes + **Escribir guion (siguiente)**, procesados con casillas (1–2) + **Producir video (elegidos)**, fallidos con sus problemas, estado del trabajo con sondeo cada 3 s. Cada control llama a una ruta real (probado de forma estática y con una prueba de humo en jsdom contra el servidor real: abre, comprueba entorno, encola 2 guiones, rechaza hechos mal escritos, muestra el error de Ollama caído). Los videos aparecen en "Todos los clips" y salen por **Publicar a mano** (el selector de mercado del diálogo descarga el archivo de ese mercado). Sin rediseño estético (va al final).
**Flujo completo para el usuario:** Guiones → ficha (+ es-US) → Escribir guion (×2) → elegir los dos procesados → Producir video → Todos los clips → Publicar a mano. Partes de una serie: la ficha trae `partes` (1–12) y, con `proyecto` + `continuar`, la siguiente tanda sigue en la Parte N+1; el **video largo concatena las partes de ESA tanda** (para unir tandas distintas hay que producirlas juntas con `partes` mayor).
**Verificación:** `npm test` completo; ~33 mutaciones sobre los módulos nuevos (texto por stdin, candado, timeout, salida relativa, `length_scale`, calidad de voz, categoría/enlaces/foto del banco, reescalado a la voz, canal, mercados repetidos, orden de partes, rotación, etiquetas, hilos, mezcla de voz, `-c copy`, textfile, candado del orquestador, orden del concat, temporales, cancelación, duración, url principal, gestor) — todas detectadas (4 sobrevivieron al primer intento y se cerraron con pruebas nuevas); script aplicado en un clon limpio de la Parte 4 dos veces; sha256 de pipeline/upload/rotacion* sin cambios. Pruebas con **FFmpeg real** (render, banco, concat, extremo a extremo con Piper falso) y con **Piper real** (manual, opcional).
**Límites y pendientes conocidos:** (1) `MAX_CLIPS_STORED` (25): una serie de N partes en 2 mercados deja (N+1)×2 videos; el pipeline poda por antigüedad y **los archivos por mercado que no son `clip.url` pueden borrarse antes** (la descarga responde 404 con mensaje); subir la variable si se producen series largas. (2) Sin botón de cancelar producción (el gestor ya lo soporta: falta ruta + botón). (3) `sports` y `news` no tienen producción automática (Parte 6). (4) Fondos: sin banco son colores lisos; no hay búsqueda de imágenes. (5) Duración de la parte = duración real de la voz + 0.8 s; el rango 45–75 s de stories solo avisa. (6) Los subtítulos son por frase (no palabra a palabra). (7) Windows sin probar. (8) El render corre a 1080×1920 con los hilos de `CPU_THREADS` (defecto 2): en la laptop calcular unos 1–3 minutos por minuto de video.

## 10. Partes 6–7 (resumen) — **la Parte 6 es la SIGUIENTE**
Antes de escribir código en la Parte 6: decidir con el usuario (una sola pregunta) si `sports` y `news` reutilizan `stories-render.js` (fondo + voz Piper + textos) o parten de video fuente con franjas; revisar `CANALES.sports/news` (`franja`, `rigor`, `ritmo`) y `planDeProduccion`, que hoy rechaza otros canales.
6. `sports` y `news`: franjas/degradados que tapan logos (`CANALES.*.franja`), títulos con gancho, producción de video por canal (hoy solo stories) y, si hace falta, ruta + botón de cancelar producción y subir `MAX_CLIPS_STORED`.
7. Relevo final + **limpieza aprobada por el usuario para el cierre final** (Dockerfile sin Chromium, quitar `playwright-core`, retirar módulos del publicador) + **rediseño estético del panel y empaquetado final para Windows en una instancia dedicada**. Hacerla solo al cierre y con las pruebas verdes antes y después.

## 11. Decisiones cerradas con el usuario (no volver a preguntar)
1. **Voz (TTS): Piper local, 100 % offline.** 2. **`youtube_long`: se mantiene 9:16 heredado**, sin render 16:9 extra. 3. **`CLIPLAB_CANAL`: aprobado** (se implementa en la Parte 4, paso 0). 4. **Modelo Ollama: `qwen2.5:7b-instruct` con `keep_alive: 0`.** 5. **Limpieza de la Parte 7: aprobada para el cierre final.**
Sin decisiones abiertas por ahora. (Diseño mío, editable, no del usuario: P4 — el candado vive dentro de `chat()` y el ritmo del guion se valida con `CANALES[canal].ritmo`; P5 — la ficha acepta `foto`, un trabajo pesado a la vez, expediente en los primeros 4 s de cada parte, `youtube_long` = concatenación 9:16 de las partes de la tanda, subtítulos por frase, música `calida` y fondos `fondos` por defecto.)

## 12. Notas de entorno que ahorran tiempo
- `web_fetch` a GitHub está bloqueado (robots); **`git clone https://github.com/mxldigitalservices-oss/<repo>.git` desde bash sí funciona** (repos públicos).
- Tests de config con otra env: `await import('../src/config/index.js?variante=N')` (módulo nuevo por consulta); cada archivo de prueba corre en su propio proceso, así que fijar `process.env` antes de los imports.
- Para probar "qué módulos se cargan": `tests/fixtures/registrar-hook.mjs` + `CARGAS_LOG`.
- Preferencias del usuario: archivos completos, heredoc, sin nano; mensajes breves y directos; no preguntar de más (máx. 1 pregunta por respuesta).
- Entrega de la Parte 5: `aplicar-parte5.sh` (mismo formato que la 4: sha256 previo de lo que reemplaza —acepta la versión de la Parte 4 o la de la 5—, respaldo en `.respaldo-parte5/`, crea `assets/voces` y `assets/banco/...` con `.gitkeep`, añade a `.gitignore` las voces `.onnx` y los medios del banco, corre las pruebas de la parte; `--completo` = `npm test`; `--simular`). Para probar con Piper real en Linux: descargar `piper_linux_x86_64.tar.gz` y voces `voice-en-us-lessac-low.tar.gz` / `voice-es-carlfm-x-low.tar.gz` de `github.com/rhasspy/piper/releases` (el `curl` a GitHub funciona desde bash; Hugging Face no). `ffmpeg` y `ffprobe` existen en el entorno de Claude (6.1, con drawtext/amix/concat). Para ver un fotograma: `ffmpeg -ss 1.5 -i parte.mp4 -frames:v 1 f.png` y abrirlo con `view`. `/usr/bin/time` no existe aquí (medir RAM con `resource.getrusage` en Python). Los `pkill -f`/`pgrep -f` con texto de tu propia línea de comandos matan tu shell: `ps -eo pid,args | awk '/patron/ && !/awk/ {print $1}' | xargs -r kill`. El `sh` del tool no admite `<<<`: usar `printf ... |` o `bash -c`.
- Entrega de la Parte 3: `aplicar-parte3.sh` (autocontenido, repetible; comprueba sha256 de los archivos que reemplaza y de los protegidos, respalda en `.respaldo-parte3/`, corre las pruebas de la parte; con `--completo` corre `npm test`). El script ya se probó en un clon limpio de las Partes 1–2.
- `npm ci` es obligatorio antes de probar en un entorno nuevo (el zip no trae `node_modules/`); sin él, las pruebas de rutas fallan con `Cannot find package 'express'`.
- Prueba de humo del panel sin navegador: `jsdom` instalado solo en `/tmp` (no es dependencia del proyecto); `dialog.showModal`, `navigator.clipboard` y `URL.createObjectURL` hay que simularlos.
CLIPLAB_EOF_PARTE5
escribir ".cliplab-handoff.json" <<'CLIPLAB_EOF_PARTE5'
{
  "proyecto": "ClipLab Pro (cliplab-backend) - modo local",
  "generado": "2026-11-22",
  "leer_primero": "ESTADO_CLIPLAB_PRO.md (detalle completo). Este JSON es el resumen legible por maquina.",
  "idioma_usuario": "espanol informal, voz a texto",
  "repo": {
    "remoto": "https://github.com/mxldigitalservices-oss/cliplab-backend.git",
    "commit_base": "d64f983",
    "cambios_sin_commitear": true,
    "node": ">=20 (probado en 22)"
  },
  "objetivo": "Estacion local de produccion de video (CLIPLAB_MODE=local), 16 GB RAM / Intel UHD 620, respaldo CPU libx264. Sin publicador automatico: descarga y copia manual.",
  "partes": {
    "1": {
      "estado": "hecha_y_probada",
      "titulo": "Interruptor CLIPLAB_MODE=local",
      "resumen": "config.modo/modoLocal/modoPedido/modoValido; en modo local no se importa routes/programador.js (import dinamico), /api/programador/*, /api/clips/:id/programar y /publicar-ahora dan 404 (con y sin llave); GET /api/modo publico; panel servido sin pestana/seccion Programar y Publicar y con data-modo=local (htmlModoLocal en app.js); aviso de valor desconocido al arrancar.",
      "pruebas_nuevas": 15
    },
    "2": {
      "estado": "hecha_y_probada",
      "titulo": "Canales, destinos, mercados y plan de renders",
      "resumen": "src/mercados.js (en-US principal, es-US sub), src/canales.js (stories/sports/news + 4 destinos + trabajoDeCanal + variablesDeEntorno + validarNichosReservados + validarCatalogo), src/plan-renders.js (stories completo: 2 renders en vez de 8 + 2 concatenaciones).",
      "pruebas_nuevas": 29,
      "limites": [
        "El ritmo editorial vive en config (env al arrancar), no por trabajo: se aplica con CLIPLAB_CANAL (aprobado, se implementa en la Parte 4, paso 0; precedencia env explicita > ritmo del canal > defecto).",
        "es-US necesita su propio render si hay voz/subtitulos/titulo/ficha quemados (ahorro real 8->2).",
        "Voz (TTS) DECIDIDA: Piper local offline (aun sin verificar binario ni voces en/es; verificar al empezar la Parte 5)."
      ]
    },
    "3": {
      "estado": "hecha_y_probada",
      "titulo": "Paquete de texto y descarga manual",
      "resumen": "src/paquete-texto.js (puro; en-US y es-US por destino; reutiliza construirContextoClip; no inventa hechos ni traduce, avisa si el idioma del clip no coincide); src/routes/paquete.js con GET /api/panel/canales, /api/panel/clips/:id/paquete?canal=&mercado=&destino= (canal obligatorio) y /api/panel/clips/:id/descarga (res.download, attachment, anti-traversal); panel: public/js/paquete.js (dialogo Publicar a mano con Copiar y Descargar) + botones en flujo.js y views.js.",
      "pruebas_nuevas": 31,
      "verificacion": [
        "npm test completo",
        "clon limpio + Partes 1-2 aplicando aplicar-parte3.sh (dos veces: repetible)",
        "13 mutaciones (12 detectadas, 1 equivalente)",
        "prueba de humo del panel en jsdom fuera del repo",
        "sha256 de archivos protegidos sin cambios"
      ],
      "limites": [
        "No probado en un navegador real: revisar el dialogo a ojo en el Chromebook.",
        "Un solo archivo por clip: la descarga es la misma para en-US y es-US hasta la Parte 5 (renders por mercado).",
        "Limites de largo y hashtags son valores de diseno editables en LIMITES, no reglas de las plataformas.",
        "Deteccion de idioma heuristica; hashtags de tema toscos."
      ]
    },
    "4": {
      "estado": "hecha_y_probada",
      "titulo": "CLIPLAB_CANAL, cliente Ollama en Node (qwen2.5:7b-instruct, keep_alive 0), exclusion Ollama<->FFmpeg, Modelfile guionista, validador de ficha, guionista con reintentos y cola de guiones",
      "resumen": "config: CLIPLAB_CANAL (env explicita > ritmo del canal > defecto; desconocido = aviso; visible en /api/modo y log) + OLLAMA_*; src/ollama.js (chat con AbortSignal.timeout, ErrorOllama, modelosInstalados sin :latest, keep_alive 0, fetchImpl inyectable, candado dentro de chat); src/engine/exclusion.js + cola.js (FIFO, reentrante, sin tocar pipeline.js); config/Modelfile.guionista; src/validador-ficha.js (ficha unica fuente de hechos; sin dialogos/citas; Parte N consecutiva; idioma vs mercado; ritmo del canal; news exige lugar y fecha); src/guionista.js (max 2 reintentos devolviendo problemas); src/guiones-cola.js (pendientes->procesados|fallidos) y src/memoria-proyecto.js.",
      "pruebas_nuevas": 101,
      "pruebas_por_archivo": {
        "canal-config": 14,
        "exclusion": 8,
        "ollama": 14,
        "validador-ficha": 36,
        "guionista": 15,
        "guiones-cola": 14
      },
      "verificacion": [
        "npm test completo 512/508/4/0",
        "~48 mutaciones, todas detectadas (una mal planteada se rehizo)",
        "aplicar-parte4.sh en clon limpio de la Parte 3, dos veces",
        "sha256 de archivos protegidos sin cambios"
      ],
      "limites": [
        "Sin Ollama real en el entorno de Claude: nada probado contra un servidor real; confirmar con 'ollama list' que existe qwen2.5:7b-instruct.",
        "OLLAMA_TIMEOUT_MS=600000 y NUM_PREDICT=1536 son estimaciones para CPU (3-6 tok/s): ajustar con una prueba real.",
        "Validador heuristico: nombre propio al inicio de frase no se comprueba; cifras en palabras solo avisan; Title Case/MAYUSCULAS no se revisan como nombres; detectarIdioma puede dar null.",
        "Umbrales editables: ESCENA_MAX_FACTOR 1.5, PALABRAS_POR_SEGUNDO_MAX 3.4, MAX_PROBLEMAS 12.",
        "La cola de guiones y la memoria NO tienen rutas HTTP ni UI todavia (Parte 5).",
        "Si el .env real trae SEGMENT_MIN_SECONDS/SEGMENT_MAX_SECONDS (venian en .env.example), ganan sobre CLIPLAB_CANAL."
      ]
    },
    "5": {
      "estado": "hecha_y_probada",
      "titulo": "Piper local (contrato de sintesis), banco de medios, produccion del canal stories (plan + render FFmpeg + concat 9:16), cola de guiones con rutas protegidas y control en el panel",
      "resumen": "src/voz.js (sintetizar/verificarPiper/vozDeMercado, probado con Piper real); src/banco-medios.js; src/stories-plan.js (puro); src/engine/stories-render.js (libx264 CPU, textfile, expediente, subtitulos, voz+musica+sfx, concat -c copy); src/stories-produccion.js (candado unico, registrarClips en el store con archivos por mercado); src/trabajos-guion.js; src/routes/guiones.js (7 rutas con requireMasterKey); public/js/guiones.js (boton Guiones); descarga por mercado en paquete.js; validador acepta foto y meses en/es.",
      "pruebas_nuevas": 78,
      "piper_verificado": {
        "binario": "piper_linux_x86_64 2023.11.14-2",
        "voces_probadas": [
          "en-us-lessac-low",
          "es-carlfm-x-low"
        ],
        "rtf": "0.12-0.13 (1 nucleo)",
        "ram_pico_mb": 165,
        "wav": "mono 16 kHz (low) / 22.05 kHz (medium)",
        "windows": "no verificado",
        "voces_medium_high": "no descargables aqui (Hugging Face bloqueado)"
      },
      "limites": [
        "MAX_CLIPS_STORED (25): una serie en 2 mercados deja (N+1)*2 videos; los archivos por mercado que no son clip.url pueden podarse antes (descarga da 404 con mensaje).",
        "Sin ruta ni boton de cancelar produccion (el gestor ya tiene cancelar()).",
        "sports y news no tienen produccion automatica (planDeProduccion los rechaza: Parte 6).",
        "Subtitulos por frase; fondos = banco o colores lisos; el rango 45-75 s de stories solo avisa.",
        "Windows y voces medium/high sin probar.",
        "Render 1080x1920 con CPU_THREADS (defecto 2): estimar 1-3 min por minuto de video en la laptop; no medido en el hardware real."
      ]
    },
    "6": {
      "estado": "pendiente_siguiente",
      "titulo": "sports y news: franjas/degradados y titulos con gancho",
      "antes_de_codigo": [
        "Preguntar al usuario (1 pregunta): sports/news reutilizan stories-render.js o parten de video fuente con franjas",
        "Revisar CANALES.sports/news (franja, rigor, ritmo) y ampliar planDeProduccion",
        "Opcional: ruta + boton cancelar produccion; subir MAX_CLIPS_STORED"
      ]
    },
    "7": {
      "estado": "pendiente",
      "titulo": "Relevo final y limpieza APROBADA para el cierre final (Dockerfile sin Chromium, quitar playwright-core, retirar modulos del publicador)"
    }
  },
  "decisiones_cerradas": {
    "tts": "Piper local (100% offline); sin edge-tts ni gTTS",
    "youtube_long": "se mantiene 9:16 heredado (sin render 16:9 extra)",
    "CLIPLAB_CANAL": "aprobado para aplicar el ritmo del canal por instancia en config/index.js (Parte 4, paso 0)",
    "modelo_ollama": "qwen2.5:7b-instruct con keep_alive: 0 (liberar RAM al terminar)",
    "limpieza_parte7": "aprobada para el cierre final"
  },
  "decisiones_abiertas": [],
  "archivos_creados": [
    {
      "ruta": "src/mercados.js",
      "lineas": 83
    },
    {
      "ruta": "src/canales.js",
      "lineas": 251
    },
    {
      "ruta": "src/plan-renders.js",
      "lineas": 59
    },
    {
      "ruta": "src/paquete-texto.js",
      "lineas": 268
    },
    {
      "ruta": "src/routes/paquete.js",
      "lineas": 128
    },
    {
      "ruta": "public/js/paquete.js",
      "lineas": 163
    },
    {
      "ruta": "tests/modo-local.test.js",
      "lineas": 125
    },
    {
      "ruta": "tests/modo-completo.test.js",
      "lineas": 99
    },
    {
      "ruta": "tests/mercados.test.js",
      "lineas": 62
    },
    {
      "ruta": "tests/canales.test.js",
      "lineas": 161
    },
    {
      "ruta": "tests/plan-renders.test.js",
      "lineas": 75
    },
    {
      "ruta": "tests/paquete-texto.test.js",
      "lineas": 204
    },
    {
      "ruta": "tests/paquete-rutas.test.js",
      "lineas": 249
    },
    {
      "ruta": "tests/fixtures/hook-cargas.mjs",
      "lineas": 14
    },
    {
      "ruta": "tests/fixtures/registrar-hook.mjs",
      "lineas": 4
    },
    {
      "ruta": "tests/fixtures/arrancar-app.mjs",
      "lineas": 9
    },
    {
      "ruta": "aplicar-parte3.sh"
    },
    {
      "ruta": "ESTADO_CLIPLAB_PRO.md",
      "lineas": 94
    },
    {
      "ruta": ".cliplab-handoff.json"
    },
    {
      "ruta": "src/ollama.js",
      "lineas": 111
    },
    {
      "ruta": "src/engine/exclusion.js",
      "lineas": 74
    },
    {
      "ruta": "src/validador-ficha.js",
      "lineas": 291
    },
    {
      "ruta": "src/guionista.js",
      "lineas": 96
    },
    {
      "ruta": "src/guiones-cola.js",
      "lineas": 116
    },
    {
      "ruta": "src/memoria-proyecto.js",
      "lineas": 66
    },
    {
      "ruta": "config/Modelfile.guionista",
      "lineas": 23
    },
    {
      "ruta": "tests/canal-config.test.js",
      "lineas": 170
    },
    {
      "ruta": "tests/exclusion.test.js",
      "lineas": 120
    },
    {
      "ruta": "tests/ollama.test.js",
      "lineas": 132
    },
    {
      "ruta": "tests/validador-ficha.test.js",
      "lineas": 280
    },
    {
      "ruta": "tests/guionista.test.js",
      "lineas": 157
    },
    {
      "ruta": "tests/guiones-cola.test.js",
      "lineas": 172
    },
    {
      "ruta": "tests/fixtures/ficha-ejemplo.mjs",
      "lineas": 38
    },
    {
      "ruta": "aplicar-parte4.sh"
    },
    {
      "ruta": "src/voz.js",
      "lineas": 146
    },
    {
      "ruta": "src/banco-medios.js",
      "lineas": 98
    },
    {
      "ruta": "src/stories-plan.js",
      "lineas": 161
    },
    {
      "ruta": "src/engine/stories-render.js",
      "lineas": 162
    },
    {
      "ruta": "src/stories-produccion.js",
      "lineas": 118
    },
    {
      "ruta": "src/trabajos-guion.js",
      "lineas": 29
    },
    {
      "ruta": "src/routes/guiones.js",
      "lineas": 138
    },
    {
      "ruta": "public/js/guiones.js",
      "lineas": 193
    },
    {
      "ruta": "tests/voz.test.js",
      "lineas": 140
    },
    {
      "ruta": "tests/banco-medios.test.js",
      "lineas": 75
    },
    {
      "ruta": "tests/stories-plan.test.js",
      "lineas": 128
    },
    {
      "ruta": "tests/stories-render.test.js",
      "lineas": 144
    },
    {
      "ruta": "tests/stories-produccion.test.js",
      "lineas": 214
    },
    {
      "ruta": "tests/guiones-rutas.test.js",
      "lineas": 167
    },
    {
      "ruta": "tests/guiones-panel.test.js",
      "lineas": 63
    },
    {
      "ruta": "tests/fixtures/piper-falso.mjs",
      "lineas": 30
    },
    {
      "ruta": "aplicar-parte5.sh"
    }
  ],
  "archivos_modificados": [
    "src/config/index.js",
    "src/app.js",
    "src/server.js",
    "src/routes/index.js",
    "package.json",
    ".env.example",
    "public/js/api.js",
    "public/js/flujo.js",
    "public/js/views.js",
    "public/index.html",
    "public/css/styles.css",
    "src/engine/cola.js"
  ],
  "archivos_protegidos_sin_tocar": [
    "src/engine/pipeline.js",
    "src/upload.js",
    "src/engine/rotacion.js",
    "src/engine/rotacion-estado.js",
    "src/engine/rotacion-flujo.js"
  ],
  "tambien_sin_tocar": [
    "Dockerfile",
    "src/engine/marketing.js (solo se importa construirContextoClip)",
    "src/engine/programador.js",
    "src/engine/publicador.js"
  ],
  "npm_test": {
    "comando": "npm test",
    "duracion_aprox_s": 380,
    "total": 590,
    "pasan": 585,
    "saltan": 5,
    "fallan": 0,
    "desglose": "base 336 + P1 15 + P2 29 + P3 31 + P4 101 + P5 78",
    "nota": "ejecutar desacoplado: setsid nohup npm test > /tmp/t.log 2>&1 &  (npm ci antes en un entorno nuevo; una llamada de bash no puede pasar de 300 s). Un salto extra es la prueba de Piper real (PIPER_PATH + PIPER_VOICES_DIR)."
  },
  "reglas_usuario": [
    "No tocar pipeline.js, upload.js ni rotacion*.js",
    "Ollama y FFmpeg nunca en paralelo (la cola los serializa)",
    "Portar a Node sin Python lo tomado de ContentBotMXL-2 y ollama-core-engine",
    "Archivos completos sin '...'; comandos de una linea (cat/heredoc o bash script); nunca nano",
    "Una parte validada antes de la siguiente; pruebas con node --test; relevo al cierre",
    "Descartado: publicador automatico y sus piezas, moviepy, psycopg2, gemini_client, youtube_client/OAuth, musica infantil, mp4/PNG de prueba, autogit, gitops, apikeys, server.py, Caddyfile, .zip, .patch"
  ],
  "siguiente_instancia": {
    "arrancar": "unzip cliplab-backend-parte5.zip && cd cliplab-backend && npm ci && npm test  (esperar 590/585/5/0). Leer solo ESTADO_CLIPLAB_PRO.md y este JSON. Empezar por la Parte 6 (ver partes.6.antes_de_codigo). Decisiones cerradas: no volver a preguntarlas.",
    "patron_de_entrega": "aplicar-parteN.sh autocontenido (heredocs entrecomillados, archivos completos, sha256 previo, respaldo, repetible), pruebas node --test registradas en package.json, mutaciones, suite completa, ESTADO y handoff actualizados",
    "trucos_de_shell": "No usar pkill -f / pgrep -f con texto que aparezca en tu propia linea de comandos (mata tu shell): ps -eo pid,args | awk '/patron/ && !/awk/ {print $1}' | xargs kill",
    "parte6": {
      "nota": "Ver ESTADO_CLIPLAB_PRO.md secciones 9b y 10. Parte 5 completa; la Parte 6 es sports y news."
    }
  },
  "archivos_modificados_parte4": [
    "src/config/index.js",
    "src/engine/cola.js",
    "src/routes/index.js",
    "src/server.js",
    "package.json",
    ".env.example",
    "ESTADO_CLIPLAB_PRO.md",
    ".cliplab-handoff.json"
  ],
  "archivos_modificados_parte5": [
    "src/config/index.js",
    "src/validador-ficha.js",
    "src/routes/index.js",
    "src/routes/paquete.js",
    "public/js/api.js",
    "public/js/paquete.js",
    "public/index.html",
    "public/css/styles.css",
    "package.json",
    ".env.example",
    "tests/validador-ficha.test.js",
    "tests/paquete-rutas.test.js",
    ".gitignore",
    "ESTADO_CLIPLAB_PRO.md",
    ".cliplab-handoff.json"
  ]
}
CLIPLAB_EOF_PARTE5

# --- carpetas del banco y de las voces (vacias; el usuario solo copia archivos) y .gitignore ---
for d in assets/voces assets/banco/efectos/whoosh assets/banco/efectos/impacto assets/banco/musica/suspenso assets/banco/musica/calida assets/banco/medios/fondos assets/banco/medios/fotos; do
  mkdir -p "$d"; [ -f "$d/.gitkeep" ] || : > "$d/.gitkeep"
done
touch .gitignore
for linea in "assets/voces/*.onnx" "assets/voces/*.onnx.json" "assets/banco/*/*/*" "!assets/banco/*/*/.gitkeep"; do
  grep -qxF "$linea" .gitignore || echo "$linea" >> .gitignore
done
echo "Carpetas assets/voces y assets/banco listas"

DESPUES_PROTEGIDOS="$(for f in $PROTEGIDOS; do echo "$f $(sha "$f")"; done)"
[ "$ANTES_PROTEGIDOS" = "$DESPUES_PROTEGIDOS" ] || fallar "un archivo protegido cambio (pipeline.js, upload.js o rotacion*.js). Restaura desde $RESPALDO o desde git."
echo "Archivos protegidos: sin cambios (pipeline.js, upload.js, rotacion*.js)"

echo "Corriendo las pruebas de la Parte 5..."
node --test tests/voz.test.js tests/banco-medios.test.js tests/stories-plan.test.js tests/stories-render.test.js tests/stories-produccion.test.js tests/guiones-rutas.test.js tests/guiones-panel.test.js tests/validador-ficha.test.js tests/paquete-rutas.test.js
if [ "$COMPLETO" = 1 ]; then
  echo "Corriendo npm test completo (~6 min)..."
  npm test
fi
echo
echo "Parte 5 aplicada. Siguiente: Parte 6 (lee ESTADO_CLIPLAB_PRO.md y .cliplab-handoff.json)."
echo "Para la voz: copia piper (con sus librerias y espeak-ng-data) y define PIPER_PATH; copia una voz en-US y una es (.onnx + .onnx.json) en assets/voces."


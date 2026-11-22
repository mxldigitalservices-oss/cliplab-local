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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-canal-'));
const ENTORNO_BASE = {
  TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'),
  MASTER_KEY: 'llave-de-prueba', LOG_LEVEL: 'error',
};
Object.assign(process.env, ENTORNO_BASE);
process.env.CLIPLAB_MODE = 'local';
process.env.CLIPLAB_CANAL = 'sports';
for (const v of ['BEAT_SECONDS', 'PUNCH_ZOOM', 'HOT_CUT_GAP', 'SEGMENT_MIN_SECONDS', 'SEGMENT_MAX_SECONDS']) delete process.env[v];

const { CANALES } = await import('../src/canales.js');
const { createApp } = await import('../src/app.js');
const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
test.after(() => servidor.close());

let variante = 0;
/** Importa config con otras variables de entorno (modulo nuevo por consulta) y restaura el entorno despues. */
async function configCon(env) {
  const claves = ['CLIPLAB_CANAL', 'BEAT_SECONDS', 'PUNCH_ZOOM', 'HOT_CUT_GAP', 'SEGMENT_MIN_SECONDS', 'SEGMENT_MAX_SECONDS'];
  const guardado = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  claves.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  try {
    return (await import('../src/config/index.js?variante=' + (++variante))).config;
  } finally {
    claves.forEach((k) => { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; });
  }
}

test('sin CLIPLAB_CANAL nada cambia: valores de siempre y origen "defecto"', async () => {
  const c = await configCon({});
  assert.equal(c.canal, null);
  assert.equal(c.canalValido, true);
  assert.deepEqual([c.beatSeconds, c.punchZoom, c.hotCutGap, c.segmentMinSeconds, c.segmentMaxSeconds], [3.6, 1.14, 0.45, 30, 60]);
  assert.ok(Object.values(c.ritmoOrigen).every((o) => o === 'defecto'));
});

test('cada canal aplica su ritmo (origen "canal")', async () => {
  for (const id of ['stories', 'sports', 'news']) {
    const c = await configCon({ CLIPLAB_CANAL: id });
    const r = CANALES[id].ritmo;
    assert.equal(c.canal, id);
    assert.deepEqual([c.beatSeconds, c.punchZoom, c.hotCutGap, c.segmentMinSeconds, c.segmentMaxSeconds],
      [r.beatSeconds, r.punchZoom, r.hotCutGap, r.segmentMinSeconds, r.segmentMaxSeconds], id);
    assert.ok(Object.values(c.ritmoOrigen).every((o) => o === 'canal'), id);
  }
});

test('el canal se normaliza (mayusculas y espacios)', async () => {
  const c = await configCon({ CLIPLAB_CANAL: ' News ' });
  assert.equal(c.canal, 'news');
  assert.equal(c.beatSeconds, CANALES.news.ritmo.beatSeconds);
});

test('precedencia: variable de entorno explicita > ritmo del canal > defecto', async () => {
  const c = await configCon({ CLIPLAB_CANAL: 'sports', BEAT_SECONDS: '5', SEGMENT_MAX_SECONDS: '90' });
  assert.equal(c.beatSeconds, 5);
  assert.equal(c.ritmoOrigen.beatSeconds, 'env');
  assert.equal(c.segmentMaxSeconds, 90);
  assert.equal(c.ritmoOrigen.segmentMaxSeconds, 'env');
  assert.equal(c.punchZoom, CANALES.sports.ritmo.punchZoom);
  assert.equal(c.ritmoOrigen.punchZoom, 'canal');
  assert.equal(c.segmentMinSeconds, CANALES.sports.ritmo.segmentMinSeconds);
});

test('una variable vacia o basura no cuenta como explicita (gana el canal)', async () => {
  const c = await configCon({ CLIPLAB_CANAL: 'stories', BEAT_SECONDS: '', SEGMENT_MIN_SECONDS: 'abc', HOT_CUT_GAP: '0' });
  assert.equal(c.beatSeconds, CANALES.stories.ritmo.beatSeconds);
  assert.equal(c.segmentMinSeconds, CANALES.stories.ritmo.segmentMinSeconds);
  assert.equal(c.hotCutGap, CANALES.stories.ritmo.hotCutGap);
});

test('sin canal, las variables explicitas siguen mandando como antes', async () => {
  const c = await configCon({ BEAT_SECONDS: '2.5', SEGMENT_MIN_SECONDS: '10', SEGMENT_MAX_SECONDS: '20' });
  assert.equal(c.beatSeconds, 2.5);
  assert.equal(c.segmentMinSeconds, 10);
  assert.equal(c.segmentMaxSeconds, 20);
  assert.equal(c.canal, null);
});

test('el maximo de segmento nunca queda por debajo del minimo', async () => {
  const c = await configCon({ SEGMENT_MIN_SECONDS: '50', SEGMENT_MAX_SECONDS: '20' });
  assert.ok(c.segmentMaxSeconds >= c.segmentMinSeconds);
});

test('canal desconocido: no se adivina (canal null, no valido, ritmo de siempre)', async () => {
  const c = await configCon({ CLIPLAB_CANAL: 'sport' });
  assert.equal(c.canal, null);
  assert.equal(c.canalValido, false);
  assert.equal(c.canalPedido, 'sport');
  assert.equal(c.beatSeconds, 3.6);
});

test('variables de Ollama: valores por defecto', async () => {
  const c = await configCon({});
  assert.equal(c.ollamaUrl, 'http://127.0.0.1:11434');
  assert.equal(c.ollamaModel, 'qwen2.5:7b-instruct');
  assert.equal(c.ollamaNumCtx, 8192);
  assert.ok(c.ollamaNumPredict >= 64);
  assert.ok(c.ollamaTimeoutMs >= 1000);
});

test('variables de Ollama: se leen del entorno (sin barra final) y se acotan', async () => {
  const antes = { ...process.env };
  Object.assign(process.env, { OLLAMA_URL: 'http://otra:11434//', OLLAMA_MODEL: 'guionista', OLLAMA_NUM_CTX: '4096', OLLAMA_NUM_PREDICT: '9', OLLAMA_TIMEOUT_MS: '5' });
  try {
    const c = (await import('../src/config/index.js?variante=' + (++variante))).config;
    assert.equal(c.ollamaUrl, 'http://otra:11434');
    assert.equal(c.ollamaModel, 'guionista');
    assert.equal(c.ollamaNumCtx, 4096);
    assert.equal(c.ollamaNumPredict, 64);
    assert.equal(c.ollamaTimeoutMs, 1000);
  } finally {
    for (const k of ['OLLAMA_URL', 'OLLAMA_MODEL', 'OLLAMA_NUM_CTX', 'OLLAMA_NUM_PREDICT', 'OLLAMA_TIMEOUT_MS']) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
  }
});

test('/api/modo muestra el canal, el ritmo y de donde sale cada valor', async () => {
  const r = await fetch(base + '/api/modo');
  const cuerpo = await r.json();
  assert.equal(r.status, 200);
  assert.equal(cuerpo.data.canal, 'sports');
  assert.equal(cuerpo.data.canalValido, true);
  assert.equal(cuerpo.data.ritmo.beatSeconds, CANALES.sports.ritmo.beatSeconds);
  assert.equal(cuerpo.data.ritmoOrigen.beatSeconds, 'canal');
  assert.equal(cuerpo.data.modo, 'local');   // lo de la Parte 1 sigue igual
});

function arrancarServidor(env) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, ['src/server.js'], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, ...ENTORNO_BASE, LOG_LEVEL: 'info', PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    const fin = setTimeout(() => { hijo.kill('SIGKILL'); rechazar(new Error('El servidor no arranco a tiempo:\n' + salida)); }, 25000);
    const alDato = (d) => {
      salida += d;
      if (salida.includes('ClipLab Pro escuchando')) { clearTimeout(fin); hijo.kill('SIGTERM'); hijo.once('exit', () => resolver(salida)); }
    };
    hijo.stdout.on('data', alDato);
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.once('error', rechazar);
  });
}

test('arranque: un canal valido sale en el log (y en la linea "escuchando")', async () => {
  const log = await arrancarServidor({ CLIPLAB_CANAL: 'news' });
  assert.ok(log.includes('Canal de la instancia'), log);
  assert.ok(log.includes('"canal":"news"'), log);
  assert.ok(!log.includes('CLIPLAB_CANAL desconocido'), log);
});

test('arranque: un canal desconocido avisa y no se adivina', async () => {
  const log = await arrancarServidor({ CLIPLAB_CANAL: 'locla' });
  assert.ok(log.includes('CLIPLAB_CANAL desconocido'), log);
  assert.ok(!log.includes('Canal de la instancia'), log);
});

test('.env.example documenta CLIPLAB_CANAL y las variables de Ollama', async () => {
  const txt = await fs.readFile(path.join(import.meta.dirname, '..', '.env.example'), 'utf8');
  for (const v of ['CLIPLAB_CANAL', 'OLLAMA_URL', 'OLLAMA_MODEL', 'OLLAMA_NUM_CTX', 'OLLAMA_NUM_PREDICT', 'OLLAMA_TIMEOUT_MS']) assert.ok(txt.includes(v), v);
  assert.ok(txt.includes('qwen2.5:7b-instruct'));
});

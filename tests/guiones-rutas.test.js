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

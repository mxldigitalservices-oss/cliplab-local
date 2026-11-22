import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-modo-local-'));
process.env.CLIPLAB_MODE = 'local';
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.MASTER_KEY = 'llave-de-prueba';
process.env.LOG_LEVEL = 'error';

const { config } = await import('../src/config/index.js');
const { createApp, htmlModoLocal } = await import('../src/app.js');

const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
const AUTH = { 'x-master-key': 'llave-de-prueba' };

test.after(() => servidor.close());

async function json(ruta, opciones = {}) {
  const r = await fetch(base + ruta, opciones);
  return { status: r.status, cuerpo: await r.json() };
}

test('config: CLIPLAB_MODE=local activa el modo local y es un valor valido', () => {
  assert.equal(config.modo, 'local');
  assert.equal(config.modoLocal, true);
  assert.equal(config.modoValido, true);
});

test('/api/modo es publico y dice que no hay publicador', async () => {
  const { status, cuerpo } = await json('/api/modo');
  assert.equal(status, 200);
  assert.equal(cuerpo.success, true);
  assert.equal(cuerpo.data.modo, 'local');
  assert.equal(cuerpo.data.local, true);
  assert.equal(cuerpo.data.publicador, false);
});

test('/api informa el modo', async () => {
  const { status, cuerpo } = await json('/api');
  assert.equal(status, 200);
  assert.equal(cuerpo.data.modo, 'local');
});

test('rutas del programador y del publicador responden 404, con y sin llave', async () => {
  const casos = [
    ['GET', '/api/programador/cola'],
    ['GET', '/api/programador/diagnostico'],
    ['POST', '/api/programador/activar'],
    ['POST', '/api/programador/mongo/reconectar'],
    ['POST', '/api/clips/abc/programar'],
    ['POST', '/api/clips/abc/publicar-ahora'],
  ];
  for (const [metodo, ruta] of casos) {
    for (const cabeceras of [{}, AUTH]) {
      const { status, cuerpo } = await json(ruta, { method: metodo, headers: { ...cabeceras, 'content-type': 'application/json' }, body: metodo === 'POST' ? '{}' : undefined });
      assert.equal(status, 404, metodo + ' ' + ruta);
      assert.equal(cuerpo.success, false);
      assert.match(cuerpo.error, /CLIPLAB_MODE=local/);
    }
  }
});

test('el resto de la API sigue igual: health, panel y cookies de redes', async () => {
  assert.equal((await json('/health')).status, 200);
  const estado = await json('/api/panel/estado', { headers: AUTH });
  assert.equal(estado.status, 200);
  assert.equal(estado.cuerpo.success, true);
  assert.equal((await json('/api/panel/cookies-redes', { headers: AUTH })).status, 200);
  assert.equal((await json('/api/panel/estado')).status, 401);
});

test('el panel (/ y /index.html) no trae "Programar y Publicar" y conserva las demas pestanas', async () => {
  for (const ruta of ['/', '/index.html']) {
    const r = await fetch(base + ruta);
    const html = await r.text();
    assert.equal(r.status, 200, ruta);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.ok(html.includes('<html data-modo="local"'), ruta);
    assert.ok(!html.includes('data-vista="publicador"'), ruta);
    assert.ok(!html.includes('panel-publicador-ui'), ruta);
    assert.ok(!html.includes('Programar y Publicar'), ruta);
    for (const vista of ['resumen', 'conexiones', 'proyectos', 'clips', 'lotes', 'incidencias', 'marketing']) {
      assert.ok(html.includes('data-vista="' + vista + '"'), ruta + ' perdio la vista ' + vista);
    }
  }
});

test('htmlModoLocal: el index.html real trae las marcas (si cambia el HTML, esta prueba avisa) y lo demas queda intacto', async () => {
  const original = await fs.readFile(path.join(import.meta.dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(original.includes('data-vista="publicador"'), 'ya no hay pestana del publicador: revisa htmlModoLocal');
  assert.ok(original.includes('id="vista-publicador"'), 'ya no hay seccion del publicador: revisa htmlModoLocal');
  const local = htmlModoLocal(original);
  assert.notEqual(local, original);
  assert.ok(local.length < original.length);
  assert.equal(htmlModoLocal(local), local, 'aplicarlo dos veces no cambia nada');
  assert.equal(local.match(/data-modo="local"/g).length, 1);
});

test('htmlModoLocal: un HTML sin esas marcas no lanza error', () => {
  assert.equal(htmlModoLocal('<p>hola</p>'), '<p>hola</p>');
});

test('en modo local NO se cargan programador, publicador, Chromium, Redis ni sus rutas', async () => {
  const log = path.join(raiz, 'cargas-local.log');
  const r = spawnSync(process.execPath, ['--import', path.join(import.meta.dirname, 'fixtures', 'registrar-hook.mjs'), path.join(import.meta.dirname, 'fixtures', 'arrancar-app.mjs')], {
    env: { ...process.env, CLIPLAB_MODE: 'local', CARGAS_LOG: log },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).status, 200);
  const cargados = (await fs.readFile(log, 'utf8')).split('\n');
  assert.ok(cargados.some((u) => u.endsWith('/src/routes/index.js')), 'el hook no registro las cargas');
  for (const prohibido of ['/src/engine/programador.js', '/src/engine/publicador.js', '/src/engine/chromium.js', '/src/routes/programador.js', '/src/storage/redis-programador.js', '/src/engine/diagnostico.js', 'playwright-core']) {
    assert.ok(!cargados.some((u) => u.includes(prohibido)), 'se cargo ' + prohibido);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-modo-completo-'));
delete process.env.CLIPLAB_MODE;
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.MASTER_KEY = 'llave-de-prueba';
process.env.LOG_LEVEL = 'error';
delete process.env.MONGODB_URI;

const { config } = await import('../src/config/index.js');
const { createApp } = await import('../src/app.js');

const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
const AUTH = { 'x-master-key': 'llave-de-prueba' };

test.after(() => servidor.close());

async function json(ruta, opciones = {}) {
  const r = await fetch(base + ruta, opciones);
  return { status: r.status, cuerpo: await r.json() };
}

test('sin CLIPLAB_MODE: modo completo (el comportamiento de siempre)', () => {
  assert.equal(config.modo, 'completo');
  assert.equal(config.modoLocal, false);
  assert.equal(config.modoValido, true);
});

test('CLIPLAB_MODE se normaliza: local, LOCAL y " Local " activan el modo local', async () => {
  const anterior = process.env.CLIPLAB_MODE;
  try {
    let n = 0;
    for (const valor of ['local', 'LOCAL', ' Local ']) {
      process.env.CLIPLAB_MODE = valor;
      const c = (await import('../src/config/index.js?variante=' + ++n)).config;
      assert.equal(c.modo, 'local', JSON.stringify(valor));
      assert.equal(c.modoLocal, true);
      assert.equal(c.modoValido, true);
    }
    for (const valor of ['', 'completo', 'cloud']) {
      process.env.CLIPLAB_MODE = valor;
      const c = (await import('../src/config/index.js?variante=' + ++n)).config;
      assert.equal(c.modo, 'completo', JSON.stringify(valor));
      assert.equal(c.modoValido, true);
    }
    process.env.CLIPLAB_MODE = 'locla';
    const raro = (await import('../src/config/index.js?variante=' + ++n)).config;
    assert.equal(raro.modo, 'completo', 'un valor desconocido NO activa el modo local');
    assert.equal(raro.modoValido, false, 'y se marca como invalido para avisarlo al arrancar');
    assert.equal(raro.modoPedido, 'locla');
  } finally {
    if (anterior === undefined) delete process.env.CLIPLAB_MODE;
    else process.env.CLIPLAB_MODE = anterior;
  }
});

test('/api/modo dice que hay publicador', async () => {
  const { status, cuerpo } = await json('/api/modo');
  assert.equal(status, 200);
  assert.equal(cuerpo.data.modo, 'completo');
  assert.equal(cuerpo.data.publicador, true);
});

test('las rutas del programador siguen montadas (401 sin llave, no 404)', async () => {
  for (const [metodo, ruta] of [['GET', '/api/programador/cola'], ['POST', '/api/clips/abc/programar'], ['POST', '/api/clips/abc/publicar-ahora']]) {
    const { status, cuerpo } = await json(ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: metodo === 'POST' ? '{}' : undefined });
    assert.equal(status, 401, metodo + ' ' + ruta);
    assert.equal(cuerpo.success, false);
  }
  const conLlave = await json('/api/programador/cola', { headers: AUTH });
  assert.notEqual(conLlave.status, 404);
});

test('el panel conserva "Programar y Publicar" y no se marca como local', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.ok(html.includes('data-vista="publicador"'));
  assert.ok(html.includes('panel-publicador-ui'));
  assert.ok(!html.includes('data-modo="local"'));
});

test('en modo completo SI se carga el programador (comprueba que el hook de la prueba del modo local funciona)', async () => {
  const log = path.join(raiz, 'cargas-completo.log');
  const env = { ...process.env, CARGAS_LOG: log };
  delete env.CLIPLAB_MODE;
  const r = spawnSync(process.execPath, ['--import', path.join(import.meta.dirname, 'fixtures', 'registrar-hook.mjs'), path.join(import.meta.dirname, 'fixtures', 'arrancar-app.mjs')], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  const cargados = (await fs.readFile(log, 'utf8')).split('\n');
  assert.ok(cargados.some((u) => u.endsWith('/src/routes/programador.js')));
  assert.ok(cargados.some((u) => u.endsWith('/src/engine/programador.js')));
});

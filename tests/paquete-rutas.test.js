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

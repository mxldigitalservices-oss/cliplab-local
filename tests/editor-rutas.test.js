import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-editor-rutas-'));
const clips = path.join(raiz, 'clips');
const subidas = path.join(raiz, 'subidas');
const assets = path.join(raiz, 'assets');
for (const d of [clips, subidas, assets]) await fs.mkdir(d, { recursive: true });
Object.assign(process.env, {
  CLIPLAB_MODE: 'local', TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), CLIPS_DIR: clips,
  UPLOADS_DIR: subidas, ASSETS_DIR: assets, MASTER_KEY: 'llave-de-prueba', LOG_LEVEL: 'error', VIDEO_PRESET: 'ultrafast', VIDEO_CRF: '34', CPU_THREADS: '1',
});
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

const { createApp } = await import('../src/app.js');
const { store } = await import('../src/storage/store.js');
const { config } = await import('../src/config/index.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const { gestor } = await import('../src/trabajos-guion.js');
const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
test.after(async () => { servidor.close(); await fs.rm(raiz, { recursive: true, force: true }); });

async function api(ruta, { metodo = 'GET', cuerpo, auth = true } = {}) {
  const r = await fetch(base + '/api/panel' + ruta, { method: metodo, headers: { ...(auth ? { 'x-master-key': 'llave-de-prueba' } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const json = await r.json().catch(() => null);
  return { status: r.status, datos: json && json.data !== undefined ? json.data : json, error: json && json.error, crudo: json };
}
async function esperar(fn, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((ok) => setTimeout(ok, 200)); }
  throw new Error('tiempo agotado esperando');
}
const estado = async () => (await api('/guiones/estado')).datos.trabajo;
const esperarFin = () => esperar(async () => { const e = await estado(); return e.estado !== 'corriendo' ? e : null; });
const ff = (...a) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const PEDIDO = (extra = {}) => ({ fuente: { archivo: '/clips/fuente.mp4', inicio: 0, duracion: 2 }, formato: 'vertical', ...extra });

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 200, 0, 0, 0, 100, 8, 6, 0, 0, 0])]);
await fs.writeFile(path.join(subidas, 'logo.png'), png);
await fs.writeFile(path.join(assets, 'musica.mp3'), 'x');
if (hayFfmpeg) {
  assert.equal(ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=90', '-f', 'lavfi', '-i', 'sine=f=440:d=90', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(clips, 'fuente.mp4')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'color=c=red:s=200x100,format=rgba', '-frames:v', '1', path.join(subidas, 'rojo.png')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'sine=f=880:d=10', path.join(assets, 'tono.mp3')).status, 0);
} else {
  await fs.writeFile(path.join(clips, 'fuente.mp4'), 'x');
}

test('todas las rutas del editor exigen la llave maestra (401 sin ella)', async () => {
  for (const [metodo, ruta] of [['GET', '/editor/config'], ['POST', '/editor/validar'], ['POST', '/editor/previsualizar'], ['POST', '/editor/renderizar'], ['POST', '/editor/cancelar']]) {
    const r = await api(ruta, { metodo, auth: false, cuerpo: metodo === 'POST' ? {} : undefined });
    assert.equal(r.status, 401, metodo + ' ' + ruta);
  }
});

test('con CLIPLAB_MODE=local las rutas existen y el publicador sigue apagado (404)', async () => {
  assert.equal(config.modoLocal, true);
  assert.equal((await api('/editor/config')).status, 200);
  const r = await fetch(base + '/api/programador/estado', { headers: { 'x-master-key': 'llave-de-prueba' } });
  assert.equal(r.status, 404);
});

test('GET /editor/config: formatos, limites, fuentes, PNG con medidas, audios y almacenamiento; sin rutas del servidor', async () => {
  const { status, datos } = await api('/editor/config');
  assert.equal(status, 200);
  assert.deepEqual(datos.formatos.map((f) => [f.id, f.ancho, f.alto]), [['vertical', 1080, 1920], ['horizontal', 1920, 1080]]);
  assert.equal(datos.limites.maxCapas, 4);
  assert.deepEqual(datos.limites.escala, { min: 0.05, max: 1, defecto: 0.2 });
  assert.deepEqual(datos.limites.volumen, { min: 0, max: 2, defecto: 1 });
  assert.ok(datos.limites.maxRegiones >= 1 && datos.limites.rangoMaxSegundos > 0);
  assert.deepEqual(datos.limites.calidades, ['rapida', 'mejor']);
  assert.ok(datos.recursos.fuentes.some((f) => f.ruta === '/clips/fuente.mp4'));
  assert.deepEqual(datos.recursos.pngs.find((p) => p.ruta === '/uploads/logo.png'), { ruta: '/uploads/logo.png', nombre: 'logo.png', tamano: 29, origen: 'subidas', ancho: 200, alto: 100 });
  assert.ok(datos.recursos.audios.some((a) => a.ruta === '/assets/musica.mp3'));
  assert.equal(datos.almacenamiento.maxClipsStored, config.maxClipsStored);
  assert.equal(datos.trabajo.estado, 'libre');
  assert.ok(!JSON.stringify(datos).includes(raiz), 'ninguna ruta absoluta del servidor llega al panel');
});

test('POST /editor/validar: devuelve el formato { version: 1, regiones } normalizado y los pixeles para el lienzo', async () => {
  const r = await api('/editor/validar', { metodo: 'POST', cuerpo: PEDIDO({
    difuminados: [{ x: 0.9, y: 0.9, ancho: 0.2, alto: 0.1, fuerza: 99 }],
    capas: [{ archivo: '/uploads/logo.png', x: 1, y: 1, escala: 0.25, desde: 0.5, hasta: 1.5 }],
    audio: { archivo: '/assets/musica.mp3', volumen: 5, offset: 1 },
  }) });
  assert.equal(r.status, 200, r.error);
  assert.equal(r.datos.difuminados.version, 1);
  assert.equal(r.datos.difuminados.regiones[0].fuerza, 10);
  assert.equal(r.datos.difuminados.regiones[0].x, 0.8);
  assert.deepEqual([r.datos.ancho, r.datos.alto], [1080, 1920]);
  assert.equal(r.datos.audio.volumen, 2);
  assert.deepEqual(r.datos.capas[0].dim, { ancho: 200, alto: 100 });
  const k = r.datos.pixeles.capas[0];
  assert.ok(k.x + k.w <= 1080 && k.y + k.h <= 1920);
  assert.equal(r.datos.pixeles.difuminados.length, 1);
  assert.ok(!JSON.stringify(r.datos).includes(raiz));
  const h = await api('/editor/validar', { metodo: 'POST', cuerpo: PEDIDO({ formato: 'horizontal' }) });
  assert.deepEqual([h.datos.ancho, h.datos.alto], [1920, 1080]);
});

test('POST /editor/validar: 400 claro ante traversal, enlaces, formatos, rangos, topes y tipos incorrectos', async () => {
  await fs.symlink(path.join(raiz, 'tmp'), path.join(assets, 'atajo')).catch(() => {});
  const malos = [
    [PEDIDO({ fuente: { archivo: '/clips/../../etc/passwd' } }), /carpetas|formato admitido|No existe/],
    [PEDIDO({ fuente: { archivo: '/etc/passwd' } }), /carpetas de clips, subidas o assets/],
    [PEDIDO({ fuente: { archivo: '/assets/musica.mp3' } }), /no puede estar en \/assets\//],
    [PEDIDO({ capas: [{ archivo: '/uploads/../clips/fuente.mp4' }] }), /solo se admiten imagenes PNG/],
    [PEDIDO({ capas: [{ archivo: '/assets/atajo/x.png' }] }), /No existe|carpetas/],
    [PEDIDO({ capas: [{ archivo: '/uploads/no-esta.png' }] }), /No existe/],
    [PEDIDO({ audio: { archivo: '/uploads/../../etc/shadow.mp3' } }), /No existe|carpetas/],
    [PEDIDO({ audio: { archivo: '/uploads/x.exe' } }), /formato no admitido/],
    [PEDIDO({ formato: '4:3' }), /Formato no valido/],
    [PEDIDO({ modo: 'zoom' }), /Encuadre/],
    [PEDIDO({ calidad: 'ultra' }), /Calidad/],
    [PEDIDO({ fuente: { archivo: '/clips/fuente.mp4', inicio: 9, fin: 3 } }), /fin/],
    [PEDIDO({ capas: Array.from({ length: 5 }, () => ({ archivo: '/uploads/logo.png' })) }), /Demasiadas capas/],
    [PEDIDO({ difuminados: [{ x: 0, y: 0, ancho: 1, alto: 1 }] }), /tapan/],
    [{}, /fuente/],
  ];
  for (const [cuerpo, re] of malos) {
    const r = await api('/editor/validar', { metodo: 'POST', cuerpo });
    assert.equal(r.status, 400, JSON.stringify(cuerpo).slice(0, 90) + ' -> ' + r.status);
    assert.match(String(r.error), re, JSON.stringify(cuerpo).slice(0, 90));
    assert.ok(!String(r.error).includes(raiz) && !String(r.error).includes('/etc/'), 'el error no revela rutas: ' + r.error);
  }
});

test('POST /editor/previsualizar: 409 si hay un trabajo pesado en curso (no deja la peticion colgada)', async () => {
  let soltar;
  const ocupando = exclusion.ejecutar('ollama', () => new Promise((ok) => { soltar = ok; }));
  await new Promise((ok) => setTimeout(ok, 20));
  const r = await api('/editor/previsualizar', { metodo: 'POST', cuerpo: PEDIDO() });
  assert.equal(r.status, 409);
  assert.match(r.error, /trabajo pesado en curso/);
  soltar();
  await ocupando;
});

test('POST /editor/previsualizar: un fotograma JPEG con todo aplicado y errores 400 para instantes invalidos', { skip: !hayFfmpeg, timeout: 60000 }, async () => {
  const r = await api('/editor/previsualizar', { metodo: 'POST', cuerpo: PEDIDO({ t: 1, capas: [{ archivo: '/uploads/rojo.png', escala: 0.3 }], difuminados: [{ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1 }] }) });
  assert.equal(r.status, 200, r.error);
  assert.match(r.datos.imagen, /^data:image\/jpeg;base64,/);
  assert.deepEqual([r.datos.ancho, r.datos.alto], [360, 640]);
  assert.equal(exclusion.estado().ocupado, null, 'candado liberado');
  assert.equal((await api('/editor/previsualizar', { metodo: 'POST', cuerpo: PEDIDO({ t: -3 }) })).status, 400);
  assert.equal((await api('/editor/previsualizar', { metodo: 'POST', cuerpo: PEDIDO({ t: 50 }) })).status, 400);
});

test('cancelar sin render en curso es 404; con un trabajo de otro panel es 409', async () => {
  assert.equal((await api('/editor/cancelar', { metodo: 'POST', cuerpo: {} })).status, 404);
  let soltar;
  assert.equal(gestor.iniciar('guion', () => new Promise((ok) => { soltar = ok; })), true);
  const r = await api('/editor/cancelar', { metodo: 'POST', cuerpo: {} });
  assert.equal(r.status, 409);
  assert.match(r.error, /no es del editor/);
  soltar();
  await esperarFin();
});

test('POST /editor/renderizar valida antes de arrancar: 400 y el gestor sigue libre', async () => {
  const r = await api('/editor/renderizar', { metodo: 'POST', cuerpo: PEDIDO({ capas: [{ archivo: '/uploads/no-esta.png' }] }) });
  assert.equal(r.status, 400);
  assert.equal((await estado()).estado === 'corriendo', false);
});

test('render real de principio a fin: 202, progreso, clip registrado con url y archivo 1080x1920 con audio mezclado', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const antes = (store.snapshot().clips ?? []).length;
  const r = await api('/editor/renderizar', { metodo: 'POST', cuerpo: PEDIDO({
    modo: 'blur', calidad: 'rapida',
    difuminados: [{ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1, desde: 0.5, hasta: 1.5 }],
    capas: [{ archivo: '/uploads/rojo.png', x: 0.6, y: 0.8, escala: 0.2 }],
    audio: { archivo: '/assets/tono.mp3', volumen: 0.5, offset: 0.5 },
  }) });
  assert.equal(r.status, 202, r.error);
  assert.match(r.datos.id, /^e[a-z0-9]+$/);
  const fin = await esperarFin();
  assert.equal(fin.estado, 'ok', fin.error);
  assert.equal(fin.tipo, 'editor');
  assert.equal(fin.resultado.formato, 'vertical');
  const archivo = path.join(clips, 'editor-' + r.datos.id + '.mp4');
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', archivo]);
  assert.equal(p.stdout.toString().trim(), '1080,1920');
  const lista = store.snapshot().clips ?? [];
  assert.equal(lista.length, antes + 1);
  assert.ok(lista.some((c) => c.url === '/clips/editor-' + r.datos.id + '.mp4'), 'el clip se puede descargar desde "Todos los clips"');
  assert.equal(exclusion.estado().ocupado, null);
  await assert.rejects(fs.access(path.join(config.tmpDir, 'editor', r.datos.id)), 'temporales borrados');
});

test('cancelar el render en curso: detiene FFmpeg, no deja archivos ni candados, y con un trabajo en curso no arranca otro (409)', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const antes = (await fs.readdir(clips)).sort();
  const r = await api('/editor/renderizar', { metodo: 'POST', cuerpo: PEDIDO({ fuente: { archivo: '/clips/fuente.mp4', duracion: 80 }, formato: 'horizontal' }) });
  assert.equal(r.status, 202, r.error);
  await esperar(async () => { const e = await estado(); return e.estado === 'corriendo' && exclusion.estado().ocupado === 'ffmpeg'; });
  await new Promise((ok) => setTimeout(ok, 800));
  const dos = await api('/editor/renderizar', { metodo: 'POST', cuerpo: PEDIDO() });
  assert.equal(dos.status, 409);
  const c = await api('/editor/cancelar', { metodo: 'POST', cuerpo: {} });
  assert.ok([200, 202].includes(c.status), String(c.status));
  assert.equal(c.datos.cancelado, true);
  const fin = await esperarFin();
  assert.equal(fin.estado, 'cancelado');
  assert.equal(exclusion.estado().ocupado, null, 'candado liberado');
  assert.deepEqual((await fs.readdir(clips)).sort(), antes, 'ningun video a medias');
  await assert.rejects(fs.access(path.join(config.tmpDir, 'editor', r.datos.id)));
  const ps = spawnSync('sh', ['-c', "ps -eo args | grep ffmpeg | grep 'editor-" + r.datos.id + "' | grep -v grep | wc -l"]);
  assert.equal(ps.stdout.toString().trim(), '0');
  const otra = await api('/editor/renderizar', { metodo: 'POST', cuerpo: PEDIDO() });
  assert.equal(otra.status, 202, 'se puede renderizar de nuevo');
  assert.equal((await esperarFin()).estado, 'ok');
});

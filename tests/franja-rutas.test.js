import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-franja-rutas-'));
const clips = path.join(raiz, 'clips');
await fs.mkdir(clips, { recursive: true });
Object.assign(process.env, {
  CLIPLAB_MODE: 'local', TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), CLIPS_DIR: clips,
  UPLOADS_DIR: path.join(raiz, 'subidas'), MASTER_KEY: 'llave-de-prueba', LOG_LEVEL: 'error', VIDEO_PRESET: 'ultrafast', VIDEO_CRF: '34', CPU_THREADS: '1',
});
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && /drawtext/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters']).stdout?.toString() ?? '');

const { createApp } = await import('../src/app.js');
const { store } = await import('../src/storage/store.js');
const { config } = await import('../src/config/index.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
test.after(() => servidor.close());

async function api(ruta, { metodo = 'GET', cuerpo, auth = true } = {}) {
  const r = await fetch(base + '/api/panel' + ruta, { method: metodo, headers: { ...(auth ? { 'x-master-key': 'llave-de-prueba' } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const json = await r.json().catch(() => null);
  return { status: r.status, datos: json && json.data !== undefined ? json.data : json, error: json && json.error };
}
async function esperar(fn, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((ok) => setTimeout(ok, 200)); }
  throw new Error('tiempo agotado esperando');
}
const estado = async () => (await api('/guiones/estado')).datos.trabajo;
const esperarFin = () => esperar(async () => { const e = await estado(); return e.estado !== 'corriendo' ? e : null; });
const ENTRADA = (extra = {}) => ({ mercado: 'en-US', titulo: 'The goal nobody saw coming', fuente: { archivo: '/clips/fuente.mp4', duracion: 1 }, ...extra });

if (hayFfmpeg) {
  const gen = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=90', '-f', 'lavfi', '-i', 'sine=f=440:d=90', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(clips, 'fuente.mp4')]);
  assert.equal(gen.status, 0, String(gen.stderr));
}

test('todas las rutas de franja y cancelar exigen la llave maestra (401 sin ella)', async () => {
  for (const [metodo, ruta] of [['GET', '/franja/config'], ['GET', '/franja/fuentes'], ['POST', '/franja/difuminados/validar'], ['POST', '/franja/producir'], ['POST', '/produccion/cancelar']]) {
    const r = await api(ruta, { metodo, auth: false, cuerpo: metodo === 'POST' ? {} : undefined });
    assert.equal(r.status, 401, metodo + ' ' + ruta);
  }
});

test('con CLIPLAB_MODE=local las rutas existen y el publicador sigue apagado (404)', async () => {
  assert.equal(config.modoLocal, true);
  assert.equal((await api('/franja/config')).status, 200);
  const r = await fetch(base + '/api/programador/estado', { headers: { 'x-master-key': 'llave-de-prueba' } });
  assert.equal(r.status, 404);
});

test('GET /franja/config: canales, formatos, limites, almacenamiento y sugeridos del canal/formato elegido', async () => {
  const { status, datos } = await api('/franja/config');
  assert.equal(status, 200);
  assert.deepEqual(datos.canales.map((c) => c.id), ['sports', 'news']);
  assert.deepEqual(datos.formatos.map((f) => f.id), ['vertical', 'horizontal']);
  assert.equal(datos.limites.maxRegiones, 8);
  assert.equal(datos.almacenamiento.maxClipsStored, config.maxClipsStored);
  assert.equal(datos.difuminados, undefined, 'sin canal no hay sugeridos (nunca se adivina)');
  const s = (await api('/franja/config?canal=news&formato=horizontal')).datos;
  assert.equal(s.canal, 'news');
  assert.equal(s.formato, 'horizontal');
  assert.deepEqual(s.difuminados.regiones.map((r) => r.id), ['logo-sup-der', 'logo-inf-izq', 'logo-inf-der']);
  assert.equal((await api('/franja/config?canal=stories')).status, 400);
  assert.equal((await api('/franja/config?canal=musica')).status, 400);
  assert.equal((await api('/franja/config?canal=news&formato=1:1')).status, 400);
});

test('MAX_CLIPS_STORED sube a 60 por defecto', () => {
  const r = spawnSync(process.execPath, ['-e', "delete process.env.MAX_CLIPS_STORED; import('./src/config/index.js').then(m=>console.log(m.config.maxClipsStored))"], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, MAX_CLIPS_STORED: '' } });
  assert.equal(r.stdout.toString().replace(/\x1b\[[0-9;]*m/g, '').trim(), '60');
});

test('POST /franja/difuminados/validar: normaliza, avisa y rechaza; devuelve pixeles para el editor', async () => {
  const ok = await api('/franja/difuminados/validar', { metodo: 'POST', cuerpo: { canal: 'sports', formato: 'vertical', difuminados: [{ x: 0.4, y: 0.45, ancho: 0.2, alto: 0.1 }] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.datos.difuminados.regiones[0].id, 'd1');
  assert.match(ok.datos.avisos.join(' '), /zona central/);
  assert.deepEqual(Object.keys(ok.datos.pixeles[0]), ['id', 'x', 'y', 'w', 'h']);
  const sug = await api('/franja/difuminados/validar', { metodo: 'POST', cuerpo: { canal: 'sports' } });
  assert.equal(sug.datos.difuminados.regiones.length, 4, 'sin difuminados = sugeridos');
  for (const cuerpo of [{ canal: 'sports', difuminados: [{ x: 0, y: 0, ancho: 1, alto: 1 }] }, { canal: 'sports', difuminados: [{ x: 'a' }] }, { canal: 'stories' }, {}]) {
    assert.equal((await api('/franja/difuminados/validar', { metodo: 'POST', cuerpo })).status, 400, JSON.stringify(cuerpo));
  }
});

test('GET /franja/fuentes lista los videos de clips (rutas /clips/...)', async () => {
  await fs.writeFile(path.join(clips, 'otro.mp4'), 'x');
  const { datos } = await api('/franja/fuentes');
  assert.ok(datos.fuentes.some((f) => f.ruta === '/clips/otro.mp4'));
  assert.ok(datos.fuentes.every((f) => !('ruta_absoluta' in f) && !f.ruta.includes(raiz)), 'nunca rutas del servidor');
});

test('POST /franja/producir valida antes de arrancar: 400 claros y sin trabajo creado', async () => {
  const malos = [
    [{ canal: 'stories', entradas: [ENTRADA()] }, /no usa difuminados/],
    [{ canal: 'sports', entradas: [] }, /una o dos entradas/],
    [{ canal: 'sports', entradas: [ENTRADA(), ENTRADA({ mercado: 'es-US' }), ENTRADA({ mercado: 'es-US' })] }, /una o dos/],
    [{ canal: 'sports', formato: 'x', entradas: [ENTRADA()] }, /Formato no valido/],
    [{ canal: 'sports', entradas: [ENTRADA({ titulo: '' })] }, /titulo/],
    [{ canal: 'sports', entradas: [ENTRADA({ fuente: { archivo: '/clips/a.mp4', inicio: 9, fin: 3 } })] }, /fin/],
    [{ canal: 'sports', entradas: [ENTRADA({ difuminados: [{ x: 0, y: 0, ancho: 1, alto: 1 }] })] }, /tapan/],
  ];
  for (const [cuerpo, re] of malos) {
    const r = await api('/franja/producir', { metodo: 'POST', cuerpo });
    assert.equal(r.status, 400, JSON.stringify(cuerpo).slice(0, 80));
    assert.match(r.error, re);
  }
  assert.equal((await estado()).estado, 'libre');
});

test('POST /franja/producir: fuente fuera de las carpetas permitidas falla el trabajo sin tocar nada', { skip: !hayFfmpeg }, async () => {
  const r = await api('/franja/producir', { metodo: 'POST', cuerpo: { canal: 'sports', entradas: [ENTRADA({ fuente: { archivo: '/etc/passwd' } })] } });
  assert.equal(r.status, 202);
  const fin = await esperarFin();
  assert.equal(fin.estado, 'error');
  assert.match(fin.error, /carpetas de clips o de subidas/);
});

test('cancelar sin produccion en curso es 404', async () => {
  assert.equal((await api('/produccion/cancelar', { metodo: 'POST', cuerpo: {} })).status, 404);
});

test('produccion real de principio a fin: horizontal, rango y un clip registrado con ambos mercados', { skip: !hayFfmpeg }, async () => {
  const antes = store.snapshot().clips?.length ?? 0;
  const r = await api('/franja/producir', { metodo: 'POST', cuerpo: { canal: 'news', formato: 'horizontal', entradas: [ENTRADA({ fuente: { archivo: '/clips/fuente.mp4', inicio: '0:02', fin: '0:03' } }), ENTRADA({ mercado: 'es-US', titulo: 'Texas aprueba nueva ley', fuente: { archivo: '/clips/fuente.mp4', inicio: 2, duracion: 1 } })] } });
  assert.equal(r.status, 202);
  assert.ok(Array.isArray(r.datos.avisos));
  const fin = await esperarFin();
  assert.equal(fin.estado, 'ok', fin.error);
  assert.equal(fin.resultado.formato, 'horizontal');
  const archivos = (await fs.readdir(clips)).filter((n) => n.startsWith('news-') && n.endsWith('-16x9.mp4'));
  assert.equal(archivos.length, 2);
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(clips, archivos[0])]);
  assert.equal(p.stdout.toString().trim(), '1920,1080');
  const lista = store.snapshot().clips ?? [];
  assert.ok(lista.length >= antes);
  assert.equal(exclusion.estado().ocupado, null);
});

test('cancelar la produccion en curso: detiene FFmpeg, no deja archivos ni candados y el gestor queda libre', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const antes = (await fs.readdir(clips)).sort();
  const r = await api('/franja/producir', { metodo: 'POST', cuerpo: { canal: 'sports', entradas: [ENTRADA({ fuente: { archivo: '/clips/fuente.mp4', duracion: 80 } })] } });
  assert.equal(r.status, 202);
  await esperar(async () => { const e = await estado(); return e.estado === 'corriendo' && exclusion.estado().ocupado === 'ffmpeg'; });
  await new Promise((ok) => setTimeout(ok, 800));   // FFmpeg ya esta codificando
  const dos = await api('/franja/producir', { metodo: 'POST', cuerpo: { canal: 'sports', entradas: [ENTRADA()] } });
  assert.equal(dos.status, 409, 'con un trabajo en curso no arranca otro');
  const c = await api('/produccion/cancelar', { metodo: 'POST', cuerpo: {} });
  assert.ok([200, 202].includes(c.status));
  assert.equal(c.datos.cancelado, true);
  const fin = await esperarFin();
  assert.equal(fin.estado, 'cancelado');
  assert.equal(exclusion.estado().ocupado, null, 'candado liberado');
  assert.deepEqual((await fs.readdir(clips)).sort(), antes, 'ningun video a medias en la carpeta de clips');
  await assert.rejects(fs.access(path.join(config.tmpDir, 'franja', 'sports-' + r.datos.id)), 'temporales borrados');
  const ps = spawnSync('sh', ['-c', "ps -eo args | grep 'ffmpeg' | grep 'sports-' | grep -v grep | wc -l"]);
  assert.equal(ps.stdout.toString().trim(), '0', 'ya no queda ningun FFmpeg de esta produccion');
  const otra = await api('/franja/producir', { metodo: 'POST', cuerpo: { canal: 'sports', entradas: [ENTRADA()] } });
  assert.equal(otra.status, 202, 'se puede producir de nuevo sin bloqueos');
  assert.equal((await esperarFin()).estado, 'ok');
});

test('cancelar un trabajo de guion (Ollama) no se permite desde aqui: 409 claro', async () => {
  const { gestor } = await import('../src/trabajos-guion.js');
  let soltar;
  assert.equal(gestor.iniciar('guion', () => new Promise((ok) => { soltar = ok; })), true);
  const r = await api('/produccion/cancelar', { metodo: 'POST', cuerpo: {} });
  assert.equal(r.status, 409);
  assert.match(r.error, /Ollama/);
  soltar();
  await esperarFin();
});

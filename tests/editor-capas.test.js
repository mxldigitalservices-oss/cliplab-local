import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-editor-capas-'));
const dirs = { clips: path.join(raiz, 'clips'), subidas: path.join(raiz, 'subidas'), assets: path.join(raiz, 'assets') };
const fuera = path.join(raiz, 'fuera');
for (const d of [...Object.values(dirs), fuera, path.join(dirs.assets, 'banco', 'musica', 'calida')]) await fs.mkdir(d, { recursive: true });
Object.assign(process.env, { CLIPLAB_MODE: 'local', TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), CLIPS_DIR: dirs.clips, UPLOADS_DIR: dirs.subidas, ASSETS_DIR: dirs.assets, LOG_LEVEL: 'error' });

const m = await import('../src/editor-capas.js');
const { MAX_REGIONES } = await import('../src/difuminados.js');
test.after(() => fs.rm(raiz, { recursive: true, force: true }));

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function cabeceraPng(w, h) {
  const b = Buffer.alloc(33);
  FIRMA.copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b[24] = 8; b[25] = 6;
  return b;
}
const base = (extra = {}) => ({ fuente: { archivo: '/clips/a.mp4' }, ...extra });
const rechaza = (fn, re) => assert.throws(fn, (e) => { assert.equal(e.status, 400, e.message); assert.match(e.message, re); return true; });

// ---------------------------------------------------------------- estructura
test('sanearEditor: por defecto vertical, recorte, sin elementos y difuminados en el formato { version: 1, regiones }', () => {
  const s = m.sanearEditor(base());
  assert.equal(s.version, 1);
  assert.equal(s.formato, 'vertical');
  assert.equal(s.modo, 'recorte');
  assert.equal(s.preset, null);
  assert.deepEqual(s.difuminados, { version: 1, regiones: [] });
  assert.deepEqual(s.capas, []);
  assert.equal(s.audio, null);
  assert.deepEqual(s.fuente, { archivo: '/clips/a.mp4', inicio: 0, fin: null, duracion: null });
});

test('sanearEditor: los difuminados pasan por src/difuminados.js (lista, { regiones } y usarSugeridos), se acomodan y reciben ids', () => {
  const a = m.sanearEditor(base({ difuminados: [{ x: 0.9, y: 0.9, ancho: 0.2, alto: 0.2, fuerza: 99 }] })).difuminados;
  assert.equal(a.version, 1);
  assert.deepEqual([a.regiones[0].id, a.regiones[0].x, a.regiones[0].y, a.regiones[0].fuerza], ['d1', 0.8, 0.8, 10]);
  const b = m.sanearEditor(base({ difuminados: { regiones: [{ id: 'logo', x: 0, y: 0, ancho: 0.1, alto: 0.1, desde: 1, hasta: 2 }] } })).difuminados;
  assert.deepEqual([b.regiones[0].id, b.regiones[0].desde, b.regiones[0].hasta], ['logo', 1, 2]);
  const c = m.sanearEditor(base({ difuminados: { usarSugeridos: true, regiones: [{ x: 0, y: 0, ancho: 0.1, alto: 0.1 }] } })).difuminados;
  assert.equal(c.regiones.length, 1);
  rechaza(() => m.sanearEditor(base({ difuminados: Array.from({ length: MAX_REGIONES + 1 }, () => ({ x: 0, y: 0, ancho: 0.05, alto: 0.05 })) })), /Demasiados difuminados/);
  rechaza(() => m.sanearEditor(base({ difuminados: [{ x: 0, y: 0, ancho: 1, alto: 1 }] })), /tapan/);
  rechaza(() => m.sanearEditor(base({ difuminados: [{ x: 'a', y: 0, ancho: 0.1, alto: 0.1 }] })), /numero/);
});

test('sanearEditor: formato, rango, encuadre y calidad se validan sin adivinar', () => {
  assert.equal(m.sanearEditor(base({ formato: '16:9' })).formato, 'horizontal');
  rechaza(() => m.sanearEditor(base({ formato: '1:1' })), /Formato no valido/);
  rechaza(() => m.sanearEditor(base({ modo: 'zoom' })), /Encuadre no valido/);
  rechaza(() => m.sanearEditor(base({ calidad: 'lenta' })), /Calidad no valida/);
  assert.equal(m.sanearEditor(base({ calidad: 'rapida' })).preset, 'veryfast');
  assert.equal(m.sanearEditor(base({ calidad: 'mejor' })).preset, 'faster');
  const r = m.sanearEditor({ fuente: { archivo: '/clips/a.mp4', inicio: '0:10', fin: '0:25' } }).fuente;
  assert.deepEqual([r.inicio, r.fin, r.duracion], [10, 25, 15]);
  rechaza(() => m.sanearEditor({ fuente: { archivo: '/clips/a.mp4', inicio: 9, fin: 3 } }), /fin/);
  rechaza(() => m.sanearEditor({ fuente: { archivo: '/clips/a.mp4', inicio: 0, fin: 5000 } }), /maximo/);
  rechaza(() => m.sanearEditor({}), /fuente/);
  rechaza(() => m.sanearEditor({ fuente: { archivo: '' } }), /falta el archivo/);
  rechaza(() => m.sanearEditor(null), /objeto/);
});

test('capas PNG: escala, posicion y ids acotados; solo PNG; tope de capas; desde/hasta coherentes', () => {
  const s = m.sanearEditor(base({ capas: [
    { archivo: '/uploads/a.png', x: 3, y: -1, escala: 5 },
    { archivo: '/uploads/b.png', escala: 0.0001, id: 'c1' },
    { archivo: '/uploads/c.PNG', id: 'logo', etiqueta: '  Mi   logo\u0000  ', desde: '2', hasta: 4.5, activo: 'false' },
  ] }));
  assert.deepEqual(s.capas.map((k) => k.id), ['c1', 'c2', 'logo'], 'ids ausentes se asignan y el repetido (c1) pasa a c2, como en difuminados');
  assert.deepEqual([s.capas[0].x, s.capas[0].y, s.capas[0].escala], [1, 0, 1]);
  assert.equal(s.capas[1].escala, m.ESCALA.min);
  assert.equal(s.capas[2].etiqueta, 'Mi logo');
  assert.deepEqual([s.capas[2].desde, s.capas[2].hasta, s.capas[2].activo], [2, 4.5, false]);
  assert.equal(m.sanearEditor(base({ capas: [{ archivo: '/uploads/a.png' }] })).capas[0].escala, m.ESCALA.defecto);
  rechaza(() => m.sanearEditor(base({ capas: [{ archivo: '/uploads/a.jpg' }] })), /solo se admiten imagenes PNG/);
  rechaza(() => m.sanearEditor(base({ capas: [{ archivo: '/uploads/a.png', desde: 5, hasta: 5 }] })), /hasta debe ser mayor/);
  rechaza(() => m.sanearEditor(base({ capas: [{ archivo: '/uploads/a.png', x: 'izq' }] })), /numero/);
  rechaza(() => m.sanearEditor(base({ capas: [{}] })), /falta el archivo/);
  rechaza(() => m.sanearEditor(base({ capas: ['a.png'] })), /objeto/);
  rechaza(() => m.sanearEditor(base({ capas: 'a.png' })), /lista/);
  rechaza(() => m.sanearEditor(base({ capas: Array.from({ length: m.MAX_CAPAS + 1 }, () => ({ archivo: '/uploads/a.png' })) })), /Demasiadas capas/);
});

test('audio: volumen 0..2, offset 0..120, mezclar por defecto; vacio o apagado = sin audio', () => {
  const a = m.sanearEditor(base({ audio: { archivo: '/assets/banco/musica/calida/x.mp3', volumen: 9, offset: 999 } })).audio;
  assert.deepEqual([a.volumen, a.offset, a.mezclar], [m.VOLUMEN.max, m.OFFSET_AUDIO_MAX, true]);
  const b = m.sanearEditor(base({ audio: { archivo: '/uploads/x.WAV', volumen: -3, offset: -2, mezclar: false } })).audio;
  assert.deepEqual([b.volumen, b.offset, b.mezclar], [0, 0, false]);
  assert.equal(m.sanearEditor(base({ audio: { archivo: '/uploads/x.mp3' } })).audio.volumen, 1);
  for (const vacio of [null, '', undefined, { archivo: '/uploads/x.mp3', activo: false }]) assert.equal(m.sanearEditor(base({ audio: vacio })).audio, null);
  rechaza(() => m.sanearEditor(base({ audio: { archivo: '/uploads/x.exe' } })), /formato no admitido/);
  rechaza(() => m.sanearEditor(base({ audio: { volumen: 1 } })), /falta el archivo/);
  rechaza(() => m.sanearEditor(base({ audio: { archivo: '/uploads/x.mp3', volumen: 'alto' } })), /numero/);
  rechaza(() => m.sanearEditor(base({ audio: 'x.mp3' })), /objeto/);
});

test('avisos: capas, difuminados y audio que empiezan despues de terminar el tramo', () => {
  const s = m.sanearEditor({ fuente: { archivo: '/clips/a.mp4', inicio: 0, fin: 5 }, difuminados: [{ x: 0, y: 0, ancho: 0.1, alto: 0.1, desde: 6 }], capas: [{ archivo: '/uploads/a.png', desde: 9 }], audio: { archivo: '/uploads/a.mp3', offset: 7 } });
  assert.equal(s.avisos.length, 3);
  assert.match(s.avisos.join(' '), /no se vera/);
  assert.match(s.avisos.join(' '), /no se oira/);
});

// ---------------------------------------------------------------- geometria de capas
test('geometriaDeCapas: pixeles pares, dentro del cuadro y con la proporcion del PNG', () => {
  const k = (extra) => ({ archivo: 'a.png', x: 0.7, y: 0.9, escala: 0.25, activo: true, dim: { ancho: 200, alto: 100 }, ...extra });
  const [g] = m.geometriaDeCapas([k()], 1080, 1920);
  assert.deepEqual(g.px, { x: 756, y: 1728, w: 270, h: 136 });
  const [esquina] = m.geometriaDeCapas([k({ x: 1, y: 1 })], 1080, 1920);
  assert.equal(esquina.px.x + esquina.px.w, 1080);
  assert.equal(esquina.px.y + esquina.px.h, 1920);
  const [alta] = m.geometriaDeCapas([k({ escala: 1, x: 0, y: 0, dim: { ancho: 100, alto: 4000 } })], 1080, 1920);
  assert.ok(alta.px.h <= 1920 && alta.px.w <= 1080 && alta.px.w >= 2, 'un PNG altisimo se reduce para caber');
  assert.equal(m.geometriaDeCapas([k(), k({ activo: false })], 1920, 1080).length, 1, 'las capas apagadas no se dibujan');
  for (const v of Object.values(g.px)) assert.equal(v % 2, 0);
});

// ---------------------------------------------------------------- PNG y rutas seguras
test('leerDimensionesPng: lee solo la cabecera y rechaza lo que no es PNG o es enorme', async () => {
  await fs.writeFile(path.join(dirs.subidas, 'ok.png'), cabeceraPng(300, 120));
  assert.deepEqual(await m.leerDimensionesPng(path.join(dirs.subidas, 'ok.png')), { ancho: 300, alto: 120 });
  await fs.writeFile(path.join(dirs.subidas, 'falso.png'), 'esto no es un png, solo texto de relleno largo');
  await assert.rejects(m.leerDimensionesPng(path.join(dirs.subidas, 'falso.png')), /no es un PNG valido/);
  await fs.writeFile(path.join(dirs.subidas, 'corto.png'), FIRMA);
  await assert.rejects(m.leerDimensionesPng(path.join(dirs.subidas, 'corto.png')), /no es un PNG valido/);
  await fs.writeFile(path.join(dirs.subidas, 'enorme.png'), cabeceraPng(9000, 9000));
  await assert.rejects(m.leerDimensionesPng(path.join(dirs.subidas, 'enorme.png')), /maximo es 4096/);
  await fs.writeFile(path.join(dirs.subidas, 'cero.png'), cabeceraPng(0, 10));
  await assert.rejects(m.leerDimensionesPng(path.join(dirs.subidas, 'cero.png')), /PNG|maximo/);
});

test('resolverArchivo: alias /clips /uploads /assets dentro de las carpetas permitidas', async () => {
  await fs.writeFile(path.join(dirs.clips, 'v.mp4'), 'x');
  await fs.writeFile(path.join(dirs.assets, 'banco', 'musica', 'calida', 'tema.mp3'), 'x');
  const real = await fs.realpath(dirs.clips);
  assert.equal(await m.resolverArchivo('/clips/v.mp4', { dirs }), path.join(real, 'v.mp4'));
  assert.equal(await m.resolverArchivo(path.join(dirs.clips, 'v.mp4'), { dirs }), path.join(real, 'v.mp4'), 'ruta absoluta dentro de la carpeta');
  assert.match(await m.resolverArchivo('/assets/banco/musica/calida/tema.mp3', { dirs, extension: /\.mp3$/ }), /tema\.mp3$/);
  assert.match(await m.resolverArchivo('/uploads/ok.png', { dirs, extension: /\.png$/ }), /ok\.png$/);
});

test('resolverArchivo: sin traversal, sin enlaces que escapen, sin carpetas ajenas y sin filtrar rutas del servidor', async () => {
  await fs.writeFile(path.join(fuera, 'secreto.png'), cabeceraPng(10, 10));
  await fs.symlink(path.join(fuera, 'secreto.png'), path.join(dirs.subidas, 'enlace.png'));
  await fs.symlink(fuera, path.join(dirs.assets, 'atajo'));
  const intentos = [
    '/uploads/../fuera/secreto.png', '/assets/../fuera/secreto.png', '/assets/atajo/secreto.png', '/uploads/enlace.png', '/clips/../../etc/passwd',
    path.join(fuera, 'secreto.png'), '/etc/passwd', '../fuera/secreto.png', path.join(dirs.subidas, '..', 'fuera', 'secreto.png'),
  ];
  for (const intento of intentos) {
    await assert.rejects(m.resolverArchivo(intento, { dirs, extension: /\.png$/ }), (e) => {
      assert.equal(e.status, 400, intento);
      assert.ok(!e.message.includes(raiz) && !e.message.includes('/etc/'), 'el mensaje no revela rutas del servidor: ' + e.message);
      return true;
    }, intento);
  }
  await assert.rejects(m.resolverArchivo('/assets/x.mp4', { dirs, claves: ['clips', 'subidas'] }), /no puede estar en \/assets\//);
  await assert.rejects(m.resolverArchivo('/uploads/\u0000.png', { dirs }), /falta el archivo/);
  await assert.rejects(m.resolverArchivo('/uploads/' + 'a'.repeat(400) + '.png', { dirs }), /demasiado larga/);
  await assert.rejects(m.resolverArchivo('/uploads/no-existe.png', { dirs }), /No existe/);
  await assert.rejects(m.resolverArchivo('/uploads/ok.png', { dirs, extension: /\.mp3$/ }), /formato admitido/);
  await assert.rejects(m.resolverArchivo('/clips', { dirs }), /carpetas|No existe|no es un archivo/);
});

test('resolverArchivo: tope de tamano', async () => {
  await fs.writeFile(path.join(dirs.subidas, 'gordo.png'), Buffer.concat([cabeceraPng(10, 10), Buffer.alloc(2 * 1048576)]));
  await assert.rejects(m.resolverArchivo('/uploads/gordo.png', { dirs, maxBytes: 1048576 }), /pesa 2 MB/);
  assert.ok(await m.resolverArchivo('/uploads/gordo.png', { dirs, maxBytes: 5 * 1048576 }));
});

// ---------------------------------------------------------------- plan y vista publica
test('planDeEditor: valida estructura y archivos, calcula pixeles y vistaPublica no lleva rutas del servidor', async () => {
  await fs.writeFile(path.join(dirs.clips, 'fuente.mp4'), 'x');
  await fs.writeFile(path.join(dirs.subidas, 'logo.png'), cabeceraPng(200, 100));
  await fs.writeFile(path.join(dirs.assets, 'banco', 'musica', 'calida', 'musica.mp3'), 'x');
  const plan = await m.planDeEditor({
    fuente: { archivo: '/clips/fuente.mp4', inicio: 1, fin: 6 }, formato: 'horizontal', modo: 'blur',
    difuminados: [{ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1 }],
    capas: [{ archivo: '/uploads/logo.png', x: 0.9, y: 0.9, escala: 0.2 }],
    audio: { archivo: '/assets/banco/musica/calida/musica.mp3', volumen: 0.5, offset: 2 },
  }, { dirs });
  assert.equal(plan.ancho, 1920);
  assert.equal(plan.alto, 1080);
  assert.equal(plan.geometria.length, 1);
  assert.deepEqual(plan.capas[0].dim, { ancho: 200, alto: 100 });
  assert.ok(plan.capas[0].px.x + plan.capas[0].px.w <= 1920 && plan.capas[0].px.y + plan.capas[0].px.h <= 1080);
  assert.ok(plan.avisos.some((a) => /se acomodo dentro del cuadro/.test(a)), 'la capa que se salia se avisa');
  assert.match(plan.entrada, /fuente\.mp4$/);
  assert.match(plan.audio.ruta, /musica\.mp3$/);

  const vista = m.vistaPublica(plan);
  const texto = JSON.stringify(vista);
  assert.ok(!texto.includes(raiz) && !texto.includes('ruta"'), 'sin rutas absolutas');
  assert.deepEqual(vista.difuminados, { version: 1, regiones: vista.difuminados.regiones });
  assert.deepEqual(Object.keys(vista.pixeles.difuminados[0]), ['id', 'x', 'y', 'w', 'h']);
  assert.deepEqual(Object.keys(vista.pixeles.capas[0]), ['id', 'x', 'y', 'w', 'h']);
  assert.deepEqual(vista.capas[0].dim, { ancho: 200, alto: 100 }, 'el lienzo necesita la proporcion del PNG');
  assert.equal(vista.audio.archivo, '/assets/banco/musica/calida/musica.mp3');
});

test('planDeEditor: falla antes de gastar CPU si algun archivo no es valido', async () => {
  const peticion = (extra) => ({ fuente: { archivo: '/clips/fuente.mp4' }, ...extra });
  await assert.rejects(m.planDeEditor(peticion({ fuente: { archivo: '/clips/no-esta.mp4' } }), { dirs }), /No existe el video fuente/);
  await assert.rejects(m.planDeEditor(peticion({ fuente: { archivo: '/assets/fuente.mp4' } }), { dirs }), /no puede estar en \/assets\//);
  await assert.rejects(m.planDeEditor(peticion({ fuente: { archivo: '/uploads/ok.png' } }), { dirs }), /formato admitido/);
  await assert.rejects(m.planDeEditor(peticion({ capas: [{ archivo: '/uploads/falso.png' }] }), { dirs }), /no es un PNG valido/);
  await assert.rejects(m.planDeEditor(peticion({ capas: [{ archivo: '/uploads/enorme.png' }] }), { dirs }), /maximo es 4096/);
  await assert.rejects(m.planDeEditor(peticion({ capas: [{ archivo: '/uploads/enlace.png' }] }), { dirs }), /carpetas de clips, subidas o assets/);
  await assert.rejects(m.planDeEditor(peticion({ audio: { archivo: '/uploads/no-esta.mp3' } }), { dirs }), /No existe el audio/);
  await assert.rejects(m.planDeEditor(peticion({ capas: [{ archivo: '/uploads/a.jpg' }] }), { dirs }), /solo se admiten imagenes PNG/);
});

test('listarRecursos: PNG con medidas y audios de subidas y assets; ignora enlaces, ocultos, PNG danados y enormes', async () => {
  await fs.writeFile(path.join(dirs.subidas, '.oculto.png'), cabeceraPng(10, 10));
  await fs.writeFile(path.join(dirs.subidas, 'pesadisimo.png'), Buffer.concat([cabeceraPng(10, 10), Buffer.alloc(m.PNG_MAX_BYTES)]));
  const r = await m.listarRecursos({ dirs });
  const rutasPng = r.pngs.map((p) => p.ruta);
  assert.ok(rutasPng.includes('/uploads/logo.png'));
  assert.ok(!rutasPng.some((p) => /enlace|atajo|oculto|falso|enorme|pesadisimo/.test(p)), 'nada de enlaces, ocultos, danados ni pesados: ' + rutasPng);
  assert.deepEqual(r.pngs.find((p) => p.ruta === '/uploads/logo.png'), { ruta: '/uploads/logo.png', nombre: 'logo.png', tamano: 33, origen: 'subidas', ancho: 200, alto: 100 });
  assert.ok(r.audios.some((a) => a.ruta === '/assets/banco/musica/calida/musica.mp3' && a.origen === 'assets'), 'recorre el banco de musica de assets');
  assert.ok(r.audios.every((a) => !('_t' in a) && !a.ruta.includes(raiz)));
});

test('dirsPermitidos usa CLIPS_DIR, UPLOADS_DIR y ASSETS_DIR', () => {
  const d = m.dirsPermitidos();
  assert.deepEqual([d.clips, d.subidas, d.assets], [dirs.clips, dirs.subidas, dirs.assets].map((x) => path.resolve(x)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planDeFranja } from '../src/franja-plan.js';
import { construirFranja, renderizarFranja } from '../src/engine/franja-render.js';
import { producirFranja, registrarClipsFranja, resolverFuente, listarFuentes, avisoDeCapacidad, contarVideos } from '../src/franja-produccion.js';
import { exclusion } from '../src/engine/exclusion.js';

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'franja-'));
const clips = path.join(base, 'clips');
const subidas = path.join(base, 'uploads');
await fs.mkdir(clips, { recursive: true });
await fs.mkdir(subidas, { recursive: true });
await fs.writeFile(path.join(subidas, 'partido.mp4'), 'x');
await fs.writeFile(path.join(base, 'secreto.mp4'), 'x');
const dirs = [clips, subidas];

const franja = planDeFranja({ canal: 'sports', titulo: 'El golazo que nadie vio venir' });
const unArg = (args, nombre) => args[args.indexOf(nombre) + 1];

// ------------------------------------------------------------------ construirFranja (puro)
test('construirFranja recorte: tramo, 9:16, difuminados (no franjas), titulo en archivos y audio opcional', () => {
  const { args, textos } = construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja, inicio: 5, duracion: 30, modo: 'recorte', fuente: null, hilos: 2, preset: 'veryfast', crf: 24 });
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2), ['-ss', '5.000']);
  assert.equal(unArg(args, '-t'), '30.000');
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'), 'el recorte del tramo va ANTES de -i (rapido)');
  const f = unArg(args, '-filter_complex');
  assert.match(f, /scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.equal((f.match(/drawbox/g) || []).length, 0, 'ya no hay franjas solidas ni degradado escalonado');
  assert.match(f, /\[base\]split=5\[s\]\[r0\]\[r1\]\[r2\]\[r3\]/, 'un recorte por difuminado + el original');
  assert.equal((f.match(/boxblur=/g) || []).length, 4);
  assert.equal((f.match(/overlay=\d+:\d+/g) || []).length, 4);
  assert.match(f, /\[r0\]crop=\d+:\d+:\d+:\d+,scale=\d+:\d+:flags=bilinear,boxblur=\d+:2,scale=\d+:\d+:flags=bicubic\[z0\]/);
  assert.equal((f.match(/drawtext/g) || []).length, franja.titulo.lineas.length);
  assert.match(f, /box=1:boxcolor=black@0\.5:boxborderw=\d+/, 'cajon translucido del tamano del texto');
  assert.deepEqual(textos.map((t) => t.contenido), franja.titulo.lineas);
  assert.ok(args.includes('0:a:0?'), 'el audio del fuente es opcional: sin audio no falla');
  assert.equal(unArg(args, '-threads'), '2');
  assert.deepEqual(args.slice(-2), ['-y', '/v/out.mp4']);
  assert.doesNotMatch(f, /El golazo/, 'el texto nunca va dentro del filtro (solo en archivos)');
});

test('construirFranja: cada difuminado usa SU rectangulo; desde/hasta se vuelven enable; sin difuminados no hay split', () => {
  const p = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [
    { x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1, desde: 1, hasta: 2.5 },
    { x: 0.5, y: 0.7, ancho: 0.2, alto: 0.1 },
  ] });
  const f = unArg(construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja: p }).args, '-filter_complex');
  const [a, b] = p.geometria;
  assert.ok(f.includes(`crop=${a.px.w}:${a.px.h}:${a.px.x}:${a.px.y}`) && f.includes(`overlay=${a.px.x}:${a.px.y}:enable='between(t,1.000,2.500)'`));
  assert.ok(f.includes(`overlay=${b.px.x}:${b.px.y}[conblur]`) && !f.includes(`overlay=${b.px.x}:${b.px.y}:enable`));
  const sin = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [] });
  const g = unArg(construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja: sin }).args, '-filter_complex');
  assert.doesNotMatch(g, /split=|boxblur/);
  assert.match(g, /\[base\]drawtext=/);
});

test('construirFranja horizontal: 1920x1080 y modo blur con el mismo codigo', () => {
  const h = planDeFranja({ canal: 'news', titulo: 'Texas approves new transport law', formato: 'horizontal' });
  const f = unArg(construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja: h, modo: 'blur' }).args, '-filter_complex');
  assert.match(f, /scale=1920:1080:force_original_aspect_ratio=decrease/);
  assert.match(f, /scale=240:135,boxblur=4:2,scale=1920:1080/);
});

test('construirFranja blur: fondo desenfocado + primer plano; sin tramo no agrega -ss ni -t', () => {
  const { args } = construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja, modo: 'blur' });
  const f = unArg(args, '-filter_complex');
  assert.match(f, /boxblur/);
  assert.match(f, /overlay=\(W-w\)\/2:\(H-h\)\/2\[base\]/);
  assert.ok(!args.includes('-ss') && !args.includes('-t'));
  assert.throws(() => construirFranja({ entrada: 'a', salida: 'b', franja, modo: 'zoom' }), /Modo no valido/);
  assert.throws(() => construirFranja({ entrada: 'a', salida: 'b' }), /necesita/);
});

test('titulos con comillas, dos puntos y simbolos no rompen el filtro (van en archivos)', () => {
  const p = planDeFranja({ canal: 'news', titulo: `Texas: "ley" de 5% — it's 100% real; ok` });
  const { args, textos } = construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja: p });
  const f = unArg(args, '-filter_complex');
  assert.ok(!f.includes('"') && !/it's/.test(f));
  assert.ok(textos.map((t) => t.contenido).join(' ').includes('"ley"'));
});

// ------------------------------------------------------------------ resolverFuente (seguridad)
test('resolverFuente: solo archivos dentro de clips/subidas; traversal, symlinks y rutas ajenas se rechazan', async () => {
  assert.equal(await resolverFuente(path.join(subidas, 'partido.mp4'), dirs), await fs.realpath(path.join(subidas, 'partido.mp4')));
  await assert.rejects(resolverFuente(path.join(base, 'secreto.mp4'), dirs), /carpetas de clips o de subidas/);
  await assert.rejects(resolverFuente(path.join(subidas, '..', 'secreto.mp4'), dirs), /carpetas de clips o de subidas/);
  await assert.rejects(resolverFuente('/etc/passwd', dirs), /carpetas de clips o de subidas/);
  await assert.rejects(resolverFuente(path.join(subidas, 'no-existe.mp4'), dirs), /No existe el video fuente/);
  await assert.rejects(resolverFuente('', dirs), /vacia/);
  await assert.rejects(resolverFuente(subidas, dirs), /no es un archivo/);
  await fs.symlink(path.join(base, 'secreto.mp4'), path.join(subidas, 'enlace.mp4'));
  await assert.rejects(resolverFuente(path.join(subidas, 'enlace.mp4'), dirs), /carpetas de clips o de subidas/, 'un symlink no escapa de la carpeta');
});

// ------------------------------------------------------------------ producirFranja
function deps(registro, extra = {}) {
  return {
    fuente: null,
    renderizar: async (o) => { registro.push(o); await fs.writeFile(o.salida, 'video:' + path.basename(o.salida)); },
    ...extra,
  };
}
const entradas = [
  { mercado: 'es-US', titulo: 'El golazo que nadie vio venir', fuente: { archivo: path.join(subidas, 'partido.mp4'), inicio: 3, duracion: 30 } },
  { mercado: 'en-US', titulo: 'The goal nobody saw coming', fuente: { archivo: path.join(subidas, 'partido.mp4'), inicio: 3, duracion: 30 } },
];

test('producirFranja: un render por mercado (principal primero), salida en dirSalida y temporales limpios', async () => {
  const llamadas = [];
  const salida = path.join(base, 'salida1');
  const avances = [];
  const r = await producirFranja({ id: 'final', canal: 'sports', entradas, dirSalida: salida, dirTemporal: path.join(base, 'tmp1'), dirsFuente: dirs, deps: deps(llamadas), avance: (t, p) => avances.push([t, p]) });
  assert.deepEqual(r.mercados.map((m) => m.archivo), ['sports-final-en-US.mp4', 'sports-final-es-US.mp4']);
  assert.deepEqual(r.mercados.map((m) => m.url), ['/clips/sports-final-en-US.mp4', '/clips/sports-final-es-US.mp4']);
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].franja.titulo.texto, 'The goal nobody saw coming', 'cada mercado lleva SU titulo');
  assert.equal(llamadas[0].inicio, 3);
  assert.equal(llamadas[0].duracion, 30);
  assert.equal(llamadas[0].entrada, await fs.realpath(path.join(subidas, 'partido.mp4')));
  assert.equal(await fs.readFile(path.join(salida, 'sports-final-es-US.mp4'), 'utf8'), 'video:sports-final-es-US.mp4');
  await assert.rejects(fs.access(path.join(base, 'tmp1')), 'carpeta temporal eliminada');
  assert.equal(avances.at(-1)[1], 100);
});

test('producirFranja valida TODAS las fuentes antes del primer render (no gasta CPU en vano)', async () => {
  const llamadas = [];
  const malas = [entradas[0], { ...entradas[1], fuente: { archivo: path.join(base, 'secreto.mp4') } }];
  await assert.rejects(producirFranja({ id: 'x', canal: 'sports', entradas: malas, dirSalida: path.join(base, 's2'), dirTemporal: path.join(base, 't2'), dirsFuente: dirs, deps: deps(llamadas) }), /carpetas de clips o de subidas/);
  assert.equal(llamadas.length, 0);
});

test('producirFranja: canal stories o sin canal se rechazan sin renderizar', async () => {
  const llamadas = [];
  await assert.rejects(producirFranja({ id: 'x', canal: 'stories', entradas, dirsFuente: dirs, deps: deps(llamadas) }), (e) => e.status === 400);
  await assert.rejects(producirFranja({ id: 'x', entradas, dirsFuente: dirs, deps: deps(llamadas) }), (e) => e.status === 400);
  assert.equal(llamadas.length, 0);
});

test('producirFranja corre dentro del candado ffmpeg: nunca a la vez que Ollama ni otro render', async () => {
  let vistos = [];
  const d = deps([], { renderizar: async (o) => { vistos.push(exclusion.estado().ocupado); await fs.writeFile(o.salida, 'v'); } });
  const ollama = exclusion.ejecutar('ollama', async () => { await new Promise((r) => setTimeout(r, 60)); return 'ollama-listo'; });
  const franjaP = producirFranja({ id: 'lock', canal: 'sports', entradas: [entradas[1]], dirSalida: path.join(base, 's3'), dirTemporal: path.join(base, 't3'), dirsFuente: dirs, deps: d });
  assert.equal(await ollama, 'ollama-listo');
  await franjaP;
  assert.deepEqual(vistos, ['ffmpeg']);
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirFranja: cancelar corta entre mercados y limpia; un fallo de render no deja basura', async () => {
  const ac = new AbortController();
  const llamadas = [];
  const d = deps(llamadas, { renderizar: async (o) => { llamadas.push(o); await fs.writeFile(o.salida, 'v'); ac.abort(); } });
  await assert.rejects(producirFranja({ id: 'canc', canal: 'sports', entradas, dirSalida: path.join(base, 's4'), dirTemporal: path.join(base, 't4'), dirsFuente: dirs, deps: d, signal: ac.signal }), /cancelada/i);
  assert.equal(llamadas.length, 1, 'no renderiza el segundo mercado');
  await assert.rejects(fs.access(path.join(base, 't4')));
  const roto = deps([], { renderizar: async () => { throw new Error('ffmpeg fallo'); } });
  await assert.rejects(producirFranja({ id: 'roto', canal: 'news', entradas: [entradas[1]], dirSalida: path.join(base, 's5'), dirTemporal: path.join(base, 't5'), dirsFuente: dirs, deps: roto }), /ffmpeg fallo/);
  await assert.rejects(fs.access(path.join(base, 't5')));
  assert.equal(exclusion.estado().ocupado, null, 'el candado se libera tras el error');
});

test('producirFranja: cancelar DESPUES de mover el primer video borra lo ya producido (sin huerfanos) y libera el candado', async () => {
  const ac = new AbortController();
  const salida = path.join(base, 's6');
  let n = 0;
  const d = deps([], { renderizar: async (o) => { n += 1; await fs.writeFile(o.salida, 'v'); if (n === 2) ac.abort(); } });
  await assert.rejects(producirFranja({ id: 'huerfano', canal: 'sports', entradas, dirSalida: salida, dirTemporal: path.join(base, 't6'), dirsFuente: dirs, deps: d, signal: ac.signal }), /Produccion cancelada/);
  assert.deepEqual(await fs.readdir(salida), [], 'ni el primer mercado ni el segundo quedan en la carpeta de clips');
  await assert.rejects(fs.access(path.join(base, 't6')), 'temporales borrados');
  assert.equal(exclusion.estado().ocupado, null);
  assert.deepEqual(exclusion.estado().esperando, []);
});

test('producirFranja: una cancelacion que llega como otro error (FFmpeg detenido) se informa como Produccion cancelada', async () => {
  const ac = new AbortController();
  const d = deps([], { renderizar: async () => { ac.abort(); throw new Error('Proceso cancelado'); } });
  await assert.rejects(producirFranja({ id: 'kill', canal: 'sports', entradas: [entradas[1]], dirSalida: path.join(base, 's7'), dirTemporal: path.join(base, 't7'), dirsFuente: dirs, deps: d, signal: ac.signal }), (e) => e.message === 'Produccion cancelada.');
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirFranja: cancelar mientras espera el candado (otro trabajo pesado) sale sin renderizar', async () => {
  const llamadas = [];
  const ac = new AbortController();
  let soltar;
  const bloqueo = exclusion.ejecutar('ollama', () => new Promise((r) => { soltar = r; }));
  // Se espera por CONDICION y no con pausas fijas: bajo carga de CPU (otros archivos de prueba en paralelo) 20 ms no alcanzan, y si el assert
  // fallara antes de soltar() el candado quedaria tomado y todas las pruebas siguientes se colgarian.
  const hasta = async (cond) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > 10000) throw new Error('tiempo agotado esperando el candado'); await new Promise((r) => setTimeout(r, 5)); } };
  try {
    await hasta(() => exclusion.estado().ocupado === 'ollama');
    var p = producirFranja({ id: 'espera', canal: 'sports', entradas: [entradas[1]], dirSalida: path.join(base, 's8'), dirTemporal: path.join(base, 't8'), dirsFuente: dirs, deps: deps(llamadas), signal: ac.signal });
    p.catch(() => {});   // evita un rechazo sin atender mientras se espera
    await hasta(() => exclusion.estado().esperando.includes('ffmpeg'));
    assert.deepEqual(exclusion.estado().esperando, ['ffmpeg']);
    ac.abort();
    await assert.rejects(p, /Produccion cancelada/);
    assert.deepEqual(exclusion.estado().esperando, [], 'la espera cancelada sale de la fila');
  } finally {
    ac.abort();
    soltar();   // siempre se libera, pase lo que pase
    await bloqueo;
  }
  assert.equal(llamadas.length, 0);
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirFranja pasa formato, rango (inicio/fin) y difuminados propios al render', async () => {
  const llamadas = [];
  const r = await producirFranja({ id: 'fmt', canal: 'news', formato: 'horizontal', dirSalida: path.join(base, 's9'), dirTemporal: path.join(base, 't9'), dirsFuente: dirs, deps: deps(llamadas), entradas: [
    { mercado: 'en-US', titulo: 'Texas approves new transport law', fuente: { archivo: path.join(subidas, 'partido.mp4'), inicio: '0:05', fin: '0:35' }, difuminados: [{ x: 0.7, y: 0.03, ancho: 0.2, alto: 0.1 }] },
  ] });
  assert.equal(r.formato, 'horizontal');
  assert.equal(r.mercados[0].archivo, 'news-fmt-en-US-16x9.mp4');
  assert.deepEqual([llamadas[0].inicio, llamadas[0].duracion], [5, 30]);
  assert.deepEqual([llamadas[0].franja.ancho, llamadas[0].franja.alto], [1920, 1080]);
  assert.equal(llamadas[0].franja.geometria.length, 1);
});

test('resolverFuente acepta /uploads/<nombre> (solo el nombre: sin ..) y listarFuentes solo muestra videos seguros', async () => {
  assert.equal(await resolverFuente('/uploads/partido.mp4', dirs), await fs.realpath(path.join(subidas, 'partido.mp4')));
  assert.equal(await resolverFuente('/uploads/../secreto.mp4', dirs).catch((e) => e.message), 'No existe el video fuente: secreto.mp4', 'basename: nunca sale de uploads');
  await fs.writeFile(path.join(clips, 'viejo.mp4'), 'x');
  await fs.writeFile(path.join(clips, '.oculto.mp4'), 'x');
  await fs.writeFile(path.join(clips, 'notas.txt'), 'x');
  await fs.writeFile(path.join(clips, 'raro;rm -rf.mp4'), 'x');
  await fs.mkdir(path.join(clips, 'carpeta.mp4'));
  const lista = await listarFuentes({ dirs });
  assert.ok(lista.some((f) => f.ruta === '/uploads/partido.mp4' && f.origen === 'subidas'));
  assert.ok(lista.some((f) => f.ruta === '/clips/viejo.mp4' && f.origen === 'clips'));
  assert.ok(!lista.some((f) => /oculto|notas|raro|carpeta|enlace/.test(f.nombre)), 'sin ocultos, no-video, nombres raros, carpetas ni enlaces');
  assert.deepEqual(Object.keys(lista[0]).sort(), ['modificado', 'nombre', 'origen', 'ruta', 'tamano']);
  assert.equal((await listarFuentes({ dirs, limite: 1 })).length, 1);
});

test('avisoDeCapacidad: avisa cuando MAX_CLIPS_STORED haria borrar videos y contarVideos solo cuenta .mp4', async () => {
  assert.equal(avisoDeCapacidad({ actuales: 20, nuevos: 2, max: 60 }), null);
  assert.equal(avisoDeCapacidad({ actuales: 58, nuevos: 2, max: 60 }), null, 'justo en el limite cabe');
  assert.match(avisoDeCapacidad({ actuales: 59, nuevos: 2, max: 60 }), /borrara los 1 mas viejos/);
  assert.match(avisoDeCapacidad({ actuales: 30, nuevos: 2, max: 25 }), /MAX_CLIPS_STORED.*borrara los 7/);
  const dir = path.join(base, 'conteo');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'a.mp4'), 'x');
  await fs.writeFile(path.join(dir, 'b.mp4'), 'x');
  await fs.writeFile(path.join(dir, 'c.txt'), 'x');
  assert.equal(await contarVideos(dir), 2);
  assert.equal(await contarVideos(path.join(base, 'no-existe')), 0);
});

test('registrarClipsFranja: un clip con el archivo de cada mercado (url = principal) y canal', () => {
  const guardado = [];
  const store = {
    encolar: (url, extra) => { const c = { id: 'clip_1', url, extra }; guardado.push(c); return c; },
    completar: (id, datos) => { guardado.push({ id, datos }); },
  };
  const ids = registrarClipsFranja({ store, resultado: { id: 'final', canal: 'sports', formato: 'horizontal', mercados: [
    { mercado: 'es-US', titulo: 'Titulo ES', archivo: 'a', url: '/clips/sports-final-es-US.mp4', duracion: 30 },
    { mercado: 'en-US', titulo: 'Title EN', archivo: 'b', url: '/clips/sports-final-en-US.mp4', duracion: 30 },
  ] } });
  assert.deepEqual(ids, ['clip_1']);
  assert.equal(guardado[0].extra.origen, 'sports');
  const d = guardado[1].datos;
  assert.equal(d.titulo, 'Title EN');
  assert.equal(d.url, '/clips/sports-final-en-US.mp4');
  assert.deepEqual(d.archivos, { 'es-US': '/clips/sports-final-es-US.mp4', 'en-US': '/clips/sports-final-en-US.mp4' });
  assert.equal(d.canal, 'sports');
  assert.equal(d.formato, 'horizontal');
});

// ------------------------------------------------------------------ FFmpeg real (se salta si no hay ffmpeg)
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && /drawtext/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters']).stdout?.toString() ?? '');

test('FFmpeg real: sports vertical (recorte) y news horizontal (blur) salen con su tamano, audio y duracion del tramo', { skip: !hayFfmpeg && 'sin ffmpeg con drawtext' }, async () => {
  const fuenteMp4 = path.join(base, 'fuente.mp4');
  const gen = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fuenteMp4]);
  assert.equal(gen.status, 0, String(gen.stderr));
  for (const [canal, modo, formato, tam] of [['sports', 'recorte', 'vertical', [1080, 1920]], ['news', 'blur', 'horizontal', [1920, 1080]]]) {
    const salida = path.join(base, canal + '.mp4');
    await renderizarFranja({ dirTrabajo: path.join(base, 'w-' + canal), entrada: fuenteMp4, salida, franja: planDeFranja({ canal, formato, titulo: 'Titulo con gancho: "prueba" 100%', difuminados: { usarSugeridos: true, regiones: [{ x: 0.4, y: 0.5, ancho: 0.2, alto: 0.1, desde: 0.5, hasta: 1.5 }] } }), inicio: 0.5, duracion: 2, modo, hilos: 1, preset: 'ultrafast', crf: 30 });
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', salida]);
    const { streams } = JSON.parse(p.stdout.toString());
    const v = streams.find((s) => s.codec_type === 'video');
    assert.deepEqual([v.width, v.height], tam, canal);
    assert.ok(Math.abs(Number(v.duration) - 2) < 0.2, canal + ' dura ' + v.duration);
    assert.ok(streams.some((s) => s.codec_type === 'audio'), canal + ' conserva el audio');
  }
});

test('FFmpeg real: el difuminado cambia SOLO su rectangulo (sin perdida: el resto del cuadro queda identico)', { skip: !hayFfmpeg && 'sin ffmpeg con drawtext' }, async () => {
  const fuenteMp4 = path.join(base, 'fuente2.mp4');
  const gen = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fuenteMp4]);
  assert.equal(gen.status, 0, String(gen.stderr));
  const region = { x: 0.1, y: 0.4, ancho: 0.4, alto: 0.2, fuerza: 9 };
  const hacer = async (nombre, difuminados) => {
    const salida = path.join(base, nombre + '.mp4');
    await renderizarFranja({ dirTrabajo: path.join(base, 'w-' + nombre), entrada: fuenteMp4, salida, franja: planDeFranja({ canal: 'sports', titulo: 'Titulo arriba del cuadro', ancho: 270, alto: 480, difuminados }), duracion: 1, hilos: 1, preset: 'ultrafast', crf: 0 });
    return salida;
  };
  const [con, sin] = [await hacer('con-blur', [region]), await hacer('sin-blur', [])];
  const huella = (archivo, recorte) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', archivo, '-vf', 'select=eq(n\\,5),crop=' + recorte, '-frames:v', '1', '-f', 'md5', '-']).stdout.toString().trim();
  const p = planDeFranja({ canal: 'sports', titulo: 'Titulo arriba del cuadro', ancho: 270, alto: 480, difuminados: [region] }).geometria[0].px;
  assert.notEqual(huella(con, `${p.w}:${p.h}:${p.x}:${p.y}`), huella(sin, `${p.w}:${p.h}:${p.x}:${p.y}`), 'dentro del rectangulo la imagen cambio (se desenfoco)');
  assert.equal(huella(con, '270:100:0:300'), huella(sin, '270:100:0:300'), 'fuera del rectangulo (franja de abajo) queda identico: no se pierde informacion');
});

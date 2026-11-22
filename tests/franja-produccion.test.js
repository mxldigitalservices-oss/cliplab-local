import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planDeFranja } from '../src/franja-plan.js';
import { construirFranja, renderizarFranja } from '../src/engine/franja-render.js';
import { producirFranja, registrarClipsFranja, resolverFuente } from '../src/franja-produccion.js';
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
test('construirFranja recorte: tramo, 9:16, franjas, titulo en archivos y audio opcional', () => {
  const { args, textos } = construirFranja({ entrada: '/v/in.mp4', salida: '/v/out.mp4', franja, inicio: 5, duracion: 30, modo: 'recorte', fuente: null, hilos: 2, preset: 'veryfast', crf: 24 });
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2), ['-ss', '5.000']);
  assert.equal(unArg(args, '-t'), '30.000');
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'), 'el recorte del tramo va ANTES de -i (rapido)');
  const f = unArg(args, '-filter_complex');
  assert.match(f, /scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.equal((f.match(/drawbox/g) || []).length, 2 * (1 + franja.bandas[0].degradado.pasos.filter((p) => p.opacidad > 0).length));
  assert.match(f, /drawbox=x=0:y=0:w=1080:h=230:color=0x0B0B0F@0\.9:t=fill/);
  assert.equal((f.match(/drawtext/g) || []).length, franja.titulo.lineas.length);
  assert.deepEqual(textos.map((t) => t.contenido), franja.titulo.lineas);
  assert.ok(args.includes('0:a:0?'), 'el audio del fuente es opcional: sin audio no falla');
  assert.equal(unArg(args, '-threads'), '2');
  assert.deepEqual(args.slice(-2), ['-y', '/v/out.mp4']);
  assert.doesNotMatch(f, /El golazo/, 'el texto nunca va dentro del filtro (solo en archivos)');
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

test('registrarClipsFranja: un clip con el archivo de cada mercado (url = principal) y canal', () => {
  const guardado = [];
  const store = {
    encolar: (url, extra) => { const c = { id: 'clip_1', url, extra }; guardado.push(c); return c; },
    completar: (id, datos) => { guardado.push({ id, datos }); },
  };
  const ids = registrarClipsFranja({ store, resultado: { id: 'final', canal: 'sports', mercados: [
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
});

// ------------------------------------------------------------------ FFmpeg real (se salta si no hay ffmpeg)
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && /drawtext/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters']).stdout?.toString() ?? '');

test('FFmpeg real: sports (recorte) y news (blur) salen 1080x1920 con audio y duracion del tramo', { skip: !hayFfmpeg && 'sin ffmpeg con drawtext' }, async () => {
  const fuenteMp4 = path.join(base, 'fuente.mp4');
  const gen = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fuenteMp4]);
  assert.equal(gen.status, 0, String(gen.stderr));
  for (const [canal, modo] of [['sports', 'recorte'], ['news', 'blur']]) {
    const salida = path.join(base, canal + '.mp4');
    await renderizarFranja({ dirTrabajo: path.join(base, 'w-' + canal), entrada: fuenteMp4, salida, franja: planDeFranja({ canal, titulo: 'Titulo con gancho: "prueba" 100%' }), inicio: 0.5, duracion: 2, modo, hilos: 1, preset: 'ultrafast', crf: 30 });
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', salida]);
    const { streams } = JSON.parse(p.stdout.toString());
    const v = streams.find((s) => s.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [1080, 1920], canal);
    assert.ok(Math.abs(Number(v.duration) - 2) < 0.2, canal + ' dura ' + v.duration);
    assert.ok(streams.some((s) => s.codec_type === 'audio'), canal + ' conserva el audio');
  }
});

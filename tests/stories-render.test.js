import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-render-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { FICHA, parte } = await import('./fixtures/ficha-ejemplo.mjs');
const { normalizarFicha } = await import('../src/validador-ficha.js');
const { planDeParte } = await import('../src/stories-plan.js');
const { ALTO, ANCHO, argsConcat, concatenarPartes, construirParte, elegirFuente, renderizarParte, rutaEnFiltro } = await import('../src/engine/stories-render.js');
const { sintetizar } = await import('../src/voz.js');

const ficha = normalizarFicha(FICHA);
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const sonda = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', f]);
  const j = JSON.parse(r.stdout.toString());
  return { duracion: Number(j.format.duration), video: j.streams.find((s) => s.codec_type === 'video'), audio: j.streams.find((s) => s.codec_type === 'audio') };
};
const plan = (n = 4, voz = 6) => planDeParte({ parte: parte(1, { escenas: n, duracion: 3 }), ficha, mercado: 'en-US', duracionVoz: voz });

test('rutaEnFiltro: escapa ":" y comillas y usa barras normales', () => {
  assert.equal(rutaEnFiltro("C:\\Fonts\\it's.ttf"), "C\\:/Fonts/it\\'s.ttf");
});

test('construirParte: CPU libx264 con hilos limitados, 9:16, audio aac y salida con -t de la duracion total', () => {
  const p = plan();
  const { args, textos } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4', hilos: 2, preset: 'veryfast', crf: 24 });
  const val = (k) => args[args.indexOf(k) + 1];
  assert.equal(val('-c:v'), 'libx264');
  assert.equal(val('-threads'), '2');
  assert.equal(val('-filter_complex_threads'), '2');
  assert.equal(val('-preset'), 'veryfast');
  assert.equal(val('-c:a'), 'aac');
  assert.equal(args[args.lastIndexOf('-t') + 1], p.duracionTotal.toFixed(3));   // el -t de salida es el ultimo
  assert.equal(args.at(-1), '/s.mp4');
  assert.equal(args.filter((a) => a === '-i').length, 4 + 1);   // 4 fondos generados (lavfi) + la voz
  assert.equal(args.filter((a) => a === 'lavfi').length, 4);
  const fc = val('-filter_complex');
  assert.match(args.join(' '), new RegExp(`color=c=0x[0-9a-f]+:s=${ANCHO}x${ALTO}`));   // fondo generado: va en la entrada lavfi
  assert.match(fc, /concat=n=4:v=1:a=0\[base\]/);
  assert.ok(!/ffmpeg|-vf/.test(fc));
  assert.equal((fc.match(/drawtext=/g) || []).length, (fc.match(/textfile=t\d+\.txt/g) || []).length);   // todo texto va por archivo
  assert.ok(textos.length > 3);   // expediente + escenas + subtitulos
  assert.ok(textos.every((t) => /^t\d+\.txt$/.test(t.nombre)));
});

test('construirParte: el texto del guion nunca entra en la linea de filtros (va en archivos)', () => {
  const g = parte(1, { escenas: 2, duracion: 3 });
  g.tecnico[0].textoPantalla = "'; drawtext=text=PWNED:x=0 :";
  g.narracion = "He said 'hi': 100% [real]; \\ done. Another sentence follows here for the captions to split.";
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 6 });
  const { args, textos } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4' });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!fc.includes('PWNED'));
  assert.ok(textos.some((t) => t.contenido.includes('PWNED')));
});

test('construirParte: medios (imagen -> -loop, video -> -stream_loop), musica, efectos y foto suman entradas y mezcla', () => {
  const p = plan(3, 6);
  const { args } = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4', medios: ['/m/a.jpg', '/m/b.mp4', null], musica: '/m/musica.mp3', sfx: [{ ruta: '/m/w.wav', inicio: 1.5 }], foto: '/m/foto.png' });
  assert.ok(args.includes('-loop') && args.includes('-stream_loop'));
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.match(fc, /amix=inputs=3:duration=first/);
  assert.match(fc, /adelay=1500\|1500/);
  assert.match(fc, /\[foto\]overlay=/);
  assert.match(fc, /volume=0\.10/);
});

test('construirParte: sin musica ni efectos no hay amix; sin foto no hay overlay; la fuente va con fontfile escapado', () => {
  const { args } = construirParte({ plan: plan(), voz: '/v.wav', salida: '/s.mp4', fuente: 'C:/Fonts/Anton.ttf' });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!fc.includes('amix'));
  assert.ok(!fc.includes('overlay'));
  assert.match(fc, /fontfile='C\\:\/Fonts\/Anton\.ttf'/);
});

test('construirParte: efectos visuales (zoom, pan, fundido) se traducen a filtros', () => {
  const g = parte(1, { escenas: 4, duracion: 3 });
  ['zoom_in', 'zoom_out', 'pan_izq', 'fundido'].forEach((e, i) => { g.tecnico[i].efecto = e; });
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 10 });
  const fc = construirParte({ plan: p, voz: '/v.wav', salida: '/s.mp4' }).args.join(' ');
  assert.match(fc, /eval=frame/);
  assert.match(fc, /crop=1080:1920:x='\(iw-ow\)\*\(1-t\//);
  assert.match(fc, /fade=t=in/);
});

test('elegirFuente: devuelve un archivo que existe o null (drawtext usa entonces fontconfig)', async () => {
  const f = await elegirFuente({ fontsDir: path.join(raiz, 'sin-fuentes') });
  assert.ok(f === null || (await fs.stat(f)).isFile());
  const mia = path.join(raiz, 'Mia.ttf'); await fs.writeFile(mia, 'x');
  assert.equal(await elegirFuente({ fontsDir: raiz, extra: [mia] }), mia);
});

test('FFmpeg real: renderiza una parte 9:16 con voz, texto y expediente; dura lo planeado', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 120000 }, async () => {
  await fs.writeFile(path.join(raiz, 'm.onnx'), 'x');
  const voz = await sintetizar({ texto: 'In 1998 the story of Marco Silva began in Lisbon. He was a quiet kid.', mercado: 'en-US', salida: path.join(raiz, 'v1.wav'), binario: process.execPath, argsPrevios: [path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs')], modelo: path.join(raiz, 'm.onnx') });
  const p = planDeParte({ parte: parte(1, { escenas: 3, duracion: 3 }), ficha, mercado: 'en-US', duracionVoz: voz.duracionSeg });
  const salida = path.join(raiz, 'p1.mp4');
  await renderizarParte({ dirTrabajo: path.join(raiz, 'w1'), plan: p, voz: voz.archivo, salida, ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 32, fuente: await elegirFuente() });
  const s = sonda(salida);
  assert.equal(s.video.codec_name, 'h264');
  assert.deepEqual([s.video.width, s.video.height], [270, 480]);
  assert.equal(s.audio.codec_name, 'aac');
  assert.ok(Math.abs(s.duracion - p.duracionTotal) < 0.25, `${s.duracion} vs ${p.duracionTotal}`);
});

test('FFmpeg real: medios del banco (imagen, foto de ficha, musica y efecto) y concatenacion en orden', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 180000 }, async () => {
  const ff = (...a) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...a]).status, 0);
  const img = path.join(raiz, 'fondo.png'); ff('-f', 'lavfi', '-i', 'testsrc=s=640x360:d=1', '-frames:v', '1', img);
  const foto = path.join(raiz, 'foto.png'); ff('-f', 'lavfi', '-i', 'color=c=red:s=200x200:d=1', '-frames:v', '1', foto);
  const vid = path.join(raiz, 'fondo.mp4'); ff('-f', 'lavfi', '-i', 'testsrc=s=320x240:d=1:r=25', '-pix_fmt', 'yuv420p', vid);
  const mus = path.join(raiz, 'mus.wav'); ff('-f', 'lavfi', '-i', 'sine=f=220:d=2', mus);
  const fx = path.join(raiz, 'fx.wav'); ff('-f', 'lavfi', '-i', 'sine=f=880:d=0.3', fx);
  const voz = path.join(raiz, 'v2.wav'); ff('-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '5', voz);
  const tiempos = [];
  for (const n of [1, 2]) {
    const g = parte(n, { escenas: 3, duracion: 2 });
    const p = planDeParte({ parte: g, ficha: { ...ficha, foto: 'foto.png' }, mercado: 'en-US', duracionVoz: 3 + n });
    const salida = path.join(raiz, `q${n}.mp4`);
    await renderizarParte({ dirTrabajo: path.join(raiz, 'w2-' + n), plan: p, voz, salida, medios: [img, vid, null], musica: mus, sfx: [{ ruta: fx, inicio: 1 }], foto, ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 32 });
    assert.ok(Math.abs(sonda(salida).duracion - p.duracionTotal) < 0.25);
    tiempos.push(sonda(salida).duracion);
  }
  const largo = path.join(raiz, 'largo.mp4');
  await concatenarPartes([path.join(raiz, 'q1.mp4'), path.join(raiz, 'q2.mp4')], largo, { dirTrabajo: raiz });
  const s = sonda(largo);
  assert.ok(Math.abs(s.duracion - (tiempos[0] + tiempos[1])) < 0.3);
  assert.deepEqual([s.video.width, s.video.height], [270, 480]);
  assert.deepEqual((await fs.readdir(raiz)).filter((n) => n.startsWith('concat-')), []);   // la lista temporal se borra
  await assert.rejects(concatenarPartes([], largo, { dirTrabajo: raiz }), /No hay partes/);
});

test('argsConcat: une EN ORDEN con el demuxer concat y SIN recodificar (-c copy)', () => {
  const a = argsConcat('lista.txt', 'salida.mp4');
  assert.deepEqual(a.slice(a.indexOf('-f'), a.indexOf('-f') + 2), ['-f', 'concat']);
  assert.deepEqual(a.slice(a.indexOf('-c'), a.indexOf('-c') + 2), ['-c', 'copy']);
  assert.ok(!a.includes('libx264'));
  assert.equal(a.at(-1), 'salida.mp4');
});

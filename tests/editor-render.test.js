import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-editor-render-'));
const dirs = { clips: path.join(raiz, 'clips'), subidas: path.join(raiz, 'subidas'), assets: path.join(raiz, 'assets') };
for (const d of Object.values(dirs)) await fs.mkdir(d, { recursive: true });
Object.assign(process.env, {
  CLIPLAB_MODE: 'local', TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), CLIPS_DIR: dirs.clips,
  UPLOADS_DIR: dirs.subidas, ASSETS_DIR: dirs.assets, LOG_LEVEL: 'error', VIDEO_PRESET: 'ultrafast', VIDEO_CRF: '34', CPU_THREADS: '1',
});
const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

const { planDeEditor } = await import('../src/editor-capas.js');
const r = await import('../src/engine/editor-render.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const { config } = await import('../src/config/index.js');
test.after(() => fs.rm(raiz, { recursive: true, force: true }));

const ff = (...args) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
if (hayFfmpeg) {
  // fuente azul lisa con tono (para medir capas) y fuente con detalle fino (para medir el difuminado)
  assert.equal(ff('-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dirs.clips, 'azul.mp4')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920:r=30:d=4,noise=alls=80:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(dirs.clips, 'detalle-mudo.mp4')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=90', '-f', 'lavfi', '-i', 'sine=f=300:d=90', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dirs.clips, 'largo.mp4')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'color=c=red:s=200x100,format=rgba', '-frames:v', '1', path.join(dirs.subidas, 'rojo.png')).status, 0);
  assert.equal(ff('-f', 'lavfi', '-i', 'sine=f=880:d=10', path.join(dirs.assets, 'tono.mp3')).status, 0);
}
const plan = (extra = {}) => planDeEditor({ fuente: { archivo: '/clips/azul.mp4', inicio: 0, duracion: 3 }, ...extra }, { dirs });
const planFalso = async (extra = {}) => {
  await fs.writeFile(path.join(dirs.clips, 'falso.mp4'), 'x');
  return planDeEditor({ fuente: { archivo: '/clips/falso.mp4', inicio: 2, fin: 8 }, ...extra }, { dirs });
};
const audioFalso = async () => { await fs.writeFile(path.join(dirs.assets, 'tono-falso.mp3'), 'x'); };
const argsDe = (args) => args.join(' ');
const filtroDe = (args) => args[args.indexOf('-filter_complex') + 1];

// ---------------------------------------------------------------- grafo de filtros (puro)
test('construirEditor: recorte vertical sin elementos = un solo filtro de base, libx264 veryfast/faster y audio original opcional', async () => {
  const p = await planFalso({ calidad: 'rapida' });
  const { args, duracion } = r.construirEditor({ plan: p, salida: '/tmp/s.mp4', hilos: 2, crf: 24 });
  assert.equal(duracion, 6);
  assert.deepEqual(args.slice(0, 4), ['-hide_banner', '-loglevel', 'error', '-nostdin']);
  assert.equal(args[args.indexOf('-ss') + 1], '2.000');
  assert.equal(args[args.indexOf('-t') + 1], '6.000');
  assert.ok(args.indexOf('-ss') < args.indexOf('-i') && args.indexOf('-t') < args.indexOf('-i'), '-ss y -t recortan solo la fuente (van antes de -i)');
  assert.equal(filtroDe(args), '[0:v]setpts=PTS-STARTPTS,fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base];[base]format=yuv420p[vout]');
  assert.equal(args[args.indexOf('-preset') + 1], 'veryfast');
  assert.equal(args[args.indexOf('-threads') + 1], '2');
  assert.equal(args[args.indexOf('-filter_complex_threads') + 1], '2');
  assert.deepEqual(args.slice(args.indexOf('-map')), ['-map', '[vout]', '-map', '0:a:0?', ...args.slice(args.indexOf('-map') + 4)]);
  assert.equal(args.at(-1), '/tmp/s.mp4');
  assert.equal(args.at(-2), '-y');
});

test('construirEditor: el preset nunca es mas lento que "faster" (cuida la CPU) y calidad mejor = faster', async () => {
  const p = await planFalso();
  for (const lento of ['slow', 'veryslow', 'medium', 'raro']) assert.equal(r.construirEditor({ plan: p, salida: 's.mp4', preset: lento }).args[r.construirEditor({ plan: p, salida: 's.mp4', preset: lento }).args.indexOf('-preset') + 1], 'veryfast', lento);
  const mejor = await planFalso({ calidad: 'mejor' });
  const a = r.construirEditor({ plan: mejor, salida: 's.mp4' }).args;
  assert.equal(a[a.indexOf('-preset') + 1], 'faster');
  const defecto = r.construirEditor({ plan: p, salida: 's.mp4' }).args;
  assert.equal(defecto[defecto.indexOf('-preset') + 1], config.videoPreset);
  assert.deepEqual([...r.PRESETS_PERMITIDOS], ['ultrafast', 'superfast', 'veryfast', 'faster']);
});

test('construirEditor: horizontal y encuadre blur con fondo reducido antes del desenfoque', async () => {
  const p = await planFalso({ formato: 'horizontal', modo: 'blur' });
  const f = filtroDe(r.construirEditor({ plan: p, salida: 's.mp4' }).args);
  assert.match(f, /scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,scale=240:135,boxblur=4:2,scale=1920:1080/);
  assert.match(f, /\[bg\]\[fg\]overlay=\(W-w\)\/2:\(H-h\)\/2\[base\]/);
});

test('construirEditor: difuminados con enable (desde/hasta) y sin enable; capas PNG en orden con su enable y apagadas fuera', async () => {
  const p = await planFalso({
    difuminados: [{ id: 'a', x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1, fuerza: 8, desde: 1, hasta: 3 }, { id: 'b', x: 0.5, y: 0.1, ancho: 0.2, alto: 0.1 }, { id: 'c', x: 0.5, y: 0.5, ancho: 0.1, alto: 0.1, activo: false }],
    capas: [],
  });
  const f = filtroDe(r.construirEditor({ plan: p, salida: 's.mp4' }).args);
  assert.match(f, /\[base\]split=3\[s\]\[r0\]\[r1\]/, 'solo los difuminados activos (2) + el cuadro original');
  assert.match(f, /overlay=108:192:enable='between\(t,1\.000,3\.000\)'\[o0\]/);
  assert.match(f, /\[o0\]\[z1\]overlay=540:192\[conblur\]/, 'sin desde/hasta dura todo el tramo: sin enable');
  assert.match(f, /\[conblur\]format=yuv420p\[vout\]/);
  assert.doesNotMatch(f, /z2/);

  await fs.writeFile(path.join(dirs.subidas, 'p.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 200, 0, 0, 0, 100, 8, 6, 0, 0, 0])]));
  const q = await planFalso({ capas: [{ archivo: '/uploads/p.png', x: 0.1, y: 0.1, escala: 0.25, desde: 0.5, hasta: 2 }, { archivo: '/uploads/p.png', x: 0.5, y: 0.5, escala: 0.1 }, { archivo: '/uploads/p.png', activo: false }] });
  const { args } = r.construirEditor({ plan: q, salida: 's.mp4' });
  const g = filtroDe(args);
  assert.equal(args.filter((x) => x === '-i').length, 3, 'fuente + 2 capas activas (la apagada no es entrada)');
  assert.match(g, /\[1:v\]scale=270:136:flags=bicubic,format=rgba\[p0\];\[base\]\[p0\]overlay=108:192:enable='between\(t,0\.500,2\.000\)'\[c0\]/);
  assert.match(g, /\[2:v\]scale=108:54:flags=bicubic,format=rgba\[p1\];\[c0\]\[p1\]overlay=540:960\[concapas\]/, 'la ultima capa queda arriba y sin enable dura todo el tramo');
  assert.match(g, /\[concapas\]format=yuv420p\[vout\]/);
});

test('construirEditor: audio mezclado con el original, o en reemplazo (sin audio en la fuente o mezclar=false)', async () => {
  await assert.rejects(planFalso({ audio: { archivo: '/assets/no-existe.mp3' } }), /No existe el audio/, 'un audio inexistente se rechaza antes de renderizar');
  await audioFalso();
  const p = await planFalso({ audio: { archivo: '/assets/tono-falso.mp3', volumen: 0.5, offset: 1.5, mezclar: true } });
  const a = r.construirEditor({ plan: p, salida: 's.mp4', tieneAudio: true });
  assert.match(filtroDe(a.args), /\[1:a\]aresample=44100,aformat=channel_layouts=stereo,volume=0\.50,adelay=1500\|1500\[ax\];\[0:a:0\]aresample=44100,aformat=channel_layouts=stereo\[ao\];\[ao\]\[ax\]amix=inputs=2:duration=first:dropout_transition=0:normalize=0\[aout\]/);
  assert.ok(a.args.some((x, i) => x === '-map' && a.args[i + 1] === '[aout]'), 'se mapea la pista mezclada');
  assert.ok(!a.args.includes('0:a:0?'), 'ya no se mapea el audio original directo');
  assert.equal(a.args.filter((x) => x === '-i').length, 2);

  const sinAudio = r.construirEditor({ plan: p, salida: 's.mp4', tieneAudio: false });
  assert.doesNotMatch(filtroDe(sinAudio.args), /amix|0:a:0/);
  assert.match(filtroDe(sinAudio.args), /adelay=1500\|1500,apad\[aout\]/, 'reemplazo: relleno de silencio hasta el final del tramo');
  const reemplazo = await planFalso({ audio: { archivo: '/assets/tono-falso.mp3', mezclar: false } });
  assert.doesNotMatch(filtroDe(r.construirEditor({ plan: reemplazo, salida: 's.mp4', tieneAudio: true }).args), /amix|adelay/);
});

test('construirEditor: sin fin ni duracion usa lo que queda del video (duracionTotal); progreso agrega -progress', async () => {
  const sinFin = await planDeEditor({ fuente: { archivo: '/clips/falso.mp4', inicio: 5 } }, { dirs });
  assert.equal(r.construirEditor({ plan: sinFin, salida: 's.mp4' }).duracion, null);
  assert.equal(r.construirEditor({ plan: sinFin, salida: 's.mp4', duracionTotal: 12 }).duracion, 7);
  assert.equal(r.duracionDelTramo(sinFin, 3), 0);
  const largo = await planDeEditor({ fuente: { archivo: '/clips/falso.mp4', inicio: 5, duracion: 20 } }, { dirs });
  assert.equal(r.duracionDelTramo(largo, 12), 7, 'el tramo se recorta al final del video');
  const { args } = r.construirEditor({ plan: sinFin, salida: 's.mp4', progreso: true });
  assert.ok(args.includes('-progress') && args.includes('-nostats'));
  assert.throws(() => r.construirEditor({ salida: 's.mp4' }), /necesita plan y salida/);
});

test('construirVistaPrevia: un fotograma reducido a un tercio con el grafo completo y la linea de tiempo desplazada', async () => {
  const p = await planFalso({ difuminados: [{ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1, desde: 1, hasta: 3 }] });
  const v = r.construirVistaPrevia({ plan: p, salida: '/tmp/v.jpg', t: 2.5, hilos: 1 });
  assert.deepEqual([v.ancho, v.alto], [360, 640]);
  assert.equal(v.args[v.args.indexOf('-ss') + 1], '4.500', 'inicio del tramo (2) + instante (2.5)');
  assert.match(filtroDe(v.args), /setpts=PTS-STARTPTS\+2\.500\/TB/);
  assert.match(filtroDe(v.args), /enable='between\(t,1\.000,3\.000\)'/);
  assert.match(filtroDe(v.args), /scale=360:640:flags=bilinear,format=yuvj420p\[vout\]/);
  for (const x of ['-an', '-frames:v', '1']) assert.ok(v.args.includes(x), x);
  const h = r.construirVistaPrevia({ plan: await planFalso({ formato: 'horizontal' }), salida: '/tmp/v.jpg' });
  assert.deepEqual([h.ancho, h.alto], [640, 360]);
  assert.ok(!argsDe(h.args).includes('PTS-STARTPTS+'), 'en t = 0 no se desplaza');
});

// ---------------------------------------------------------------- produccion con render simulado
const sondaFalsa = (extra = {}) => async () => ({ duracion: 60, tieneAudio: true, ...extra });

test('producirEditor: dentro del candado ffmpeg, mueve el video a clips, limpia temporales y avisa de lo que corrige', async () => {
  await audioFalso();
  const p = await planFalso({ audio: { archivo: '/assets/tono-falso.mp3', mezclar: true } });
  const dirSalida = path.join(raiz, 'salida-1');
  const dirTemporal = path.join(raiz, 'trabajo-1');
  let candado = null; let progreso = [];
  const resultado = await r.producirEditor({
    id: 'prueba1', plan: p, dirSalida, dirTemporal, avance: (e, n) => progreso.push([e, n]),
    deps: {
      sondear: sondaFalsa({ tieneAudio: false, duracion: 5 }),
      renderizar: async ({ salida, tieneAudio, duracionTotal, onProgreso }) => { candado = exclusion.estado().ocupado; assert.equal(tieneAudio, false); assert.equal(duracionTotal, 5); onProgreso(0.5); await fs.writeFile(salida, 'video'); },
    },
  });
  assert.equal(candado, 'ffmpeg', 'el render corre con el candado compartido');
  assert.equal(exclusion.estado().ocupado, null, 'candado liberado al terminar');
  assert.deepEqual(await fs.readdir(dirSalida), ['editor-prueba1.mp4']);
  assert.equal(await fs.readFile(path.join(dirSalida, 'editor-prueba1.mp4'), 'utf8'), 'video');
  await assert.rejects(fs.access(dirTemporal), 'carpeta temporal borrada');
  assert.deepEqual([resultado.id, resultado.formato, resultado.url, resultado.duracion], ['prueba1', 'vertical', '/clips/editor-prueba1.mp4', 3]);
  assert.match(resultado.titulo, /^Editor: falso\.mp4$/);
  assert.ok(resultado.avisos.some((a) => /no tiene audio.*reemplaza/.test(a)));
  assert.ok(resultado.avisos.some((a) => /pasa del final del video/.test(a)), 'el tramo (hasta 8 s) pasa del final (5 s)');
  assert.ok(progreso.some(([, n]) => n === 100) && progreso.some(([, n]) => n > 3 && n < 100));
});

test('producirEditor: horizontal agrega -16x9; id y fuera de rango se rechazan antes de renderizar', async () => {
  const p = await planFalso({ formato: 'horizontal' });
  const dirSalida = path.join(raiz, 'salida-2');
  const res = await r.producirEditor({ id: 'h1', plan: p, dirSalida, dirTemporal: path.join(raiz, 'trabajo-2'), deps: { sondear: sondaFalsa(), renderizar: async ({ salida }) => fs.writeFile(salida, 'v') } });
  assert.equal(res.archivo, 'editor-h1-16x9.mp4');
  let llamado = false;
  const deps = { sondear: sondaFalsa({ duracion: 1.5 }), renderizar: async () => { llamado = true; } };
  await assert.rejects(r.producirEditor({ id: 'x', plan: p, dirSalida, deps }), /queda fuera del video fuente, que dura 1\.5 s/);
  for (const malo of ['', 'A B', '../x', 'x'.repeat(70)]) await assert.rejects(r.producirEditor({ id: malo, plan: p, dirSalida, deps }), /id del trabajo/, malo);
  assert.equal(llamado, false);
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirEditor: si el render falla no queda nada (ni video, ni temporales) y el candado se libera', async () => {
  const p = await planFalso();
  const dirSalida = path.join(raiz, 'salida-3');
  const dirTemporal = path.join(raiz, 'trabajo-3');
  await assert.rejects(r.producirEditor({ id: 'e1', plan: p, dirSalida, dirTemporal, deps: { sondear: sondaFalsa(), renderizar: async ({ salida }) => { await fs.writeFile(salida, 'a medias'); throw new Error('ffmpeg exploto'); } } }), /ffmpeg exploto/);
  assert.deepEqual(await fs.readdir(dirSalida), []);
  await assert.rejects(fs.access(dirTemporal));
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirEditor: cancelar durante el render (signal) borra lo hecho, libera el candado y lanza "Produccion cancelada."', async () => {
  const p = await planFalso();
  const dirSalida = path.join(raiz, 'salida-4');
  const dirTemporal = path.join(raiz, 'trabajo-4');
  const control = new AbortController();
  let empezo;
  const arranco = new Promise((ok) => { empezo = ok; });
  const trabajo = r.producirEditor({
    id: 'c1', plan: p, dirSalida, dirTemporal, signal: control.signal,
    deps: { sondear: sondaFalsa(), renderizar: async ({ salida, signal }) => { await fs.writeFile(salida, 'parcial'); empezo(); await new Promise((ok, no) => signal.addEventListener('abort', () => no(new Error('Proceso cancelado')))); } },
  });
  await arranco;
  control.abort();
  await assert.rejects(trabajo, /Produccion cancelada\./);
  assert.deepEqual(await fs.readdir(dirSalida), []);
  await assert.rejects(fs.access(dirTemporal));
  assert.equal(exclusion.estado().ocupado, null);
});

test('producirEditor: espera su turno si otro trabajo pesado tiene el candado (no se solapa con Ollama ni con otro render)', async () => {
  const p = await planFalso();
  let soltar;
  const ocupando = exclusion.ejecutar('ollama', () => new Promise((ok) => { soltar = ok; }));
  await new Promise((ok) => setTimeout(ok, 20));
  let corrio = false;
  const trabajo = r.producirEditor({ id: 'turno', plan: p, dirSalida: path.join(raiz, 'salida-5'), dirTemporal: path.join(raiz, 'trabajo-5'), deps: { sondear: sondaFalsa(), renderizar: async ({ salida }) => { corrio = true; await fs.writeFile(salida, 'v'); } } });
  await new Promise((ok) => setTimeout(ok, 150));
  assert.equal(corrio, false, 'mientras Ollama tiene el candado no arranca ffmpeg');
  assert.deepEqual(exclusion.estado().esperando, ['ffmpeg']);
  soltar();
  await ocupando;
  await trabajo;
  assert.equal(corrio, true);
});

test('registrarClipEditor crea UN clip listo en el store con la url del video', async () => {
  const llamadas = [];
  const store = { encolar: (url, extra) => { llamadas.push(['encolar', url, extra]); return { id: 'clip-1' }; }, completar: (id, campos) => llamadas.push(['completar', id, campos]) };
  const ids = r.registrarClipEditor({ store, resultado: { id: 'abc', titulo: 'Editor: x.mp4', url: '/clips/editor-abc.mp4', duracion: 3, formato: 'vertical' } });
  assert.deepEqual(ids, ['clip-1']);
  assert.deepEqual(llamadas[0], ['encolar', 'editor:abc', { origen: 'editor' }]);
  assert.deepEqual(llamadas[1], ['completar', 'clip-1', { titulo: 'Editor: x.mp4', url: '/clips/editor-abc.mp4', duracion: 3, proyecto: 'abc', formato: 'vertical' }]);
});

// ---------------------------------------------------------------- FFmpeg real
const info = (archivo) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', archivo]).stdout.toString());
/** Pixeles RGB (Buffer) de un recorte del video en el segundo t. */
function muestra(archivo, t, { x, y, w, h }) {
  const o = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...(t > 0 ? ['-ss', String(t)] : []), '-i', archivo, '-frames:v', '1', '-vf', `crop=${w}:${h}:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  assert.equal(o.status, 0, String(o.stderr));
  return o.stdout;
}
const rojoMedio = (buf) => { let s = 0; for (let i = 0; i < buf.length; i += 3) s += buf[i]; return s / (buf.length / 3); };
const nitidez = (buf, w) => { let s = 0; for (let i = 0; i + 3 < buf.length; i += 3) if ((i / 3 + 1) % w !== 0) s += Math.abs(buf[i + 3] - buf[i]) + Math.abs(buf[i + 4] - buf[i + 1]) + Math.abs(buf[i + 5] - buf[i + 2]); return s / (buf.length / 3); };

test('FFmpeg real: vertical 1080x1920 con capa PNG que solo se ve entre desde y hasta (enable) y el audio original conservado', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const p = await plan({ capas: [{ archivo: '/uploads/rojo.png', x: 0.5, y: 0.5, escala: 0.3, desde: 1, hasta: 2 }] });
  const salida = path.join(raiz, 'real-capa.mp4');
  await r.renderizarEditor({ dirTrabajo: path.join(raiz, 'w1'), plan: p, salida, tieneAudio: true, duracionTotal: 4 });
  const i = info(salida);
  const v = i.streams.find((s) => s.codec_type === 'video');
  assert.deepEqual([v.width, v.height], [1080, 1920]);
  assert.ok(i.streams.some((s) => s.codec_type === 'audio'), 'conserva el audio del video');
  assert.ok(Math.abs(Number(i.format.duration) - 3) < 0.25, 'duracion = tramo pedido: ' + i.format.duration);
  const k = p.capas[0].px;
  const centro = { x: k.x + k.w / 2 - 4, y: k.y + k.h / 2 - 4, w: 8, h: 8 };
  assert.ok(rojoMedio(muestra(salida, 1.5, centro)) > 150, 'dentro de desde/hasta se ve la capa roja');
  assert.ok(rojoMedio(muestra(salida, 0.4, centro)) < 40, 'antes de desde no se ve');
  assert.ok(rojoMedio(muestra(salida, 2.6, centro)) < 40, 'despues de hasta no se ve');
});

test('FFmpeg real: el difuminado solo desenfoca su rectangulo y solo entre desde y hasta', { skip: !hayFfmpeg, timeout: 120000 }, async () => {
  const fuente = { archivo: '/clips/detalle-mudo.mp4', inicio: 0, duracion: 3 };
  const sin = await planDeEditor({ fuente }, { dirs });
  const con = await planDeEditor({ fuente, difuminados: [{ x: 0.1, y: 0.3, ancho: 0.4, alto: 0.2, fuerza: 10, desde: 1, hasta: 2 }] }, { dirs });
  const a = path.join(raiz, 'real-sin.mp4');
  const b = path.join(raiz, 'real-con.mp4');
  await r.renderizarEditor({ dirTrabajo: path.join(raiz, 'w2'), plan: sin, salida: a });
  await r.renderizarEditor({ dirTrabajo: path.join(raiz, 'w3'), plan: con, salida: b });
  const g = con.geometria[0].px;
  const zona = { x: g.x + 4, y: g.y + 4, w: g.w - 8, h: g.h - 8 };
  const fuera = { x: 700, y: 1400, w: 300, h: 300 };
  const nSin = nitidez(muestra(a, 1.5, zona), zona.w);
  const nCon = nitidez(muestra(b, 1.5, zona), zona.w);
  assert.ok(nCon < nSin * 0.5, 'en su tramo el rectangulo queda desenfocado: ' + nCon + ' vs ' + nSin);
  const nAntes = nitidez(muestra(b, 0.4, zona), zona.w);
  const nAntesSin = nitidez(muestra(a, 0.4, zona), zona.w);
  assert.ok(nAntes > nAntesSin * 0.8, 'antes de desde sigue nitido: ' + nAntes + ' vs ' + nAntesSin);
  const nFuera = nitidez(muestra(b, 1.5, fuera), fuera.w);
  const nFueraSin = nitidez(muestra(a, 1.5, fuera), fuera.w);
  assert.ok(nFuera > nFueraSin * 0.8, 'el resto del cuadro no se toca: ' + nFuera + ' vs ' + nFueraSin);
});

test('FFmpeg real: horizontal 1920x1080, fondo desenfocado, audio mezclado con retraso y duracion del tramo', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const p = await plan({ formato: 'horizontal', modo: 'blur', audio: { archivo: '/assets/tono.mp3', volumen: 0.6, offset: 0.5, mezclar: true }, capas: [{ archivo: '/uploads/rojo.png', escala: 0.1 }] });
  const salida = path.join(raiz, 'real-h.mp4');
  await r.renderizarEditor({ dirTrabajo: path.join(raiz, 'w4'), plan: p, salida, tieneAudio: true, duracionTotal: 4 });
  const i = info(salida);
  const v = i.streams.find((s) => s.codec_type === 'video');
  assert.deepEqual([v.width, v.height], [1920, 1080]);
  assert.ok(i.streams.some((s) => s.codec_type === 'audio'));
  assert.ok(Math.abs(Number(i.format.duration) - 3) < 0.25);
});

test('FFmpeg real: pista de audio que REEMPLAZA a un video mudo, con silencio de relleno hasta el final del tramo', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const p = await planDeEditor({ fuente: { archivo: '/clips/detalle-mudo.mp4', inicio: 0, duracion: 3 }, audio: { archivo: '/assets/tono.mp3', volumen: 1, offset: 0, mezclar: true } }, { dirs });
  const salida = path.join(raiz, 'real-mudo.mp4');
  await r.renderizarEditor({ dirTrabajo: path.join(raiz, 'w5'), plan: p, salida, tieneAudio: false, duracionTotal: 4 });
  const i = info(salida);
  assert.ok(i.streams.some((s) => s.codec_type === 'audio'), 'el video mudo ahora tiene la pista');
  assert.ok(Math.abs(Number(i.format.duration) - 3) < 0.25);
});

test('FFmpeg real: sondearVideo mide duracion y audio; producirEditor extremo a extremo con mezcla, y limpia temporales', { skip: !hayFfmpeg, timeout: 120000 }, async () => {
  assert.deepEqual(await r.sondearVideo(path.join(dirs.clips, 'detalle-mudo.mp4')).then((x) => [Math.round(x.duracion), x.tieneAudio]), [4, false]);
  assert.deepEqual(await r.sondearVideo(path.join(dirs.clips, 'azul.mp4')).then((x) => [Math.round(x.duracion), x.tieneAudio]), [4, true]);
  assert.deepEqual(await r.sondearVideo(path.join(dirs.clips, 'no-existe.mp4')), { duracion: null, tieneAudio: null });
  const dirSalida = path.join(raiz, 'salida-real');
  const p = await plan({ audio: { archivo: '/assets/tono.mp3', volumen: 0.4, offset: 1, mezclar: true }, capas: [{ archivo: '/uploads/rojo.png' }], difuminados: [{ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1 }] });
  const seguimiento = [];
  const res = await r.producirEditor({ id: 'real1', plan: p, dirSalida, avance: (e, n) => seguimiento.push(n) });
  assert.equal(res.archivo, 'editor-real1.mp4');
  const i = info(path.join(dirSalida, res.archivo));
  assert.deepEqual([i.streams.find((s) => s.codec_type === 'video').width, i.streams.find((s) => s.codec_type === 'video').height], [1080, 1920]);
  assert.ok(seguimiento.some((n) => n > 3 && n < 100), 'el progreso real de ffmpeg llega al panel: ' + seguimiento);
  await assert.rejects(fs.access(path.join(config.tmpDir, 'editor', 'real1')), 'temporales borrados');
  assert.equal(exclusion.estado().ocupado, null);
});

test('FFmpeg real: vista previa JPEG de un fotograma con capa y difuminado, y errores claros', { skip: !hayFfmpeg, timeout: 90000 }, async () => {
  const p = await plan({ capas: [{ archivo: '/uploads/rojo.png', x: 0.5, y: 0.5, escala: 0.3, desde: 1, hasta: 2 }] });
  const v = await r.previsualizarEditor({ plan: p, t: 1.5 });
  assert.deepEqual([v.ancho, v.alto, v.t], [360, 640, 1.5]);
  assert.match(v.imagen, /^data:image\/jpeg;base64,/);
  const bytes = Buffer.from(v.imagen.split(',')[1], 'base64');
  assert.deepEqual([bytes[0], bytes[1]], [0xff, 0xd8], 'es un JPEG');
  const jpg = path.join(raiz, 'vista.jpg');
  await fs.writeFile(jpg, bytes);
  // la capa (rojo) esta en el centro de su rectangulo (a escala 1/3) cuando t esta dentro de desde/hasta, y no cuando esta fuera
  const k = p.capas[0].px;
  const c = { x: Math.round((k.x + k.w / 2) / 3) - 3, y: Math.round((k.y + k.h / 2) / 3) - 3, w: 6, h: 6 };
  assert.ok(rojoMedio(muestra(jpg, 0, c)) > 150, 'a 1.5 s la capa esta en la vista previa');
  const fuera = await r.previsualizarEditor({ plan: p, t: 0.2 });
  await fs.writeFile(jpg, Buffer.from(fuera.imagen.split(',')[1], 'base64'));
  assert.ok(rojoMedio(muestra(jpg, 0, c)) < 40, 'a 0.2 s (antes de desde) no esta');
  await assert.rejects(r.previsualizarEditor({ plan: p, t: -1 }), />= 0/);
  await assert.rejects(r.previsualizarEditor({ plan: p, t: 99 }), /pasa del final del tramo/);
  assert.equal(exclusion.estado().ocupado, null);
  assert.deepEqual((await fs.readdir(path.join(config.tmpDir, 'editor'))).filter((n) => n.startsWith('vista-')), [], 'sin carpetas temporales de vista previa');
});

test('FFmpeg real: cancelar a mitad de codificacion detiene ffmpeg, no deja archivos ni candado', { skip: !hayFfmpeg, timeout: 120000 }, async () => {
  const p = await planDeEditor({ fuente: { archivo: '/clips/largo.mp4', inicio: 0, duracion: 80 }, formato: 'horizontal', capas: [{ archivo: '/uploads/rojo.png' }] }, { dirs });
  const dirSalida = path.join(raiz, 'salida-cancelar');
  const control = new AbortController();
  const trabajo = r.producirEditor({ id: 'cancel1', plan: p, dirSalida, signal: control.signal });
  const t0 = Date.now();
  while (exclusion.estado().ocupado !== 'ffmpeg' && Date.now() - t0 < 10000) await new Promise((ok) => setTimeout(ok, 50));
  await new Promise((ok) => setTimeout(ok, 800));   // ffmpeg ya esta codificando
  control.abort();
  await assert.rejects(trabajo, /Produccion cancelada\./);
  assert.deepEqual(await fs.readdir(dirSalida), [], 'ningun video a medias');
  await assert.rejects(fs.access(path.join(config.tmpDir, 'editor', 'cancel1')));
  assert.equal(exclusion.estado().ocupado, null);
  const ps = spawnSync('sh', ['-c', "ps -eo args | grep 'ffmpeg' | grep 'cancel1' | grep -v grep | wc -l"]);
  assert.equal(ps.stdout.toString().trim(), '0');
});

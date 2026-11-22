import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-produccion-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { FICHA, NARRACION_EN, NARRACION_ES, parte } = await import('./fixtures/ficha-ejemplo.mjs');
const { normalizarFicha } = await import('../src/validador-ficha.js');
const { producirStories, registrarClips } = await import('../src/stories-produccion.js');
const { sintetizar } = await import('../src/voz.js');
const { exclusion } = await import('../src/engine/exclusion.js');
const { gestor, crearGestor } = await import('../src/trabajos-guion.js');

const FALSO = path.join(import.meta.dirname, 'fixtures', 'piper-falso.mjs');
const modelo = path.join(raiz, 'modelo.onnx');
await fs.writeFile(modelo, 'x');
const fichaEn = normalizarFicha(FICHA);
const fichaEs = normalizarFicha({ ...FICHA, mercado: 'es-US', titulo: 'El ascenso de Marco Silva' });
const guion = (narracion) => ({ partes: [parte(1, { narracion, escenas: 3, duracion: 2 }), parte(2, { narracion, escenas: 3, duracion: 2 })] });
const entradas = () => [{ mercado: 'en-US', ficha: fichaEn, guion: guion(NARRACION_EN) }, { mercado: 'es-US', ficha: fichaEs, guion: guion(NARRACION_ES) }];
const vozFalsa = (extra = {}) => (o) => sintetizar({ ...o, binario: process.execPath, argsPrevios: [FALSO], modelo, ...extra });
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Dependencias falsas: guardan lo que se les pide y crean archivos vacios. */
function falsos() {
  const reg = { voz: [], render: [], concat: [], orden: [] };
  return {
    reg,
    deps: {
      fuente: null,
      sintetizar: async (o) => { reg.voz.push(o); reg.orden.push('voz'); return vozFalsa()(o); },
      renderizar: async (o) => { reg.render.push(o); reg.orden.push('render'); await fs.writeFile(o.salida, 'video'); },
      concatenar: async (lista, salida) => { reg.concat.push({ lista, salida }); reg.orden.push('concat'); await fs.writeFile(salida, 'largo'); },
      elegir: async () => null,
      fotoDeFicha: async () => null,
    },
  };
}

test('producirStories: una voz y un render por (mercado x parte) y una concatenacion por mercado, en orden', async () => {
  const { reg, deps } = falsos();
  const salida = path.join(raiz, 'clips1');
  const progreso = [];
  const r = await producirStories({ id: 'serie1', entradas: entradas(), dirSalida: salida, dirTemporal: path.join(raiz, 't1'), deps, avance: (e, p) => progreso.push(p) });
  assert.equal(reg.voz.length, 4);
  assert.equal(reg.render.length, 4);
  assert.equal(reg.concat.length, 2);
  assert.deepEqual(reg.voz.map((v) => v.mercado), ['en-US', 'en-US', 'es-US', 'es-US']);
  assert.deepEqual(reg.concat[0].lista.map((f) => path.basename(f)), ['stories-serie1-en-us-p1.mp4', 'stories-serie1-en-us-p2.mp4']);
  assert.deepEqual(reg.concat[1].lista.map((f) => path.basename(f)), ['stories-serie1-es-us-p1.mp4', 'stories-serie1-es-us-p2.mp4']);
  assert.deepEqual((await fs.readdir(salida)).sort(), ['stories-serie1-en-us-largo.mp4', 'stories-serie1-en-us-p1.mp4', 'stories-serie1-en-us-p2.mp4', 'stories-serie1-es-us-largo.mp4', 'stories-serie1-es-us-p1.mp4', 'stories-serie1-es-us-p2.mp4']);
  assert.equal(r.mercados.length, 2);
  assert.equal(r.mercados[0].partes[0].url, '/clips/stories-serie1-en-us-p1.mp4');
  assert.ok(r.mercados[0].largo.duracion > 10);
  assert.equal(progreso.at(-1), 100);
  assert.ok(progreso.every((p, i) => i === 0 || p >= progreso[i - 1]));
  await assert.rejects(fs.stat(path.join(raiz, 't1')));   // el directorio temporal se borra
});

test('producirStories: cada render recibe el plan con la duracion REAL de la voz y la ficha del mercado', async () => {
  const { reg, deps } = falsos();
  await producirStories({ id: 'serie2', entradas: entradas(), dirSalida: path.join(raiz, 'clips2'), dirTemporal: path.join(raiz, 't2'), deps });
  const en = reg.render[0];
  const es = reg.render[2];
  assert.equal(en.plan.ficha.etiqueta, 'FILE');
  assert.equal(es.plan.ficha.etiqueta, 'EXPEDIENTE');
  assert.ok(Math.abs(en.plan.duracionTotal - (NARRACION_EN.length / 15 + 0.8)) < 0.05);
  assert.ok(en.voz.endsWith('en-US-p1.wav'));
  assert.equal(en.medios.length, en.plan.escenas.length);
});

test('producirStories: banco de medios -> fondos, efectos y musica elegidos; sin banco los fondos son null (color generado)', async () => {
  const { reg, deps } = falsos();
  const pedidos = [];
  deps.elegir = async (tipo, categoria) => { pedidos.push(tipo + '/' + categoria); return tipo === 'medios' ? '/banco/medios/fondos/f.jpg' : tipo === 'musica' ? '/banco/musica/calida/m.mp3' : categoria === 'whoosh' ? '/banco/efectos/whoosh/w.wav' : null; };
  const e = entradas();
  e[0].guion.partes[0].tecnico[1].efecto = 'zoom_in+whoosh';
  e[0].guion.partes[0].tecnico[2].efecto = 'impacto';   // categoria sin archivos -> se omite
  await producirStories({ id: 'serie3', entradas: [e[0]], dirSalida: path.join(raiz, 'clips3'), dirTemporal: path.join(raiz, 't3'), deps });
  const r0 = reg.render[0];
  assert.deepEqual(r0.medios, ['/banco/medios/fondos/f.jpg', '/banco/medios/fondos/f.jpg', '/banco/medios/fondos/f.jpg']);
  assert.equal(r0.musica, '/banco/musica/calida/m.mp3');
  assert.deepEqual(r0.sfx.map((s) => s.ruta), ['/banco/efectos/whoosh/w.wav']);
  assert.ok(pedidos.includes('efectos/impacto') && pedidos.includes('efectos/whoosh'));
  const vacio = falsos();
  await producirStories({ id: 'serie3b', entradas: [e[0]], dirSalida: path.join(raiz, 'clips3b'), dirTemporal: path.join(raiz, 't3b'), deps: vacio.deps });
  assert.deepEqual(vacio.reg.render[0].medios, [null, null, null]);
  assert.equal(vacio.reg.render[0].musica, null);
});

test('producirStories: foto de la ficha ausente del banco -> aviso y la ficha sale sin foto', async () => {
  const { reg, deps } = falsos();
  const e = entradas()[0];
  e.ficha = { ...e.ficha, foto: 'marco.jpg' };
  const r = await producirStories({ id: 'serie4', entradas: [e], dirSalida: path.join(raiz, 'clips4'), dirTemporal: path.join(raiz, 't4'), deps });
  assert.ok(r.avisos.some((a) => /marco\.jpg/.test(a)));
  assert.equal(reg.render[0].foto, null);
  const con = falsos();
  con.deps.fotoDeFicha = async (n) => '/banco/medios/fotos/' + n;
  await producirStories({ id: 'serie4b', entradas: [e], dirSalida: path.join(raiz, 'clips4b'), dirTemporal: path.join(raiz, 't4b'), deps: con.deps });
  assert.equal(con.reg.render[0].foto, '/banco/medios/fotos/marco.jpg');
});

test('producirStories: canal que no es stories, o plan invalido, se rechaza ANTES de tocar nada', async () => {
  const { reg, deps } = falsos();
  const e = entradas()[0];
  await assert.rejects(producirStories({ id: 'x', entradas: [{ ...e, ficha: { ...e.ficha, canal: 'news' } }], dirSalida: path.join(raiz, 'c5'), dirTemporal: path.join(raiz, 't5'), deps }), /stories/);
  await assert.rejects(producirStories({ id: 'x', entradas: [], deps }), /al menos un guion/);
  assert.equal(reg.orden.length, 0);
});

test('producirStories: cancelar a medias deja de producir y borra lo temporal', async () => {
  const { reg, deps } = falsos();
  const ctl = new AbortController();
  deps.sintetizar = async () => ({ duracionSeg: 5 });   // no mira la senal: la cancelacion la decide el orquestador
  deps.renderizar = async (o) => { reg.render.push(o); await fs.writeFile(o.salida, 'v'); ctl.abort(); };
  await assert.rejects(producirStories({ id: 'serie6', entradas: entradas(), dirSalida: path.join(raiz, 'c6'), dirTemporal: path.join(raiz, 't6'), deps, signal: ctl.signal }), /cancelada/i);
  assert.equal(reg.render.length, 1);
  await assert.rejects(fs.stat(path.join(raiz, 't6')));
});

test('producirStories: toma el candado; un trabajo de Ollama en curso va primero', async () => {
  const { reg, deps } = falsos();
  deps.sintetizar = async () => ({ duracionSeg: 5 });   // sin candado propio: aqui se prueba el del orquestador
  const orden = [];
  const ollama = exclusion.ejecutar('ollama', async () => { orden.push('ollama-ini'); await dormir(120); orden.push('ollama-fin'); });
  await dormir(10);
  const prod = producirStories({ id: 'serie7', entradas: [entradas()[0]], dirSalida: path.join(raiz, 'c7'), dirTemporal: path.join(raiz, 't7'), deps }).then(() => orden.push('produccion'));
  await Promise.all([ollama, prod]);
  assert.deepEqual(orden, ['ollama-ini', 'ollama-fin', 'produccion']);
  assert.ok(reg.render.length > 0);
});

const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('de punta a punta (Piper falso + FFmpeg real, 270x480): voces, partes y largo por mercado con la duracion correcta', { skip: hayFfmpeg ? false : 'sin ffmpeg', timeout: 240000 }, async () => {
  const salida = path.join(raiz, 'clips8');
  const r = await producirStories({ id: 'serie8', entradas: entradas(), dirSalida: salida, dirTemporal: path.join(raiz, 't8'), deps: { sintetizar: vozFalsa() }, render: { ancho: 270, alto: 480, hilos: 1, preset: 'ultrafast', crf: 34 } });
  const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(salida, f)]).stdout.toString());
  for (const m of r.mercados) {
    const p1 = dur(m.partes[0].archivo);
    const p2 = dur(m.partes[1].archivo);
    assert.ok(Math.abs(p1 - m.partes[0].duracion) < 0.3, `${m.mercado} p1 ${p1} vs ${m.partes[0].duracion}`);
    assert.ok(Math.abs(dur(m.largo.archivo) - (p1 + p2)) < 0.4);
  }
  assert.equal(r.mercados.length, 2);
});

// ---------------------------------------------------------------------------------------------------- registrarClips
function storeFalso() {
  const clips = [];
  return {
    clips,
    encolar: (url, extra) => { const c = { id: 'clip_' + clips.length, fuente: url, ...extra }; clips.push(c); return c; },
    completar: (id, campos) => Object.assign(clips.find((c) => c.id === id), campos, { estado: 'listo' }),
  };
}
const resultadoFalso = () => ({ id: 'serie9', mercados: ['en-US', 'es-US'].map((m) => ({ mercado: m, titulo: m === 'en-US' ? 'The Rise of Marco Silva' : 'El ascenso de Marco Silva', partes: [1, 2].map((n) => ({ n, archivo: `stories-serie9-${m.toLowerCase()}-p${n}.mp4`, url: `/clips/stories-serie9-${m.toLowerCase()}-p${n}.mp4`, duracion: 10 + n })), largo: { archivo: `stories-serie9-${m.toLowerCase()}-largo.mp4`, url: `/clips/stories-serie9-${m.toLowerCase()}-largo.mp4`, duracion: 23 } })) });

test('registrarClips: un clip por parte (archivos por mercado, url = principal) y uno por el largo', () => {
  const store = storeFalso();
  const ids = registrarClips({ store, resultado: resultadoFalso(), entradas: entradas() });
  assert.equal(ids.length, 3);
  const [p1, p2, largo] = store.clips;
  assert.equal(p1.titulo, 'The Rise of Marco Silva — Part 1');
  assert.equal(p1.url, '/clips/stories-serie9-en-us-p1.mp4');
  assert.deepEqual(p1.archivos, { 'en-US': '/clips/stories-serie9-en-us-p1.mp4', 'es-US': '/clips/stories-serie9-es-us-p1.mp4' });
  assert.equal(p1.transcripcion, NARRACION_EN);
  assert.equal(p2.parte, 2);
  assert.equal(largo.largo, true);
  assert.equal(largo.titulo, 'The Rise of Marco Silva — Full Series');
  assert.equal(largo.archivos['es-US'], '/clips/stories-serie9-es-us-largo.mp4');
  assert.ok(store.clips.every((c) => c.canal === 'stories' && c.estado === 'listo' && c.origen === 'stories' && c.serie === 'serie9'));
});

test('registrarClips: con un solo mercado (es-US) usa ese como principal', () => {
  const store = storeFalso();
  const r = resultadoFalso(); r.mercados = [r.mercados[1]];
  registrarClips({ store, resultado: r, entradas: [entradas()[1]] });
  assert.equal(store.clips[0].titulo, 'El ascenso de Marco Silva — Parte 1');
  assert.equal(store.clips.at(-1).titulo, 'El ascenso de Marco Silva — Serie completa');
  assert.deepEqual(Object.keys(store.clips[0].archivos), ['es-US']);
});

// ---------------------------------------------------------------------------------------------------- gestor
test('gestor: un solo trabajo a la vez, con estado, progreso, resultado y error', async () => {
  const g = crearGestor();
  assert.deepEqual(g.estado(), { tipo: null, estado: 'libre' });
  let suelta;
  assert.equal(g.iniciar('guion', ({ avance }) => { avance('paso 1', 40); return new Promise((ok) => { suelta = ok; }); }), true);
  assert.equal(g.iniciar('produccion', async () => 1), false);
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().etapa, g.estado().progreso], ['corriendo', 'paso 1', 40]);
  suelta({ listo: true });
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().progreso, g.estado().resultado], ['ok', 100, { listo: true }]);
  assert.equal(g.iniciar('produccion', async () => { throw new Error('boom'); }), true);
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().error], ['error', 'boom']);
  assert.equal(g.iniciar('guion', async () => 1), true);   // tras un error se puede volver a empezar
});

test('gestor: cancelar manda la senal de aborto al trabajo en curso', async () => {
  const g = crearGestor();
  g.iniciar('produccion', ({ senal }) => new Promise((_, mal) => senal.addEventListener('abort', () => mal(new Error('cancelado')))));
  await dormir(5);
  g.cancelar();
  await dormir(10);
  assert.equal(g.estado().error, 'cancelado');
  assert.ok(gestor);
});

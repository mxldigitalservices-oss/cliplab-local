import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-canales-'));
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.MASTER_KEY = 'llave-de-prueba';
process.env.LOG_LEVEL = 'error';
for (const v of ['BEAT_SECONDS', 'PUNCH_ZOOM', 'HOT_CUT_GAP', 'SEGMENT_MIN_SECONDS', 'SEGMENT_MAX_SECONDS']) delete process.env[v];

const {
  CANALES, DESTINOS, IDS_CANALES, IDS_DESTINOS, ErrorCanal,
  normalizarCanal, perfilDeCanal, destinosDeCanal, normalizarDestinos, trabajoDeCanal,
  variablesDeEntorno, validarNichosReservados, validarCatalogo,
} = await import('../src/canales.js');
const { IDS_MERCADOS } = await import('../src/mercados.js');
const { nombresEstilos } = await import('../src/estilos-subtitulos.js');
const { MODOS } = await import('../src/engine/rotacion-flujo.js');
const { sanearAjustes, ENCUADRES } = await import('../src/ajustes.js');

test('catalogo coherente (ids, espejos, dependencias, destinos y mercados existentes)', () => {
  assert.deepEqual(validarCatalogo(), []);
});

test('hay exactamente tres canales aislados: stories, sports y news', () => {
  assert.deepEqual([...IDS_CANALES], ['stories', 'sports', 'news']);
});

test('lo que cada canal pide por trabajo existe en los catalogos reales del motor', () => {
  for (const id of IDS_CANALES) {
    const t = CANALES[id].trabajo;
    assert.ok(nombresEstilos().includes(t.estiloSubtitulos), id + ': estilo de subtitulos desconocido');
    assert.ok(MODOS.includes(t.modo), id + ': modo de render desconocido');
    assert.doesNotThrow(() => sanearAjustes(t.ajustes), id + ': ajustes invalidos para sanearAjustes');
    if (t.ajustes?.encuadre) assert.ok(ENCUADRES.includes(t.ajustes.encuadre));
  }
});

test('ritmo: cada valor lo acepta config tal cual (sin que lo corrija ni lo ignore)', async () => {
  const anteriores = { ...process.env };
  try {
    let n = 0;
    for (const id of IDS_CANALES) {
      const r = CANALES[id].ritmo;
      const env = variablesDeEntorno(id);
      assert.deepEqual(Object.keys(env).sort(), ['BEAT_SECONDS', 'HOT_CUT_GAP', 'PUNCH_ZOOM', 'SEGMENT_MAX_SECONDS', 'SEGMENT_MIN_SECONDS']);
      for (const v of Object.values(env)) assert.equal(typeof v, 'string');
      Object.assign(process.env, env);
      const c = (await import('../src/config/index.js?canal=' + ++n)).config;
      assert.equal(c.beatSeconds, r.beatSeconds, id);
      assert.equal(c.punchZoom, r.punchZoom, id + ': config limita punchZoom a 1..1.4');
      assert.equal(c.hotCutGap, r.hotCutGap, id);
      assert.equal(c.segmentMinSeconds, r.segmentMinSeconds, id + ': config exige >= 5');
      assert.equal(c.segmentMaxSeconds, r.segmentMaxSeconds, id);
      assert.ok(c.segmentMaxSeconds >= c.segmentMinSeconds, id);
      assert.ok(c.segmentMaxSeconds + c.editorialPad <= c.maxClipSeconds * 2, id + ': tramo razonable frente a MAX_CLIP_SECONDS');
    }
  } finally {
    for (const v of ['BEAT_SECONDS', 'PUNCH_ZOOM', 'HOT_CUT_GAP', 'SEGMENT_MIN_SECONDS', 'SEGMENT_MAX_SECONDS']) {
      if (anteriores[v] === undefined) delete process.env[v];
      else process.env[v] = anteriores[v];
    }
  }
});

test('sports es mas rapido que news y que stories; news y sports tienen difuminados y no ficha; stories al reves', () => {
  assert.ok(CANALES.sports.ritmo.beatSeconds < CANALES.news.ritmo.beatSeconds);
  assert.ok(CANALES.sports.ritmo.beatSeconds < CANALES.stories.ritmo.beatSeconds);
  assert.equal(CANALES.stories.ficha.campos.join(','), 'foto,anio,lugar,datosClave');
  assert.equal(CANALES.stories.difuminados, null);
  assert.equal(CANALES.stories.franja, undefined, 'las franjas rigidas ya no existen');
  for (const id of ['sports', 'news']) {
    const d = CANALES[id].difuminados;
    assert.equal(d.tapaLogos, true);
    assert.equal(CANALES[id].ficha, null);
    assert.equal(CANALES[id].franja, undefined, id + ': sin franja rigida');
    assert.ok(['superior', 'inferior'].includes(d.titulo.posicion));
    assert.ok(d.titulo.caja > 0 && d.titulo.caja <= 0.8);
    for (const formato of ['vertical', 'horizontal']) {
      assert.ok(d.regiones[formato].length >= 2 && d.regiones[formato].length <= 6, id + ' ' + formato);
      for (const r of d.regiones[formato]) assert.ok(r.ancho < 0.4 && r.alto < 0.2, id + ': un difuminado de logo es chico, no una banda');
    }
  }
  assert.deepEqual(CANALES.news.rigor, { tematico: true, geografico: true });
  assert.equal(CANALES.stories.estructuraLarga, 'serie');
});

test('normalizarCanal: mayusculas y espacios valen; vacio o desconocido es ErrorCanal (400)', () => {
  assert.equal(normalizarCanal(' Stories '), 'stories');
  assert.equal(normalizarCanal('NEWS'), 'news');
  for (const v of ['', undefined, null, 'musica', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => normalizarCanal(v), (e) => e instanceof ErrorCanal && e.status === 400, JSON.stringify(v));
  }
});

test('el catalogo esta congelado y trabajoDeCanal devuelve copias editables', () => {
  assert.throws(() => { CANALES.news.trabajo.modo = 'recorte'; }, TypeError);
  assert.throws(() => { CANALES.sports.trabajo.ajustes.color = 'bn'; }, TypeError);
  assert.throws(() => { DESTINOS.facebook_reels.audiencia.edadMinima = 18; }, TypeError);
  const t = trabajoDeCanal('sports');
  t.ajustes.color = 'bn';
  t.modo = 'blur';
  assert.equal(CANALES.sports.trabajo.ajustes.color, 'vivido');
  assert.equal(CANALES.sports.trabajo.modo, 'recorte');
});

test('trabajoDeCanal: trae canal, modo, estilo y ajustes; lo que el usuario elige a mano gana', () => {
  assert.deepEqual(trabajoDeCanal('sports'), { canal: 'sports', modo: 'recorte', estiloSubtitulos: 'dinamico', ajustes: { color: 'vivido' } });
  assert.deepEqual(trabajoDeCanal('news'), { canal: 'news', modo: 'blur', estiloSubtitulos: 'clasico' });   // sin ajustes: neutro
  const manual = trabajoDeCanal('stories', { modo: 'recorte', cantidad: 3 });
  assert.equal(manual.modo, 'recorte');
  assert.equal(manual.cantidad, 3);
  assert.equal(manual.estiloSubtitulos, 'clasico');
  assert.deepEqual(trabajoDeCanal('stories', null), trabajoDeCanal('stories'));
  assert.throws(() => trabajoDeCanal('otro'), ErrorCanal);
});

test('destinos: Facebook para adultos 27+, Instagram espejo del mismo render, Shorts embudo, largo concatena', () => {
  const fb = DESTINOS.facebook_reels;
  assert.equal(fb.audiencia.edadMinima, 27);
  assert.equal(fb.formato, '9:16');
  const ig = DESTINOS.instagram_reels;
  assert.equal(ig.espejoDe, 'facebook_reels');
  assert.equal(ig.render, fb.render, 'un espejo usa el mismo render: nada de doble renderizado');
  assert.equal(DESTINOS.youtube_shorts.render, fb.render);
  assert.equal(DESTINOS.youtube_shorts.funcion, 'embudo');
  const largo = DESTINOS.youtube_long;
  assert.equal(largo.tipo, 'largo');
  assert.equal(largo.dependeDe, fb.render);
  assert.notEqual(largo.render, fb.render);
  assert.ok(largo.variantesTitulo >= 2, 'variantes de titulo/gancho');
  for (const id of IDS_DESTINOS) assert.equal(DESTINOS[id].id, id);
});

test('cada canal publica en los cuatro destinos y en los dos mercados', () => {
  for (const id of IDS_CANALES) {
    assert.deepEqual(destinosDeCanal(id).map((d) => d.id), [...IDS_DESTINOS], id);
    assert.deepEqual([...perfilDeCanal(id).mercados], [...IDS_MERCADOS], id);
  }
});

test('normalizarDestinos: texto o arreglo, sin duplicados, en orden del catalogo', () => {
  assert.deepEqual(normalizarDestinos('youtube_shorts, facebook_reels, FACEBOOK_REELS'), ['facebook_reels', 'youtube_shorts']);
  assert.deepEqual(normalizarDestinos(['youtube_long', 'instagram_reels'], 'stories'), ['instagram_reels', 'youtube_long']);
  assert.deepEqual(normalizarDestinos([], 'news', { requerido: false }), []);
});

test('normalizarDestinos: invalido, vacio o de otro canal es ErrorCanal', () => {
  assert.throws(() => normalizarDestinos('tiktok'), ErrorCanal);
  assert.throws(() => normalizarDestinos(['facebook_reels', 'x']), ErrorCanal);
  assert.throws(() => normalizarDestinos([]), ErrorCanal);
  assert.throws(() => normalizarDestinos('__proto__'), ErrorCanal);
  assert.throws(() => normalizarDestinos('facebook_reels', 'inexistente'), ErrorCanal);
});

test('nichos reservados: respeta las ranuras, limpia y quita duplicados', () => {
  assert.equal(DESTINOS.facebook_reels.ranurasReservadas, 2);
  assert.deepEqual(validarNichosReservados('facebook_reels', [' Autos  clasicos ', 'autos clasicos', 'Cocina']), ['autos clasicos', 'cocina']);
  assert.deepEqual(validarNichosReservados('facebook_reels', []), []);
  assert.deepEqual(validarNichosReservados('facebook_reels', undefined), []);
  assert.throws(() => validarNichosReservados('facebook_reels', ['a', 'b', 'c']), ErrorCanal);
  assert.throws(() => validarNichosReservados('youtube_shorts', ['a']), ErrorCanal);
  assert.throws(() => validarNichosReservados('tiktok', []), ErrorCanal);
});

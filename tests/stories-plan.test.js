import test from 'node:test';
import assert from 'node:assert/strict';
import { FICHA, guionBueno, parte, NARRACION_EN, NARRACION_ES } from './fixtures/ficha-ejemplo.mjs';
import { normalizarFicha } from '../src/validador-ficha.js';
import { COLA_SEG, ErrorProduccion, envolver, fichaEnPantalla, normalizarEfecto, planDeParte, planDeProduccion, subtitulos } from '../src/stories-plan.js';
import { ErrorCanal } from '../src/canales.js';

const ficha = normalizarFicha(FICHA);
const fichaEs = normalizarFicha({ ...FICHA, mercado: 'es-US' });

test('normalizarEfecto: visual y sonido separados; sin ruta posible; vacio = nada', () => {
  assert.deepEqual(normalizarEfecto('zoom_in'), { visual: 'zoom_in', sonido: null });
  assert.deepEqual(normalizarEfecto('Zoom In + Whoosh'), { visual: 'zoom_in', sonido: 'whoosh' });
  assert.deepEqual(normalizarEfecto('whoosh, pan izq'), { visual: 'pan_izq', sonido: 'whoosh' });
  assert.deepEqual(normalizarEfecto('Fade'), { visual: 'fundido', sonido: null });
  assert.deepEqual(normalizarEfecto('golpe_seco'), { visual: null, sonido: 'golpe-seco' });
  assert.deepEqual(normalizarEfecto(undefined), { visual: null, sonido: null });
  assert.match(normalizarEfecto('../../etc/passwd').sonido ?? '', /^[a-z0-9-]*$/);   // las barras separan: nunca queda una ruta
  assert.equal(normalizarEfecto('x'.repeat(60)).sonido, null);
});

test('envolver: palabras enteras, maximo de lineas, "..." si sobra', () => {
  assert.deepEqual(envolver('MARCO SILVA LISBON 1998', 18, 3), ['MARCO SILVA LISBON', '1998']);
  assert.deepEqual(envolver('', 10), []);
  const largo = envolver('uno dos tres cuatro cinco seis siete ocho nueve diez', 10, 2);
  assert.equal(largo.length, 2);
  assert.ok(largo[1].endsWith('...'));
  assert.ok(envolver('palabraenormesinespacios', 10, 2)[0].length >= 10);
});

test('subtitulos: cubren la voz en orden, sin solaparse, y cada frase cabe en 2 lineas de 26', () => {
  const s = subtitulos(NARRACION_EN, 12);
  assert.ok(s.length >= 3);
  assert.equal(s[0].inicio, 0.15);
  assert.equal(s.at(-1).fin, 12);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].inicio >= s[i - 1].fin - 0.002 && s[i].fin > s[i].inicio, String(i));
  for (const f of s) { const l = f.texto.split('\n'); assert.ok(l.length <= 2 && l.every((x) => x.length <= 28), f.texto); }
  assert.deepEqual(subtitulos('', 5), []);
});

test('fichaEnPantalla: campos de CANALES.stories.ficha (anio, lugar, datos) y etiquetas por idioma', () => {
  const en = fichaEnPantalla(ficha, 'en-US');
  assert.equal(en.etiqueta, 'FILE');
  assert.equal(en.nombre, 'Marco Silva');
  assert.deepEqual(en.lineas, ['YEAR: 1998', 'PLACE: Lisbon, Portugal', 'KEY FACTS: 12 goals']);
  assert.equal(en.segundos, 4);
  const es = fichaEnPantalla(fichaEs, 'es-US');
  assert.equal(es.etiqueta, 'EXPEDIENTE');
  assert.deepEqual(es.lineas, ['AÑO: 1998', 'LUGAR: Lisbon, Portugal', 'DATOS CLAVE: 12 goals']);
});

test('fichaEnPantalla: sin hechos que mostrar y sin foto -> null; con foto se conserva; nombre cae al titulo', () => {
  const vacia = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'dato', valor: 'x' }, { tipo: 'cifra', valor: '' + 5 }].slice(0, 1) });
  assert.ok(fichaEnPantalla(vacia, 'en-US').lineas.length === 1);
  const soloPersona = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'persona', valor: 'Ana' }] });
  assert.equal(fichaEnPantalla(soloPersona, 'en-US'), null);
  assert.equal(fichaEnPantalla({ ...soloPersona, foto: 'ana.jpg' }, 'en-US').foto, 'ana.jpg');
  const sinPersona = normalizarFicha({ ...FICHA, hechos: [{ tipo: 'lugar', valor: 'Lima' }] });
  assert.equal(fichaEnPantalla(sinPersona, 'en-US').nombre, 'The Rise of Marco Silva');
});

test('planDeParte: las escenas se reescalan a la voz real (+cola) y suman exactamente la duracion total', () => {
  const p = planDeParte({ parte: parte(1, { escenas: 8, duracion: 6 }), ficha, mercado: 'en-US', duracionVoz: 12 });
  assert.equal(p.duracionTotal, 12 + COLA_SEG);
  assert.equal(p.escenas.length, 8);
  assert.ok(Math.abs(p.escenas.reduce((s, e) => s + e.duracion, 0) - p.duracionTotal) < 0.01);
  assert.equal(p.escenas[0].inicio, 0);
  for (let i = 1; i < 8; i++) assert.ok(Math.abs(p.escenas[i].inicio - (p.escenas[i - 1].inicio + p.escenas[i - 1].duracion)) < 0.01);
  assert.ok(p.avisos.length === 1 && /reescalaron/.test(p.avisos[0]));   // 48 s de guion -> 12.8 s de voz
  assert.ok(p.subtitulos.length > 0 && p.ficha.nombre === 'Marco Silva');
});

test('planDeParte: efecto ausente -> el ritmo rota zoom_in, pan_der, zoom_out, pan_izq; el efecto del guion manda', () => {
  const g = parte(1, { escenas: 5, duracion: 3 });
  g.tecnico.forEach((e) => { delete e.efecto; });
  g.tecnico[1].efecto = 'fade + whoosh';
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 14 });
  assert.deepEqual(p.escenas.map((e) => e.visual), ['zoom_in', 'fundido', 'zoom_out', 'pan_izq', 'zoom_in']);
  assert.equal(p.escenas[1].sonido, 'whoosh');
});

test('planDeParte: sin escenas, sin voz o sin duraciones -> ErrorProduccion (400)', () => {
  const base = { ficha, mercado: 'en-US', duracionVoz: 10 };
  assert.throws(() => planDeParte({ ...base, parte: { n: 1, narracion: 'x', tecnico: [] } }), ErrorProduccion);
  assert.throws(() => planDeParte({ ...base, parte: parte(1), duracionVoz: 0 }), /duracion de la voz/);
  const sin = parte(1); sin.tecnico.forEach((e) => { e.duracionSeg = 0; });
  assert.throws(() => planDeParte({ ...base, parte: sin }), /no tienen duracion/);
  assert.ok(new ErrorProduccion('x') instanceof ErrorCanal);
});

test('planDeParte: nunca hay escenas de menos de 0.6 s y el total no se pasa', () => {
  const g = parte(1, { escenas: 20, duracion: 0.1 });
  const p = planDeParte({ parte: g, ficha, mercado: 'en-US', duracionVoz: 5 });
  assert.ok(p.escenas.every((e) => e.duracion >= 0.6));
});

test('planDeProduccion: nombres de archivo, mercado principal primero y totales', () => {
  const g = guionBueno();
  const plan = planDeProduccion({ id: 'abc', entradas: [{ mercado: 'es-US', ficha: fichaEs, guion: { partes: [parte(1, { narracion: NARRACION_ES }), parte(2, { narracion: NARRACION_ES })] } }, { mercado: 'en-US', ficha, guion: g }] });
  assert.deepEqual(plan.mercados.map((m) => m.mercado), ['en-US', 'es-US']);
  assert.deepEqual(plan.mercados[0].partes.map((p) => p.archivo), ['stories-abc-en-us-p1.mp4', 'stories-abc-en-us-p2.mp4']);
  assert.equal(plan.mercados[1].largo.archivo, 'stories-abc-es-us-largo.mp4');
  assert.deepEqual(plan.resumen, { renders: 4, concatenaciones: 2 });
  assert.deepEqual(plan.avisos, []);
});

test('planDeProduccion: las partes salen ordenadas por n aunque el guion llegue desordenado', () => {
  const plan = planDeProduccion({ id: 'ord', entradas: [{ mercado: 'en-US', ficha, guion: { partes: [parte(3), parte(1), parte(2)] } }] });
  assert.deepEqual(plan.mercados[0].partes.map((p) => p.n), [1, 2, 3]);
});

test('planDeProduccion: solo stories; un guion por mercado; la ficha debe ser del mercado y del canal', () => {
  const entrada = { mercado: 'en-US', ficha, guion: guionBueno() };
  assert.throws(() => planDeProduccion({ id: 'a', canal: 'sports', entradas: [entrada] }), /Parte 6/);
  assert.throws(() => planDeProduccion({ id: 'a', canal: 'news', entradas: [entrada] }), ErrorProduccion);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [entrada, entrada] }), /repetido/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, mercado: 'es-US' }] }), /esta hecha para el mercado en-US/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, ficha: { ...ficha, canal: 'news' } }] }), /no es del canal stories/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [] }), /al menos un guion/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, guion: { partes: [] } }] }), /no tiene partes/);
  assert.throws(() => planDeProduccion({ id: '../x', entradas: [entrada] }), /Id de produccion/);
  assert.throws(() => planDeProduccion({ id: 'a', entradas: [{ ...entrada, mercado: 'fr-FR' }] }), /ercado/);
});

test('planDeProduccion: avisa si los mercados no tienen las mismas partes', () => {
  const plan = planDeProduccion({ id: 'a', entradas: [{ mercado: 'en-US', ficha, guion: guionBueno() }, { mercado: 'es-US', ficha: fichaEs, guion: { partes: [parte(1)] } }] });
  assert.equal(plan.avisos.length, 1);
});

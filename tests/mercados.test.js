import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERCADOS, IDS_MERCADOS, MERCADO_PRINCIPAL, CAPAS_POR_IDIOMA, ErrorMercado,
  normalizarMercado, normalizarMercados, esPrincipal, mercadoDe,
} from '../src/mercados.js';

test('catalogo: en-US es el principal y es-US es subcanal que deriva de el', () => {
  assert.deepEqual([...IDS_MERCADOS], ['en-US', 'es-US']);
  assert.equal(MERCADO_PRINCIPAL, 'en-US');
  assert.equal(MERCADOS['en-US'].rol, 'principal');
  assert.equal(MERCADOS['en-US'].derivaDe, null);
  assert.equal(MERCADOS['es-US'].rol, 'sub');
  assert.equal(MERCADOS['es-US'].derivaDe, 'en-US');
  for (const m of Object.values(MERCADOS)) {
    assert.equal(m.region, 'US');
    assert.equal(m.locale, m.id);
    assert.equal(m.whisperLang, m.idioma);
  }
});

test('el catalogo esta congelado', () => {
  assert.throws(() => { MERCADOS['en-US'].idioma = 'fr'; }, TypeError);
  assert.throws(() => { MERCADOS['fr-FR'] = {}; }, TypeError);
});

test('capas que dependen del idioma', () => {
  assert.deepEqual([...CAPAS_POR_IDIOMA], ['voz', 'subtitulos', 'titulo_pantalla', 'ficha']);
});

test('normalizarMercado: mayusculas, espacios y guion bajo dan el mismo mercado', () => {
  for (const v of ['en-US', 'en-us', 'EN-US', ' en_US ', 'en_us']) assert.equal(normalizarMercado(v), 'en-US', JSON.stringify(v));
  assert.equal(normalizarMercado('ES-us'), 'es-US');
});

test('normalizarMercado: lo desconocido o vacio lanza ErrorMercado (400) y no inventa un valor por defecto', () => {
  for (const v of ['fr-FR', 'en', 'es', '', undefined, null, '__proto__', 'x'.repeat(100)]) {
    assert.throws(() => normalizarMercado(v), (e) => e instanceof ErrorMercado && e.status === 400, JSON.stringify(v));
  }
  assert.throws(() => normalizarMercado('x'.repeat(100)), (e) => e.message.length < 120, 'el mensaje no refleja texto largo');
});

test('normalizarMercados: arreglo o texto, sin duplicados y en orden del catalogo', () => {
  assert.deepEqual(normalizarMercados(['es-US', 'en-US', 'es-us']), ['en-US', 'es-US']);
  assert.deepEqual(normalizarMercados('es-US, en-US'), ['en-US', 'es-US']);
  assert.deepEqual(normalizarMercados('es-US'), ['es-US']);
  assert.deepEqual(normalizarMercados('en-US es-US;en-US|es-US'), ['en-US', 'es-US']);
});

test('normalizarMercados: vacio es error salvo requerido=false; un invalido siempre es error', () => {
  assert.throws(() => normalizarMercados([]), ErrorMercado);
  assert.throws(() => normalizarMercados(''), ErrorMercado);
  assert.throws(() => normalizarMercados(undefined), ErrorMercado);
  assert.deepEqual(normalizarMercados([], { requerido: false }), []);
  assert.throws(() => normalizarMercados(['en-US', 'fr-FR'], { requerido: false }), ErrorMercado);
});

test('esPrincipal y mercadoDe', () => {
  assert.equal(esPrincipal('en-us'), true);
  assert.equal(esPrincipal('es-US'), false);
  assert.equal(mercadoDe('es-us').idioma, 'es');
});

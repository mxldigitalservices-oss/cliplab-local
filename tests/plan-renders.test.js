import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeRenders } from '../src/plan-renders.js';
import { ErrorCanal, IDS_CANALES } from '../src/canales.js';
import { ErrorMercado } from '../src/mercados.js';

test('stories completo: 2 renders (uno por mercado) en vez de 8, y 2 concatenaciones para el largo', () => {
  const p = planDeRenders({ canal: 'stories' });
  assert.deepEqual(p.resumen, { rendersNecesarios: 2, concatenaciones: 2, rendersSinReutilizar: 8, rendersEvitados: 6 });
  assert.deepEqual(p.renders, [
    { clave: 'vertical_9x16', tipo: 'render', mercados: ['en-US'], destinos: ['facebook_reels', 'instagram_reels', 'youtube_shorts'] },
    { clave: 'vertical_9x16', tipo: 'render', mercados: ['es-US'], destinos: ['facebook_reels', 'instagram_reels', 'youtube_shorts'] },
  ]);
  assert.deepEqual(p.concatenados.map((c) => [c.mercados[0], c.dependeDe, c.destinos[0]]), [
    ['en-US', 'vertical_9x16', 'youtube_long'],
    ['es-US', 'vertical_9x16', 'youtube_long'],
  ]);
});

test('Instagram nunca tiene render propio: comparte el archivo de Facebook en el mismo mercado', () => {
  for (const canal of IDS_CANALES) {
    const p = planDeRenders({ canal });
    for (const r of p.renders) {
      const conInstagram = r.destinos.includes('instagram_reels');
      assert.equal(conInstagram, r.destinos.includes('facebook_reels'), canal);
    }
    assert.equal(p.renders.filter((r) => r.mercados.includes('en-US')).length, 1, canal + ': un solo render 9:16 por mercado');
  }
});

test('sin capas de idioma (sin voz, subtitulos, titulo ni ficha) un solo render sirve a ambos mercados', () => {
  const p = planDeRenders({ canal: 'news', capasDeIdioma: false });
  assert.equal(p.capasDeIdioma, false);
  assert.deepEqual(p.renders.map((r) => r.mercados), [['en-US', 'es-US']]);
  assert.deepEqual(p.concatenados.map((c) => c.mercados), [['en-US', 'es-US']]);
  assert.equal(p.resumen.rendersNecesarios, 1);
  assert.equal(p.resumen.rendersEvitados, 7);
});

test('un solo mercado: un render y una concatenacion', () => {
  const p = planDeRenders({ canal: 'sports', mercados: 'es-US' });
  assert.deepEqual(p.mercados, ['es-US']);
  assert.equal(p.resumen.rendersNecesarios, 1);
  assert.equal(p.resumen.concatenaciones, 1);
  assert.equal(p.resumen.rendersSinReutilizar, 4);
});

test('solo el video largo: igual se necesitan las partes renderizadas (sin destino propio) y se concatenan', () => {
  const p = planDeRenders({ canal: 'sports', destinos: 'youtube_long' });
  assert.deepEqual(p.renders.map((r) => [r.mercados[0], r.destinos]), [['en-US', []], ['es-US', []]]);
  assert.equal(p.resumen.concatenaciones, 2);
});

test('solo cortos: no hay concatenaciones', () => {
  const p = planDeRenders({ canal: 'stories', destinos: ['instagram_reels', 'youtube_shorts'], mercados: ['en-US'] });
  assert.equal(p.concatenados.length, 0);
  assert.deepEqual(p.renders, [{ clave: 'vertical_9x16', tipo: 'render', mercados: ['en-US'], destinos: ['instagram_reels', 'youtube_shorts'] }]);
  assert.deepEqual(p.resumen, { rendersNecesarios: 1, concatenaciones: 0, rendersSinReutilizar: 2, rendersEvitados: 1 });
});

test('entradas invalidas: canal, mercado o destino desconocidos lanzan error 400', () => {
  assert.throws(() => planDeRenders(), ErrorCanal);
  assert.throws(() => planDeRenders({ canal: 'musica' }), ErrorCanal);
  assert.throws(() => planDeRenders({ canal: 'news', mercados: 'fr-FR' }), ErrorMercado);
  assert.throws(() => planDeRenders({ canal: 'news', destinos: 'tiktok' }), ErrorCanal);
});

test('el plan es una copia nueva en cada llamada (editarla no afecta a la siguiente)', () => {
  const a = planDeRenders({ canal: 'stories' });
  a.renders[0].destinos.push('x');
  a.mercados.push('x');
  const b = planDeRenders({ canal: 'stories' });
  assert.deepEqual(b.renders[0].destinos, ['facebook_reels', 'instagram_reels', 'youtube_shorts']);
  assert.deepEqual(b.mercados, ['en-US', 'es-US']);
});

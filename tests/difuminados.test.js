import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorDifuminado, MAX_REGIONES, AREA_MAX, TAM_MIN, FUERZA,
  sanearRegion, sanearDifuminados, resolverDifuminados, regionAPixeles, parametrosDeBlur, geometriaDeDifuminados,
} from '../src/difuminados.js';
import { normalizarFormato, formatoDe, FORMATOS } from '../src/formatos.js';
import { parsearMarca, normalizarRango, RANGO_MAX_SEGUNDOS } from '../src/rango.js';

const r = (extra = {}) => ({ x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1, ...extra });

test('sanearRegion: acomoda dentro del cuadro, acota fuerza y tamano minimo, limpia etiqueta', () => {
  const s = sanearRegion({ x: 0.95, y: -2, ancho: 0.3, alto: 0.001, fuerza: 99, etiqueta: '  Logo\n  raro  ' });
  assert.equal(s.x, 0.7);
  assert.equal(s.y, 0);
  assert.equal(s.alto, TAM_MIN);
  assert.equal(s.fuerza, FUERZA.max);
  assert.equal(s.etiqueta, 'Logo raro');
  assert.equal(s.activo, true);
  assert.equal(sanearRegion(r({ fuerza: '' })).fuerza, FUERZA.defecto);
  assert.equal(sanearRegion(r({ etiqueta: 'x'.repeat(80) })).etiqueta.length, 24);
  assert.equal(sanearRegion(r({ activo: false })).activo, false);
  assert.equal(sanearRegion(r({ x: '0.5' })).x, 0.5, 'numeros como texto (formularios)');
});

test('sanearRegion: datos no numericos o tiempos incoherentes son ErrorDifuminado 400', () => {
  for (const malo of [null, [], 'x', r({ x: 'abc' }), r({ ancho: NaN }), r({ y: undefined }), r({ desde: 5, hasta: 2 }), r({ desde: -1 }), r({ hasta: 99999 })]) {
    assert.throws(() => sanearRegion(malo), (e) => e instanceof ErrorDifuminado && e.status === 400, JSON.stringify(malo));
  }
});

test('sanearDifuminados: ids unicos, version, formas de entrada (lista, objeto, JSON, vacio)', () => {
  const a = sanearDifuminados([r({ id: 'logo' }), r({ id: 'logo', x: 0.5 }), r({ id: 'MAL ID!', x: 0.7 })]);
  assert.equal(a.version, 1);
  assert.equal(new Set(a.regiones.map((x) => x.id)).size, 3);
  assert.equal(a.regiones[0].id, 'logo');
  assert.deepEqual(sanearDifuminados({ regiones: [r()] }).regiones.length, 1);
  assert.deepEqual(sanearDifuminados(JSON.stringify([r()])).regiones.length, 1);
  assert.deepEqual(sanearDifuminados([]).regiones, []);
  assert.deepEqual(sanearDifuminados('').regiones, []);
  assert.throws(() => sanearDifuminados('{no json'), /JSON valido/);
  assert.throws(() => sanearDifuminados(42), /lista/);
});

test('limites: maximo de difuminados y area total (informacion visual protegida); apagados no cuentan', () => {
  const muchos = Array.from({ length: MAX_REGIONES + 1 }, (_, i) => r({ x: 0.01 * i, ancho: 0.05, alto: 0.05 }));
  assert.throws(() => sanearDifuminados(muchos), /Demasiados difuminados/);
  const justos = Array.from({ length: MAX_REGIONES }, (_, i) => r({ x: 0.01 * i, y: 0.01 * i, ancho: 0.05, alto: 0.05 }));
  assert.equal(sanearDifuminados(justos).regiones.length, MAX_REGIONES);
  assert.throws(() => sanearDifuminados([{ x: 0, y: 0, ancho: 0.6, alto: 0.6 }]), (e) => /tapan el 36 %/.test(e.message) && e.status === 400);
  const gigantesApagados = [{ x: 0, y: 0, ancho: 0.9, alto: 0.9, activo: false }, r()];
  assert.equal(sanearDifuminados(gigantesApagados).regiones.length, 2);
  assert.ok(AREA_MAX < 0.5);
});

test('avisos: zona central y difuminados que se solapan (salvo que no coincidan en el tiempo)', () => {
  assert.match(sanearDifuminados([{ x: 0.4, y: 0.45, ancho: 0.2, alto: 0.1, etiqueta: 'centro' }]).avisos.join(' '), /zona central/);
  assert.deepEqual(sanearDifuminados([r()]).avisos, []);
  const dos = sanearDifuminados([r({ etiqueta: 'a' }), r({ etiqueta: 'b' })]);
  assert.match(dos.avisos.join(' '), /se solapan mucho/);
  const alternados = sanearDifuminados([r({ desde: 0, hasta: 2 }), r({ desde: 2, hasta: 4 })]);
  assert.deepEqual(alternados.avisos, []);
});

test('resolverDifuminados: ausente = sugeridos; lista = solo esos; usarSugeridos suma; vacio = ninguno', () => {
  const sug = [r({ id: 's1' }), r({ id: 's2', x: 0.6 })];
  assert.equal(resolverDifuminados(undefined, sug).regiones.length, 2);
  assert.equal(resolverDifuminados(null, sug).regiones.length, 2);
  assert.equal(resolverDifuminados('', sug).regiones.length, 2);
  assert.deepEqual(resolverDifuminados([r({ id: 'mio' })], sug).regiones.map((x) => x.id), ['mio']);
  assert.deepEqual(resolverDifuminados([], sug).regiones, []);
  assert.deepEqual(resolverDifuminados({ usarSugeridos: true, regiones: [r({ id: 'mas', y: 0.5 })] }, sug).regiones.map((x) => x.id), ['s1', 's2', 'mas']);
  assert.equal(resolverDifuminados({ usarSugeridos: true }, sug).regiones.length, 2);
  assert.throws(() => resolverDifuminados({ usarSugeridos: true, regiones: Array.from({ length: 8 }, (_, i) => r({ y: 0.1 * i, ancho: 0.04, alto: 0.04 })) }, sug), /Demasiados/);
});

test('regionAPixeles y parametrosDeBlur: pares, dentro del cuadro y blur siempre valido para boxblur', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080], [270, 480]]) {
    for (const reg of [r(), r({ x: 1, y: 1, ancho: 1, alto: 1 }), r({ ancho: TAM_MIN, alto: TAM_MIN })]) {
      const s = sanearRegion(reg);
      const p = regionAPixeles(s, W, H);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H);
      assert.ok([p.x, p.y, p.w, p.h].every((n) => n % 2 === 0));
      for (let f = 1; f <= 10; f++) {
        const b = parametrosDeBlur(p.w, p.h, f);
        assert.ok(b.k >= 1 && b.radio >= 1 && b.radio <= Math.floor(Math.min(b.wk, b.hk) / 4) + 0 || b.radio === 1, `radio ${b.radio} en ${b.wk}x${b.hk}`);
        assert.ok(b.wk >= 2 && b.hk >= 2);
      }
    }
  }
  assert.ok(parametrosDeBlur(300, 100, 10).k > parametrosDeBlur(300, 100, 1).k, 'mas fuerza = mas reduccion');
  const g = geometriaDeDifuminados(sanearDifuminados([r(), r({ x: 0.6, activo: false })]).regiones, 1080, 1920);
  assert.equal(g.length, 1, 'solo los activos');
  assert.ok(g[0].px && g[0].blur);
});

test('formatos: vertical por defecto, alias, desconocido es 400', () => {
  assert.equal(normalizarFormato(undefined), 'vertical');
  assert.equal(normalizarFormato(' 9:16 '), 'vertical');
  assert.equal(normalizarFormato('HORIZONTAL'), 'horizontal');
  assert.equal(normalizarFormato('16x9'), 'horizontal');
  assert.throws(() => normalizarFormato('1:1'), (e) => e.status === 400);
  assert.throws(() => normalizarFormato('__proto__'), (e) => e.status === 400);
  assert.deepEqual([formatoDe('vertical').ancho, formatoDe('vertical').alto], [1080, 1920]);
  assert.deepEqual([FORMATOS.horizontal.ancho, FORMATOS.horizontal.alto], [1920, 1080]);
  assert.ok(Object.isFrozen(FORMATOS.vertical));
});

test('rango: marcas, reloj, coherencia y tope de CPU', () => {
  assert.equal(parsearMarca('1:02:03.5'), 3723.5);
  assert.equal(parsearMarca('75'), 75);
  assert.equal(parsearMarca(12.25), 12.25);
  for (const mala of ['', '-5', '1:75', '1:99:00', 'abc', NaN, -1, '1:2:3:4']) assert.throws(() => parsearMarca(mala), (e) => e.status === 400, String(mala));
  assert.deepEqual(normalizarRango({ inicio: 10, fin: 20 }), { inicio: 10, fin: 20, duracion: 10 });
  assert.deepEqual(normalizarRango({ inicio: 10, fin: 20, duracion: 10.02 }).duracion, 10);
  assert.throws(() => normalizarRango({ marcas: [1, 5], inicio: 2 }), /no las dos/);
  assert.throws(() => normalizarRango({ marcas: [1] }), /marcas debe ser/);
  assert.throws(() => normalizarRango({ inicio: 0, duracion: 0.1 }), /demasiado corto/);
  assert.throws(() => normalizarRango({ inicio: 0, duracion: RANGO_MAX_SEGUNDOS + 1 }), /maximo es/);
  assert.equal(normalizarRango({ inicio: 0, duracion: RANGO_MAX_SEGUNDOS }).duracion, RANGO_MAX_SEGUNDOS);
});

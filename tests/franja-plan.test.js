import test from 'node:test';
import assert from 'node:assert/strict';
import { CANALES } from '../src/canales.js';
import {
  ErrorFranja, CANALES_CON_FRANJA, TITULO_MAX,
  ganchoDeTitulo, lineasDeTitulo, planDeFranja, planDeProduccionFranja, difuminadosSugeridos,
} from '../src/franja-plan.js';
import { AREA_MAX } from '../src/difuminados.js';

const fuente = { archivo: '/tmp/x.mp4' };

test('solo sports y news usan difuminados sobre video fuente; stories se rechaza con un mensaje claro (400)', () => {
  assert.deepEqual([...CANALES_CON_FRANJA], ['sports', 'news']);
  assert.throws(() => planDeFranja({ canal: 'stories', titulo: 'Un titulo largo' }), (e) => e instanceof ErrorFranja && e.status === 400 && /stories no usa difuminados/.test(e.message));
  assert.throws(() => planDeFranja({ canal: undefined, titulo: 'Un titulo largo' }), (e) => e.status === 400, 'sin canal nunca se adivina');
  assert.throws(() => planDeFranja({ canal: 'musica', titulo: 'Un titulo largo' }), (e) => e.status === 400);
});

test('ganchoDeTitulo: limpia, exige titulo y respeta los limites', () => {
  assert.throws(() => ganchoDeTitulo('   ', { canal: 'sports' }), /Falta el titulo/);
  assert.throws(() => ganchoDeTitulo('Hola', { canal: 'sports' }), /demasiado corto/);
  assert.equal(ganchoDeTitulo('  "Gol   de   media cancha"  ', { canal: 'sports' }).texto, 'Gol de media cancha');
  assert.equal(ganchoDeTitulo('Que final!!! Increible???', { canal: 'sports' }).texto, 'Que final! Increible?');
  const largo = ganchoDeTitulo('palabra '.repeat(30), { canal: 'sports' });
  assert.ok(largo.texto.length <= TITULO_MAX && largo.texto.endsWith('…'));
  assert.equal(largo.avisos.length, 1);
});

test('news es serio: sin gritar ni exclamaciones; sports conserva su energia', () => {
  const n = ganchoDeTitulo('LEY DE TRANSPORTE APROBADA EN TEXAS!', { canal: 'news' });
  assert.equal(n.texto, 'Ley de transporte aprobada en texas');
  assert.equal(n.avisos.length, 2);
  const s = ganchoDeTitulo('GOLAZO EN LA FINAL!', { canal: 'sports' });
  assert.equal(s.texto, 'GOLAZO EN LA FINAL!');
  assert.deepEqual(s.avisos, []);
});

test('lineasDeTitulo: parte por palabras, tope de lineas y palabras enormes', () => {
  assert.deepEqual(lineasDeTitulo('uno dos tres cuatro', { maxChars: 9 }), ['uno dos', 'tres', 'cuatro']);
  const tope = lineasDeTitulo('aaaa bbbb cccc dddd eeee ffff gggg', { maxChars: 9, maxLineas: 2 });
  assert.equal(tope.length, 2);
  assert.ok(tope[1].endsWith('…'));
  const enorme = lineasDeTitulo('x'.repeat(200), { maxChars: 20 });
  assert.ok(enorme[0].length <= 20);
});

test('planDeFranja sports vertical: difuminados chicos en las 4 esquinas (no franjas) y titulo arriba en un cajon translucido', () => {
  const p = planDeFranja({ canal: 'sports', titulo: 'El golazo que nadie vio venir en la final' });
  assert.equal(p.formato, 'vertical');
  assert.deepEqual([p.ancho, p.alto], [1080, 1920]);
  assert.equal(p.bandas, undefined, 'ya no hay bandas rigidas');
  assert.deepEqual(p.difuminados.regiones.map((r) => r.id), ['logo-sup-izq', 'logo-sup-der', 'logo-inf-izq', 'logo-inf-der']);
  assert.equal(p.geometria.length, 4);
  for (const g of p.geometria) {
    assert.ok(g.px.w < p.ancho * 0.4 && g.px.h < p.alto * 0.15, 'cada difuminado es un rectangulo de logo, no una banda de lado a lado');
    assert.ok(g.px.x >= 0 && g.px.y >= 0 && g.px.x + g.px.w <= p.ancho && g.px.y + g.px.h <= p.alto, 'dentro del cuadro');
    assert.ok(g.px.w % 2 === 0 && g.px.h % 2 === 0 && g.px.x % 2 === 0 && g.px.y % 2 === 0, 'valores pares');
    assert.ok(g.blur.k >= 1 && g.blur.radio >= 1 && Math.min(g.blur.wk, g.blur.hk) >= 2);
  }
  const area = p.difuminados.regiones.reduce((s, r) => s + r.ancho * r.alto, 0);
  assert.ok(area < AREA_MAX, 'los sugeridos no tapan ni la mitad de lo permitido');
  assert.equal(p.titulo.posicion, 'superior');
  assert.ok(p.titulo.lineas.length >= 1 && p.titulo.lineas.length <= 3);
  assert.ok(p.titulo.caja > 0 && p.titulo.caja <= 0.8);
  assert.equal(p.tapaLogos, true);
  assert.deepEqual(p.avisos, []);
});

test('planDeFranja news: sugeridos propios (sin esquina sup. izq.) y titulo abajo', () => {
  const p = planDeFranja({ canal: 'news', titulo: 'Aprueban nueva ley de transporte en Texas' });
  assert.deepEqual(p.difuminados.regiones.map((r) => r.id), ['logo-sup-der', 'logo-inf-izq', 'logo-inf-der']);
  assert.equal(p.titulo.posicion, 'inferior');
  const bloque = p.titulo.lineas.length * p.titulo.interlineado;
  assert.ok(p.titulo.yInicio + bloque <= p.alto, 'el titulo termina dentro del cuadro');
  const infMasAlta = Math.min(...p.geometria.filter((g) => g.id.startsWith('logo-inf')).map((g) => g.px.y));
  assert.ok(p.titulo.yInicio + bloque <= infMasAlta, 'el titulo no se encima con los difuminados de abajo');
});

test('formato horizontal 16:9: 1920x1080, sugeridos propios del formato y titulo mas chico', () => {
  const v = planDeFranja({ canal: 'sports', titulo: 'El golazo que nadie vio venir en la final' });
  const h = planDeFranja({ canal: 'sports', titulo: 'El golazo que nadie vio venir en la final', formato: 'horizontal' });
  assert.deepEqual([h.formato, h.relacion, h.ancho, h.alto], ['horizontal', '16:9', 1920, 1080]);
  assert.notDeepEqual(h.difuminados.regiones.map((r) => r.ancho), v.difuminados.regiones.map((r) => r.ancho));
  for (const g of h.geometria) assert.ok(g.px.x + g.px.w <= 1920 && g.px.y + g.px.h <= 1080);
  assert.ok(h.titulo.tam < v.titulo.tam);
  assert.equal(planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', formato: '16:9' }).formato, 'horizontal', 'alias');
  assert.throws(() => planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', formato: '4:3' }), (e) => e.status === 400 && /Formato no valido/.test(e.message));
});

test('difuminados ajustables: lista propia reemplaza, usarSugeridos suma, lista vacia = ninguno (con aviso)', () => {
  const propio = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [{ x: 0.05, y: 0.05, ancho: 0.2, alto: 0.06 }] });
  assert.equal(propio.geometria.length, 1);
  const suma = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: { usarSugeridos: true, regiones: [{ x: 0.4, y: 0.6, ancho: 0.2, alto: 0.05 }] } });
  assert.equal(suma.geometria.length, 5);
  assert.equal(new Set(suma.difuminados.regiones.map((r) => r.id)).size, 5, 'ids unicos');
  const ninguno = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [] });
  assert.equal(ninguno.geometria.length, 0);
  assert.match(ninguno.avisos.join(' '), /No hay difuminados activos/);
  const apagado = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [{ x: 0.05, y: 0.05, ancho: 0.2, alto: 0.06, activo: false }] });
  assert.equal(apagado.difuminados.regiones.length, 1, 'se conserva en la estructura editable');
  assert.equal(apagado.geometria.length, 0, 'pero no se dibuja');
  assert.throws(() => planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', difuminados: [{ x: 0, y: 0, ancho: 1, alto: 0.5 }] }), (e) => e.status === 400 && /tapan el/.test(e.message));
});

test('difuminadosSugeridos devuelve una COPIA editable (no el catalogo congelado)', () => {
  const a = difuminadosSugeridos('sports', 'vertical');
  a[0].x = 0.9;
  assert.notEqual(difuminadosSugeridos('sports', 'vertical')[0].x, 0.9);
  assert.throws(() => difuminadosSugeridos('stories', 'vertical'), (e) => e.status === 400);
});

test('posicion del titulo: la del canal por defecto, se puede cambiar y lo invalido es 400', () => {
  assert.equal(planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', posicionTitulo: 'inferior' }).titulo.posicion, 'inferior');
  assert.equal(planDeFranja({ canal: 'news', titulo: 'Un titulo con gancho', posicionTitulo: 'SUPERIOR' }).titulo.posicion, 'superior');
  assert.throws(() => planDeFranja({ canal: 'news', titulo: 'Un titulo con gancho', posicionTitulo: 'centro' }), /Posicion del titulo no valida/);
});

test('el titulo siempre cabe en el cuadro y respeta su alto maximo, en ambos formatos y posiciones', () => {
  for (const canal of ['sports', 'news']) {
    for (const formato of ['vertical', 'horizontal']) {
      for (const posicion of ['superior', 'inferior']) {
        for (const titulo of ['Gol de media cancha', 'Una frase bastante larga que obliga a varias lineas dentro del cuadro de video', 'palabra '.repeat(11)]) {
          const p = planDeFranja({ canal, titulo, formato, posicionTitulo: posicion });
          const bloque = p.titulo.lineas.length * p.titulo.interlineado;
          assert.ok(p.titulo.yInicio >= 0 && p.titulo.yInicio + bloque <= p.alto, [canal, formato, posicion].join('/') + ': dentro del cuadro');
          assert.ok(p.titulo.lineas.length <= 3);
        }
      }
    }
  }
});

test('planDeProduccionFranja: un video por mercado, principal primero, nombres seguros y sufijo del formato', () => {
  const p = planDeProduccionFranja({ id: 'Final-01', canal: 'sports', entradas: [
    { mercado: 'es-US', titulo: 'El golazo que nadie vio venir', fuente },
    { mercado: 'en-US', titulo: 'The goal nobody saw coming', fuente },
  ] });
  assert.equal(p.id, 'final-01');
  assert.equal(p.formato, 'vertical');
  assert.deepEqual(p.mercados.map((m) => m.archivo), ['sports-final-01-en-US.mp4', 'sports-final-01-es-US.mp4']);
  assert.equal(p.resumen.renders, 2);
  assert.equal(p.mercados[0].modo, 'recorte', 'modo por defecto = el del canal');
  assert.equal(planDeProduccionFranja({ id: 'n1', canal: 'news', entradas: [{ mercado: 'en-US', titulo: 'Texas approves new law', fuente }] }).mercados[0].modo, 'blur');
  const h = planDeProduccionFranja({ id: 'h1', canal: 'news', formato: 'horizontal', entradas: [{ mercado: 'en-US', titulo: 'Texas approves new law', fuente }] });
  assert.equal(h.mercados[0].archivo, 'news-h1-en-US-16x9.mp4');
  assert.equal(h.mercados[0].franja.formato, 'horizontal');
});

test('recorte por rango/marca: inicio+fin, marcas mm:ss, duracion y sin limite', () => {
  const plan = (f) => planDeProduccionFranja({ id: 'p', canal: 'sports', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4', ...f } }] }).mercados[0].fuente;
  assert.deepEqual(plan({ inicio: '0:10', fin: '0:40' }), { archivo: 'a.mp4', inicio: 10, fin: 40, duracion: 30 });
  assert.deepEqual(plan({ marcas: ['1:00', '1:30'] }), { archivo: 'a.mp4', inicio: 60, fin: 90, duracion: 30 });
  assert.deepEqual(plan({ inicio: 5, duracion: 30 }), { archivo: 'a.mp4', inicio: 5, fin: 35, duracion: 30 });
  assert.deepEqual(plan({}), { archivo: 'a.mp4', inicio: 0, fin: null, duracion: null }, 'sin fin ni duracion = hasta el final');
});

test('planDeProduccionFranja valida id, canal, mercado, fuente, rango y modo (400)', () => {
  const ok = { mercado: 'en-US', titulo: 'A title with a hook', fuente };
  const malo = (args, re) => assert.throws(() => planDeProduccionFranja({ id: 'p1', canal: 'sports', entradas: [ok], ...args }), (e) => e.status === 400 && re.test(e.message));
  malo({ id: '' }, /id del proyecto/);
  malo({ id: '../x' }, /id del proyecto/);
  malo({ canal: 'stories' }, /no usa difuminados/);
  malo({ canal: undefined }, /Elige el canal/);
  malo({ formato: 'cuadrado' }, /Formato no valido/);
  malo({ entradas: [] }, /al menos una entrada/);
  malo({ entradas: [{ ...ok, mercado: 'fr-FR' }] }, /Mercado no valido/);
  malo({ entradas: [{ ...ok, mercado: undefined }] }, /Mercado no valido/);
  malo({ entradas: [ok, ok] }, /Mercado repetido/);
  malo({ entradas: [{ ...ok, fuente: {} }] }, /fuente\.archivo/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', inicio: -1 } }] }, /inicio/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', duracion: 0 } }] }, /duracion/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', inicio: 30, fin: 10 } }] }, /fin .* debe ser mayor que inicio/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', inicio: 0, fin: 20, duracion: 5 } }] }, /no coinciden/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', duracion: 5000 } }] }, /maximo es 600 s/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', inicio: 'abc' } }] }, /marca valida/);
  malo({ entradas: [{ ...ok, modo: 'zoom' }] }, /modo no valido/);
  malo({ entradas: [{ ...ok, titulo: '' }] }, /titulo/);
  malo({ entradas: [{ ...ok, difuminados: [{ x: 'no', y: 0, ancho: 0.1, alto: 0.1 }] }] }, /x debe ser un numero/);
  malo({ entradas: [{ ...ok, posicionTitulo: 'centro' }] }, /Posicion del titulo/);
});

test('el ritmo del canal solo avisa (no bloquea) cuando el tramo es muy largo o corto', () => {
  const largo = planDeProduccionFranja({ id: 'p', canal: 'sports', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4', duracion: 90 } }] });
  assert.match(largo.avisos[0], /hasta 45 s/);
  const corto = planDeProduccionFranja({ id: 'p', canal: 'news', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4', duracion: 10 } }] });
  assert.match(corto.avisos[0], /al menos 30 s/);
  assert.deepEqual(planDeProduccionFranja({ id: 'p', canal: 'sports', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4' } }] }).avisos, []);
});

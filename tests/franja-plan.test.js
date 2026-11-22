import test from 'node:test';
import assert from 'node:assert/strict';
import { CANALES } from '../src/canales.js';
import {
  ErrorFranja, CANALES_CON_FRANJA, TITULO_MAX, PASOS_DEGRADADO,
  ganchoDeTitulo, lineasDeTitulo, planDeFranja, planDeProduccionFranja,
} from '../src/franja-plan.js';

const fuente = { archivo: '/tmp/x.mp4' };

test('solo sports y news usan franja; stories se rechaza con un mensaje claro (400)', () => {
  assert.deepEqual([...CANALES_CON_FRANJA], ['sports', 'news']);
  assert.throws(() => planDeFranja({ canal: 'stories', titulo: 'Un titulo largo' }), (e) => e instanceof ErrorFranja && e.status === 400 && /stories no usa franja/.test(e.message));
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

test('planDeFranja sports: franja arriba y abajo, titulo en la primera, degradado hacia el centro', () => {
  const p = planDeFranja({ canal: 'sports', titulo: 'El golazo que nadie vio venir en la final' });
  const f = CANALES.sports.franja;
  assert.deepEqual(p.bandas.map((b) => b.posicion), ['superior', 'inferior']);
  assert.equal(p.bandas[0].y, 0);
  assert.equal(p.bandas[1].y + p.bandas[1].alto, p.alto, 'la inferior termina en el borde');
  assert.ok(Math.abs(p.bandas[0].alto - p.alto * f.altoPct) <= 2);
  assert.deepEqual(p.bandas.map((b) => b.lleva), [true, false]);
  assert.equal(p.titulo.posicion, 'superior');
  assert.ok(p.titulo.lineas.length >= 1 && p.titulo.lineas.length <= 3);
  assert.equal(p.tapaLogos, true);
  for (const b of p.bandas) {
    assert.equal(b.degradado.pasos.length, PASOS_DEGRADADO);
    const op = b.degradado.pasos.map((x) => x.opacidad);
    // junto a la franja es lo mas opaco y baja hacia el centro del video
    const cercanoPrimero = b.posicion === 'superior' ? op : [...op].reverse();
    assert.deepEqual([...cercanoPrimero].sort((x, y) => y - x), cercanoPrimero);
    assert.ok(cercanoPrimero[0] < b.opacidad && cercanoPrimero.at(-1) > 0);
    // las tiras son contiguas: sin huecos ni solapes
    const orden = [...b.degradado.pasos].sort((x, y) => x.y - y.y);
    for (let i = 1; i < orden.length; i++) assert.equal(orden[i].y, orden[i - 1].y + orden[i - 1].alto);
    assert.equal(orden.reduce((s, x) => s + x.alto, 0), b.degradado.alto);
  }
});

test('planDeFranja news: una sola franja inferior con el titulo y el color del canal', () => {
  const p = planDeFranja({ canal: 'news', titulo: 'Aprueban nueva ley de transporte en Texas' });
  assert.deepEqual(p.bandas.map((b) => b.posicion), ['inferior']);
  assert.equal(p.bandas[0].color, '0x0A1A33');
  assert.equal(p.bandas[0].opacidad, CANALES.news.franja.opacidadMax);
  assert.equal(p.titulo.posicion, 'inferior');
});

test('el titulo siempre cabe dentro de la franja que lo lleva (tamano ajustado)', () => {
  for (const canal of ['sports', 'news']) {
    for (const titulo of ['Gol de media cancha', 'Una frase bastante larga que obliga a varias lineas dentro de la franja', 'palabra '.repeat(11)]) {
      const p = planDeFranja({ canal, titulo });
      const banda = p.bandas.find((b) => b.lleva);
      const bloque = p.titulo.lineas.length * p.titulo.interlineado;
      assert.ok(p.titulo.yInicio >= banda.y - 1, canal + ': empieza dentro');
      assert.ok(p.titulo.yInicio + bloque <= banda.y + banda.alto + 2, canal + ': termina dentro de la franja');
    }
  }
});

test('posiciones: subconjunto valido del canal; fuera del catalogo es 400', () => {
  const solo = planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', posiciones: ['inferior'] });
  assert.deepEqual(solo.bandas.map((b) => b.posicion), ['inferior']);
  assert.equal(solo.titulo.posicion, 'inferior');
  assert.throws(() => planDeFranja({ canal: 'news', titulo: 'Un titulo con gancho', posiciones: ['superior'] }), (e) => e.status === 400 && /Usa: inferior/.test(e.message));
  assert.throws(() => planDeFranja({ canal: 'sports', titulo: 'Un titulo con gancho', posiciones: 'centro' }), /no valida/);
});

test('planDeProduccionFranja: un video por mercado, principal primero, nombres seguros', () => {
  const p = planDeProduccionFranja({ id: 'Final-01', canal: 'sports', entradas: [
    { mercado: 'es-US', titulo: 'El golazo que nadie vio venir', fuente },
    { mercado: 'en-US', titulo: 'The goal nobody saw coming', fuente },
  ] });
  assert.equal(p.id, 'final-01');
  assert.deepEqual(p.mercados.map((m) => m.archivo), ['sports-final-01-en-US.mp4', 'sports-final-01-es-US.mp4']);
  assert.equal(p.resumen.renders, 2);
  assert.equal(p.mercados[0].modo, 'recorte', 'modo por defecto = el del canal');
  assert.equal(planDeProduccionFranja({ id: 'n1', canal: 'news', entradas: [{ mercado: 'en-US', titulo: 'Texas approves new law', fuente }] }).mercados[0].modo, 'blur');
});

test('planDeProduccionFranja valida id, canal, mercado, fuente, tiempos y modo (400)', () => {
  const ok = { mercado: 'en-US', titulo: 'A title with a hook', fuente };
  const malo = (args, re) => assert.throws(() => planDeProduccionFranja({ id: 'p1', canal: 'sports', entradas: [ok], ...args }), (e) => e.status === 400 && re.test(e.message));
  malo({ id: '' }, /id del proyecto/);
  malo({ id: '../x' }, /id del proyecto/);
  malo({ canal: 'stories' }, /no usa franja/);
  malo({ canal: undefined }, /Elige el canal/);
  malo({ entradas: [] }, /al menos una entrada/);
  malo({ entradas: [{ ...ok, mercado: 'fr-FR' }] }, /Mercado no valido/);
  malo({ entradas: [{ ...ok, mercado: undefined }] }, /Mercado no valido/);
  malo({ entradas: [ok, ok] }, /Mercado repetido/);
  malo({ entradas: [{ ...ok, fuente: {} }] }, /fuente\.archivo/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', inicio: -1 } }] }, /inicio/);
  malo({ entradas: [{ ...ok, fuente: { archivo: 'a.mp4', duracion: 0 } }] }, /duracion/);
  malo({ entradas: [{ ...ok, modo: 'zoom' }] }, /modo no valido/);
  malo({ entradas: [{ ...ok, titulo: '' }] }, /titulo/);
});

test('el ritmo del canal solo avisa (no bloquea) cuando el tramo es muy largo o corto', () => {
  const largo = planDeProduccionFranja({ id: 'p', canal: 'sports', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4', duracion: 90 } }] });
  assert.match(largo.avisos[0], /hasta 45 s/);
  const corto = planDeProduccionFranja({ id: 'p', canal: 'news', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4', duracion: 10 } }] });
  assert.match(corto.avisos[0], /al menos 30 s/);
  assert.deepEqual(planDeProduccionFranja({ id: 'p', canal: 'sports', entradas: [{ mercado: 'en-US', titulo: 'A title with a hook', fuente: { archivo: 'a.mp4' } }] }).avisos, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Sin jsdom: se comprueba de forma estatica que cada control apunta a algo real (boton -> funcion de api.js -> ruta del servidor).
const raiz = path.join(import.meta.dirname, '..');
const leer = (r) => fs.readFile(path.join(raiz, r), 'utf8');
const [html, franja, guiones, api, ui, css, rutas, indexRutas] = await Promise.all(['public/index.html', 'public/js/franja.js', 'public/js/guiones.js', 'public/js/api.js', 'public/js/ui.js', 'public/css/styles.css', 'src/routes/franja.js', 'src/routes/index.js'].map(leer));

test('index.html: boton #btn-franja y franja.js cargado', () => {
  assert.match(html, /id="btn-franja"/);
  assert.match(html, /<script type="module" src="\/js\/franja\.js"><\/script>/);
});

test('franja.js y guiones.js: cada importacion existe en api.js / ui.js', () => {
  for (const modulo of [franja, guiones]) {
    for (const [, nombres, desde] of [...modulo.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)]) {
      const fuente = desde === 'api' ? api : ui;
      for (const n of nombres.split(',').map((x) => x.trim())) assert.match(fuente, new RegExp('export (async )?(function|const|class) ' + n + '\\b'), desde + ': ' + n);
    }
  }
});

test('api.js: cada funcion nueva llama a una ruta que existe en el servidor con su metodo', () => {
  const llamadas = [...api.matchAll(/solicitar\('(\/api\/panel\/(?:franja|produccion)[^']*)'(?:[^)]*?metodo: '(\w+)')?/g)].map((m) => [m[2] || 'GET', m[1]]);
  assert.equal(llamadas.length, 5);
  for (const [metodo, ruta] of llamadas) {
    const sub = ruta.replace('/api/panel', '');
    assert.match(rutas, new RegExp(`router\\.${metodo.toLowerCase()}\\('${sub}'`), metodo + ' ' + sub);
  }
  assert.match(indexRutas, /franjaRoutes/);
});

test('rutas: cada una lleva su propio requireMasterKey', () => {
  const definiciones = [...rutas.matchAll(/router\.(get|post)\('([^']+)', ([^\n]*)/g)];
  assert.equal(definiciones.length, 5);
  for (const [, , ruta, resto] of definiciones) assert.match(resto, /^requireMasterKey,/, ruta);
});

test('botones: producir, cancelar (franja y guiones), validar y restaurar llaman a su funcion real', () => {
  assert.match(franja, /producirFranjaVideo\(cuerpo\)/);
  assert.match(franja, /cancelarProduccion\(\)/);
  assert.match(franja, /validarDifuminados\(canal, formato, regiones\)/);
  assert.match(franja, /text: 'Restaurar sugeridos', onclick: \(\) => cargarSugeridos\(\)/);
  assert.match(franja, /text: 'Cancelar produccion', onclick: \(\) => cancelar\(\)/);
  assert.match(guiones, /cancelarProduccion\(\)/);
  assert.match(guiones, /text: 'Cancelar produccion', onclick: \(\) => cancelar\(\)/);
  assert.match(guiones, /estado === 'cancelado'/);
  assert.match(franja, /getElementById\('btn-franja'\)/);
});

test('sin innerHTML ni eval y con CSS del dialogo', () => {
  assert.doesNotMatch(franja, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
  assert.match(css, /dialog\.dlg-franja/);
  assert.match(css, /\.fila-difuminado/);
});

test('armarCuerpoFranja: sin tocar los difuminados no los envia (usa los sugeridos); tocados, envia la lista completa', async () => {
  globalThis.document = { getElementById: () => null };
  const { armarCuerpoFranja, aFraccion } = await import('../public/js/franja.js');
  const v = { canal: 'sports', formato: 'horizontal', modo: '', fuente: '/clips/a.mp4', inicio: ' 0:10 ', fin: '0:40', tituloEn: 'The goal', tituloEs: '', posicionTitulo: '', regiones: [{ id: 'a', etiqueta: 'x', x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1, fuerza: 5, activo: true, desde: 1, hasta: null }], editado: false };
  const sin = armarCuerpoFranja(v);
  assert.deepEqual(sin, { canal: 'sports', formato: 'horizontal', entradas: [{ mercado: 'en-US', titulo: 'The goal', fuente: { archivo: '/clips/a.mp4', inicio: '0:10', fin: '0:40' } }] });
  const con = armarCuerpoFranja({ ...v, editado: true, tituloEs: 'El gol', modo: 'blur', posicionTitulo: 'inferior' });
  assert.deepEqual(con.entradas.map((e) => e.mercado), ['en-US', 'es-US']);
  assert.deepEqual(con.entradas[1].difuminados, [{ id: 'a', etiqueta: 'x', x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1, fuerza: 5, activo: true, desde: 1 }]);
  assert.equal(con.entradas[0].modo, 'blur');
  assert.equal(con.entradas[0].posicionTitulo, 'inferior');
  assert.equal(armarCuerpoFranja({ ...v, formato: '' }).formato, 'vertical');
  assert.equal(aFraccion(26), 0.26);
  assert.equal(aFraccion(7.5), 0.075);
});

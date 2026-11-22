import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// El panel no usa jsdom: se comprueba de forma estatica que cada control apunta a algo real (boton -> ruta -> funcion exportada).
const raiz = path.join(import.meta.dirname, '..');
const leer = (r) => fs.readFile(path.join(raiz, r), 'utf8');
const [html, guiones, api, paquete, css, rutas, indexRutas] = await Promise.all(['public/index.html', 'public/js/guiones.js', 'public/js/api.js', 'public/js/paquete.js', 'public/css/styles.css', 'src/routes/guiones.js', 'src/routes/index.js'].map(leer));

test('index.html: boton #btn-guiones y el modulo guiones.js cargado', () => {
  assert.match(html, /id="btn-guiones"/);
  assert.match(html, /<script type="module" src="\/js\/guiones\.js"><\/script>/);
  assert.ok(html.indexOf('id="btn-guiones"') < html.indexOf('id="lnk-sesion"'));
});

test('guiones.js: cada importacion existe en api.js / ui.js', async () => {
  const ui = await leer('public/js/ui.js');
  for (const [, nombres, desde] of [...guiones.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)]) {
    const fuente = desde === 'api' ? api : ui;
    for (const n of nombres.split(',').map((x) => x.trim())) assert.match(fuente, new RegExp('export (async )?(function|const|class) ' + n + '\\b'), desde + ': ' + n);
  }
});

test('api.js: las funciones de guiones llaman a rutas que existen en el servidor', () => {
  const llamadas = [...api.matchAll(/solicitar\('(\/api\/panel\/guiones[^']*)'(?:, \{ metodo: '(\w+)')?/g)].map((m) => [m[2] || 'GET', m[1]]);
  assert.equal(llamadas.length, 6);
  for (const [metodo, ruta] of llamadas) {
    const sub = ruta.replace('/api/panel', '');
    assert.match(rutas, new RegExp(`router\\.${metodo.toLowerCase()}\\('${sub}'`), metodo + ' ' + sub);
  }
  assert.match(indexRutas, /guionesRoutes/);
});

test('guiones.js: cada boton del dialogo llama a su funcion real', () => {
  assert.match(guiones, /onclick: \(\) => accion\(procesarGuion/);
  assert.match(guiones, /producirGuiones\(\[\.\.\.seleccion\]\)/);
  assert.match(guiones, /encolarGuionFicha\(ficha, opciones\)/);
  assert.match(guiones, /text: 'Actualizar', onclick: \(\) => refrescar\(true\)/);
  assert.match(guiones, /text: 'Cerrar', onclick: \(\) => d\.close\(\)/);
  assert.match(guiones, /getElementById\('btn-guiones'\)/);
  assert.match(guiones, /obtenerEntornoGuiones\(\)/);
});

test('guiones.js: sin innerHTML ni eval (todo el texto entra con textContent)', () => {
  assert.doesNotMatch(guiones, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
});

test('paquete.js descarga el archivo del mercado elegido; el CSS del dialogo existe', () => {
  assert.match(paquete, /descargarVideo\(vista\.clipId, vista\.mercado\)/);
  assert.match(api, /'\/descarga' \+ \(mercado \?/);
  assert.match(css, /dialog\.dlg-guiones/);
});

test('parsearHechos: "tipo: valor" por linea, con errores claros', async () => {
  globalThis.document = { getElementById: () => null };   // el modulo busca su boton al cargarse
  const { parsearHechos } = await import('../public/js/guiones.js');
  const r = parsearHechos('persona: Marco Silva\n\nlugar = Lisbon, Portugal\nFECHA: March 3, 1998\nnada raro\nrumor: x');
  assert.deepEqual(r.hechos, [{ tipo: 'persona', valor: 'Marco Silva' }, { tipo: 'lugar', valor: 'Lisbon, Portugal' }, { tipo: 'fecha', valor: 'March 3, 1998' }]);
  assert.equal(r.errores.length, 2);
  assert.match(r.errores[0], /Linea 5/);
  assert.deepEqual(parsearHechos('').hechos, []);
});

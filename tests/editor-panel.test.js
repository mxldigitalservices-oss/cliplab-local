import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Sin jsdom: se comprueba de forma estatica que cada control apunta a algo real (boton -> funcion de api.js -> ruta del servidor)
// y se prueban las funciones puras de geometria y de armado del cuerpo.
const raiz = path.join(import.meta.dirname, '..');
const leer = (r) => fs.readFile(path.join(raiz, r), 'utf8');
const [html, editor, api, ui, css, rutas, indexRutas] = await Promise.all(['public/index.html', 'public/js/editor.js', 'public/js/api.js', 'public/js/ui.js', 'public/css/styles.css', 'src/routes/editor.js', 'src/routes/index.js'].map(leer));

test('index.html: boton #btn-editor y editor.js cargado como modulo', () => {
  assert.match(html, /id="btn-editor"/);
  assert.match(html, /<script type="module" src="\/js\/editor\.js"><\/script>/);
});

test('editor.js: cada importacion existe en api.js / ui.js', () => {
  for (const [, nombres, desde] of [...editor.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)]) {
    const fuente = desde === 'api' ? api : ui;
    for (const n of nombres.split(',').map((x) => x.trim())) assert.match(fuente, new RegExp('export (async )?(function|const|class) ' + n + '\\b'), desde + ': ' + n);
  }
});

test('api.js: cada funcion del editor llama a una ruta que existe en el servidor con su metodo', () => {
  const llamadas = [...api.matchAll(/solicitar\('(\/api\/panel\/editor[^']*)'(?:[^)]*?metodo: '(\w+)')?/g)].map((m) => [m[2] || 'GET', m[1]]);
  assert.equal(llamadas.length, 5);
  for (const [metodo, ruta] of llamadas) {
    const sub = ruta.replace('/api/panel', '');
    assert.match(rutas, new RegExp(`router\\.${metodo.toLowerCase()}\\('${sub}'`), metodo + ' ' + sub);
  }
  assert.match(indexRutas, /import editorRoutes from '\.\/editor\.js'/);
  assert.match(indexRutas, /router\.use\('\/api\/panel', editorRoutes\)/);
});

test('rutas: cada una lleva su propio requireMasterKey', () => {
  const definiciones = [...rutas.matchAll(/router\.(get|post)\('([^']+)', ([^\n]*)/g)];
  assert.equal(definiciones.length, 5);
  for (const [, , ruta, resto] of definiciones) assert.match(resto, /^requireMasterKey,/, ruta);
});

test('botones: validar, vista previa, renderizar, cancelar, agregar y quitar llaman a su funcion real', () => {
  assert.match(editor, /validarEditor\(cuerpo\(\)\)/);
  assert.match(editor, /previsualizarEditor\(cuerpo\(/);
  assert.match(editor, /renderizarEditor\(cuerpo\(\)\)/);
  assert.match(editor, /cancelarEditor\(\)/);
  assert.match(editor, /text: 'Cancelar render', onclick: \(\) => cancelar\(\)/);
  assert.match(editor, /text: 'Renderizar video', onclick: \(\) => renderizar\(\)/);
  assert.match(editor, /text: '\+ Difuminado', onclick: \(\) => agregarRegion\(\)/);
  assert.match(editor, /text: '\+ Capa PNG', onclick: \(\) => agregarCapa\(\)/);
  assert.match(editor, /text: 'Quitar seleccionado'[^)]*onclick: \(\) => quitarSeleccion\(\)/);
  assert.match(editor, /getElementById\('btn-editor'\)/);
});

test('sin innerHTML, eval ni librerias externas; el lienzo es un <canvas> con eventos de puntero (raton y tactil) y teclado', () => {
  assert.doesNotMatch(editor, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setTimeout\(\s*['"`]/);
  assert.doesNotMatch(editor, /^import .* from ['"](?!\.\/)/m, 'solo importa modulos propios (cero dependencias nuevas)');
  assert.match(editor, /el\('canvas'/);
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown']) assert.match(editor, new RegExp("addEventListener\\('" + ev + "'"), ev);
  assert.match(editor, /setPointerCapture/);
});

test('CSS: dialogo del editor, lienzo con touch-action none y ajuste para pantallas chicas', () => {
  assert.match(css, /dialog\.dlg-editor/);
  assert.match(css, /\.lienzo-editor[^}]*touch-action: none/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.dlg-editor \.editor-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.dlg-editor input, \.dlg-editor select \{ min-height: 36px/);
});

// ---------------------------------------------------------------- funciones puras
globalThis.document = { getElementById: () => null };
const m = await import('../public/js/editor.js');
const V = { ancho: 1080, alto: 1920 };

test('rectDeItem: regiones en fracciones directas y capas con alto segun la proporcion del PNG', () => {
  assert.deepEqual(m.rectDeItem('region', { x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1 }, V), { x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
  const c = m.rectDeItem('capa', { x: 0.5, y: 0.5, escala: 0.25, dim: { ancho: 200, alto: 100 } }, V);
  assert.equal(c.w, 0.25);
  assert.ok(Math.abs(c.h - (0.25 * 1080 * 0.5) / 1920) < 1e-9);
  assert.equal(m.rectDeItem('capa', { x: 0, y: 0, escala: 0.5 }, V).h, (0.5 * 1080) / 1920, 'sin medidas se asume cuadrada');
});

test('moverItem / acomodarItem: nunca se salen del cuadro', () => {
  const r = { x: 0.7, y: 0.9, ancho: 0.2, alto: 0.2 };
  m.moverItem('region', r, 0.5, 0.5, V);
  assert.deepEqual([r.x, r.y], [0.8, 0.8]);
  m.moverItem('region', r, -5, -5, V);
  assert.deepEqual([r.x, r.y], [0, 0]);
  const k = { x: 0.9, y: 0.99, escala: 0.3, dim: { ancho: 100, alto: 100 } };
  m.acomodarItem('capa', k, V);
  const rc = m.rectDeItem('capa', k, V);
  assert.ok(rc.x + rc.w <= 1.0001 && rc.y + rc.h <= 1.0001);
});

test('redimensionarItem: regiones con minimo y tope del borde; capas por ancho y sin salirse', () => {
  const r = { x: 0.5, y: 0.5, ancho: 0.1, alto: 0.1 };
  m.redimensionarItem('region', r, 5, 5, V);
  assert.deepEqual([r.ancho, r.alto], [0.5, 0.5]);
  m.redimensionarItem('region', r, -1, 0, V);
  assert.deepEqual([r.ancho, r.alto], [0.03, 0.03]);
  const k = { x: 0.6, y: 0.1, escala: 0.2, dim: { ancho: 200, alto: 100 } };
  m.redimensionarItem('capa', k, 9, 9, V);
  assert.equal(k.escala, 0.4, 'solo queda el 40 % de ancho hasta el borde');
  m.redimensionarItem('capa', k, 0, 0, V);
  assert.equal(k.escala, 0.05);
  const alta = { x: 0, y: 0.5, escala: 0.2, dim: { ancho: 100, alto: 3000 } };
  m.redimensionarItem('capa', alta, 1, 1, V);
  const ra = m.rectDeItem('capa', alta, V);
  assert.ok(ra.y + ra.h <= 1.0001, 'una capa alta no se sale por abajo');
});

test('golpeEn: la esquina del elegido gana, el ultimo dibujado queda arriba y fuera = null', () => {
  const a = { tipo: 'region', item: { x: 0.1, y: 0.1, ancho: 0.4, alto: 0.2 } };
  const b = { tipo: 'region', item: { x: 0.3, y: 0.1, ancho: 0.4, alto: 0.2 } };
  assert.equal(m.golpeEn([a, b], null, 0.4, 0.15, V).elemento, b, 'se solapan: gana el de arriba');
  assert.equal(m.golpeEn([a, b], null, 0.15, 0.15, V).elemento, a);
  assert.equal(m.golpeEn([a, b], null, 0.9, 0.9, V), null);
  const g = m.golpeEn([a, b], a, 0.5, 0.3, V, { tolX: 0.05, tolY: 0.05 });
  assert.deepEqual([g.elemento, g.zona], [a, 'redim']);
  assert.equal(m.golpeEn([a, b], b, 0.5, 0.3, V).zona, 'mover', 'la esquina solo cuenta en el elemento elegido');
});

test('armarCuerpoEditor: fuente con rango, elementos con desde/hasta solo si existen, audio opcional y calidad', () => {
  const v = {
    fuente: ' /clips/a.mp4 ', inicio: ' 0:10 ', fin: '0:40', formato: 'horizontal', modo: 'blur', calidad: 'mejor', t: '2',
    regiones: [{ id: 'a', etiqueta: 'x', x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1, fuerza: 5, activo: true, desde: 1, hasta: null }],
    capas: [{ id: 'k', etiqueta: 'logo', archivo: '/uploads/l.png', x: 0.5, y: 0.5, escala: 0.2, activo: false, desde: '', hasta: 3, dim: { ancho: 9, alto: 9 } }],
    audio: { archivo: '/assets/m.mp3', volumen: '0.5', offset: '2', mezclar: false },
  };
  const c = m.armarCuerpoEditor(v);
  assert.deepEqual(c.fuente, { archivo: '/clips/a.mp4', inicio: '0:10', fin: '0:40' });
  assert.deepEqual([c.formato, c.modo, c.calidad, c.t], ['horizontal', 'blur', 'mejor', 2]);
  assert.deepEqual(c.difuminados, [{ id: 'a', etiqueta: 'x', x: 0.1, y: 0.2, ancho: 0.3, alto: 0.1, fuerza: 5, activo: true, desde: 1 }]);
  assert.deepEqual(c.capas, [{ id: 'k', etiqueta: 'logo', archivo: '/uploads/l.png', x: 0.5, y: 0.5, escala: 0.2, activo: false, hasta: 3 }], 'las medidas del PNG (dim) no se envian');
  assert.deepEqual(c.audio, { archivo: '/assets/m.mp3', volumen: 0.5, offset: 2, mezclar: false });
  const vacio = m.armarCuerpoEditor({ fuente: '/clips/a.mp4', formato: '', modo: '', regiones: [], capas: [], audio: null });
  assert.deepEqual([vacio.formato, vacio.modo, vacio.audio, 'calidad' in vacio, 't' in vacio, 'inicio' in vacio.fuente], ['vertical', 'recorte', null, false, false, false]);
  assert.equal(m.aFraccion(26), 0.26);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-guiones-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { FICHA, NARRACION_EN, guionBueno, parte } = await import('./fixtures/ficha-ejemplo.mjs');
const { ErrorOllama } = await import('../src/ollama.js');
const { ErrorFicha } = await import('../src/validador-ficha.js');
const { config } = await import('../src/config/index.js');
const cola = await import('../src/guiones-cola.js');
const mem = await import('../src/memoria-proyecto.js');

let n = 0;
async function carpetas() {
  const d = await fs.mkdtemp(path.join(raiz, 'c' + (++n) + '-'));
  return { base: path.join(d, 'guiones'), baseMemoria: path.join(d, 'memoria') };
}
const chatDe = (...r) => { let i = 0; return async () => { const x = r[Math.min(i++, r.length - 1)]; if (x instanceof Error) throw x; return x; }; };
const BUENO = JSON.stringify(guionBueno());

test('por defecto usa config.dataDir/guiones y config.dataDir/memoria', () => {
  assert.equal(cola.carpetaGuiones(), path.join(config.dataDir, 'guiones'));
  assert.equal(mem.carpetaMemoria(), path.join(config.dataDir, 'memoria'));
});

test('encolar: valida la ficha (ErrorFicha) y deja el JSON en pendientes con id generado por el sistema', async () => {
  const c = await carpetas();
  await assert.rejects(cola.encolarGuion({ titulo: 'x' }, c), ErrorFicha);
  assert.deepEqual(await cola.listarPendientes(c), []);
  const { id } = await cola.encolarGuion(FICHA, c);
  assert.match(id, /^\d{13}-[0-9a-f]{8}$/);
  assert.deepEqual(await cola.listarPendientes(c), [id]);
  const guardado = await cola.leerGuion('pendientes', id, c);
  assert.equal(guardado.ficha.titulo, FICHA.titulo);
  assert.equal(guardado.ficha.canal, 'stories');
});

test('pendientes -> procesados: el guion queda en procesados y sale de pendientes', async () => {
  const c = await carpetas();
  const { id } = await cola.encolarGuion(FICHA, c);
  const r = await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) });
  assert.deepEqual([r.id, r.ok, r.intentos], [id, true, 1]);
  assert.deepEqual(await cola.listarPendientes(c), []);
  assert.deepEqual(await cola.listarProcesados(c), [id]);
  const hecho = await cola.leerGuion('procesados', id, c);
  assert.equal(hecho.guion.partes.length, 2);
  assert.equal(hecho.ficha.titulo, FICHA.titulo);
  assert.ok(hecho.procesado);
});

test('sin pendientes: procesarSiguiente devuelve null', async () => {
  assert.equal(await cola.procesarSiguiente({ ...(await carpetas()), chatImpl: chatDe(BUENO) }), null);
});

test('orden de llegada: se procesa primero el mas antiguo', async () => {
  const c = await carpetas();
  const a = await cola.encolarGuion({ ...FICHA, titulo: 'Primero' }, c);
  await new Promise((ok) => setTimeout(ok, 5));
  const b = await cola.encolarGuion({ ...FICHA, titulo: 'Segundo' }, c);
  const r = await cola.procesarPendientes({ ...c, chatImpl: chatDe(BUENO) });
  assert.deepEqual(r.map((x) => x.id), [a.id, b.id]);
  assert.deepEqual(await cola.listarProcesados(c), [a.id, b.id]);
});

test('un guion que no pasa la validacion (3 intentos) va a fallidos con sus problemas; no se pierde', async () => {
  const c = await carpetas();
  const { id } = await cola.encolarGuion(FICHA, c);
  const malo = JSON.stringify({ partes: [parte(1, { narracion: NARRACION_EN + ' In 2005 he left.' }), parte(2)] });
  const r = await cola.procesarSiguiente({ ...c, chatImpl: chatDe(malo) });
  assert.deepEqual([r.ok, r.motivo, r.intentos], [false, 'validacion', 3]);
  assert.deepEqual(await cola.listarPendientes(c), []);
  assert.deepEqual(await cola.listarFallidos(c), [id]);
  const f = await cola.leerGuion('fallidos', id, c);
  assert.ok(f.problemas.length > 0);
  assert.equal(f.ficha.titulo, FICHA.titulo);
});

test('si Ollama esta caido el guion SIGUE en pendientes (no se marca fallido) y el lote se detiene', async () => {
  const c = await carpetas();
  const a = await cola.encolarGuion(FICHA, c);
  await cola.encolarGuion(FICHA, c);
  const r = await cola.procesarPendientes({ ...c, chatImpl: chatDe(new ErrorOllama('sin conexion', { tipo: 'red' })) });
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].ok, r[0].motivo, r[0].tipo], [false, 'ollama', 'red']);
  assert.equal((await cola.listarPendientes(c)).length, 2);
  assert.ok((await cola.listarPendientes(c)).includes(a.id));
  assert.deepEqual(await cola.listarFallidos(c), []);
});

test('un archivo pendiente ilegible se aparta en fallidos y la cola sigue', async () => {
  const c = await carpetas();
  await fs.mkdir(path.join(c.base, 'pendientes'), { recursive: true });
  const idMalo = '0000000000001-deadbeef';
  await fs.writeFile(path.join(c.base, 'pendientes', idMalo + '.json'), '{no es json');
  await fs.writeFile(path.join(c.base, 'pendientes', 'ruido.txt'), 'x');   // ignorado
  const { id } = await cola.encolarGuion(FICHA, c);
  const r = await cola.procesarPendientes({ ...c, chatImpl: chatDe(BUENO) });
  assert.deepEqual(r.map((x) => [x.id, x.ok]), [[idMalo, false], [id, true]]);
  assert.deepEqual(await cola.listarFallidos(c), [idMalo]);
});

test('leerGuion: ids y estados no validos no arman rutas (traversal)', async () => {
  const c = await carpetas();
  for (const id of ['../../etc/passwd', '..', 'a/b', '0000000000001-deadbeef/../x', '']) await assert.rejects(cola.leerGuion('pendientes', id, c), /Id de guion no valido/, id);
  await assert.rejects(cola.leerGuion('../procesados', '0000000000001-deadbeef', c), /Estado no valido/);
});

test('no se procesan dos guiones a la vez', async () => {
  const c = await carpetas();
  await cola.encolarGuion(FICHA, c);
  await cola.encolarGuion(FICHA, c);
  let suelta;
  const lenta = async () => { await new Promise((ok) => { suelta = ok; }); return BUENO; };
  const primera = cola.procesarSiguiente({ ...c, chatImpl: lenta });
  await new Promise((ok) => setTimeout(ok, 10));
  await assert.rejects(cola.procesarSiguiente({ ...c, chatImpl: lenta }), /Ya se esta procesando/);
  suelta();
  assert.equal((await primera).ok, true);
});

test('memoria por proyecto: se escribe al terminar y se lee (ultimaParte, entradas, contexto)', async () => {
  const c = await carpetas();
  await cola.encolarGuion({ ...FICHA, proyecto: 'marco-silva' }, c);
  await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) });
  const m = await mem.leerMemoria('marco-silva', { base: c.baseMemoria });
  assert.equal(m.ultimaParte, 2);
  assert.equal(m.entradas.length, 1);
  assert.equal(m.entradas[0].titulo, FICHA.titulo);
  assert.ok(m.entradas[0].cierre.length > 0);
  assert.match(mem.contextoDeMemoria(m), /The Rise of Marco Silva/);
  assert.equal(mem.contextoDeMemoria({ entradas: [] }), '');
});

test('memoria: continuar=true sigue la serie en la Parte 3 y el prompt lleva lo ya escrito', async () => {
  const c = await carpetas();
  await cola.encolarGuion({ ...FICHA, proyecto: 'serie-x' }, c);
  await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) });
  await cola.encolarGuion({ ...FICHA, proyecto: 'serie-x', continuar: true }, c);
  const vistos = [];
  const chatImpl = async (mensajes) => { vistos.push(mensajes); return JSON.stringify({ partes: [parte(3), parte(4)] }); };
  const r = await cola.procesarSiguiente({ ...c, chatImpl });
  assert.equal(r.ok, true);
  assert.match(vistos[0][0].content, /desde n=3/);
  assert.match(vistos[0][1].content, /YA_ESCRITO/);
  assert.equal((await mem.leerMemoria('serie-x', { base: c.baseMemoria })).ultimaParte, 4);
});

test('memoria: sin continuar la serie empieza en la Parte 1; sin proyecto no se escribe memoria', async () => {
  const c = await carpetas();
  await cola.encolarGuion({ ...FICHA, proyecto: 'p1' }, c);
  await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) });
  await cola.encolarGuion({ ...FICHA, proyecto: 'p1' }, c);   // sin continuar: debe volver a empezar en 1
  assert.equal((await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) })).ok, true);
  await cola.encolarGuion(FICHA, c);
  await cola.procesarSiguiente({ ...c, chatImpl: chatDe(BUENO) });
  assert.deepEqual((await fs.readdir(c.baseMemoria)).sort(), ['p1.json']);
});

test('memoria: proyecto invalido no arma rutas; maximo 20 entradas; archivo inexistente = vacia', async () => {
  const c = await carpetas();
  for (const p of ['../x', 'A B', '', 'x/y', '.oculto']) await assert.rejects(mem.leerMemoria(p, { base: c.baseMemoria }), /Proyecto no valido/, p);
  assert.deepEqual(await mem.leerMemoria('nuevo', { base: c.baseMemoria }), { proyecto: 'nuevo', ultimaParte: 0, entradas: [] });
  for (let i = 0; i < 25; i++) await mem.registrarGuion('largo', { id: 'g' + i, titulo: 't' + i, canal: 'stories', mercado: 'en-US', guion: { partes: [{ n: 1, narracion: 'x' }] } }, { base: c.baseMemoria });
  const m = await mem.leerMemoria('largo', { base: c.baseMemoria });
  assert.equal(m.entradas.length, mem.MAX_ENTRADAS);
  assert.equal(m.entradas.at(-1).id, 'g24');
  assert.deepEqual((await fs.readdir(c.baseMemoria)).filter((f) => f.endsWith('.tmp')), []);
});

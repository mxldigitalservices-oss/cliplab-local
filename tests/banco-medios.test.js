import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-banco-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });
const { crearRng, elegir, listarCategoria, fotoDeFicha, resumen, asegurarEstructura } = await import('../src/banco-medios.js');

const dir = path.join(raiz, 'banco');
const poner = async (rel, contenido = 'x') => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), contenido); };
await poner('efectos/whoosh/a.wav'); await poner('efectos/whoosh/b.mp3'); await poner('efectos/whoosh/nota.txt'); await poner('efectos/whoosh/.oculto.wav');
await poner('efectos/impacto/hit.ogg'); await poner('musica/calida/uno.mp3'); await poner('medios/fondos/c.mp4'); await poner('medios/fondos/d.jpg'); await poner('medios/fotos/marco.jpg');
await poner('medios/fotos/malo.exe');

test('listarCategoria: solo extensiones del tipo, sin ocultos ni otros formatos; ordenado', async () => {
  assert.deepEqual(await listarCategoria('efectos', 'whoosh', { dir }), ['a.wav', 'b.mp3']);
  assert.deepEqual(await listarCategoria('medios', 'fondos', { dir }), ['c.mp4', 'd.jpg']);
  assert.deepEqual(await listarCategoria('efectos', 'no-existe', { dir }), []);
});

test('categoria y tipo invalidos no arman rutas (traversal)', async () => {
  for (const c of ['../musica', '..', 'a/b', 'A', '', 'x'.repeat(40), 'a b']) await assert.rejects(listarCategoria('efectos', c, { dir }), /Categoria no valida/, c);
  await assert.rejects(listarCategoria('../x', 'whoosh', { dir }), /Tipo de banco/);
});

test('elegir: devuelve una ruta absoluta dentro del banco o null si no hay', async () => {
  const r = await elegir('efectos', 'whoosh', { dir });
  assert.ok(path.isAbsolute(r) && r.startsWith(dir + path.sep));
  assert.equal(await elegir('efectos', 'vacia', { dir }), null);
});

test('elegir: rng reproducible (mismo texto -> misma eleccion) y respeta `excluir` mientras haya otras', async () => {
  const a = await elegir('medios', 'fondos', { dir, rng: crearRng('serie-1') });
  const b = await elegir('medios', 'fondos', { dir, rng: crearRng('serie-1') });
  assert.equal(a, b);
  const distintos = new Set();
  for (let i = 0; i < 30; i++) distintos.add(await elegir('medios', 'fondos', { dir, rng: crearRng('s' + i) }));
  assert.equal(distintos.size, 2);
  const sin = await elegir('medios', 'fondos', { dir, excluir: ['c.mp4'] });
  assert.equal(path.basename(sin), 'd.jpg');
  const todo = await elegir('medios', 'fondos', { dir, excluir: ['c.mp4', 'd.jpg'] });
  assert.ok(todo);   // si se agotan, se repite en vez de quedarse sin fondo
});

test('crearRng: valores en [0,1) y semillas distintas dan secuencias distintas', () => {
  const r = crearRng('x'); const v = Array.from({ length: 50 }, r);
  assert.ok(v.every((n) => n >= 0 && n < 1));
  assert.notDeepEqual(Array.from({ length: 5 }, crearRng('a')), Array.from({ length: 5 }, crearRng('b')));
});

test('enlaces simbolicos que salen del banco se ignoran', async () => {
  const fuera = path.join(raiz, 'secreto.wav');
  await fs.writeFile(fuera, 'x');
  await fs.symlink(fuera, path.join(dir, 'efectos/whoosh/enlace.wav')).catch(() => {});
  assert.ok(!(await listarCategoria('efectos', 'whoosh', { dir })).includes('enlace.wav'));
});

test('fotoDeFicha: solo imagenes que existen en medios/fotos, por nombre (nunca por ruta)', async () => {
  assert.equal(await fotoDeFicha('marco.jpg', { dir }), path.join(dir, 'medios/fotos/marco.jpg'));
  for (const n of ['otra.jpg', '../marco.jpg', 'malo.exe', '', null, 'a/b.jpg']) assert.equal(await fotoDeFicha(n, { dir }), null, String(n));
});

test('resumen y asegurarEstructura', async () => {
  const r = await resumen({ dir });
  assert.equal(r.efectos.whoosh, 2);
  assert.equal(r.efectos.impacto, 1);
  assert.equal(r.musica.calida, 1);
  assert.equal(r.medios.fondos, 2);
  const nuevo = path.join(raiz, 'banco-nuevo');
  const creadas = await asegurarEstructura({ dir: nuevo });
  assert.ok(creadas.includes('medios/fotos'));
  assert.deepEqual((await resumen({ dir: nuevo })).efectos, { whoosh: 0, impacto: 0 });
});

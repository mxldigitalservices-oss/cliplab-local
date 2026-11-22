import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-exclusion-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { crearExclusion, exclusion } = await import('../src/engine/exclusion.js');
const { agregarTrabajo, fijarProcesador, detenerCola } = await import('../src/engine/cola.js');
const { chat } = await import('../src/ollama.js');

test.after(() => detenerCola());

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Instrumento: cuenta cuantas tareas estan dentro a la vez y guarda el orden de entrada/salida. */
function medidor() {
  const m = { activas: 0, maximo: 0, eventos: [] };
  m.tarea = (nombre, ms = 15) => async () => {
    m.activas++; m.maximo = Math.max(m.maximo, m.activas); m.eventos.push('+' + nombre);
    await dormir(ms);
    m.eventos.push('-' + nombre); m.activas--;
    return nombre;
  };
  return m;
}

test('nunca hay dos tareas a la vez, aunque sean de recursos distintos', async () => {
  const ex = crearExclusion();
  const m = medidor();
  const res = await Promise.all([
    ex.ejecutar('ollama', m.tarea('o1')), ex.ejecutar('ffmpeg', m.tarea('f1')),
    ex.ejecutar('ollama', m.tarea('o2')), ex.ejecutar('ffmpeg', m.tarea('f2')),
  ]);
  assert.deepEqual(res, ['o1', 'f1', 'o2', 'f2']);
  assert.equal(m.maximo, 1);
});

test('orden de llegada (FIFO)', async () => {
  const ex = crearExclusion();
  const m = medidor();
  await Promise.all(['a', 'b', 'c', 'd'].map((n, i) => ex.ejecutar(i % 2 ? 'ollama' : 'ffmpeg', m.tarea(n, 5))));
  assert.deepEqual(m.eventos, ['+a', '-a', '+b', '-b', '+c', '-c', '+d', '-d']);
});

test('si una tarea falla, el candado se libera y la siguiente corre', async () => {
  const ex = crearExclusion();
  await assert.rejects(ex.ejecutar('ollama', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await ex.ejecutar('ffmpeg', async () => 'ok'), 'ok');
  assert.deepEqual(ex.estado(), { ocupado: null, esperando: [] });
});

test('reentrante: quien ya tiene el candado puede pedirlo otra vez sin bloquearse', async () => {
  const ex = crearExclusion();
  const r = await ex.ejecutar('ffmpeg', async () => ex.ejecutar('ollama', async () => 'dentro'));
  assert.equal(r, 'dentro');
});

test('una espera se puede cancelar con AbortSignal y no ensucia la cola', async () => {
  const ex = crearExclusion();
  const m = medidor();
  const largo = ex.ejecutar('ffmpeg', m.tarea('largo', 40));
  const ctl = new AbortController();
  const esperando = ex.ejecutar('ollama', m.tarea('cancelada'), { signal: ctl.signal });
  const detras = ex.ejecutar('ollama', m.tarea('detras', 5));
  await dormir(5);
  assert.deepEqual(ex.estado().esperando, ['ollama', 'ollama']);
  ctl.abort(new Error('cancelado a proposito'));
  await assert.rejects(esperando, /cancelado a proposito/);
  await Promise.all([largo, detras]);
  assert.ok(!m.eventos.includes('+cancelada'));
  assert.deepEqual(ex.estado(), { ocupado: null, esperando: [] });
  await assert.rejects(ex.ejecutar('ollama', m.tarea('x'), { signal: AbortSignal.abort(new Error('ya cancelado')) }), /ya cancelado/);
});

test('recurso desconocido: error claro', async () => {
  await assert.rejects(crearExclusion().ejecutar('gpu', async () => 1), /Recurso desconocido/);
});

test('cola.js: los trabajos (FFmpeg) y las llamadas a Ollama nunca se solapan', async () => {
  const m = medidor();
  const terminados = [];
  const restaurar = fijarProcesador(async (trabajo) => { await m.tarea('ffmpeg-' + trabajo.id, 25)(); terminados.push(trabajo.id); });
  const fetchImpl = async () => {
    m.activas++; m.maximo = Math.max(m.maximo, m.activas); m.eventos.push('+ollama');
    await dormir(15);
    m.eventos.push('-ollama'); m.activas--;
    return new Response(JSON.stringify({ message: { content: '{"partes":[]}' } }), { status: 200 });
  };
  try {
    agregarTrabajo({ id: 't1' });
    agregarTrabajo({ id: 't2' });
    const llamadas = [chat([{ role: 'user', content: 'a' }], { fetchImpl }), chat([{ role: 'user', content: 'b' }], { fetchImpl })];
    agregarTrabajo({ id: 't3' });
    await Promise.all(llamadas);
    for (let i = 0; i < 100 && terminados.length < 3; i++) await dormir(10);
    assert.deepEqual(terminados.sort(), ['t1', 't2', 't3']);
    assert.equal(m.maximo, 1, 'se solaparon: ' + m.eventos.join(' '));
    assert.equal(m.eventos.filter((e) => e === '+ollama').length, 2);
  } finally {
    restaurar();
  }
});

test('cola.js usa el candado compartido (un trabajo espera mientras Ollama esta ocupado)', async () => {
  const restaurar = fijarProcesador(async (t) => { orden.push('ffmpeg-' + t.id); });
  const orden = [];
  try {
    const ollama = exclusion.ejecutar('ollama', async () => { orden.push('ollama-inicio'); await dormir(60); orden.push('ollama-fin'); });
    await dormir(5);
    agregarTrabajo({ id: 'espera' });
    await ollama;
    for (let i = 0; i < 100 && !orden.includes('ffmpeg-espera'); i++) await dormir(10);
    assert.deepEqual(orden, ['ollama-inicio', 'ollama-fin', 'ffmpeg-espera']);
  } finally {
    restaurar();
  }
});

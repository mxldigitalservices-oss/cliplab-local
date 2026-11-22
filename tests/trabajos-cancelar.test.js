import test from 'node:test';
import assert from 'node:assert/strict';
import { crearGestor } from '../src/trabajos-guion.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test('cancelar: el trabajo termina en cancelado (no error), el gestor queda libre y acepta otro', async () => {
  const g = crearGestor();
  assert.equal(g.iniciar('franja', ({ senal }) => new Promise((_, mal) => senal.addEventListener('abort', () => mal(new Error('Proceso cancelado'))))), true);
  assert.equal(g.iniciar('guion', async () => {}), false, 'ocupado');
  const r = await g.cancelar({ esperarMs: 1000 });
  assert.equal(r.cancelado, true);
  assert.equal(r.estado.estado, 'cancelado');
  assert.equal(r.estado.error, 'Produccion cancelada.');
  assert.equal(r.estado.cancelando, false);
  assert.ok(r.estado.fin);
  assert.equal(g.iniciar('franja', async () => 'listo'), true);
  await dormir(10);
  assert.equal(g.estado().estado, 'ok');
});

test('cancelar sin trabajo, o con uno ya terminado, no hace nada', async () => {
  const g = crearGestor();
  assert.deepEqual((await g.cancelar()).cancelado, false);
  g.iniciar('franja', async () => 1);
  await dormir(10);
  const r = await g.cancelar();
  assert.equal(r.cancelado, false);
  assert.equal(g.estado().estado, 'ok');
});

test('cancelar con esperarMs no espera de mas si el trabajo no responde, y marca cancelando', async () => {
  const g = crearGestor();
  let fin;
  g.iniciar('produccion', () => new Promise((ok) => { fin = ok; }));
  await dormir(5);
  const t0 = Date.now();
  const r = await g.cancelar({ esperarMs: 50 });
  assert.ok(Date.now() - t0 < 500);
  assert.equal(r.estado.estado, 'corriendo');
  assert.equal(r.estado.cancelando, true);
  fin();
  await dormir(10);
  assert.equal(g.estado().estado, 'ok', 'si el trabajo alcanzo a terminar bien, es ok (sus archivos existen y se registraron)');
  assert.equal(g.estado().cancelando, false);
});

test('un fallo normal sigue siendo error y el avance de un trabajo viejo no pisa al nuevo', async () => {
  const g = crearGestor();
  g.iniciar('franja', async () => { throw new Error('ffmpeg fallo'); });
  await dormir(10);
  assert.deepEqual([g.estado().estado, g.estado().error], ['error', 'ffmpeg fallo']);
  let avanceViejo;
  g.iniciar('produccion', ({ avance }) => { avanceViejo = avance; return Promise.resolve(); });
  await dormir(10);
  let soltar;
  g.iniciar('franja', () => new Promise((ok) => { soltar = ok; }));
  await dormir(5);
  avanceViejo('viejo', 50);
  assert.notEqual(g.estado().etapa, 'viejo');
  soltar();
  await dormir(10);
});

test('cancelar justo despues de iniciar (antes de que arranque la funcion) no se cuelga y no ejecuta el trabajo', async () => {
  const g = crearGestor();
  let corrio = false;
  g.iniciar('franja', async () => { corrio = true; });
  const r = await g.cancelar({ esperarMs: 500 });
  assert.equal(r.estado.estado, 'cancelado');
  assert.equal(corrio, false);
});

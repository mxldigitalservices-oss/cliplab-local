import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-ollama-'));
Object.assign(process.env, { TMP_DIR: path.join(raiz, 'tmp'), DATA_DIR: path.join(raiz, 'datos'), SESSION_DIR: path.join(raiz, 'sesion'), LOG_LEVEL: 'error' });

const { config } = await import('../src/config/index.js');
const { chat, ErrorOllama, modelosInstalados, modeloInstalado } = await import('../src/ollama.js');

const MENSAJES = [{ role: 'system', content: 'Eres guionista.' }, { role: 'user', content: 'Hola' }];

/** fetch simulado: guarda la peticion y responde con JSON. */
function simulado(respuesta, { status = 200 } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    llamadas.push({ url, init, cuerpo: init.body ? JSON.parse(init.body) : null });
    return new Response(typeof respuesta === 'string' ? respuesta : JSON.stringify(respuesta), { status });
  };
  return { fetchImpl, llamadas };
}

test('chat: manda keep_alive:0, stream:false y el modelo y las opciones de config', async () => {
  const { fetchImpl, llamadas } = simulado({ message: { role: 'assistant', content: '  {"partes":[]}  ' } });
  const texto = await chat(MENSAJES, { fetchImpl });
  assert.equal(texto, '{"partes":[]}');
  const { url, init, cuerpo } = llamadas[0];
  assert.equal(url, config.ollamaUrl + '/api/chat');
  assert.equal(init.method, 'POST');
  assert.strictEqual(cuerpo.keep_alive, 0);
  assert.strictEqual(cuerpo.stream, false);
  assert.equal(cuerpo.model, 'qwen2.5:7b-instruct');
  assert.equal(cuerpo.options.num_ctx, config.ollamaNumCtx);
  assert.equal(cuerpo.options.num_predict, config.ollamaNumPredict);
  assert.equal(cuerpo.options.temperature, 0.3);
  assert.deepEqual(cuerpo.messages, MENSAJES);
  assert.ok(init.signal, 'lleva AbortSignal (timeout)');
  assert.equal('format' in cuerpo, false);
});

test('chat: opciones propias (modelo, temperatura, contexto, formato json)', async () => {
  const { fetchImpl, llamadas } = simulado({ message: { content: 'x' } });
  await chat(MENSAJES, { fetchImpl, model: 'guionista', temperature: 0.1, numCtx: 2048, numPredict: 100, formato: 'json' });
  const c = llamadas[0].cuerpo;
  assert.deepEqual([c.model, c.options.temperature, c.options.num_ctx, c.options.num_predict, c.format, c.keep_alive], ['guionista', 0.1, 2048, 100, 'json', 0]);
});

test('chat: sin mensajes es un error de programacion', async () => {
  await assert.rejects(chat([], { fetchImpl: async () => { throw new Error('no debe llamarse'); } }), TypeError);
});

test('chat: HTTP distinto de 200 -> ErrorOllama(http) con el detalle', async () => {
  const { fetchImpl } = simulado({ error: 'fallo interno' }, { status: 500 });
  await assert.rejects(chat(MENSAJES, { fetchImpl }), (e) => e instanceof ErrorOllama && e.tipo === 'http' && e.statusOllama === 500 && /fallo interno/.test(e.message) && e.status === 502);
});

test('chat: 404 sugiere ollama pull con el modelo', async () => {
  const { fetchImpl } = simulado({ error: "model 'x' not found" }, { status: 404 });
  await assert.rejects(chat(MENSAJES, { fetchImpl }), (e) => e.tipo === 'http' && e.message.includes('ollama pull ' + config.ollamaModel));
});

test('chat: error de red -> ErrorOllama(red)', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(chat(MENSAJES, { fetchImpl }), (e) => e instanceof ErrorOllama && e.tipo === 'red' && /fetch failed/.test(e.message));
});

test('chat: respuesta vacia o sin message -> ErrorOllama(vacia)', async () => {
  for (const cuerpo of [{ message: { content: '' } }, { message: { content: '   ' } }, {}, { message: {} }]) {
    const { fetchImpl } = simulado(cuerpo);
    await assert.rejects(chat(MENSAJES, { fetchImpl }), (e) => e instanceof ErrorOllama && e.tipo === 'vacia', JSON.stringify(cuerpo));
  }
});

test('chat: cuerpo que no es JSON -> ErrorOllama(json)', async () => {
  const { fetchImpl } = simulado('<html>proxy</html>');
  await assert.rejects(chat(MENSAJES, { fetchImpl }), (e) => e.tipo === 'json');
});

// AbortSignal.timeout no mantiene vivo el proceso (en produccion lo hace el socket); en la prueba lo hace este intervalo.
const mantenerVivo = () => { const t = setInterval(() => {}, 25); return () => clearInterval(t); };

test('chat: timeout (AbortSignal.timeout) -> ErrorOllama(timeout, 504)', async () => {
  const soltar = mantenerVivo();
  test.after(soltar);
  const fetchImpl = (url, init) => new Promise((ok, mal) => { init.signal.addEventListener('abort', () => mal(init.signal.reason)); });
  const t0 = Date.now();
  await assert.rejects(chat(MENSAJES, { fetchImpl, timeoutMs: 40 }), (e) => e.tipo === 'timeout' && e.status === 504);
  assert.ok(Date.now() - t0 < 2000);
});

test('chat: una senal externa cancela la peticion (cancelado)', async () => {
  const fetchImpl = (url, init) => new Promise((ok, mal) => { init.signal.addEventListener('abort', () => mal(init.signal.reason)); });
  const ctl = new AbortController();
  const p = chat(MENSAJES, { fetchImpl, signal: ctl.signal, timeoutMs: 60000 });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, (e) => e.tipo === 'cancelado');
});

test('modelosInstalados: lee /api/tags y quita ":latest" (las demas etiquetas se conservan)', async () => {
  const { fetchImpl, llamadas } = simulado({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'guionista:latest' }, { model: 'llama3:8b' }, {}] });
  assert.deepEqual(await modelosInstalados({ fetchImpl }), ['qwen2.5:7b-instruct', 'guionista', 'llama3:8b']);
  assert.equal(llamadas[0].url, config.ollamaUrl + '/api/tags');
  assert.equal(llamadas[0].init.method, 'GET');
});

test('modelosInstalados: sin lista -> []; Ollama caido -> ErrorOllama', async () => {
  assert.deepEqual(await modelosInstalados({ fetchImpl: simulado({}).fetchImpl }), []);
  await assert.rejects(modelosInstalados({ fetchImpl: async () => { throw new TypeError('ECONNREFUSED'); } }), (e) => e.tipo === 'red');
});

test('modeloInstalado: compara sin ":latest"', async () => {
  const { fetchImpl } = simulado({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'guionista:latest' }] });
  assert.equal(await modeloInstalado(undefined, { fetchImpl }), true);
  assert.equal(await modeloInstalado('guionista', { fetchImpl }), true);
  assert.equal(await modeloInstalado('guionista:latest', { fetchImpl }), true);
  assert.equal(await modeloInstalado('otro', { fetchImpl }), false);
});

test('el Modelfile del guionista parte de qwen2.5:7b-instruct, num_thread 4, temperatura baja, y pide solo JSON sin inventar', async () => {
  const mf = await fs.readFile(path.join(import.meta.dirname, '..', 'config', 'Modelfile.guionista'), 'utf8');
  assert.match(mf, /^FROM qwen2\.5:7b-instruct$/m);
  assert.match(mf, /^PARAMETER num_thread 4$/m);
  const t = Number(mf.match(/^PARAMETER temperature ([\d.]+)$/m)[1]);
  assert.ok(t > 0 && t <= 0.4);
  assert.match(mf, /^PARAMETER num_ctx (\d+)$/m);
  assert.match(mf, /SYSTEM """/);
  assert.match(mf, /No inventes/);
  assert.match(mf, /SOLO con un objeto JSON/);
  assert.ok(!/^PARAMETER keep_alive/m.test(mf), 'keep_alive va en la peticion, no en el Modelfile');
});

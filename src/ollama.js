// ---------------------------------------------------------------------------
// Cliente de Ollama en Node (portado de ollama-core-engine/agent/llm.py). Sin dependencias: usa fetch global.
//   chat(mensajes, opciones)  -> texto de la respuesta (stream:false)
//   modelosInstalados()       -> nombres de /api/tags sin el sufijo ":latest"
// Cuidado de RAM (16 GB): cada peticion lleva keep_alive:0, asi Ollama descarga el modelo al terminar y FFmpeg arranca con la
// memoria libre. Ademas chat() toma el candado de exclusion.js, asi que nunca corre a la vez que un render.
// `fetchImpl` es inyectable para probar sin Ollama real.
// ---------------------------------------------------------------------------
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';

export class ErrorOllama extends Error {
  /** tipo: 'red' | 'timeout' | 'cancelado' | 'http' | 'vacia' | 'json' */
  constructor(mensaje, { tipo = 'red', status = null, causa } = {}) {
    super(mensaje, causa ? { cause: causa } : undefined);
    this.name = 'ErrorOllama';
    this.tipo = tipo;
    this.statusOllama = status;
    this.status = tipo === 'timeout' ? 504 : 502;
  }
}

const sinLatest = (nombre) => String(nombre ?? '').trim().replace(/:latest$/i, '');

function senal(timeoutMs, externa) {
  const tiempo = AbortSignal.timeout(timeoutMs);
  return externa && typeof AbortSignal.any === 'function' ? AbortSignal.any([tiempo, externa]) : tiempo;
}

async function pedir(url, init, { timeoutMs, signal, fetchImpl }) {
  const f = fetchImpl ?? globalThis.fetch;
  let respuesta;
  try {
    respuesta = await f(url, { ...init, signal: senal(timeoutMs, signal) });
  } catch (error) {
    if (signal && signal.aborted && error?.name !== 'TimeoutError') throw new ErrorOllama('Peticion a Ollama cancelada.', { tipo: 'cancelado', causa: error });
    if (error?.name === 'TimeoutError') throw new ErrorOllama('Ollama no respondio en ' + Math.round(timeoutMs / 1000) + ' s.', { tipo: 'timeout', causa: error });
    throw new ErrorOllama('No se pudo conectar con Ollama en ' + config.ollamaUrl + ' (' + (error?.message || 'error de red') + ').', { tipo: 'red', causa: error });
  }
  let cuerpo;
  try {
    cuerpo = await respuesta.text();
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new ErrorOllama('Ollama no respondio en ' + Math.round(timeoutMs / 1000) + ' s.', { tipo: 'timeout', causa: error });
    throw new ErrorOllama('Se corto la respuesta de Ollama: ' + (error?.message || 'error de red'), { tipo: 'red', causa: error });
  }
  if (!respuesta.ok) {
    let detalle = cuerpo.slice(0, 300);
    try { const j = JSON.parse(cuerpo); if (j && j.error) detalle = String(j.error).slice(0, 300); } catch { /* texto plano */ }
    const pista = respuesta.status === 404 ? ' Si falta el modelo: ollama pull ' + config.ollamaModel + '.' : '';
    throw new ErrorOllama('Ollama respondio HTTP ' + respuesta.status + ': ' + detalle + pista, { tipo: 'http', status: respuesta.status });
  }
  try {
    return JSON.parse(cuerpo);
  } catch (error) {
    throw new ErrorOllama('Ollama devolvio algo que no es JSON.', { tipo: 'json', causa: error });
  }
}

/**
 * Envia una conversacion y devuelve el texto de la respuesta.
 * opciones: { model, temperature, numCtx, numPredict, timeoutMs, formato ('json' para forzar JSON), signal, fetchImpl, sinExclusion }
 */
export async function chat(mensajes, opciones = {}) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) throw new TypeError('chat() necesita al menos un mensaje');
  const {
    model = config.ollamaModel,
    temperature = 0.3,
    numCtx = config.ollamaNumCtx,
    numPredict = config.ollamaNumPredict,
    timeoutMs = config.ollamaTimeoutMs,
    formato,
    signal,
    fetchImpl,
    sinExclusion = false,
  } = opciones;

  const cuerpo = {
    model,
    messages: mensajes.map((m) => ({ role: m.role, content: String(m.content ?? '') })),
    stream: false,
    keep_alive: 0,   // descarga el modelo de RAM al terminar (es un campo de la peticion, no un PARAMETER del Modelfile)
    options: { temperature, num_ctx: numCtx, num_predict: numPredict },
  };
  if (formato) cuerpo.format = formato;

  const llamar = async () => {
    const datos = await pedir(config.ollamaUrl + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }, { timeoutMs, signal, fetchImpl });
    const texto = datos && datos.message && typeof datos.message.content === 'string' ? datos.message.content.trim() : '';
    if (!texto) throw new ErrorOllama('Ollama devolvio una respuesta vacia.', { tipo: 'vacia' });
    return texto;
  };
  return sinExclusion ? llamar() : exclusion.ejecutar('ollama', llamar, { signal });
}

/** Nombres de los modelos instalados (sin ":latest"). Lanza ErrorOllama si Ollama no responde. */
export async function modelosInstalados({ timeoutMs = 5000, signal, fetchImpl } = {}) {
  const datos = await pedir(config.ollamaUrl + '/api/tags', { method: 'GET' }, { timeoutMs, signal, fetchImpl });
  const lista = Array.isArray(datos && datos.models) ? datos.models : [];
  return lista.map((m) => sinLatest(m && (m.name || m.model))).filter(Boolean);
}

/** true si el modelo (por defecto OLLAMA_MODEL) esta instalado; compara sin ":latest". */
export async function modeloInstalado(nombre = config.ollamaModel, opciones = {}) {
  const buscado = sinLatest(nombre);
  return (await modelosInstalados(opciones)).includes(buscado);
}

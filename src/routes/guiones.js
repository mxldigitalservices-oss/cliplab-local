import { Router } from 'express';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { config } from '../config/index.js';
import { gestor } from '../trabajos-guion.js';
import { encolarGuion, leerGuion, listarFallidos, listarPendientes, listarProcesados, procesarSiguiente } from '../guiones-cola.js';
import { normalizarFicha } from '../validador-ficha.js';
import { modelosInstalados, ErrorOllama } from '../ollama.js';
import { verificarPiper } from '../voz.js';
import { resumen as resumenBanco } from '../banco-medios.js';
import { MERCADOS } from '../mercados.js';
import { planDeProduccion, ErrorProduccion } from '../stories-plan.js';
import { producirStories, registrarClips } from '../stories-produccion.js';

// Cola de guiones (ficha -> guion con Ollama) y produccion de video del canal stories (Piper + FFmpeg).
// Cada ruta lleva su propia llave maestra. Lo pesado corre en segundo plano (un trabajo a la vez): los POST responden 202 y el panel
// consulta GET /guiones/estado.
const router = Router();
const RE_ID = /^[0-9]{13}-[0-9a-f]{8}$/;
const ESTADOS = ['pendientes', 'procesados', 'fallidos'];

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) { res.status(error.status).json({ ok: false, error: error.message }); return; }
  next(error);
}

async function resumenDe(estado, id) {
  try {
    const g = await leerGuion(estado, id);
    return { id, titulo: g.ficha.titulo, canal: g.ficha.canal, mercado: g.ficha.mercado, proyecto: g.ficha.proyecto || null, partes: g.guion ? g.guion.partes.length : (g.ficha.partes || null), intentos: g.intentos ?? null, problemas: g.problemas ?? [], avisos: g.avisos ?? [], error: g.error ?? null };
  } catch {
    return { id, titulo: '(ilegible)', canal: null, mercado: null, proyecto: null, partes: null, intentos: null, problemas: [], avisos: [], error: 'No se pudo leer el archivo.' };
  }
}

async function listaDe(estado, ids) {
  return Promise.all(ids.slice(-50).reverse().map((id) => resumenDe(estado, id)));
}

router.get('/guiones/entorno', requireMasterKey, async (req, res, next) => {
  try {
    const ollama = { url: config.ollamaUrl, modelo: config.ollamaModel, activo: false, instalado: false, error: null };
    try {
      const modelos = await modelosInstalados({ timeoutMs: 3000 });
      ollama.activo = true;
      ollama.instalado = modelos.includes(config.ollamaModel.replace(/:latest$/, ''));
      ollama.modelos = modelos;
    } catch (e) { ollama.error = e instanceof ErrorOllama ? e.message : String(e.message || e); }
    const piper = await verificarPiper();
    const banco = await resumenBanco();
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ollama, piper: { binario: piper.binario, ruta: piper.ruta, voces: piper.voces, listo: piper.listo }, banco, mercados: Object.values(MERCADOS).map((m) => ({ id: m.id, nombre: m.nombre })) });
  } catch (error) { next(error); }
});

router.get('/guiones/estado', requireMasterKey, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, trabajo: gestor.estado() });
});

router.get('/guiones', requireMasterKey, async (req, res, next) => {
  try {
    const [pend, proc, fall] = await Promise.all([listarPendientes(), listarProcesados(), listarFallidos()]);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, pendientes: await listaDe('pendientes', pend), procesados: await listaDe('procesados', proc), fallidos: await listaDe('fallidos', fall), trabajo: gestor.estado() });
  } catch (error) { next(error); }
});

router.post('/guiones', requireMasterKey, async (req, res, next) => {
  try {
    const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};
    const ficha = normalizarFicha(cuerpo.ficha);   // ErrorFicha (400) con la lista de problemas
    const ids = [(await encolarGuion(ficha)).id];
    if (cuerpo.tambienEsUS === true && ficha.mercado === 'en-US') {
      // La version es-US usa la misma ficha (los hechos son los mismos); el titulo puede ir traducido en tituloEs.
      const titulo = String(cuerpo.tituloEs ?? '').trim() || ficha.titulo;
      ids.push((await encolarGuion({ ...ficha, titulo, mercado: 'es-US' })).id);
    }
    res.status(201).json({ ok: true, ids });
  } catch (error) { next(error); }
});

router.post('/guiones/procesar', requireMasterKey, async (req, res, next) => {
  try {
    if ((await listarPendientes()).length === 0) throw new ErrorHttp(404, 'No hay guiones pendientes.');
    const arrancado = gestor.iniciar('guion', async ({ avance }) => {
      avance('Escribiendo el guion con Ollama (puede tardar varios minutos)', 5);
      const r = await procesarSiguiente();
      if (!r) return { vacio: true };
      if (!r.ok && r.motivo === 'ollama') throw new Error('Ollama no respondio: ' + r.error + ' El guion sigue en pendientes.');
      return r;
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine.');
    res.status(202).json({ ok: true, trabajo: gestor.estado() });
  } catch (error) { responderError(error, res, next); }
});

router.post('/guiones/producir', requireMasterKey, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? [...new Set(req.body.ids.map(String))] : [];
    if (ids.length < 1 || ids.length > 2) throw new ErrorHttp(400, 'Elige uno o dos guiones procesados (uno por mercado).');
    if (ids.some((id) => !RE_ID.test(id))) throw new ErrorHttp(400, 'Id de guion no valido.');
    const entradas = [];
    for (const id of ids) {
      let g;
      try { g = await leerGuion('procesados', id); } catch { throw new ErrorHttp(404, 'El guion ' + id + ' no esta entre los procesados.'); }
      entradas.push({ mercado: g.ficha.mercado, ficha: g.ficha, guion: g.guion });
    }
    const idProduccion = 'p' + Date.now().toString(36);
    planDeProduccion({ id: idProduccion, canal: entradas[0].ficha.canal, entradas });   // valida antes de arrancar (ErrorProduccion = 400)
    const arrancado = gestor.iniciar('produccion', async ({ senal, avance }) => {
      const resultado = await producirStories({ id: idProduccion, entradas, signal: senal, avance });
      const clips = registrarClips({ store, resultado, entradas });
      return { id: idProduccion, clips, avisos: resultado.avisos, videos: resultado.mercados.map((m) => ({ mercado: m.mercado, partes: m.partes.length, largo: m.largo.url })) };
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine.');
    res.status(202).json({ ok: true, trabajo: gestor.estado() });
  } catch (error) {
    if (error instanceof ErrorProduccion) { res.status(400).json({ ok: false, error: error.message }); return; }
    responderError(error, res, next);
  }
});

router.get('/guiones/:estado/:id', requireMasterKey, async (req, res, next) => {
  try {
    if (!ESTADOS.includes(req.params.estado)) throw new ErrorHttp(404, 'Estado no valido.');
    if (!RE_ID.test(req.params.id)) throw new ErrorHttp(404, 'Guion no encontrado.');
    let g;
    try { g = await leerGuion(req.params.estado, req.params.id); } catch { throw new ErrorHttp(404, 'Guion no encontrado.'); }
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, estado: req.params.estado, guion: g });
  } catch (error) { responderError(error, res, next); }
});

export default router;

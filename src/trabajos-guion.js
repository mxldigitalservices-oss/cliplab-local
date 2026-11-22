// ---------------------------------------------------------------------------
// Un solo trabajo pesado de guion/produccion a la vez (generar guion con Ollama, producir video de stories con Piper + FFmpeg o producir
// sports/news desde video fuente), con su estado en memoria para que el panel lo consulte. La RAM no alcanza para dos; ademas exclusion.js
// serializa Ollama/FFmpeg por dentro.
// `iniciar(tipo, fn)` devuelve false si ya hay uno corriendo; fn recibe ({ senal, avance }) y su resultado queda en estado().resultado.
// `cancelar({ esperarMs })` (Parte 6B) pide la cancelacion: aborta la senal (que detiene FFmpeg/Piper y libera el candado de exclusion.js),
// y el trabajo termina en estado 'cancelado' (no 'error'), dejando el gestor LIBRE para el siguiente. Devuelve una promesa con
// { cancelado, estado } que espera (hasta esperarMs) a que el trabajo realmente termine.
// Estados: libre | corriendo | ok | error | cancelado.
// ---------------------------------------------------------------------------
import { logger } from './utils/logger.js';

export const TIPOS_CANCELABLES = Object.freeze(['produccion', 'franja']);

export function crearGestor() {
  let actual = null;
  let controlador = null;
  let terminado = Promise.resolve();
  const estado = () => (actual ? { ...actual } : { tipo: null, estado: 'libre' });

  function iniciar(tipo, fn) {
    if (actual && actual.estado === 'corriendo') return false;
    const ctl = new AbortController();
    controlador = ctl;
    const mio = { tipo, estado: 'corriendo', etapa: 'Iniciando', progreso: 0, cancelando: false, inicio: new Date().toISOString(), fin: null, resultado: null, error: null };
    actual = mio;
    const avance = (etapa, progreso) => { if (actual === mio) { if (etapa) mio.etapa = String(etapa); if (Number.isFinite(progreso)) mio.progreso = Math.max(0, Math.min(100, Math.round(progreso))); } };
    terminado = Promise.resolve()
      .then(() => { if (ctl.signal.aborted) throw new Error('Produccion cancelada.'); return fn({ senal: ctl.signal, avance }); })   // cancelado antes de arrancar: ni se empieza
      .then((resultado) => { mio.estado = 'ok'; mio.etapa = 'Listo'; mio.progreso = 100; mio.resultado = resultado ?? null; })
      .catch((error) => {
        if (ctl.signal.aborted) {
          mio.estado = 'cancelado';
          mio.etapa = 'Cancelado';
          mio.error = 'Produccion cancelada.';
          return;
        }
        mio.estado = 'error';
        mio.error = error && error.message ? error.message : String(error);
        logger.warn('Trabajo de guion fallido', { tipo, mensaje: mio.error });
      })
      .finally(() => { mio.cancelando = false; mio.fin = new Date().toISOString(); });
    return true;
  }

  function cancelar({ esperarMs = 0 } = {}) {
    if (!(controlador && actual && actual.estado === 'corriendo')) return Promise.resolve({ cancelado: false, estado: estado() });
    actual.cancelando = true;
    controlador.abort();
    const esperado = terminado;
    const espera = esperarMs > 0
      ? Promise.race([esperado, new Promise((r) => setTimeout(r, esperarMs))])
      : Promise.resolve();
    return espera.then(() => ({ cancelado: true, estado: estado() }));
  }

  return { iniciar, estado, cancelar };
}

export const gestor = crearGestor();

// ---------------------------------------------------------------------------
// Un solo trabajo pesado de guion/produccion a la vez (generar guion con Ollama o producir video con Piper + FFmpeg), con su estado en
// memoria para que el panel lo consulte. La RAM no alcanza para dos; ademas exclusion.js serializa Ollama/FFmpeg por dentro.
// `iniciar(tipo, fn)` devuelve false si ya hay uno corriendo; fn recibe ({ senal, avance }) y su resultado queda en estado().resultado.
// ---------------------------------------------------------------------------
import { logger } from './utils/logger.js';

export function crearGestor() {
  let actual = null;
  let controlador = null;
  const estado = () => (actual ? { ...actual } : { tipo: null, estado: 'libre' });
  function iniciar(tipo, fn) {
    if (actual && actual.estado === 'corriendo') return false;
    controlador = new AbortController();
    const mio = { tipo, estado: 'corriendo', etapa: 'Iniciando', progreso: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null };
    actual = mio;
    const avance = (etapa, progreso) => { if (actual === mio) { if (etapa) mio.etapa = String(etapa); if (Number.isFinite(progreso)) mio.progreso = Math.max(0, Math.min(100, Math.round(progreso))); } };
    Promise.resolve()
      .then(() => fn({ senal: controlador.signal, avance }))
      .then((resultado) => { mio.estado = 'ok'; mio.etapa = 'Listo'; mio.progreso = 100; mio.resultado = resultado ?? null; })
      .catch((error) => { mio.estado = 'error'; mio.error = error && error.message ? error.message : String(error); logger.warn('Trabajo de guion fallido', { tipo, mensaje: mio.error }); })
      .finally(() => { mio.fin = new Date().toISOString(); });
    return true;
  }
  const cancelar = () => { if (controlador && actual && actual.estado === 'corriendo') controlador.abort(); };
  return { iniciar, estado, cancelar };
}

export const gestor = crearGestor();

import { logger } from '../utils/logger.js';
import { store } from '../storage/store.js';
import { procesarClip } from './pipeline.js';
import { detalleDeError } from '../utils/run.js';
import { contextoTrabajo } from '../contexto-trabajo.js';
import { exclusion } from './exclusion.js';

const pendientes = [];
let ejecutando = false;
let detenido = false;
let controladorActual = null;
let procesador = procesarClip;

/** Solo para pruebas: cambia la funcion que procesa cada trabajo. Devuelve una funcion que la restaura. */
export function fijarProcesador(fn) {
  const anterior = procesador;
  procesador = typeof fn === 'function' ? fn : procesarClip;
  return () => { procesador = anterior; };
}

async function ejecutar(trabajo) {
  const controlador = new AbortController();
  controladorActual = controlador;
  logger.info('Trabajo iniciado', { id: trabajo.id, inicio: trabajo.inicio, duracion: trabajo.duracion, modo: trabajo.modo });

  try {
    // Exclusion mutua con Ollama: mientras el modelo esta cargado no arranca FFmpeg (y al reves). pipeline.js no se toca.
    await exclusion.ejecutar('ffmpeg', () => contextoTrabajo.run(trabajo, () => procesador(trabajo, controlador.signal)), { signal: controlador.signal });
    logger.info('Trabajo completado', { id: trabajo.id });
  } catch (error) {
    const detalle = detalleDeError(error);
    logger.error('Trabajo fallido', { id: trabajo.id, mensaje: error.message, detalle: detalle.slice(-1500) });
    store.fallarTrabajo(trabajo.id, error.message, detalle);
  } finally {
    controladorActual = null;
  }
}

async function bucle() {
  try {
    while (!detenido && pendientes.length > 0) {
      const trabajo = pendientes.shift();
      await ejecutar(trabajo);
    }
  } finally {
    ejecutando = false;
  }
}

function despertar() {
  if (ejecutando || detenido) return;
  ejecutando = true;
  setImmediate(() => {
    bucle().catch((error) => logger.error('Error en el bucle de la cola', error));
  });
}

export function agregarTrabajo(trabajo) {
  pendientes.push(trabajo);
  despertar();
}

/** Copia de los trabajos que esperan turno (para pruebas y diagnostico). */
export function trabajosPendientes() {
  return pendientes.map((trabajo) => ({ ...trabajo }));
}

export function cargaActual() {
  return pendientes.length + (controladorActual ? 1 : 0);
}

export function detenerCola() {
  detenido = true;
  if (controladorActual) {
    controladorActual.abort();
  }
}

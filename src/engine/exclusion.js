// ---------------------------------------------------------------------------
// Exclusion mutua Ollama <-> FFmpeg. En la laptop (16 GB, Intel UHD 620) un modelo 7B y un render NO caben a la vez:
// este candado deja pasar UN solo trabajo pesado por vez, en orden de llegada (FIFO).
//   exclusion.ejecutar('ollama', fn)   -> lo usa src/ollama.js en cada chat()
//   exclusion.ejecutar('ffmpeg', fn)   -> lo usa src/engine/cola.js alrededor de procesarClip (sin editar pipeline.js)
// Es reentrante: si el codigo que ya tiene el candado vuelve a pedirlo (p. ej. un guion dentro de un trabajo), pasa directo
// (es la misma tarea, no hay paralelismo) y no se bloquea a si mismo. Una espera se puede cancelar con { signal }.
// Modulo puro: sin disco, sin red y sin config.
// ---------------------------------------------------------------------------
import { AsyncLocalStorage } from 'node:async_hooks';

export const RECURSOS = Object.freeze(['ollama', 'ffmpeg']);

export function crearExclusion() {
  const dueno = new AsyncLocalStorage();
  const espera = [];
  let ocupado = null;   // { recurso, id }
  let secuencia = 0;

  function liberar() {
    const siguiente = espera.shift();
    if (siguiente) {
      ocupado = siguiente.token;
      siguiente.despertar();
    } else {
      ocupado = null;
    }
  }

  async function ejecutar(recurso, fn, { signal } = {}) {
    if (!RECURSOS.includes(recurso)) throw new Error('Recurso desconocido para la exclusion: ' + String(recurso));
    if (typeof fn !== 'function') throw new TypeError('ejecutar() necesita una funcion');
    if (dueno.getStore()) return fn();   // reentrante: ya se tiene el candado

    if (signal && signal.aborted) throw signal.reason ?? new Error('Cancelado');
    const token = { recurso, id: ++secuencia };

    await new Promise((resolver, rechazar) => {
      if (!ocupado) {
        ocupado = token;
        resolver();
        return;
      }
      const item = { token, despertar: resolver };
      if (signal) {
        item.alAbortar = () => {
          const i = espera.indexOf(item);
          if (i >= 0) espera.splice(i, 1);
          rechazar(signal.reason ?? new Error('Cancelado'));
        };
        signal.addEventListener('abort', item.alAbortar, { once: true });
        const despertar = item.despertar;
        item.despertar = () => { signal.removeEventListener('abort', item.alAbortar); despertar(); };
      }
      espera.push(item);
    });

    try {
      return await dueno.run(token, fn);
    } finally {
      liberar();
    }
  }

  return {
    ejecutar,
    estado: () => ({ ocupado: ocupado ? ocupado.recurso : null, esperando: espera.map((e) => e.token.recurso) }),
  };
}

/** Candado compartido de toda la aplicacion. */
export const exclusion = crearExclusion();
export const conOllama = (fn, opciones) => exclusion.ejecutar('ollama', fn, opciones);
export const conFfmpeg = (fn, opciones) => exclusion.ejecutar('ffmpeg', fn, opciones);

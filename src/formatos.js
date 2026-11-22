// ---------------------------------------------------------------------------
// Formatos de salida de la produccion desde video fuente (Parte 6B). Modulo puro: sin disco, sin red, sin ffmpeg.
//   vertical   9:16  1080x1920  (Reels / Shorts; es el formato base del sistema)
//   horizontal 16:9  1920x1080  (youtube_long u otros usos apaisados)
// Ambos tienen casi los mismos pixeles por cuadro, asi que el costo de CPU/RAM del render es parecido (una sola pasada, sin buffers grandes).
// Los porcentajes de titulo y margenes son valores iniciales de diseno, editables aqui.
// ---------------------------------------------------------------------------

export class ErrorFormato extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorFormato';
    this.status = 400;
  }
}

export const FORMATOS = Object.freeze({
  vertical: Object.freeze({
    id: 'vertical', nombre: 'Vertical 9:16', relacion: '9:16', ancho: 1080, alto: 1920,
    tituloPct: 0.034,       // tamano base del titulo = 3.4 % del alto
    tituloAltoMaxPct: 0.12, // el bloque del titulo no pasa del 12 % del alto
    margen: Object.freeze({ superior: 0.11, inferior: 0.14 }),   // distancia del titulo al borde (fraccion del alto)
    sufijo: '',
  }),
  horizontal: Object.freeze({
    id: 'horizontal', nombre: 'Horizontal 16:9', relacion: '16:9', ancho: 1920, alto: 1080,
    tituloPct: 0.055,
    tituloAltoMaxPct: 0.22,
    margen: Object.freeze({ superior: 0.15, inferior: 0.17 }),
    sufijo: '-16x9',
  }),
});

export const FORMATO_DEFECTO = 'vertical';
export const IDS_FORMATOS = Object.freeze(Object.keys(FORMATOS));

const ALIAS = Object.freeze({
  vertical: 'vertical', '9:16': 'vertical', '9x16': 'vertical', '916': 'vertical',
  horizontal: 'horizontal', '16:9': 'horizontal', '16x9': 'horizontal', '169': 'horizontal', apaisado: 'horizontal',
});

/** Vacio -> vertical (el formato base heredado). Un valor desconocido es ErrorFormato (400): nunca se adivina. */
export function normalizarFormato(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return FORMATO_DEFECTO;
  const clave = String(valor).trim().toLowerCase();
  const id = Object.hasOwn(ALIAS, clave) ? ALIAS[clave] : null;
  if (!id) throw new ErrorFormato('Formato no valido: ' + clave.slice(0, 16) + '. Usa ' + IDS_FORMATOS.join(' o ') + '.');
  return id;
}

export const formatoDe = (valor) => FORMATOS[normalizarFormato(valor)];

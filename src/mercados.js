// ---------------------------------------------------------------------------
// Mercados (idioma + region) de ClipLab Pro en modo local. Modulo puro: sin disco, sin red y sin config.
//
//   en-US  principal: el contenido nace en ingles para EE. UU. (alto CPM).
//   es-US  subcanal: la version en espanol para EE. UU.; deriva de en-US y reutiliza el render base cuando aplica
//          (ver src/plan-renders.js).
// ---------------------------------------------------------------------------

function congelar(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(congelar);
    Object.freeze(obj);
  }
  return obj;
}

export class ErrorMercado extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorMercado';
    this.status = 400;   // el manejador de errores de Express ya respeta e.status
  }
}

export const MERCADOS = congelar({
  'en-US': {
    id: 'en-US',
    idioma: 'en',
    region: 'US',
    nombre: 'Ingles (EE. UU.)',
    rol: 'principal',
    derivaDe: null,
    locale: 'en-US',
    whisperLang: 'en',
  },
  'es-US': {
    id: 'es-US',
    idioma: 'es',
    region: 'US',
    nombre: 'Espanol (EE. UU.)',
    rol: 'sub',
    derivaDe: 'en-US',
    locale: 'es-US',
    whisperLang: 'es',
  },
});

export const IDS_MERCADOS = Object.freeze(Object.keys(MERCADOS));
export const MERCADO_PRINCIPAL = 'en-US';

/** Capas de un render que dependen del idioma: si el clip lleva alguna, cada mercado necesita su propio render. */
export const CAPAS_POR_IDIOMA = Object.freeze(['voz', 'subtitulos', 'titulo_pantalla', 'ficha']);

// "en-us", "EN_US" y " en-US " son el mismo mercado.
const clave = (valor) => String(valor ?? '').trim().toLowerCase().replace(/_/g, '-');
const POR_CLAVE = new Map(IDS_MERCADOS.map((id) => [clave(id), id]));

export function normalizarMercado(valor) {
  const id = POR_CLAVE.get(clave(valor));
  if (!id) {
    const visto = String(valor ?? '').trim().slice(0, 20);
    throw new ErrorMercado('Mercado no valido' + (visto ? ': ' + visto : '') + '. Usa: ' + IDS_MERCADOS.join(', ') + '.');
  }
  return id;
}

/**
 * Acepta arreglo (["en-US","es-US"]) o texto ("en-US, es-US" | "en-US es-US").
 * Devuelve los mercados validos, sin duplicados y en el orden del catalogo (el principal primero).
 * Con requerido=false, "ninguno" es valido ([]).
 */
export function normalizarMercados(valor, { requerido = true } = {}) {
  let lista;
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === 'string') lista = valor.split(/[,\s;|]+/);
  else lista = [];
  const ids = [...new Set(lista.filter((x) => String(x ?? '').trim()).map(normalizarMercado))];
  if (!ids.length && requerido) throw new ErrorMercado('Elige al menos un mercado: ' + IDS_MERCADOS.join(', ') + '.');
  return IDS_MERCADOS.filter((id) => ids.includes(id));
}

export const esPrincipal = (valor) => normalizarMercado(valor) === MERCADO_PRINCIPAL;
export const mercadoDe = (valor) => MERCADOS[normalizarMercado(valor)];

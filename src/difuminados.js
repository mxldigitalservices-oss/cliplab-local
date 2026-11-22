// ---------------------------------------------------------------------------
// Difuminados (blur) ajustables para sports y news (Parte 6B). Sustituyen a las franjas rigidas de la Parte 6A.
// Modulo puro: sin disco, sin red, sin ffmpeg y SIN importar canales.js (canales.js importa este modulo para validar sus sugeridos).
//
// Un difuminado es un rectangulo del CUADRO DE SALIDA, en fracciones (0..1), que se desenfoca para tapar un logo ajeno sin tocar el resto:
//   { id, etiqueta, x, y, ancho, alto, fuerza, desde, hasta, activo }
//     x, y        esquina superior izquierda (fraccion del ancho / del alto)
//     ancho, alto fraccion del cuadro (minimo TAM_MIN; se acomodan dentro del cuadro)
//     fuerza      1 (suave) .. 10 (muy fuerte)
//     desde/hasta segundos DESDE EL INICIO DEL TRAMO en que esta activo (null = todo el tramo)
//     activo      false = se conserva en la lista pero no se dibuja (el editor puede apagarlo sin borrarlo)
// Como van en fracciones del cuadro de salida, sirven igual en vertical 9:16 y en horizontal 16:9, y el mini editor de la Parte 7
// solo tiene que arrastrar / redimensionar rectangulos y guardar este mismo objeto: { version: 1, regiones: [...] }.
//
// Limites que protegen la informacion visual y la CPU (8 GB de RAM): MAX_REGIONES, AREA_MAX (suma de areas activas) y un aviso cuando
// un difuminado invade la zona central (donde suele estar la accion).
// ---------------------------------------------------------------------------

export class ErrorDifuminado extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDifuminado';
    this.status = 400;
  }
}

export const VERSION = 1;
export const MAX_REGIONES = 8;
export const AREA_MAX = 0.35;                 // suma de areas de los difuminados activos <= 35 % del cuadro
export const TAM_MIN = 0.03;                  // ancho y alto minimos (fraccion)
export const FUERZA = Object.freeze({ min: 1, max: 10, defecto: 6 });
export const ZONA_CENTRAL = Object.freeze({ x0: 0.2, x1: 0.8, y0: 0.25, y1: 0.75 });
export const MAX_ETIQUETA = 24;
export const MAX_TIEMPO = 3600;

const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r4 = (n) => Math.round(n * 10000) / 10000;
const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const vacio = (v) => v === undefined || v === null || v === '';

function numero(valor, nombre, indice) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ErrorDifuminado('Difuminado ' + (indice + 1) + ': ' + nombre + ' debe ser un numero.');
  return n;
}

function tiempo(valor, nombre, indice) {
  if (vacio(valor)) return null;
  const n = numero(valor, nombre, indice);
  if (n < 0 || n > MAX_TIEMPO) throw new ErrorDifuminado('Difuminado ' + (indice + 1) + ': ' + nombre + ' debe estar entre 0 y ' + MAX_TIEMPO + ' s.');
  return r4(n);
}

/** Sanea UN difuminado (sin id unico: eso lo resuelve sanearDifuminados). Un rectangulo que se sale del cuadro se acomoda dentro. */
export function sanearRegion(raw, indice = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ErrorDifuminado('Difuminado ' + (indice + 1) + ' debe ser un objeto { x, y, ancho, alto }.');
  const ancho = acotar(numero(raw.ancho, 'ancho', indice), TAM_MIN, 1);
  const alto = acotar(numero(raw.alto, 'alto', indice), TAM_MIN, 1);
  const x = acotar(numero(raw.x, 'x', indice), 0, 1 - ancho);
  const y = acotar(numero(raw.y, 'y', indice), 0, 1 - alto);
  let fuerza = vacio(raw.fuerza) ? FUERZA.defecto : Math.round(numero(raw.fuerza, 'fuerza', indice));
  fuerza = acotar(fuerza, FUERZA.min, FUERZA.max);
  const desde = tiempo(raw.desde, 'desde', indice);
  const hasta = tiempo(raw.hasta, 'hasta', indice);
  if (desde !== null && hasta !== null && hasta <= desde) throw new ErrorDifuminado('Difuminado ' + (indice + 1) + ': hasta debe ser mayor que desde.');
  const etiqueta = String(raw.etiqueta ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ETIQUETA);
  const id = typeof raw.id === 'string' && ID_VALIDO.test(raw.id.trim().toLowerCase()) ? raw.id.trim().toLowerCase() : '';
  return { id, etiqueta, x: r4(x), y: r4(y), ancho: r4(ancho), alto: r4(alto), fuerza, desde, hasta, activo: raw.activo !== false && raw.activo !== 'false' };
}

const area = (r) => r.ancho * r.alto;
function interseccion(a, b) {
  const w = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Acepta lista, { regiones: [...] } o texto JSON. Devuelve el arreglo crudo (puede ser vacio). */
function extraerLista(raw) {
  let v = raw;
  if (typeof v === 'string') {
    if (!v.trim()) return [];
    try { v = JSON.parse(v); } catch { throw new ErrorDifuminado('Los difuminados no son un JSON valido.'); }
  }
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.regiones)) return v.regiones;
  if (v && typeof v === 'object' && v.regiones === undefined) return [];
  throw new ErrorDifuminado('Los difuminados deben ser una lista o { regiones: [...] }.');
}

/**
 * Valida y normaliza. Devuelve { version, regiones, avisos }. Lanza ErrorDifuminado (400) si hay demasiados, si tapan demasiado
 * del cuadro o si algun dato no es numerico. Los ids repetidos o ausentes se reasignan (d1, d2...).
 */
export function sanearDifuminados(raw) {
  const lista = extraerLista(raw);
  if (lista.length > MAX_REGIONES) throw new ErrorDifuminado('Demasiados difuminados (' + lista.length + '): el maximo es ' + MAX_REGIONES + '.');
  const usados = new Set();
  let contador = 0;
  const regiones = lista.map((r, i) => {
    const s = sanearRegion(r, i);
    let id = s.id;
    while (!id || usados.has(id)) id = 'd' + (++contador);
    usados.add(id);
    return { ...s, id };
  });

  const activas = regiones.filter((r) => r.activo);
  const total = activas.reduce((s, r) => s + area(r), 0);
  if (total > AREA_MAX + 1e-9) throw new ErrorDifuminado('Los difuminados tapan el ' + Math.round(total * 100) + ' % del cuadro; el maximo es ' + Math.round(AREA_MAX * 100) + ' % para no perder informacion visual.');

  const avisos = [];
  const central = { x: ZONA_CENTRAL.x0, y: ZONA_CENTRAL.y0, ancho: ZONA_CENTRAL.x1 - ZONA_CENTRAL.x0, alto: ZONA_CENTRAL.y1 - ZONA_CENTRAL.y0 };
  for (const r of activas) {
    if (interseccion(r, central) > 0.25 * area(r)) avisos.push('El difuminado "' + (r.etiqueta || r.id) + '" cubre la zona central del video, donde suele estar la accion; revisa que no tape nada importante.');
  }
  for (let i = 0; i < activas.length; i++) {
    for (let j = i + 1; j < activas.length; j++) {
      const solape = interseccion(activas[i], activas[j]);
      const menor = Math.min(area(activas[i]), area(activas[j]));
      const mismoTiempo = !(activas[i].hasta !== null && activas[j].desde !== null && activas[i].hasta <= activas[j].desde) && !(activas[j].hasta !== null && activas[i].desde !== null && activas[j].hasta <= activas[i].desde);
      if (mismoTiempo && solape > 0.5 * menor) avisos.push('Los difuminados "' + (activas[i].etiqueta || activas[i].id) + '" y "' + (activas[j].etiqueta || activas[j].id) + '" se solapan mucho.');
    }
  }
  return { version: VERSION, regiones, avisos };
}

/**
 * Une los difuminados sugeridos con lo que pide quien produce:
 *   pedido ausente (undefined/null)            -> los sugeridos tal cual
 *   pedido = lista o { regiones }              -> SOLO esos (lista vacia = sin difuminados, a proposito)
 *   pedido = { usarSugeridos: true, regiones } -> sugeridos + los agregados (el tope y el area siguen valiendo)
 * `sugeridos` es una lista cruda (la de CANALES.<canal>.difuminados.regiones[formato]).
 */
export function resolverDifuminados(pedido, sugeridos = []) {
  if (pedido === undefined || pedido === null) return sanearDifuminados(sugeridos);
  let v = pedido;
  if (typeof v === 'string') {
    if (!v.trim()) return sanearDifuminados(sugeridos);
    try { v = JSON.parse(v); } catch { throw new ErrorDifuminado('Los difuminados no son un JSON valido.'); }
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && (v.usarSugeridos === true || v.usarSugeridos === 'true')) {
    const extra = extraerLista(v);
    return sanearDifuminados([...sugeridos, ...extra]);
  }
  return sanearDifuminados(v);
}

/** Rectangulo en pixeles del cuadro ancho x alto (valores pares y dentro del cuadro). */
export function regionAPixeles(region, ancho, alto) {
  let w = Math.min(ancho, par(region.ancho * ancho));
  let h = Math.min(alto, par(region.alto * alto));
  w -= w % 2; h -= h % 2;
  let x = Math.round(region.x * ancho); x -= x % 2;
  let y = Math.round(region.y * alto); y -= y % 2;
  x = Math.min(x, ancho - w);
  y = Math.min(y, alto - h);
  return { x, y, w, h };
}

/**
 * Como se desenfoca un rectangulo de w x h: se reduce k veces, se aplica un boxblur de radio `radio` y se vuelve al tamano original.
 * Es barato en CPU (el desenfoque trabaja sobre pocos pixeles) y k / radio se acotan para que boxblur nunca falle en rectangulos chicos
 * (el radio debe caber en el plano de croma: <= min(wk, hk) / 4).
 */
export function parametrosDeBlur(w, h, fuerza = FUERZA.defecto) {
  const f = acotar(Math.round(Number(fuerza) || FUERZA.defecto), FUERZA.min, FUERZA.max);
  const menor = Math.min(w, h);
  const k = Math.max(1, Math.min(2 + f, Math.floor(menor / 8)));
  const wk = par(w / k);
  const hk = par(h / k);
  const radio = Math.max(1, Math.min(Math.round(f / 2), Math.floor(Math.min(wk, hk) / 4)));
  return { k, wk, hk, radio };
}

/** Difuminados ya saneados -> lista con pixeles y parametros de blur para el render (solo los activos). */
export function geometriaDeDifuminados(regiones, ancho, alto) {
  return regiones.filter((r) => r.activo).map((r) => {
    const px = regionAPixeles(r, ancho, alto);
    return { ...r, px, blur: parametrosDeBlur(px.w, px.h, r.fuerza) };
  });
}

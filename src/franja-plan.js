// ---------------------------------------------------------------------------
// Plan del canal SPORTS y NEWS a partir de un VIDEO FUENTE real (Parte 6A, reescrito en la 6B). Modulo puro: sin disco, sin red, sin ffmpeg.
// Ya NO hay franjas rigidas que tapan una banda entera del video: cada canal sugiere difuminados (blur) pequenos sobre las esquinas donde
// suelen estar los logos ajenos (CANALES.<canal>.difuminados), y quien produce los puede ajustar, apagar o sumar (src/difuminados.js).
// El titulo con gancho va en un cajon translucido del tamano del texto (no a todo lo ancho), arriba o abajo segun el canal.
// Todo se calcula para un FORMATO (vertical 9:16 u horizontal 16:9, src/formatos.js) y para un RANGO del video fuente (src/rango.js).
// El titulo y el mercado nunca se adivinan: sin titulo o sin mercado valido es un error 400 claro. stories NO usa esto (ErrorFranja).
// Un video por mercado (el titulo va quemado: en-US y es-US no comparten archivo). Los numeros son valores iniciales editables.
// ---------------------------------------------------------------------------
import { CANALES, ErrorCanal, normalizarCanal } from './canales.js';
import { MERCADO_PRINCIPAL, normalizarMercado } from './mercados.js';
import { formatoDe, FORMATOS } from './formatos.js';
import { geometriaDeDifuminados, resolverDifuminados } from './difuminados.js';
import { ErrorRango, normalizarRango } from './rango.js';

export class ErrorFranja extends ErrorCanal {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorFranja';
  }
}

export const ANCHO = FORMATOS.vertical.ancho;
export const ALTO = FORMATOS.vertical.alto;
export const TITULO_MIN = 8;
export const TITULO_MAX = 90;
export const MAX_LINEAS = 3;
export const POSICIONES_TITULO = Object.freeze(['superior', 'inferior']);
export const CANALES_CON_FRANJA = Object.freeze(Object.keys(CANALES).filter((id) => CANALES[id].difuminados));
export const CANALES_CON_DIFUMINADOS = CANALES_CON_FRANJA;

const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function perfilConDifuminados(valor) {
  const id = normalizarCanal(valor);
  const difuminados = CANALES[id].difuminados;
  if (!difuminados) {
    throw new ErrorFranja('El canal ' + id + ' no usa difuminados ni titulo sobre video fuente (usa su propia produccion). Canales con difuminados: ' + CANALES_CON_FRANJA.join(', ') + '.');
  }
  return { id, config: difuminados, perfil: CANALES[id] };
}

/** Sugeridos (crudos) de un canal para un formato. Lanza ErrorCanal / ErrorFormato (400) si el canal no usa difuminados o el formato no existe. */
export function difuminadosSugeridos(canal, formato) {
  const { config } = perfilConDifuminados(canal);
  return JSON.parse(JSON.stringify(config.regiones[formatoDe(formato).id]));
}

/**
 * Limpia el titulo con gancho. Devuelve { texto, avisos }. Lanza ErrorFranja si falta o es demasiado corto.
 * news es serio: sin gritar (TODO MAYUSCULAS se pasa a frase normal) y sin signos de exclamacion.
 */
export function ganchoDeTitulo(titulo, { canal } = {}) {
  const id = normalizarCanal(canal);
  const avisos = [];
  let texto = String(titulo ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  texto = texto.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
  if (!texto) throw new ErrorFranja('Falta el titulo con gancho.');

  const letras = texto.replace(/[^\p{L}]/gu, '');
  const mayus = letras.replace(/[^\p{Lu}]/gu, '');
  if (id === 'news' && letras.length >= 8 && mayus.length / letras.length > 0.7) {
    const minuscula = texto.toLowerCase();
    texto = minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    avisos.push('El titulo estaba en mayusculas: noticias va con tono serio, se paso a frase normal (revisa los nombres propios).');
  }
  texto = texto.replace(/([!?.])\1+/g, '$1');
  if (id === 'news' && texto.includes('!')) {
    texto = texto.replace(/!/g, '').trim();
    avisos.push('Noticias no usa signos de exclamacion: se quitaron del titulo.');
  }
  if (texto.length < TITULO_MIN) throw new ErrorFranja('El titulo es demasiado corto (minimo ' + TITULO_MIN + ' caracteres).');
  if (texto.length > TITULO_MAX) {
    const corte = texto.slice(0, TITULO_MAX - 1);
    const espacio = corte.lastIndexOf(' ');
    texto = (espacio > TITULO_MAX * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s.,;:]+$/, '') + '…';
    avisos.push('El titulo pasaba de ' + TITULO_MAX + ' caracteres: se recorto.');
  }
  return { texto, avisos };
}

/** Parte el texto en lineas de hasta `maxChars` (por palabras). Si no caben en `maxLineas`, la ultima termina en "…". */
export function lineasDeTitulo(texto, { maxChars, maxLineas = MAX_LINEAS } = {}) {
  const limite = Math.max(8, Math.floor(maxChars));
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p0 of palabras) {
    const p = p0.length > limite ? p0.slice(0, limite - 1) + '…' : p0;   // palabra enorme: nunca desborda el cuadro
    if (!actual) actual = p;
    else if ((actual + ' ' + p).length <= limite) actual += ' ' + p;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLineas) return lineas;
  const dentro = lineas.slice(0, maxLineas);
  const ultima = dentro[maxLineas - 1].replace(/[\s.,;:…]+$/, '');
  dentro[maxLineas - 1] = (ultima.length >= limite ? ultima.slice(0, limite - 1) : ultima) + '…';
  return dentro;
}

/**
 * Geometria completa de un video para un canal con difuminados.
 *   formato        'vertical' (defecto) | 'horizontal'
 *   difuminados    ausente = los sugeridos del canal para ese formato; lista o { regiones } = solo esos (vacia = ninguno);
 *                  { usarSugeridos: true, regiones } = sugeridos + los agregados
 *   posicionTitulo 'superior' | 'inferior' (por defecto la del canal)
 * Devuelve { canal, formato, relacion, ancho, alto, tapaLogos, difuminados:{version, regiones}, geometria, titulo, avisos }.
 *   difuminados = la estructura EDITABLE (la que el mini editor de la Parte 7 guarda y devuelve); geometria = lo que dibuja el render.
 */
export function planDeFranja({ canal, titulo, formato, difuminados, posicionTitulo, ancho, alto } = {}) {
  const { id, config } = perfilConDifuminados(canal);
  const fmt = formatoDe(formato);
  const W = par(ancho ?? fmt.ancho);
  const H = par(alto ?? fmt.alto);
  const gancho = ganchoDeTitulo(titulo, { canal: id });
  const avisos = [...gancho.avisos];

  const d = resolverDifuminados(difuminados, config.regiones[fmt.id]);
  avisos.push(...d.avisos);
  const geometria = geometriaDeDifuminados(d.regiones, W, H);
  if (config.tapaLogos && !geometria.length) avisos.push('No hay difuminados activos: los logos ajenos del video fuente quedan visibles.');

  const posicion = posicionTitulo === undefined || posicionTitulo === null || posicionTitulo === '' ? config.titulo.posicion : String(posicionTitulo).trim().toLowerCase();
  if (!POSICIONES_TITULO.includes(posicion)) throw new ErrorFranja('Posicion del titulo no valida: ' + posicion.slice(0, 16) + '. Usa ' + POSICIONES_TITULO.join(' o ') + '.');

  // El tamano baja hasta que las lineas quepan en el alto maximo del formato (minimo 65 % del tamano inicial).
  const maxAncho = W * 0.86;
  const tamInicial = Math.round(H * fmt.tituloPct);
  const minTam = Math.max(8, Math.round(tamInicial * 0.65));
  let tam = tamInicial;
  let lineas;
  for (;;) {
    lineas = lineasDeTitulo(gancho.texto, { maxChars: maxAncho / (tam * 0.58) });
    if (lineas.length * tam * 1.25 <= H * fmt.tituloAltoMaxPct || tam <= minTam) break;
    tam -= 2;
  }
  const bloque = lineas.length * tam * 1.25;
  const yInicio = posicion === 'superior' ? Math.round(H * fmt.margen.superior) : Math.round(H * (1 - fmt.margen.inferior) - bloque);
  const tituloPlan = {
    texto: gancho.texto, lineas, tam, interlineado: Math.round(tam * 1.25), color: 'white', borde: Math.max(2, Math.round(tam * 0.05)),
    caja: Math.min(0.8, Math.max(0, Number(config.titulo.caja) || 0)), cajaMargen: Math.max(2, Math.round(tam * 0.25)), yInicio, posicion,
  };

  return { canal: id, formato: fmt.id, relacion: fmt.relacion, ancho: W, alto: H, tapaLogos: Boolean(config.tapaLogos), difuminados: { version: d.version, regiones: d.regiones }, geometria, titulo: tituloPlan, avisos };
}

/**
 * Plan de produccion de un video fuente para un canal con difuminados.
 * entradas: [{ mercado, titulo, fuente: { archivo, inicio?, fin?, duracion?, marcas? }, difuminados?, posicionTitulo?, modo? }]
 *   (un titulo por mercado; la fuente puede repetirse; el formato es uno solo por produccion).
 * Devuelve { id, canal, formato, mercados:[{ mercado, archivo, titulo, modo, fuente, franja }], resumen:{ renders, formato }, avisos }
 * con el mercado principal primero. Salida: <canal>-<id>-<mercado>.mp4 (horizontal agrega -16x9).
 */
export function planDeProduccionFranja({ id, canal, formato, entradas } = {}) {
  const idCanal = normalizarCanal(canal);
  const { perfil } = perfilConDifuminados(idCanal);
  const fmt = formatoDe(formato);
  const proyecto = String(id ?? '').trim().toLowerCase();
  if (!ID_VALIDO.test(proyecto)) throw new ErrorFranja('Falta el id del proyecto o no es valido (a-z, 0-9, _ y -; maximo 64).');
  if (!Array.isArray(entradas) || !entradas.length) throw new ErrorFranja('Indica al menos una entrada { mercado, titulo, fuente }.');

  const avisos = [];
  const vistos = new Set();
  const mercados = entradas.map((e, i) => {
    const m = normalizarMercado(e && e.mercado);
    if (vistos.has(m)) throw new ErrorFranja('Mercado repetido: ' + m + '. Un video por mercado.');
    vistos.add(m);
    if (!perfil.mercados.includes(m)) throw new ErrorFranja('El canal ' + idCanal + ' no admite el mercado ' + m + '.');
    const f = e.fuente;
    const archivo = f && typeof f === 'object' ? String(f.archivo ?? '').trim() : '';
    if (!archivo || archivo.includes('\u0000')) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): falta fuente.archivo.');
    let rango;
    try { rango = normalizarRango(f); } catch (error) {
      if (error instanceof ErrorRango) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): ' + error.message);
      throw error;
    }
    const modo = e.modo === undefined || e.modo === null || e.modo === '' ? perfil.trabajo.modo : String(e.modo).trim().toLowerCase();
    if (!['recorte', 'blur'].includes(modo)) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): modo no valido (' + modo.slice(0, 12) + '). Usa recorte o blur.');
    const franja = planDeFranja({ canal: idCanal, titulo: e.titulo, formato: fmt.id, difuminados: e.difuminados, posicionTitulo: e.posicionTitulo });
    avisos.push(...franja.avisos.map((a) => m + ': ' + a));
    if (rango.duracion !== null) {
      const { segmentMinSeconds: min, segmentMaxSeconds: max } = perfil.ritmo;
      if (rango.duracion > max) avisos.push(m + ': el tramo dura ' + rango.duracion + ' s y el ritmo de ' + idCanal + ' recomienda hasta ' + max + ' s.');
      if (rango.duracion < min) avisos.push(m + ': el tramo dura ' + rango.duracion + ' s y el ritmo de ' + idCanal + ' recomienda al menos ' + min + ' s.');
    }
    return { mercado: m, archivo: idCanal + '-' + proyecto + '-' + m + fmt.sufijo + '.mp4', titulo: franja.titulo.texto, modo, fuente: { archivo, inicio: rango.inicio, fin: rango.fin, duracion: rango.duracion }, franja };
  });
  mercados.sort((a, b) => (a.mercado === MERCADO_PRINCIPAL ? -1 : b.mercado === MERCADO_PRINCIPAL ? 1 : 0));
  return { id: proyecto, canal: idCanal, formato: fmt.id, mercados, resumen: { renders: mercados.length, formato: fmt.id }, avisos };
}

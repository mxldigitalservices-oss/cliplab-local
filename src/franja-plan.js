// ---------------------------------------------------------------------------
// Plan del canal SPORTS y NEWS a partir de un VIDEO FUENTE real (Parte 6A). Modulo puro: sin disco, sin red, sin ffmpeg.
// Cada canal declara su franja en CANALES.<canal>.franja (posiciones, altoPct, color, opacidadMax, degradado, titulo, tapaLogos).
// Aqui se convierte esa configuracion + un titulo con gancho en GEOMETRIA concreta (pixeles) que el render dibuja:
//   - franja solida en cada posicion elegida (tapa los logos ajenos del video fuente) con degradado hacia el centro,
//   - el titulo con gancho en UNA de las franjas (la primera de las elegidas), en 1-3 lineas y con tamano ajustado al alto de la franja.
// El titulo y el mercado nunca se adivinan: sin titulo o sin mercado valido es un error 400 claro. stories NO usa franja (ErrorFranja).
// Un video por mercado (el titulo va quemado: en-US y es-US no comparten archivo). Todo el ritmo y numeros son valores editables.
// ---------------------------------------------------------------------------
import { CANALES, ErrorCanal, normalizarCanal } from './canales.js';
import { MERCADO_PRINCIPAL, normalizarMercado } from './mercados.js';

export class ErrorFranja extends ErrorCanal {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorFranja';
  }
}

export const ANCHO = 1080;
export const ALTO = 1920;
export const TITULO_MIN = 8;
export const TITULO_MAX = 90;
export const MAX_LINEAS = 3;
export const PASOS_DEGRADADO = 12;
export const FRACCION_DEGRADADO = 0.6;   // alto del degradado = 60 % del alto de la franja, hacia el centro del video
export const CANALES_CON_FRANJA = Object.freeze(Object.keys(CANALES).filter((id) => CANALES[id].franja));

const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function perfilConFranja(valor) {
  const id = normalizarCanal(valor);
  const franja = CANALES[id].franja;
  if (!franja) {
    throw new ErrorFranja('El canal ' + id + ' no usa franja (usa su propia produccion). Canales con franja: ' + CANALES_CON_FRANJA.join(', ') + '.');
  }
  return { id, franja, perfil: CANALES[id] };
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
  if (!texto) throw new ErrorFranja('Falta el titulo con gancho de la franja.');

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
    const p = p0.length > limite ? p0.slice(0, limite - 1) + '…' : p0;   // palabra enorme: nunca desborda la franja
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

const aHex = (color) => '0x' + String(color).replace('#', '').toUpperCase();

/**
 * Geometria de la franja para un canal. `posiciones` (opcional) = subconjunto de las que admite el canal; por defecto todas las del canal
 * (sports: superior + inferior; news: inferior). El titulo va en la PRIMERA franja elegida (la que el canal marca con titulo: true).
 */
export function planDeFranja({ canal, titulo, posiciones, ancho = ANCHO, alto = ALTO } = {}) {
  const { id, franja } = perfilConFranja(canal);
  const gancho = ganchoDeTitulo(titulo, { canal: id });
  const permitidas = franja.posiciones;
  let elegidas;
  if (posiciones === undefined || posiciones === null || (Array.isArray(posiciones) && !posiciones.length)) elegidas = [...permitidas];
  else {
    const lista = Array.isArray(posiciones) ? posiciones : String(posiciones).split(/[,\s;|]+/);
    const limpias = [...new Set(lista.map((p) => String(p ?? '').trim().toLowerCase()).filter(Boolean))];
    const malas = limpias.filter((p) => !permitidas.includes(p));
    if (malas.length) throw new ErrorFranja('Posicion no valida para ' + id + ': ' + malas.map((m) => m.slice(0, 16)).join(', ') + '. Usa: ' + permitidas.join(', ') + '.');
    elegidas = permitidas.filter((p) => limpias.includes(p));
  }

  const W = par(ancho);
  const H = par(alto);
  const altoBanda = par(H * franja.altoPct);
  const alturaDegradado = par(altoBanda * FRACCION_DEGRADADO);
  const color = aHex(franja.color);
  const opacidad = Math.min(1, Math.max(0, franja.opacidadMax));

  const bandas = elegidas.map((posicion) => {
    const y = posicion === 'superior' ? 0 : H - altoBanda;
    const degradado = franja.degradado
      ? {
          y: posicion === 'superior' ? altoBanda : H - altoBanda - alturaDegradado,
          alto: alturaDegradado,
          // de la franja hacia el centro: opaco junto a la franja y transparente en el borde interior (pasos escalonados)
          pasos: Array.from({ length: PASOS_DEGRADADO }, (_, k) => {
            const h = alturaDegradado / PASOS_DEGRADADO;
            const desdeBorde = posicion === 'superior' ? k : PASOS_DEGRADADO - 1 - k;   // 0 = pegado a la franja
            const y0 = posicion === 'superior' ? altoBanda : H - altoBanda - alturaDegradado;   // tiras contiguas, sin solaparse
            return { y: Math.round(y0 + k * h), alto: Math.round(y0 + (k + 1) * h) - Math.round(y0 + k * h), opacidad: Math.round(opacidad * (1 - (desdeBorde + 1) / (PASOS_DEGRADADO + 1)) * 1000) / 1000 };
          }),
        }
      : null;
    return { posicion, y, alto: altoBanda, ancho: W, color, opacidad, lleva: false, degradado };
  });
  const conTitulo = franja.titulo ? bandas[0] : null;
  if (conTitulo) conTitulo.lleva = true;

  // Titulo: el tamano baja hasta que las lineas quepan en el 86 % del alto de la franja (minimo 2.2 % del alto del video).
  let texto = null;
  if (conTitulo) {
    const maxAncho = W * 0.86;
    const minTam = Math.round(H * 0.022);
    let tam = Math.round(H * 0.034);
    let lineas;
    for (;;) {
      lineas = lineasDeTitulo(gancho.texto, { maxChars: maxAncho / (tam * 0.58) });
      if (lineas.length * tam * 1.25 <= altoBanda * 0.86 || tam <= minTam) break;
      tam -= 2;
    }
    const bloque = lineas.length * tam * 1.25;
    texto = {
      texto: gancho.texto,
      lineas,
      tam,
      interlineado: Math.round(tam * 1.25),
      color: 'white',
      borde: 3,
      yInicio: Math.round(conTitulo.y + (altoBanda - bloque) / 2),
      posicion: conTitulo.posicion,
    };
  }

  return { canal: id, ancho: W, alto: H, tapaLogos: Boolean(franja.tapaLogos), bandas, titulo: texto, avisos: gancho.avisos };
}

/**
 * Plan de produccion de un video fuente para un canal con franja.
 * entradas: [{ mercado, titulo, fuente: { archivo, inicio?, duracion? }, posiciones?, modo? }]  (un titulo por mercado; la fuente puede repetirse).
 * Devuelve { id, canal, mercados:[{ mercado, archivo, titulo, modo, fuente, franja }], resumen:{ renders }, avisos } con el mercado principal primero.
 */
export function planDeProduccionFranja({ id, canal, entradas } = {}) {
  const idCanal = normalizarCanal(canal);
  const { perfil } = perfilConFranja(idCanal);
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
    const inicio = f.inicio === undefined || f.inicio === null || f.inicio === '' ? 0 : Number(f.inicio);
    if (!Number.isFinite(inicio) || inicio < 0) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): fuente.inicio debe ser un numero >= 0.');
    let duracion = null;
    if (f.duracion !== undefined && f.duracion !== null && f.duracion !== '') {
      duracion = Number(f.duracion);
      if (!Number.isFinite(duracion) || duracion <= 0) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): fuente.duracion debe ser un numero > 0.');
    }
    const modo = e.modo === undefined || e.modo === null || e.modo === '' ? perfil.trabajo.modo : String(e.modo).trim().toLowerCase();
    if (!['recorte', 'blur'].includes(modo)) throw new ErrorFranja('Entrada ' + (i + 1) + ' (' + m + '): modo no valido (' + modo.slice(0, 12) + '). Usa recorte o blur.');
    const franja = planDeFranja({ canal: idCanal, titulo: e.titulo, posiciones: e.posiciones });
    avisos.push(...franja.avisos.map((a) => m + ': ' + a));
    if (duracion !== null) {
      const { segmentMinSeconds: min, segmentMaxSeconds: max } = perfil.ritmo;
      if (duracion > max) avisos.push(m + ': el tramo dura ' + duracion + ' s y el ritmo de ' + idCanal + ' recomienda hasta ' + max + ' s.');
      if (duracion < min) avisos.push(m + ': el tramo dura ' + duracion + ' s y el ritmo de ' + idCanal + ' recomienda al menos ' + min + ' s.');
    }
    return { mercado: m, archivo: idCanal + '-' + proyecto + '-' + m + '.mp4', titulo: franja.titulo ? franja.titulo.texto : String(e.titulo).trim(), modo, fuente: { archivo, inicio, duracion }, franja };
  });
  mercados.sort((a, b) => (a.mercado === MERCADO_PRINCIPAL ? -1 : b.mercado === MERCADO_PRINCIPAL ? 1 : 0));
  return { id: proyecto, canal: idCanal, mercados, resumen: { renders: mercados.length }, avisos };
}

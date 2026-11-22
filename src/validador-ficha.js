// ---------------------------------------------------------------------------
// Validador de ficha y de guion. Modulo puro: sin disco, sin red y sin config.
//
// La FICHA que carga el usuario es la UNICA fuente de hechos:
//   { titulo, canal, mercado, hechos:[{ tipo: fecha|lugar|cifra|persona|dato, valor }], fuente?, partes?, proyecto?, continuar?, foto? }
// El modelo devuelve:
//   { partes:[{ n, narracion, tecnico:[{ escena, textoPantalla, efecto?, duracionSeg }] }] }
// validarGuion() lo RECHAZA si: la estructura es mala; "Parte N" no es consecutiva; aparecen numeros, meses, lugares o nombres
// propios que no estan en la ficha; hay dialogos de actores o citas atribuidas; el idioma no corresponde al mercado; excede el
// ritmo del canal; o (news) falta el lugar o la fecha. Devuelve { ok, problemas[], avisos[], detalle[] }.
//
// Limites conocidos (heuristicas, sin diccionario): un nombre propio al INICIO de una frase no se comprueba; las cifras escritas
// con palabras ("three million") solo dan aviso; el idioma usa detectarIdioma (puede devolver null si hay poca evidencia).
// ---------------------------------------------------------------------------
import { CANALES, ErrorCanal, normalizarCanal } from './canales.js';
import { MERCADOS, normalizarMercado } from './mercados.js';
import { detectarIdioma } from './paquete-texto.js';

export class ErrorFicha extends ErrorCanal {
  constructor(problemas) {
    super('Ficha no valida: ' + problemas.join(' | '));
    this.name = 'ErrorFicha';
    this.problemas = problemas;
  }
}

export const TIPOS_HECHO = Object.freeze(['fecha', 'lugar', 'cifra', 'persona', 'dato']);
export const LIMITES_FICHA = Object.freeze({ titulo: 160, hechos: 40, valor: 300, fuente: 300, partes: 12, proyecto: 64 });
/** Una escena puede durar hasta beatSeconds * este factor; la narracion no puede pasar de estas palabras por segundo. */
export const ESCENA_MAX_FACTOR = 1.5;
export const PALABRAS_POR_SEGUNDO_MAX = 3.4;
export const MAX_PROBLEMAS = 12;

const TEXTO_ETIQUETAS_NARRADOR = /^(narrator|narrador|narradora|voz|voz en off|voiceover|voice-over|locutor|locutora)$/i;
const MESES = {
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
// Un mes de la ficha en un idioma vale en el otro ("March 3" en la ficha -> "marzo" en la narracion es-US).
const INDICE_MES = new Map([...MESES.en.map((m, i) => [m, i]), ...MESES.es.map((m, i) => [m, i]), ['setiembre', 8]]);
const TODOS_LOS_MESES = new Set(INDICE_MES.keys());
const nombresDeMes = (indice) => [MESES.en[indice], MESES.es[indice]];
const NUMEROS_EN_PALABRAS = /\b(hundred|thousand|million|billion|trillion|cien|ciento|mil|millon|millones|billon|billones)\b/;
const VERBOS_DE_HABLA = /(?<![\p{L}])(said|says|told|replied|answered|shouted|whispered|asked|exclaimed|yelled|dijo|dice|respondio|respondió|grito|gritó|susurro|susurró|pregunto|preguntó|exclamo|exclamó)(?![\p{L}])\s*[:,]?\s*["“«]/iu;

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const palabrasDe = (t) => sinAcentos(t).match(/[\p{L}\p{N}]+/gu) || [];

/** Numero canonico: "1,200" y "1.200" (miles) -> "1200"; "3,5" -> "3.5". */
function canonNum(t) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return t.replace(/[.,]/g, '');
  return t.replace(',', '.');
}
const numerosDe = (t) => (String(t ?? '').match(/\d+(?:[.,]\d+)*/g) || []).map(canonNum);

// --------------------------------------------------------------------------------------------- ficha
/** Revisa la ficha. Devuelve { ok, problemas, avisos, ficha } (ficha normalizada, o null si hay problemas). */
export function validarFicha(entrada) {
  const problemas = [];
  const avisos = [];
  const f = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : null;
  if (!f) return { ok: false, problemas: ['La ficha debe ser un objeto.'], avisos, ficha: null };

  const titulo = String(f.titulo ?? '').trim();
  if (!titulo) problemas.push('Falta el titulo de la ficha.');
  else if (titulo.length > LIMITES_FICHA.titulo) problemas.push('El titulo pasa de ' + LIMITES_FICHA.titulo + ' caracteres.');

  let canal = null;
  try { canal = normalizarCanal(f.canal); } catch (e) { problemas.push(e.message); }
  let mercado = null;
  try { mercado = normalizarMercado(f.mercado); } catch (e) { problemas.push(e.message); }

  const hechos = [];
  if (!Array.isArray(f.hechos) || f.hechos.length === 0) {
    problemas.push('La ficha necesita al menos un hecho (hechos: [{ tipo, valor }]).');
  } else {
    if (f.hechos.length > LIMITES_FICHA.hechos) problemas.push('La ficha tiene mas de ' + LIMITES_FICHA.hechos + ' hechos.');
    f.hechos.slice(0, LIMITES_FICHA.hechos).forEach((h, i) => {
      const tipo = String(h && h.tipo ? h.tipo : '').trim().toLowerCase();
      const valor = h && (typeof h.valor === 'string' || typeof h.valor === 'number') ? String(h.valor).trim() : '';
      if (!TIPOS_HECHO.includes(tipo)) { problemas.push('Hecho ' + (i + 1) + ': tipo no valido (' + (tipo || 'vacio') + '). Usa: ' + TIPOS_HECHO.join(', ') + '.'); return; }
      if (!valor) { problemas.push('Hecho ' + (i + 1) + ': falta el valor.'); return; }
      if (valor.length > LIMITES_FICHA.valor) { problemas.push('Hecho ' + (i + 1) + ': el valor pasa de ' + LIMITES_FICHA.valor + ' caracteres.'); return; }
      hechos.push({ tipo, valor });
    });
  }

  if (canal && CANALES[canal].rigor) {
    if (!hechos.some((h) => h.tipo === 'lugar')) problemas.push('El canal ' + canal + ' exige un hecho de tipo lugar.');
    if (!hechos.some((h) => h.tipo === 'fecha')) problemas.push('El canal ' + canal + ' exige un hecho de tipo fecha.');
  } else if (canal) {
    if (!hechos.some((h) => h.tipo === 'fecha')) avisos.push('La ficha no tiene fecha: el guion no podra mencionar ninguna.');
    if (!hechos.some((h) => h.tipo === 'lugar')) avisos.push('La ficha no tiene lugar: el guion no podra mencionar ninguno.');
  }

  let partes = null;
  if (f.partes !== undefined && f.partes !== null && f.partes !== '') {
    partes = Number(f.partes);
    if (!Number.isInteger(partes) || partes < 1 || partes > LIMITES_FICHA.partes) { problemas.push('partes debe ser un entero entre 1 y ' + LIMITES_FICHA.partes + '.'); partes = null; }
  }
  const fuente = f.fuente === undefined || f.fuente === null ? '' : String(f.fuente).trim().slice(0, LIMITES_FICHA.fuente);
  let proyecto = '';
  if (f.proyecto !== undefined && f.proyecto !== null && String(f.proyecto).trim() !== '') {
    proyecto = String(f.proyecto).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(proyecto)) { problemas.push('proyecto solo admite letras minusculas, numeros, guion y guion bajo (max. 64).'); proyecto = ''; }
  }

  if (problemas.length) return { ok: false, problemas, avisos, ficha: null };
  let foto = '';
  if (f.foto !== undefined && f.foto !== null && String(f.foto).trim() !== '') {
    foto = String(f.foto).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.(jpe?g|png|webp)$/i.test(foto)) { problemas.push('foto debe ser el nombre de una imagen (jpg, png o webp) dentro de medios/fotos del banco, sin rutas.'); foto = ''; }
  }
  if (problemas.length) return { ok: false, problemas, avisos, ficha: null };
  const ficha = { titulo, canal, mercado, hechos, fuente, partes, proyecto, foto, continuar: f.continuar === true };
  return { ok: true, problemas, avisos, ficha };
}

/** Igual que validarFicha pero lanza ErrorFicha (400) si hay problemas. Devuelve la ficha normalizada. */
export function normalizarFicha(entrada) {
  const r = validarFicha(entrada);
  if (!r.ok) throw new ErrorFicha(r.problemas);
  return r.ficha;
}

/** Texto de la ficha (titulo, hechos, fuente) que sirve de fuente unica para comparar. */
export function corpusDeFicha(ficha) {
  return [ficha.titulo, ...(ficha.hechos || []).map((h) => h.valor), ficha.fuente || ''].join(' \n ');
}

// --------------------------------------------------------------------------------------------- guion
function contarMayusculas(tokens) {
  return tokens.filter((t) => /^\p{Lu}/u.test(t.texto)).length;
}

/** Nombres propios probables (palabra con mayuscula que NO abre frase) de un texto. */
function nombresPropios(texto) {
  const tokens = [];
  const re = /[\p{L}][\p{L}\p{M}]*/gu;
  let m;
  while ((m = re.exec(texto)) !== null) tokens.push({ texto: m[0], pos: m.index });
  if (tokens.length === 0) return [];
  // Linea en "Title Case" o TODO MAYUSCULAS (texto de pantalla): no se puede distinguir nombres propios.
  if (tokens.length >= 3 && contarMayusculas(tokens) / tokens.length >= 0.6) return [];
  const salida = [];
  for (const t of tokens) {
    if (!/^\p{Lu}/u.test(t.texto) || t.texto.length < 2) continue;   // "I", "A" sueltas o minusculas
    const antes = texto.slice(0, t.pos).replace(/[\s"“”'‘’«»()\[\]]+$/u, '');
    const abreFrase = antes === '' || /[.!?¡¿:;\n—–]$/.test(antes);
    if (abreFrase) continue;
    salida.push(t.texto);
  }
  return salida;
}

function pareceNarrador(etiqueta) { return TEXTO_ETIQUETAS_NARRADOR.test(etiqueta.trim()); }

/**
 * Valida la salida del modelo contra la ficha.
 * opciones: { ritmo (por defecto CANALES[canal].ritmo), desdeParte = 1 (primera "Parte N" esperada), partes (cuantas se esperan) }
 */
export function validarGuion(salida, fichaEntrada, opciones = {}) {
  const detalle = [];
  const problema = (codigo, mensaje) => { if (!detalle.some((d) => d.mensaje === mensaje)) detalle.push({ nivel: 'problema', codigo, mensaje }); };
  const aviso = (codigo, mensaje) => { if (!detalle.some((d) => d.mensaje === mensaje)) detalle.push({ nivel: 'aviso', codigo, mensaje }); };
  const cierre = () => {
    const problemas = detalle.filter((d) => d.nivel === 'problema').map((d) => d.mensaje).slice(0, MAX_PROBLEMAS);
    const avisos = detalle.filter((d) => d.nivel === 'aviso').map((d) => d.mensaje);
    return { ok: problemas.length === 0, problemas, avisos, detalle };
  };

  const rf = validarFicha(fichaEntrada);
  if (!rf.ok) { rf.problemas.forEach((p) => problema('ficha', p)); return cierre(); }
  const ficha = rf.ficha;
  const perfil = CANALES[ficha.canal];
  const mercado = MERCADOS[ficha.mercado];
  const ritmo = { ...perfil.ritmo, ...(opciones.ritmo || {}) };
  const desdeParte = Number.isInteger(opciones.desdeParte) && opciones.desdeParte >= 1 ? opciones.desdeParte : 1;
  const esperadas = Number.isInteger(opciones.partes) ? opciones.partes : ficha.partes;

  // 1) estructura -----------------------------------------------------------------------------
  const partes = salida && typeof salida === 'object' && Array.isArray(salida.partes) ? salida.partes : null;
  if (!partes || partes.length === 0) { problema('estructura', 'La salida debe ser { "partes": [ ... ] } con al menos una parte.'); return cierre(); }
  if (partes.length > LIMITES_FICHA.partes) problema('estructura', 'Hay mas de ' + LIMITES_FICHA.partes + ' partes.');
  if (esperadas && partes.length !== esperadas) problema('estructura', 'Se pedian ' + esperadas + ' partes y llegaron ' + partes.length + '.');

  const corpus = corpusDeFicha(ficha);
  const corpusNorm = sinAcentos(corpus).replace(/\s+/g, ' ');
  const palabrasFicha = new Set(palabrasDe(corpus));
  const numerosFicha = new Set(numerosDe(corpus));
  const numerosPermitidos = new Set(numerosFicha);
  partes.forEach((p, i) => { numerosPermitidos.add(String(desdeParte + i)); });
  numerosPermitidos.add(String(partes.length));
  if (Number.isInteger(esperadas)) numerosPermitidos.add(String(esperadas));
  const mesesFicha = new Set([...TODOS_LOS_MESES].filter((mes) => palabrasFicha.has(mes)).map((mes) => INDICE_MES.get(mes)));

  const textoTotal = [];
  partes.forEach((p, i) => {
    const et = 'Parte ' + (desdeParte + i);
    if (!p || typeof p !== 'object') { problema('estructura', et + ': debe ser un objeto.'); return; }

    // 2) Parte N consecutiva
    if (!Number.isInteger(p.n)) problema('parte', et + ': falta "n" entero.');
    else if (p.n !== desdeParte + i) problema('parte', 'Parte N no es consecutiva: se esperaba ' + (desdeParte + i) + ' y llego ' + p.n + '.');

    const narracion = typeof p.narracion === 'string' ? p.narracion.trim() : '';
    if (!narracion) problema('estructura', et + ': falta la narracion.');
    const tecnico = Array.isArray(p.tecnico) ? p.tecnico : null;
    if (!tecnico || tecnico.length === 0) problema('estructura', et + ': falta "tecnico" (lista de escenas).');

    const campos = [];   // [etiqueta, texto]
    if (narracion) campos.push([et + ' narracion', narracion]);
    let duracionTotal = 0;
    const maxEscena = Math.round(ritmo.beatSeconds * ESCENA_MAX_FACTOR * 100) / 100;
    const largas = [];
    (tecnico || []).forEach((e, j) => {
      const loc = et + ' escena ' + (j + 1);
      if (!e || typeof e !== 'object') { problema('estructura', loc + ': debe ser un objeto.'); return; }
      const escena = typeof e.escena === 'string' ? e.escena.trim() : '';
      const pantalla = typeof e.textoPantalla === 'string' ? e.textoPantalla.trim() : '';
      if (!escena) problema('estructura', loc + ': falta "escena".');
      if (typeof e.textoPantalla !== 'string') problema('estructura', loc + ': falta "textoPantalla" (puede ir vacio).');
      if (e.efecto !== undefined && typeof e.efecto !== 'string') problema('estructura', loc + ': "efecto" debe ser texto.');
      const d = e.duracionSeg;
      if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) problema('estructura', loc + ': duracionSeg debe ser un numero mayor que 0.');
      else {
        duracionTotal += d;
        // 6) ritmo por escena
        if (d > maxEscena + 1e-9) largas.push((j + 1) + ' (' + d + ' s)');
        else if (d < 1) aviso('ritmo', loc + ' dura menos de 1 s.');
      }
      if (escena) campos.push([loc + ' escena', escena]);
      if (pantalla) campos.push([loc + ' textoPantalla', pantalla]);
    });

    if (largas.length) problema('ritmo', et + ': escena(s) ' + largas.join(', ') + ' exceden el ritmo del canal ' + ficha.canal + ' (maximo ' + maxEscena + ' s por escena).');
    if (duracionTotal > 0) {
      if (duracionTotal > ritmo.segmentMaxSeconds) problema('ritmo', et + ' dura ' + Math.round(duracionTotal) + ' s y excede el maximo del canal ' + ficha.canal + ' (' + ritmo.segmentMaxSeconds + ' s).');
      else if (duracionTotal < ritmo.segmentMinSeconds) aviso('ritmo', et + ' dura ' + Math.round(duracionTotal) + ' s, menos del minimo del canal (' + ritmo.segmentMinSeconds + ' s).');
      const nPalabras = narracion ? narracion.split(/\s+/).filter(Boolean).length : 0;
      if (nPalabras / duracionTotal > PALABRAS_POR_SEGUNDO_MAX) problema('ritmo', et + ': la narracion (' + nPalabras + ' palabras) no cabe en ' + Math.round(duracionTotal) + ' s; acorta el texto o alarga las escenas.');
    }

    // 3) hechos, dialogos y citas
    for (const [loc, texto] of campos) {
      for (const num of numerosDe(texto)) {
        if (!numerosPermitidos.has(num)) problema('hecho_inventado', loc + ': la cifra o el ano "' + num + '" no esta en la ficha.');
      }
      for (const original of texto.match(/[\p{L}]+/gu) || []) {
        const palabra = sinAcentos(original);
        if (!TODOS_LOS_MESES.has(palabra) || (palabra === 'may' && original[0] !== 'M')) continue;   // "may" en minuscula es el verbo
        if (!mesesFicha.has(INDICE_MES.get(palabra))) problema('hecho_inventado', loc + ': el mes "' + palabra + '" no esta en la ficha.');
      }
      if (NUMEROS_EN_PALABRAS.test(sinAcentos(texto)) && !NUMEROS_EN_PALABRAS.test(corpusNorm)) aviso('cifra_en_palabras', loc + ': hay una cifra escrita con palabras; comprueba que viene de la ficha.');
      for (const nombre of new Set(nombresPropios(texto))) {
        if (!palabrasFicha.has(sinAcentos(nombre)) && !TODOS_LOS_MESES.has(sinAcentos(nombre)) && !/^parte$|^part$/i.test(nombre)) {
          problema('hecho_inventado', loc + ': el nombre o lugar "' + nombre + '" no esta en la ficha.');
        }
      }
      // citas y dialogos
      for (const q of texto.matchAll(/[“"«]([^”"»]{1,400})[”"»]/gu)) {
        const dentro = q[1].trim();
        const nPal = dentro.split(/\s+/).filter(Boolean).length;
        const enFicha = corpusNorm.includes(sinAcentos(dentro).replace(/\s+/g, ' '));
        if (nPal >= 3 && !enFicha) problema('cita', loc + ': hay una cita o dialogo entrecomillado que no esta en la ficha ("' + dentro.slice(0, 40) + '"). La voz en off no usa dialogos de actores ni citas atribuidas.');
        else if (nPal < 3 && !enFicha) aviso('cita', loc + ': entrecomillado corto ("' + dentro.slice(0, 40) + '"); comprueba que no es una cita inventada.');
      }
      if (VERBOS_DE_HABLA.test(texto)) problema('cita', loc + ': cita atribuida (alguien "dijo" algo entre comillas). Esta prohibida.');
      if (/^\s*[—–]\s*\S/m.test(texto)) problema('dialogo', loc + ': linea de dialogo (empieza con raya). Esta prohibido.');
      for (const l of texto.matchAll(/^\s*(\p{Lu}[\p{L}.' -]{0,30}):\s+\S/gmu)) {
        if (!pareceNarrador(l[1])) problema('dialogo', loc + ': etiqueta de personaje "' + l[1] + ':" (dialogo de actor). Esta prohibido.');
      }
      // mencion a otra "Parte N"
      for (const r of texto.matchAll(/\b(?:parte|part)\s+(\d+)\b/giu)) {
        if (Number(r[1]) !== desdeParte + i) problema('parte', loc + ': menciona "Parte ' + r[1] + '" dentro de la Parte ' + (desdeParte + i) + '.');
      }
    }
    if (narracion) textoTotal.push(narracion);

    // 5) idioma vs mercado
    const idioma = detectarIdioma(narracion);
    if (idioma && idioma !== mercado.idioma) problema('idioma', et + ': la narracion esta en ' + (idioma === 'en' ? 'ingles' : 'espanol') + ' y el mercado ' + mercado.id + ' pide ' + (mercado.idioma === 'en' ? 'ingles' : 'espanol') + '.');
  });

  // news: lugar y fecha obligatorios tambien en el guion
  if (perfil.rigor) {
    const narrado = sinAcentos(textoTotal.join(' '));
    const palabrasNarradas = new Set(palabrasDe(narrado));
    const lugares = ficha.hechos.filter((h) => h.tipo === 'lugar');
    const lugarDicho = lugares.some((h) => { const ps = palabrasDe(h.valor).filter((w) => w.length >= 3); return ps.length > 0 && ps.every((w) => palabrasNarradas.has(w)); });
    if (!lugarDicho) problema('rigor', 'El canal ' + ficha.canal + ' exige decir el lugar en la narracion (de la ficha: ' + lugares.map((h) => h.valor).join(' / ') + ').');
    const fechas = ficha.hechos.filter((h) => h.tipo === 'fecha');
    const fechaDicha = fechas.some((h) => {
      const clave = [...palabrasDe(h.valor).filter((w) => TODOS_LOS_MESES.has(w)).flatMap((w) => nombresDeMes(INDICE_MES.get(w))), ...numerosDe(h.valor).filter((n) => /^\d{4}$/.test(n))];
      const alternativa = clave.length ? clave : numerosDe(h.valor);
      return alternativa.some((c) => palabrasNarradas.has(c));
    });
    if (!fechaDicha) problema('rigor', 'El canal ' + ficha.canal + ' exige decir la fecha en la narracion (de la ficha: ' + fechas.map((h) => h.valor).join(' / ') + ').');
  }

  return cierre();
}

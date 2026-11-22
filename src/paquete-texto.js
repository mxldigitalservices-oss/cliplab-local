// ---------------------------------------------------------------------------
// Paquete de texto para publicar A MANO (modo local): titulo, descripcion, hashtags y CTA por destino y mercado.
// Modulo puro: sin disco, sin red y sin config. Reutiliza construirContextoClip (marketing.js) para sacar gancho,
// puntos clave y duracion; las plantillas (CTA, hashtags, estructura) son nuevas porque marketing.js solo habla espanol
// y solo conoce tiktok|instagram|facebook.
//
// Reglas:
//   - NO inventa hechos: los unicos datos que aparecen son los del propio clip (titulo, gancho, puntos clave).
//     Las plantillas solo aportan CTA, hashtags y estructura.
//   - NO traduce: si el texto base del clip esta en otro idioma que el mercado, lo avisa en `avisos` para que el usuario
//     lo edite antes de publicar.
//   - Es determinista: mismo clip + destino + mercado -> mismo texto.
// Los limites de largo son valores prudentes de diseno (editables), no una garantia de cada plataforma.
// ---------------------------------------------------------------------------
import { construirContextoClip } from './engine/marketing.js';
import { DESTINOS, CANALES, ErrorCanal, normalizarCanal, normalizarDestinos, perfilDeCanal } from './canales.js';
import { MERCADOS, normalizarMercado, normalizarMercados } from './mercados.js';

export class ErrorPaquete extends ErrorCanal {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorPaquete';
    this.status = 400;
  }
}

/** Limites por destino (caracteres de titulo y de descripcion/caption; maximo de hashtags). */
export const LIMITES = Object.freeze({
  facebook_reels: Object.freeze({ titulo: 100, descripcion: 2000, hashtags: 4 }),
  instagram_reels: Object.freeze({ titulo: 100, descripcion: 2000, hashtags: 8 }),
  youtube_shorts: Object.freeze({ titulo: 100, descripcion: 1000, hashtags: 4 }),
  youtube_long: Object.freeze({ titulo: 100, descripcion: 4000, hashtags: 5 }),
});

const MAX_PUNTOS = 3;

// --------------------------- Plantillas por idioma (en = en-US, es = es-US) ---------------------------

const CTAS = {
  stories: {
    en: ['What would you have done? Tell us in the comments.', 'Follow for the next part.', 'Share this with someone who needs to hear it.'],
    es: ['¿Qué habrías hecho tú? Cuéntanos en los comentarios.', 'Sígueme para la siguiente parte.', 'Compártelo con alguien que necesite escucharlo.'],
  },
  sports: {
    en: ['Who is right here? Drop your take below.', 'Agree or disagree? Let us know in the comments.', 'Tag a friend who needs to see this.'],
    es: ['¿Quién tiene la razón? Deja tu opinión abajo.', '¿Estás de acuerdo o no? Cuéntanos en los comentarios.', 'Etiqueta a un amigo que tiene que ver esto.'],
  },
  news: {
    en: ['What is your take? Share it respectfully in the comments.', 'Follow for more updates.', 'Share if you think others should know.'],
    es: ['¿Qué opinas? Compártelo con respeto en los comentarios.', 'Sígueme para más actualizaciones.', 'Compártelo si crees que otros deberían saberlo.'],
  },
};

const CTA_EMBUDO = {
  en: 'More on the channel.',
  es: 'Hay más en el canal.',
};

const HASHTAGS_CANAL = {
  stories: { en: ['storytime', 'truestory', 'documentary'], es: ['historia', 'historiareal', 'documental'] },
  sports: { en: ['sports', 'highlights', 'debate'], es: ['deportes', 'jugadas', 'debate'] },
  news: { en: ['news', 'currentevents', 'update'], es: ['noticias', 'actualidad', 'informate'] },
};

const HASHTAGS_DESTINO = {
  facebook_reels: ['reels'],
  instagram_reels: ['reels', 'explore'],
  youtube_shorts: ['shorts'],
  youtube_long: [],
};

const TEXTOS = {
  en: {
    pregunta: ": What's your take?",
    serie: ' — Full Series',
    lista: ': Key Moments',
    partes: 'Key points:',
  },
  es: {
    pregunta: ': ¿Qué opinas?',
    serie: ' — Serie completa',
    lista: ': Momentos clave',
    partes: 'Lo clave:',
  },
};

const PALABRAS_VACIAS = {
  en: new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'what', 'your', 'about', 'into', 'were', 'was', 'are', 'you', 'not', 'but', 'his', 'her', 'they', 'them', 'will', 'just', 'when', 'than', 'then', 'been', 'would', 'could', 'their']),
  es: new Set(['para', 'con', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'que', 'por', 'como', 'esto', 'esta', 'este', 'pero', 'sus', 'mas', 'muy', 'son', 'fue', 'ser', 'hay', 'cuando', 'sobre', 'entre', 'desde', 'todo', 'todos', 'tiene']),
};

// --------------------------- Utilidades ---------------------------

const limpiar = (valor) => String(valor ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/[<>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const sinAcentos = (t) => String(t ?? '').toLowerCase().replace(/ñ/g, 'n').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Corta en limite de palabra y agrega "…" si hubo que recortar. Nunca devuelve mas de `max` caracteres. */
export function acortar(texto, max) {
  const t = limpiar(texto);
  if (t.length <= max) return t;
  const corte = t.slice(0, Math.max(1, max - 1));
  const sp = corte.lastIndexOf(' ');
  const base = (sp > max * 0.6 ? corte.slice(0, sp) : corte).replace(/[\s.,;:!?-]+$/, '');
  return base + '…';
}

function semilla(texto) {
  let h = 2166136261;
  for (const c of String(texto)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const pareceUrl = (t) => /^(https?:\/\/|www\.)/i.test(String(t ?? '').trim());

const MARCAS_IDIOMA = {
  en: /\b(the|and|is|are|was|were|of|to|in|that|with|for|you|his|her|they|this|it|on)\b/g,
  es: /\b(el|la|los|las|de|del|que|y|en|un|una|es|por|con|para|se|su|lo|al|como|pero)\b/g,
};

/** Idioma probable del texto ('en' | 'es') o null si no hay suficiente evidencia. Heuristica simple, sin red. */
export function detectarIdioma(texto) {
  const t = sinAcentos(texto);
  if (t.split(/\s+/).filter(Boolean).length < 4) return null;
  const en = (t.match(MARCAS_IDIOMA.en) || []).length;
  const es = (t.match(MARCAS_IDIOMA.es) || []).length;
  if (en === es || Math.max(en, es) < 2) return null;
  return en > es ? 'en' : 'es';
}

function hashtagsDe({ canal, idioma, destino, ctx, max }) {
  const palabrasTema = sinAcentos(ctx.tituloBase + ' ' + ctx.instruccion)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && w.length <= 16 && !/^\d+$/.test(w) && !PALABRAS_VACIAS[idioma].has(w))
    .slice(0, 2);
  const lista = [
    ...HASHTAGS_DESTINO[destino],            // #shorts / #reels primero: es lo que el algoritmo usa para clasificar
    ...HASHTAGS_CANAL[canal][idioma],
    ...palabrasTema,
  ].map((t) => String(t).replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean);
  return [...new Set(lista)].slice(0, max).map((t) => '#' + t);
}

function elegirCta({ canal, idioma, destino, id }) {
  if (DESTINOS[destino].funcion === 'embudo') return CTA_EMBUDO[idioma];
  const lista = CTAS[canal][idioma];
  return lista[semilla(`${id}|${destino}|${idioma}`) % lista.length];
}

/** Titulo base del clip: nunca una URL (un clip sin procesar guarda la URL como titulo). */
function tituloBaseDe(clip, ctx) {
  const candidatos = [ctx.tituloBase, clip.marketing && clip.marketing.titulo, ctx.gancho];
  for (const c of candidatos) {
    const t = limpiar(c);
    if (t && !pareceUrl(t) && t !== 'Clip sin título') return t;
  }
  return '';
}

function puntosUtiles(ctx, excluir) {
  const vistos = new Set(excluir.map((x) => sinAcentos(x)));
  const salida = [];
  for (const p of ctx.puntosClave) {
    const t = limpiar(p);
    const clave = sinAcentos(t);
    if (!t || pareceUrl(t) || vistos.has(clave)) continue;   // un clip sin procesar trae la URL como texto: nunca va al paquete
    vistos.add(clave);
    salida.push(t);
    if (salida.length >= MAX_PUNTOS) break;
  }
  return salida;
}

// --------------------------- Generacion ---------------------------

function variantesLargas({ base, gancho, puntos, canal, idioma, limite, cantidad }) {
  const T = TEXTOS[idioma];
  const estructura = perfilDeCanal(canal).estructuraLarga === 'serie' ? T.serie : T.lista;
  const conSufijo = (sufijo) => acortar(base, Math.max(10, limite - sufijo.length)) + sufijo;
  const todas = [
    { etiqueta: 'directo', titulo: acortar(base, limite), gancho },
    { etiqueta: 'pregunta', titulo: conSufijo(T.pregunta), gancho: puntos[0] || gancho },
    { etiqueta: 'estructura', titulo: conSufijo(estructura), gancho: puntos[1] || gancho },
  ];
  return todas.slice(0, cantidad);
}

/**
 * Paquete de texto de UN destino y UN mercado.
 * Devuelve { destino, mercado, canal, titulo, descripcion, hashtags, cta, texto, avisos } (+ `variantes` en youtube_long).
 *   texto = lo que se pega en el campo de descripcion/caption: descripcion + CTA + hashtags.
 */
export function generarPaquete({ clip, canal, mercado, destino } = {}) {
  if (!clip || typeof clip !== 'object' || Array.isArray(clip)) throw new ErrorPaquete('Falta el clip para armar el paquete de texto.');
  const idCanal = normalizarCanal(canal);
  const idMercado = normalizarMercado(mercado);
  const destinos = normalizarDestinos(destino, idCanal);
  if (destinos.length !== 1) throw new ErrorPaquete('Indica un solo destino por paquete (usa generarPaquetes para varios).');
  const idDestino = destinos[0];
  if (!CANALES[idCanal].mercados.includes(idMercado)) throw new ErrorPaquete('El canal ' + idCanal + ' no publica en el mercado ' + idMercado + '.');

  const idioma = MERCADOS[idMercado].idioma;
  const limites = LIMITES[idDestino];
  const ctx = construirContextoClip(clip);
  const base = tituloBaseDe(clip, ctx);
  const avisos = [];
  if (!base) avisos.push(idioma === 'en' ? 'The clip has no title yet: write one before publishing.' : 'El clip todavía no tiene título: escríbelo antes de publicar.');

  const idiomaClip = detectarIdioma([base, ctx.fuenteTexto].join(' '));
  if (idiomaClip && idiomaClip !== idioma) {
    avisos.push(idioma === 'en'
      ? 'The clip text looks Spanish and this package is en-US: translate or edit the title and description before publishing (nothing was translated automatically).'
      : 'El texto del clip parece estar en inglés y este paquete es es-US: tradúcelo o edítalo antes de publicar (no se tradujo nada automáticamente).');
  }

  const gancho = acortar(limpiar(ctx.gancho) && !pareceUrl(ctx.gancho) ? ctx.gancho : base, 110);
  const puntos = puntosUtiles(ctx, [base, gancho]);
  const cta = elegirCta({ canal: idCanal, idioma, destino: idDestino, id: clip.id ?? base });
  const hashtags = hashtagsDe({ canal: idCanal, idioma, destino: idDestino, ctx, max: limites.hashtags });

  let titulo = acortar(base || gancho, limites.titulo);
  let variantes = null;
  const cuerpo = [];

  if (idDestino === 'youtube_long') {
    variantes = variantesLargas({ base: base || gancho, gancho, puntos, canal: idCanal, idioma, limite: limites.titulo, cantidad: DESTINOS.youtube_long.variantesTitulo });
    titulo = variantes[0].titulo;
    if (gancho) cuerpo.push(gancho);
    if (puntos.length) cuerpo.push(TEXTOS[idioma].partes + '\n' + puntos.map((p) => '- ' + p).join('\n'));
  } else if (idDestino === 'youtube_shorts') {
    // En Shorts el titulo va aparte: la descripcion no lo repite.
    if (puntos.length) cuerpo.push(puntos.map((p) => '- ' + p).join('\n'));
  } else {
    // Facebook/Instagram: no hay campo de titulo, el caption abre con el gancho.
    cuerpo.push(titulo);
    if (puntos.length) cuerpo.push(puntos.map((p) => '- ' + p).join('\n'));
  }

  let descripcion = cuerpo.filter(Boolean).join('\n\n');
  const reserva = cta.length + hashtags.join(' ').length + 8;
  if (descripcion.length > limites.descripcion - reserva) descripcion = acortar(descripcion, limites.descripcion - reserva);
  const texto = [descripcion, cta, hashtags.join(' ')].filter(Boolean).join('\n\n');

  const paquete = { destino: idDestino, mercado: idMercado, canal: idCanal, titulo, descripcion, hashtags, cta, texto, avisos };
  if (variantes) paquete.variantes = variantes;
  return paquete;
}

/**
 * Paquetes de varios mercados y destinos de una vez (para el panel). Sin `mercados`/`destinos` usa todos los del canal.
 * Orden: por mercado (el principal primero) y dentro, por destino.
 */
export function generarPaquetes({ clip, canal, mercados, destinos } = {}) {
  const idCanal = normalizarCanal(canal);
  const perfil = perfilDeCanal(idCanal);
  const listaMercados = normalizarMercados(mercados ?? perfil.mercados);
  const listaDestinos = normalizarDestinos(destinos ?? perfil.destinos, idCanal);
  const paquetes = [];
  for (const mercado of listaMercados) {
    for (const destino of listaDestinos) paquetes.push(generarPaquete({ clip, canal: idCanal, mercado, destino }));
  }
  return paquetes;
}

#!/usr/bin/env bash
# aplicar-parte3.sh - ClipLab Pro, PARTE 3: paquete de texto (en-US / es-US) y descarga manual del video.
#
# Uso (desde la raiz del repo con las Partes 1 y 2 ya aplicadas):
#   bash aplicar-parte3.sh              aplica y corre las pruebas de la Parte 3
#   bash aplicar-parte3.sh --completo   ademas corre npm test (tarda ~4 min)
#   bash aplicar-parte3.sh --simular    solo comprueba que se puede aplicar; no escribe nada
#   bash aplicar-parte3.sh /ruta/repo   aplica sobre otra carpeta
#
# Es autocontenido y repetible: antes de escribir comprueba el sha256 de cada archivo existente que va a reemplazar
# (si no es el de las Partes 1-2 ni el de la Parte 3, aborta sin tocar nada), guarda copias en .respaldo-parte3/<fecha>/,
# y comprueba al final que pipeline.js, upload.js y rotacion*.js siguen exactamente igual. Nunca usa nano.
set -euo pipefail

COMPLETO=0; SIMULAR=0; RAIZ="$PWD"
for arg in "$@"; do
  case "$arg" in
    --completo) COMPLETO=1 ;;
    --simular) SIMULAR=1 ;;
    *) RAIZ="$arg" ;;
  esac
done
cd "$RAIZ"

fallar() { echo "ERROR: $*" >&2; exit 1; }
sha() { if [ -f "$1" ]; then sha256sum "$1" | cut -d" " -f1; else echo AUSENTE; fi; }

[ -f package.json ] && grep -q "\"name\": \"cliplab-pro\"" package.json || fallar "esta carpeta no es el repo cliplab-backend (falta package.json de cliplab-pro): $PWD"
for f in src/mercados.js src/canales.js src/plan-renders.js src/routes/index.js; do [ -f "$f" ] || fallar "faltan las Partes 1 y 2 (no existe $f)"; done
grep -q "modoLocal" src/routes/index.js || grep -q "paquete" src/routes/index.js || fallar "src/routes/index.js no tiene la Parte 1 (CLIPLAB_MODE=local)"

# --- sha256 de los archivos PROTEGIDOS (no se tocan; se vuelven a comprobar al final) ---
PROTEGIDOS="src/engine/pipeline.js src/upload.js src/engine/rotacion.js src/engine/rotacion-estado.js src/engine/rotacion-flujo.js"
ANTES_PROTEGIDOS="$(for f in $PROTEGIDOS; do echo "$f $(sha "$f")"; done)"

# --- comprobacion previa: archivos que se reemplazan (sha de Partes 1-2 | sha de Parte 3) ---
comprobar_reemplazo() {   # ruta sha_base sha_nuevo
  local actual; actual="$(sha "$1")"
  if [ "$actual" != "$2" ] && [ "$actual" != "$3" ]; then
    fallar "$1 no coincide con la version de las Partes 1-2 ni con la de la Parte 3 (sha256 $actual). Alguien lo edito: no se escribio nada. Revisa el cambio o pide a Claude que lo integre."
  fi
}
comprobar_nuevo() {       # ruta sha_nuevo
  local actual; actual="$(sha "$1")"
  if [ "$actual" != AUSENTE ] && [ "$actual" != "$2" ]; then
    fallar "$1 ya existe y es distinto de la Parte 3 (sha256 $actual): no se escribio nada."
  fi
}
comprobar_reemplazo "src/routes/index.js" "21eaa167687edd31ea0733241196b16696b30a31c951a4718df43aed7b63a5ef" "1f151579560d0467c9367b26d364ccff2b0267f3d62cfee1cdf5d6e68a177c63"
comprobar_reemplazo "package.json" "2876bd5c1efd36c0a7c8efb65675c8e69d9c8caced3c62af78fe2b5a5a918721" "b7e90b718080a0eff06cad7a65d768c02a481e4d9ef11b33a82419767a86e754"
comprobar_reemplazo "public/js/api.js" "b512267fc9dad0662d342b813eb09efcdba58be953755f563fb08a77dd16a62b" "1cc881b984275664487827bc712c0bfd135b37f75647868220949dcfe9abbf72"
comprobar_reemplazo "public/js/flujo.js" "63ad65e99b9160a066e747897812513a7dceb156059cf32ecdc24263b5b109a5" "efe5a01090e9ae45cc3c4ff15a74fe39e7165afffccd17dee0e27d04925effb3"
comprobar_reemplazo "public/js/views.js" "3fbe63884e45b8435a856e927c76bd6b0bbf770204544a0d5fe890995116c1e2" "d3c65bbb62c122f4bdd1f1310f62bd9fa721c87fb7b217d667bdfa58b476f190"
comprobar_reemplazo "public/index.html" "ab0808460082f0934b88827fb4936ece32b8f53a14fa4c4892036ce99dc40b03" "ff839546ebaaee4f67644e687de4be78441df1fe206a50944cae8b5110a95a72"
comprobar_reemplazo "public/css/styles.css" "447e93b58a4b7c027bfb9f325b24860aed5b57074f5f0f551a5fc6bc56582af2" "aa2adad9a438889b7a7fda49fd564b50b463642638940cd787b065587fdd140e"
comprobar_nuevo "src/paquete-texto.js" "c122f7f92877d31d0116fe7d144da3bf4dbbb1f83dc7fa813bca934738ed48b5"
comprobar_nuevo "src/routes/paquete.js" "50e8994a6b9bf7b15f4e721fbf2038d8861b4f660887012b029ba0865afa9f11"
comprobar_nuevo "public/js/paquete.js" "e3bc5abeeca60dc1959b7806600754008d42b0cf8b360e236e10a9432428b772"
comprobar_nuevo "tests/paquete-texto.test.js" "f0dec880b57bfab5747236c6c2c7e593a00266c0e3731eeedddc89b0d4625db4"
comprobar_nuevo "tests/paquete-rutas.test.js" "38db8fccdd7b8cfc624d6af8dfff1c3d43fbfe38e61e2ebf17f06430711fa287"
echo "Comprobacion previa: OK ($PWD)"
[ "$SIMULAR" = 1 ] && { echo "Simulacion: se puede aplicar la Parte 3. No se escribio nada."; exit 0; }

# --- respaldo ---
RESPALDO=".respaldo-parte3/$(date +%Y%m%d-%H%M%S)"
for f in src/routes/index.js package.json public/js/api.js public/js/flujo.js public/js/views.js public/index.html public/css/styles.css ESTADO_CLIPLAB_PRO.md .cliplab-handoff.json; do
  if [ -f "$f" ]; then mkdir -p "$RESPALDO/$(dirname "$f")"; cp -p "$f" "$RESPALDO/$f"; fi
done
echo "Respaldo en $RESPALDO"

escribir() { mkdir -p "$(dirname "$1")"; cat > "$1"; echo "  escrito $1"; }

escribir "src/paquete-texto.js" <<'CLIPLAB_EOF_PARTE3'
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
CLIPLAB_EOF_PARTE3

escribir "src/routes/paquete.js" <<'CLIPLAB_EOF_PARTE3'
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config/index.js';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { CANALES, DESTINOS, IDS_CANALES, normalizarCanal, normalizarDestinos } from '../canales.js';
import { MERCADOS, normalizarMercados } from '../mercados.js';
import { planDeRenders } from '../plan-renders.js';
import { generarPaquetes } from '../paquete-texto.js';

// Paquete de texto, descarga manual del video y catalogo de solo lectura (modo local: se publica a mano).
// Cada ruta lleva su propia llave maestra; el router no la aplica a todo lo que pase por /api/panel.
const router = Router();

const ESTADOS_CON_VIDEO = new Set(['listo', 'publicado']);
const NOMBRE_VIDEO = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/;   // sin punto inicial: nada oculto ni '..'

class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/** Errores esperados (404/409) se responden sin ensuciar el log; el resto (incluidos ErrorCanal/ErrorMercado, 400) va al manejador. */
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) {
    res.status(error.status).json({ ok: false, error: error.message });
    return;
  }
  next(error);
}

/** Texto de una consulta (?destino=a,b): acepta repeticiones (?destino=a&destino=b) y vacio = no indicado. */
function listaDeConsulta(valor) {
  if (valor === undefined) return undefined;
  const lista = (Array.isArray(valor) ? valor : [valor]).map((x) => String(x ?? '')).join(',');
  return lista.trim() ? lista : undefined;
}

function buscarClip(id) {
  const limpio = String(id ?? '').trim();
  const clip = limpio ? store.buscar(limpio) : null;
  if (!clip) throw new ErrorHttp(404, 'Clip no encontrado');
  return clip;
}

/** Nombre de descarga seguro (ASCII, sin rutas): titulo del clip o, si el titulo es una URL, su id. */
export function nombreDeDescarga(clip) {
  const titulo = String(clip.titulo ?? '');
  const base = /^(https?:\/\/|www\.)/i.test(titulo.trim()) ? '' : titulo;
  const slug = base.toLowerCase().replace(/ñ/g, 'n').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return (slug || path.basename(String(clip.id ?? 'clip')).replace(/[^A-Za-z0-9_-]/g, '') || 'clip') + '.mp4';
}

/** Nombre de archivo del video dentro de clipsDir, o null si la URL del clip no es un /clips/<nombre>.mp4 valido. */
export function archivoDeClip(clip) {
  const url = String(clip.url ?? '');
  if (!url.startsWith('/clips/')) return null;
  const nombre = path.basename(url);
  return NOMBRE_VIDEO.test(nombre) && url === '/clips/' + nombre ? nombre : null;
}

router.get('/canales', requireMasterKey, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    canales: IDS_CANALES.map((id) => {
      const c = CANALES[id];
      return {
        id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        estructuraLarga: c.estructuraLarga,
        destinos: [...c.destinos],
        mercados: [...c.mercados],
        plan: planDeRenders({ canal: id }).resumen,
      };
    }),
    destinos: Object.values(DESTINOS).map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, formato: d.formato })),
    mercados: Object.values(MERCADOS).map((m) => ({ id: m.id, nombre: m.nombre, rol: m.rol })),
  });
});

router.get('/clips/:id/paquete', requireMasterKey, (req, res, next) => {
  try {
    const clip = buscarClip(req.params.id);
    if (!ESTADOS_CON_VIDEO.has(clip.estado)) throw new ErrorHttp(409, 'El clip todavia no esta listo (estado: ' + String(clip.estado) + ').');
    const canal = normalizarCanal(req.query.canal);   // sin valor por defecto: nunca se adivina el canal
    const mercadosPedidos = listaDeConsulta(req.query.mercado);
    const destinosPedidos = listaDeConsulta(req.query.destino);
    const mercados = mercadosPedidos === undefined ? undefined : normalizarMercados(mercadosPedidos);
    const destinos = destinosPedidos === undefined ? undefined : normalizarDestinos(destinosPedidos, canal);
    const paquetes = generarPaquetes({ clip, canal, mercados, destinos });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, clipId: clip.id, canal, paquetes });
  } catch (error) {
    responderError(error, res, next);
  }
});

router.get('/clips/:id/descarga', requireMasterKey, async (req, res, next) => {
  try {
    const clip = buscarClip(req.params.id);
    const nombre = archivoDeClip(clip);
    if (!nombre) throw new ErrorHttp(404, 'El clip no tiene video para descargar (puede haberse borrado por el limite de almacenamiento).');
    const raiz = path.resolve(config.clipsDir);
    const ruta = path.resolve(raiz, nombre);
    if (path.dirname(ruta) !== raiz) throw new ErrorHttp(404, 'Video no encontrado');
    let info;
    try {
      info = await fs.stat(ruta);
    } catch {
      throw new ErrorHttp(404, 'Video no encontrado en disco');
    }
    if (!info.isFile()) throw new ErrorHttp(404, 'Video no encontrado en disco');
    // res.download transmite el archivo (sin cargarlo en RAM), admite Range y pone Content-Disposition: attachment.
    res.download(nombre, nombreDeDescarga(clip), { root: raiz, dotfiles: 'deny', cacheControl: false, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    responderError(error, res, next);
  }
});

export default router;
CLIPLAB_EOF_PARTE3

escribir "public/js/paquete.js" <<'CLIPLAB_EOF_PARTE3'
// Paquete de texto + descarga manual (modo local): botones Copiar y Descargar por destino y mercado.
// Se abre desde cualquier boton [data-accion="paquete"][data-id="<clip>"]. El canal lo elige la persona cada vez:
// el sistema nunca adivina de que canal es un video.
import { obtenerCanales, obtenerPaquete, descargarVideo, leerLlave } from './api.js';
import { el } from './ui.js';

let dialogo = null;
let catalogo = null;
const vista = { clipId: '', canal: '', mercado: '', paquetes: [], cargando: false };

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copiado = false;
    try { copiado = document.execCommand('copy'); } catch { copiado = false; }
    area.remove();
    return copiado;
  }
}

function aviso(texto, tipo = 'info') {
  const zona = dialogo.querySelector('[data-zona="estado"]');
  zona.textContent = texto;
  zona.dataset.tipo = tipo;
  zona.hidden = !texto;
}

function botonCopiar(etiqueta, obtenerTexto) {
  return el('button', {
    class: 'btn', type: 'button', text: etiqueta,
    onclick: async () => {
      const ok = await copiarTexto(obtenerTexto());
      aviso(ok ? 'Copiado: ' + etiqueta.replace(/^Copiar /, '') + '.' : 'No se pudo copiar el texto.', ok ? 'ok' : 'error');
    },
  });
}

function campo(titulo, texto) {
  return el('div', { class: 'copy' }, el('strong', { text: titulo }), el('p', { text: texto }));
}

function tarjetaPaquete(p) {
  const nombre = (catalogo.destinos.find((d) => d.id === p.destino) || {}).nombre || p.destino;
  const hijos = [el('h3', { text: nombre })];
  for (const a of p.avisos || []) hijos.push(el('p', { class: 'aviso-paquete', text: a }));
  hijos.push(campo('Título', p.titulo));
  if (p.variantes && p.variantes.length) {
    hijos.push(el('div', { class: 'copy' },
      el('strong', { text: 'Variantes de título y gancho' }),
      ...p.variantes.map((v) => el('div', { class: 'variante' },
        el('p', { text: v.titulo + (v.gancho ? '\n' + v.gancho : '') }),
        botonCopiar('Copiar variante ' + v.etiqueta, () => v.titulo)))));
  }
  hijos.push(campo('Texto para pegar', p.texto));
  hijos.push(el('div', { class: 'card-acciones' },
    botonCopiar('Copiar título', () => p.titulo),
    botonCopiar('Copiar texto', () => p.texto),
    botonCopiar('Copiar todo', () => p.titulo + '\n\n' + p.texto)));
  return el('article', { class: 'card paquete' }, ...hijos);
}

function pintar() {
  const zona = dialogo.querySelector('[data-zona="paquetes"]');
  zona.replaceChildren();
  if (!vista.canal) { zona.append(el('div', { class: 'vacio', text: 'Elige el canal para ver los textos.' })); return; }
  if (vista.cargando) { zona.append(el('div', { class: 'vacio', text: 'Preparando textos…' })); return; }
  const lista = vista.paquetes.filter((p) => p.mercado === vista.mercado);
  if (!lista.length) { zona.append(el('div', { class: 'vacio', text: 'No hay textos para este mercado.' })); return; }
  for (const p of lista) zona.append(tarjetaPaquete(p));
}

function pintarMercados() {
  const caja = dialogo.querySelector('[data-zona="mercados"]');
  caja.replaceChildren(...catalogo.mercados.map((m) => el('button', {
    class: 'btn', type: 'button', text: m.nombre, 'aria-pressed': String(m.id === vista.mercado),
    onclick: () => { vista.mercado = m.id; pintarMercados(); pintar(); },
  })));
}

async function cargarPaquetes() {
  if (!vista.canal) { vista.paquetes = []; pintar(); return; }
  vista.cargando = true;
  pintar();
  aviso('');
  try {
    const datos = await obtenerPaquete(vista.clipId, { canal: vista.canal });
    vista.paquetes = datos.paquetes || [];
  } catch (error) {
    vista.paquetes = [];
    aviso('No se pudieron preparar los textos: ' + error.message, 'error');
  } finally {
    vista.cargando = false;
    pintar();
  }
}

function crearDialogo() {
  const selector = el('select', { 'aria-label': 'Canal', 'data-zona': 'canal' });
  selector.addEventListener('change', () => { vista.canal = selector.value; cargarPaquetes(); });
  const descargar = el('button', {
    class: 'btn btn-primario', type: 'button', text: 'Descargar video',
    onclick: async () => {
      descargar.disabled = true;
      aviso('Descargando…');
      try {
        const { nombre } = await descargarVideo(vista.clipId);
        aviso('Video descargado: ' + nombre, 'ok');
      } catch (error) {
        aviso('No se pudo descargar: ' + error.message, 'error');
      } finally {
        descargar.disabled = false;
      }
    },
  });
  const cerrar = el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => dialogo.close() });
  const d = el('dialog', { id: 'dlg-paquete', class: 'dlg-paquete' },
    el('h2', { text: 'Publicar a mano' }),
    el('p', { text: 'Descarga el video y copia los textos de cada destino. Nada se publica solo.' }),
    el('div', { class: 'toolbar' }, el('label', { text: 'Canal ' }, selector), el('div', { class: 'segmento', 'data-zona': 'mercados', role: 'group', 'aria-label': 'Mercado' })),
    el('div', { class: 'card-acciones' }, descargar),
    el('p', { class: 'suave', 'data-zona': 'estado', role: 'status', hidden: true }),
    el('div', { 'data-zona': 'paquetes' }),
    el('div', { class: 'dlg-acciones' }, cerrar));
  document.body.appendChild(d);
  return d;
}

async function abrir(clipId) {
  if (!dialogo) dialogo = crearDialogo();
  vista.clipId = clipId;
  vista.canal = '';
  vista.paquetes = [];
  const selector = dialogo.querySelector('[data-zona="canal"]');
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  try {
    if (!catalogo) catalogo = await obtenerCanales();
  } catch (error) {
    aviso(error.requiereLlave || !leerLlave() ? 'Falta la llave maestra: guárdala en el panel y vuelve a intentar.' : 'No se pudo cargar el catálogo: ' + error.message, 'error');
    return;
  }
  vista.mercado = (catalogo.mercados.find((m) => m.rol === 'principal') || catalogo.mercados[0]).id;
  selector.replaceChildren(el('option', { value: '', text: 'Elige el canal…' }), ...catalogo.canales.map((c) => el('option', { value: c.id, text: c.nombre })));
  selector.value = '';
  pintarMercados();
  pintar();
}

document.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-accion="paquete"]');
  if (!boton || !boton.dataset.id) return;
  ev.preventDefault();
  abrir(boton.dataset.id);
});
CLIPLAB_EOF_PARTE3

escribir "tests/paquete-texto.test.js" <<'CLIPLAB_EOF_PARTE3'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-paquete-texto-'));
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.LOG_LEVEL = 'error';

const { generarPaquete, generarPaquetes, detectarIdioma, acortar, LIMITES, ErrorPaquete } = await import('../src/paquete-texto.js');
const { construirContextoClip } = await import('../src/engine/marketing.js');
const { CANALES, DESTINOS, IDS_CANALES, IDS_DESTINOS, ErrorCanal } = await import('../src/canales.js');
const { IDS_MERCADOS, MERCADOS, ErrorMercado } = await import('../src/mercados.js');

const CLIP_EN = {
  id: 'clip_en',
  titulo: 'The rise of a small-town boxer',
  transcripcion: 'He was born in a small town. Nobody believed he could win. He trained every morning before school. Then he won the regional title.',
  duracion: 48,
  marketing: { titulo: 'He was told he would never win' },
};
const CLIP_ES = {
  id: 'clip_es',
  titulo: 'El ascenso de un boxeador de pueblo',
  transcripcion: 'Nació en un pueblo pequeño. Nadie creía que podía ganar. Entrenaba todas las mañanas antes de la escuela. Luego ganó el título regional.',
  duracion: 48,
};

const CTAS_EN = /(?:Tell us|Follow|Share|Who is right|Agree or disagree|Tag a friend|What is your take|More on the channel)/;
const CTAS_ES = /(?:Cuéntanos|Sígueme|Compártelo|¿Quién tiene la razón|¿Estás de acuerdo|Etiqueta a un amigo|¿Qué opinas|Hay más en el canal)/;

test('matriz completa canal x mercado x destino: limites, hashtags validos e idioma de la plantilla', () => {
  for (const canal of IDS_CANALES) {
    for (const mercado of IDS_MERCADOS) {
      for (const destino of IDS_DESTINOS) {
        const clip = mercado === 'en-US' ? CLIP_EN : CLIP_ES;
        const p = generarPaquete({ clip, canal, mercado, destino });
        const quien = canal + '/' + mercado + '/' + destino;
        const lim = LIMITES[destino];
        assert.equal(p.destino, destino, quien);
        assert.equal(p.mercado, mercado, quien);
        assert.equal(p.canal, canal, quien);
        assert.ok(p.titulo && p.titulo.length <= lim.titulo, quien + ': titulo');
        assert.ok(p.texto.length <= lim.descripcion, quien + ': texto demasiado largo');
        assert.ok(p.hashtags.length >= 1 && p.hashtags.length <= lim.hashtags, quien + ': cantidad de hashtags');
        assert.ok(p.hashtags.every((h) => /^#[a-z0-9]+$/.test(h)), quien + ': ' + p.hashtags.join(' '));
        assert.equal(new Set(p.hashtags).size, p.hashtags.length, quien + ': hashtags repetidos');
        assert.match(p.cta, mercado === 'en-US' ? CTAS_EN : CTAS_ES, quien + ': CTA fuera del idioma del mercado');
        assert.ok(p.texto.includes(p.cta) && p.texto.includes(p.hashtags.join(' ')), quien + ': el texto lleva CTA y hashtags');
        assert.deepEqual(p.avisos, [], quien + ': avisos inesperados');
      }
    }
  }
});

test('reutiliza construirContextoClip: el gancho y los puntos del paquete salen de ese contexto', () => {
  const ctx = construirContextoClip(CLIP_EN);
  const largo = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(largo.descripcion.startsWith(ctx.gancho), 'la descripcion arranca con el gancho del contexto');
  const reels = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' });
  for (const linea of reels.descripcion.split('\n').filter((l) => l.startsWith('- '))) {
    assert.ok(ctx.puntosClave.includes(linea.slice(2)), 'punto que no viene del contexto: ' + linea);
  }
  // Un gancho explicito del clip se respeta (lo lee construirContextoClip).
  const conGancho = generarPaquete({ clip: { ...CLIP_EN, gancho: 'A very different hook line here' }, canal: 'stories', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(conGancho.descripcion.startsWith('A very different hook line here'));
});

test('no inventa hechos: ningun numero ni oracion que no este en el clip', () => {
  const clip = { ...CLIP_EN, transcripcion: 'The match ended 3-1 in 2019. Nobody expected that result. The crowd went silent for a while.' };
  const fuente = [clip.titulo, clip.transcripcion, clip.marketing.titulo].join(' ');
  const numerosFuente = new Set(fuente.match(/\d+/g));
  for (const canal of IDS_CANALES) {
    for (const destino of IDS_DESTINOS) {
      const p = generarPaquete({ clip, canal, mercado: 'en-US', destino });
      for (const n of p.texto.match(/\d+/g) || []) assert.ok(numerosFuente.has(n), canal + '/' + destino + ': numero inventado ' + n);
      for (const linea of p.descripcion.split('\n').filter((l) => l.startsWith('- '))) {
        assert.ok(fuente.includes(linea.slice(2).replace(/…$/, '')), 'oracion que no esta en el clip: ' + linea);
      }
    }
  }
});

test('Facebook/Instagram abren el caption con el titulo; Shorts no lo repite en la descripcion', () => {
  const fb = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'facebook_reels' });
  const ig = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'instagram_reels' });
  const sh = generarPaquete({ clip: CLIP_EN, canal: 'sports', mercado: 'en-US', destino: 'youtube_shorts' });
  assert.ok(fb.descripcion.startsWith(fb.titulo));
  assert.ok(ig.descripcion.startsWith(ig.titulo));
  assert.ok(!sh.descripcion.includes(sh.titulo));
  assert.equal(sh.hashtags[0], '#shorts');
  assert.equal(fb.hashtags[0], '#reels');
  assert.equal(ig.hashtags[0], '#reels');
  assert.equal(sh.cta, 'More on the channel.', 'Shorts es el embudo hacia el canal');
});

test('youtube_long devuelve las variantes de titulo/gancho del catalogo, distintas y dentro del limite', () => {
  for (const mercado of IDS_MERCADOS) {
    for (const canal of IDS_CANALES) {
      const p = generarPaquete({ clip: mercado === 'en-US' ? CLIP_EN : CLIP_ES, canal, mercado, destino: 'youtube_long' });
      assert.equal(p.variantes.length, DESTINOS.youtube_long.variantesTitulo);
      assert.equal(new Set(p.variantes.map((v) => v.titulo)).size, p.variantes.length, 'titulos repetidos');
      assert.ok(p.variantes.every((v) => v.titulo.length <= LIMITES.youtube_long.titulo && v.gancho));
      assert.equal(p.titulo, p.variantes[0].titulo);
      const serie = CANALES[canal].estructuraLarga === 'serie';
      const ultimo = p.variantes[2].titulo;
      const esperado = mercado === 'en-US' ? (serie ? 'Full Series' : 'Key Moments') : (serie ? 'Serie completa' : 'Momentos clave');
      assert.ok(ultimo.includes(esperado), canal + '/' + mercado + ': ' + ultimo);
    }
  }
});

test('un titulo larguisimo se recorta en palabra completa y las variantes siguen cabiendo', () => {
  const largo = 'palabra '.repeat(80).trim();
  const clip = { id: 'x', titulo: largo.replace(/palabra/g, 'story'), transcripcion: '' };
  for (const destino of IDS_DESTINOS) {
    const p = generarPaquete({ clip, canal: 'stories', mercado: 'en-US', destino });
    assert.ok(p.titulo.length <= 100, destino + ': ' + p.titulo.length);
    assert.ok(p.titulo.endsWith('…') || p.variantes, destino);
    for (const v of p.variantes || []) assert.ok(v.titulo.length <= 100);
  }
});

test('aviso (y nada traducido) cuando el texto del clip esta en otro idioma que el mercado', () => {
  const enEs = generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'es-US', destino: 'facebook_reels' });
  assert.equal(enEs.avisos.length, 1);
  assert.match(enEs.avisos[0], /inglés/);
  assert.ok(enEs.titulo.includes('small-town boxer'), 'el titulo no se traduce solo');
  const esEn = generarPaquete({ clip: CLIP_ES, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' });
  assert.equal(esEn.avisos.length, 1);
  assert.match(esEn.avisos[0], /Spanish/);
  assert.deepEqual(generarPaquete({ clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' }).avisos, []);
});

test('detectarIdioma: en, es y sin evidencia', () => {
  assert.equal(detectarIdioma('He was born in a small town and the crowd went silent'), 'en');
  assert.equal(detectarIdioma('Nació en un pueblo pequeño y la gente se quedó en silencio'), 'es');
  assert.equal(detectarIdioma('Messi'), null);
  assert.equal(detectarIdioma(''), null);
});

test('un clip sin procesar (titulo = URL) no publica la URL como titulo', () => {
  const sinTitulo = generarPaquete({ clip: { id: 'a', titulo: 'https://youtu.be/abc123' }, canal: 'news', mercado: 'en-US', destino: 'facebook_reels' });
  assert.ok(!/https?:|youtu/i.test(sinTitulo.titulo + sinTitulo.texto));
  assert.equal(sinTitulo.avisos.length, 1);
  const conMarketing = generarPaquete({ clip: { id: 'a', titulo: 'https://youtu.be/abc123', marketing: { titulo: 'A real hook title here' } }, canal: 'news', mercado: 'en-US', destino: 'facebook_reels' });
  assert.equal(conMarketing.titulo, 'A real hook title here');
  assert.deepEqual(conMarketing.avisos, []);
});

test('limpia caracteres peligrosos (<, >, control) del titulo y del texto', () => {
  const p = generarPaquete({ clip: { id: 'a', titulo: 'Hack <script>alert(1)</script>\u0007 the game', transcripcion: '' }, canal: 'sports', mercado: 'en-US', destino: 'youtube_long' });
  assert.ok(!/[<>\u0007]/.test(p.titulo + p.texto + p.variantes.map((v) => v.titulo).join('')));
});

test('es determinista: mismo clip, destino y mercado -> mismo paquete', () => {
  const a = generarPaquete({ clip: CLIP_EN, canal: 'news', mercado: 'en-US', destino: 'instagram_reels' });
  const b = generarPaquete({ clip: { ...CLIP_EN }, canal: 'news', mercado: 'en-US', destino: 'instagram_reels' });
  assert.deepEqual(a, b);
});

test('validacion: canal, mercado y destino invalidos o ausentes no se adivinan', () => {
  const ok = { clip: CLIP_EN, canal: 'stories', mercado: 'en-US', destino: 'facebook_reels' };
  assert.throws(() => generarPaquete({ ...ok, canal: undefined }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, canal: 'cocina' }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, mercado: undefined }), (e) => e instanceof ErrorMercado && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, mercado: 'fr-FR' }), (e) => e instanceof ErrorMercado);
  assert.throws(() => generarPaquete({ ...ok, destino: 'tiktok' }), (e) => e instanceof ErrorCanal && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, destino: undefined }), (e) => e instanceof ErrorCanal);
  assert.throws(() => generarPaquete({ ...ok, destino: ['facebook_reels', 'youtube_shorts'] }), (e) => e instanceof ErrorPaquete && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, clip: null }), (e) => e instanceof ErrorPaquete && e.status === 400);
  assert.throws(() => generarPaquete({ ...ok, clip: [] }), (e) => e instanceof ErrorPaquete);
  assert.throws(() => generarPaquete(), ErrorPaquete);
  // Variantes de escritura validas.
  const p = generarPaquete({ ...ok, canal: ' Stories ', mercado: 'EN_us', destino: ' Facebook_Reels ' });
  assert.equal(p.mercado, 'en-US');
  assert.equal(p.destino, 'facebook_reels');
});

test('generarPaquetes: por defecto todos los mercados y destinos del canal (principal primero) o el subconjunto pedido', () => {
  const todos = generarPaquetes({ clip: CLIP_EN, canal: 'sports' });
  assert.equal(todos.length, IDS_MERCADOS.length * CANALES.sports.destinos.length);
  assert.equal(todos[0].mercado, 'en-US');
  assert.equal(todos.at(-1).mercado, 'es-US');
  const uno = generarPaquetes({ clip: CLIP_EN, canal: 'sports', mercados: 'es-US', destinos: ['youtube_shorts'] });
  assert.equal(uno.length, 1);
  assert.equal(uno[0].mercado, 'es-US');
  assert.throws(() => generarPaquetes({ clip: CLIP_EN, canal: 'sports', destinos: 'nope' }), ErrorCanal);
  assert.throws(() => generarPaquetes({ clip: CLIP_EN, canal: 'sports', mercados: 'xx-YY' }), ErrorMercado);
});

test('acortar: corta en palabra, no pasa del maximo y deja intacto lo corto', () => {
  assert.equal(acortar('hola mundo', 50), 'hola mundo');
  const r = acortar('uno dos tres cuatro cinco seis siete ocho', 20);
  assert.ok(r.length <= 20 && r.endsWith('…') && !/\s…$/.test(r), r);
  assert.equal(acortar('  espacios   internos  ', 50), 'espacios internos');
});

test('los idiomas de las plantillas coinciden con los mercados del catalogo', () => {
  assert.deepEqual(IDS_MERCADOS.map((m) => MERCADOS[m].idioma).sort(), ['en', 'es']);
});
CLIPLAB_EOF_PARTE3

escribir "tests/paquete-rutas.test.js" <<'CLIPLAB_EOF_PARTE3'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'cliplab-paquete-rutas-'));
process.env.CLIPLAB_MODE = 'local';
process.env.TMP_DIR = path.join(raiz, 'tmp');
process.env.DATA_DIR = path.join(raiz, 'datos');
process.env.SESSION_DIR = path.join(raiz, 'sesion');
process.env.CLIPS_DIR = path.join(raiz, 'clips');
process.env.MASTER_KEY = 'llave-de-prueba';
process.env.LOG_LEVEL = 'error';

const { config } = await import('../src/config/index.js');
const { createApp } = await import('../src/app.js');
const { store } = await import('../src/storage/store.js');
const { nombreDeDescarga, archivoDeClip } = await import('../src/routes/paquete.js');

await fs.mkdir(config.clipsDir, { recursive: true });
const VIDEO = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz'.repeat(50));   // 1800 bytes
await fs.writeFile(path.join(config.clipsDir, 'abc123.mp4'), VIDEO);
await fs.writeFile(path.join(raiz, 'secreto.mp4'), 'TOP-SECRET');   // fuera de clipsDir: nunca debe salir
await fs.writeFile(path.join(raiz, 'secreto.txt'), 'TOP-SECRET');

const servidor = createApp().listen(0, '127.0.0.1');
await new Promise((ok) => servidor.once('listening', ok));
const base = 'http://127.0.0.1:' + servidor.address().port;
const AUTH = { 'x-master-key': 'llave-de-prueba' };
test.after(() => servidor.close());

function clipListo(campos = {}) {
  const c = store.encolar('https://www.youtube.com/watch?v=aaaaaaaaaaa', {});
  return store.completar(c.id, {
    titulo: 'The rise of a small-town boxer',
    url: '/clips/abc123.mp4',
    duracion: 48,
    transcripcion: 'He was born in a small town. Nobody believed he could win. He trained every morning before school.',
    marketing: { titulo: 'He was told he would never win' },
    ...campos,
  });
}

async function pedir(ruta, cabeceras = AUTH) {
  const r = await fetch(base + ruta, { headers: cabeceras });
  return r;
}
async function json(ruta, cabeceras = AUTH) {
  const r = await pedir(ruta, cabeceras);
  return { status: r.status, cuerpo: await r.json() };
}

const listo = clipListo();

test('las tres rutas exigen la llave maestra', async () => {
  for (const ruta of ['/api/panel/canales', '/api/panel/clips/' + listo.id + '/paquete?canal=stories', '/api/panel/clips/' + listo.id + '/descarga']) {
    const sin = await json(ruta, {});
    assert.equal(sin.status, 401, ruta);
    assert.equal(sin.cuerpo.success, false);
    const mala = await json(ruta, { 'x-master-key': 'otra' });
    assert.equal(mala.status, 401, ruta);
  }
});

test('cada ruta lleva su propia llave maestra (router montado solo, sin otras capas que la protejan)', async () => {
  const { default: express } = await import('express');
  const { default: paqueteRouter } = await import('../src/routes/paquete.js');
  const solo = express();
  solo.use('/api/panel', paqueteRouter);
  const srv = solo.listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  try {
    const url = 'http://127.0.0.1:' + srv.address().port;
    for (const ruta of ['/api/panel/canales', '/api/panel/clips/' + listo.id + '/paquete?canal=stories', '/api/panel/clips/' + listo.id + '/descarga']) {
      assert.equal((await fetch(url + ruta)).status, 401, 'sin llave: ' + ruta);
      assert.equal((await fetch(url + ruta, { headers: AUTH })).status, 200, 'con llave: ' + ruta);
    }
  } finally {
    srv.close();
  }
});

test('/api/panel/canales: catalogo de solo lectura con el plan de renders', async () => {
  const { status, cuerpo } = await json('/api/panel/canales');
  assert.equal(status, 200);
  assert.equal(cuerpo.success, true);
  assert.deepEqual(cuerpo.data.canales.map((c) => c.id), ['stories', 'sports', 'news']);
  assert.deepEqual(cuerpo.data.mercados.map((m) => m.id), ['en-US', 'es-US']);
  assert.deepEqual(cuerpo.data.destinos.map((d) => d.id), ['facebook_reels', 'instagram_reels', 'youtube_shorts', 'youtube_long']);
  const stories = cuerpo.data.canales.find((c) => c.id === 'stories');
  assert.equal(stories.plan.rendersNecesarios, 2, 'stories completo: 2 renders, no 8');
  assert.equal(stories.plan.concatenaciones, 2);
  assert.equal(stories.estructuraLarga, 'serie');
  const r = await fetch(base + '/api/panel/canales', { method: 'POST', headers: AUTH });
  assert.equal(r.status, 404, 'solo lectura: sin POST');
});

test('paquete: sin canal o con canal invalido es 400 (el canal nunca se adivina)', async () => {
  const sin = await json('/api/panel/clips/' + listo.id + '/paquete');
  assert.equal(sin.status, 400);
  assert.match(sin.cuerpo.error, /canal/i);
  const mal = await json('/api/panel/clips/' + listo.id + '/paquete?canal=cocina');
  assert.equal(mal.status, 400);
  assert.match(mal.cuerpo.error, /stories, sports, news/);
});

test('paquete: todos los mercados y destinos del canal por defecto (8 paquetes)', async () => {
  const { status, cuerpo } = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories');
  assert.equal(status, 200);
  assert.equal(cuerpo.data.clipId, listo.id);
  assert.equal(cuerpo.data.canal, 'stories');
  assert.equal(cuerpo.data.paquetes.length, 8);
  assert.equal(cuerpo.data.paquetes[0].mercado, 'en-US');
  const largo = cuerpo.data.paquetes.find((p) => p.destino === 'youtube_long' && p.mercado === 'en-US');
  assert.equal(largo.variantes.length, 3);
});

test('paquete: filtra por mercado y destino (texto, lista con comas y repeticiones)', async () => {
  const uno = await json('/api/panel/clips/' + listo.id + '/paquete?canal=sports&mercado=es-US&destino=youtube_shorts');
  assert.equal(uno.status, 200);
  assert.equal(uno.cuerpo.data.paquetes.length, 1);
  assert.equal(uno.cuerpo.data.paquetes[0].mercado, 'es-US');
  assert.equal(uno.cuerpo.data.paquetes[0].destino, 'youtube_shorts');
  const coma = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=EN_us&destino=facebook_reels,instagram_reels');
  assert.equal(coma.cuerpo.data.paquetes.length, 2);
  const rep = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=en-US&destino=facebook_reels&destino=youtube_long');
  assert.equal(rep.cuerpo.data.paquetes.length, 2);
  const vacio = await json('/api/panel/clips/' + listo.id + '/paquete?canal=news&mercado=&destino=');
  assert.equal(vacio.cuerpo.data.paquetes.length, 8, 'vacio = no indicado = todos');
});

test('paquete: mercado o destino invalidos son 400', async () => {
  const m = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories&mercado=fr-FR');
  assert.equal(m.status, 400);
  assert.match(m.cuerpo.error, /en-US, es-US/);
  const d = await json('/api/panel/clips/' + listo.id + '/paquete?canal=stories&destino=tiktok');
  assert.equal(d.status, 400);
  assert.match(d.cuerpo.error, /facebook_reels/);
});

test('paquete: 404 si el clip no existe y 409 si aun se procesa', async () => {
  const no = await json('/api/panel/clips/no-existe/paquete?canal=stories');
  assert.equal(no.status, 404);
  const proceso = store.encolar('https://www.youtube.com/watch?v=bbbbbbbbbbb', {});
  const aun = await json('/api/panel/clips/' + proceso.id + '/paquete?canal=stories');
  assert.equal(aun.status, 409);
  assert.match(aun.cuerpo.error, /no esta listo/);
});

test('descarga: attachment con nombre seguro, bytes completos y sin cache', async () => {
  const r = await pedir('/api/panel/clips/' + listo.id + '/descarga');
  assert.equal(r.status, 200);
  const cd = r.headers.get('content-disposition');
  assert.match(cd, /^attachment;/);
  assert.match(cd, /filename="the-rise-of-a-small-town-boxer\.mp4"/);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(VIDEO));
});

test('descarga: admite Range (el navegador puede reanudar)', async () => {
  const r = await pedir('/api/panel/clips/' + listo.id + '/descarga', { ...AUTH, Range: 'bytes=10-19' });
  assert.equal(r.status, 206);
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), VIDEO.subarray(10, 20).toString());
});

test('descarga: 404 sin video (url nula, archivo borrado o clip inexistente)', async () => {
  const sinUrl = store.encolar('https://www.youtube.com/watch?v=ccccccccccc', {});
  assert.equal((await json('/api/panel/clips/' + sinUrl.id + '/descarga')).status, 404);
  const borrado = clipListo({ url: '/clips/ya-no-esta.mp4' });
  const r = await json('/api/panel/clips/' + borrado.id + '/descarga');
  assert.equal(r.status, 404);
  assert.match(r.cuerpo.error, /no encontrado/i);
  assert.equal((await json('/api/panel/clips/no-existe/descarga')).status, 404);
});

test('descarga: un clip con url manipulada NUNCA saca archivos de fuera de clipsDir', async () => {
  const urls = [
    '/clips/../secreto.mp4',
    '/clips/..%2Fsecreto.mp4',
    '/clips/%2e%2e/secreto.mp4',
    '/clips/..\\secreto.mp4',
    '/clips/sub/../../secreto.mp4',
    '../secreto.mp4',
    '/etc/passwd',
    '/clips/secreto.txt',
    '/clips/abc123.mp4/../../secreto.mp4',
    '/clips/.oculto.mp4',
    '/clips//abc123.mp4',
  ];
  for (const url of urls) {
    const c = clipListo({ url });
    const r = await pedir('/api/panel/clips/' + c.id + '/descarga');
    const cuerpo = await r.text();
    assert.equal(r.status, 404, 'url ' + url + ' deberia dar 404, dio ' + r.status);
    assert.ok(!cuerpo.includes('TOP-SECRET'), 'filtro contenido de fuera con la url ' + url);
  }
});

test('descarga: el id de la ruta no se usa para armar rutas de disco', async () => {
  for (const id of ['..%2Fsecreto', '%2e%2e%2fsecreto.mp4', 'abc123.mp4']) {
    const r = await pedir('/api/panel/clips/' + id + '/descarga');
    assert.equal(r.status, 404, id);
    assert.ok(!(await r.text()).includes('TOP-SECRET'));
  }
});

test('nombreDeDescarga y archivoDeClip (unitarias)', () => {
  assert.equal(nombreDeDescarga({ id: 'clip_1', titulo: 'Él cayó… ¡y volvió! ñandú' }), 'el-cayo-y-volvio-nandu.mp4');
  assert.equal(nombreDeDescarga({ id: 'clip_9', titulo: 'https://youtu.be/xyz' }), 'clip_9.mp4', 'si el titulo es una URL se usa el id');
  assert.equal(nombreDeDescarga({ id: '../x', titulo: '' }), 'x.mp4');
  assert.equal(nombreDeDescarga({ id: 'c', titulo: '"; rm -rf /' }), 'rm-rf.mp4');
  assert.ok(nombreDeDescarga({ id: 'c', titulo: 'a'.repeat(300) }).length <= 64);
  assert.equal(archivoDeClip({ url: '/clips/abc123.mp4' }), 'abc123.mp4');
  for (const url of [null, '', '/clips/', '/clips/a.mov', '/clips/../a.mp4', 'clips/a.mp4', 'https://x.com/clips/a.mp4', '/clips/a b.mp4', '/clips/.a.mp4', '/clips/a/b.mp4']) {
    assert.equal(archivoDeClip({ url }), null, String(url));
  }
});

test('el panel carga paquete.js y ofrece los botones (modo local y HTML servido)', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /<html data-modo="local"/);
  assert.match(html, /src="\/js\/paquete\.js"/);
  const js = await fetch(base + '/js/paquete.js');
  assert.equal(js.status, 200);
  const flujo = await fs.readFile(new URL('../public/js/flujo.js', import.meta.url), 'utf8');
  const vistas = await fs.readFile(new URL('../public/js/views.js', import.meta.url), 'utf8');
  assert.match(flujo, /data-accion="paquete"/);
  assert.match(vistas, /data-accion="paquete"/);
});

test('paquete.js solo importa lo que api.js y ui.js exportan, y trae Copiar con respaldo y Descargar', async () => {
  const paquete = await fs.readFile(new URL('../public/js/paquete.js', import.meta.url), 'utf8');
  const api = await fs.readFile(new URL('../public/js/api.js', import.meta.url), 'utf8');
  const ui = await fs.readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  for (const [, nombres, origen] of paquete.matchAll(/import \{([^}]+)\} from '\.\/(\w+)\.js'/g)) {
    const fuente = origen === 'api' ? api : ui;
    for (const nombre of nombres.split(',').map((n) => n.trim())) {
      assert.match(fuente, new RegExp('export (?:async )?function ' + nombre + '\\b'), origen + '.js no exporta ' + nombre);
    }
  }
  assert.match(paquete, /navigator\.clipboard\.writeText/);
  assert.match(paquete, /execCommand\('copy'\)/);
  assert.match(paquete, /descargarVideo/);
  assert.match(api, /\/descarga/);
  assert.match(api, /x-master-key/);
});
CLIPLAB_EOF_PARTE3

escribir "src/routes/index.js" <<'CLIPLAB_EOF_PARTE3'
import { Router } from 'express';
import healthRoutes from './health.js';
import statusRoutes from './status.js';
import panelRoutes from './panel.js';
import sesionRoutes from './sesion.js';
import cookiesRedesRoutes from './cookies-redes.js';
import loteRoutes from './lote.js';
import paqueteRoutes from './paquete.js';
import { config } from '../config/index.js';

const router = Router();

router.get('/api', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'ClipLab Pro API',
    version: '0.3.0',
    modo: config.modo,
    endpoints: ['/health', '/api/status', '/api/panel/estado', '/api/panel/encolar', '/api/panel/sesion', '/api/panel/cookies-redes', '/api/panel/logo', '/api/panel/lote/aplicar', '/api/panel/canales', '/api/panel/clips/:id/paquete', '/api/panel/clips/:id/descarga'],
  });
});

// Modo de operacion (publico, sin llave): el panel y los scripts lo consultan para saber si hay publicador.
router.get('/api/modo', (req, res) => {
  res.status(200).json({ ok: true, modo: config.modo, local: config.modoLocal, publicador: !config.modoLocal });
});

router.use(healthRoutes);
router.use('/api', statusRoutes);
router.use('/api/panel/sesion', sesionRoutes);
router.use('/api/panel/cookies-redes', cookiesRedesRoutes);
router.use('/api/panel', loteRoutes);
router.use('/api/panel', paqueteRoutes);
router.use('/api/panel', panelRoutes);

// Publicador automatico (programador + publicador + Chromium). En modo local NO se carga: el import es dinamico a proposito,
// para que ni siquiera se evaluen esos modulos. Sus rutas responden 404 aunque venga una llave valida.
function publicadorDesactivado(req, res) {
  res.status(404).json({ ok: false, error: 'Publicador automatico desactivado (CLIPLAB_MODE=local): descarga el video y copia los textos desde el panel.' });
}

if (config.modoLocal) {
  router.use('/api/programador', publicadorDesactivado);
  router.all('/api/clips/:id/publicar-ahora', publicadorDesactivado);
  router.all('/api/clips/:id/programar', publicadorDesactivado);
} else {
  const { default: programadorRouter } = await import('./programador.js');
  router.use(programadorRouter);
}

export default router;
CLIPLAB_EOF_PARTE3

escribir "package.json" <<'CLIPLAB_EOF_PARTE3'
{
  "name": "cliplab-pro",
  "version": "0.3.0",
  "description": "Backend modular y ultraligero de ClipLab Pro: clipping de videos de YouTube con FFmpeg, subtitulos dinamicos y publicacion automatizada.",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/sesion.test.js tests/envelope.test.js tests/render.test.js tests/segmentos.test.js tests/marketing.test.js tests/multiclip.test.js tests/editorial.test.js tests/sujeto.test.js tests/trayectoria.test.js tests/split-histeresis.test.js tests/interlocutor.test.js tests/cookies-redes.test.js tests/curador.test.js tests/curador-pipeline.test.js tests/proyectos.test.js tests/instruccion.test.js tests/estilos-subtitulos.test.js tests/upload.test.js tests/encolar-controles.test.js tests/archivo-instruccion-estilo.test.js tests/rotacion.test.js tests/rotacion-flujo.test.js tests/upload-respaldo.test.js tests/programador.test.js tests/publicador.test.js tests/plataformas.test.js tests/programador-plataformas.test.js tests/ajustes.test.js tests/lote-ajustes.test.js tests/download-escalera.test.js tests/transcribe-sin-whisper.test.js tests/transcribe-whisper-fallos.test.js tests/paso2-publicador.test.js tests/modo-local.test.js tests/modo-completo.test.js tests/mercados.test.js tests/canales.test.js tests/plan-renders.test.js tests/paquete-texto.test.js tests/paquete-rutas.test.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "mongodb": "^6.22.0",
    "multer": "^2.5.0",
    "playwright-core": "1.65.1",
    "redis": "^6.3.1"
  }
}
CLIPLAB_EOF_PARTE3

escribir "public/js/api.js" <<'CLIPLAB_EOF_PARTE3'
const CLAVE_STORAGE = 'cliplab.masterKey';
const TIMEOUT_MS = 8000;
const TIMEOUT_SUBIDA_MS = 15 * 60 * 1000;   // subir un video pesado tarda mucho mas que una consulta normal
const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF]/g;
const CABECERA_VALIDA = /^[\x20-\x7E]+$/;

function limpiarLlave(valor) {
  let limpio = String(valor || '').replace(INVISIBLES, '').trim();
  const comilla = limpio.charAt(0);
  if (limpio.length >= 2 && (comilla === '"' || comilla === "'") && limpio.endsWith(comilla)) {
    limpio = limpio.slice(1, -1).trim();
  }
  return limpio;
}

export function leerLlave() {
  try {
    return limpiarLlave(localStorage.getItem(CLAVE_STORAGE));
  } catch {
    return '';
  }
}

export function guardarLlave(valor) {
  try {
    const limpia = limpiarLlave(valor);
    if (limpia) {
      localStorage.setItem(CLAVE_STORAGE, limpia);
    } else {
      localStorage.removeItem(CLAVE_STORAGE);
    }
  } catch {
    // Navegador sin almacenamiento disponible: se ignora.
  }
}

export class ApiError extends Error {
  constructor(mensaje, status, cancelado = false) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.cancelado = cancelado;
    this.requiereLlave = status === 401;
  }
}

async function solicitar(ruta, opciones = {}) {
  const { metodo = 'GET', cuerpo, formulario, signal, timeoutMs = TIMEOUT_MS } = opciones;

  const cabeceras = { Accept: 'application/json' };
  const llave = leerLlave();
  if (llave) {
    if (!CABECERA_VALIDA.test(llave)) {
      throw new ApiError('La llave guardada tiene caracteres no validos (acentos o comillas curvas). Borrala y pega la correcta.', 401);
    }
    cabeceras['x-master-key'] = llave;
  }
  // Con FormData NO se fija Content-Type: el navegador lo pone con el boundary del multipart.
  if (cuerpo !== undefined && formulario === undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(temporizador);
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    signal.addEventListener('abort', () => controlador.abort(), { once: true });
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cabeceras,
      body: formulario !== undefined ? formulario : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
      cache: 'no-store',
    });
  } catch {
    if (signal && signal.aborted && !vencido) {
      throw new ApiError('Solicitud cancelada', 0, true);
    }
    throw new ApiError(vencido ? 'El servidor no respondio a tiempo' : 'Sin conexion con el servidor', 0);
  } finally {
    clearTimeout(temporizador);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok || (datos && datos.success === false)) {
    throw new ApiError((datos && datos.error) || 'Error ' + respuesta.status, respuesta.status);
  }

  // Respuesta estandar { success, data, error }: el resto del panel sigue recibiendo { ok, ...campos }.
  if (datos && typeof datos === 'object' && 'success' in datos) {
    return { ok: true, ...(datos.data || {}) };
  }

  return datos;
}

let proveedorAjustes = null;

/** lote.js registra aqui una funcion que devuelve los ajustes a enviar con cada proyecto nuevo (o null). */
export function registrarAjustesNuevos(fn) {
  proveedorAjustes = typeof fn === 'function' ? fn : null;
}

export function obtenerEstado(signal) {
  return solicitar('/api/panel/estado', { signal });
}

/**
 * Encola un video. Con `archivo` (File) envia multipart/form-data con el campo "archivo" y los demas campos de texto
 * (sin url: el backend acepta enlace o archivo, nunca ambos). Sin archivo envia JSON como siempre.
 * opciones: modo, cantidad, instruccion, estiloSubtitulos (y inicio/duracion). Si "Aplicar tambien a clips nuevos" esta
 * activo (lote.js), se agregan los `ajustes` de lote.
 */
export function encolarVideo(url, opcionesBase = {}, archivo = null) {
  // "Aplicar tambien a clips nuevos" (lote.js): si hay ajustes activos se envian con cada proyecto nuevo.
  const ajustes = proveedorAjustes ? proveedorAjustes() : null;
  const opciones = ajustes && opcionesBase.ajustes === undefined ? { ...opcionesBase, ajustes } : opcionesBase;
  if (!archivo) {
    return solicitar('/api/panel/encolar', { metodo: 'POST', cuerpo: { url, ...opciones } });
  }
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(opciones)) {
    if (clave === 'ajustes' && valor && typeof valor === 'object') {
      formulario.append('ajustes', JSON.stringify(valor));   // multipart solo lleva texto: el backend lo lee como JSON
      continue;
    }
    if (valor !== undefined && valor !== null && valor !== '') formulario.append(clave, String(valor));
  }
  formulario.append('archivo', archivo, archivo.name);   // el archivo va al final: los campos de texto llegan antes
  return solicitar('/api/panel/encolar', { metodo: 'POST', formulario, timeoutMs: TIMEOUT_SUBIDA_MS });
}

export function obtenerIncidencia(id, signal) {
  return solicitar('/api/panel/incidencias/' + encodeURIComponent(id), { signal });
}

export function guardarCookiesRed(red, cookies) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'POST', cuerpo: { cookies } });
}

export function quitarCookiesRed(red) {
  return solicitar('/api/panel/cookies-redes/' + encodeURIComponent(red), { metodo: 'DELETE' });
}

/** Sube una foto/logo (png, jpg, webp). Devuelve { logo: { id, ancho, alto, conAlfa, fondoDetectado, fondoColor } }. */
export function subirLogo(archivo) {
  const formulario = new FormData();
  formulario.append('logo', archivo, archivo.name);
  return solicitar('/api/panel/logo', { metodo: 'POST', formulario, timeoutMs: 60000 });
}

/** Imagen del logo como URL local (blob): <img> no puede enviar la llave maestra, asi que se pide con fetch. */
export async function obtenerLogoUrl(id, sinFondo = false) {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  const respuesta = await fetch('/api/panel/logo/' + encodeURIComponent(id) + (sinFondo ? '?sinFondo=1' : ''), { headers: cabeceras, cache: 'no-store' });
  if (!respuesta.ok) throw new ApiError('No se pudo cargar el logo', respuesta.status);
  return URL.createObjectURL(await respuesta.blob());
}

/** "Aplicar a todos": re-renderiza los clips indicados con los ajustes (cada uno sale como clip nuevo). */
export function aplicarLote(ids, ajustes) {
  return solicitar('/api/panel/lote/aplicar', { metodo: 'POST', cuerpo: { ids, ajustes } });
}

/** Catalogo de solo lectura (canales, destinos, mercados y plan de renders) para el panel. */
export function obtenerCanales(signal) {
  return solicitar('/api/panel/canales', { signal });
}

/** Paquete de texto del clip. `canal` es obligatorio; `mercado` y `destino` (texto o lista separada por comas) son opcionales. */
export function obtenerPaquete(id, { canal, mercado, destino } = {}, signal) {
  const consulta = new URLSearchParams();
  if (canal) consulta.set('canal', canal);
  if (mercado) consulta.set('mercado', mercado);
  if (destino) consulta.set('destino', destino);
  return solicitar('/api/panel/clips/' + encodeURIComponent(id) + '/paquete?' + consulta.toString(), { signal });
}

function nombreDeContentDisposition(cabecera) {
  const m = /filename="?([^";]+)"?/i.exec(String(cabecera || ''));
  const limpio = m ? m[1].replace(/[^A-Za-z0-9._-]/g, '_') : '';
  return /\.mp4$/i.test(limpio) ? limpio : 'clip.mp4';
}

/**
 * Descarga el video del clip. Un enlace <a> no puede enviar la llave maestra, asi que se pide con fetch y se guarda
 * desde un blob (un clip pesa decenas de MB como maximo: cabe sin problema en la RAM del navegador).
 */
export async function descargarVideo(id) {
  const cabeceras = {};
  const llave = leerLlave();
  if (llave && CABECERA_VALIDA.test(llave)) cabeceras['x-master-key'] = llave;
  let respuesta;
  try {
    respuesta = await fetch('/api/panel/clips/' + encodeURIComponent(id) + '/descarga', { headers: cabeceras, cache: 'no-store' });
  } catch {
    throw new ApiError('Sin conexion con el servidor', 0);
  }
  if (!respuesta.ok) {
    let mensaje = 'Error ' + respuesta.status;
    try { const datos = await respuesta.json(); if (datos && datos.error) mensaje = datos.error; } catch { /* sin cuerpo JSON */ }
    throw new ApiError(mensaje, respuesta.status);
  }
  const nombre = nombreDeContentDisposition(respuesta.headers.get('content-disposition'));
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { nombre };
}
CLIPLAB_EOF_PARTE3

escribir "public/js/flujo.js" <<'CLIPLAB_EOF_PARTE3'
// Flujo de trabajo de ClipLab: crear -> Proyectos -> Todos los clips. Solo pinta y reacciona; toda la
// logica de datos (agrupar, filtrar, puntajes, revision tecnica) vive en proyectos.js.
import { encolarVideo } from './api.js';
import { esc, formatoFecha } from './views.js';
import {
  ENCUADRES, ESTILOS_SUBTITULOS, ESTILO_DEFECTO, INSTRUCCION_MAX, agruparProyectos, filtrarProyectos, filtrarClipsFlujo, bloquesDe, revisionDe, nivelDe,
  puntajeDe, tituloDe, descripcionDe, ganchoDe, formatoSeg, slug, prepararEncolar, esTerminado,
  instruccionDe, coincideInstruccion, esArchivoLocal, estiloDe,
} from './proyectos.js';

const LS_FAV = 'cliplab.favoritos';
const LS_ED = 'cliplab.ediciones';
const CLASE_NIVEL = { alto: 'ok', medio: 'info', bajo: 'warn', sin: 'neutro' };

const $ = (id) => document.getElementById(id);

function leerLocal(clave, defecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : defecto;
  } catch {
    return defecto;
  }
}

function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible: favoritos y ediciones solo duran mientras la pestana siga abierta.
  }
}

const e = {
  datos: null,
  favoritos: new Set(leerLocal(LS_FAV, [])),
  ediciones: leerLocal(LS_ED, {}),
  textoProyectos: '',
  textoClips: '',
  soloFavoritos: false,
  orden: 'recientes',
  filtroProyecto: '',
  abierto: '',
  paneles: new Map(),
  revisiones: new Set(),
  html: { proyectos: '', clips: '' },
  editando: null,
  ayudas: null,
};

/* ---------- Piezas de HTML ---------- */

function urlLocal(url) {
  return typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : '';
}

const badge = (texto, clase) => '<span class="badge badge-' + esc(clase) + '">' + esc(texto) + '</span>';
const vacio = (mensaje) => '<div class="vacio">' + esc(mensaje) + '</div>';

function insigniaPuntaje(clip) {
  const p = puntajeDe(clip);
  return p === null ? badge('Sin puntaje', 'neutro') : badge('★ ' + Math.round(p), CLASE_NIVEL[nivelDe(p)]);
}

function video(clip, clase, miniatura = false) {
  const url = urlLocal(clip.url);
  if (!url) return '<div class="sin-video">Archivo no disponible</div>';
  return miniatura
    ? '<video class="' + clase + '" src="' + esc(url) + '#t=0.2" preload="metadata" muted playsinline></video>'
    : '<video class="' + clase + '" src="' + esc(url) + '" controls preload="metadata" playsinline></video>';
}

function chipsBloques(clip) {
  return '<div class="chips-bloques">' + bloquesDe(clip).map((b) =>
    '<span class="chip-bloque nivel-' + b.nivel + '" title="' + esc(b.detalle) + '">' + esc(b.etiqueta) + ' <b>' +
    (b.puntaje === null ? '—' : Math.round(b.puntaje)) + '</b></span>'
  ).join('') + '</div>';
}

/** "Qué buscar" con el que se creó el proyecto (vacío si no hubo). */
function lineaInstruccion(texto, coinciden = null, total = 0) {
  if (!texto) return '';
  const resumen = coinciden === null ? '' : ' · ' + coinciden + (coinciden === 1 ? ' clip coincide' : ' clips coinciden') + (total ? ' de ' + total : '');
  return '<p class="instruccion-proyecto">Qué buscar: <b>' + esc(texto) + '</b>' + esc(resumen) + '</p>';
}

/** Insignia de un clip: coincide (o no) con la instruccion. Sin instruccion no muestra nada. */
function insigniaInstruccion(clip) {
  const c = coincideInstruccion(clip);
  if (c === null) return '';
  return c ? badge('Coincide con lo que buscabas', 'ok') : badge('Sin coincidencia directa', 'neutro');
}

/* ---------- Proyectos ---------- */

function tarjetaProyecto(p) {
  const estados = {
    procesando: badge('Procesando ' + p.enProceso, 'info'),
    listo: badge('Listo', 'ok'),
    parcial: badge('Con errores', 'warn'),
    error: badge('Con error', 'err'),
  };
  const mejor = p.mejorPuntaje === null ? '' : badge('★ ' + Math.round(p.mejorPuntaje), CLASE_NIVEL[nivelDe(p.mejorPuntaje)]);
  return '<article class="card proyecto">' +
    '<div class="miniatura" data-accion="abrir-proyecto" data-id="' + esc(p.id) + '">' +
      (p.miniatura ? video(p.miniatura, 'mini-video', true) : '<div class="sin-video">' + (p.estado === 'procesando' ? 'Procesando…' : 'Sin vista previa') + '</div>') +
    '</div>' +
    '<div class="card-cab"><h3>' + esc(p.titulo) + '</h3>' + mejor + '</div>' +
    '<div class="meta"><span>' + p.listos + (p.listos === 1 ? ' clip generado' : ' clips generados') + '</span>' +
      '<span>Duración ' + esc(formatoSeg(p.duracionTotal)) + '</span><span>' + esc(formatoFecha(p.creadoEn)) + '</span>' +
      (p.origen === 'archivo' ? '<span>Archivo local</span>' : '') + (p.estilo ? '<span>Subtítulos: ' + esc(p.estilo) + '</span>' : '') + '</div>' +
    lineaInstruccion(p.instruccion, p.instruccion ? p.coinciden : null, p.listos) +
    '<div class="card-acciones">' + (estados[p.estado] || '') +
      '<button class="btn btn-primario" type="button" data-accion="abrir-proyecto" data-id="' + esc(p.id) + '">Abrir proyecto</button></div>' +
  '</article>';
}

function miniClip(clip) {
  if (clip.estado === 'procesando') return '<div class="mini mini-estado"><span>Procesando…</span></div>';
  if (clip.estado === 'error') return '<div class="mini mini-estado"><span>Este clip falló</span></div>';
  return '<article class="mini">' +
    '<div class="visor visor-mini">' + video(clip, 'v916') + '<span class="dur">' + esc(formatoSeg(clip.duracion)) + '</span></div>' +
    '<div class="mini-cab"><strong>' + esc(tituloDe(clip, e.ediciones)) + '</strong>' + insigniaPuntaje(clip) + '</div>' +
    insigniaInstruccion(clip) +
    '<p class="mini-gancho">' + (ganchoDe(clip) ? '“' + esc(ganchoDe(clip)) + '”' : '<span class="suave">Sin gancho detectado</span>') + '</p>' +
    chipsBloques(clip) +
  '</article>';
}

function htmlProyectos(clips) {
  const proyectos = agruparProyectos(clips);
  const abierto = e.abierto && proyectos.find((p) => p.id === e.abierto);
  if (abierto) {
    return '<div class="detalle-cab"><button class="btn" type="button" data-accion="cerrar-proyecto">← Proyectos</button>' +
        '<div><h2>' + esc(abierto.titulo) + '</h2><div class="meta"><span>' + abierto.listos + ' de ' + abierto.total + ' clips listos</span>' +
        '<span>Duración ' + esc(formatoSeg(abierto.duracionTotal)) + '</span>' +
        (urlLocal(abierto.fuente) ? '<a href="' + esc(urlLocal(abierto.fuente)) + '" target="_blank" rel="noopener noreferrer">Ver video original</a>' : '') +
        (abierto.origen === 'archivo' ? '<span>Archivo local</span>' : '') + (abierto.estilo ? '<span>Subtítulos: ' + esc(abierto.estilo) + '</span>' : '') + '</div>' +
        lineaInstruccion(abierto.instruccion, abierto.instruccion ? abierto.coinciden : null, abierto.listos) + '</div>' +
        '<button class="btn" type="button" data-accion="ver-clips" data-id="' + esc(abierto.id) + '">Ver en Todos los clips</button></div>' +
      '<div class="fila-clips">' + abierto.clips.map(miniClip).join('') + '</div>';
  }
  const filtrados = filtrarProyectos(proyectos, e.textoProyectos);
  return filtrados.length
    ? '<div class="grid">' + filtrados.map(tarjetaProyecto).join('') + '</div>'
    : vacio(proyectos.length ? 'Ningún proyecto coincide con la búsqueda.' : 'Aún no hay proyectos. Pega un enlace arriba para crear el primero.');
}

/* ---------- Todos los clips ---------- */

function htmlPanel(clip, tipo) {
  if (tipo === 'descripcion') {
    const texto = descripcionDe(clip, e.ediciones);
    return '<div class="panel-extra"><strong>Descripción para publicar</strong><pre>' + esc(texto || 'Sin descripción generada.') + '</pre>' +
      (texto ? '<button class="btn" type="button" data-accion="copiar-desc" data-id="' + esc(clip.id) + '">Copiar</button>' : '') + '</div>';
  }
  if (tipo === 'dicho') {
    return '<div class="panel-extra"><strong>Lo que se dice</strong><pre>' + esc(clip.transcripcion || 'Sin voz detectada en este clip.') + '</pre></div>';
  }
  return '';
}

function tarjetaClip(clip) {
  const rev = revisionDe(clip);
  const fav = e.favoritos.has(clip.id);
  const url = urlLocal(clip.url);
  const proyecto = clip.jobId || clip.id;
  return '<article class="card clip" data-id="' + esc(clip.id) + '">' +
    '<div class="card-cab"><h3>' + esc(tituloDe(clip, e.ediciones)) + '</h3><div class="clip-der">' + insigniaPuntaje(clip) +
      '<button class="fav" type="button" data-accion="fav" data-id="' + esc(clip.id) + '" aria-pressed="' + fav + '" title="' + (fav ? 'Quitar de Me gustan' : 'Me gusta') + '">' + (fav ? '★' : '☆') + '</button></div></div>' +
    '<div class="visor">' + video(clip, 'v916') + '<span class="dur">' + esc(formatoSeg(clip.duracion)) + '</span></div>' +
    '<div class="meta"><span>' + esc(formatoFecha(clip.creadoEn)) + '</span><a href="#" data-accion="ver-clips" data-id="' + esc(proyecto) + '">Mismo proyecto</a></div>' +
    (instruccionDe(clip) ? '<div class="card-acciones">' + insigniaInstruccion(clip) + '</div>' + lineaInstruccion(instruccionDe(clip)) : '') +
    '<div class="bloques">' + bloquesDe(clip).map((b) =>
      '<div class="bloque nivel-' + b.nivel + '"><div class="bloque-cab"><strong>' + esc(b.etiqueta) + '</strong><span>' + (b.puntaje === null ? '—' : Math.round(b.puntaje)) + '</span></div>' +
      '<div class="barra"><span style="width:' + (b.puntaje === null ? 0 : Math.round(b.puntaje)) + '%"></span></div>' +
      (b.detalle ? '<p>' + esc(b.detalle) + '</p>' : '') + '</div>'
    ).join('') + '</div>' +
    '<details class="revision" data-id="' + esc(clip.id) + '"' + (e.revisiones.has(clip.id) ? ' open' : '') + '><summary>Revisión técnica ' + badge(rev.texto, rev.clase) + '</summary>' +
      (rev.filas.length ? '<dl>' + rev.filas.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' : '<p class="suave">Sin datos de revisión.</p>') +
      (rev.alertas.length ? '<ul class="alertas">' + rev.alertas.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '') + '</details>' +
    '<div class="card-acciones">' +
      '<button class="btn" type="button" data-accion="panel" data-tipo="descripcion" data-id="' + esc(clip.id) + '">Descripción para publicar</button>' +
      '<button class="btn" type="button" data-accion="panel" data-tipo="dicho" data-id="' + esc(clip.id) + '">Lo que se dice</button>' +
      '<button class="btn" type="button" data-accion="editar" data-id="' + esc(clip.id) + '">Editar</button>' +
      (clip.estado === 'listo' || clip.estado === 'publicado' ? '<button class="btn btn-primario" type="button" data-accion="paquete" data-id="' + esc(clip.id) + '">Publicar a mano</button>' : '') +
      (url ? '<a class="btn" href="' + esc(url) + '" download="' + esc(slug(tituloDe(clip, e.ediciones))) + '.mp4">Exportar</a>' : '') +
    '</div>' +
    '<div class="panel-slot">' + htmlPanel(clip, e.paneles.get(clip.id)) + '</div>' +
  '</article>';
}

function htmlClips(clips) {
  const lista = filtrarClipsFlujo(clips, {
    texto: e.textoClips, soloFavoritos: e.soloFavoritos, favoritos: e.favoritos,
    proyecto: e.filtroProyecto, orden: e.orden, ediciones: e.ediciones,
  });
  if (lista.length) return '<div class="grid grid-clips">' + lista.map(tarjetaClip).join('') + '</div>';
  if (e.soloFavoritos && e.favoritos.size === 0) return vacio('Aún no marcaste ningún clip con ★. Pulsa la estrella de un clip para guardarlo en Me gustan.');
  return vacio(clips.some(esTerminado) ? 'Ningún clip coincide con los filtros.' : 'Aún no hay clips listos.');
}

/* ---------- Pintado ---------- */

const hayReproduccion = (contenedor) => [...contenedor.querySelectorAll('video')].some((v) => !v.paused && !v.ended);

function pintar(contenedor, clave, html, forzar = false) {
  if (e.html[clave] === html) return;
  if (!forzar && hayReproduccion(contenedor)) return; // no cortar un video en reproduccion; se pinta en el siguiente sondeo
  contenedor.innerHTML = html;
  e.html[clave] = html;
}

export function contadores(datos) {
  if (!datos) return;
  $('n-proyectos').textContent = String(agruparProyectos(datos.clips).length);
}

function actualizarCabeceras(clips) {
  const proyectos = agruparProyectos(clips);
  $('proy-contador').textContent = proyectos.length + (proyectos.length === 1 ? ' proyecto' : ' proyectos');
  $('proy-toolbar').hidden = Boolean(e.abierto);
  const terminados = clips.filter(esTerminado).length;
  const proceso = clips.filter((c) => c.estado === 'procesando').length;
  $('clips-contador').textContent = terminados + (terminados === 1 ? ' clip' : ' clips') + (proceso ? ' · ' + proceso + ' en proceso' : '');
  $('clips-chip-proyecto').hidden = !e.filtroProyecto;
  document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === 'favoritos' === e.soloFavoritos)));
  $('clips-favs').textContent = String(e.favoritos.size);
}

export function render(vista, datos, forzar = false) {
  if (datos) e.datos = datos;
  if (!e.datos) return;
  const clips = e.datos.clips;
  contadores(e.datos);
  actualizarCabeceras(clips);
  if (vista === 'proyectos') pintar($('lista-proyectos'), 'proyectos', htmlProyectos(clips), forzar);
  if (vista === 'clips') pintar($('lista-flujo-clips'), 'clips', htmlClips(clips), forzar);
}

/* ---------- Acciones ---------- */

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

const clipPorId = (id) => (e.datos ? e.datos.clips.find((c) => c.id === id) : null);

function alternarFavorito(id, boton) {
  if (e.favoritos.has(id)) e.favoritos.delete(id);
  else e.favoritos.add(id);
  guardarLocal(LS_FAV, [...e.favoritos]);
  const fav = e.favoritos.has(id);
  boton.setAttribute('aria-pressed', String(fav));
  boton.textContent = fav ? '★' : '☆';
  boton.title = fav ? 'Quitar de Me gustan' : 'Me gusta';
  $('clips-favs').textContent = String(e.favoritos.size);
  e.html.clips = ''; // el HTML guardado ya no coincide con el DOM: se repinta en el proximo cambio
  if (e.soloFavoritos) render('clips', null, true);
}

function alternarPanel(id, tipo, tarjeta) {
  const clip = clipPorId(id);
  if (!clip) return;
  if (e.paneles.get(id) === tipo) e.paneles.delete(id);
  else e.paneles.set(id, tipo);
  tarjeta.querySelector('.panel-slot').innerHTML = htmlPanel(clip, e.paneles.get(id));
  e.html.clips = '';
}

function abrirEditor(id) {
  const clip = clipPorId(id);
  if (!clip) return;
  e.editando = id;
  $('ed-titulo').value = tituloDe(clip, e.ediciones);
  $('ed-desc').value = descripcionDe(clip, e.ediciones);
  $('dlg-editar').showModal();
  $('ed-titulo').focus();
}

function cerrarEditor() {
  $('dlg-editar').close();
  e.editando = null;
}

function irAClips(proyecto) {
  e.filtroProyecto = proyecto;
  e.ayudas.activarVista('clips', false);
  render('clips', null, true);
}

function iniciarVistas() {
  $('vista-proyectos').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-accion]');
    if (!el) return;
    ev.preventDefault();
    if (el.dataset.accion === 'abrir-proyecto') { e.abierto = el.dataset.id; render('proyectos', null, true); }
    if (el.dataset.accion === 'cerrar-proyecto') { e.abierto = ''; render('proyectos', null, true); }
    if (el.dataset.accion === 'ver-clips') irAClips(el.dataset.id);
  });

  $('vista-clips').addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-accion], [data-filtro]');
    if (!el) return;
    if (el.dataset.filtro) {
      e.soloFavoritos = el.dataset.filtro === 'favoritos';
      render('clips', null, true);
      return;
    }
    const tarjeta = el.closest('.clip');
    const id = el.dataset.id;
    switch (el.dataset.accion) {
      case 'fav': alternarFavorito(id, el); break;
      case 'panel': alternarPanel(id, el.dataset.tipo, tarjeta); break;
      case 'editar': abrirEditor(id); break;
      case 'ver-clips': ev.preventDefault(); irAClips(id); break;
      case 'quitar-proyecto': e.filtroProyecto = ''; render('clips', null, true); break;
      case 'copiar-desc': {
        const clip = clipPorId(id);
        const ok = clip ? await copiarTexto(descripcionDe(clip, e.ediciones)) : false;
        e.ayudas.mostrarAviso(ok ? 'Descripción copiada al portapapeles.' : 'No se pudo copiar la descripción.', ok ? 'ok' : 'error');
        break;
      }
      default: break;
    }
  });

  // <details> no propaga "toggle": se escucha en captura para recordar que revisiones estan abiertas.
  $('vista-clips').addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.classList || !d.classList.contains('revision')) return;
    if (d.open) e.revisiones.add(d.dataset.id);
    else e.revisiones.delete(d.dataset.id);
  }, true);

  let temporizador = null;
  const conRetardo = (fn) => (ev) => {
    clearTimeout(temporizador);
    const valor = ev.target.value;
    temporizador = setTimeout(() => fn(valor), 150);
  };
  $('proy-buscar').addEventListener('input', conRetardo((v) => { e.textoProyectos = v; render('proyectos', null, true); }));
  $('clips-buscar').addEventListener('input', conRetardo((v) => { e.textoClips = v; render('clips', null, true); }));
  $('clips-orden').addEventListener('change', (ev) => { e.orden = ev.target.value; render('clips', null, true); });
}

function iniciarEditor() {
  $('form-editar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!e.editando) return;
    const titulo = $('ed-titulo').value.trim();
    const descripcion = $('ed-desc').value.trim();
    if (titulo || descripcion) e.ediciones[e.editando] = { titulo, descripcion };
    else delete e.ediciones[e.editando];
    guardarLocal(LS_ED, e.ediciones);
    cerrarEditor();
    render('clips', null, true);
    e.ayudas.mostrarAviso('Cambios guardados en este navegador.', 'ok');
  });
  $('ed-restaurar').addEventListener('click', () => {
    if (e.editando) delete e.ediciones[e.editando];
    guardarLocal(LS_ED, e.ediciones);
    cerrarEditor();
    render('clips', null, true);
    e.ayudas.mostrarAviso('Se restauró el texto original del clip.', 'info');
  });
  $('ed-cancelar').addEventListener('click', cerrarEditor);
}

/* ---------- Creacion ---------- */

function iniciarCrear() {
  const select = $('sel-encuadre');
  select.innerHTML = Object.entries(ENCUADRES).map(([valor, texto]) => '<option value="' + esc(valor) + '">' + esc(texto) + '</option>').join('');
  const estilos = $('sel-subtitulos');
  estilos.innerHTML = Object.entries(ESTILOS_SUBTITULOS).map(([valor, texto]) => '<option value="' + esc(valor) + '">' + esc(texto) + '</option>').join('');
  estilos.value = ESTILO_DEFECTO;
  $('input-instruccion').maxLength = INSTRUCCION_MAX;

  // Enlace y archivo son excluyentes: con archivo elegido el enlace se deshabilita (y deja de ser obligatorio).
  const sincronizarOrigen = () => {
    const archivo = $('input-archivo').files[0] || null;
    const url = $('input-url');
    url.disabled = Boolean(archivo);
    url.required = !archivo;
    if (archivo) url.value = '';
    const info = $('archivo-info');
    info.hidden = !archivo;
    info.textContent = archivo ? 'Archivo elegido: ' + archivo.name + ' (' + (archivo.size / 1048576).toFixed(1) + ' MB). Para usar un enlace, quita el archivo.' : '';
  };
  $('input-archivo').addEventListener('change', sincronizarOrigen);

  $('form-encolar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const archivo = $('input-archivo').files[0] || null;
    const entrada = prepararEncolar({
      url: $('input-url').value,
      modo: select.value,
      cantidad: $('sel-cantidad').value,
      instruccion: $('input-instruccion').value,
      estiloSubtitulos: estilos.value,
      archivo,
    });
    if (!entrada.ok) {
      e.ayudas.mostrarAviso(entrada.error, 'error', 6000);
      return;
    }
    const boton = $('btn-encolar');
    const textoBoton = boton.textContent;
    boton.disabled = true;
    if (entrada.archivo) {
      boton.textContent = 'Subiendo…';
      e.ayudas.mostrarAviso('Subiendo el archivo: no cierres esta pestaña hasta que termine.', 'info', 0);
    }
    try {
      const { url, ...opciones } = entrada.cuerpo;
      await encolarVideo(url, opciones, entrada.archivo || null);
      $('input-url').value = '';
      $('input-archivo').value = '';
      $('input-instruccion').value = '';
      sincronizarOrigen();
      e.ayudas.mostrarAviso(
        entrada.cuerpo.instruccion
          ? 'Proyecto en cola: el sistema buscará lo que pediste y completará con los mejores momentos.'
          : 'Proyecto en cola: el sistema elegirá los mejores momentos.',
        'ok'
      );
      e.abierto = '';
      e.ayudas.activarVista('proyectos', false);
      e.ayudas.sondearYa();
    } catch (error) {
      if (error.status === 401) e.ayudas.abrirLlave();
      e.ayudas.mostrarAviso('No se pudo crear el proyecto: ' + error.message, 'error', 6000);
    } finally {
      boton.disabled = false;
      boton.textContent = textoBoton;
    }
  });
}

/** ayudas: { mostrarAviso, abrirLlave, sondearYa, activarVista } provistas por panel.js */
export function iniciar(ayudas) {
  e.ayudas = ayudas;
  iniciarCrear();
  iniciarVistas();
  iniciarEditor();
}
CLIPLAB_EOF_PARTE3

escribir "public/js/views.js" <<'CLIPLAB_EOF_PARTE3'
const ETIQUETAS_CLIP = {
  procesando: { texto: 'Procesando', clase: 'info' },
  listo: { texto: 'Listo', clase: 'ok' },
  publicado: { texto: 'Publicado', clase: 'ok' },
  error: { texto: 'Con error', clase: 'err' },
};

const ETIQUETAS_CONEXION = {
  activa: { texto: 'Conectado', clase: 'ok' },
  expirada: { texto: 'Sesion vencida', clase: 'warn' },
  ilegible: { texto: 'Clave distinta', clase: 'err' },
  sin_sesion: { texto: 'Sin sesion', clase: 'neutro' },
};

const NOMBRES_PLATAFORMA = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

const ETIQUETAS_LOTE = {
  activo: { texto: 'Activo', clase: 'info' },
  completado: { texto: 'Completado', clase: 'ok' },
  pausado: { texto: 'Pausado', clase: 'warn' },
  error: { texto: 'Con error', clase: 'err' },
};

const ETIQUETAS_NIVEL = {
  error: { texto: 'Error', clase: 'err' },
  warn: { texto: 'Alerta', clase: 'warn' },
  info: { texto: 'Info', clase: 'info' },
};

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function formatoFecha(iso) {
  if (!iso) return '-';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatoDuracion(segundos) {
  const total = Number(segundos);
  if (!Number.isFinite(total) || total <= 0) return '-';
  const minutos = Math.floor(total / 60);
  const resto = Math.round(total % 60);
  return minutos + ':' + String(resto).padStart(2, '0');
}

function urlSegura(url) {
  return typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : '';
}

function porcentaje(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, Math.min(100, Math.round(numero)));
}

function badge(etiqueta) {
  return '<span class="badge badge-' + esc(etiqueta.clase) + '">' + esc(etiqueta.texto) + '</span>';
}

function barraProgreso(valor) {
  return '<div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    porcentaje(valor) + '"><span style="width:' + porcentaje(valor) + '%"></span></div>';
}

function vacio(mensaje) {
  return '<div class="vacio">' + esc(mensaje) + '</div>';
}

export function filtrarClips(clips, estado, texto) {
  const consulta = String(texto || '').trim().toLowerCase();
  return clips.filter((clip) => {
    if (estado !== 'todos' && clip.estado !== estado) return false;
    if (!consulta) return true;
    const contenido = [clip.titulo, clip.transcripcion, clip.copy, clip.cta].join(' ').toLowerCase();
    return contenido.includes(consulta);
  });
}

export function renderKpis(kpis) {
  const k = kpis || {};
  const items = [
    ['Clips listos', k.clipsListos, 'ok'],
    ['En proceso', k.enProceso, 'info'],
    ['Lotes activos', k.lotesActivos, 'acento'],
    ['Incidencias abiertas', k.incidenciasAbiertas, k.incidenciasAbiertas > 0 ? 'err' : 'neutro'],
    ['Publicados hoy', k.publicadosHoy, 'ok'],
  ];
  return items.map(([titulo, valor, clase]) =>
    '<div class="kpi kpi-' + clase + '"><span class="kpi-valor">' + esc(valor ?? 0) +
    '</span><span class="kpi-titulo">' + esc(titulo) + '</span></div>'
  ).join('');
}

export function renderTrabajos(trabajos) {
  if (!trabajos || trabajos.length === 0) {
    return vacio('No hay trabajos activos en este momento.');
  }
  return trabajos.map((t) =>
    '<div class="fila">' +
      '<div class="fila-cab"><span class="fila-titulo">' + esc(t.titulo) + '</span>' +
      badge({ texto: t.etapa || 'En proceso', clase: 'info' }) + '</div>' +
      barraProgreso(t.progreso) +
      '<div class="meta"><span>' + porcentaje(t.progreso) + '%</span><span>Actualizado ' + esc(formatoFecha(t.actualizadoEn)) + '</span></div>' +
    '</div>'
  ).join('');
}

export function renderClips(clips, mensajeVacio) {
  if (!clips || clips.length === 0) {
    return vacio(mensajeVacio || 'No hay clips para mostrar.');
  }
  return clips.map((clip) => {
    const etiqueta = ETIQUETAS_CLIP[clip.estado] || { texto: clip.estado || 'Desconocido', clase: 'neutro' };
    const video = urlSegura(clip.url);
    const fuente = urlSegura(clip.fuente);
    const plataformas = (clip.plataformas || []).map((p) => NOMBRES_PLATAFORMA[p] || p).join(', ');
    const tieneTexto = Boolean(clip.copy || clip.cta);

    return '<article class="card" data-id="' + esc(clip.id) + '">' +
      '<div class="card-cab"><h3>' + esc(clip.titulo) + '</h3>' + badge(etiqueta) + '</div>' +
      '<div class="meta"><span>Duracion: ' + esc(formatoDuracion(clip.duracion)) + '</span>' +
        '<span>Creado: ' + esc(formatoFecha(clip.creadoEn)) + '</span>' +
        (plataformas ? '<span>Publicado en: ' + esc(plataformas) + '</span>' : '') + '</div>' +
      (clip.estado === 'procesando'
        ? barraProgreso(clip.progreso) + '<div class="meta"><span>' + esc(clip.etapa || 'En proceso') + ' - ' + porcentaje(clip.progreso) + '%</span></div>'
        : '') +
      (clip.marketing && clip.marketing.titulo ? '<div class="copy"><strong>Titulo viral</strong><p>' + esc(clip.marketing.titulo) + '</p></div>' : '') +
      (clip.copy ? '<div class="copy"><strong>Descripcion + hashtags</strong><p>' + esc(clip.copy) + '</p></div>' : '') +
      (clip.cta ? '<div class="copy"><strong>CTA</strong><p>' + esc(clip.cta) + '</p></div>' : '') +
      (fuente && fuente !== clip.titulo ? '<div class="fuente">Fuente: <a href="' + esc(fuente) + '" target="_blank" rel="noopener noreferrer">' + esc(fuente) + '</a></div>' : '') +
      '<div class="card-acciones">' +
        (video ? '<a class="btn" href="' + esc(video) + '" target="_blank" rel="noopener noreferrer">Ver video</a>' : '') +
        (tieneTexto ? '<button class="btn" type="button" data-copiar="' + esc(clip.id) + '">Copiar copy</button>' : '') +
        (clip.estado === 'listo' || clip.estado === 'publicado' ? '<button class="btn btn-primario" type="button" data-accion="paquete" data-id="' + esc(clip.id) + '">Publicar a mano</button>' : '') +
      '</div>' +
    '</article>';
  }).join('');
}

export function nombrePlataforma(plataforma) {
  return NOMBRES_PLATAFORMA[plataforma] || plataforma;
}

export function renderConexiones(conexiones) {
  if (!conexiones || conexiones.length === 0) {
    return vacio('No hay cuentas vinculadas todavia.');
  }
  return conexiones.map((c) => {
    const etiqueta = ETIQUETAS_CONEXION[c.estado] || { texto: c.estado || 'Desconocido', clase: 'neutro' };
    const conSesion = c.estado !== 'sin_sesion';
    const plat = esc(c.plataforma);
    return '<article class="card">' +
      '<div class="card-cab"><h3>' + esc(nombrePlataforma(c.plataforma)) + '</h3>' + badge(etiqueta) + '</div>' +
      '<div class="meta"><span>Cuenta: ' + esc(c.cuenta || (c.estado === 'activa' ? 'cuenta vinculada' : 'sin vincular')) + '</span>' +
      (c.expiraEn ? '<span>Vence: ' + esc(formatoFecha(c.expiraEn)) + '</span>' : '') +
      '<span>Ultima verificacion: ' + esc(formatoFecha(c.ultimaVerificacion)) + '</span></div>' +
      (c.estado === 'ilegible' && c.detalle ? '<div class="meta"><span>' + esc(c.detalle) + '</span></div>' : '') +
      '<div class="acciones">' +
        '<button class="btn' + (c.estado === 'activa' ? '' : ' btn-primario') + '" type="button" data-red-accion="pegar" data-red="' + plat + '">' +
          (conSesion ? 'Reemplazar cookies' : 'Pegar cookies') + '</button>' +
        (conSesion ? '<button class="btn" type="button" data-red-accion="quitar" data-red="' + plat + '">Quitar</button>' : '') +
      '</div>' +
    '</article>';
  }).join('');
}

export function renderLotes(lotes) {
  if (!lotes || lotes.length === 0) {
    return vacio('No hay lotes de produccion todavia.');
  }
  return lotes.map((l) => {
    const etiqueta = ETIQUETAS_LOTE[l.estado] || { texto: l.estado || 'Desconocido', clase: 'neutro' };
    const total = Number(l.total) || 0;
    const completados = Number(l.completados) || 0;
    const avance = total > 0 ? (completados / total) * 100 : 0;
    return '<article class="card">' +
      '<div class="card-cab"><h3>' + esc(l.nombre || l.id) + '</h3>' + badge(etiqueta) + '</div>' +
      barraProgreso(avance) +
      '<div class="meta"><span>' + completados + ' de ' + total + ' completados</span>' +
      '<span>Fallidos: ' + esc(l.fallidos ?? 0) + '</span>' +
      '<span>Creado: ' + esc(formatoFecha(l.creadoEn)) + '</span></div>' +
    '</article>';
  }).join('');
}

export function renderIncidencias(incidencias, ocultarResueltas, contexto = {}) {
  const abiertas = contexto.abiertas || new Set();
  const textos = contexto.textos || new Map();
  const visibles = (incidencias || []).filter((i) => !(ocultarResueltas && i.resuelta));
  if (visibles.length === 0) {
    return vacio('Sin incidencias registradas.');
  }
  return visibles.map((i) => {
    const etiqueta = ETIQUETAS_NIVEL[i.nivel] || ETIQUETAS_NIVEL.info;
    // El stderr completo se pide bajo demanda (data-inc); mientras llega se muestra el resumen.
    const tieneDetalle = Boolean(i.tieneDetalle || i.detalle);
    const textoDetalle = textos.get(i.id) || i.detalle || i.detalleResumen || '';
    const kb = i.detalleBytes ? ' (' + Math.max(1, Math.round(i.detalleBytes / 1024)) + ' KB)' : '';
    return '<div class="fila nivel-' + esc(i.nivel in ETIQUETAS_NIVEL ? i.nivel : 'info') + (i.resuelta ? ' resuelta' : '') + '">' +
      '<div class="fila-cab"><span class="fila-titulo">' + esc(i.mensaje) + '</span>' + badge(etiqueta) + '</div>' +
      '<div class="meta"><span>Origen: ' + esc(i.origen || 'sistema') + '</span>' +
      '<span>' + esc(formatoFecha(i.creadoEn)) + '</span>' +
      '<span>' + (i.resuelta ? 'Resuelta' : 'Abierta') + '</span></div>' +
      (tieneDetalle
        ? '<details class="detalle" data-inc="' + esc(i.id) + '"' + (abiertas.has(i.id) ? ' open' : '') + '>' +
          '<summary>Ver stderr completo' + esc(kb) + '</summary><pre>' + esc(textoDetalle) + '</pre></details>'
        : '') +
    '</div>';
  }).join('');
}

export function renderMarketing(clips) {
  const lista = clips || [];
  const total = lista.length;
  const conCopy = lista.filter((c) => c.copy).length;
  const conCta = lista.filter((c) => c.cta).length;
  const publicados = lista.filter((c) => c.estado === 'publicado').length;

  const porPlataforma = {};
  for (const clip of lista) {
    for (const plataforma of clip.plataformas || []) {
      porPlataforma[plataforma] = (porPlataforma[plataforma] || 0) + 1;
    }
  }
  const maximo = Math.max(1, ...Object.values(porPlataforma));

  const kpis = renderKpis({}).length ? '' : '';
  void kpis;

  const resumen = [
    ['Clips totales', total, 'acento'],
    ['Con copy', conCopy, 'info'],
    ['Con CTA', conCta, 'info'],
    ['Publicados', publicados, 'ok'],
  ].map(([titulo, valor, clase]) =>
    '<div class="kpi kpi-' + clase + '"><span class="kpi-valor">' + esc(valor) + '</span><span class="kpi-titulo">' + esc(titulo) + '</span></div>'
  ).join('');

  const barras = Object.keys(porPlataforma).length === 0
    ? vacio('Aun no hay publicaciones por plataforma.')
    : Object.entries(porPlataforma).map(([plataforma, cantidad]) =>
      '<div class="barra-fila"><span>' + esc(NOMBRES_PLATAFORMA[plataforma] || plataforma) + '</span>' +
      '<div class="barra"><span style="width:' + Math.round((cantidad / maximo) * 100) + '%"></span></div>' +
      '<span class="barra-num">' + cantidad + '</span></div>'
    ).join('');

  const recientes = lista.filter((c) => c.copy).slice(0, 5).map((c) =>
    '<div class="fila"><div class="fila-titulo">' + esc(c.titulo) + '</div>' +
    '<div class="copy"><strong>Copy</strong><p>' + esc(c.copy) + '</p></div>' +
    (c.cta ? '<div class="copy"><strong>CTA</strong><p>' + esc(c.cta) + '</p></div>' : '') + '</div>'
  ).join('');

  return '<div class="kpis">' + resumen + '</div>' +
    '<h2 class="titulo-seccion">Publicaciones por plataforma</h2>' + barras +
    '<h2 class="titulo-seccion">Ultimos textos comerciales</h2>' +
    '<div class="lista">' + (recientes || vacio('Aun no hay copies generados.')) + '</div>';
}
CLIPLAB_EOF_PARTE3

escribir "public/index.html" <<'CLIPLAB_EOF_PARTE3'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#0a0d14">
  <title>ClipLab Pro</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%236d7bff'/%3E%3Cpath d='M12 9l12 7-12 7z' fill='white'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/lote.css">
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="logo" aria-hidden="true">&#9654;</div>
        <div>
          <h1>ClipLab <span>Pro</span></h1>
          <p id="sync" class="sync" data-estado="pendiente" role="status">
            <span class="dot"></span><span id="sync-texto">Conectando...</span>
          </p>
        </div>
      </div>
      <div class="acciones">
        <button id="btn-refrescar" class="btn btn-icono" type="button" title="Actualizar ahora" aria-label="Actualizar ahora">&#10227;</button>
        <a class="btn" id="lnk-sesion" href="/sesion.html" style="text-decoration:none">&#127850; Sesion</a>
        <button id="btn-llave" class="btn" type="button">&#128273; Llave</button>
      </div>
    </header>

    <form id="form-encolar" class="crear" autocomplete="off">
      <div class="crear-fila">
        <input id="input-url" type="url" inputmode="url" placeholder="Pega el enlace del video (https://...)" required>
        <button id="btn-encolar" class="btn btn-primario" type="submit">Crear clips</button>
      </div>
      <div class="crear-opciones">
        <label class="campo">Formato
          <select id="sel-formato" disabled title="El motor siempre exporta en vertical"><option>9:16 vertical</option></select>
        </label>
        <label class="campo">Calidad
          <select id="sel-calidad" disabled title="Resolución fija del motor"><option>1080x1920</option></select>
        </label>
        <label class="campo">Encuadre
          <select id="sel-encuadre" title="Conversación: sigue a quien habla. Plano amplio: video completo sobre fondo desenfocado."></select>
        </label>
        <label class="campo">Clips
          <select id="sel-cantidad" title="Cuántos momentos extraer del video">
            <option value="auto">Automático (4-5)</option>
            <option value="1">1</option><option value="2">2</option><option value="3">3</option>
            <option value="4">4</option><option value="5">5</option>
          </select>
        </label>
        <label class="campo">Subtítulos
          <select id="sel-subtitulos" title="Dinámico: mayúsculas y resalte palabra por palabra. Clásico: blanco con contorno. Minimal: texto pequeño sobre caja translúcida."></select>
        </label>
      </div>
      <div class="crear-opciones">
        <label class="campo campo-ancho">O sube un archivo local (mp4, mov, mkv, webm)
          <input id="input-archivo" type="file" accept=".mp4,.mov,.mkv,.webm,video/mp4,video/quicktime,video/x-matroska,video/webm">
        </label>
        <label class="campo campo-ancho">Qué buscar (opcional)
          <input id="input-instruccion" type="text" maxlength="300" placeholder="Ej.: los momentos donde hablan de precios">
        </label>
      </div>
      <p id="archivo-info" class="suave" hidden></p>
    </form>

    <p id="aviso" class="aviso" hidden role="status"></p>

    <nav class="tabs" role="tablist" aria-label="Secciones">
      <button class="tab" role="tab" type="button" data-vista="resumen">Resumen</button>
      <button class="tab" role="tab" type="button" data-vista="conexiones">Conexiones</button>
      <button class="tab" role="tab" type="button" data-vista="proyectos">Proyectos <span id="n-proyectos" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="clips">Todos los clips <span id="n-clips" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="lotes">Lotes / Variantes <span id="n-lotes" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="incidencias">Incidencias <span id="n-incidencias" class="contador">0</span></button>
      <button class="tab" role="tab" type="button" data-vista="marketing">Marketing y Analiticas</button>
      <button type="button" class="tab" data-vista="publicador" role="tab" aria-selected="false">Programar y Publicar</button>
    </nav>

    <main>
      <section id="vista-resumen" class="vista" data-vista="resumen" role="tabpanel">
        <div id="kpis" class="kpis"></div>
        <h2 class="titulo-seccion">Trabajos activos</h2>
        <div id="trabajos-activos" class="lista"></div>
        <h2 class="titulo-seccion">Clips listos</h2>
        <div id="clips-listos" class="grid"></div>
      </section>

      <section id="vista-conexiones" class="vista" data-vista="conexiones" role="tabpanel" hidden>
        <div id="lista-conexiones" class="grid"></div>
      </section>

      <section id="vista-proyectos" class="vista" data-vista="proyectos" role="tabpanel" hidden>
        <div id="proy-toolbar" class="toolbar">
          <input id="proy-buscar" type="search" placeholder="Buscar proyecto..." aria-label="Buscar proyectos">
          <span id="proy-contador" class="suave">0 proyectos</span>
        </div>
        <div id="lista-proyectos"></div>
      </section>

      <section id="vista-clips" class="vista" data-vista="clips" role="tabpanel" hidden>
        <div class="toolbar">
          <input id="clips-buscar" type="search" placeholder="Buscar por título o lo que se dice..." aria-label="Buscar clips">
          <div class="segmento" role="group" aria-label="Filtro">
            <button class="btn" type="button" data-filtro="todos" aria-pressed="true">Todos</button>
            <button class="btn" type="button" data-filtro="favoritos" aria-pressed="false">Me gustan <span id="clips-favs" class="contador">0</span></button>
          </div>
          <select id="clips-orden" aria-label="Ordenar">
            <option value="recientes">Más recientes</option>
            <option value="puntaje">Mejor puntaje</option>
          </select>
          <span id="clips-contador" class="suave">0 clips</span>
          <span id="clips-chip-proyecto" class="chip-filtro" hidden>Solo un proyecto <button type="button" data-accion="quitar-proyecto" aria-label="Quitar filtro de proyecto">&times;</button></span>
        </div>
        <div id="lista-flujo-clips"></div>
      </section>

      <section id="vista-lotes" class="vista" data-vista="lotes" role="tabpanel" hidden>
        <div id="lista-lotes" class="grid"></div>
      </section>

      <section id="vista-incidencias" class="vista" data-vista="incidencias" role="tabpanel" hidden>
        <div class="toolbar">
          <label class="check"><input id="inc-ocultar" type="checkbox"> Ocultar resueltas</label>
        </div>
        <div id="lista-incidencias" class="lista"></div>
      </section>

      <section id="vista-marketing" class="vista" data-vista="marketing" role="tabpanel" hidden>
        <div id="marketing"></div>
      </section>
      <section id="vista-publicador" class="vista" data-vista="publicador" role="tabpanel" hidden>
        <div id="panel-publicador-ui"></div>
      </section>
    </main>
  </div>

  <dialog id="dlg-llave">
    <form id="form-llave" autocomplete="off">
      <h2>Llave maestra</h2>
      <p>Se guarda solo en este navegador y se envia en la cabecera <code>x-master-key</code>.</p>
      <input id="input-llave" class="secreto" type="text" name="clave-maestra-cliplab" placeholder="MASTER_KEY" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <div class="dlg-acciones">
        <button id="llave-borrar" class="btn" type="button">Borrar</button>
        <button id="llave-cancelar" class="btn" type="button">Cancelar</button>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <dialog id="dlg-red">
    <form id="form-red" autocomplete="off">
      <h2 id="red-titulo">Pegar cookies</h2>
      <p id="red-pasos"></p>
      <textarea id="input-cookies" class="area-cookies" rows="8" spellcheck="false" autocomplete="off" placeholder='[ { "name": "sessionid", "value": "...", "domain": ".tiktok.com" } ]'></textarea>
      <p id="red-error" class="red-error" role="alert" hidden></p>
      <div class="dlg-acciones">
        <button id="red-cancelar" class="btn" type="button">Cancelar</button>
        <button id="red-guardar" class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <dialog id="dlg-editar">
    <form id="form-editar" autocomplete="off">
      <h2>Editar clip</h2>
      <p>Los cambios se guardan solo en este navegador; el video y la ficha del servidor no se modifican.</p>
      <label class="campo-bloque">Título <input id="ed-titulo" type="text" maxlength="120"></label>
      <label class="campo-bloque">Descripción para publicar <textarea id="ed-desc" class="area-cookies" rows="8"></textarea></label>
      <div class="dlg-acciones">
        <button id="ed-restaurar" class="btn" type="button">Restaurar original</button>
        <button id="ed-cancelar" class="btn" type="button">Cancelar</button>
        <button class="btn btn-primario" type="submit">Guardar</button>
      </div>
    </form>
  </dialog>

  <noscript><p class="aviso">ClipLab Pro necesita JavaScript para funcionar.</p></noscript>
  <script type="module" src="/js/panel.js"></script>
  <script type="module" src="/js/lote.js"></script>
  <script type="module" src="/js/paquete.js"></script>
</body>
</html>
CLIPLAB_EOF_PARTE3

escribir "public/css/styles.css" <<'CLIPLAB_EOF_PARTE3'
:root {
  color-scheme: dark;
  --bg: #0a0d14;
  --panel: #0f1420;
  --panel-2: #141b2b;
  --borde: #1f2940;
  --texto: #e6eaf5;
  --suave: #8b97b4;
  --acento: #6d7bff;
  --acento-2: #8a5cff;
  --ok: #3ecf8e;
  --warn: #f5b84b;
  --err: #ff6b6b;
  --info: #5ab0ff;
  --radio: 12px;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--texto);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.app { max-width: 1176px; margin: 0 auto; padding: 16px; }

code {
  background: var(--panel-2);
  border: 1px solid var(--borde);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
}

/* Cabecera */
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.logo {
  width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--acento), var(--acento-2)); color: #fff; font-size: 14px; flex: none;
}
h1 { margin: 0; font-size: 18px; line-height: 1.2; }
h1 span { color: var(--acento); }
h2 { margin: 0; }
.acciones { display: flex; gap: 8px; flex: none; }

.sync { margin: 2px 0 0; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--suave); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--suave); flex: none; }
.sync[data-estado="ok"] .dot { background: var(--ok); }
.sync[data-estado="error"] .dot { background: var(--err); }
.sync[data-estado="pendiente"] .dot { background: var(--warn); }

/* Botones e inputs */
.btn {
  background: var(--panel-2); color: var(--texto); border: 1px solid var(--borde); border-radius: 10px;
  padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
.btn:hover { border-color: var(--acento); }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn-primario { background: linear-gradient(135deg, var(--acento), var(--acento-2)); border-color: transparent; color: #fff; }
.btn-icono { padding: 7px 11px; font-size: 16px; line-height: 1; }
.btn.con-llave { border-color: var(--ok); }

input[type="text"], input[type="url"], input[type="search"], input[type="password"], select {
  background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 10px;
  padding: 10px 12px; font: inherit; width: 100%; min-width: 0;
}
input:focus, select:focus, .btn:focus-visible, .tab:focus-visible { outline: 2px solid var(--acento); outline-offset: 1px; }
select { width: auto; }

.encolar { display: flex; gap: 10px; margin-bottom: 10px; }
.encolar .btn { padding: 10px 18px; }

.aviso {
  margin: 0 0 12px; padding: 9px 12px; border-radius: 10px; font-size: 13px;
  background: var(--panel-2); border: 1px solid var(--borde); color: var(--texto);
}
.aviso[data-tipo="ok"] { border-color: var(--ok); }
.aviso[data-tipo="error"] { border-color: var(--err); }

/* Tabs */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--borde); margin-bottom: 14px; overflow-x: auto; scrollbar-width: thin; }
.tab {
  background: none; border: 0; border-bottom: 2px solid transparent; color: var(--suave);
  padding: 10px 12px; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.tab:hover { color: var(--texto); }
.tab[aria-selected="true"] { color: var(--texto); border-bottom-color: var(--acento); }
.contador {
  display: inline-block; min-width: 20px; padding: 0 6px; margin-left: 4px; border-radius: 999px;
  background: var(--panel-2); border: 1px solid var(--borde); font-size: 11px; text-align: center; color: var(--suave);
}

/* Layout de contenido */
.titulo-seccion { font-size: 14px; color: var(--suave); text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 10px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
.check { display: flex; align-items: center; gap: 8px; color: var(--suave); cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.lista { display: flex; flex-direction: column; gap: 8px; }
.vacio {
  grid-column: 1 / -1; padding: 28px 16px; text-align: center; color: var(--suave);
  background: var(--panel); border: 1px dashed var(--borde); border-radius: var(--radio);
}

/* KPIs */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px; display: flex; flex-direction: column; gap: 2px; }
.kpi-valor { font-size: 26px; font-weight: 700; }
.kpi-titulo { color: var(--suave); font-size: 12px; }
.kpi-ok .kpi-valor { color: var(--ok); }
.kpi-info .kpi-valor { color: var(--info); }
.kpi-acento .kpi-valor { color: var(--acento); }
.kpi-err .kpi-valor { color: var(--err); }

/* Tarjetas */
.card { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.card h3 { margin: 0; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
.meta { color: var(--suave); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.fuente { color: var(--suave); font-size: 12px; overflow-wrap: anywhere; }
.copy { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 8px 10px; }
.copy strong { display: block; font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .05em; }
.copy p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.card-acciones { display: flex; gap: 8px; flex-wrap: wrap; }

.fila { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.fila-cab { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.fila-titulo { font-weight: 600; overflow-wrap: anywhere; }
.fila.nivel-error { border-left: 3px solid var(--err); }
.fila.nivel-warn { border-left: 3px solid var(--warn); }
.fila.nivel-info { border-left: 3px solid var(--info); }
.fila.resuelta { opacity: .6; }

/* Badges y progreso */
.badge { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--borde); white-space: nowrap; flex: none; }
.badge-ok { color: var(--ok); border-color: rgba(62, 207, 142, .45); background: rgba(62, 207, 142, .08); }
.badge-warn { color: var(--warn); border-color: rgba(245, 184, 75, .45); background: rgba(245, 184, 75, .08); }
.badge-err { color: var(--err); border-color: rgba(255, 107, 107, .45); background: rgba(255, 107, 107, .08); }
.badge-info { color: var(--info); border-color: rgba(90, 176, 255, .45); background: rgba(90, 176, 255, .08); }
.badge-neutro { color: var(--suave); }

.progreso { height: 6px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.progreso > span { display: block; height: 100%; background: linear-gradient(90deg, var(--acento), var(--acento-2)); transition: width .4s ease; }

/* Marketing */
.barra-fila { display: grid; grid-template-columns: 110px 1fr 40px; align-items: center; gap: 10px; margin-bottom: 8px; }
.barra { height: 10px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.barra > span { display: block; height: 100%; background: var(--acento); }
.barra-num { text-align: right; color: var(--suave); }

/* Dialogo de llave */
dialog { background: var(--panel); color: var(--texto); border: 1px solid var(--borde); border-radius: 14px; padding: 18px; width: min(92vw, 420px); }
dialog::backdrop { background: rgba(0, 0, 0, .65); }
dialog h2 { font-size: 16px; margin-bottom: 6px; }
dialog p { color: var(--suave); margin: 0 0 12px; }
.dlg-acciones { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

@media (max-width: 640px) {
  .app { padding: 12px; }
  .encolar { flex-direction: column; }
  .toolbar { flex-direction: column; align-items: stretch; }
  select { width: 100%; }
  .grid { grid-template-columns: 1fr; }
  .barra-fila { grid-template-columns: 80px 1fr 32px; }
}

.secreto { -webkit-text-security: disc; }

.area-cookies { width: 100%; box-sizing: border-box; background: var(--fondo, #0b0d12); color: var(--texto); border: 1px solid var(--borde); border-radius: 8px; padding: 10px; font: 12px/1.4 ui-monospace, monospace; resize: vertical; }
.red-error { color: var(--err); margin: 8px 0 0; }

/* ---------- Paleta con mas contraste y color (sobrescribe las variables de arriba) ---------- */
:root {
  --bg: #070a12;
  --panel: #121a2c;
  --panel-2: #1a253d;
  --borde: #2c3b5c;
  --texto: #f2f5fc;
  --suave: #aab6d3;
  --acento: #7c6bff;
  --acento-2: #c45cff;
  --ok: #35e3a3;
  --warn: #ffc65c;
  --err: #ff6b82;
  --info: #4cc3ff;
}
body { background: radial-gradient(1200px 500px at 50% -120px, rgba(124, 107, 255, .16), transparent 70%), var(--bg); }
.card, .fila, .kpi, .mini { box-shadow: 0 1px 0 rgba(255, 255, 255, .03) inset, 0 6px 18px rgba(0, 0, 0, .25); }
.card:hover { border-color: #3d4f78; }
.btn-primario { background: linear-gradient(135deg, var(--acento), var(--acento-2)); border-color: transparent; color: #fff; }
.btn-primario:hover { filter: brightness(1.1); }
.tab[aria-selected="true"] { border-bottom-color: var(--acento-2); }
.contador { background: rgba(124, 107, 255, .22); color: #dcd6ff; }
.badge-ok { background: rgba(53, 227, 163, .14); border-color: rgba(53, 227, 163, .6); }
.badge-warn { background: rgba(255, 198, 92, .14); border-color: rgba(255, 198, 92, .6); }
.badge-err { background: rgba(255, 107, 130, .14); border-color: rgba(255, 107, 130, .6); }
.badge-info { background: rgba(76, 195, 255, .14); border-color: rgba(76, 195, 255, .6); }
.badge-neutro { color: #cdd5ea; border-color: #43557d; background: rgba(255, 255, 255, .05); }
.kpi-valor { font-size: 28px; }

/* ---------- Flujo: crear, Proyectos, Todos los clips ---------- */
.suave { color: var(--suave); }
.crear { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.crear-fila { display: flex; gap: 10px; }
.crear-fila .btn { padding: 10px 18px; white-space: nowrap; }
.crear-opciones { display: flex; flex-wrap: wrap; gap: 10px; }
.campo { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .04em; min-width: 140px; }
.campo select, .campo input { text-transform: none; letter-spacing: 0; font-size: 13px; }
.campo select:disabled, .campo input:disabled { opacity: .55; cursor: not-allowed; }
.campo-ancho { flex: 1 1 260px; }
.campo-bloque { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; color: var(--suave); font-size: 12px; }
.instruccion-proyecto { margin: 6px 0 0; font-size: 12px; color: var(--suave); }
.instruccion-proyecto b { color: var(--texto); font-weight: 600; }
.badge-instruccion { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

.toolbar .segmento { display: flex; gap: 0; }
.segmento .btn { border-radius: 0; }
.segmento .btn:first-child { border-radius: 8px 0 0 8px; }
.segmento .btn:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
.segmento .btn[aria-pressed="true"] { background: var(--acento); border-color: var(--acento); color: #fff; }
.chip-filtro { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--borde); border-radius: 999px; color: var(--suave); font-size: 12px; }
.chip-filtro button { background: none; border: 0; color: var(--texto); cursor: pointer; font-size: 15px; line-height: 1; }
.toolbar { flex-wrap: wrap; }
.toolbar input[type="search"] { flex: 1 1 220px; }

.proyecto .miniatura { aspect-ratio: 16 / 9; background: var(--panel-2); border-radius: 10px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mini-video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.sin-video { color: var(--suave); font-size: 12px; padding: 12px; text-align: center; }
.detalle-cab { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 14px; }
.detalle-cab > div { flex: 1 1 240px; min-width: 0; }
.detalle-cab h2 { margin: 0 0 4px; font-size: 18px; overflow-wrap: anywhere; }
.fila-clips { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; scroll-snap-type: x proximity; }
.mini { flex: 0 0 200px; scroll-snap-align: start; background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.mini-estado { align-items: center; justify-content: center; min-height: 200px; color: var(--suave); }
.mini-cab { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; font-size: 12px; }
.mini-cab strong { overflow-wrap: anywhere; }
.mini-gancho { margin: 0; font-size: 12px; color: var(--texto); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.visor { position: relative; background: #000; border-radius: 10px; overflow: hidden; }
.visor .v916 { display: block; width: 100%; aspect-ratio: 9 / 16; object-fit: contain; background: #000; }
.visor .sin-video { aspect-ratio: 9 / 16; display: flex; align-items: center; justify-content: center; }
.visor .dur { position: absolute; right: 8px; top: 8px; background: rgba(0, 0, 0, .65); border-radius: 6px; padding: 1px 7px; font-size: 11px; pointer-events: none; }
.visor-mini .v916 { max-height: 300px; }
.chips-bloques { display: flex; flex-wrap: wrap; gap: 4px; }
.chip-bloque { font-size: 10px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--borde); color: var(--suave); }
.chip-bloque b { color: var(--texto); }
.chip-bloque.nivel-alto, .bloque.nivel-alto .barra span { border-color: rgba(62, 207, 142, .5); }
.chip-bloque.nivel-medio { border-color: rgba(90, 176, 255, .5); }
.chip-bloque.nivel-bajo { border-color: rgba(245, 184, 75, .5); }

.grid-clips { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.clip-der { display: flex; align-items: center; gap: 6px; flex: none; }
.fav { background: none; border: 1px solid var(--borde); border-radius: 8px; color: var(--warn); font-size: 18px; line-height: 1; padding: 2px 8px; cursor: pointer; }
.fav[aria-pressed="true"] { background: rgba(245, 184, 75, .12); border-color: rgba(245, 184, 75, .5); }
.bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bloque { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 8px; min-width: 0; }
.bloque-cab { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.bloque .barra { height: 6px; }
.bloque.nivel-alto .barra span { background: var(--ok); }
.bloque.nivel-medio .barra span { background: var(--info); }
.bloque.nivel-bajo .barra span { background: var(--warn); }
.bloque p { margin: 6px 0 0; font-size: 11px; color: var(--suave); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.revision { border: 1px solid var(--borde); border-radius: 10px; padding: 8px 10px; }
.revision summary { cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.revision dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 8px 0 0; font-size: 12px; }
.revision dt { color: var(--suave); }
.revision dd { margin: 0; }
.alertas { margin: 8px 0 0; padding-left: 18px; color: var(--warn); font-size: 12px; }
.panel-extra { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.panel-extra strong { font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .05em; }
.panel-extra pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 240px; overflow-y: auto; }
.card-acciones a.btn { text-decoration: none; }

@media (max-width: 640px) {
  .crear-fila { flex-direction: column; }
  .campo { min-width: calc(50% - 5px); flex: 1 1 calc(50% - 5px); }
  .bloques { grid-template-columns: 1fr; }
}

/* Publicar a mano: paquete de texto y descarga (Parte 3) */
dialog.dlg-paquete { width: min(94vw, 720px); max-height: 86vh; overflow-y: auto; }
.dlg-paquete .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
.dlg-paquete .paquete { margin-top: 10px; }
.dlg-paquete .paquete h3 { margin: 0 0 6px; }
.dlg-paquete .aviso-paquete { color: var(--atencion, #f5b942); margin: 4px 0; }
.dlg-paquete .variante { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; margin-top: 6px; }
.dlg-paquete [data-tipo="error"] { color: var(--error, #ff6b6b); }
.dlg-paquete [data-tipo="ok"] { color: var(--ok, #4ade80); }
CLIPLAB_EOF_PARTE3

escribir "ESTADO_CLIPLAB_PRO.md" <<'CLIPLAB_EOF_PARTE3'
# ESTADO_CLIPLAB_PRO.md — Relevo para la siguiente instancia de Claude

Repo: `cliplab-backend` (Node 22, ESM, Express + FFmpeg). Base: commit `d64f983` de github.com/mxldigitalservices-oss/cliplab-backend + Partes 1, 2 y 3 aplicadas (sin commit; vienen en el zip y en `aplicar-parte3.sh`).
Idioma de trabajo con el usuario: español informal (usa voz a texto; interpretar abreviaturas).
**Si eres la siguiente instancia: lee SOLO este archivo y `.cliplab-handoff.json`; no vuelvas a estudiar los 3 repos.** Arranca directo en la Parte 4 (las decisiones de la sección 11 ya están cerradas: no las vuelvas a preguntar).

## 1. Objetivo del proyecto
ClipLab Pro como **estación local de producción de video** (`CLIPLAB_MODE=local`) para una laptop de 16 GB de RAM e Intel UHD Graphics 620, con respaldo seguro a CPU `libx264` (hilos limitados). **Sin publicador automático**: el sistema prepara videos, cortes, compilados y paquetes de texto para que el usuario los **descargue y copie manualmente**. Sin APIs costosas ni generación de video pesada.
Tres canales aislados (`stories`, `sports`, `news`), mercado principal inglés `en-US` y subcanal `es-US`. Destinos: `facebook_reels` (adultos 27+, nichos prioritarios + 2 ranuras reservadas), `instagram_reels` (espejo del mismo render 9:16), `youtube_shorts` (embudo), `youtube_long` (concatena las partes en orden; estructura serie/lista; variantes de título/gancho).

## 2. Reglas del usuario (estrictas)
- **NO tocar**: `src/engine/pipeline.js`, `src/upload.js`, `src/engine/rotacion*.js` (la extracción múltiple vive en `pipeline.js`; `logos.js` está en `src/logos.js`). Verificado: cero cambios en esos archivos.
- **Ollama (instruct 7–8B) y FFmpeg nunca en paralelo**: la cola los serializa.
- Todo lo tomado de `ContentBotMXL-2` y `ollama-core-engine` se **porta a Node, sin Python**, en módulos nuevos.
- Descartado (no portar): publicador automático (programador, publicador, chromium, redis-programador, routes/programador, publicador-ui, playwright-core, Chromium del Dockerfile), moviepy, psycopg2/Postgres, gemini_client, youtube_client/OAuth, scripts de música infantil, .mp4/PNG de prueba, autogit, gitops, apikeys/, server.py, Caddyfile, .zip, .patch.
- Entrega: **archivos completos** (sin `...`), comandos de una línea (`cat`/heredoc o `bash script`; **nunca `nano`**; pegar directo falla en su Chromebook/Crostini), pruebas con `node --test`, **una parte validada antes de la siguiente**, relevo actualizado al cierre.
- Patrón de entrega que funcionó: un `aplicar-parteN.sh` autocontenido (heredocs con delimitador entrecomillado), con copia de respaldo y repetible; verificarlo en un clon limpio de GitHub + partes previas, y probar las pruebas con **mutaciones** (romper algo a propósito y ver que fallan).

## 3. Parte 1 — HECHA y probada: `CLIPLAB_MODE=local`
- `src/config/index.js`: `config.modo` (`'local'|'completo'`), `modoLocal`, `modoPedido`, `modoValido`. Se normaliza (`local`, `LOCAL`, ` Local ` → local). Vacío/`completo`/`full`/`cloud`/`nube` → completo. Valor desconocido (p. ej. `locla`) → completo + aviso al arrancar (NO activa local).
- `src/routes/index.js`: en modo local **no se importa** `routes/programador.js` (import dinámico con top-level await; tampoco se evalúan programador, publicador, chromium, redis-programador ni playwright: probado con un hook de módulos). `/api/programador/*`, `/api/clips/:id/programar` y `/api/clips/:id/publicar-ahora` responden **404** con y sin llave (`error` menciona `CLIPLAB_MODE=local`). Nuevo `GET /api/modo` (público): `{modo, local, publicador}`; `GET /api` incluye `modo`. En modo completo todo sigue como antes (401 sin llave).
- `src/app.js`: exporta `htmlModoLocal(html)`; en modo local `/` y `/index.html` se sirven sin la pestaña ni la sección "Programar y Publicar" y con `<html data-modo="local">` (en el servidor: sin parpadeo; `panel.js` no monta el publicador porque falta `#panel-publicador-ui`). Una prueba avisa si cambia el HTML y las marcas dejan de existir.
- `src/server.js`: aviso de modo local / de valor desconocido; campo `modo` en el log de arranque.
- Se mantienen en modo local: `cookies-redes` y `sincronizarCookiesRedes` (solo reflejan tarjetas de conexión), `sesion/` (YouTube), `/api/panel/*`.
- **Pendiente de limpieza (Parte 7, con permiso del usuario)**: el `Dockerfile` aún instala Chromium (`playwright-core install`, `check-chromium.mjs`), `playwright-core` sigue en `package.json`, y los módulos del publicador siguen en el repo (solo no se cargan).

## 4. Parte 2 — HECHA y probada: canales, mercados, destinos, plan de renders
- `src/mercados.js` (puro): `MERCADOS` (`en-US` principal, `es-US` sub que deriva de en-US; campos `idioma, region, locale, whisperLang, rol, derivaDe`), `normalizarMercado(s)` (acepta `en-us`, `EN_US`; vacío/desconocido → `ErrorMercado` 400, sin valor por defecto), `CAPAS_POR_IDIOMA = [voz, subtitulos, titulo_pantalla, ficha]`, `esPrincipal`, `mercadoDe`.
- `src/canales.js` (puro, catálogo congelado): `CANALES` (stories/sports/news: `tono, trabajo{modo,estiloSubtitulos,ajustes}, ritmo, franja|ficha, estructuraLarga, rigor, nichos, destinos, mercados`), `DESTINOS` (facebook_reels audiencia 27+ y 2 ranuras; instagram_reels `espejoDe: facebook_reels` con el mismo `render: 'vertical_9x16'`; youtube_shorts embudo; youtube_long `render: 'largo_concat'`, `dependeDe: 'vertical_9x16'`, `variantesTitulo: 3`), `normalizarCanal`, `perfilDeCanal`, `destinosDeCanal`, `normalizarDestinos(valor, canal?)`, `trabajoDeCanal(canal, extras)` (campos que `/api/panel/encolar` YA acepta: `modo`, `estiloSubtitulos`, `ajustes`; devuelve copia editable; lo manual pisa al canal), `variablesDeEntorno(canal)`, `validarNichosReservados(destino, lista)`, `validarCatalogo()`.
- `src/plan-renders.js` (puro): `planDeRenders({canal, mercados, destinos, capasDeIdioma=true})`. Instagram/Shorts comparten el archivo de Facebook por mercado; `youtube_long` es concatenación (no render) y fuerza el render base aunque nadie más lo use. stories completo: **2 renders (no 8) + 2 concatenaciones**. Con `capasDeIdioma:false`, 1 render para ambos mercados.
- Valores de ritmo/franja/modo/estilo: **valores iniciales míos, editables** (sports beat 2.4 s / news 4.0 / stories 4.6; no son reglas de plataformas). Los nichos salen del texto del usuario.
- **Límite conocido**: el ritmo editorial (`BEAT_SECONDS`, `PUNCH_ZOOM`, `HOT_CUT_GAP`, `SEGMENT_MIN/MAX_SECONDS`) vive en `config` (env al arrancar), NO por trabajo; el pipeline solo acepta por trabajo `modo`, `estiloSubtitulos`, `ajustes`, `cantidad`, `instruccion`. Hoy se aplica arrancando una instancia con `variablesDeEntorno(canal)`. **Aprobado por el usuario:** variable `CLIPLAB_CANAL` leída en `config/index.js` (archivo permitido) que arranca cada instancia con el ritmo de su canal; se implementa al inicio de la Parte 4 (ver sección 9).
- **`es-US` NO comparte render con `en-US`** si el clip lleva voz, subtítulos, título en pantalla o ficha (van quemados). El ahorro real es 8→2.
- **Voz (TTS): DECIDIDA = Piper local (100 % offline)**; no se usan edge-tts ni gTTS (nube). Enganche listo: `MERCADOS[...].locale` (`en-US`/`es-US`) y `whisperLang`. Nada de Piper está verificado todavía (binario para la laptop, voces/modelos `.onnx` en inglés y español, consumo de CPU): verificarlo al empezar la Parte 5. Whisper (`transcribe.js`) solo transcribe, no sintetiza.

## 5. Archivos
**Partes 1–2 (nuevos):** `src/mercados.js`, `src/canales.js`, `src/plan-renders.js`; `tests/modo-local.test.js`, `tests/modo-completo.test.js`, `tests/mercados.test.js`, `tests/canales.test.js`, `tests/plan-renders.test.js`; `tests/fixtures/hook-cargas.mjs`, `registrar-hook.mjs`, `arrancar-app.mjs`; `ESTADO_CLIPLAB_PRO.md`, `.cliplab-handoff.json`.
**Parte 3 (nuevos):** `src/paquete-texto.js`, `src/routes/paquete.js`, `public/js/paquete.js`, `tests/paquete-texto.test.js`, `tests/paquete-rutas.test.js`, `aplicar-parte3.sh`.
**Modificados (Partes 1–3):** `src/config/index.js`, `src/app.js`, `src/server.js`, `src/routes/index.js` (P1 y P3), `package.json` (script `test` con los 7 archivos nuevos), `.env.example`; Parte 3 además: `public/js/api.js` (3 funciones nuevas al final), `public/js/flujo.js` y `public/js/views.js` (un botón "Publicar a mano" cada uno), `public/index.html` (un `<script>`), `public/css/styles.css` (bloque al final).
**Protegidos, sin tocar (verificado con sha256 en `aplicar-parte3.sh`):** `src/engine/pipeline.js`, `src/upload.js`, `src/engine/rotacion.js`, `rotacion-estado.js`, `rotacion-flujo.js`. Tampoco `Dockerfile`, `src/engine/marketing.js` (solo se importa `construirContextoClip`).

## 6. Estado exacto de `npm test`
`npm test` (≈ 240 s): **411 pruebas — 407 pasan, 4 se saltan, 0 fallan** (base original 336 = 332 + 4 saltan; Parte 1 +15; Parte 2 +29; Parte 3 +31: 15 en `paquete-texto.test.js` y 16 en `paquete-rutas.test.js`). Correr siempre `setsid nohup npm test > /tmp/t.log 2>&1 &` y consultar el log (un proceso en segundo plano normal se corta al terminar la llamada). Rápidas por parte: `node --test tests/modo-local.test.js tests/modo-completo.test.js` (15); `node --test tests/mercados.test.js tests/canales.test.js tests/plan-renders.test.js` (29); `node --test tests/paquete-texto.test.js tests/paquete-rutas.test.js` (31).

## 7. Arranque en otra PC
`unzip cliplab-backend-parte3.zip && cd cliplab-backend && npm ci && npm test` (el zip excluye `node_modules/` y `.git/`; hay `package-lock.json`). Para commitear: `git init` o clonar el repo y copiar encima. FFmpeg y ffprobe deben estar en PATH (las pruebas que los usan se saltan si no están). `CLIPLAB_MODE=local node src/server.js`.

## 8. Parte 3 — HECHA y probada: paquete de texto y descarga manual
- `src/paquete-texto.js` (puro): `generarPaquete({clip, canal, mercado, destino})` → `{destino, mercado, canal, titulo, descripcion, hashtags, cta, texto, avisos}` (+ `variantes:[{etiqueta,titulo,gancho}]` solo en `youtube_long`: `DESTINOS.youtube_long.variantesTitulo` = 3, `directo`/`pregunta`/`estructura`; el sufijo de estructura sale de `CANALES[canal].estructuraLarga`: serie → "Full Series"/"Serie completa", lista → "Key Moments"/"Momentos clave"). `generarPaquetes({clip, canal, mercados?, destinos?})` → lista (por defecto 2 mercados × destinos del canal = 8; principal primero). También exporta `detectarIdioma`, `acortar`, `LIMITES`, `ErrorPaquete` (400, hereda de `ErrorCanal`).
  - `texto` = lo que se pega en el campo de descripción/caption (descripción + CTA + hashtags). Facebook/Instagram abren el caption con el título (no hay campo de título); Shorts y largo llevan el título aparte y la descripción no lo repite.
  - Reutiliza `construirContextoClip` (gancho, puntos clave, duración). **No inventa hechos** (solo aparecen texto y números del propio clip; lo prueba una prueba con cifras) y **no traduce**: si el texto del clip parece estar en otro idioma que el mercado, agrega un aviso en `avisos` (heurística de palabras comunes; devuelve `null` si hay poca evidencia). Un clip sin procesar (título = URL) nunca publica la URL: usa `marketing.titulo` o avisa que falta título.
  - Límites (valores de diseño míos, editables en `LIMITES`; no son reglas de las plataformas): título 100; descripción FB/IG 2000, Shorts 1000, largo 4000; hashtags FB 4, IG 8, Shorts 4, largo 5. Hashtags: del destino (`#reels`/`#shorts` primero), del canal por idioma y hasta 2 palabras del título (sin acentos, sin palabras vacías). CTA por canal e idioma (rotan con una semilla estable); Shorts siempre lleva el CTA de embudo ("More on the channel." / "Hay más en el canal.").
  - Limitación conocida: las palabras de tema de los hashtags son toscas (primeras palabras largas del título); el usuario los ajusta a mano.
- `src/routes/paquete.js` (montado en `src/routes/index.js` antes de `panelRoutes`; **cada ruta lleva su propio `requireMasterKey`**, probado con el router montado solo):
  - `GET /api/panel/canales` (solo lectura): `{canales:[{id,nombre,descripcion,estructuraLarga,destinos,mercados,plan}], destinos, mercados}`; `plan` = `planDeRenders({canal}).resumen` (stories: 2 renders + 2 concatenaciones).
  - `GET /api/panel/clips/:id/paquete?canal=&mercado=&destino=` → `{clipId, canal, paquetes:[...]}`. `canal` obligatorio (400 si falta o es inválido: nunca se adivina). `mercado`/`destino` opcionales, aceptan texto, lista con comas o parámetros repetidos; vacío = todos los del canal. 404 clip inexistente; 409 si el clip no está `listo`/`publicado`.
  - `GET /api/panel/clips/:id/descarga` → `res.download` (stream, sin cargar el archivo en RAM; admite `Range`; `Content-Disposition: attachment; filename="<titulo-en-ascii>.mp4"`, `Cache-Control: no-store`, `nosniff`). El archivo se saca de `clip.url` solo si es exactamente `/clips/<nombre>.mp4` con `^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$`, resuelto dentro de `config.clipsDir`; el id de la URL nunca arma rutas de disco. 404 si no hay video o fue podado. Probado contra `../`, `%2e%2e`, `\`, subrutas, dotfiles y rutas absolutas (nada de fuera de `clipsDir` sale).
  - Los errores 404/409 se responden directo (sin ensuciar el log); `ErrorCanal`/`ErrorMercado` (400) los respeta `errorHandler`.
- Panel (`public/js/`): `paquete.js` (nuevo) abre un `<dialog>` desde cualquier `[data-accion="paquete"][data-id]` (botón "Publicar a mano" en la tarjeta de Todos los clips y en la de Resumen, solo si el clip está listo/publicado). **El canal lo elige la persona cada vez** (sin valor por defecto); pestañas de mercado (en-US primero); una tarjeta por destino con avisos, título, variantes (largo) y botones **Copiar título / Copiar texto / Copiar todo** (`navigator.clipboard` con respaldo `execCommand('copy')`) y un botón **Descargar video**. La descarga usa `fetch` + blob porque un `<a>` no puede enviar la llave maestra (`api.js`: `obtenerCanales`, `obtenerPaquete`, `descargarVideo`). Todo el texto entra con `textContent` (sin HTML inyectado).
- Verificación hecha: pruebas Node (rutas, traversal, auth, archivos estáticos del panel e importaciones de `paquete.js` contra lo que exportan `api.js`/`ui.js`) y una **prueba de humo en jsdom fuera del repo** (abrir, elegir canal, copiar, cambiar de mercado, descargar con llave, aviso sin inyección HTML). **No se probó en un navegador real**: revisar a ojo el diálogo en el Chromebook (estilos en `styles.css`, bloque "Publicar a mano").
- Mutaciones probadas (13, todas detectadas salvo una equivalente): quitar filtro de URL, aceptar subruta, quitar la llave de cada ruta, CTA es-US en inglés, número inventado, sin `attachment`, gancho que no sale del contexto, canal por defecto, barras en el nombre de archivo, paquete de clip en proceso, no limpiar `<>`, respaldo de copiar. La equivalente: quitar la comprobación canal↔mercado (hoy todos los canales tienen ambos mercados).
- Pendiente para la Parte 5: hoy hay **un solo archivo por clip**, así que la descarga es la misma para en-US y es-US. Cuando existan renders por mercado, extender `archivoDeClip(clip, mercado)` (`src/routes/paquete.js`) con algo como `clip.archivos[mercado]` y pasar `?mercado=` desde `descargarVideo`.
- Nota: `/clips/<token>.mp4` sigue sirviéndose estático y público (comportamiento original, tokens aleatorios); la ruta nueva añade llave + `attachment`.

## 9. PARTE 4 — Cliente Ollama en Node, Modelfile de guionista y validador de ficha (SIGUIENTE)
Decisiones ya cerradas (sección 11): modelo **`qwen2.5:7b-instruct`**, **`keep_alive: 0`**, **`CLIPLAB_CANAL` aprobado**.
Base portada de `ollama-core-engine` (ya estudiado): `agent/llm.py` = POST `{OLLAMA_URL}/api/chat` con `{model, messages, stream:false, options:{temperature, num_ctx, num_predict}}`, errores en 3 casos (HTTP no-200, red/timeout, respuesta vacía) y `installed_models()` vía `/api/tags` quitando `:latest`. `config/Modelfile` actual = arquitecto de código (`qwen2.5-coder:7b`): **no sirve**, hay que reemplazarlo. `validators.py`/`engine.py` = bucle generar → validar → devolver problemas al modelo (reintentos acotados). `memory.py` = contexto por proyecto en disco.
Entregar (mismo patrón que la Parte 3: `aplicar-parte4.sh`, archivos completos, pruebas `node --test` registradas en `package.json`, mutaciones, suite completa, relevo actualizado):
0. **`CLIPLAB_CANAL` en `src/config/index.js`** (primero, es corto): si vale `stories|sports|news` (normalizar con `normalizarCanal`; valor desconocido → aviso al arrancar, nunca adivinar), la instancia toma `CANALES[canal].ritmo` como valores por defecto de `BEAT_SECONDS`, `PUNCH_ZOOM`, `HOT_CUT_GAP`, `SEGMENT_MIN_SECONDS`, `SEGMENT_MAX_SECONDS`. **Precedencia: variable de entorno explícita > ritmo del canal > valor por defecto de siempre.** Sin `CLIPLAB_CANAL` nada cambia. `config` está congelado y se lee al importar: probar con `await import('../src/config/index.js?variante=N')`. Ojo con ciclos: `canales.js` solo importa `mercados.js`, así que `config` puede importar `canales.js`. Exponer `config.canal` (o `null`) y mostrarlo en `/api/modo` y en el log de arranque (`server.js`). Documentar en `.env.example`.
1. Variables en `src/config/index.js`: `OLLAMA_URL` (por defecto `http://127.0.0.1:11434`), `OLLAMA_MODEL` (**por defecto `qwen2.5:7b-instruct`**), `OLLAMA_NUM_CTX` (moderado, ~8192, por la RAM), `OLLAMA_NUM_PREDICT`, `OLLAMA_TIMEOUT_MS`.
2. `src/ollama.js`: `chat(mensajes, {temperature, model, fetchImpl})` con `fetch` + `AbortSignal.timeout`, clase `ErrorOllama`, `modelosInstalados()`, y **`keep_alive: 0` en cada petición** (es un campo de la petición a `/api/chat`, no un `PARAMETER` del Modelfile) para descargar el modelo de RAM al terminar y que FFmpeg arranque con la memoria libre. Inyectar `fetchImpl` para probar **sin Ollama real**. Probar que el cuerpo enviado lleva `keep_alive: 0`.
3. **Exclusión mutua Ollama↔FFmpeg**: leer `src/engine/cola.js` (67 líneas, NO protegido; exporta `agregarTrabajo, trabajosPendientes, cargaActual, detenerCola` y llama a `procesarClip`) y crear un candado compartido (p. ej. `src/engine/exclusion.js`) que envuelva tanto la llamada a Ollama como `procesarClip` **sin editar `pipeline.js`**. Verificar con pruebas que nunca se solapan.
4. `config/Modelfile.guionista` nuevo: `FROM qwen2.5:7b-instruct`, `PARAMETER` bajos de temperatura, `num_ctx` moderado, `num_thread 4` como el original; SYSTEM de guionista: respeta `CANALES[canal].tono`, **no inventa hechos**, salida solo JSON. Verificar al escribirlo que `qwen2.5:7b-instruct` es el nombre correcto en la biblioteca de Ollama del usuario (`ollama list`); no hay Ollama en este entorno.
5. `src/validador-ficha.js` (puro, estricto): la **ficha** que carga el usuario es la única fuente de hechos (`{ titulo, canal, mercado, hechos:[{tipo: fecha|lugar|cifra|persona|dato, valor}], fuente? }`); la salida del modelo `{ partes:[{ n, narracion, tecnico:[{ escena, textoPantalla, efecto?, duracionSeg }] }] }` se rechaza si: aparecen años/cifras/lugares/nombres propios que no están en la ficha; hay diálogos de actores o citas atribuidas; `Parte N` no es consecutiva; el idioma no corresponde al `mercado` (puede reutilizar `detectarIdioma` de `src/paquete-texto.js`); excede el ritmo del canal. Devuelve `{ok, problemas[], avisos[]}` y se usa en un bucle con máx. 2 reintentos devolviendo los problemas al modelo. News: `rigor` = lugar y fecha obligatorios.
6. Cola de guiones portada de `ContentBotMXL-2` (`data/guiones/pendientes` → `procesados`, ver `config.dataDir`) y memoria mínima por proyecto en disco; ambas opcionales si no caben.
7. Pruebas con Ollama simulado (respuestas buenas, vacías, con hechos inventados, JSON roto), script `aplicar-parte4.sh`, verificación en limpio y suite completa.

## 10. Partes 5–7 (resumen)
5. `stories`: series `Parte N`, ficha/expediente en pantalla (foto, año, lugar, datos clave; `CANALES.stories.ficha`), **voz en off con Piper local** (verificar binario y voces en/es primero; `MERCADOS[].locale`), banco de efectos/imágenes en carpeta (patrón `assets/efectos_sonido`, `assets/musica`, selección aleatoria por categoría de `ContentBotMXL-2/core/asset_manager.py`), concatenación ordenada al video largo **en 9:16 heredado** (sin render 16:9 extra), y renders por mercado (ver pendiente de la sección 8).
6. `sports` y `news`: franjas/degradados que tapan logos (`CANALES.*.franja`) y títulos con gancho.
7. Relevo final + **limpieza aprobada por el usuario para el cierre final** (Dockerfile sin Chromium, quitar `playwright-core`, retirar módulos del publicador). Hacerla solo al cierre y con las pruebas verdes antes y después.

## 11. Decisiones cerradas con el usuario (no volver a preguntar)
1. **Voz (TTS): Piper local, 100 % offline.** 2. **`youtube_long`: se mantiene 9:16 heredado**, sin render 16:9 extra. 3. **`CLIPLAB_CANAL`: aprobado** (se implementa en la Parte 4, paso 0). 4. **Modelo Ollama: `qwen2.5:7b-instruct` con `keep_alive: 0`.** 5. **Limpieza de la Parte 7: aprobada para el cierre final.**
Sin decisiones abiertas por ahora.

## 12. Notas de entorno que ahorran tiempo
- `web_fetch` a GitHub está bloqueado (robots); **`git clone https://github.com/mxldigitalservices-oss/<repo>.git` desde bash sí funciona** (repos públicos).
- Tests de config con otra env: `await import('../src/config/index.js?variante=N')` (módulo nuevo por consulta); cada archivo de prueba corre en su propio proceso, así que fijar `process.env` antes de los imports.
- Para probar "qué módulos se cargan": `tests/fixtures/registrar-hook.mjs` + `CARGAS_LOG`.
- Preferencias del usuario: archivos completos, heredoc, sin nano; mensajes breves y directos; no preguntar de más (máx. 1 pregunta por respuesta).
- Entrega de la Parte 3: `aplicar-parte3.sh` (autocontenido, repetible; comprueba sha256 de los archivos que reemplaza y de los protegidos, respalda en `.respaldo-parte3/`, corre las pruebas de la parte; con `--completo` corre `npm test`). El script ya se probó en un clon limpio de las Partes 1–2.
- `npm ci` es obligatorio antes de probar en un entorno nuevo (el zip no trae `node_modules/`); sin él, las pruebas de rutas fallan con `Cannot find package 'express'`.
- Prueba de humo del panel sin navegador: `jsdom` instalado solo en `/tmp` (no es dependencia del proyecto); `dialog.showModal`, `navigator.clipboard` y `URL.createObjectURL` hay que simularlos.
CLIPLAB_EOF_PARTE3

escribir ".cliplab-handoff.json" <<'CLIPLAB_EOF_PARTE3'
{
  "proyecto": "ClipLab Pro (cliplab-backend) - modo local",
  "generado": "2026-11-21",
  "leer_primero": "ESTADO_CLIPLAB_PRO.md (detalle completo). Este JSON es el resumen legible por maquina.",
  "idioma_usuario": "espanol informal, voz a texto",
  "repo": {
    "remoto": "https://github.com/mxldigitalservices-oss/cliplab-backend.git",
    "commit_base": "d64f983",
    "cambios_sin_commitear": true,
    "node": ">=20 (probado en 22)"
  },
  "objetivo": "Estacion local de produccion de video (CLIPLAB_MODE=local), 16 GB RAM / Intel UHD 620, respaldo CPU libx264. Sin publicador automatico: descarga y copia manual.",
  "partes": {
    "1": {
      "estado": "hecha_y_probada",
      "titulo": "Interruptor CLIPLAB_MODE=local",
      "resumen": "config.modo/modoLocal/modoPedido/modoValido; en modo local no se importa routes/programador.js (import dinamico), /api/programador/*, /api/clips/:id/programar y /publicar-ahora dan 404 (con y sin llave); GET /api/modo publico; panel servido sin pestana/seccion Programar y Publicar y con data-modo=local (htmlModoLocal en app.js); aviso de valor desconocido al arrancar.",
      "pruebas_nuevas": 15
    },
    "2": {
      "estado": "hecha_y_probada",
      "titulo": "Canales, destinos, mercados y plan de renders",
      "resumen": "src/mercados.js (en-US principal, es-US sub), src/canales.js (stories/sports/news + 4 destinos + trabajoDeCanal + variablesDeEntorno + validarNichosReservados + validarCatalogo), src/plan-renders.js (stories completo: 2 renders en vez de 8 + 2 concatenaciones).",
      "pruebas_nuevas": 29,
      "limites": [
        "El ritmo editorial vive en config (env al arrancar), no por trabajo: se aplica con CLIPLAB_CANAL (aprobado, se implementa en la Parte 4, paso 0; precedencia env explicita > ritmo del canal > defecto).",
        "es-US necesita su propio render si hay voz/subtitulos/titulo/ficha quemados (ahorro real 8->2).",
        "Voz (TTS) DECIDIDA: Piper local offline (aun sin verificar binario ni voces en/es; verificar al empezar la Parte 5)."
      ]
    },
    "3": {
      "estado": "hecha_y_probada",
      "titulo": "Paquete de texto y descarga manual",
      "resumen": "src/paquete-texto.js (puro; en-US y es-US por destino; reutiliza construirContextoClip; no inventa hechos ni traduce, avisa si el idioma del clip no coincide); src/routes/paquete.js con GET /api/panel/canales, /api/panel/clips/:id/paquete?canal=&mercado=&destino= (canal obligatorio) y /api/panel/clips/:id/descarga (res.download, attachment, anti-traversal); panel: public/js/paquete.js (dialogo Publicar a mano con Copiar y Descargar) + botones en flujo.js y views.js.",
      "pruebas_nuevas": 31,
      "verificacion": [
        "npm test completo",
        "clon limpio + Partes 1-2 aplicando aplicar-parte3.sh (dos veces: repetible)",
        "13 mutaciones (12 detectadas, 1 equivalente)",
        "prueba de humo del panel en jsdom fuera del repo",
        "sha256 de archivos protegidos sin cambios"
      ],
      "limites": [
        "No probado en un navegador real: revisar el dialogo a ojo en el Chromebook.",
        "Un solo archivo por clip: la descarga es la misma para en-US y es-US hasta la Parte 5 (renders por mercado).",
        "Limites de largo y hashtags son valores de diseno editables en LIMITES, no reglas de las plataformas.",
        "Deteccion de idioma heuristica; hashtags de tema toscos."
      ]
    },
    "4": {
      "estado": "pendiente_siguiente",
      "titulo": "CLIPLAB_CANAL, cliente Ollama en Node (qwen2.5:7b-instruct, keep_alive 0), exclusion Ollama<->FFmpeg, Modelfile guionista y validador de ficha"
    },
    "5": {
      "estado": "pendiente",
      "titulo": "stories: series Parte N, ficha, voz en off con Piper local, banco de efectos, renders por mercado y concatenacion al largo 9:16 heredado"
    },
    "6": {
      "estado": "pendiente",
      "titulo": "sports y news: franjas/degradados y titulos con gancho"
    },
    "7": {
      "estado": "pendiente",
      "titulo": "Relevo final y limpieza APROBADA para el cierre final (Dockerfile sin Chromium, quitar playwright-core, retirar modulos del publicador)"
    }
  },
  "decisiones_cerradas": {
    "tts": "Piper local (100% offline); sin edge-tts ni gTTS",
    "youtube_long": "se mantiene 9:16 heredado (sin render 16:9 extra)",
    "CLIPLAB_CANAL": "aprobado para aplicar el ritmo del canal por instancia en config/index.js (Parte 4, paso 0)",
    "modelo_ollama": "qwen2.5:7b-instruct con keep_alive: 0 (liberar RAM al terminar)",
    "limpieza_parte7": "aprobada para el cierre final"
  },
  "decisiones_abiertas": [],
  "archivos_creados": [
    {
      "ruta": "src/mercados.js",
      "lineas": 83
    },
    {
      "ruta": "src/canales.js",
      "lineas": 251
    },
    {
      "ruta": "src/plan-renders.js",
      "lineas": 59
    },
    {
      "ruta": "src/paquete-texto.js",
      "lineas": 268
    },
    {
      "ruta": "src/routes/paquete.js",
      "lineas": 128
    },
    {
      "ruta": "public/js/paquete.js",
      "lineas": 163
    },
    {
      "ruta": "tests/modo-local.test.js",
      "lineas": 125
    },
    {
      "ruta": "tests/modo-completo.test.js",
      "lineas": 99
    },
    {
      "ruta": "tests/mercados.test.js",
      "lineas": 62
    },
    {
      "ruta": "tests/canales.test.js",
      "lineas": 161
    },
    {
      "ruta": "tests/plan-renders.test.js",
      "lineas": 75
    },
    {
      "ruta": "tests/paquete-texto.test.js",
      "lineas": 204
    },
    {
      "ruta": "tests/paquete-rutas.test.js",
      "lineas": 249
    },
    {
      "ruta": "tests/fixtures/hook-cargas.mjs",
      "lineas": 14
    },
    {
      "ruta": "tests/fixtures/registrar-hook.mjs",
      "lineas": 4
    },
    {
      "ruta": "tests/fixtures/arrancar-app.mjs",
      "lineas": 9
    },
    {
      "ruta": "aplicar-parte3.sh"
    },
    {
      "ruta": "ESTADO_CLIPLAB_PRO.md",
      "lineas": 94
    },
    {
      "ruta": ".cliplab-handoff.json"
    }
  ],
  "archivos_modificados": [
    "src/config/index.js",
    "src/app.js",
    "src/server.js",
    "src/routes/index.js",
    "package.json",
    ".env.example",
    "public/js/api.js",
    "public/js/flujo.js",
    "public/js/views.js",
    "public/index.html",
    "public/css/styles.css"
  ],
  "archivos_protegidos_sin_tocar": [
    "src/engine/pipeline.js",
    "src/upload.js",
    "src/engine/rotacion.js",
    "src/engine/rotacion-estado.js",
    "src/engine/rotacion-flujo.js"
  ],
  "tambien_sin_tocar": [
    "Dockerfile",
    "src/engine/marketing.js (solo se importa construirContextoClip)",
    "src/engine/programador.js",
    "src/engine/publicador.js"
  ],
  "npm_test": {
    "comando": "npm test",
    "duracion_aprox_s": 240,
    "total": 411,
    "pasan": 407,
    "saltan": 4,
    "fallan": 0,
    "desglose": "base 336 (332 pasan + 4 saltan) + Parte 1: 15 + Parte 2: 29 + Parte 3: 31 (15 paquete-texto + 16 paquete-rutas)",
    "nota": "ejecutar desacoplado: setsid nohup npm test > /tmp/t.log 2>&1 &  (y npm ci antes en un entorno nuevo)"
  },
  "reglas_usuario": [
    "No tocar pipeline.js, upload.js ni rotacion*.js",
    "Ollama y FFmpeg nunca en paralelo (la cola los serializa)",
    "Portar a Node sin Python lo tomado de ContentBotMXL-2 y ollama-core-engine",
    "Archivos completos sin '...'; comandos de una linea (cat/heredoc o bash script); nunca nano",
    "Una parte validada antes de la siguiente; pruebas con node --test; relevo al cierre",
    "Descartado: publicador automatico y sus piezas, moviepy, psycopg2, gemini_client, youtube_client/OAuth, musica infantil, mp4/PNG de prueba, autogit, gitops, apikeys, server.py, Caddyfile, .zip, .patch"
  ],
  "siguiente_instancia": {
    "arrancar": "unzip cliplab-backend-parte3.zip && cd cliplab-backend && npm ci && npm test  (esperar 411/407/4/0). Leer solo ESTADO_CLIPLAB_PRO.md y este JSON. Empezar por la Parte 4 (paso 0: CLIPLAB_CANAL). Decisiones cerradas: no volver a preguntarlas.",
    "patron_de_entrega": "aplicar-parteN.sh autocontenido (heredocs entrecomillados, archivos completos, sha256 previo, respaldo, repetible), pruebas node --test registradas en package.json, mutaciones, suite completa, ESTADO y handoff actualizados",
    "parte4": {
      "entregar": [
        "Paso 0 - config/index.js: CLIPLAB_CANAL (stories|sports|news) aplica CANALES[canal].ritmo a BEAT_SECONDS, PUNCH_ZOOM, HOT_CUT_GAP, SEGMENT_MIN_SECONDS, SEGMENT_MAX_SECONDS; precedencia env explicita > canal > defecto; valor desconocido = aviso y sin efecto; config.canal visible en /api/modo y en el log; documentar en .env.example",
        "config/index.js: OLLAMA_URL (http://127.0.0.1:11434), OLLAMA_MODEL (qwen2.5:7b-instruct), OLLAMA_NUM_CTX (~8192), OLLAMA_NUM_PREDICT, OLLAMA_TIMEOUT_MS",
        "src/ollama.js: chat() con fetch + AbortSignal.timeout, ErrorOllama, modelosInstalados() via /api/tags sin :latest, keep_alive: 0 en cada peticion, fetchImpl inyectable",
        "Candado compartido Ollama<->FFmpeg (p. ej. src/engine/exclusion.js) integrado con src/engine/cola.js (no protegido) sin editar pipeline.js; probar que nunca se solapan",
        "config/Modelfile.guionista (FROM qwen2.5:7b-instruct, temperatura baja, num_ctx moderado, num_thread 4, SYSTEM de guionista solo JSON sin inventar hechos)",
        "src/validador-ficha.js: la ficha del usuario es la unica fuente de hechos; rechaza dialogos/citas, Parte N no consecutiva, idioma distinto al mercado (puede usar detectarIdioma de paquete-texto.js), exceso de ritmo; bucle max 2 reintentos; news exige lugar y fecha",
        "Opcional: cola de guiones pendientes->procesados en config.dataDir y memoria minima por proyecto",
        "Pruebas con Ollama simulado, aplicar-parte4.sh, verificacion en limpio, mutaciones, suite completa"
      ]
    }
  }
}
CLIPLAB_EOF_PARTE3

# --- verificacion posterior ---
[ "$(sha "src/paquete-texto.js")" = "c122f7f92877d31d0116fe7d144da3bf4dbbb1f83dc7fa813bca934738ed48b5" ] || fallar "src/paquete-texto.js no quedo igual que en la Parte 3"
[ "$(sha "src/routes/paquete.js")" = "50e8994a6b9bf7b15f4e721fbf2038d8861b4f660887012b029ba0865afa9f11" ] || fallar "src/routes/paquete.js no quedo igual que en la Parte 3"
[ "$(sha "public/js/paquete.js")" = "e3bc5abeeca60dc1959b7806600754008d42b0cf8b360e236e10a9432428b772" ] || fallar "public/js/paquete.js no quedo igual que en la Parte 3"
[ "$(sha "tests/paquete-texto.test.js")" = "f0dec880b57bfab5747236c6c2c7e593a00266c0e3731eeedddc89b0d4625db4" ] || fallar "tests/paquete-texto.test.js no quedo igual que en la Parte 3"
[ "$(sha "tests/paquete-rutas.test.js")" = "38db8fccdd7b8cfc624d6af8dfff1c3d43fbfe38e61e2ebf17f06430711fa287" ] || fallar "tests/paquete-rutas.test.js no quedo igual que en la Parte 3"
[ "$(sha "src/routes/index.js")" = "1f151579560d0467c9367b26d364ccff2b0267f3d62cfee1cdf5d6e68a177c63" ] || fallar "src/routes/index.js no quedo igual que en la Parte 3"
[ "$(sha "package.json")" = "b7e90b718080a0eff06cad7a65d768c02a481e4d9ef11b33a82419767a86e754" ] || fallar "package.json no quedo igual que en la Parte 3"
[ "$(sha "public/js/api.js")" = "1cc881b984275664487827bc712c0bfd135b37f75647868220949dcfe9abbf72" ] || fallar "public/js/api.js no quedo igual que en la Parte 3"
[ "$(sha "public/js/flujo.js")" = "efe5a01090e9ae45cc3c4ff15a74fe39e7165afffccd17dee0e27d04925effb3" ] || fallar "public/js/flujo.js no quedo igual que en la Parte 3"
[ "$(sha "public/js/views.js")" = "d3c65bbb62c122f4bdd1f1310f62bd9fa721c87fb7b217d667bdfa58b476f190" ] || fallar "public/js/views.js no quedo igual que en la Parte 3"
[ "$(sha "public/index.html")" = "ff839546ebaaee4f67644e687de4be78441df1fe206a50944cae8b5110a95a72" ] || fallar "public/index.html no quedo igual que en la Parte 3"
[ "$(sha "public/css/styles.css")" = "aa2adad9a438889b7a7fda49fd564b50b463642638940cd787b065587fdd140e" ] || fallar "public/css/styles.css no quedo igual que en la Parte 3"
DESPUES_PROTEGIDOS="$(for f in $PROTEGIDOS; do echo "$f $(sha "$f")"; done)"
[ "$ANTES_PROTEGIDOS" = "$DESPUES_PROTEGIDOS" ] || fallar "un archivo protegido cambio (pipeline.js, upload.js o rotacion*.js): no deberia pasar"
echo "Archivos protegidos intactos: pipeline.js, upload.js, rotacion*.js"

[ -d node_modules ] || { echo "Instalando dependencias (npm ci)..."; npm ci --no-audit --no-fund; }
echo "Pruebas de la Parte 3..."
node --test tests/paquete-texto.test.js tests/paquete-rutas.test.js
if [ "$COMPLETO" = 1 ]; then
  echo "Suite completa (npm test, ~4 min)..."
  npm test
fi

echo
echo "Parte 3 aplicada. Arranca con: CLIPLAB_MODE=local node src/server.js"
echo "En el panel: Todos los clips -> Publicar a mano (elige el canal, copia los textos y descarga el video)."
echo "Siguiente: Parte 4 (lee ESTADO_CLIPLAB_PRO.md, seccion 9)."

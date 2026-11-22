// ---------------------------------------------------------------------------
// Canales (stories | sports | news) y destinos de publicacion MANUAL de ClipLab Pro en modo local.
// Modulo puro: sin disco, sin red y sin config. Los datos estan congelados; las funciones devuelven copias editables.
//
// Cada canal declara:
//   trabajo  -> campos que /api/panel/encolar y el pipeline YA aceptan por trabajo: modo, estiloSubtitulos y ajustes.
//   ritmo    -> valores del ritmo editorial. OJO: viven en config (variables de entorno), no por trabajo; hoy se aplican
//               arrancando una instancia con variablesDeEntorno(canal). Aplicarlos por trabajo exigiria tocar pipeline.js.
//   franja   -> franja/degradado que tapa logos ajenos y lleva el titulo gancho (sports y news; se dibuja en la Parte 6).
//   ficha    -> expediente en pantalla (stories; se dibuja en la Parte 5).
//   tono, nichos, destinos, mercados.
// Los numeros de ritmo y franja son valores iniciales de diseno, pensados para ajustarse; no son reglas de las plataformas.
// ---------------------------------------------------------------------------
import { IDS_MERCADOS } from './mercados.js';

function congelar(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(congelar);
    Object.freeze(obj);
  }
  return obj;
}

const copiar = (obj) => (obj === undefined ? obj : JSON.parse(JSON.stringify(obj)));

export class ErrorCanal extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorCanal';
    this.status = 400;   // el manejador de errores de Express ya respeta e.status
  }
}

/** Destinos de publicacion manual. `render` es la clave del archivo: destinos con la misma clave comparten UN solo render. */
export const DESTINOS = congelar({
  facebook_reels: {
    id: 'facebook_reels',
    nombre: 'Facebook Reels',
    red: 'facebook',
    tipo: 'corto',
    formato: '9:16',
    render: 'vertical_9x16',
    espejoDe: null,
    dependeDe: null,
    audiencia: { edadMinima: 27, perfil: 'adultos consolidados' },
    ranurasReservadas: 2,
  },
  instagram_reels: {
    id: 'instagram_reels',
    nombre: 'Instagram Reels',
    red: 'instagram',
    tipo: 'corto',
    formato: '9:16',
    render: 'vertical_9x16',
    espejoDe: 'facebook_reels',
    dependeDe: null,
    audiencia: null,
    ranurasReservadas: 0,
  },
  youtube_shorts: {
    id: 'youtube_shorts',
    nombre: 'YouTube Shorts',
    red: null,
    tipo: 'corto',
    formato: '9:16',
    render: 'vertical_9x16',
    espejoDe: null,
    dependeDe: null,
    audiencia: null,
    ranurasReservadas: 0,
    funcion: 'embudo',
  },
  youtube_long: {
    id: 'youtube_long',
    nombre: 'YouTube largo',
    red: null,
    tipo: 'largo',
    formato: 'heredado',
    render: 'largo_concat',
    espejoDe: null,
    dependeDe: 'vertical_9x16',
    audiencia: null,
    ranurasReservadas: 0,
    variantesTitulo: 3,
  },
});

export const IDS_DESTINOS = Object.freeze(Object.keys(DESTINOS));
const TODOS_LOS_DESTINOS = ['facebook_reels', 'instagram_reels', 'youtube_shorts', 'youtube_long'];

export const CANALES = congelar({
  stories: {
    id: 'stories',
    nombre: 'Historias',
    descripcion: 'Historias cortas serializadas (Parte 1, Parte 2...), mini-documentales biograficos y casos reales, con ficha en pantalla y voz en off.',
    tono: {
      id: 'documental-narrativo',
      descripcion: 'Voz en off sin dialogos de actores; hechos reales con un giro que sostenga la retencion y abra un debate sano.',
      evitar: ['inventar hechos', 'dialogos ficticios', 'sensacionalismo gratuito'],
    },
    trabajo: { modo: 'blur', estiloSubtitulos: 'clasico', ajustes: { color: 'calido' } },
    ritmo: { beatSeconds: 4.6, punchZoom: 1.06, hotCutGap: 0.6, segmentMinSeconds: 45, segmentMaxSeconds: 75 },
    franja: null,
    ficha: { campos: ['foto', 'anio', 'lugar', 'datosClave'], segundos: 4, posicion: 'inferior' },
    estructuraLarga: 'serie',
    rigor: null,
    nichos: { prioritarios: ['trayectorias deportivas y personales', 'casos reales', 'sucesos'] },
    destinos: TODOS_LOS_DESTINOS,
    mercados: IDS_MERCADOS,
  },
  sports: {
    id: 'sports',
    nombre: 'Deportes',
    descripcion: 'Clips e historias deportivas con ritmo dinamico, material real coherente y titulos con gancho que invitan al debate sano.',
    tono: {
      id: 'dinamico-debate',
      descripcion: 'Energico y directo; un gancho que invite a opinar sin faltar al respeto.',
      evitar: ['insultos', 'inventar resultados o estadisticas'],
    },
    trabajo: { modo: 'recorte', estiloSubtitulos: 'dinamico', ajustes: { color: 'vivido' } },
    ritmo: { beatSeconds: 2.4, punchZoom: 1.18, hotCutGap: 0.35, segmentMinSeconds: 20, segmentMaxSeconds: 45 },
    franja: { tapaLogos: true, posiciones: ['superior', 'inferior'], altoPct: 0.12, color: '#0B0B0F', opacidadMax: 0.9, degradado: true, titulo: true },
    ficha: null,
    estructuraLarga: 'lista',
    rigor: null,
    nichos: { prioritarios: ['clips deportivos', 'historias deportivas', 'debate deportivo'] },
    destinos: TODOS_LOS_DESTINOS,
    mercados: IDS_MERCADOS,
  },
  news: {
    id: 'news',
    nombre: 'Noticias',
    descripcion: 'Noticias y contexto real con rigor tematico y geografico, tono serio y recto, y titulos que inviten a comentar.',
    tono: {
      id: 'serio-recto',
      descripcion: 'Serio y recto, sin adornos; hechos verificables con lugar y fecha, y un titulo que invite a comentar.',
      evitar: ['rumores', 'opinion presentada como hecho', 'mezclar lugares o fechas'],
    },
    trabajo: { modo: 'blur', estiloSubtitulos: 'clasico', ajustes: null },
    ritmo: { beatSeconds: 4.0, punchZoom: 1.04, hotCutGap: 0.5, segmentMinSeconds: 30, segmentMaxSeconds: 60 },
    franja: { tapaLogos: true, posiciones: ['inferior'], altoPct: 0.1, color: '#0A1A33', opacidadMax: 0.92, degradado: true, titulo: true },
    ficha: null,
    estructuraLarga: 'lista',
    rigor: { tematico: true, geografico: true },
    nichos: { prioritarios: ['noticias', 'contexto de actualidad'] },
    destinos: TODOS_LOS_DESTINOS,
    mercados: IDS_MERCADOS,
  },
});

export const IDS_CANALES = Object.freeze(Object.keys(CANALES));

/** Valida el canal que llega del cliente. Sin valor por defecto: el sistema nunca adivina de que canal es un video. */
export function normalizarCanal(valor) {
  const id = String(valor ?? '').trim().toLowerCase();
  if (!id) throw new ErrorCanal('Elige el canal: ' + IDS_CANALES.join(', ') + '.');
  if (!Object.hasOwn(CANALES, id)) throw new ErrorCanal('Canal no valido: ' + id.slice(0, 20) + '. Usa: ' + IDS_CANALES.join(', ') + '.');
  return id;
}

export const perfilDeCanal = (valor) => CANALES[normalizarCanal(valor)];

export const destinosDeCanal = (valor) => perfilDeCanal(valor).destinos.map((id) => DESTINOS[id]);

/**
 * Acepta arreglo o texto ("facebook_reels, youtube_shorts"). Devuelve ids sin duplicados y en el orden del catalogo.
 * Si se indica el canal, solo admite los destinos de ese canal.
 */
export function normalizarDestinos(valor, canal = null, { requerido = true } = {}) {
  let lista;
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === 'string') lista = valor.split(/[,\s;|]+/);
  else lista = [];
  const ids = [...new Set(lista.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean))];
  const permitidos = canal ? perfilDeCanal(canal).destinos : IDS_DESTINOS;
  const malos = ids.filter((id) => !Object.hasOwn(DESTINOS, id) || !permitidos.includes(id));
  if (malos.length) {
    const quien = canal ? ' para el canal ' + normalizarCanal(canal) : '';
    throw new ErrorCanal('Destino no valido' + quien + ': ' + malos.map((m) => m.slice(0, 24)).join(', ') + '. Usa: ' + permitidos.join(', ') + '.');
  }
  if (!ids.length && requerido) throw new ErrorCanal('Elige al menos un destino: ' + permitidos.join(', ') + '.');
  return IDS_DESTINOS.filter((id) => ids.includes(id));
}

/**
 * Campos que se mezclan en el cuerpo de /api/panel/encolar para ese canal: { canal, modo, estiloSubtitulos, ajustes? }.
 * `extras` pisa lo del canal (lo que el usuario elige a mano gana). Devuelve una copia editable.
 */
export function trabajoDeCanal(valor, extras = {}) {
  const perfil = perfilDeCanal(valor);
  const base = { canal: perfil.id, modo: perfil.trabajo.modo, estiloSubtitulos: perfil.trabajo.estiloSubtitulos };
  if (perfil.trabajo.ajustes) base.ajustes = copiar(perfil.trabajo.ajustes);
  return { ...base, ...(extras && typeof extras === 'object' ? extras : {}) };
}

const ENTORNO = Object.freeze({
  beatSeconds: 'BEAT_SECONDS',
  punchZoom: 'PUNCH_ZOOM',
  hotCutGap: 'HOT_CUT_GAP',
  segmentMinSeconds: 'SEGMENT_MIN_SECONDS',
  segmentMaxSeconds: 'SEGMENT_MAX_SECONDS',
});

/** Variables de entorno (todas texto) que dejan a una instancia con el ritmo de ese canal. */
export function variablesDeEntorno(valor) {
  const { ritmo } = perfilDeCanal(valor);
  return Object.fromEntries(Object.entries(ENTORNO).map(([campo, variable]) => [variable, String(ritmo[campo])]));
}

/**
 * Nichos reservados que el usuario asigna a un destino (las "ranuras"). Limpia, quita duplicados y comprueba el cupo.
 * Solo facebook_reels tiene ranuras por ahora.
 */
export function validarNichosReservados(destino, lista) {
  const id = String(destino ?? '').trim().toLowerCase();
  if (!Object.hasOwn(DESTINOS, id)) throw new ErrorCanal('Destino no valido: ' + id.slice(0, 24) + '.');
  const entrada = Array.isArray(lista) ? lista : [];
  const limpios = [...new Set(entrada.map((n) => String(n ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60)).filter(Boolean))];
  const cupo = DESTINOS[id].ranurasReservadas;
  if (limpios.length > cupo) {
    throw new ErrorCanal(DESTINOS[id].nombre + ' tiene ' + cupo + ' ranura(s) reservada(s) y pediste ' + limpios.length + '.');
  }
  return limpios;
}

/** Revisa que el catalogo sea coherente. Devuelve la lista de problemas (vacia = todo bien). La usan las pruebas. */
export function validarCatalogo() {
  const problemas = [];
  for (const [id, d] of Object.entries(DESTINOS)) {
    if (d.id !== id) problemas.push('destino ' + id + ': el id no coincide con su clave');
    if (d.espejoDe) {
      const origen = DESTINOS[d.espejoDe];
      if (!origen) problemas.push('destino ' + id + ': espejoDe apunta a ' + d.espejoDe + ', que no existe');
      else if (origen.render !== d.render) problemas.push('destino ' + id + ': un espejo debe usar el mismo render que ' + d.espejoDe);
    }
    if (d.dependeDe && !Object.values(DESTINOS).some((o) => o.render === d.dependeDe)) {
      problemas.push('destino ' + id + ': dependeDe ' + d.dependeDe + ' no lo produce ningun destino');
    }
  }
  for (const [id, c] of Object.entries(CANALES)) {
    if (c.id !== id) problemas.push('canal ' + id + ': el id no coincide con su clave');
    if (!c.destinos.length) problemas.push('canal ' + id + ': sin destinos');
    for (const d of c.destinos) if (!Object.hasOwn(DESTINOS, d)) problemas.push('canal ' + id + ': destino desconocido ' + d);
    for (const m of c.mercados) if (!IDS_MERCADOS.includes(m)) problemas.push('canal ' + id + ': mercado desconocido ' + m);
    if (!c.mercados.length) problemas.push('canal ' + id + ': sin mercados');
    if (!c.franja && !c.ficha) problemas.push('canal ' + id + ': necesita franja o ficha');
    if (c.franja && c.ficha) problemas.push('canal ' + id + ': franja y ficha a la vez no estan previstas');
    if (!c.nichos.prioritarios.length) problemas.push('canal ' + id + ': sin nichos prioritarios');
  }
  return problemas;
}

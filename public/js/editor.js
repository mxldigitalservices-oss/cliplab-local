// Mini Editor (Parte 7A). Boton "Editor" de la barra superior -> dialogo con un lienzo <canvas> (sin librerias) para ubicar sobre un fotograma:
//   difuminados (rectangulos que tapan logos ajenos), capas PNG (marca de agua, logo propio) y una pista de audio opcional.
// Los rectangulos se arrastran con raton o dedo (eventos de puntero), la esquina inferior derecha cambia el tamano, las flechas del teclado
// los mueven y cada valor tiene su casilla numerica: sirve igual en una pantalla chica. Todo en fracciones del cuadro de salida, el mismo
// formato { version: 1, regiones } de src/difuminados.js que valida el servidor. Cada boton llama a una ruta real de /api/panel/editor.
// Todo el texto entra con textContent y el dibujo con la API 2D del canvas (nunca HTML inyectado).
import { obtenerConfigEditor, validarEditor, previsualizarEditor, renderizarEditor, cancelarEditor, estadoTrabajoGuion } from './api.js';
import { el, toast } from './ui.js';

const TAM_MIN = 0.03;
const ESCALA = { min: 0.05, max: 1 };
const COLOR = { region: '#4aa3ff', capa: '#46d19a' };

const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r4 = (n) => Math.round(n * 10000) / 10000;
const pct = (f) => Math.round(Number(f) * 1000) / 10;                                    // 0.26 -> 26
export const aFraccion = (porcentaje) => Math.round(Number(porcentaje) * 100) / 10000;   // 26 -> 0.26

// ---------------------------------------------------------------- geometria pura (se prueba sin navegador)
// formato = { ancho, alto } en pixeles del cuadro de salida. Una capa PNG mide `escala` del ancho y su alto sale de la proporcion del PNG (dim).

/** Rectangulo de un elemento en fracciones del cuadro: { x, y, w, h }. */
export function rectDeItem(tipo, item, formato) {
  if (tipo === 'region') return { x: item.x, y: item.y, w: item.ancho, h: item.alto };
  const razon = item.dim && item.dim.ancho ? item.dim.alto / item.dim.ancho : 1;
  return { x: item.x, y: item.y, w: item.escala, h: (item.escala * formato.ancho * razon) / formato.alto };
}

/** Lo deja dentro del cuadro (sin cambiar su tamano). */
export function acomodarItem(tipo, item, formato) {
  const r = rectDeItem(tipo, item, formato);
  item.x = r4(acotar(item.x, 0, Math.max(0, 1 - r.w)));
  item.y = r4(acotar(item.y, 0, Math.max(0, 1 - r.h)));
  return item;
}

export function moverItem(tipo, item, dx, dy, formato) {
  item.x += dx;
  item.y += dy;
  return acomodarItem(tipo, item, formato);
}

/**
 * Cambia el tamano para que la esquina inferior derecha llegue a (ancho, alto) medidos desde x, y. Regiones: ancho y alto libres (minimo
 * tamMin). Capas: solo manda el ancho (escala); el alto sigue la proporcion del PNG y nunca se sale del cuadro.
 */
export function redimensionarItem(tipo, item, ancho, alto, formato, { tamMin = TAM_MIN, escala = ESCALA } = {}) {
  if (tipo === 'region') {
    item.ancho = r4(acotar(ancho, tamMin, Math.max(tamMin, 1 - item.x)));
    item.alto = r4(acotar(alto, tamMin, Math.max(tamMin, 1 - item.y)));
    return item;
  }
  const razon = item.dim && item.dim.ancho ? item.dim.alto / item.dim.ancho : 1;
  const razonAlto = (formato.ancho * razon) / formato.alto;
  const tope = Math.max(escala.min, Math.min(escala.max, 1 - item.x, (1 - item.y) / razonAlto));
  item.escala = r4(acotar(ancho, escala.min, tope));
  return acomodarItem(tipo, item, formato);   // si ni a la escala minima cabe donde esta (PNG muy alto), sube para quedar dentro
}

/**
 * Que hay bajo el punto (fx, fy) (fracciones). `elementos` va en orden de dibujo (el ultimo queda arriba). El cuadrito de la esquina del
 * elemento seleccionado tiene prioridad. tolX / tolY = tamano del cuadrito en fracciones (se calcula con el tamano real del lienzo en pantalla).
 * Devuelve { elemento, zona: 'mover' | 'redim' } o null.
 */
export function golpeEn(elementos, seleccionado, fx, fy, formato, { tolX = 0.06, tolY = 0.06 } = {}) {
  if (seleccionado) {
    const r = rectDeItem(seleccionado.tipo, seleccionado.item, formato);
    if (Math.abs(fx - (r.x + r.w)) <= tolX && Math.abs(fy - (r.y + r.h)) <= tolY) return { elemento: seleccionado, zona: 'redim' };
  }
  for (let i = elementos.length - 1; i >= 0; i--) {
    const e = elementos[i];
    const r = rectDeItem(e.tipo, e.item, formato);
    if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) return { elemento: e, zona: 'mover' };
  }
  return null;
}

const tiempoSalida = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

/**
 * Valores del editor -> cuerpo de POST /api/panel/editor/{validar,previsualizar,renderizar}. Pura (se prueba sin navegador).
 * v: { fuente, inicio, fin, formato, modo, calidad, regiones, capas, audio:{archivo, volumen, offset, mezclar}|null, t? }
 */
export function armarCuerpoEditor(v) {
  const fuente = { archivo: String(v.fuente || '').trim() };
  if (String(v.inicio || '').trim()) fuente.inicio = String(v.inicio).trim();
  if (String(v.fin || '').trim()) fuente.fin = String(v.fin).trim();
  const conTiempos = (base, e) => {
    const desde = tiempoSalida(e.desde);
    const hasta = tiempoSalida(e.hasta);
    if (desde !== undefined) base.desde = desde;
    if (hasta !== undefined) base.hasta = hasta;
    return base;
  };
  const cuerpo = {
    fuente,
    formato: v.formato || 'vertical',
    modo: v.modo || 'recorte',
    difuminados: (v.regiones || []).map((r) => conTiempos({ id: r.id, etiqueta: r.etiqueta, x: r.x, y: r.y, ancho: r.ancho, alto: r.alto, fuerza: r.fuerza, activo: r.activo !== false }, r)),
    capas: (v.capas || []).map((k) => conTiempos({ id: k.id, etiqueta: k.etiqueta, archivo: k.archivo, x: k.x, y: k.y, escala: k.escala, activo: k.activo !== false }, k)),
    audio: v.audio && v.audio.archivo ? { archivo: v.audio.archivo, volumen: Number(v.audio.volumen), offset: Number(v.audio.offset) || 0, mezclar: v.audio.mezclar !== false } : null,
  };
  if (v.calidad) cuerpo.calidad = v.calidad;
  if (v.t !== undefined && v.t !== null && String(v.t).trim() !== '') cuerpo.t = Number(v.t);
  return cuerpo;
}

// ---------------------------------------------------------------- estado del dialogo
let dialogo = null;
let lienzo = null;
let temporizador = null;
let pendienteVista = null;
let configuracion = null;
let contador = 0;
let regiones = [];
let capas = [];
let audio = { archivo: '', volumen: 1, offset: 0, mezclar: true };
let seleccion = null;      // { tipo: 'region' | 'capa', item }
let arrastre = null;       // { zona, elemento, inicio:{x, y}, x0, y0 }
let vista = { imagen: null, formato: '' };
let camposVivos = [];      // [() => void] que refrescan las casillas del elemento seleccionado mientras se arrastra

const zona = (nombre) => dialogo.querySelector('[data-zona="' + nombre + '"]');
const control = (nombre) => dialogo.querySelector('[name="' + nombre + '"]');
const limites = () => (configuracion && configuracion.limites) || {};

function formatoActual() {
  const id = control('formato').value || 'vertical';
  const f = configuracion && configuracion.formatos.find((x) => x.id === id);
  return f || { id, ancho: id === 'horizontal' ? 1920 : 1080, alto: id === 'horizontal' ? 1080 : 1920 };
}

const elementos = () => [...regiones.map((item) => ({ tipo: 'region', item })), ...capas.map((item) => ({ tipo: 'capa', item }))];

function valores() {
  return {
    fuente: control('fuente').value, inicio: control('inicio').value, fin: control('fin').value, formato: control('formato').value, modo: control('modo').value,
    calidad: control('calidad').value, regiones, capas, audio: audio.archivo ? audio : null,
  };
}

function aviso(texto, tipo = 'info') {
  const z = zona('estado');
  z.textContent = texto;
  z.dataset.tipo = tipo;
  z.hidden = !texto;
}

function pintarAvisos(lista) {
  const z = zona('avisos');
  z.replaceChildren(...(lista || []).map((a) => el('li', { text: a })));
  z.hidden = !(lista && lista.length);
}

// ---------------------------------------------------------------- lienzo
function tamLienzo() {
  const f = formatoActual();
  return f.ancho >= f.alto ? { w: 640, h: Math.round((640 * f.alto) / f.ancho) } : { w: 360, h: Math.round((360 * f.alto) / f.ancho) };
}

function dibujar() {
  if (!lienzo) return;
  const { w, h } = tamLienzo();
  if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h; }
  const g = lienzo.getContext('2d');
  const f = formatoActual();
  g.clearRect(0, 0, w, h);
  if (vista.imagen && vista.formato === f.id) {
    g.drawImage(vista.imagen, 0, 0, w, h);
  } else {
    g.fillStyle = '#141b2b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8b97b4';
    g.font = Math.round(w / 24) + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('Elige un video y pulsa', w / 2, h / 2 - 8);
    g.fillText('"Actualizar vista previa"', w / 2, h / 2 + w / 20);
  }
  const rect = lienzo.getBoundingClientRect();
  const escalaPantalla = rect.width > 0 ? w / rect.width : 1;
  const grande = Math.max(12, 20 * escalaPantalla);   // cuadrito de redimensionar: ~20 px en pantalla (comodo con el dedo)
  g.textAlign = 'left';
  g.font = Math.round(Math.max(10, w / 30)) + 'px system-ui, sans-serif';
  for (const e of elementos()) {
    const r = rectDeItem(e.tipo, e.item, f);
    const x = r.x * w; const y = r.y * h; const ancho = r.w * w; const alto = r.h * h;
    const elegido = seleccion && seleccion.item === e.item;
    const activo = e.item.activo !== false;
    g.save();
    g.globalAlpha = activo ? 1 : 0.4;
    g.fillStyle = COLOR[e.tipo] + (e.tipo === 'region' ? '33' : '22');
    g.fillRect(x, y, ancho, alto);
    g.lineWidth = elegido ? 3 : 1.5;
    g.strokeStyle = elegido ? '#ffffff' : COLOR[e.tipo];
    if (e.tipo === 'capa') g.setLineDash([6, 4]);
    g.strokeRect(x, y, ancho, alto);
    g.setLineDash([]);
    g.fillStyle = '#ffffff';
    g.fillText(nombreDe(e), x + 4, y + Math.max(12, w / 28), Math.max(10, ancho - 8));
    if (elegido) {
      g.fillStyle = COLOR[e.tipo];
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.fillRect(x + ancho - grande / 2, y + alto - grande / 2, grande, grande);
      g.strokeRect(x + ancho - grande / 2, y + alto - grande / 2, grande, grande);
    }
    g.restore();
  }
}

function nombreDe(e) {
  if (e.tipo === 'region') return e.item.etiqueta || 'Difuminado';
  return e.item.etiqueta || String(e.item.archivo || 'Capa').split('/').pop();
}

function punto(evento) {
  const r = lienzo.getBoundingClientRect();
  return { x: (evento.clientX - r.left) / Math.max(1, r.width), y: (evento.clientY - r.top) / Math.max(1, r.height), r };
}

function alBajar(evento) {
  const p = punto(evento);
  const golpe = golpeEn(elementos(), seleccion, p.x, p.y, formatoActual(), { tolX: 22 / p.r.width, tolY: 22 / p.r.height });
  if (!golpe) { seleccion = null; pintarElementos(); dibujar(); return; }
  seleccion = golpe.elemento;
  arrastre = { zona: golpe.zona, elemento: golpe.elemento, inicio: { x: p.x, y: p.y }, x0: golpe.elemento.item.x, y0: golpe.elemento.item.y };
  try { lienzo.setPointerCapture(evento.pointerId); } catch { /* el navegador no lo permite: se sigue sin captura */ }
  evento.preventDefault();
  pintarElementos();
  dibujar();
}

function alMover(evento) {
  if (!arrastre) return;
  const p = punto(evento);
  const { tipo, item } = arrastre.elemento;
  const f = formatoActual();
  if (arrastre.zona === 'mover') {
    item.x = arrastre.x0 + (p.x - arrastre.inicio.x);
    item.y = arrastre.y0 + (p.y - arrastre.inicio.y);
    acomodarItem(tipo, item, f);
  } else {
    redimensionarItem(tipo, item, p.x - item.x, p.y - item.y, f, { tamMin: limites().tamMin || TAM_MIN, escala: limites().escala || ESCALA });
  }
  camposVivos.forEach((actualizar) => actualizar());
  dibujar();
}

function alSoltar(evento) {
  if (!arrastre) return;
  arrastre = null;
  try { lienzo.releasePointerCapture(evento.pointerId); } catch { /* ya liberado */ }
  pintarElementos();
}

function alTeclear(evento) {
  if (!seleccion) return;
  const f = formatoActual();
  const paso = evento.shiftKey ? 0.05 : 0.01;
  const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[evento.key];
  if (mov) {
    evento.preventDefault();
    moverItem(seleccion.tipo, seleccion.item, mov[0], mov[1], f);
  } else if (evento.key === 'Delete' || evento.key === 'Backspace') {
    evento.preventDefault();
    quitarSeleccion();
    return;
  } else return;
  camposVivos.forEach((actualizar) => actualizar());
  dibujar();
}

// ---------------------------------------------------------------- elementos (lista, propiedades, audio)
function campoNumero(item, clave, etiqueta, { min, max, paso = 1, escala = true, nulo = false, entero = false }) {
  const leer = () => (item[clave] === null || item[clave] === undefined ? '' : String(escala ? pct(item[clave]) : item[clave]));
  const input = el('input', { type: 'number', inputmode: 'decimal', min: String(min), max: String(max), step: String(paso), 'aria-label': etiqueta, title: etiqueta, value: leer() });
  input.addEventListener('change', () => {
    if (nulo && input.value.trim() === '') { item[clave] = null; dibujar(); return; }
    const n = Number(input.value);
    if (!Number.isFinite(n)) { input.value = leer(); return; }
    if (escala) item[clave] = acotar(aFraccion(n), min / 100, max / 100);
    else item[clave] = entero ? Math.round(acotar(n, min, max)) : acotar(n, min, max);
    acomodarItem(seleccion.tipo, item, formatoActual());
    camposVivos.forEach((actualizar) => actualizar());
    dibujar();
  });
  camposVivos.push(() => { if (document.activeElement !== input) input.value = leer(); });
  return el('label', { class: 'campo' }, etiqueta, input);
}

function pintarPropiedades() {
  const zonaProp = zona('propiedades');
  camposVivos = [];
  if (!seleccion) { zonaProp.replaceChildren(el('p', { class: 'suave', text: 'Toca un rectangulo del lienzo o un elemento de la lista para ajustarlo.' })); return; }
  const { tipo, item } = seleccion;
  const nombre = el('input', { type: 'text', maxlength: '24', 'aria-label': 'Nombre', value: item.etiqueta || '' });
  nombre.addEventListener('change', () => { item.etiqueta = nombre.value.slice(0, 24); pintarElementos(); dibujar(); });
  const activo = el('input', { type: 'checkbox', 'aria-label': 'Activo' });
  activo.checked = item.activo !== false;
  activo.addEventListener('change', () => { item.activo = activo.checked; pintarElementos(); dibujar(); });
  const tiempos = [campoNumero(item, 'desde', 'Desde (s)', { min: 0, max: 3600, paso: 0.1, escala: false, nulo: true }), campoNumero(item, 'hasta', 'Hasta (s)', { min: 0, max: 3600, paso: 0.1, escala: false, nulo: true })];
  const filas = tipo === 'region'
    ? [campoNumero(item, 'x', 'Izquierda (%)', { min: 0, max: 100, paso: 0.5 }), campoNumero(item, 'y', 'Arriba (%)', { min: 0, max: 100, paso: 0.5 }),
      campoNumero(item, 'ancho', 'Ancho (%)', { min: 3, max: 100, paso: 0.5 }), campoNumero(item, 'alto', 'Alto (%)', { min: 3, max: 100, paso: 0.5 }),
      campoNumero(item, 'fuerza', 'Fuerza (1 a 10)', { min: 1, max: 10, escala: false, entero: true })]
    : [campoNumero(item, 'x', 'Izquierda (%)', { min: 0, max: 100, paso: 0.5 }), campoNumero(item, 'y', 'Arriba (%)', { min: 0, max: 100, paso: 0.5 }),
      campoNumero(item, 'escala', 'Tamano (% del ancho)', { min: 5, max: 100, paso: 0.5 })];
  zonaProp.replaceChildren(
    el('div', { class: 'fila-campos' }, el('label', { class: 'campo' }, 'Nombre', nombre), el('label', { class: 'check' }, activo, ' activo')),
    el('div', { class: 'fila-campos' }, ...filas),
    el('div', { class: 'fila-campos' }, ...tiempos),
    tipo === 'capa' ? el('p', { class: 'suave', text: 'Imagen: ' + item.archivo }) : null,
    el('p', { class: 'suave', text: 'Desde / hasta cuentan en segundos desde el inicio del tramo; vacios = todo el tramo.' }));
}

function pintarElementos() {
  const lista = zona('elementos');
  const todos = elementos();
  lista.replaceChildren(...(todos.length ? todos.map((e) => el('li', {}, el('button', {
    class: 'btn elemento', type: 'button', 'data-tipo': e.tipo, 'data-activo': e.item.activo === false ? '0' : '1', 'aria-pressed': seleccion && seleccion.item === e.item ? 'true' : 'false',
    text: (e.tipo === 'region' ? 'Difuminado: ' : 'Capa: ') + nombreDe(e) + (e.item.activo === false ? ' (apagado)' : ''),
    onclick: () => { seleccion = e; pintarElementos(); dibujar(); lienzo.focus({ preventScroll: true }); },
  }))) : [el('li', { class: 'suave', text: 'Sin elementos todavia: agrega un difuminado o una capa PNG.' })]));
  pintarPropiedades();
  zona('btn-quitar').disabled = !seleccion;
}

function quitarSeleccion() {
  if (!seleccion) return;
  if (seleccion.tipo === 'region') regiones = regiones.filter((r) => r !== seleccion.item);
  else capas = capas.filter((k) => k !== seleccion.item);
  seleccion = null;
  pintarElementos();
  dibujar();
}

function agregarRegion() {
  const max = limites().maxRegiones || 8;
  if (regiones.length >= max) { aviso('El maximo es ' + max + ' difuminados.', 'error'); return; }
  contador += 1;
  const item = { id: 'n' + contador, etiqueta: 'Difuminado ' + contador, x: 0.05, y: 0.05, ancho: 0.22, alto: 0.08, fuerza: 7, desde: null, hasta: null, activo: true };
  regiones.push(item);
  seleccion = { tipo: 'region', item };
  pintarElementos();
  dibujar();
}

function agregarCapa() {
  const archivo = control('png').value;
  if (!archivo) { aviso('Elige primero una imagen PNG de la lista.', 'error'); return; }
  const max = limites().maxCapas || 4;
  if (capas.length >= max) { aviso('El maximo es ' + max + ' capas.', 'error'); return; }
  const recurso = configuracion.recursos.pngs.find((p) => p.ruta === archivo);
  contador += 1;
  const item = { id: 'k' + contador, etiqueta: recurso ? recurso.nombre.replace(/\.png$/i, '').slice(0, 24) : 'Capa ' + contador, archivo, x: 0.05, y: 0.05, escala: 0.2, desde: null, hasta: null, activo: true, dim: recurso ? { ancho: recurso.ancho, alto: recurso.alto } : { ancho: 1, alto: 1 } };
  acomodarItem('capa', item, formatoActual());
  capas.push(item);
  seleccion = { tipo: 'capa', item };
  pintarElementos();
  dibujar();
}

function pintarAudio() {
  const z = zona('audio');
  const selector = el('select', { name: 'audio', 'aria-label': 'Pista de audio', onchange: (e) => { audio.archivo = e.target.value; } },
    el('option', { value: '', text: 'Sin audio extra' }), ...configuracion.recursos.audios.map((a) => el('option', { value: a.ruta, text: a.nombre + ' · ' + a.origen })));
  selector.value = audio.archivo;
  const etiquetaVol = el('span', { text: Math.round(audio.volumen * 100) + ' %' });
  const volumen = el('input', { type: 'range', min: String((limites().volumen || { min: 0 }).min), max: String((limites().volumen || { max: 2 }).max), step: '0.05', value: String(audio.volumen), 'aria-label': 'Volumen de la pista' });
  volumen.addEventListener('input', () => { audio.volumen = Number(volumen.value); etiquetaVol.textContent = Math.round(audio.volumen * 100) + ' %'; });
  const offset = el('input', { type: 'number', inputmode: 'decimal', min: '0', max: String(limites().offsetAudioMax || 120), step: '0.1', value: String(audio.offset), 'aria-label': 'Retraso del audio en segundos' });
  offset.addEventListener('change', () => { const n = Number(offset.value); audio.offset = Number.isFinite(n) ? acotar(n, 0, limites().offsetAudioMax || 120) : 0; offset.value = String(audio.offset); });
  const mezclar = el('input', { type: 'checkbox', 'aria-label': 'Mezclar con el audio original' });
  mezclar.checked = audio.mezclar !== false;
  mezclar.addEventListener('change', () => { audio.mezclar = mezclar.checked; });
  z.replaceChildren(el('label', { class: 'campo' }, 'Pista', selector), el('label', { class: 'campo' }, 'Volumen ', etiquetaVol, volumen),
    el('div', { class: 'fila-campos' }, el('label', { class: 'campo' }, 'Retraso (s)', offset), el('label', { class: 'check' }, mezclar, ' mezclar con el original (apagado = reemplaza)')));
}

// ---------------------------------------------------------------- servidor
function pintarTrabajo(t) {
  const caja = zona('trabajo');
  const ocupado = t.estado === 'corriendo';
  dialogo.dataset.ocupado = ocupado ? '1' : '0';
  const esMio = t.tipo === 'editor';
  zona('btn-cancelar').hidden = !(ocupado && esMio);
  zona('btn-cancelar').disabled = Boolean(t.cancelando);
  zona('btn-renderizar').disabled = ocupado;
  if (!t.tipo) caja.textContent = 'Sin trabajos en curso.';
  else if (ocupado) caja.textContent = (t.cancelando ? 'Cancelando… ' : '') + (esMio ? 'Editor' : 'Otro trabajo (' + t.tipo + ')') + ': ' + t.etapa + ' (' + t.progreso + '%)';
  else if (t.estado === 'ok') caja.textContent = 'Listo: el video esta en "Todos los clips" (boton Publicar a mano).' + (t.resultado && t.resultado.avisos && t.resultado.avisos.length ? ' Avisos: ' + t.resultado.avisos.join(' | ') : '');
  else if (t.estado === 'cancelado') caja.textContent = 'Cancelado. No quedaron archivos a medias y ya puedes renderizar otro.';
  else caja.textContent = 'Fallo: ' + (t.error || 'sin detalle');
  caja.dataset.tipo = t.estado === 'error' ? 'error' : t.estado === 'ok' ? 'ok' : 'info';
}

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(async () => {
    if (!dialogo.open) { clearInterval(temporizador); return; }
    try { pintarTrabajo((await estadoTrabajoGuion()).trabajo); } catch { /* se reintenta */ }
  }, 3000);
}

function cuerpo(extra = {}) {
  return armarCuerpoEditor({ ...valores(), ...extra });
}

async function actualizarVista() {
  if (!control('fuente').value) { aviso('Elige primero el video fuente.', 'error'); return; }
  aviso('Sacando el fotograma…', 'info');
  zona('btn-vista').disabled = true;
  try {
    const r = await previsualizarEditor(cuerpo({ t: control('instante').value || 0 }));
    const imagen = new Image();
    imagen.onload = () => { vista = { imagen, formato: control('formato').value || 'vertical' }; dibujar(); };
    imagen.src = r.imagen;
    pintarAvisos(r.avisos);
    aviso('Vista previa lista (muestra el resultado real con difuminados y capas).', 'ok');
  } catch (error) {
    aviso(error.message, 'error');
  } finally {
    zona('btn-vista').disabled = false;
  }
}

function vistaConRetraso() {
  clearTimeout(pendienteVista);
  if (control('fuente').value) pendienteVista = setTimeout(() => { if (dialogo.open) actualizarVista(); }, 500);
}

/** Aplica lo que el servidor normalizo (ids unicos, valores acotados) conservando las dimensiones de cada PNG. */
function aplicarNormalizado(r) {
  regiones = r.difuminados.regiones.map((x) => ({ ...x }));
  capas = r.capas.map((x) => ({ ...x }));
  seleccion = null;
  pintarElementos();
  dibujar();
}

async function validar() {
  if (!control('fuente').value) { aviso('Elige primero el video fuente.', 'error'); return; }
  try {
    const r = await validarEditor(cuerpo());
    aplicarNormalizado(r);
    pintarAvisos(r.avisos);
    aviso('Todo en orden: ' + r.difuminados.regiones.length + ' difuminados, ' + r.capas.length + ' capas' + (r.audio ? ' y audio.' : '.'), 'ok');
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function renderizar() {
  try {
    const r = await renderizarEditor(cuerpo());
    aviso('Render iniciado.' + (r.avisos && r.avisos.length ? ' Avisos: ' + r.avisos.join(' | ') : ''), 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function cancelar() {
  try {
    const r = await cancelarEditor();
    aviso(r.trabajo.estado === 'cancelado' ? 'Render cancelado.' : 'Cancelando…', 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function cargarConfig() {
  try {
    configuracion = await obtenerConfigEditor();
    control('fuente').replaceChildren(el('option', { value: '', text: configuracion.recursos.fuentes.length ? 'Elige el video fuente' : 'No hay videos (sube uno o genera clips primero)' }),
      ...configuracion.recursos.fuentes.map((f) => el('option', { value: f.ruta, text: f.nombre + ' · ' + f.origen + ' · ' + Math.round(f.tamano / 1048576) + ' MB' })));
    control('formato').replaceChildren(...configuracion.formatos.map((f) => el('option', { value: f.id, text: f.nombre })));
    control('png').replaceChildren(el('option', { value: '', text: configuracion.recursos.pngs.length ? 'Elige una imagen PNG' : 'No hay PNG (sube uno o ponlo en assets)' }),
      ...configuracion.recursos.pngs.map((p) => el('option', { value: p.ruta, text: p.nombre + ' · ' + p.ancho + 'x' + p.alto })));
    const a = configuracion.almacenamiento;
    zona('almacenamiento').textContent = 'Almacenamiento: ' + a.videos + ' de ' + a.maxClipsStored + ' videos (MAX_CLIPS_STORED); al pasarlo se borran los mas viejos.';
    pintarAudio();
    pintarTrabajo(configuracion.trabajo);
    dibujar();
  } catch (error) {
    aviso('No se pudo leer la configuracion: ' + error.message, 'error');
  }
}

// ---------------------------------------------------------------- dialogo
function crearDialogo() {
  const campo = (etiqueta, controlHtml) => el('label', { class: 'campo' }, etiqueta, controlHtml);
  lienzo = el('canvas', { class: 'lienzo-editor', width: '360', height: '640', tabindex: '0', role: 'img', 'aria-label': 'Lienzo del editor: arrastra los rectangulos para moverlos; la esquina inferior derecha cambia su tamano; las flechas del teclado los mueven.' });
  lienzo.addEventListener('pointerdown', alBajar);
  lienzo.addEventListener('pointermove', alMover);
  lienzo.addEventListener('pointerup', alSoltar);
  lienzo.addEventListener('pointercancel', alSoltar);
  lienzo.addEventListener('keydown', alTeclear);

  const d = el('dialog', { id: 'dlg-editor', class: 'dlg-guiones dlg-editor' },
    el('h2', { text: 'Mini editor' }),
    el('p', { class: 'estado-entorno', 'data-zona': 'almacenamiento' }),
    el('p', { class: 'estado', 'data-zona': 'estado', hidden: true }),
    el('p', { class: 'estado', 'data-zona': 'trabajo', text: 'Sin trabajos en curso.' }),
    el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-cancelar', hidden: true, text: 'Cancelar render', onclick: () => cancelar() }),
    el('div', { class: 'editor-grid' },
      el('div', { class: 'editor-lienzo' },
        lienzo,
        el('div', { class: 'toolbar' },
          campo('Instante (s del tramo)', el('input', { name: 'instante', type: 'number', inputmode: 'decimal', min: '0', step: '0.5', value: '0' })),
          el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-vista', text: 'Actualizar vista previa', onclick: () => actualizarVista() })),
        el('p', { class: 'suave', text: 'Arrastra un rectangulo para moverlo y el cuadrito de su esquina para cambiar el tamano. Tambien puedes usar las flechas del teclado o las casillas de abajo.' })),
      el('div', { class: 'editor-panel' },
        el('fieldset', {}, el('legend', { text: 'Video y tramo' }),
          campo('Video fuente', el('select', { name: 'fuente', onchange: () => vistaConRetraso() }, el('option', { value: '', text: 'Cargando…' }))),
          el('div', { class: 'fila-campos' },
            campo('Formato', el('select', { name: 'formato', onchange: () => { dibujar(); vistaConRetraso(); } }, el('option', { value: 'vertical', text: 'Vertical 9:16' }))),
            campo('Encuadre', el('select', { name: 'modo', onchange: () => vistaConRetraso() }, el('option', { value: 'recorte', text: 'Recorte centrado' }), el('option', { value: 'blur', text: 'Fondo desenfocado' }))),
            campo('Calidad', el('select', { name: 'calidad' }, el('option', { value: '', text: 'Segun el servidor' }), el('option', { value: 'rapida', text: 'Rapida (veryfast)' }), el('option', { value: 'mejor', text: 'Mejor (faster)' })))),
          el('div', { class: 'fila-campos' },
            campo('Inicio (mm:ss)', el('input', { name: 'inicio', placeholder: '0:12', maxlength: '12', onchange: () => vistaConRetraso() })),
            campo('Fin (mm:ss)', el('input', { name: 'fin', placeholder: '0:48', maxlength: '12' })))),
        el('fieldset', {}, el('legend', { text: 'Elementos' }),
          el('ul', { class: 'elementos', 'data-zona': 'elementos' }),
          el('div', { class: 'toolbar' },
            el('button', { class: 'btn', type: 'button', text: '+ Difuminado', onclick: () => agregarRegion() }),
            el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-quitar', text: 'Quitar seleccionado', disabled: true, onclick: () => quitarSeleccion() })),
          el('div', { class: 'toolbar' },
            campo('Imagen PNG', el('select', { name: 'png' }, el('option', { value: '', text: 'Cargando…' }))),
            el('button', { class: 'btn', type: 'button', text: '+ Capa PNG', onclick: () => agregarCapa() }))),
        el('fieldset', {}, el('legend', { text: 'Ajustes del elemento' }), el('div', { 'data-zona': 'propiedades' })),
        el('fieldset', {}, el('legend', { text: 'Audio (opcional)' }), el('div', { 'data-zona': 'audio' })),
        el('ul', { class: 'lista-problemas', 'data-zona': 'avisos', hidden: true }),
        el('div', { class: 'toolbar' },
          el('button', { class: 'btn', type: 'button', text: 'Validar', onclick: () => validar() }),
          el('button', { class: 'btn btn-primario', type: 'button', 'data-zona': 'btn-renderizar', text: 'Renderizar video', onclick: () => renderizar() })))),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn', type: 'button', text: 'Actualizar', onclick: () => cargarConfig() }),
      el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() })));
  d.dataset.ocupado = '0';
  d.addEventListener('close', () => { clearInterval(temporizador); clearTimeout(pendienteVista); });
  document.body.appendChild(d);
  return d;
}

export async function abrirEditor() {
  if (!dialogo) { dialogo = crearDialogo(); pintarElementos(); }
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  await cargarConfig();
  dibujar();
  iniciarSondeo();
}

const boton = document.getElementById('btn-editor');
if (boton) boton.addEventListener('click', () => { abrirEditor().catch((e) => toast('No se pudo abrir el editor: ' + e.message, 'error')); });

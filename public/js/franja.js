// Sports / News desde un video fuente (Parte 6B). Boton "Sports / News" de la barra superior -> dialogo con:
//   canal, formato (vertical 9:16 / horizontal 16:9), video fuente, rango por marcas, titulos por mercado y difuminados ajustables
//   (rectangulos en % del cuadro que tapan logos ajenos sin franjas rigidas), boton de producir y boton de cancelar.
// Cada control llama a una ruta real de /api/panel/franja y /api/panel/produccion. Todo el texto entra con textContent (sin HTML inyectado).
// La estructura de difuminados es la misma que usara el mini editor de la Parte 7 (src/difuminados.js): { id, etiqueta, x, y, ancho, alto, fuerza, activo }.
import { obtenerConfigFranja, listarFuentesFranja, estadoTrabajoGuion, producirFranjaVideo, cancelarProduccion, validarDifuminados } from './api.js';
import { el, toast } from './ui.js';

let dialogo = null;
let temporizador = null;
let configuracion = null;
let regiones = [];
let editado = false;
let contador = 0;

const pct = (f) => Math.round(Number(f) * 1000) / 10;                       // 0.26 -> 26
export const aFraccion = (porcentaje) => Math.round(Number(porcentaje) * 100) / 10000;   // 26 -> 0.26

/**
 * Valores del formulario -> cuerpo de POST /api/panel/franja/producir. Pura (se prueba sin navegador).
 * Si los difuminados no se tocaron, NO se envian: el servidor usa los sugeridos del canal para ese formato.
 */
export function armarCuerpoFranja(v) {
  const fuente = { archivo: String(v.fuente || '').trim() };
  if (String(v.inicio || '').trim()) fuente.inicio = String(v.inicio).trim();
  if (String(v.fin || '').trim()) fuente.fin = String(v.fin).trim();
  const comun = { fuente };
  if (v.modo) comun.modo = v.modo;
  if (v.posicionTitulo) comun.posicionTitulo = v.posicionTitulo;
  if (v.editado) {
    comun.difuminados = (v.regiones || []).map((r) => {
      const salida = { id: r.id, etiqueta: r.etiqueta, x: r.x, y: r.y, ancho: r.ancho, alto: r.alto, fuerza: r.fuerza, activo: r.activo !== false };
      if (r.desde !== null && r.desde !== undefined) salida.desde = r.desde;   // la estructura admite tiempos aunque este formulario aun no los edita
      if (r.hasta !== null && r.hasta !== undefined) salida.hasta = r.hasta;
      return salida;
    });
  }
  const entradas = [{ mercado: 'en-US', titulo: String(v.tituloEn || ''), ...comun }];
  if (String(v.tituloEs || '').trim()) entradas.push({ mercado: 'es-US', titulo: String(v.tituloEs), ...comun });
  return { canal: v.canal, formato: v.formato || 'vertical', entradas };
}

function zona(nombre) { return dialogo.querySelector('[data-zona="' + nombre + '"]'); }

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

function pintarTrabajo(t) {
  const caja = zona('trabajo');
  const ocupado = t.estado === 'corriendo';
  dialogo.dataset.ocupado = ocupado ? '1' : '0';
  const cancelable = ocupado && (t.tipo === 'franja' || t.tipo === 'produccion');
  zona('btn-cancelar').hidden = !cancelable;
  zona('btn-cancelar').disabled = Boolean(t.cancelando);
  if (!t.tipo) caja.textContent = 'Sin trabajos en curso.';
  else if (ocupado) caja.textContent = (t.cancelando ? 'Cancelando… ' : '') + 'Produccion: ' + t.etapa + ' (' + t.progreso + '%)';
  else if (t.estado === 'ok') caja.textContent = 'Produccion lista: los videos estan en "Todos los clips" (boton Publicar a mano).' + (t.resultado && t.resultado.avisos && t.resultado.avisos.length ? ' Avisos: ' + t.resultado.avisos.join(' | ') : '');
  else if (t.estado === 'cancelado') caja.textContent = 'Produccion cancelada. No quedaron archivos a medias y ya puedes producir otra.';
  else caja.textContent = 'Fallo: ' + (t.error || 'sin detalle');
  caja.dataset.tipo = t.estado === 'error' ? 'error' : t.estado === 'ok' ? 'ok' : 'info';
  actualizarBotones();
}

function actualizarBotones() {
  const ocupado = dialogo.dataset.ocupado === '1';
  zona('btn-producir').disabled = ocupado;
}

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(async () => {
    if (!dialogo.open) { clearInterval(temporizador); return; }
    try { pintarTrabajo((await estadoTrabajoGuion()).trabajo); } catch { /* se reintenta */ }
  }, 3000);
}

// ---------------------------------------------------------------- difuminados (editor sencillo; el visual llega en la Parte 7)
function nuevaRegion() {
  contador += 1;
  return { id: 'n' + contador, etiqueta: 'Difuminado ' + contador, x: 0.05, y: 0.05, ancho: 0.2, alto: 0.07, fuerza: 7, activo: true };
}

function campoNumero(region, clave, etiqueta, { min, max, paso = 1, escala = true }) {
  const input = el('input', { type: 'number', min: String(min), max: String(max), step: String(paso), 'aria-label': etiqueta, title: etiqueta, value: String(escala ? pct(region[clave]) : region[clave]) });
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) { input.value = String(escala ? pct(region[clave]) : region[clave]); return; }
    region[clave] = escala ? Math.min(1, Math.max(0, aFraccion(n))) : Math.round(Math.min(max, Math.max(min, n)));
    editado = true;
  });
  return input;
}

function filaRegion(region) {
  const etiqueta = el('input', { type: 'text', maxlength: '24', 'aria-label': 'Nombre del difuminado', value: region.etiqueta || '' });
  etiqueta.addEventListener('change', () => { region.etiqueta = etiqueta.value.slice(0, 24); editado = true; });
  const activo = el('input', { type: 'checkbox', 'aria-label': 'Difuminado activo' });
  activo.checked = region.activo !== false;
  activo.addEventListener('change', () => { region.activo = activo.checked; editado = true; });
  return el('li', { class: 'fila-difuminado' },
    etiqueta,
    campoNumero(region, 'x', 'Izquierda (% del ancho)', { min: 0, max: 100 }),
    campoNumero(region, 'y', 'Arriba (% del alto)', { min: 0, max: 100 }),
    campoNumero(region, 'ancho', 'Ancho (%)', { min: 3, max: 100 }),
    campoNumero(region, 'alto', 'Alto (%)', { min: 3, max: 100 }),
    campoNumero(region, 'fuerza', 'Fuerza (1 a 10)', { min: 1, max: 10, escala: false }),
    el('label', { class: 'check' }, activo, ' activo'),
    el('button', { class: 'btn', type: 'button', text: 'Quitar', onclick: () => { regiones = regiones.filter((r) => r !== region); editado = true; pintarRegiones(); } }));
}

function pintarRegiones() {
  const lista = zona('regiones');
  lista.replaceChildren(...(regiones.length ? regiones.map(filaRegion) : [el('li', { class: 'suave', text: 'Sin difuminados: los logos ajenos del video quedan visibles.' })]));
  zona('estado-difuminados').textContent = editado ? 'Difuminados ajustados por ti.' : 'Difuminados sugeridos por el canal (puedes ajustarlos o sumar mas).';
}

async function cargarSugeridos() {
  const canal = dialogo.querySelector('[name="canal"]').value;
  const formato = dialogo.querySelector('[name="formato"]').value;
  if (!canal) { regiones = []; editado = false; pintarRegiones(); return; }
  try {
    const c = await obtenerConfigFranja(canal, formato);
    regiones = c.difuminados.regiones.map((r) => ({ ...r }));
    editado = false;
    pintarRegiones();
    pintarAvisos(c.difuminados.avisos);
    const posicion = dialogo.querySelector('[name="posicionTitulo"]').options[0];
    const canalInfo = configuracion.canales.find((x) => x.id === canal);
    posicion.textContent = 'Segun el canal (' + (canalInfo ? canalInfo.tituloPosicion : '—') + ')';
  } catch (error) {
    aviso('No se pudieron leer los difuminados sugeridos: ' + error.message, 'error');
  }
}

async function comprobarDifuminados() {
  const canal = dialogo.querySelector('[name="canal"]').value;
  const formato = dialogo.querySelector('[name="formato"]').value;
  if (!canal) { aviso('Elige primero el canal.', 'error'); return; }
  try {
    const r = await validarDifuminados(canal, formato, regiones);
    regiones = r.difuminados.regiones.map((x) => ({ ...x }));
    pintarRegiones();
    pintarAvisos(r.avisos);
    aviso('Difuminados validos (' + r.difuminados.regiones.length + ').', 'ok');
  } catch (error) {
    aviso(error.message, 'error');
  }
}

// ---------------------------------------------------------------- formulario
async function llenarFuentes() {
  const selector = dialogo.querySelector('[name="fuente"]');
  try {
    const { fuentes } = await listarFuentesFranja();
    selector.replaceChildren(el('option', { value: '', text: fuentes.length ? 'Elige el video fuente' : 'No hay videos (sube uno o genera clips primero)' }),
      ...fuentes.map((f) => el('option', { value: f.ruta, text: f.nombre + ' · ' + f.origen + ' · ' + Math.round(f.tamano / 1048576) + ' MB' })));
  } catch (error) {
    selector.replaceChildren(el('option', { value: '', text: 'No se pudieron listar los videos: ' + error.message }));
  }
}

async function llenarConfig() {
  try {
    configuracion = await obtenerConfigFranja();
    const canal = dialogo.querySelector('[name="canal"]');
    canal.replaceChildren(el('option', { value: '', text: 'Elige el canal' }), ...configuracion.canales.map((c) => el('option', { value: c.id, text: c.nombre })));
    const formato = dialogo.querySelector('[name="formato"]');
    formato.replaceChildren(...configuracion.formatos.map((f) => el('option', { value: f.id, text: f.nombre })));
    const a = configuracion.almacenamiento;
    zona('almacenamiento').textContent = 'Almacenamiento: ' + a.videos + ' de ' + a.maxClipsStored + ' videos (MAX_CLIPS_STORED); al pasarlo se borran los mas viejos.';
    pintarTrabajo(configuracion.trabajo);
  } catch (error) {
    aviso('No se pudo leer la configuracion: ' + error.message, 'error');
  }
}

async function producir(formulario) {
  const v = (n) => formulario.elements[n];
  const cuerpo = armarCuerpoFranja({
    canal: v('canal').value, formato: v('formato').value, modo: v('modo').value, fuente: v('fuente').value, inicio: v('inicio').value, fin: v('fin').value,
    tituloEn: v('tituloEn').value, tituloEs: v('tituloEs').value, posicionTitulo: v('posicionTitulo').value, regiones, editado,
  });
  try {
    const r = await producirFranjaVideo(cuerpo);
    aviso('Produccion iniciada.' + (r.avisos && r.avisos.length ? ' Avisos: ' + r.avisos.join(' | ') : ''), 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function cancelar() {
  try {
    const r = await cancelarProduccion();
    aviso(r.trabajo.estado === 'cancelado' ? 'Produccion cancelada.' : 'Cancelando…', 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

function crearDialogo() {
  const campo = (etiqueta, control) => el('label', { class: 'campo' }, etiqueta, control);
  const formulario = el('form', { class: 'form-ficha', autocomplete: 'off', onsubmit: (e) => { e.preventDefault(); producir(formulario); } },
    el('div', { class: 'fila-campos' },
      campo('Canal', el('select', { name: 'canal', required: true, onchange: () => cargarSugeridos() }, el('option', { value: '', text: 'Elige el canal' }))),
      campo('Formato', el('select', { name: 'formato', onchange: () => cargarSugeridos() }, el('option', { value: 'vertical', text: 'Vertical 9:16' }))),
      campo('Encuadre', el('select', { name: 'modo' }, el('option', { value: '', text: 'Segun el canal' }), el('option', { value: 'recorte', text: 'Recorte centrado' }), el('option', { value: 'blur', text: 'Fondo desenfocado' })))),
    campo('Video fuente', el('select', { name: 'fuente', required: true }, el('option', { value: '', text: 'Cargando…' }))),
    el('div', { class: 'fila-campos' },
      campo('Inicio (mm:ss, opcional)', el('input', { name: 'inicio', placeholder: '0:12', maxlength: '12' })),
      campo('Fin (mm:ss, opcional)', el('input', { name: 'fin', placeholder: '0:48', maxlength: '12' })),
      campo('Posicion del titulo', el('select', { name: 'posicionTitulo' }, el('option', { value: '', text: 'Segun el canal' }), el('option', { value: 'superior', text: 'Arriba' }), el('option', { value: 'inferior', text: 'Abajo' })))),
    campo('Titulo con gancho (en-US)', el('input', { name: 'tituloEn', required: true, maxlength: '120' })),
    campo('Titulo en espanol (es-US, opcional)', el('input', { name: 'tituloEs', maxlength: '120' })),
    el('h3', { text: 'Difuminados (tapan logos ajenos sin franjas)' }),
    el('p', { class: 'suave', 'data-zona': 'estado-difuminados' }),
    el('p', { class: 'suave', text: 'Cada fila es un rectangulo en % del cuadro: izquierda, arriba, ancho, alto y fuerza (1 a 10). Maximo 8 y que no tapen mas del 35 % del video.' }),
    el('ul', { class: 'guion-lista', 'data-zona': 'regiones' }),
    el('ul', { class: 'lista-problemas', 'data-zona': 'avisos', hidden: true }),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn', type: 'button', text: 'Agregar difuminado', onclick: () => { regiones.push(nuevaRegion()); editado = true; pintarRegiones(); } }),
      el('button', { class: 'btn', type: 'button', text: 'Restaurar sugeridos', onclick: () => cargarSugeridos() }),
      el('button', { class: 'btn', type: 'button', text: 'Validar difuminados', onclick: () => comprobarDifuminados() })),
    el('button', { class: 'btn btn-primario', type: 'submit', 'data-zona': 'btn-producir', text: 'Producir video' }));
  const d = el('dialog', { id: 'dlg-franja', class: 'dlg-guiones dlg-franja' },
    el('h2', { text: 'Sports / News desde video fuente' }),
    el('p', { class: 'estado-entorno', 'data-zona': 'almacenamiento' }),
    el('p', { class: 'estado', 'data-zona': 'estado', hidden: true }),
    el('p', { class: 'estado', 'data-zona': 'trabajo', text: 'Sin trabajos en curso.' }),
    el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-cancelar', hidden: true, text: 'Cancelar produccion', onclick: () => cancelar() }),
    formulario,
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn', type: 'button', text: 'Actualizar', onclick: () => { llenarFuentes(); llenarConfig(); } }),
      el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() })));
  d.dataset.ocupado = '0';
  d.addEventListener('close', () => clearInterval(temporizador));
  document.body.appendChild(d);
  return d;
}

export async function abrirFranja() {
  if (!dialogo) { dialogo = crearDialogo(); pintarRegiones(); }
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  await Promise.all([llenarConfig(), llenarFuentes()]);
  iniciarSondeo();
}

const boton = document.getElementById('btn-franja');
if (boton) boton.addEventListener('click', () => { abrirFranja().catch((e) => toast('No se pudo abrir Sports / News: ' + e.message, 'error')); });

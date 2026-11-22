// Guiones y produccion de stories (Parte 5). Boton "Guiones" de la barra superior -> dialogo con:
//   Entorno (Ollama / Piper / banco), formulario de ficha, cola (pendientes -> procesados / fallidos) y produccion de video.
// Cada control llama a una ruta real de /api/panel/guiones. Todo el texto entra con textContent (sin HTML inyectado).
import { obtenerCanales, obtenerEntornoGuiones, listarGuiones, estadoTrabajoGuion, encolarGuionFicha, procesarGuion, producirGuiones } from './api.js';
import { el, toast } from './ui.js';

const TIPOS = ['fecha', 'lugar', 'cifra', 'persona', 'dato'];
let dialogo = null;
let temporizador = null;
let seleccion = new Set();
let ultimoTrabajo = '';

/** "lugar: Lisbon" por linea -> [{tipo, valor}]. Devuelve { hechos, errores }. */
export function parsearHechos(texto) {
  const hechos = [];
  const errores = [];
  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const m = /^\s*([A-Za-z]+)\s*[:=]\s*(.+?)\s*$/.exec(linea);
    if (!m || !TIPOS.includes(m[1].toLowerCase())) { errores.push('Linea ' + (i + 1) + ': usa "tipo: valor" con tipo ' + TIPOS.join(', ') + '.'); return; }
    hechos.push({ tipo: m[1].toLowerCase(), valor: m[2] });
  });
  return { hechos, errores };
}

function zona(nombre) { return dialogo.querySelector('[data-zona="' + nombre + '"]'); }

function aviso(texto, tipo = 'info') {
  const z = zona('estado');
  z.textContent = texto;
  z.dataset.tipo = tipo;
  z.hidden = !texto;
}

function fila(g, estado) {
  const marca = estado === 'procesados'
    ? el('input', { type: 'checkbox', 'aria-label': 'Elegir ' + g.titulo, onchange: (e) => { if (e.target.checked) seleccion.add(g.id); else seleccion.delete(g.id); actualizarBotones(); } })
    : null;
  if (marca && seleccion.has(g.id)) marca.checked = true;
  const detalle = [];
  if (g.problemas && g.problemas.length) detalle.push(el('ul', { class: 'lista-problemas' }, g.problemas.map((p) => el('li', { text: p }))));
  if (g.avisos && g.avisos.length) detalle.push(el('p', { class: 'suave', text: 'Avisos: ' + g.avisos.join(' | ') }));
  if (g.error) detalle.push(el('p', { class: 'suave', text: g.error }));
  return el('li', { class: 'guion-fila' }, marca, el('div', {},
    el('strong', { text: g.titulo }), ' ', el('span', { class: 'suave', text: [g.canal, g.mercado, g.partes ? g.partes + ' parte(s)' : null, g.intentos ? g.intentos + ' intento(s)' : null].filter(Boolean).join(' · ') }), ...detalle));
}

function pintarLista(nombre, lista, estado, vacio) {
  const z = zona(nombre);
  z.replaceChildren(...(lista.length ? lista.map((g) => fila(g, estado)) : [el('li', { class: 'suave', text: vacio })]));
}

function actualizarBotones() {
  const ocupado = dialogo.dataset.ocupado === '1';
  zona('btn-procesar').disabled = ocupado || dialogo.dataset.pendientes === '0';
  zona('btn-producir').disabled = ocupado || seleccion.size < 1 || seleccion.size > 2;
}

function pintarTrabajo(t) {
  const caja = zona('trabajo');
  const ocupado = t.estado === 'corriendo';
  dialogo.dataset.ocupado = ocupado ? '1' : '0';
  if (!t.tipo) caja.textContent = 'Sin trabajos en curso.';
  else if (ocupado) caja.textContent = (t.tipo === 'guion' ? 'Guion' : 'Produccion') + ': ' + t.etapa + ' (' + t.progreso + '%)';
  else if (t.estado === 'ok') caja.textContent = (t.tipo === 'guion' ? 'Guion listo.' : 'Produccion lista: los videos estan en "Todos los clips" (boton Publicar a mano).') + (t.resultado && t.resultado.avisos && t.resultado.avisos.length ? ' Avisos: ' + t.resultado.avisos.join(' | ') : '');
  else caja.textContent = 'Fallo: ' + (t.error || 'sin detalle');
  caja.dataset.tipo = t.estado === 'error' ? 'error' : t.estado === 'ok' ? 'ok' : 'info';
  const huella = t.tipo + t.estado + t.fin;
  if (!ocupado && huella !== ultimoTrabajo) { if (ultimoTrabajo) refrescar(false); ultimoTrabajo = huella; }
  actualizarBotones();
}

async function refrescar(conEntorno = true) {
  try {
    const datos = await listarGuiones();
    dialogo.dataset.pendientes = String(datos.pendientes.length);
    seleccion = new Set([...seleccion].filter((id) => datos.procesados.some((g) => g.id === id)));
    pintarLista('pendientes', datos.pendientes, 'pendientes', 'No hay fichas pendientes.');
    pintarLista('procesados', datos.procesados, 'procesados', 'Aun no hay guiones procesados.');
    pintarLista('fallidos', datos.fallidos, 'fallidos', 'Sin guiones fallidos.');
    pintarTrabajo(datos.trabajo);
  } catch (error) {
    aviso('No se pudo leer la cola: ' + error.message, 'error');
  }
  if (conEntorno) comprobarEntorno();
}

async function comprobarEntorno() {
  const caja = zona('entorno');
  caja.textContent = 'Comprobando…';
  try {
    const e = await obtenerEntornoGuiones();
    const ollama = e.ollama.activo ? (e.ollama.instalado ? 'Ollama listo (' + e.ollama.modelo + ')' : 'Ollama activo, falta el modelo ' + e.ollama.modelo + ' (ollama pull ' + e.ollama.modelo + ')') : 'Ollama NO responde (' + (e.ollama.error || 'sin conexion') + ')';
    const voces = Object.entries(e.piper.voces).map(([m, v]) => m + ': ' + (v ? 'ok' : 'falta voz')).join(', ');
    const piper = e.piper.binario ? 'Piper listo (' + voces + ')' : 'Piper NO encontrado en ' + e.piper.ruta + ' (define PIPER_PATH)';
    const n = Object.values(e.banco).reduce((s, tipo) => s + Object.values(tipo).reduce((a, b) => a + b, 0), 0);
    caja.replaceChildren(el('div', { text: ollama }), el('div', { text: piper }), el('div', { text: 'Banco de medios: ' + n + ' archivo(s)' + (n ? '' : ' (opcional: sin el, los fondos son colores)') }));
  } catch (error) {
    caja.textContent = 'No se pudo comprobar el entorno: ' + error.message;
  }
}

async function encolar(formulario) {
  const v = (n) => formulario.elements[n];
  const { hechos, errores } = parsearHechos(v('hechos').value);
  if (errores.length) { aviso(errores.join(' '), 'error'); return; }
  const ficha = { titulo: v('titulo').value, canal: v('canal').value, mercado: v('mercado').value, hechos, fuente: v('fuente').value, partes: v('partes').value, proyecto: v('proyecto').value, foto: v('foto').value, continuar: v('continuar').checked };
  const opciones = v('esus').checked ? { tambienEsUS: true, tituloEs: v('tituloes').value } : {};
  try {
    const r = await encolarGuionFicha(ficha, opciones);
    aviso('Ficha en la cola (' + r.ids.length + ' guion(es)).', 'ok');
    formulario.reset();
    refrescar(false);
  } catch (error) {
    aviso(error.message, 'error');
  }
}

async function accion(promesa, textoOk) {
  try {
    const r = await promesa();
    aviso(textoOk, 'ok');
    pintarTrabajo(r.trabajo);
    iniciarSondeo();
  } catch (error) {
    aviso(error.message, 'error');
  }
}

function iniciarSondeo() {
  clearInterval(temporizador);
  temporizador = setInterval(async () => {
    if (!dialogo.open) { clearInterval(temporizador); return; }
    try { pintarTrabajo((await estadoTrabajoGuion()).trabajo); } catch { /* se reintenta */ }
  }, 3000);
}

async function llenarCanales() {
  const selector = dialogo.querySelector('[name="canal"]');
  try {
    const c = await obtenerCanales();
    selector.replaceChildren(el('option', { value: '', text: 'Elige el canal' }), ...c.canales.map((x) => el('option', { value: x.id, text: x.nombre })));
  } catch { /* queda el selector vacio: el servidor rechaza una ficha sin canal */ }
}

function crearDialogo() {
  const campo = (etiqueta, control) => el('label', { class: 'campo' }, etiqueta, control);
  const formulario = el('form', { class: 'form-ficha', autocomplete: 'off', onsubmit: (e) => { e.preventDefault(); encolar(formulario); } },
    campo('Titulo', el('input', { name: 'titulo', required: true, maxlength: '160' })),
    el('div', { class: 'fila-campos' },
      campo('Canal', el('select', { name: 'canal', required: true }, el('option', { value: '', text: 'Elige el canal' }))),
      campo('Mercado', el('select', { name: 'mercado' }, el('option', { value: 'en-US', text: 'en-US (principal)' }), el('option', { value: 'es-US', text: 'es-US' }))),
      campo('Partes', el('input', { name: 'partes', type: 'number', min: '1', max: '12', placeholder: '1' }))),
    campo('Hechos (uno por linea: tipo: valor)', el('textarea', { name: 'hechos', rows: '5', required: true, placeholder: 'persona: Marco Silva\nlugar: Lisbon, Portugal\nfecha: March 3, 1998\ncifra: 12 goals' })),
    el('div', { class: 'fila-campos' },
      campo('Fuente (opcional)', el('input', { name: 'fuente', maxlength: '300' })),
      campo('Proyecto (serie)', el('input', { name: 'proyecto', placeholder: 'marco-silva' })),
      campo('Foto (medios/fotos)', el('input', { name: 'foto', placeholder: 'marco.jpg' }))),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'continuar' }), ' Continuar la serie (siguiente Parte N del proyecto)'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'esus' }), ' Crear tambien la version es-US'),
    campo('Titulo en espanol (solo es-US)', el('input', { name: 'tituloes', maxlength: '160' })),
    el('button', { class: 'btn btn-primario', type: 'submit', text: 'Agregar a la cola' }));
  const btnProcesar = el('button', { class: 'btn', type: 'button', 'data-zona': 'btn-procesar', text: 'Escribir guion (siguiente pendiente)', onclick: () => accion(procesarGuion, 'Escribiendo el guion con Ollama…') });
  const btnProducir = el('button', { class: 'btn btn-primario', type: 'button', 'data-zona': 'btn-producir', text: 'Producir video (elegidos)', onclick: () => accion(() => producirGuiones([...seleccion]), 'Produccion iniciada.') });
  const d = el('dialog', { id: 'dlg-guiones', class: 'dlg-guiones' },
    el('h2', { text: 'Guiones y produccion' }),
    el('div', { class: 'estado-entorno', 'data-zona': 'entorno' }),
    el('p', { class: 'estado', 'data-zona': 'estado', hidden: true }),
    el('p', { class: 'estado', 'data-zona': 'trabajo', text: 'Sin trabajos en curso.' }),
    formulario,
    el('h3', { text: 'Pendientes' }), el('ul', { class: 'guion-lista', 'data-zona': 'pendientes' }), btnProcesar,
    el('h3', { text: 'Procesados (elige 1 o 2: uno por mercado)' }), el('ul', { class: 'guion-lista', 'data-zona': 'procesados' }), btnProducir,
    el('h3', { text: 'Fallidos' }), el('ul', { class: 'guion-lista', 'data-zona': 'fallidos' }),
    el('div', { class: 'toolbar' },
      el('button', { class: 'btn', type: 'button', text: 'Actualizar', onclick: () => refrescar(true) }),
      el('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() })));
  d.dataset.ocupado = '0';
  d.dataset.pendientes = '0';
  d.addEventListener('close', () => clearInterval(temporizador));
  document.body.appendChild(d);
  return d;
}

export async function abrirGuiones() {
  if (!dialogo) { dialogo = crearDialogo(); llenarCanales(); }
  if (!dialogo.open) dialogo.showModal();
  aviso('');
  await refrescar(true);
  iniciarSondeo();
}

const boton = document.getElementById('btn-guiones');
if (boton) boton.addEventListener('click', () => { abrirGuiones().catch((e) => toast('No se pudo abrir Guiones: ' + e.message, 'error')); });

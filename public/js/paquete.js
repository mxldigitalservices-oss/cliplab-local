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
        const { nombre } = await descargarVideo(vista.clipId, vista.mercado);
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

import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config/index.js';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { CANALES, DESTINOS, IDS_CANALES, normalizarCanal, normalizarDestinos } from '../canales.js';
import { MERCADOS, normalizarMercado, normalizarMercados } from '../mercados.js';
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
export function nombreDeDescarga(clip, mercado = null) {
  const titulo = String(clip.titulo ?? '');
  const base = /^(https?:\/\/|www\.)/i.test(titulo.trim()) ? '' : titulo;
  const slug = base.toLowerCase().replace(/ñ/g, 'n').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const sufijo = mercado && clip.archivos && Object.hasOwn(clip.archivos, mercado) ? '-' + String(mercado).toLowerCase() : '';
  return (slug || path.basename(String(clip.id ?? 'clip')).replace(/[^A-Za-z0-9_-]/g, '') || 'clip') + sufijo + '.mp4';
}

/** Nombre de archivo del video dentro de clipsDir, o null si la URL del clip no es un /clips/<nombre>.mp4 valido. */
export function archivoDeClip(clip, mercado = null) {
  // Clips de stories: un archivo por mercado en clip.archivos[mercado]; sin mercado (o sin ese archivo) vale clip.url (mercado principal).
  const propio = mercado && clip.archivos && typeof clip.archivos === 'object' && Object.hasOwn(clip.archivos, mercado) ? clip.archivos[mercado] : null;
  const url = String(propio ?? clip.url ?? '');
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
    const mercadoPedido = listaDeConsulta(req.query.mercado);
    const mercado = mercadoPedido === undefined ? null : normalizarMercado(mercadoPedido);
    const nombre = archivoDeClip(clip, mercado);
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
    res.download(nombre, nombreDeDescarga(clip, mercado), { root: raiz, dotfiles: 'deny', cacheControl: false, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    responderError(error, res, next);
  }
});

export default router;

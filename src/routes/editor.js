import { Router } from 'express';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { config } from '../config/index.js';
import { gestor } from '../trabajos-guion.js';
import { exclusion } from '../engine/exclusion.js';
import { FORMATOS, IDS_FORMATOS } from '../formatos.js';
import { AREA_MAX, FUERZA, MAX_REGIONES, TAM_MIN, ZONA_CENTRAL } from '../difuminados.js';
import { RANGO_MAX_SEGUNDOS, RANGO_MIN_SEGUNDOS } from '../rango.js';
import { listarRecursos, limitesEditor, planDeEditor, vistaPublica } from '../editor-capas.js';
import { previsualizarEditor, producirEditor, registrarClipEditor } from '../engine/editor-render.js';
import { avisoDeCapacidad, contarVideos, listarFuentes } from '../franja-produccion.js';

// Mini Editor (Parte 7A): regiones de difuminado + capas PNG + audio opcional sobre un tramo de un video, en vertical u horizontal.
// Cada ruta lleva su propia llave maestra (requireMasterKey) y funciona igual con CLIPLAB_MODE=local: no importa nada del publicador.
// Lo pesado (render) corre en segundo plano con el MISMO gestor que guiones y franja (un trabajo a la vez) y dentro del candado 'ffmpeg':
// POST /editor/renderizar responde 202 y el panel consulta GET /guiones/estado. La vista previa es un solo fotograma y, si hay un trabajo
// pesado en curso, responde 409 en vez de dejar la peticion colgada. POST /editor/cancelar detiene el render del editor.
const router = Router();

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) { res.status(error.status).json({ ok: false, error: error.message }); return; }
  next(error);   // ErrorEditor / ErrorDifuminado / ErrorRango / ErrorFormato traen status 400
}

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const limites = () => ({
  ...limitesEditor(),
  maxRegiones: MAX_REGIONES, areaMax: AREA_MAX, tamMin: TAM_MIN, fuerza: { ...FUERZA }, zonaCentral: { ...ZONA_CENTRAL },
  rangoMaxSegundos: RANGO_MAX_SEGUNDOS, rangoMinSegundos: RANGO_MIN_SEGUNDOS,
});

router.get('/editor/config', requireMasterKey, async (req, res, next) => {
  try {
    const [fuentes, recursos, videos] = await Promise.all([listarFuentes({ limite: 100 }), listarRecursos(), contarVideos()]);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      formatos: IDS_FORMATOS.map((id) => ({ id, nombre: FORMATOS[id].nombre, relacion: FORMATOS[id].relacion, ancho: FORMATOS[id].ancho, alto: FORMATOS[id].alto })),
      limites: limites(),
      recursos: { fuentes, pngs: recursos.pngs, audios: recursos.audios },
      almacenamiento: { maxClipsStored: config.maxClipsStored, videos },
      trabajo: gestor.estado(),
    });
  } catch (error) { next(error); }
});

// Valida y normaliza el documento SIN renderizar: devuelve la estructura editable y los pixeles de cada rectangulo / capa para el lienzo.
router.post('/editor/validar', requireMasterKey, async (req, res, next) => {
  try {
    const plan = await planDeEditor(objeto(req.body));
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ...vistaPublica(plan) });
  } catch (error) { responderError(error, res, next); }
});

// Un fotograma (JPEG reducido, base64) con difuminados y capas ya aplicados, en el segundo `t` del tramo.
router.post('/editor/previsualizar', requireMasterKey, async (req, res, next) => {
  try {
    const cuerpo = objeto(req.body);
    const plan = await planDeEditor(cuerpo);
    const ocupado = exclusion.estado().ocupado;
    if (ocupado) throw new ErrorHttp(409, 'Hay un trabajo pesado en curso (' + ocupado + '); la vista previa espera a que termine.');
    const control = new AbortController();
    res.on('close', () => { if (!res.writableEnded) control.abort(); });   // el panel se cerro: se suelta el candado
    const vista = await previsualizarEditor({ plan, t: cuerpo.t ?? 0, signal: control.signal });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ...vista, avisos: plan.avisos });
  } catch (error) { responderError(error, res, next); }
});

router.post('/editor/renderizar', requireMasterKey, async (req, res, next) => {
  try {
    const cuerpo = objeto(req.body);
    const plan = await planDeEditor(cuerpo);   // valida estructura y archivos antes de arrancar (400 claros)
    const id = 'e' + Date.now().toString(36);
    const avisos = [...plan.avisos];
    const aviso = avisoDeCapacidad({ actuales: await contarVideos(), nuevos: 1 });
    if (aviso) avisos.push(aviso);

    const arrancado = gestor.iniciar('editor', async ({ senal, avance }) => {
      const resultado = await producirEditor({ id, plan, signal: senal, avance });
      const clips = registrarClipEditor({ store, resultado });
      return { id, formato: resultado.formato, clips, avisos: [...avisos, ...resultado.avisos.filter((a) => !avisos.includes(a))], videos: [{ url: resultado.url }] };
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine o cancelalo.');
    res.status(202).json({ ok: true, id, avisos, trabajo: gestor.estado() });
  } catch (error) { responderError(error, res, next); }
});

// Cancela el render del editor en curso: detiene FFmpeg, libera el candado, borra temporales y deja el gestor libre.
router.post('/editor/cancelar', requireMasterKey, async (req, res, next) => {
  try {
    const actual = gestor.estado();
    if (actual.estado !== 'corriendo') throw new ErrorHttp(404, 'No hay ningun render del editor en curso.');
    if (actual.tipo !== 'editor') throw new ErrorHttp(409, 'El trabajo en curso (' + actual.tipo + ') no es del editor: cancelalo desde su propio panel.');
    const r = await gestor.cancelar({ esperarMs: 8000 });
    res.set('Cache-Control', 'no-store');
    res.status(r.estado.estado === 'corriendo' ? 202 : 200).json({ ok: true, cancelado: r.cancelado, trabajo: r.estado });
  } catch (error) { responderError(error, res, next); }
});

export default router;

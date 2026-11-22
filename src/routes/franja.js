import { Router } from 'express';
import { requireMasterKey } from '../middleware/auth.js';
import { store } from '../storage/store.js';
import { config } from '../config/index.js';
import { gestor, TIPOS_CANCELABLES } from '../trabajos-guion.js';
import { CANALES, normalizarCanal } from '../canales.js';
import { FORMATOS, IDS_FORMATOS, normalizarFormato } from '../formatos.js';
import { AREA_MAX, FUERZA, MAX_REGIONES, TAM_MIN, ZONA_CENTRAL, resolverDifuminados, geometriaDeDifuminados } from '../difuminados.js';
import { RANGO_MAX_SEGUNDOS, RANGO_MIN_SEGUNDOS } from '../rango.js';
import { CANALES_CON_FRANJA, TITULO_MAX, TITULO_MIN, ErrorFranja, difuminadosSugeridos, planDeProduccionFranja } from '../franja-plan.js';
import { avisoDeCapacidad, contarVideos, listarFuentes, producirFranja, registrarClipsFranja } from '../franja-produccion.js';

// Produccion de sports / news desde un video fuente (difuminados ajustables + titulo con gancho) y cancelacion de la produccion en curso.
// Cada ruta lleva su propia llave maestra (requireMasterKey) y funciona igual con CLIPLAB_MODE=local: no importa nada del publicador.
// Lo pesado corre en segundo plano (un trabajo a la vez, el mismo gestor que los guiones): POST /franja/producir responde 202 y el panel
// consulta GET /guiones/estado. La produccion en curso se detiene con POST /produccion/cancelar.
const router = Router();

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
function responderError(error, res, next) {
  if (error instanceof ErrorHttp) { res.status(error.status).json({ ok: false, error: error.message }); return; }
  next(error);
}

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const limites = () => ({
  maxRegiones: MAX_REGIONES, areaMax: AREA_MAX, tamMin: TAM_MIN, fuerza: { ...FUERZA }, zonaCentral: { ...ZONA_CENTRAL },
  rangoMaxSegundos: RANGO_MAX_SEGUNDOS, rangoMinSegundos: RANGO_MIN_SEGUNDOS, tituloMin: TITULO_MIN, tituloMax: TITULO_MAX,
});

router.get('/franja/config', requireMasterKey, async (req, res, next) => {
  try {
    const salida = {
      ok: true,
      canales: CANALES_CON_FRANJA.map((id) => ({ id, nombre: CANALES[id].nombre, modo: CANALES[id].trabajo.modo, mercados: CANALES[id].mercados, tituloPosicion: CANALES[id].difuminados.titulo.posicion })),
      formatos: IDS_FORMATOS.map((id) => ({ id, nombre: FORMATOS[id].nombre, relacion: FORMATOS[id].relacion, ancho: FORMATOS[id].ancho, alto: FORMATOS[id].alto })),
      limites: limites(),
      almacenamiento: { maxClipsStored: config.maxClipsStored, videos: await contarVideos() },
      trabajo: gestor.estado(),
    };
    if (req.query.canal !== undefined && String(req.query.canal) !== '') {
      const canal = normalizarCanal(req.query.canal);   // ErrorCanal (400): nunca se adivina
      const formato = normalizarFormato(req.query.formato);
      const sugeridos = resolverDifuminados(undefined, difuminadosSugeridos(canal, formato));   // ErrorFranja (400) si el canal no usa difuminados
      salida.canal = canal;
      salida.formato = formato;
      salida.difuminados = { version: sugeridos.version, regiones: sugeridos.regiones, avisos: sugeridos.avisos };
    }
    res.set('Cache-Control', 'no-store');
    res.status(200).json(salida);
  } catch (error) { next(error); }
});

router.get('/franja/fuentes', requireMasterKey, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, fuentes: await listarFuentes({ limite: 100 }) });
  } catch (error) { next(error); }
});

// Normaliza difuminados SIN renderizar: el panel (y el mini editor de la Parte 7) lo usan para validar y previsualizar rectangulos.
router.post('/franja/difuminados/validar', requireMasterKey, (req, res, next) => {
  try {
    const cuerpo = objeto(req.body);
    const canal = normalizarCanal(cuerpo.canal);
    const formato = normalizarFormato(cuerpo.formato);
    const r = resolverDifuminados(cuerpo.difuminados, difuminadosSugeridos(canal, formato));
    const f = FORMATOS[formato];
    res.status(200).json({ ok: true, canal, formato, difuminados: { version: r.version, regiones: r.regiones }, avisos: r.avisos, pixeles: geometriaDeDifuminados(r.regiones, f.ancho, f.alto).map((g) => ({ id: g.id, ...g.px })) });
  } catch (error) { next(error); }
});

router.post('/franja/producir', requireMasterKey, async (req, res, next) => {
  try {
    const cuerpo = objeto(req.body);
    const canal = normalizarCanal(cuerpo.canal);
    const formato = normalizarFormato(cuerpo.formato);
    const entradas = Array.isArray(cuerpo.entradas) ? cuerpo.entradas : [];
    if (entradas.length < 1 || entradas.length > 2) throw new ErrorHttp(400, 'Indica una o dos entradas (una por mercado).');
    const id = 'f' + Date.now().toString(36);
    const plan = planDeProduccionFranja({ id, canal, formato, entradas });   // valida todo antes de arrancar (ErrorFranja / ErrorDifuminado / ErrorRango = 400)
    const avisos = [...plan.avisos];
    const aviso = avisoDeCapacidad({ actuales: await contarVideos(), nuevos: plan.mercados.length });
    if (aviso) avisos.push(aviso);

    const arrancado = gestor.iniciar('franja', async ({ senal, avance }) => {
      const resultado = await producirFranja({ id, canal, formato, entradas, signal: senal, avance });
      const clips = registrarClipsFranja({ store, resultado });
      return { id, canal, formato: resultado.formato, clips, avisos: [...avisos, ...resultado.avisos.filter((a) => !avisos.includes(a))], videos: resultado.mercados.map((m) => ({ mercado: m.mercado, url: m.url })) };
    });
    if (!arrancado) throw new ErrorHttp(409, 'Ya hay un trabajo en curso; espera a que termine o cancelalo.');
    res.status(202).json({ ok: true, id, avisos, trabajo: gestor.estado() });
  } catch (error) {
    if (error instanceof ErrorFranja) { res.status(400).json({ ok: false, error: error.message }); return; }
    responderError(error, res, next);
  }
});

// Cancela la produccion en curso (stories o sports/news). Detiene FFmpeg/Piper, libera el candado, borra temporales y deja el gestor libre.
router.post('/produccion/cancelar', requireMasterKey, async (req, res, next) => {
  try {
    const actual = gestor.estado();
    if (actual.estado !== 'corriendo') throw new ErrorHttp(404, 'No hay ninguna produccion en curso.');
    if (!TIPOS_CANCELABLES.includes(actual.tipo)) throw new ErrorHttp(409, 'El trabajo en curso (' + actual.tipo + ') lo hace Ollama y no se cancela desde aqui: se libera solo al terminar.');
    const r = await gestor.cancelar({ esperarMs: 8000 });
    res.set('Cache-Control', 'no-store');
    res.status(r.estado.estado === 'corriendo' ? 202 : 200).json({ ok: true, cancelado: r.cancelado, trabajo: r.estado });
  } catch (error) { responderError(error, res, next); }
});

export default router;

// ---------------------------------------------------------------------------
// Cola de guiones en disco (portada de ContentBotMXL-2: data/guiones/pendientes -> procesados), en <dataDir>/guiones:
//   pendientes/<id>.json   { id, creado, ficha }
//   procesados/<id>.json   { id, ficha, guion, avisos, intentos, procesado }
//   fallidos/<id>.json     { id, ficha, error | problemas, ... }   (no se pierde nada: un guion que no pasa la validacion queda aqui)
// El id lo genera el sistema (nunca viene del cliente) y se valida antes de armar cualquier ruta. Escritura atomica.
// Se procesa de uno en uno; cada llamada a Ollama pasa por el candado de exclusion.js (nunca a la vez que FFmpeg).
// Todas las funciones aceptan { base } para probarlas en un directorio temporal.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { generarGuion } from './guionista.js';
import { contextoDeMemoria, leerMemoria, registrarGuion } from './memoria-proyecto.js';
import { normalizarFicha } from './validador-ficha.js';

const RE_ID = /^[0-9]{13}-[0-9a-f]{8}$/;
export const carpetaGuiones = (base) => base ?? path.join(config.dataDir, 'guiones');
const sub = (base, nombre) => path.join(carpetaGuiones(base), nombre);

async function escribirJson(archivo, datos) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = archivo + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(datos, null, 2));
  await fs.rename(tmp, archivo);
}

/** Valida la ficha y la deja en pendientes. Devuelve { id }. Lanza ErrorFicha (400) si la ficha no vale. */
export async function encolarGuion(fichaEntrada, { base } = {}) {
  const ficha = normalizarFicha(fichaEntrada);
  const id = String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex');
  await escribirJson(path.join(sub(base, 'pendientes'), id + '.json'), { id, creado: new Date().toISOString(), ficha });
  return { id };
}

async function idsDe(carpeta) {
  try {
    return (await fs.readdir(carpeta)).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter((id) => RE_ID.test(id)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export const listarPendientes = ({ base } = {}) => idsDe(sub(base, 'pendientes'));
export const listarProcesados = ({ base } = {}) => idsDe(sub(base, 'procesados'));
export const listarFallidos = ({ base } = {}) => idsDe(sub(base, 'fallidos'));

export async function leerGuion(estado, id, { base } = {}) {
  if (!['pendientes', 'procesados', 'fallidos'].includes(estado)) throw new Error('Estado no valido.');
  if (!RE_ID.test(String(id))) throw new Error('Id de guion no valido.');
  return JSON.parse(await fs.readFile(path.join(sub(base, estado), id + '.json'), 'utf8'));
}

let procesando = false;

/**
 * Toma el pendiente mas antiguo, genera el guion y lo mueve a procesados (o a fallidos). Devuelve null si no hay pendientes.
 * opciones: { base, baseMemoria (carpeta de la memoria por proyecto), generar (por defecto generarGuion), chatImpl, maxReintentos }
 */
export async function procesarSiguiente({ base, baseMemoria, generar = generarGuion, chatImpl, maxReintentos } = {}) {
  if (procesando) throw new Error('Ya se esta procesando un guion.');
  procesando = true;
  try {
    const [id] = await listarPendientes({ base });
    if (!id) return null;
    const origen = path.join(sub(base, 'pendientes'), id + '.json');
    let item;
    try {
      item = JSON.parse(await fs.readFile(origen, 'utf8'));
    } catch (error) {
      await escribirJson(path.join(sub(base, 'fallidos'), id + '.json'), { id, error: 'Archivo pendiente ilegible: ' + error.message, procesado: new Date().toISOString() });
      await fs.rm(origen, { force: true });
      return { id, ok: false, motivo: 'ilegible' };
    }

    const ficha = item.ficha;
    try {
      let desdeParte = 1;
      let memoria = '';
      if (ficha.proyecto) {
        const mem = await leerMemoria(ficha.proyecto, { base: baseMemoria });
        memoria = contextoDeMemoria(mem);
        if (ficha.continuar) desdeParte = mem.ultimaParte + 1;
      }
      const r = await generar(ficha, { desdeParte, memoria, chatImpl, maxReintentos });
      if (r.ok) {
        await escribirJson(path.join(sub(base, 'procesados'), id + '.json'), { id, ficha, guion: r.guion, avisos: r.avisos, intentos: r.intentos, procesado: new Date().toISOString() });
        if (ficha.proyecto) await registrarGuion(ficha.proyecto, { id, titulo: ficha.titulo, canal: ficha.canal, mercado: ficha.mercado, guion: r.guion }, { base: baseMemoria });
        await fs.rm(origen, { force: true });
        return { id, ok: true, intentos: r.intentos, avisos: r.avisos };
      }
      await escribirJson(path.join(sub(base, 'fallidos'), id + '.json'), { id, ficha, problemas: r.problemas, ultimoGuion: r.guion, intentos: r.intentos, procesado: new Date().toISOString() });
      await fs.rm(origen, { force: true });
      return { id, ok: false, motivo: 'validacion', problemas: r.problemas, intentos: r.intentos };
    } catch (error) {
      // Ollama caido / timeout: el guion NO se pierde ni se marca como fallido; sigue en pendientes para reintentarlo luego.
      return { id, ok: false, motivo: 'ollama', error: error.message, tipo: error.tipo || null };
    }
  } finally {
    procesando = false;
  }
}

/** Procesa hasta `max` pendientes seguidos. Se detiene si Ollama falla (motivo 'ollama'). Devuelve la lista de resultados. */
export async function procesarPendientes({ max = 10, ...opciones } = {}) {
  const resultados = [];
  for (let i = 0; i < max; i++) {
    const r = await procesarSiguiente(opciones);
    if (!r) break;
    resultados.push(r);
    if (r.motivo === 'ollama') break;
  }
  return resultados;
}

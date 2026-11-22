// ---------------------------------------------------------------------------
// Memoria minima por proyecto (portada de la idea de ollama-core-engine/memory.py): un JSON por proyecto en
// <dataDir>/memoria/<proyecto>.json con lo ya escrito, para que una serie siga con la "Parte N" que toca y no repita temas.
// El proyecto solo admite [a-z0-9_-] (nunca arma rutas con texto libre). Escritura atomica (tmp + rename).
// Todas las funciones aceptan { base } (carpeta) para poder probarlas en un directorio temporal.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';

export const MAX_ENTRADAS = 20;
const RE_PROYECTO = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const carpetaMemoria = (base) => base ?? path.join(config.dataDir, 'memoria');

function archivoDe(proyecto, base) {
  const id = String(proyecto ?? '').trim().toLowerCase();
  if (!RE_PROYECTO.test(id)) throw new Error('Proyecto no valido (usa letras minusculas, numeros, guion y guion bajo).');
  return path.join(carpetaMemoria(base), id + '.json');
}

export async function leerMemoria(proyecto, { base } = {}) {
  const archivo = archivoDe(proyecto, base);
  try {
    const datos = JSON.parse(await fs.readFile(archivo, 'utf8'));
    return { proyecto: String(proyecto).trim().toLowerCase(), ultimaParte: Number(datos.ultimaParte) || 0, entradas: Array.isArray(datos.entradas) ? datos.entradas : [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { proyecto: String(proyecto).trim().toLowerCase(), ultimaParte: 0, entradas: [] };
    throw error;
  }
}

/** Anota un guion terminado. `guion` es la salida validada { partes:[{ n, narracion }] }. */
export async function registrarGuion(proyecto, { id, titulo, canal, mercado, guion }, { base } = {}) {
  const archivo = archivoDe(proyecto, base);
  const previa = await leerMemoria(proyecto, { base });
  const partes = Array.isArray(guion && guion.partes) ? guion.partes : [];
  const ultima = partes.reduce((m, p) => (Number.isInteger(p && p.n) && p.n > m ? p.n : m), 0);
  const final = partes.length ? String(partes[partes.length - 1].narracion || '') : '';
  const entrada = {
    id: String(id ?? ''),
    titulo: String(titulo ?? '').slice(0, 160),
    canal, mercado,
    partes: partes.length,
    ultimaParte: ultima,
    cierre: final.slice(0, 280),
    fecha: new Date().toISOString(),
  };
  const nueva = {
    proyecto: previa.proyecto,
    ultimaParte: Math.max(previa.ultimaParte, ultima),
    entradas: [...previa.entradas, entrada].slice(-MAX_ENTRADAS),
  };
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = archivo + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(nueva, null, 2));
  await fs.rename(tmp, archivo);
  return nueva;
}

/** Texto corto para el prompt: lo ya escrito (como DATO, no como instruccion). Cadena vacia si no hay memoria. */
export function contextoDeMemoria(memoria) {
  if (!memoria || !memoria.entradas || memoria.entradas.length === 0) return '';
  const ult = memoria.entradas.slice(-3);
  return ult.map((e) => '- "' + e.titulo + '" (partes hasta la ' + e.ultimaParte + '). Termino asi: ' + e.cierre).join('\n');
}

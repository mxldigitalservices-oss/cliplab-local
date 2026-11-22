// ---------------------------------------------------------------------------
// Banco de medios en carpeta (patron assets/efectos_sonido y assets/musica de ContentBotMXL-2, portado a Node):
//   <bancoDir>/efectos/<categoria>/*.wav|mp3|ogg|m4a      efectos de sonido (whoosh, impacto, ...)
//   <bancoDir>/musica/<categoria>/*.wav|mp3|ogg|m4a       musica de fondo (suspenso, calida, ...)
//   <bancoDir>/medios/<categoria>/*.mp4|mov|webm|jpg|png  fondos de escena (fondos, ciudad, estadio, ...) y medios/fotos/ para la ficha
// La categoria sale del texto del guion (nunca se usa tal cual como ruta): minusculas [a-z0-9_-], max. 32. Se elige un archivo al azar
// (rng inyectable, para pruebas y para que un mismo guion repita su seleccion). Solo archivos normales dentro del banco (sin
// ocultos ni enlaces que escapen). Si no hay archivos, devuelve null y el render usa un fondo generado: el banco es opcional.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';

export const TIPOS = Object.freeze({
  efectos: /\.(wav|mp3|ogg|m4a)$/i,
  musica: /\.(wav|mp3|ogg|m4a)$/i,
  medios: /\.(mp4|mov|webm|mkv|jpe?g|png|webp)$/i,
});
export const RE_CATEGORIA = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const RE_IMAGEN = /\.(jpe?g|png|webp)$/i;
const RE_NOMBRE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]*$/;

/** Generador pseudoaleatorio reproducible (mulberry32) a partir de un texto: mismo guion -> misma seleccion. */
export function crearRng(semilla = '') {
  let h = 1779033703 ^ String(semilla).length;
  for (const c of String(semilla)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validar(tipo, categoria) {
  if (!Object.hasOwn(TIPOS, tipo)) throw new Error('Tipo de banco no valido: ' + String(tipo));
  if (!RE_CATEGORIA.test(String(categoria))) throw new Error('Categoria no valida: ' + String(categoria).slice(0, 40));
}

/** Nombres de archivo (ordenados) de una categoria. [] si la carpeta no existe. */
export async function listarCategoria(tipo, categoria, { dir = config.bancoDir } = {}) {
  validar(tipo, categoria);
  const carpeta = path.join(dir, tipo, categoria);
  let entradas;
  try { entradas = await fs.readdir(carpeta, { withFileTypes: true }); } catch { return []; }
  const raiz = await fs.realpath(dir).catch(() => path.resolve(dir));
  const salida = [];
  for (const e of entradas) {
    if (!TIPOS[tipo].test(e.name) || !RE_NOMBRE.test(e.name)) continue;
    const ruta = path.join(carpeta, e.name);
    try {
      const real = await fs.realpath(ruta);
      if (!real.startsWith(raiz + path.sep) || !(await fs.stat(real)).isFile()) continue;
      salida.push(e.name);
    } catch { /* enlace roto */ }
  }
  return salida.sort();
}

/** Ruta absoluta de un archivo al azar de la categoria (sin repetir los de `excluir` si hay otros), o null. */
export async function elegir(tipo, categoria, { dir = config.bancoDir, rng = Math.random, excluir = [] } = {}) {
  const todos = await listarCategoria(tipo, categoria, { dir });
  if (!todos.length) return null;
  const libres = todos.filter((n) => !excluir.includes(n));
  const lista = libres.length ? libres : todos;
  return path.join(dir, tipo, categoria, lista[Math.min(lista.length - 1, Math.floor(rng() * lista.length))]);
}

/** Foto de la ficha: nombre de archivo dentro de medios/fotos (solo imagenes, sin rutas). null si no existe. */
export async function fotoDeFicha(nombre, { dir = config.bancoDir } = {}) {
  const n = String(nombre ?? '').trim();
  if (!n || !RE_NOMBRE.test(n) || !RE_IMAGEN.test(n)) return null;
  return (await listarCategoria('medios', 'fotos', { dir })).includes(n) ? path.join(dir, 'medios', 'fotos', n) : null;
}

/** { efectos: {categoria: n}, musica: {...}, medios: {...} } con lo que hay en disco. */
export async function resumen({ dir = config.bancoDir } = {}) {
  const salida = {};
  for (const tipo of Object.keys(TIPOS)) {
    salida[tipo] = {};
    let cats = [];
    try { cats = await fs.readdir(path.join(dir, tipo), { withFileTypes: true }); } catch { /* sin carpeta */ }
    for (const c of cats) {
      if (!c.isDirectory() || !RE_CATEGORIA.test(c.name)) continue;
      salida[tipo][c.name] = (await listarCategoria(tipo, c.name, { dir })).length;
    }
  }
  return salida;
}

/** Crea las carpetas base (vacias) para que el usuario solo tenga que copiar archivos. */
export async function asegurarEstructura({ dir = config.bancoDir } = {}) {
  const carpetas = ['efectos/whoosh', 'efectos/impacto', 'musica/suspenso', 'musica/calida', 'medios/fondos', 'medios/fotos'];
  for (const c of carpetas) await fs.mkdir(path.join(dir, c), { recursive: true });
  return carpetas;
}

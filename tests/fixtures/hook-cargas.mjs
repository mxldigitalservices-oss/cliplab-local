// Hook de modulos (solo pruebas): anota en un archivo cada modulo que Node carga, para comprobar que el modo local
// NO evalua programador, publicador ni Chromium.
import { appendFileSync } from 'node:fs';

let archivo = '';

export async function initialize(datos) {
  archivo = datos && datos.archivo ? String(datos.archivo) : '';
}

export async function load(url, contexto, siguiente) {
  if (archivo) appendFileSync(archivo, url + '\n');
  return siguiente(url, contexto);
}

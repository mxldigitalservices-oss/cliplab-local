// ---------------------------------------------------------------------------
// Plan de renders: cuantos archivos hay que renderizar de verdad para un canal, sus mercados y sus destinos.
// Modulo puro (no renderiza nada): dice QUE hay que producir y que destinos comparten cada archivo.
//
//   - Destinos con la misma clave de render comparten UN archivo (Instagram Reels y YouTube Shorts reutilizan el
//     9:16 de Facebook Reels: nunca hay doble render del mismo mercado).
//   - youtube_long no se renderiza: concatena las partes ya renderizadas (cuesta casi nada comparado con un render).
//   - Mercados: si el clip lleva voz, subtitulos, titulo en pantalla o ficha (capasDeIdioma = true), cada mercado
//     necesita su propio render porque esas capas van quemadas. Si no lleva ninguna (capasDeIdioma = false), un solo
//     render sirve a todos los mercados.
// ---------------------------------------------------------------------------
import { DESTINOS, normalizarCanal, normalizarDestinos, perfilDeCanal } from './canales.js';
import { normalizarMercados } from './mercados.js';

export function planDeRenders({ canal, mercados, destinos, capasDeIdioma = true } = {}) {
  const id = normalizarCanal(canal);
  const perfil = perfilDeCanal(id);
  const mercadosElegidos = normalizarMercados(mercados ?? perfil.mercados);
  const destinosElegidos = normalizarDestinos(destinos ?? perfil.destinos, id);

  // Un grupo de mercados comparte archivo: todos juntos si no hay capas de idioma, uno por mercado si las hay.
  const grupos = capasDeIdioma === false ? [mercadosElegidos] : mercadosElegidos.map((m) => [m]);

  const porRender = new Map();   // clave de render -> ids de destinos que la usan
  for (const d of destinosElegidos) {
    const { render, tipo } = DESTINOS[d];
    if (tipo !== 'largo') porRender.set(render, [...(porRender.get(render) ?? []), d]);
  }
  const concatenaciones = destinosElegidos.filter((d) => DESTINOS[d].tipo === 'largo');
  for (const d of concatenaciones) {
    const base = DESTINOS[d].dependeDe;
    if (!porRender.has(base)) porRender.set(base, []);   // el largo necesita las partes renderizadas aunque nadie mas las publique
  }

  const renders = [];
  const concatenados = [];
  for (const grupo of grupos) {
    for (const [clave, usuarios] of porRender) renders.push({ clave, tipo: 'render', mercados: [...grupo], destinos: [...usuarios] });
    for (const d of concatenaciones) {
      concatenados.push({ clave: DESTINOS[d].render, tipo: 'concatenar', dependeDe: DESTINOS[d].dependeDe, mercados: [...grupo], destinos: [d] });
    }
  }

  const sinReutilizar = destinosElegidos.length * mercadosElegidos.length;   // un render por destino y por mercado
  return {
    canal: id,
    capasDeIdioma: capasDeIdioma !== false,
    mercados: mercadosElegidos,
    destinos: destinosElegidos,
    renders,
    concatenados,
    resumen: {
      rendersNecesarios: renders.length,
      concatenaciones: concatenados.length,
      rendersSinReutilizar: sinReutilizar,
      rendersEvitados: sinReutilizar - renders.length,
    },
  };
}

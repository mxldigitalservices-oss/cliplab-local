// ---------------------------------------------------------------------------
// Produccion del canal STORIES de punta a punta: guiones validados (uno por mercado) -> voz Piper -> render por parte -> video largo
// por mercado (concatenacion en orden, 9:16 heredado) -> clips en el store (para descargar y publicar a mano).
// Todo el trabajo pesado va dentro de UN candado ('ffmpeg' de exclusion.js): nunca a la vez que Ollama. Las dependencias
// (sintetizar, renderizar, concatenar, banco) son inyectables para probar sin Piper ni FFmpeg.
// Salida: <clipsDir>/stories-<id>-<mercado>-p<N>.mp4 y ...-largo.mp4. Un clip del store por parte (archivos por mercado) y uno por el largo.
// ---------------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config/index.js';
import { exclusion } from './engine/exclusion.js';
import { concatenarPartes, elegirFuente, renderizarParte } from './engine/stories-render.js';
import { crearRng, elegir, fotoDeFicha } from './banco-medios.js';
import { MERCADO_PRINCIPAL } from './mercados.js';
import { planDeParte, planDeProduccion } from './stories-plan.js';
import { sintetizar } from './voz.js';

const URL_DE = (nombre) => '/clips/' + nombre;

async function moverFinal(origen, destino) {
  try { await fs.rename(origen, destino); } catch { await fs.copyFile(origen, destino); await fs.rm(origen, { force: true }); }
}

/**
 * entradas: [{ mercado, ficha, guion }]. opciones: { id, signal, avance(etapa, %), dirSalida, dirTemporal, bancoDir, musicaCategoria,
 *   fondoCategoria, deps:{ sintetizar, renderizar, concatenar, elegir, fotoDeFicha, fuente }, render:{ ancho, alto, hilos, preset, crf }, voz:{...} }
 * Devuelve { id, avisos, mercados:[{ mercado, titulo, partes:[{ n, archivo, url, duracion }], largo:{ archivo, url, duracion } }] }.
 */
export async function producirStories({ id, entradas, signal, avance = () => {}, dirSalida = config.clipsDir, dirTemporal, bancoDir = config.bancoDir, musicaCategoria = 'calida', fondoCategoria = 'fondos', deps = {}, render = {}, voz = {} } = {}) {
  const d = { sintetizar, renderizar: renderizarParte, concatenar: concatenarPartes, elegir, fotoDeFicha, ...deps };
  const plan = planDeProduccion({ id, canal: 'stories', entradas });
  const trabajo = dirTemporal ?? path.join(config.tmpDir, 'stories', plan.id);
  const fuente = deps.fuente !== undefined ? deps.fuente : await elegirFuente();
  await fs.mkdir(dirSalida, { recursive: true });
  await fs.rm(trabajo, { recursive: true, force: true });
  await fs.mkdir(trabajo, { recursive: true });
  const totalPasos = plan.resumen.renders + plan.resumen.concatenaciones;
  let hechos = 0;
  const paso = (texto) => avance(texto, (hechos / totalPasos) * 100);
  const avisos = [...plan.avisos];

  try {
    return await exclusion.ejecutar('ffmpeg', async () => {
      const resultados = [];
      for (const m of plan.mercados) {
        const salidas = [];
        for (const p of m.partes) {
          if (signal && signal.aborted) throw new Error('Produccion cancelada.');
          paso(m.mercado + ' · parte ' + p.n + ': voz');
          const wav = path.join(trabajo, `${m.mercado}-p${p.n}.wav`);
          const v = await d.sintetizar({ texto: p.parte.narracion, mercado: m.mercado, salida: wav, signal, ...voz });
          const pp = planDeParte({ parte: p.parte, ficha: m.ficha, mercado: m.mercado, duracionVoz: v.duracionSeg });
          avisos.push(...pp.avisos);

          paso(m.mercado + ' · parte ' + p.n + ': video');
          const rng = crearRng(plan.id + '|' + m.mercado + '|' + p.n);
          const usados = [];
          const medios = [];
          for (let i = 0; i < pp.escenas.length; i++) {
            const ruta = await d.elegir('medios', fondoCategoria, { dir: bancoDir, rng, excluir: usados });
            if (ruta) usados.push(path.basename(ruta));
            medios.push(ruta);
          }
          const sfx = [];
          for (const e of pp.escenas) {
            if (!e.sonido) continue;
            const ruta = await d.elegir('efectos', e.sonido, { dir: bancoDir, rng });
            if (ruta) sfx.push({ ruta, inicio: e.inicio });
          }
          const musica = await d.elegir('musica', musicaCategoria, { dir: bancoDir, rng });
          const foto = pp.ficha && pp.ficha.foto ? await d.fotoDeFicha(pp.ficha.foto, { dir: bancoDir }) : null;
          if (pp.ficha && pp.ficha.foto && !foto) avisos.push('La foto "' + pp.ficha.foto + '" no esta en medios/fotos del banco: la ficha sale sin foto.');

          const temporal = path.join(trabajo, p.archivo);
          await d.renderizar({ dirTrabajo: path.join(trabajo, `w-${m.mercado}-p${p.n}`), plan: pp, voz: wav, salida: temporal, medios, musica, sfx, foto, fuente, signal, ...render });
          await moverFinal(temporal, path.join(dirSalida, p.archivo));
          await fs.rm(wav, { force: true });
          hechos++;
          salidas.push({ n: p.n, archivo: p.archivo, url: URL_DE(p.archivo), duracion: pp.duracionTotal });
        }
        paso(m.mercado + ': video largo');
        await d.concatenar(salidas.map((s) => path.join(dirSalida, s.archivo)), path.join(trabajo, m.largo.archivo), { dirTrabajo: trabajo, signal });
        await moverFinal(path.join(trabajo, m.largo.archivo), path.join(dirSalida, m.largo.archivo));
        hechos++;
        resultados.push({ mercado: m.mercado, titulo: m.titulo, partes: salidas, largo: { archivo: m.largo.archivo, url: URL_DE(m.largo.archivo), duracion: Math.round(salidas.reduce((s, x) => s + x.duracion, 0) * 1000) / 1000 } });
      }
      avance('Listo', 100);
      return { id: plan.id, avisos, mercados: resultados };
    }, { signal });
  } finally {
    await fs.rm(trabajo, { recursive: true, force: true });
  }
}

/**
 * Crea en el store un clip por parte (con `archivos` por mercado; `url` = mercado principal) y uno por el video largo.
 * `store` se inyecta (encolar/completar). Devuelve los ids de clip creados.
 */
export function registrarClips({ store, resultado, entradas }) {
  const principal = resultado.mercados.find((m) => m.mercado === MERCADO_PRINCIPAL) || resultado.mercados[0];
  const narracionDe = (mercado, n) => { const e = entradas.find((x) => x.mercado === mercado); const p = e && e.guion.partes.find((x) => x.n === n); return p ? String(p.narracion) : ''; };
  const ids = [];
  const crear = (titulo, archivos, duracion, transcripcion, extra) => {
    const clip = store.encolar('stories:' + resultado.id, { origen: 'stories' });
    store.completar(clip.id, { titulo, url: archivos[principal.mercado] ?? Object.values(archivos)[0], archivos, duracion, transcripcion, canal: 'stories', serie: resultado.id, ...extra });
    ids.push(clip.id);
  };
  const etiqueta = principal.mercado.startsWith('es') ? 'Parte' : 'Part';
  for (const p of principal.partes) {
    const archivos = {};
    for (const m of resultado.mercados) { const q = m.partes.find((x) => x.n === p.n); if (q) archivos[m.mercado] = q.url; }
    crear(`${principal.titulo} — ${etiqueta} ${p.n}`, archivos, p.duracion, narracionDe(principal.mercado, p.n), { parte: p.n });
  }
  const largos = {};
  for (const m of resultado.mercados) largos[m.mercado] = m.largo.url;
  crear(`${principal.titulo} — ${principal.mercado.startsWith('es') ? 'Serie completa' : 'Full Series'}`, largos, principal.largo.duracion, '', { parte: null, largo: true });
  return ids;
}
